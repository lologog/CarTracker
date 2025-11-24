#include <DFRobot_SIM7070G.h>

#define PIN_TX 7
#define PIN_RX 8

SoftwareSerial shieldSerial(PIN_RX, PIN_TX);
DFRobot_SIM7070G SIM7070G(&shieldSerial);

// Log messages in UART in format - [Firmware] [LEVEL] - message
void logMessage(const char* level, const char* message)
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
    Serial.begin(115200);

    // software UART communication between Arduino and SIM7070G shield 
    shieldSerial.begin(19200);
    
    logMessage("INFO", "Turning ON SIM7070G...");
    if (SIM7070G.turnON())
    {
        logMessage("INFO", "SIM7070G turned ON");
    }
    else
    {
        logMessage("ERROR", "Cannot turn ON SIM7070G");
    }

}

void loop() 
{

}
