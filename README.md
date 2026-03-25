 # CarTracker
Car GPS/GSM tracker based on Arduino with a Leaflet Map
## About Project
CarTracker is a streamlined solution for real-time tracking of Arduino-based IoT devices. Equipped with a GSM module, the device captures GPS coordinates (latitude and longitude) and securely transmits them to a cloud server using robust encryption. The project is designed with scalability in mind, allowing for future expansion and new features.
### Preview
<img src="https://github.com/lologog/CarTracker/blob/main/images/car-tracker-dashboard.png" alt="Dashboard Preview" width="600">

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
├── installation-setup.md 
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

* **Arduino Uno Rev3:** Main microcontroller board used to run the firmware and control the device.
* **DFRobot NB-IoT/LTE/GNSS Shield (SIM7070G, DFR0572):** Connectivity + positioning module used for **LTE-M** data transmission and **GNSS/GPS** location acquisition.
* **C++:** Used for writing firmware to handle modem communication and GPS/GNSS data processing.



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

## Further information
More info regarding installation, setup and used function can be found here: [installation-setup](installation-setup.md)

## Authors
* **Krzysztof Tomicki** - *IoT, Hardware and Repository Maintainer* - [@lologog](https://github.com/lologog)
* **Konrad Wrzesień** - *Backend, Frontend and Documentation* - [@konsept619](https://github.com/konsept619)
