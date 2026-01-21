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
├── LICENSE
└── README.md
```

## Technologies
### Backend & Server
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54) ![Debian](https://img.shields.io/badge/Debian-D70A53?style=for-the-badge&logo=debian&logoColor=white) ![Nginx](https://img.shields.io/badge/nginx-%23009639.svg?style=for-the-badge&logo=nginx&logoColor=white)

* **Python:** Handles server-side logic and processes incoming data from IoT devices.
* **Debian:** An operating system used for hosting the entire infrastructure.
* **NGINX:** Web server and reverse proxy for secure request handling.

### Frontend & Visualization
![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white) ![JavaScript](https://img.shields.io/badge/javascript-%23F7DF1E.svg?style=for-the-badge&logo=javascript&logoColor=black) ![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=Leaflet&logoColor=white)

* **Leaflet.js:** An open-source library used for interactive map rendering with dynamic markers, auto-panning, and real-time coordinate updates.
* **Web Stack:** HTML5, CSS3, and JavaScript featuring a Live Status Panel with WebSocket connectivity and automatic reconnection logic.

### IoT & Hardware
![Arduino](https://img.shields.io/badge/-Arduino-00979D?style=for-the-badge&logo=Arduino&logoColor=white) ![C++](https://img.shields.io/badge/c++-%2300599C.svg?style=for-the-badge&logo=c%2B%2B&logoColor=white)

* **Arduino:** Hardware platform for gathering GPS data.
* **C++:** Used for writing firmware to handle sensors and GSM communication.

## Instalation and Configuration
**TODO**

## Functions
**TODO**
## Authors
* **lologog** - *IoT, Hardware and Repository Maintainer* - [@lologog](https://github.com/lologog)
* **konsept619** - *Backend, Frontend and Documentation* - [@konsept619](https://github.com/konsept619)
