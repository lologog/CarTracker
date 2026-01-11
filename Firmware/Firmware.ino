/*
* Author: Krzysztof Tomicki
* Year: 2025
*/

#include <DFRobot_SIM7070G.h>

#define PIN_TX 7
#define PIN_RX 8
#define HARD_UART_BAUDRATE 115200
#define SOFT_UART_BAUDRATE 19200

SoftwareSerial shieldSerial(PIN_RX, PIN_TX);
DFRobot_SIM7070G SIM7070G(&shieldSerial);

int lastHttpLen = -1;

// Log messages in UART in format - [Firmware] [LEVEL] - message
template<typename T>
void logMessage(const char* level, T message)
{
    Serial.print("[Firmware] [");
    Serial.print(level);
    Serial.print("] - ");
    Serial.println(message);
}

// Send AT command to the modem and print response to Serial Monitor
void sendAT(const char* cmd)
{
    // Print command to Serial Monitor
    Serial.print(">> ");
    Serial.println(cmd);

    // Send AT command to SIM7070G via software serial
    shieldSerial.print(cmd);
    shieldSerial.print("\r\n");

    // Read modem response for up to 3 seconds
    unsigned long t = millis();
    while (millis() - t < 3000) 
    {
        while (shieldSerial.available()) 
        {
            char c = shieldSerial.read();
            Serial.write(c);
        }
    }

    Serial.println("\n----");
}

// Turn ON the shield, set up shield software UART and check SIM card
void initSIM7070G()
{
    // Turn ON SIM7070G
    while (1)
    {
        logMessage("INFO", "Turning ON SIM7070G...");
        if (SIM7070G.turnON())
        {
            logMessage("INFO", "SIM7070G turned ON");
            break;
        }
        else
        {
            logMessage("ERROR", "Cannot turn ON SIM7070G, retrying...");
            delay(1000);
        }
    }

    // Set baud rate on software UART
    while (1)
    {
        logMessage("INFO", "Setting software UART baud rate...");
        if (SIM7070G.setBaudRate(SOFT_UART_BAUDRATE))
        {
            logMessage("INFO", String("Set baud rate: ") + SOFT_UART_BAUDRATE);
            break;
        }
        else
        {
            logMessage("ERROR", "Failed to set baud rate, retrying...");
            delay(1000);
        }
    }

    // Check if the SIM card is working properly
    while (1)
    {
        logMessage("INFO", "Checking SIM card...");
        if (SIM7070G.checkSIMStatus())
        {
            logMessage("INFO", "SIM card OK");
            break;
        }
        else
        {
            logMessage("ERROR", "SIM card check failed, retrying...");
            delay(1000);
        }
    }
}

// HTTP post and wait for response due to catch +SHREQ response body size
int httpPostAndWait(const char* path, unsigned long timeoutMs = 20000)
{
    // Clear RX buffer to avoid parsing old data
    while (shieldSerial.available()) shieldSerial.read();

    // Send HTTP POST request (method=3)
    shieldSerial.print("AT+SHREQ=\"");
    shieldSerial.print(path);
    shieldSerial.print("\",3\r\n");

    String line = "";
    unsigned long start = millis();

    // Wait for the response from the server - max timeout 20 sec
    while (millis() - start < timeoutMs)
    {
        while (shieldSerial.available())
        {
            // Read one letter
            char c = shieldSerial.read();
            Serial.write(c);

            // Whole line read
            if (c == '\n')
            {
                // Remove white signs
                line.trim();

                // Search for response +SHREQ response after POST
                if (line.startsWith("+SHREQ:"))
                {
                    // Take body length given by the response (+SHREQ: "POST",200,449 <-- length)
                    int lastComma = line.lastIndexOf(',');
                    if (lastComma > 0)
                    {
                        int len = line.substring(lastComma + 1).toInt();
                        return len;
                    }
                }
                line = "";
            }
            else
            {
                line += c;
            }
        }
    }
    return -1;
}

void setup() 
{
    delay(10000);

    // hardware UART communication with serial monitor
    Serial.begin(HARD_UART_BAUDRATE);

    // software UART communication between Arduino and SIM7070G shield 
    shieldSerial.begin(SOFT_UART_BAUDRATE);

    //initSIM7070G();

    sendAT("AT+CNMP=51"); // Network mode preference: 38 = LTE-M only
    sendAT("AT+CFUN=1,1"); // Full modem restart

    delay(60000); // Wait for modem to reboot and initialize

    sendAT("AT+CEREG?"); // LTE registration status (0,1 = registered)
    sendAT("AT+CGATT?"); // Packet service attach status (internet access)
    sendAT("AT+CNCFG=0,1,\"internet\""); // Configure PDP context 0 (APN and IP type) for LTE-M
    sendAT("AT+CNACT=0,1"); // Activate PDP context 0 and establish data connection
    delay(3000); // Allow time to obtain IP address
    sendAT("AT+CNACT?"); // Query PDP context status and assigned IP address
    sendAT("AT+CPSI?"); // Current radio connection status (RAT, band, signal)

    // sendAT("AT+SHCONF=\"URL\",\"http://httpbin.org\""); // Set HTTP server URL
    // sendAT("AT+SHCONF=\"BODYLEN\",1024"); // Set max HTTP body length
    // sendAT("AT+SHCONF=\"HEADERLEN\",350"); // Set max HTTP header length

    // sendAT("AT+SHCONN"); // Build and open HTTP connection
    // delay(3000); // Wait for HTTP connection to be established
    // sendAT("AT+SHSTATE?"); // Check HTTP connection state (1 == connected)

    // sendAT("AT+SHCHEAD"); // Clear all HTTP headers

    // sendAT("AT+SHAHEAD=\"Content-Type\",\"application/x-www-form-urlencoded\""); // Set POST content type
    // sendAT("AT+SHAHEAD=\"Cache-Control\",\"no-cache\""); // Disable cashing
    // sendAT("AT+SHAHEAD=\"Connection\",\"keep-alive\""); // Keep connection active
    // sendAT("AT+SHAHEAD=\"Accept\",\"*/*\""); // Accept any response type

    // sendAT("AT+SHCPARA"); // Clear HTTP body parameters

    // sendAT("AT+SHPARA=\"product\",\"apple\""); // POST parameter: product=apple
    // sendAT("AT+SHPARA=\"price\",\"1\""); // POST parameter: price=1

    // int len = httpPostAndWait("/post"); // Send HTTP POST request to //post and wait for +SHREQ

    // if (len > 0)
    // {
    //     sendAT(("AT+SHREAD=0," + String(len)).c_str()); // Read full HTTP response body
    // }
    // else
    // {
    //     logMessage("ERROR", "No +SHREQ received"); // POST timeout or failure
    // }

    // sendAT("AT+SHDISC"); // Close HTTP connection

    sendAT("AT+CSSLCFG=\"sslversion\",1,3");
    sendAT("AT+SHSSL=1,\"\"");

    sendAT("AT+SHCONF=\"URL\",\"https://api.server-iot.duckdns.org\"");
    sendAT("AT+SHCONF=\"BODYLEN\",1024");
    sendAT("AT+SHCONF=\"HEADERLEN\",350");

    sendAT("AT+SHCONN");
    delay(10000);
    sendAT("AT+SHSTATE?");

    sendAT("AT+SHCHEAD");

    sendAT("AT+SHAHEAD=\"Content-Type\",\"application/json\"");
    sendAT("AT+SHAHEAD=\"Accept\",\"*/*\"");
    sendAT("AT+SHAHEAD=\"Connection\",\"keep-alive\"");
    sendAT("AT+SHAHEAD=\"x-api-key\",\"SOME_SECRET_KEY\"");

    const char* json = "{\"longitude\":16.9946,\"latitude\":52.4514,\"timestamp\":\"11.02.2026 20:53:30\"}";

    int jsonLen = strlen(json);

    sendAT(("AT+SHBOD=" + String(jsonLen) + ",10000").c_str());
    delay(200);

    shieldSerial.print(json);
    shieldSerial.write(0x1A);

    delay(500);

    sendAT("AT+CCLK?");
    int len = httpPostAndWait("/upload_position");

    if (len > 0)
    {
        sendAT(("AT+SHREAD=0," + String(len)).c_str());
    }
    else
    {
        logMessage("ERROR", "No +SHREQ received");
    }

    sendAT("AT+SHDISC");

    // Initialize GNSS positioning
    while (1)
    {
        logMessage("INFO", "Initializing GNSS positioning...");
        if (SIM7070G.initPos())
        {
            logMessage("INFO", "GNSS positioning initialized");
            break;
        }
        else
        {
            logMessage("ERROR", "Failed to initialize GNSS positioning, retrying...");
            delay(1000);
        }
    }
}

void loop() 
{
    // Get device position
    logMessage("INFO", "Getting device position...");
    if (SIM7070G.getPosition())
    {
        logMessage("INFO", String("Latitude: ") + SIM7070G.getLatitude());
        logMessage("INFO", String("Longitude: ") + SIM7070G.getLongitude());
    }
    else
    {
        logMessage("ERROR", "Failed to get device position");
    }

    delay(1000);
}