import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';

const API_URL = 'http://85.215.210.57';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY;

export default function Home() {
  const [userLatitude, setUserLatitude] = useState<number | null>(null);
  const [userLongitude, setUserLongitude] = useState<number | null>(null);

  const [carLatitude, setCarLatitude] = useState<number | null>(null);
  const [carLongitude, setCarLongitude] = useState<number | null>(null);
  const [carTime, setCarTime] = useState('---');

  const [locationStatus, setLocationStatus] = useState(
    'Pobieram lokalizację użytkownika...'
  );
  const [sendStatus, setSendStatus] = useState(
    'Pozycja użytkownika nie została jeszcze wysłana.'
  );
  const [carStatus, setCarStatus] = useState('Pobieram lokalizację auta...');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const hasUserLocation = userLatitude !== null && userLongitude !== null;
  const hasCarLocation = carLatitude !== null && carLongitude !== null;

  useEffect(() => {
    refreshLocations();
  }, []);

  async function refreshLocations() {
    setIsRefreshing(true);

    await getCurrentLocation();
    await getCarLocation();

    setIsRefreshing(false);
  }

  async function getCurrentLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();

    if (permission.status !== 'granted') {
      setLocationStatus('Brak zgody na lokalizację.');
      return;
    }

    setLocationStatus('Pobieram lokalizację użytkownika...');

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

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

  async function getCarLocation() {
    try {
      setCarStatus('Pobieram lokalizację auta...');

      const response = await fetch(`${API_URL}/location`);

      if (!response.ok) {
        setCarStatus('Nie udało się pobrać lokalizacji auta.');
        return;
      }

      const data = await response.json();

      setCarLatitude(data.lat);
      setCarLongitude(data.lon);
      setCarTime(data.time);
      setCarStatus('Lokalizacja auta pobrana.');
    } catch (error) {
      setCarStatus('Błąd połączenia przy pobieraniu lokalizacji auta.');
    }
  }

  function handleLogout() {
    router.replace('/');
  }

    const mapRegion =
    hasCarLocation
        ? {
            latitude: carLatitude,
            longitude: carLongitude,
            latitudeDelta: 0.003,
            longitudeDelta: 0.003,
        }
        : hasUserLocation
        ? {
            latitude: userLatitude,
            longitude: userLongitude,
            latitudeDelta: 0.003,
            longitudeDelta: 0.003,
            }
        : {
            latitude: 52.2297,
            longitude: 21.0122,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
            };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>CarTracker</Text>
      <Text style={styles.subtitle}>Mapa użytkownika i auta</Text>

      <View style={styles.mapBox}>
        <MapView style={styles.map} region={mapRegion}>
          {hasUserLocation && (
            <Marker
              coordinate={{
                latitude: userLatitude,
                longitude: userLongitude,
              }}
              title="Twoja lokalizacja"
              description="Aktualna pozycja użytkownika"
              pinColor="blue"
            />
          )}

          {hasCarLocation && (
            <Marker
              coordinate={{
                latitude: carLatitude,
                longitude: carLongitude,
              }}
              title="Lokalizacja auta"
              description={`Ostatnia aktualizacja: ${carTime}`}
              pinColor="red"
            />
          )}
        </MapView>
      </View>

      <View style={styles.locationBox}>
        <Text style={styles.boxTitle}>Twoja lokalizacja</Text>
        <Text style={styles.status}>{locationStatus}</Text>
        <Text style={styles.status}>{sendStatus}</Text>

        <Text style={styles.label}>Latitude</Text>
        <Text style={styles.value}>
          {userLatitude !== null ? userLatitude.toFixed(4) : '---'}
        </Text>

        <Text style={styles.label}>Longitude</Text>
        <Text style={styles.value}>
          {userLongitude !== null ? userLongitude.toFixed(4) : '---'}
        </Text>
      </View>

      <View style={styles.locationBox}>
        <Text style={styles.boxTitle}>Lokalizacja auta</Text>
        <Text style={styles.status}>{carStatus}</Text>

        <Text style={styles.label}>Ostatnia aktualizacja</Text>
        <Text style={styles.value}>{carTime}</Text>

        <Text style={styles.label}>Latitude</Text>
        <Text style={styles.value}>
          {carLatitude !== null ? carLatitude.toFixed(4) : '---'}
        </Text>

        <Text style={styles.label}>Longitude</Text>
        <Text style={styles.value}>
          {carLongitude !== null ? carLongitude.toFixed(4) : '---'}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.button, isRefreshing && styles.buttonDisabled]}
        onPress={refreshLocations}
        disabled={isRefreshing}
      >
        <Text style={styles.buttonText}>
          {isRefreshing ? 'Odświeżam...' : 'Odśwież lokalizację'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.buttonText}>Wyloguj</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  container: {
    alignItems: 'center',
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111827',
    marginTop: 28,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 12,
    textAlign: 'center',
  },
  mapBox: {
    width: '100%',
    maxWidth: 420,
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  locationBox: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  boxTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  status: {
    fontSize: 12,
    color: '#374151',
    marginBottom: 6,
    textAlign: 'center',
  },
  label: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 2,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  button: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 12,
    marginTop: 2,
    alignItems: 'center',
  },
  logoutButton: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#4b5563',
    padding: 14,
    borderRadius: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});