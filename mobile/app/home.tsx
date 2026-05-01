import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const API_URL = 'http://85.215.210.57';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY;

export default function Home() {
  const [userLatitude, setUserLatitude] = useState<number | null>(null);
  const [userLongitude, setUserLongitude] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState(
    'Pobieram lokalizację użytkownika...'
  );
  const [sendStatus, setSendStatus] = useState(
    'Pozycja użytkownika nie została jeszcze wysłana.'
  );

  useEffect(() => {
    getCurrentLocation();
  }, []);

  async function getCurrentLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== 'granted') {
      setLocationStatus('Brak zgody na lokalizację.');
      return;
    }

    const location = await Location.getCurrentPositionAsync({});

    const currentLatitude = location.coords.latitude;
    const currentLongitude = location.coords.longitude;

    setUserLatitude(currentLatitude);
    setUserLongitude(currentLongitude);
    setLocationStatus('Lokalizacja użytkownika pobrana.');

    await sendUserLocation(currentLatitude, currentLongitude);
  }

  async function sendUserLocation(latitude: number, longitude: number) {
    if (!API_KEY) {
      setSendStatus('Brak API key w konfiguracji aplikacji.');
      return;
    }

    try {
      setSendStatus('Wysyłam pozycję użytkownika do backendu...');

      const response = await fetch(`${API_URL}/upload_user_position`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
        },
        body: JSON.stringify({
          latitude: latitude,
          longitude: longitude,
        }),
      });

      if (!response.ok) {
        setSendStatus('Nie udało się wysłać pozycji użytkownika.');
        return;
      }

      setSendStatus('Pozycja użytkownika wysłana do backendu.');
    } catch (error) {
      setSendStatus('Błąd połączenia z backendem.');
    }
  }

  function handleLogout() {
    router.replace('/');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CarTracker</Text>
      <Text style={styles.subtitle}>Twoja aktualna lokalizacja</Text>

      <View style={styles.locationBox}>
        <Text style={styles.boxTitle}>Twoja pozycja</Text>

        <Text style={styles.status}>{locationStatus}</Text>
        <Text style={styles.status}>{sendStatus}</Text>

        <Text style={styles.label}>Latitude</Text>
        <Text style={styles.value}>
          {userLatitude !== null ? userLatitude : '---'}
        </Text>

        <Text style={styles.label}>Longitude</Text>
        <Text style={styles.value}>
          {userLongitude !== null ? userLongitude : '---'}
        </Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleLogout}>
        <Text style={styles.buttonText}>Wyloguj</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f3f4f6',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  locationBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  boxTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
  status: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  button: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#111827',
    padding: 15,
    borderRadius: 12,
    marginTop: 6,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});