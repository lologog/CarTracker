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

void setup() 
{
    delay(10000);

    // hardware UART communication with serial monitor
    Serial.begin(HARD_UART_BAUDRATE);

    // software UART communication between Arduino and SIM7070G shield 
    shieldSerial.begin(SOFT_UART_BAUDRATE);
    
    // Turn ON SIM7070G
    logMessage("INFO", "Turning ON SIM7070G...");
    if (SIM7070G.turnON())
    {
        logMessage("INFO", "SIM7070G turned ON");
    }
    else
    {
        logMessage("ERROR", "Cannot turn ON SIM7070G");
    }

    // Set baud rate on software UART
    logMessage("INFO", "Setting software UART baud rate...");
    if (SIM7070G.setBaudRate(SOFT_UART_BAUDRATE))
    {
        logMessage("INFO", String("Set baud rate: ") + SOFT_UART_BAUDRATE);
    }
    else
    {
        logMessage("ERROR", "Failed to set baud rate");
    }

    // Check if the SIM card is working properly
    logMessage("INFO", "Checking SIM card...");
    if (SIM7070G.checkSIMStatus())
    {
        logMessage("INFO", "SIM card OK");
    }
    else
    {
        logMessage("ERROR", "SIM card check failed");
    }

}

void loop() 
{

}
