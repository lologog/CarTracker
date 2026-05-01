import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function Home() {
  const [userLatitude, setUserLatitude] = useState<number | null>(null);
  const [userLongitude, setUserLongitude] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState(
    'Pobieram lokalizację użytkownika...'
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

    setUserLatitude(location.coords.latitude);
    setUserLongitude(location.coords.longitude);
    setLocationStatus('Lokalizacja użytkownika pobrana.');
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
    marginBottom: 12,
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