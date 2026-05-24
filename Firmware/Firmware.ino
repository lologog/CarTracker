/*
* Author: Krzysztof Tomicki
* Year: 2025
*/

#include <DFRobot_SIM7070G.h>
#include <SoftwareSerial.h>
#include "LowPower.h"

#define PIN_TX 7
#define PIN_RX 8
#define HARD_UART_BAUDRATE 115200
#define SOFT_UART_BAUDRATE 19200

SoftwareSerial shieldSerial(PIN_RX, PIN_TX);
DFRobot_SIM7070G SIM7070G(&shieldSerial);

// Small global buffer for GNSS line to save stack RAM
char gnssLine[160];

// Log messages in UART in format - [Firmware] [LEVEL] - message
template<typename T>
void logMessage(const char* level, T message)
{
    Serial.print(F("[Firmware] ["));
    Serial.print(level);
    Serial.print(F("] - "));
    Serial.println(message);
}

// Turn ON the shield, set up shield software UART and check SIM card 
void initSIM7070G()
{
    // Turn ON SIM7070G
    while (1)
    {
        logMessage("INFO", F("Turning ON SIM7070G..."));
        if (SIM7070G.turnON())
        {
            logMessage("INFO", F("SIM7070G turned ON"));
            break;
        }
        else
        {
            logMessage("ERROR", F("Cannot turn ON SIM7070G, retrying..."));
            delay(1000);
        }
    }

    // Set baud rate on software UART
    while (1)
    {
        logMessage("INFO", F("Setting software UART baud rate..."));
        if (SIM7070G.setBaudRate(SOFT_UART_BAUDRATE))
        {
            logMessage("INFO", F("Set baud rate: 19200"));
            break;
        }
        else
        {
            logMessage("ERROR", F("Failed to set baud rate, retrying..."));
            delay(1000);
        }
    }

    // Check if the SIM card is working properly
    while (1)
    {
        logMessage("INFO", F("Checking SIM card..."));
        if (SIM7070G.checkSIMStatus())
        {
            logMessage("INFO", F("SIM card OK"));
            break;
        }
        else
        {
            logMessage("ERROR", F("SIM card check failed, retrying..."));
            delay(1000);
        }
    }
}

// Send AT command to the modem and print response to Serial Monitor
void sendAT(const char* cmd)
{
    // Print command to Serial Monitor
    Serial.print(F(">> "));
    Serial.println(cmd);

    // Send AT command to SIM7070G via software serial
    shieldSerial.print(cmd);
    shieldSerial.print(F("\r\n"));

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

    Serial.println(F("\n----"));
}

// HTTP post and wait for response due to catch +SHREQ response body size
int httpPostAndWait(const char* path, unsigned long timeoutMs = 20000)
{
    // Clear RX buffer to avoid parsing old data
    while (shieldSerial.available())
    {
        shieldSerial.read();
    }

    // Send HTTP POST request (method=3)
    shieldSerial.print(F("AT+SHREQ=\""));
    shieldSerial.print(path);
    shieldSerial.print(F("\",3\r\n"));

    char line[96];
    int linePos = 0;
    line[0] = '\0';

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
                line[linePos] = '\0';

                // Search for response +SHREQ response after POST
                if (strncmp(line, "+SHREQ:", 7) == 0)
                {
                    // Take body length given by the response (+SHREQ: "POST",200,449 <-- length)
                    char* lastComma = strrchr(line, ',');
                    if (lastComma != NULL)
                    {
                        int len = atoi(lastComma + 1);
                        return len;
                    }
                }

                linePos = 0;
                line[0] = '\0';
            }
            else if (c != '\r')
            {
                if (linePos < (int)sizeof(line) - 1)
                {
                    line[linePos++] = c;
                    line[linePos] = '\0';
                }
            }
        }
    }

    return -1;
}

// Initialize LTE-M network and establish data connection
void initNetwork()
{
    sendAT("AT+CNMP=51"); // Network mode preference: 38 = LTE-M only
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

// Close HTTP connection and release allocated resources
void closeHTTP()
{
    sendAT("AT+SHDISC"); // Close HTTP connection and release resources
}

// Prepare fresh HTTP session before every send
bool prepareHTTPForSend()
{
    logMessage("INFO", F("Preparing HTTP session..."));

    // Close previous HTTP session if it exists; ignore errors
    sendAT("AT+SHDISC");
    delay(500);

    // Make sure PDP context is active again
    sendAT("AT+CNACT?");
    sendAT("AT+CNACT=0,1");
    delay(3000);
    sendAT("AT+CNACT?");

    // Reconfigure SSL and HTTP every cycle
    initSSL();
    initHTTP();

    // Open fresh HTTP session
    openHTTP();

    // Set headers every cycle
    setHTTPHeaders();

    return true;
}

// Read one CSV field preserving empty fields
bool getCSVFieldFromLine(const char* line, int fieldIndex, char* out, int outSize)
{
    int currentField = 0;
    int outPos = 0;

    out[0] = '\0';

    for (int i = 0; ; i++)
    {
        char c = line[i];

        if (currentField == fieldIndex)
        {
            if (c == ',' || c == '\0' || c == '\r' || c == '\n')
            {
                out[outPos] = '\0';
                return true;
            }

            if (outPos < outSize - 1)
            {
                out[outPos++] = c;
            }
        }

        if (c == ',')
        {
            currentField++;
        }

        if (c == '\0' || c == '\r' || c == '\n')
        {
            break;
        }
    }

    return false;
}

// Parse one +CGNSINF line and extract latitude and longitude as text
bool parseCGNSINFLine(const char* line, char* latStr, int latSize, char* lonStr, int lonSize)
{
    const char* p = strstr(line, "+CGNSINF:");
    if (p == NULL)
    {
        return false;
    }

    p += 9;

    while (*p == ' ')
    {
        p++;
    }

    // Format:
    // +CGNSINF: 1,,20260523135154.699,51.919997,19.129997,-38.724,...
    //
    // Fields:
    // 0 = runStatus
    // 1 = fixStatus, sometimes empty
    // 2 = UTC
    // 3 = latitude
    // 4 = longitude

    if (!getCSVFieldFromLine(p, 3, latStr, latSize))
    {
        return false;
    }

    if (!getCSVFieldFromLine(p, 4, lonStr, lonSize))
    {
        return false;
    }

    if (strlen(latStr) == 0 || strlen(lonStr) == 0)
    {
        return false;
    }

    if (strcmp(latStr, "0") == 0 && strcmp(lonStr, "0") == 0)
    {
        return false;
    }

    return true;
}

// Enables GNSS and retrieves current latitude and longitude directly from modem
bool getGPS(char* latStr, int latSize, char* lonStr, int lonSize)
{
    // Power on GNSS module
    sendAT("AT+CGNSPWR=1");

    // Wait up to 120 seconds for a valid GNSS
    unsigned long start = millis();

    while (millis() - start < 120000UL)
    {
        while (shieldSerial.available())
        {
            shieldSerial.read();
        }

        Serial.println(F(">> AT+CGNSINF"));
        shieldSerial.print(F("AT+CGNSINF\r\n"));

        int pos = 0;
        gnssLine[0] = '\0';

        unsigned long queryStart = millis();

        while (millis() - queryStart < 3000UL)
        {
            while (shieldSerial.available())
            {
                char c = shieldSerial.read();
                Serial.write(c);

                if (c == '\n')
                {
                    gnssLine[pos] = '\0';

                    if (parseCGNSINFLine(gnssLine, latStr, latSize, lonStr, lonSize))
                    {
                        Serial.print(F("GPS latitude: "));
                        Serial.println(latStr);
                        Serial.print(F("GPS longitude: "));
                        Serial.println(lonStr);

                        // Power off GNSS to save energy
                        sendAT("AT+CGNSPWR=0");
                        return true;
                    }

                    pos = 0;
                    gnssLine[0] = '\0';
                }
                else if (c != '\r')
                {
                    if (pos < (int)sizeof(gnssLine) - 1)
                    {
                        gnssLine[pos++] = c;
                        gnssLine[pos] = '\0';
                    }
                }
            }
        }

        logMessage("INFO", F("Waiting for GPS coordinates..."));
        delay(2000);
    }

    // GNSS timout, turn GNSS off
    sendAT("AT+CGNSPWR=0");
    return false;
}

// System initialization
void setup() 
{
    Serial.begin(HARD_UART_BAUDRATE);
    shieldSerial.begin(SOFT_UART_BAUDRATE);

    initSIM7070G();
    delay(10000);

    initNetwork();
    initSSL();
    initHTTP();
}

// System main loop
void loop()
{
    char latStr[20]; // Current GNSS latitude as string
    char lonStr[20]; // Current GNSS longitude as string
    char json[96];   // HTTP JSON request body

    latStr[0] = '\0';
    lonStr[0] = '\0';
    json[0] = '\0';

    // Get GNSS position
    logMessage("INFO", F("Getting GPS position..."));
    if (!getGPS(latStr, sizeof(latStr), lonStr, sizeof(lonStr)))
    {
        logMessage("ERROR", F("GPS fix failed"));
        return;
    }

    // Small delay between GNSS and LTE switch
    delay(2000);

    // Prepare fresh HTTP session
    prepareHTTPForSend();

    // Build JSON payload
    int written = snprintf(json, sizeof(json),
             "{\"longitude\":%s,"
             "\"latitude\":%s}",
             lonStr, latStr);

    if (written <= 0 || written >= (int)sizeof(json))
    {
        logMessage("ERROR", F("JSON build failed"));
        closeHTTP();
        return;
    }

    Serial.println(json);

    // Send HTTP body
    int jsonLen = strlen(json);
    char cmd[32];
    snprintf(cmd, sizeof(cmd), "AT+SHBOD=%d,10000\r\n", jsonLen);
    shieldSerial.print(cmd);
    delay(200);
    shieldSerial.print(json);
    shieldSerial.write(0x1A);
    delay(500);

    // Execute HTTP POST
    int len = httpPostAndWait("/upload_position");

    if (len > 0)
    {
        char readCmd[32];
        snprintf(readCmd, sizeof(readCmd), "AT+SHREAD=0,%d", len);
        sendAT(readCmd);
    }
    else
    {
        logMessage("ERROR", F("No +SHREQ received"));
    }

    // Close HTTP session
    closeHTTP();

    logMessage("INFO", F("Send cycle complete"));

    // Send data once per defined time (5 min)
    for (int i = 0; i < 37; i++)
    {
        LowPower.powerDown(SLEEP_8S, ADC_OFF, BOD_OFF);
    }
    LowPower.powerDown(SLEEP_4S, ADC_OFF, BOD_OFF);
}