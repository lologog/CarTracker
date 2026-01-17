/*
* Author: Krzysztof Tomicki
* Year: 2025
*/

#include <DFRobot_SIM7070G.h>

#define PIN_TX 7
#define PIN_RX 8
#define HARD_UART_BAUDRATE 115200
#define SOFT_UART_BAUDRATE 19200
#define HTTP_SEND_INTERVAL_MS 300000

SoftwareSerial shieldSerial(PIN_RX, PIN_TX);
DFRobot_SIM7070G SIM7070G(&shieldSerial);

unsigned long lastSendMs = 0; // Timestamp of last HTTP transmission

// Log messages in UART in format - [Firmware] [LEVEL] - message
template<typename T>
void logMessage(const char* level, T message)
{
    Serial.print("[Firmware] [");
    Serial.print(level);
    Serial.print("] - ");
    Serial.println(message);
}

// Turn ON the shield, set up shield software UART and check SIM card 
// Use this function only when using SIM7070G for the first time
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

// Retrieves the current date and time from the modem and formats it into the format expected by the backend
// +CCLK: "26/02/11,20:53:30+04" --> 26/02/11,20:53:30+04
bool getTimestamp(char* out, size_t outSize)
{
    // Ack modem for the current clock value
    shieldSerial.print("AT+CCLK?\r\n");

    unsigned long start = millis();
    String line = "";

    // Wait up to 3 seconds for modem response
    while (millis() - start < 3000)
    {
        while (shieldSerial.available())
        {
            char c = shieldSerial.read();
            
            // End of line received
            if (c == '\n')
            {
                line.trim();

                // Look for +CCLK response
                if (line.startsWith("+CCLK:"))
                {
                    // Extract timestamp between quotes
                    int q1 = line.indexOf('"');
                    int q2 = line.lastIndexOf('"');

                    if (q1 < 0 || q2 < 0) 
                    {
                        return false;
                    }

                    String ts = line.substring(q1 + 1, q2);

                    // Parse data and time fields
                    int yy = ts.substring(0, 2).toInt();
                    int mm = ts.substring(3, 5).toInt();
                    int dd = ts.substring(6, 8).toInt();
                    int hh = ts.substring(9, 11).toInt();
                    int mi = ts.substring(12, 14).toInt();
                    int ss = ts.substring(15, 17).toInt();

                    // Convert year to full format
                    int yyyy = 2000 + yy;

                    // Format timestamp as DD-MM-YYYY HH:MM:SS
                    snprintf(out, outSize, "%02d-%02d-%04d %02d:%02d:%02d", dd, mm, yyyy, hh, mi, ss);

                    return true;
                }

                line = "";
            }
            else
            {
                // Accumulate characters until newline
                line += c;
            }
        }
    }

    return false;
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

// Initialize LTE-M network and establish data connection
void initNetwork()
{
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
}

// Configure SSL/TLS for HTTPS communication
void initSSL()
{
    sendAT("AT+CSSLCFG=\"sslversion\",1,3"); // Configure SSL context 1 to use TLS v1.2
    sendAT("AT+SHSSL=1,\"\""); // Enable SSL for HTTP service using context 1
}

// Configure HTTP client parameters
void initHTTP()
{
    sendAT("AT+SHCONF=\"URL\",\"https://api.server-iot.duckdns.org\""); // Set base URL for all HTTP requests
    sendAT("AT+SHCONF=\"BODYLEN\",1024"); // Set max allowed HTTP body size (bytes)
    sendAT("AT+SHCONF=\"HEADERLEN\",350"); // Set max allowed HTTP header size (bytes)
}

// Open HTTP connection to the configured server
bool openHTTP()
{
    sendAT("AT+SHCONN"); // Open HTTP connection to the configured server
    delay(5000); // Wait for HTTP connection establishment
    sendAT("AT+SHSTATE?"); // Check HTTP connection state
    return true;
}

// Set HTTP request headers for JSON-based communication
void setHTTPHeaders()
{
    sendAT("AT+SHCHEAD"); // Clear previously set HTTP headers
    sendAT("AT+SHAHEAD=\"Content-Type\",\"application/json\""); // Set content type to JSON (backend eqpects JSON body)
    sendAT("AT+SHAHEAD=\"Accept\",\"*/*\""); // Accept any response content type
    sendAT("AT+SHAHEAD=\"Connection\",\"close\""); // Keep HTTP connection alive for reuse
    sendAT("AT+SHAHEAD=\"x-api-key\",\"SOME_SECRET_KEY\""); // Custom API auth header
}

// Send JSON payload as HTTP request body
bool sendJSONBody(const char* json)
{
    int jsonLen = strlen(json); // Calculate exact JSON payload length (bytes)
    sendAT(("AT+SHBOD=" + String(jsonLen) + ",10000").c_str()); // Inform modem about incoming HTTP body size
    delay(500); // Short delay to allow modem to enter data mode
    shieldSerial.print(json); // Send JSON payload
    delay(500); // Give modem time to process the body
    return true;
}

// Send HTTP POST request with previously prepared JSON body and read response
void postJson(const char* endpoint)
{
    int len = httpPostAndWait(endpoint); // Send HTTP POST request to the given endpoint
    if (len > 0)
    {
        // read full HTTP response body
        sendAT(("AT+SHREAD=0," + String(len)).c_str());
    }
    else
    {
        //No response received within timeout
        logMessage("ERROR", "No +SHREQ received");
    }
}

// Close HTTP connection and release allocated resources
void closeHTTP()
{
    sendAT("AT+SHDISC"); // Close HTTP connection and release resources
}

// Enables GNSS and retrieves current latitude and longitude
bool getGPS(double &lat, double &lon)
{
    // Power on GNSS module
    sendAT("AT+CGNSPWR=1");

    // Wait up to 120 seconds for a valid GNSS
    unsigned long start = millis();
    while (millis() - start < 120000)
    {
        if (SIM7070G.getPosition())
        {
            // Read latitude and longitute from modem
            lat = atof(SIM7070G.getLatitude());
            lon = atof(SIM7070G.getLongitude());

            // Power off GNSS to save energy
            sendAT("AT+CGNSPWR=0");
            return true;
        }

        // Retry every 2 seconds
        delay(2000);
    }

    // GNSS timout, turn GNSS off
    sendAT("AT+CGNSPWR=0");
    return false;
}

// System initialization
void setup() 
{
    delay(10000);

    Serial.begin(HARD_UART_BAUDRATE);
    shieldSerial.begin(SOFT_UART_BAUDRATE);

    initNetwork();
    initSSL();
    initHTTP();
}

// System main loop
void loop()
{
    double lat = 0.0; // Current GNSS latitude
    double lon = 0.0; // Current GNSS longitude
    char latStr[16]; // Latitude as string (for JSON)
    char lonStr[16]; // Longitude as string (for JSON)
    char json[192]; // HTTP JSON request body
    char timestamp[32]; // Formatted modem timestamp

    // Send data once per defined time
    if (millis() - lastSendMs < HTTP_SEND_INTERVAL_MS)
    {
        return;
    }
    lastSendMs = millis();

    // Get GNSS position
    logMessage("INFO", "Getting GPS position...");
    if (!getGPS(lat, lon))
    {
        logMessage("ERROR", "GPS fix failed");
        return;
    }
    logMessage("INFO", String("Latitude: ") + lat);
    logMessage("INFO", String("Longitude: ") + lon);

    // Small delay between GNSS and LTE switch
    delay (2000);

    // Open HTTP session
    openHTTP();
    setHTTPHeaders();

    // Get modem timestamp
    if (!getTimestamp(timestamp, sizeof(timestamp)))
    {
        strcpy(timestamp, "00-00-0000 00:00:00");
    }

    // Convert coorinates to strings
    dtostrf(lat, 0, 4, latStr);
    dtostrf(lon, 0, 4, lonStr);

    // Build JSON payload
    snprintf(json, sizeof(json),
            "{\"longitude\":%s,"
            "\"latitude\":%s,"
            "\"timestamp\":\"%s\"}",
            lonStr, latStr, timestamp);

    // Send HTTP body
    int jsonLen = strlen(json);
    sendAT(("AT+SHBOD=" + String(jsonLen) + ",10000").c_str());
    delay(200);
    shieldSerial.print(json);
    shieldSerial.write(0x1A);
    delay(500);

    // Execute HTTP POST
    int len = httpPostAndWait("/upload_position");
    if (len > 0)
    {
        sendAT(("AT+SHREAD=0," + String(len)).c_str());
    }
    else
    {
        logMessage("ERROR", "No +SHREQ received");
    }

    // Close HTTP session
    closeHTTP();

    logMessage("INFO", "Send cycle complete");
}