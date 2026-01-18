import csv
import os
import secrets  
import asyncio
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, status, Security, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.security import APIKeyHeader, HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel
from dotenv import load_dotenv


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

API_KEY_NAME = "x-api-key"  
API_KEY_SECRET = os.getenv("API_KEY")

USER = os.getenv("DASH_USER")
PASSWD = os.getenv("DASH_PASSWD")

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

def get_last_location():
    if not os.path.exists(CSV_FILE):
        return {"lat": 0, "lon": 0, "time": "No data"}
    
    with open(CSV_FILE, 'r') as f:
        lines = f.readlines()
        if len(lines) < 1:
            return {"lat": 0, "lon": 0, "time": "Empty File"}
        
        last_line = lines[-1].strip().split(',')
        return {
            "time": last_line[0],
            "lat": float(last_line[1]),
            "lon": float(last_line[2])
        }

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request, user: str = Depends(get_current_user)):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/location")
async def api_location():
    return get_last_location()

@app.post("/upload_position", dependencies=[Depends(get_api_key)])
async def save_position(data: Position):

    server_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    file_exists = os.path.isfile(CSV_FILE)

    with open(CSV_FILE, mode='a', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["timestamp", "latitude", "longitude"])
        writer.writerow([data.timestamp, data.latitude, data.longitude])
    await manager.broadcast({
        "time": data.timestamp,
        "lat": data.latitude,
        "lon": data.longitude
    })

    return {"message": "Data saved correctly", "saved_data": data}
@app.get("/healthcheck")
def health_check():
    return {"status": "OK", "service": "Position API"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await asyncio.sleep(10) 
            await websocket.receive_text() 
    except WebSocketDisconnect:
        manager.disconnect(websocket)
