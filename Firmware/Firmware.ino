#include <DFRobot_SIM7070G.h>

#define PIN_TX 7
#define PIN_RX 8

SoftwareSerial shieldSerial(PIN_RX, PIN_TX);
DFRobot_SIM7070G SIM7070G(&shieldSerial);

void setup() 
{
    delay(10000);

    // hardware UART communication with serial monitor
    Serial.begin(115200);

    // software UART communication between Arduino and SIM7070G shield 
    shieldSerial.begin(19200);
    
    Serial.println("Turning ON SIM7070G...");
    if (SIM7070G.turnON())
    {
        Serial.println("SIM7070G turned ON");
    }
    else
    {
        Serial.println("Connot turn ON SIM7070G");
    }

}

void loop() 
{

}
