#include <DFRobot_SIM7070G.h>

#define PIN_TX 7
#define PIN_RX 8
#define HARD_UART_BAUDRATE 115200
#define SOFT_UART_BAUDRATE 19200

SoftwareSerial shieldSerial(PIN_RX, PIN_TX);
DFRobot_SIM7070G SIM7070G(&shieldSerial);

// Log messages in UART in format - [Firmware] [LEVEL] - message
template<typename T>
void logMessage(const char* level, T message)
{
    Serial.print("[Firmware] [");
    Serial.print(level);
    Serial.print("] - ");
    Serial.println(message);
}

// Turn ON the shield, set up shield software UART, check SIM card and initialize GNSS positioning
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

void setup() 
{
    delay(10000);

    // hardware UART communication with serial monitor
    Serial.begin(HARD_UART_BAUDRATE);

    // software UART communication between Arduino and SIM7070G shield 
    shieldSerial.begin(SOFT_UART_BAUDRATE);

    initSIM7070G();
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
