import { router } from 'expo-router';
import * as Location from 'expo-location';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

const API_URL  = 'http://85.215.210.57';
const WS_URL   = 'ws://85.215.210.57/ws';
const API_KEY  = process.env.EXPO_PUBLIC_API_KEY;

// ─── Guard against the backend's "no data" sentinel ─────────────────────────
// InfluxDB returns { lat: 0, lon: 0 } when there are no records in range.
// Exact (0, 0) is in the Atlantic Ocean — treat it as "no data".
function isValidCoord(lat: number, lon: number): boolean {
  return !(lat === 0 && lon === 0);
}

// ─── Haversine distance (metres) ────────────────────────────────────────────
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Format metres ───────────────────────────────────────────────────────────
function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

// ─── OSRM route fetcher (free, no API key) ───────────────────────────────────
async function fetchOSRMRoute(
  fromLat: number, fromLon: number,
  toLat:   number, toLon:   number
): Promise<Array<{ latitude: number; longitude: number }>> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${fromLon},${fromLat};${toLon},${toLat}` +
    `?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OSRM request failed');
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found');
  return data.routes[0].geometry.coordinates.map(
    ([lon, lat]: [number, number]) => ({ latitude: lat, longitude: lon })
  );
}

// ─── WebSocket connection status type ───────────────────────────────────────
type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

export default function Home() {
  // ── Positions ──────────────────────────────────────────────────────────────
  const [userLatitude,  setUserLatitude]  = useState<number | null>(null);
  const [userLongitude, setUserLongitude] = useState<number | null>(null);
  const [userTime,      setUserTime]      = useState('---');

  const [carLatitude,  setCarLatitude]  = useState<number | null>(null);
  const [carLongitude, setCarLongitude] = useState<number | null>(null);
  const [carTime,      setCarTime]      = useState('---');

  // ── Route ─────────────────────────────────────────────────────────────────
  const [routeCoords,    setRouteCoords]    = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  // ── Status strings ────────────────────────────────────────────────────────
  const [locationStatus, setLocationStatus] = useState('Pobieram lokalizację użytkownika...');
  const [sendStatus,     setSendStatus]     = useState('Pozycja użytkownika nie została jeszcze wysłana.');
  const [wsStatus,       setWsStatus]       = useState<WsStatus>('connecting');

  // ── Refs ──────────────────────────────────────────────────────────────────
  const prevCarLatRef  = useRef<number | null>(null);
  const prevCarLonRef  = useRef<number | null>(null);
  const userLatRef     = useRef<number | null>(null);
  const userLonRef     = useRef<number | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const wsRef          = useRef<WebSocket | null>(null);
  const wsRetryRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef  = useRef(2000); // exponential backoff start: 2 s
  const mapRef         = useRef<MapView>(null);

  // Keep user coord refs current so WS/alert callbacks always see latest value
  useEffect(() => { userLatRef.current = userLatitude; },  [userLatitude]);
  useEffect(() => { userLonRef.current = userLongitude; }, [userLongitude]);

  // ── Live distance (derived, no extra polling) ─────────────────────────────
  const distanceToCarMetres = useMemo<number | null>(() => {
    if (userLatitude === null || userLongitude === null ||
        carLatitude  === null || carLongitude  === null) return null;
    return haversineDistance(userLatitude, userLongitude, carLatitude, carLongitude);
  }, [userLatitude, userLongitude, carLatitude, carLongitude]);

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    seedFromInflux();          // 1. load last known positions from InfluxDB
    startUserLocationWatch();  // 2. start GPS subscription
    connectWebSocket();        // 3. open WS for live server-push updates

    return () => {
      locationSubRef.current?.remove();
      wsRef.current?.close();
      if (wsRetryRef.current) clearTimeout(wsRetryRef.current);
    };
  }, []);

  // ── Step 1: seed both positions from InfluxDB via REST ───────────────────
  // This ensures InfluxDB is the source of truth on startup, not the device GPS.
  async function seedFromInflux() {
    try {
      // Car
      const carRes = await fetch(`${API_URL}/location`);
      if (carRes.ok) {
        const d = await carRes.json();
        if (isValidCoord(d.lat, d.lon)) {
          setCarLatitude(d.lat);
          setCarLongitude(d.lon);
          setCarTime(d.time ?? '---');
          prevCarLatRef.current = d.lat;
          prevCarLonRef.current = d.lon;
        }
      }
      // User
      const userRes = await fetch(`${API_URL}/user_location`);
      if (userRes.ok) {
        const d = await userRes.json();
        if (isValidCoord(d.lat, d.lon)) {
          setUserLatitude(d.lat);
          setUserLongitude(d.lon);
          setUserTime(d.time ?? '---');
        }
      }
    } catch {
      // Seed failure is non-fatal — GPS and WS will populate positions shortly
    }
  }

  // ── Step 2: GPS subscription — user position only ────────────────────────
  // GPS updates the local state AND pushes to backend (which writes to InfluxDB).
  // The WS broadcast from the backend then confirms the write back to all clients.
  async function startUserLocationWatch() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setLocationStatus('Brak zgody na lokalizację.');
      return;
    }
    setLocationStatus('Nasłuchuję lokalizacji użytkownika...');
    locationSubRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
      async (location) => {
        const lat = location.coords.latitude;
        const lon = location.coords.longitude;
        // Optimistically update UI immediately from GPS
        setUserLatitude(lat);
        setUserLongitude(lon);
        setLocationStatus('Lokalizacja użytkownika aktywna (GPS).');
        setRouteCoords([]);
        // Push to backend → InfluxDB → WS broadcast confirms write
        await sendUserLocation(lat, lon);
      }
    );
  }

  // ── Step 3: WebSocket — real-time push from server ────────────────────────
  // Handles BOTH device_type:"car" and device_type:"user" broadcasts.
  // This is the InfluxDB-confirmed position — it is superior to the GPS optimistic update.
  function connectWebSocket() {
    setWsStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      retryDelayRef.current = 2000; // reset backoff on successful connect
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          device_type: 'car' | 'user';
          lat: number;
          lon: number;
          time: string;
        };

        if (!isValidCoord(msg.lat, msg.lon)) return;

        if (msg.device_type === 'car') {
          handleCarUpdate(msg.lat, msg.lon, msg.time);
        } else if (msg.device_type === 'user') {
          // InfluxDB-confirmed user position — overrides GPS optimistic value
          setUserLatitude(msg.lat);
          setUserLongitude(msg.lon);
          setUserTime(msg.time);
          setLocationStatus('Lokalizacja użytkownika aktywna (InfluxDB).');
        }
      } catch {
        // Malformed message — ignore
      }
    };

    ws.onerror = () => {
      setWsStatus('error');
    };

    ws.onclose = () => {
      // Auto-reconnect with exponential backoff (cap at 30 s)
      const delay = Math.min(retryDelayRef.current, 30000);
      retryDelayRef.current = delay * 2;
      setWsStatus('reconnecting');
      wsRetryRef.current = setTimeout(connectWebSocket, delay);
    };
  }

  // ── Car update handler (called from WS message) ───────────────────────────
  function handleCarUpdate(newLat: number, newLon: number, time: string) {
    const prevLat = prevCarLatRef.current;
    const prevLon = prevCarLonRef.current;

    if (prevLat !== null && prevLon !== null) {
      const carMoved = haversineDistance(prevLat, prevLon, newLat, newLon) > 1;
      if (carMoved) {
        const uLat = userLatRef.current;
        const uLon = userLonRef.current;
        if (uLat !== null && uLon !== null &&
            haversineDistance(uLat, uLon, newLat, newLon) > 15) {
          Alert.alert(
            '⚠️ UWAGA', 'UWAGA, AUTO W RUCHU',
            [{ text: 'OK', style: 'destructive' }],
            { cancelable: false }
          );
        }
        setRouteCoords([]); // route is stale when car moves
      }
    }

    prevCarLatRef.current = newLat;
    prevCarLonRef.current = newLon;
    setCarLatitude(newLat);
    setCarLongitude(newLon);
    setCarTime(time);
  }

  // ── Send user position to backend → InfluxDB ─────────────────────────────
  async function sendUserLocation(latitude: number, longitude: number) {
    if (!API_KEY) { setSendStatus('Brak API key w konfiguracji aplikacji.'); return; }
    try {
      const res = await fetch(`${API_URL}/upload_user_position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ latitude, longitude }),
      });
      setSendStatus(res.ok
        ? 'Pozycja wysłana → InfluxDB.'
        : 'Nie udało się wysłać pozycji użytkownika.');
    } catch {
      setSendStatus('Błąd połączenia z backendem.');
    }
  }

  // ── Show route ────────────────────────────────────────────────────────────
  async function handleShowRoute() {
    if (userLatitude === null || userLongitude === null ||
        carLatitude  === null || carLongitude  === null) return;
    setIsLoadingRoute(true);
    try {
      setRouteCoords(await fetchOSRMRoute(
        userLatitude, userLongitude, carLatitude, carLongitude
      ));
    } catch {
      Alert.alert('Błąd', 'Nie udało się pobrać trasy. Sprawdź połączenie.');
    } finally {
      setIsLoadingRoute(false);
    }
  }

  // ── Map camera focus ──────────────────────────────────────────────────────
  function focusMap(lat: number, lon: number) {
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lon, latitudeDelta: 0.003, longitudeDelta: 0.003 },
      400
    );
  }

  function handleLogout() {
    locationSubRef.current?.remove();
    wsRef.current?.close();
    if (wsRetryRef.current) clearTimeout(wsRetryRef.current);
    router.replace('/');
  }

  const hasUserLocation = userLatitude !== null && userLongitude !== null;
  const hasCarLocation  = carLatitude  !== null && carLongitude  !== null;

  const mapRegion = hasCarLocation
    ? { latitude: carLatitude!, longitude: carLongitude!, latitudeDelta: 0.003, longitudeDelta: 0.003 }
    : hasUserLocation
    ? { latitude: userLatitude!, longitude: userLongitude!, latitudeDelta: 0.003, longitudeDelta: 0.003 }
    : { latitude: 52.2297, longitude: 21.0122, latitudeDelta: 0.01, longitudeDelta: 0.01 };

  const wsStatusLabel: Record<WsStatus, string> = {
    connecting:  '🔄 Łączenie z serwerem...',
    connected:   '🟢 Połączono (live)',
    reconnecting:'🟡 Ponowne łączenie...',
    error:       '🔴 Błąd WebSocket',
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>CarTracker</Text>
      <Text style={styles.subtitle}>Mapa użytkownika i auta</Text>
      <Text style={styles.wsStatus}>{wsStatusLabel[wsStatus]}</Text>

      <View style={styles.mapBox}>
        <MapView ref={mapRef} style={styles.map} region={mapRegion}>
          {hasUserLocation && (
            <Marker
              coordinate={{ latitude: userLatitude!, longitude: userLongitude! }}
              title="Ty"
              pinColor="blue"
            />
          )}
          {hasCarLocation && (
            <Marker
              coordinate={{ latitude: carLatitude!, longitude: carLongitude! }}
              title="Auto"
              pinColor="red"
            />
          )}
          {routeCoords.length > 0 && (
            <Polyline coordinates={routeCoords} strokeColor="#1d4ed8" strokeWidth={4} />
          )}
        </MapView>
      </View>

      {/* Route button */}
      <TouchableOpacity
        style={[
          styles.button, styles.routeButton,
          (!hasUserLocation || !hasCarLocation || isLoadingRoute) && styles.buttonDisabled,
        ]}
        onPress={handleShowRoute}
        disabled={!hasUserLocation || !hasCarLocation || isLoadingRoute}
      >
        <Text style={styles.buttonText}>
          {isLoadingRoute ? 'Pobieranie trasy...' : '🗺️ Pokaż trasę'}
        </Text>
      </TouchableOpacity>

      {/* Distance badge */}
      <View style={styles.distanceBox}>
        <Text style={styles.distanceLabel}>📍 Odległość od auta</Text>
        <Text style={[
          styles.distanceValue,
          distanceToCarMetres !== null && distanceToCarMetres <= 15 && styles.distanceNear,
        ]}>
          {distanceToCarMetres !== null ? formatDistance(distanceToCarMetres) : '---'}
        </Text>
      </View>

      {/* Focus buttons */}
      <View style={styles.focusRow}>
        <TouchableOpacity
          style={[styles.focusButton, styles.focusButtonCar, !hasCarLocation && styles.buttonDisabled]}
          onPress={() => hasCarLocation && focusMap(carLatitude!, carLongitude!)}
          disabled={!hasCarLocation}
        >
          <Text style={styles.focusButtonText}>🚗 Auto</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.focusButton, styles.focusButtonUser, !hasUserLocation && styles.buttonDisabled]}
          onPress={() => hasUserLocation && focusMap(userLatitude!, userLongitude!)}
          disabled={!hasUserLocation}
        >
          <Text style={styles.focusButtonText}>🧍 User</Text>
        </TouchableOpacity>
      </View>

      {/* User location box */}
      <View style={styles.locationBox}>
        <Text style={styles.boxTitle}>Twoja lokalizacja</Text>
        <Text style={styles.status}>{locationStatus}</Text>
        <Text style={styles.status}>{sendStatus}</Text>
        <Text style={styles.label}>Ostatnia aktualizacja (InfluxDB)</Text>
        <Text style={styles.value}>{userTime}</Text>
        <Text style={styles.label}>Latitude</Text>
        <Text style={styles.value}>{userLatitude  !== null ? userLatitude.toFixed(3)  : '---'}</Text>
        <Text style={styles.label}>Longitude</Text>
        <Text style={styles.value}>{userLongitude !== null ? userLongitude.toFixed(3) : '---'}</Text>
      </View>

      {/* Car location box */}
      <View style={styles.locationBox}>
        <Text style={styles.boxTitle}>Lokalizacja auta</Text>
        <Text style={styles.label}>Ostatnia aktualizacja (InfluxDB)</Text>
        <Text style={styles.value}>{carTime}</Text>
        <Text style={styles.label}>Latitude</Text>
        <Text style={styles.value}>{carLatitude  !== null ? carLatitude.toFixed(3)  : '---'}</Text>
        <Text style={styles.label}>Longitude</Text>
        <Text style={styles.value}>{carLongitude !== null ? carLongitude.toFixed(3) : '---'}</Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.buttonText}>Wyloguj</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: '#f3f4f6' },
  container:  { alignItems: 'center', padding: 16, paddingBottom: 32 },
  title:      { fontSize: 30, fontWeight: '800', color: '#111827', marginTop: 28, marginBottom: 4, textAlign: 'center' },
  subtitle:   { fontSize: 15, color: '#6b7280', marginBottom: 4, textAlign: 'center' },
  wsStatus:   { fontSize: 12, color: '#6b7280', marginBottom: 12, textAlign: 'center' },
  mapBox:     { width: '100%', maxWidth: 420, height: 260, borderRadius: 16, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#ffffff' },
  map:        { width: '100%', height: '100%' },
  distanceBox: {
    width: '100%', maxWidth: 420, backgroundColor: '#ffffff', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: '#d1d5db',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  distanceLabel: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
  distanceValue: { fontSize: 22, fontWeight: '800', color: '#111827' },
  distanceNear:  { color: '#16a34a' },
  focusRow: { width: '100%', maxWidth: 420, flexDirection: 'row', gap: 10, marginBottom: 10 },
  focusButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  focusButtonCar:  { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  focusButtonUser: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  focusButtonText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  locationBox: { width: '100%', maxWidth: 420, backgroundColor: '#ffffff', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#d1d5db' },
  boxTitle:   { fontSize: 16, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 8 },
  status:     { fontSize: 12, color: '#374151', marginBottom: 6, textAlign: 'center' },
  label:      { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 2 },
  value:      { fontSize: 14, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 8 },
  button:     { width: '100%', maxWidth: 420, backgroundColor: '#111827', padding: 14, borderRadius: 12, marginTop: 2, alignItems: 'center' },
  routeButton:  { backgroundColor: '#1d4ed8', marginBottom: 10 },
  logoutButton: { width: '100%', maxWidth: 420, backgroundColor: '#4b5563', padding: 14, borderRadius: 12, marginTop: 8, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
