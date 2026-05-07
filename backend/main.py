import csv
import os
import secrets
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, HTTPException, status, Security, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.security import APIKeyHeader, HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
from dotenv import load_dotenv
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

logger = logging.getLogger(__name__)
logging.basicConfig(filename='tracker-app.log', level=logging.INFO, format="%(levelname)s:%(name)s:%(asctime)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S")
app = FastAPI(docs_url=None, redoc_url=None)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

security_basic=HTTPBasic()
manager = ConnectionManager()
templates = Jinja2Templates(directory="templates")

load_dotenv()
CSV_FILE = "dane.csv"
USER_CSV_FILE = "user_position.csv"

API_KEY_NAME = "x-api-key"
API_KEY_SECRET = os.getenv("API_KEY")

USER = os.getenv("DASH_USER")
PASSWD = os.getenv("DASH_PASSWD")

INFLUXDB_URL=os.getenv("INFLUXDB_URL")
INFLUXDB_TOKEN=os.getenv("INFLUXDB_TOKEN")
INFLUXDB_ORG=os.getenv("INFLUXDB_ORG")
INFLUXDB_BUCKET=os.getenv("INFLUXDB_BUCKET")

client = InfluxDBClient(url=INFLUXDB_URL, token=INFLUXDB_TOKEN, org=INFLUXDB_ORG)
write_api = client.write_api(write_options=SYNCHRONOUS)


api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

async def get_api_key(api_key_header: str = Security(api_key_header)):
    if api_key_header and secrets.compare_digest(api_key_header, API_KEY_SECRET):
        return api_key_header
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="ACCESS DENIED: Wrong or empty API key!"
        )

def get_current_user(credentials: HTTPBasicCredentials = Depends(security_basic)):
    correct_username = secrets.compare_digest(credentials.username, USER)
    correct_password = secrets.compare_digest(credentials.password, PASSWD)
    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect login or password",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username

class Position(BaseModel):
    longitude: float
    latitude: float

class LoginRequest(BaseModel):
    username: str
    password: str


from influxdb_client.client.query_api import QueryApi


def get_last_location():
    query_api = client.query_api()
    flux_query = f'''
        from(bucket: "{INFLUXDB_BUCKET}")
            |> range(start: -7d)
            |> filter(fn: (r) => r["_measurement"] == "device_positions")
            |> last()
            |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
    '''

    try:
        result = query_api.query(org=INFLUXDB_ORG, query=flux_query)

        for table in result:
            for record in table.records:
                return {
                    "time": record.get_time().strftime("%Y-%m-%d %H:%M:%S"),
                    "lat": record.values.get("latitude"),
                    "lon": record.values.get("longitude")
                }
        return {"lat": 0, "lon": 0, "time": "No data in selected range"}

    except Exception as e:
        logger.error(f"Error querying InfluxDB: {e}")
        return {"lat": 0, "lon": 0, "time": "Database Error"}

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request, user: str = Depends(get_current_user)):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/location")
async def api_location():
    return get_last_location()

@app.post("/login")
async def login(data: LoginRequest):
    if not USER or not PASSWD:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Dashboard login is not configured"
        )

    correct_username = secrets.compare_digest(data.username, USER)
    correct_password = secrets.compare_digest(data.password, PASSWD)

    if not (correct_username and correct_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect login or password"
        )

    return {"message": "Login successful"}

@app.post("/upload_position", dependencies=[Depends(get_api_key)])
async def save_position(data: Position):

    server_timestamp = datetime.now(timezone.utc)

    point = Point("device_positions") \
        .tag("device_id", "test_device") \
        .field("latitude", float(data.latitude)) \
        .field("longitude", float(data.longitude)) \
        .time(server_timestamp)
    try:
        # Próba zapisu do InfluxDB
        write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
    except Exception as e:
        logger.error(e)
        print(f"BŁĄD INFLUXDB: {e}. Dane zapisano lokalnie.")
    await manager.broadcast({
        "time": server_timestamp,
        "lat": data.latitude,
        "lon": data.longitude
    })
    logger.info(f"Data saved correctly: %s", data)
    return {"message": "Data saved correctly", "saved_data": data}


@app.post("/upload_user_position", dependencies=[Depends(get_api_key)])
async def save_user_position(data: Position):

    server_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    file_exists = os.path.isfile(USER_CSV_FILE)

    with open(USER_CSV_FILE, mode='a', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["timestamp", "latitude", "longitude"])
        writer.writerow([server_timestamp, data.latitude, data.longitude])

    return {"message": "User position saved correctly", "saved_data": data}

@app.get("/healthcheck")
def health_check():
    influx_status = "Unhealthy"
    try:
        if client.ping():
            influx_status = "Healthy"
    except:
        pass
    return {"status": "OK","database": influx_status, "service": "Position API"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await asyncio.sleep(10)
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)