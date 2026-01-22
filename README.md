# CarTracker
Car GPS/GSM tracker based on Arduino with a Leaflet Map
## About Project
CarTracker is a streamlined solution for real-time tracking of Arduino-based IoT devices. Equipped with a GSM module, the device captures GPS coordinates (latitude and longitude) and securely transmits them to a cloud server using robust encryption. The project is designed with scalability in mind, allowing for future expansion and new features.
## Repository Structure
```
├── api
│   ├── templates
│   │   └── index.html
│   ├── main.py
│   └── requirements.txt
├── Firmware
│   └── Firmware.ino
├── .gitignore
├── COMMIT_GUIDELINES.md
├── images/
├── LICENSE
└── README.md
```

## Technologies
### Backend & Server
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54) ![Debian](https://img.shields.io/badge/Debian-D70A53?style=for-the-badge&logo=debian&logoColor=white) ![Nginx](https://img.shields.io/badge/nginx-%23009639.svg?style=for-the-badge&logo=nginx&logoColor=white)

* **Python:** Handles server-side logic and processes incoming data from IoT devices.
* **Debian:** An operating system used for hosting the entire infrastructure.
* **NGINX:** Web server and reverse proxy for secure request handling.
* **Security:** Integrated **SSL/TLS** encryption using **Certbot** (Let's Encrypt) to ensure secure **HTTPS** communication between the device, server, and client.


### Frontend & Visualization
![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white) ![JavaScript](https://img.shields.io/badge/javascript-%23F7DF1E.svg?style=for-the-badge&logo=javascript&logoColor=black) ![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=Leaflet&logoColor=white)

* **Leaflet.js:** An open-source library used for interactive map rendering with dynamic markers, auto-panning, and real-time coordinate updates.
* **Web Stack:** HTML5, CSS3, and JavaScript featuring a Live Status Panel with WebSocket connectivity and automatic reconnection logic.

### IoT & Hardware
![Arduino](https://img.shields.io/badge/-Arduino-00979D?style=for-the-badge&logo=Arduino&logoColor=white) ![C++](https://img.shields.io/badge/c++-%2300599C.svg?style=for-the-badge&logo=c%2B%2B&logoColor=white)

* **Arduino:** Hardware platform for gathering GPS data.
* **C++:** Used for writing firmware to handle sensors and GSM communication.

## Instalation and Configuration
### Server (Debian)
1. **Install system dependencies**
   ```bash
   sudo apt update
   sudo apt install nginx python3-pip certbot python3-certbot-nginx
   ```
2. **Environemnt configuration**
   ```bash
   API_KEY= #Your api key

   #Credentials for dashboard security
   DASH_USER=""
   DASH_PASSWORD=""
   ```
3. **NGINX secure configuration**
   * Configure reverse proxy to point to Python application.
   * Register **domain name** pointing to server IP address (_without domain name Certbot cannot issue SSL certificates_).
4. **Activate SSL (Certbot)**
     ```bash
     sudo certbot --nginx -d your-domain.com
     ```
### Application
1. **Clone repository**
   ```bash
   git clone https://github.com/lologog/CarTracker.git
   cd CarTracker
   ```
2. **Create virtual environment and install dependencies**
   ```bash
   #Virtual environment
   python3 -m venv venv
   source venv/bin/activate

   #Dependencies 
   pip install --upgrade pip
   pip pinstall -r requirements.txt
   ```
3. **Create service**
   ```bash
   vi /etc/systemd/system/car-tracker.service

    [Unit]
    Description=Uvicorn instance to serve CarTracker API
    After=network.target
    
    [Service]
    # Replace 'your-user' with your Linux username
    User=your-user
    Group=www-data
    
    # Replace with the actual path where you ran 'git clone'
    WorkingDirectory=/home/your-user/CarTracker
    Environment="PATH=/home/your-user/CarTracker/.venv/bin"
    ExecStart=/home/home/your-user/CarTracker/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
    
    Restart=always


    [Install]
    WantedBy=multi-user.target
    ```
4. Run application
   ```bash
   systemctl enable car-tracker.service
   systemctl start car-tracker.service
   ```
### Arduino with GSM module

## Usage
Once configuration is complete on both sides, the position will update automatically and appear on the map. However, if you provide the **API_KEY** defined in your .**env** file, you can also update the marker manually via the API.
```bash
curl -X POST https://your-domain.com/upload_position -H "Content-Type: application/json" -H "x-api-key: $API_KEY" -d '{"longitude": 21.01, "latitude": 52.23}'

```


## API Reference
### IoT Device Endpoint
1. **Upload Position**
   ```bash
   POST /upload_position
   ```
   Used to send current GPS coordinates
  * Headers:
       - `x-api-key`:`YOUR_SECRET_API_KEY`(Required)
       - `Content-Type`:`application/json`
  * Requested Body:
     ```json
    {
     "longitude": 21.0122,
     "latitude": 52.2297
    }

     ```
  * Response:
     - `200 OK`: Data saved and broadcasted successfully.
     - `403 Forbidden`: Access denied due to wrong or empty API key.
### Service Health
2. Get service status
   ```bash
   GET /healthcheck
   ```
   Simple diagnostic endpoint.
   * Response: `{"status": "OK", "service": "Position API"}`


## Functions
This repository implements a simple end-to-end car GPS tracker made of two parts: an Arduino-based firmware (SIM7070G LTE-M/NB-IoT modem + GNSS) and a FastAPI backend with a live map dashboard (Leaflet + WebSockets). 
### Firmware (Arduino / `Firmware.ino`)
- **Modem initialization and diagnostics**
  - `initSIM7070G()` powers on the SIM7070G modem, configures UART baud rate, and checks SIM card status with retry loops.
  - `logMessage(level, message)` prints consistent log messages to the serial console.
  - `sendAT(cmd)` sends raw AT commands and prints the modem response for debugging.
- **LTE-M data connection**
  - `initNetwork()` configures network mode, checks registration/attach state, and activates the PDP context (APN) to get an IP connection.
- **HTTPS / HTTP client setup**
  - `initSSL()` enables TLS configuration for secure HTTPS communication.
  - `initHTTP()` sets the backend base URL plus HTTP header/body limits.
  - `openHTTP()` starts an HTTP session and checks connection state.
  - `setHTTPHeaders()` sets required headers, including JSON content type and an `x-api-key` header for backend authentication.
- **GNSS positioning**
  - `getGPS(lat, lon)` powers GNSS on, waits for a valid fix (up to a defined timeout), reads latitude/longitude from the modem, then powers GNSS off to save energy.
- **HTTP POST telemetry upload**
  - The firmware builds a JSON payload (`latitude`, `longitude`) and uploads it to the backend endpoint `/upload_position`.
  - `httpPostAndWait(path, timeoutMs)` sends the POST request and waits for the `+SHREQ:` response to determine response body length, enabling a follow-up body read via `AT+SHREAD`.
- **Power saving**
  - The main loop sleeps most of the time using the `LowPower` library and performs a periodic “wake → GPS fix → upload → sleep” cycle (roughly every ~5 minutes in the provided configuration).
### Backend API (FastAPI / `main.py`)
- **Ingest endpoint (device → server)**
  - `POST /upload_position` accepts `{ "longitude": float, "latitude": float }`, protects access using an `x-api-key` header, stores the received location, and broadcasts the update to connected WebSocket clients.
- **CSV storage**
  - Incoming positions are appended to a CSV file (`dane.csv`) with a timestamp generated on the server side.
- **Dashboard authentication**
  - `GET /` serves the HTML dashboard and is protected by HTTP Basic Auth (username/password from environment variables).
- **Read API**
  - `GET /location` returns the last known position from the CSV file to initialize the dashboard state.
- **Health endpoint**
  - `GET /healthcheck` provides a lightweight service status response.
- **Real-time updates**
  - `GET /ws` (WebSocket) maintains active connections and broadcasts new positions so the dashboard updates instantly.
### Dashboard (HTML / `index.html`)
- **Interactive map view**
  - Uses Leaflet with OpenStreetMap tiles and a single marker that moves to the latest received coordinates.
- **Live tracking via WebSockets**
  - Connects to `/ws` and updates the marker in real time when new messages arrive.
- **Connection status UI**
  - Shows a small status panel indicating “connected/disconnected” state and last update time, with automatic reconnect on disconnect.
**TODO**
## Authors
* **lologog** - *IoT, Hardware and Repository Maintainer* - [@lologog](https://github.com/lologog)
* **konsept619** - *Backend, Frontend and Documentation* - [@konsept619](https://github.com/konsept619)
