import { router } from 'expo-router';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

const API_URL = 'http://85.215.210.57';
const WS_URL  = 'ws://85.215.210.57/ws';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
  }),
});

function isValidCoord(lat: number, lon: number): boolean {
  return !(lat === 0 && lon === 0);
}

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

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

async function fetchOSRMRoute(
  fromLat: number, fromLon: number,
  toLat: number,   toLon: number
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

async function registerForNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('car-alerts', {
      name:             'Car Alerts',
      importance:       Notifications.AndroidImportance.HIGH,
      sound:            'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function sendCarMovingNotification(distanceMetres: number) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚠️ UWAGA, AUTO W RUCHU',
      body:  `Auto poruszyło się. Odległość od Ciebie: ${formatDistance(distanceMetres)}.`,
      sound: 'default',
      data:  { type: 'car_moving' },
    },
    trigger: null,
  });
}

// ─── Collapsible location box ────────────────────────────────────────────────
type LocationBoxProps = {
  title:       string;
  latitude:    number | null;
  longitude:   number | null;
  lastUpdate:  string;
  statusLines: string[];   // extra status strings shown when expanded
};

function LocationBox({ title, latitude, longitude, lastUpdate, statusLines }: LocationBoxProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={styles.locationBox}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.85}
    >
      {/* ── Always-visible header ── */}
      <View style={styles.locationBoxHeader}>
        <Text style={styles.boxTitle}>{title}</Text>
        <Text style={styles.expandChevron}>{expanded ? '▲' : '▼'}</Text>
      </View>

      {/* ── Always-visible coords ── */}
      <View style={styles.coordRow}>
        <View style={styles.coordItem}>
          <Text style={styles.label}>Latitude</Text>
          <Text style={styles.value}>
            {latitude !== null ? latitude.toFixed(3) : '---'}
          </Text>
        </View>
        <View style={styles.coordDivider} />
        <View style={styles.coordItem}>
          <Text style={styles.label}>Longitude</Text>
          <Text style={styles.value}>
            {longitude !== null ? longitude.toFixed(3) : '---'}
          </Text>
        </View>
      </View>

      {/* ── Collapsible details ── */}
      {expanded && (
        <View style={styles.expandedSection}>
          <View style={styles.expandedDivider} />
          <Text style={styles.label}>Ostatnia aktualizacja InfluxDB</Text>
          <Text style={styles.value}>{lastUpdate}</Text>
          {statusLines.map((line, i) => (
            <Text key={i} style={styles.status}>{line}</Text>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

export default function Home() {
  const [userLatitude, setUserLatitude]   = useState<number | null>(null);
  const [userLongitude, setUserLongitude] = useState<number | null>(null);
  const [userTime, setUserTime]           = useState('---');

  const [carLatitude, setCarLatitude]   = useState<number | null>(null);
  const [carLongitude, setCarLongitude] = useState<number | null>(null);
  const [carTime, setCarTime]           = useState('---');

  const [routeCoords, setRouteCoords]       = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);

  const [locationStatus, setLocationStatus] = useState('Pobieram lokalizację użytkownika...');
  const [sendStatus, setSendStatus]         = useState('Pozycja użytkownika nie została jeszcze wysłana.');
  const [wsStatus, setWsStatus]             = useState<WsStatus>('connecting');

  const prevCarLatRef   = useRef<number | null>(null);
  const prevCarLonRef   = useRef<number | null>(null);
  const userLatRef      = useRef<number | null>(null);
  const userLonRef      = useRef<number | null>(null);
  const locationSubRef  = useRef<Location.LocationSubscription | null>(null);
  const wsRef           = useRef<WebSocket | null>(null);
  const wsRetryRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef   = useRef(2000);
  const mapRef          = useRef<MapView>(null);
  const notifEnabledRef = useRef(false);

  useEffect(() => { userLatRef.current = userLatitude; }, [userLatitude]);
  useEffect(() => { userLonRef.current = userLongitude; }, [userLongitude]);

  const distanceToCarMetres = useMemo<number | null>(() => {
    if (userLatitude === null || userLongitude === null ||
        carLatitude  === null || carLongitude  === null) return null;
    return haversineDistance(userLatitude, userLongitude, carLatitude, carLongitude);
  }, [userLatitude, userLongitude, carLatitude, carLongitude]);

  useEffect(() => {
    registerForNotifications().then((granted) => {
      notifEnabledRef.current = granted;
    });
    seedFromInflux();
    startUserLocationWatch();
    connectWebSocket();
    return () => {
      locationSubRef.current?.remove();
      wsRef.current?.close();
      if (wsRetryRef.current) clearTimeout(wsRetryRef.current);
    };
  }, []);

  async function seedFromInflux() {
    try {
      const carRes = await fetch(`${API_URL}/location`);
      if (carRes.ok) {
        const d = await carRes.json();
        if (isValidCoord(d.lat, d.lon)) {
          setCarLatitude(d.lat);  setCarLongitude(d.lon);
          setCarTime(d.time ?? '---');
          prevCarLatRef.current = d.lat;
          prevCarLonRef.current = d.lon;
        }
      }
      const userRes = await fetch(`${API_URL}/user_location`);
      if (userRes.ok) {
        const d = await userRes.json();
        if (isValidCoord(d.lat, d.lon)) {
          setUserLatitude(d.lat);  setUserLongitude(d.lon);
          setUserTime(d.time ?? '---');
        }
      }
    } catch { /* non-fatal */ }
  }

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
        setUserLatitude(lat);  setUserLongitude(lon);
        setLocationStatus('Lokalizacja użytkownika aktywna (GPS).');
        setRouteCoords([]);
        await sendUserLocation(lat, lon);
      }
    );
  }

  function connectWebSocket() {
    setWsStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus('connected');
      retryDelayRef.current = 2000;
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as {
          device_type: 'car' | 'user'; lat: number; lon: number; time: string;
        };
        if (!isValidCoord(msg.lat, msg.lon)) return;
        if (msg.device_type === 'car') {
          handleCarUpdate(msg.lat, msg.lon, msg.time);
        } else if (msg.device_type === 'user') {
          setUserLatitude(msg.lat);  setUserLongitude(msg.lon);
          setUserTime(msg.time);
          setLocationStatus('Lokalizacja użytkownika aktywna (InfluxDB).');
        }
      } catch { /* malformed */ }
    };
    ws.onerror = () => setWsStatus('error');
    ws.onclose = () => {
      const delay = Math.min(retryDelayRef.current, 30000);
      retryDelayRef.current = delay * 2;
      setWsStatus('reconnecting');
      wsRetryRef.current = setTimeout(connectWebSocket, delay);
    };
  }

  function handleCarUpdate(newLat: number, newLon: number, time: string) {
    const prevLat = prevCarLatRef.current;
    const prevLon = prevCarLonRef.current;
    if (prevLat !== null && prevLon !== null) {
      const carMoved = haversineDistance(prevLat, prevLon, newLat, newLon) > 1;
      if (carMoved) {
        const uLat = userLatRef.current;
        const uLon = userLonRef.current;
        if (uLat !== null && uLon !== null) {
          const dist = haversineDistance(uLat, uLon, newLat, newLon);
          if (dist > 15) {
            Alert.alert('⚠️ UWAGA', 'UWAGA, AUTO W RUCHU',
              [{ text: 'OK', style: 'destructive' }], { cancelable: false });
            if (notifEnabledRef.current) sendCarMovingNotification(dist);
          }
        }
        setRouteCoords([]);
      }
    }
    prevCarLatRef.current = newLat;
    prevCarLonRef.current = newLon;
    setCarLatitude(newLat);  setCarLongitude(newLon);  setCarTime(time);
  }

  async function sendUserLocation(latitude: number, longitude: number) {
    if (!API_KEY) { setSendStatus('Brak API key w konfiguracji aplikacji.'); return; }
    try {
      const res = await fetch(`${API_URL}/upload_user_position`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify({ latitude, longitude }),
      });
      setSendStatus(res.ok ? 'Pozycja wysłana → InfluxDB.' : 'Nie udało się wysłać pozycji użytkownika.');
    } catch {
      setSendStatus('Błąd połączenia z backendem.');
    }
  }

  async function handleShowRoute() {
    if (userLatitude === null || userLongitude === null ||
        carLatitude  === null || carLongitude  === null) return;
    setIsLoadingRoute(true);
    try {
      setRouteCoords(await fetchOSRMRoute(userLatitude, userLongitude, carLatitude, carLongitude));
    } catch {
      Alert.alert('Błąd', 'Nie udało się pobrać trasy. Sprawdź połączenie.');
    } finally {
      setIsLoadingRoute(false);
    }
  }

  function focusMap(lat: number, lon: number) {
    mapRef.current?.animateToRegion(
      { latitude: lat, longitude: lon, latitudeDelta: 0.003, longitudeDelta: 0.003 }, 400
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
    connecting:   '🔄 Łączenie z serwerem...',
    connected:    '🟢 Połączono — live',
    reconnecting: '🔁 Ponowne łączenie...',
    error:        '🔴 Błąd WebSocket',
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>CarTracker</Text>
      <Text style={styles.subtitle}>Mapa użytkownika i auta</Text>
      <Text style={styles.wsStatus}>{wsStatusLabel[wsStatus]}</Text>

      <View style={styles.mapBox}>
        <MapView ref={mapRef} style={styles.map} region={mapRegion}>
          {hasUserLocation && (
            <Marker coordinate={{ latitude: userLatitude!, longitude: userLongitude! }} title="Ty" pinColor="blue" />
          )}
          {hasCarLocation && (
            <Marker coordinate={{ latitude: carLatitude!, longitude: carLongitude! }} title="Auto" pinColor="red" />
          )}
          {routeCoords.length > 0 && (
            <Polyline coordinates={routeCoords} strokeColor="#1d4ed8" strokeWidth={4} />
          )}
        </MapView>
      </View>

      <TouchableOpacity
        style={[styles.button, styles.routeButton,
          (!hasUserLocation || !hasCarLocation || isLoadingRoute) && styles.buttonDisabled]}
        onPress={handleShowRoute}
        disabled={!hasUserLocation || !hasCarLocation || isLoadingRoute}
      >
        <Text style={styles.buttonText}>
          {isLoadingRoute ? 'Pobieranie trasy...' : '🗺️ Pokaż trasę'}
        </Text>
      </TouchableOpacity>

      <View style={styles.distanceBox}>
        <Text style={styles.distanceLabel}>📍 Odległość od auta</Text>
        <Text style={[styles.distanceValue,
          distanceToCarMetres !== null && distanceToCarMetres <= 15 && styles.distanceNear]}>
          {distanceToCarMetres !== null ? formatDistance(distanceToCarMetres) : '---'}
        </Text>
      </View>

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

      {/* ── Collapsible location boxes ──────────────────────────────────── */}
      <LocationBox
        title="Twoja lokalizacja"
        latitude={userLatitude}
        longitude={userLongitude}
        lastUpdate={userTime}
        statusLines={[locationStatus, sendStatus]}
      />

      <LocationBox
        title="Lokalizacja auta"
        latitude={carLatitude}
        longitude={carLongitude}
        lastUpdate={carTime}
        statusLines={[]}
      />

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

  // ── Distance badge ──────────────────────────────────────────────────────
  distanceBox: {
    width: '100%', maxWidth: 420, backgroundColor: '#ffffff', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: '#d1d5db',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  distanceLabel: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
  distanceValue: { fontSize: 22, fontWeight: '800', color: '#111827' },
  distanceNear:  { color: '#16a34a' },

  // ── Focus buttons ───────────────────────────────────────────────────────
  focusRow:        { width: '100%', maxWidth: 420, flexDirection: 'row', gap: 10, marginBottom: 10 },
  focusButton:     { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  focusButtonCar:  { backgroundColor: '#fef2f2', borderColor: '#fca5a5' },
  focusButtonUser: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  focusButtonText: { fontSize: 15, fontWeight: '700', color: '#111827' },

  // ── Collapsible location box ────────────────────────────────────────────
  locationBox: {
    width: '100%', maxWidth: 420, backgroundColor: '#ffffff',
    borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#d1d5db',
  },
  locationBoxHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
  },
  boxTitle:      { fontSize: 16, fontWeight: '800', color: '#111827' },
  expandChevron: { fontSize: 13, color: '#9ca3af' },
  coordRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  coordItem:    { flex: 1, alignItems: 'center' },
  coordDivider: { width: 1, height: 36, backgroundColor: '#e5e7eb', marginHorizontal: 8 },
  expandedSection: { marginTop: 10 },
  expandedDivider: { height: 1, backgroundColor: '#e5e7eb', marginBottom: 10 },

  // ── Shared text ─────────────────────────────────────────────────────────
  status: { fontSize: 12, color: '#374151', marginBottom: 4, textAlign: 'center' },
  label:  { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 2 },
  value:  { fontSize: 14, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 4 },

  // ── Buttons ─────────────────────────────────────────────────────────────
  button:         { width: '100%', maxWidth: 420, backgroundColor: '#111827', padding: 14, borderRadius: 12, marginTop: 2, alignItems: 'center' },
  routeButton:    { backgroundColor: '#1d4ed8', marginBottom: 10 },
  logoutButton:   { width: '100%', maxWidth: 420, backgroundColor: '#4b5563', padding: 14, borderRadius: 12, marginTop: 8, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText:     { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
