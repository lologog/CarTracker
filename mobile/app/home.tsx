import { router } from 'expo-router';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

const API_URL = 'http://85.215.210.57';
const WS_URL  = 'ws://85.215.210.57/ws';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY;

// ─── Expo Go detection ────────────────────────────────────────────────────────
const IS_EXPO_GO =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === 'storeClient';

type NotificationsModule = typeof import('expo-notifications');
let Notifications: NotificationsModule | null = null;

if (!IS_EXPO_GO) {
  try {
    Notifications = require('expo-notifications') as NotificationsModule;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge:  false,
      }),
    });
  } catch { /* skip */ }
}

// ─── Notification helpers ─────────────────────────────────────────────────────
async function registerForNotifications(): Promise<boolean> {
  if (!Notifications) return false;
  try {
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
  } catch { return false; }
}

async function sendCarMovingNotification(distanceMetres: number): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ UWAGA, AUTO W RUCHU',
        body:  `Auto poruszyło się. Odległość od Ciebie: ${formatDistance(distanceMetres)}.`,
        sound: 'default',
        data:  { type: 'car_moving' },
      },
      trigger: null,
    });
  } catch { /* skip */ }
}

async function sendParkingExpiredNotification(): Promise<void> {
  // Works in dev builds; falls back to Alert in Expo Go
  if (Notifications) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🅿️ Czas parkowania minął!',
          body:  'Twój czas parkowania dobiegł końca.',
          sound: 'default',
          data:  { type: 'parking_expired' },
        },
        trigger: null,
      });
      return;
    } catch { /* fall through to Alert */ }
  }
  Alert.alert('🅿️ Czas parkowania minął!', 'Twój czas parkowania dobiegł końca.');
}

// ─── Utilities ────────────────────────────────────────────────────────────────
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

/** Format seconds → MM:SS */
function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const LIGHT = {
  bg:         '#f3f4f6',
  surface:    '#ffffff',
  border:     '#d1d5db',
  divider:    '#e5e7eb',
  text:       '#111827',
  textMuted:  '#6b7280',
  textFaint:  '#9ca3af',
  textStatus: '#374151',
  inputBg:    '#f9fafb',
  mapStyle:   [] as object[],
};
const DARK = {
  bg:         '#0f172a',
  surface:    '#1e293b',
  border:     '#334155',
  divider:    '#334155',
  text:       '#f1f5f9',
  textMuted:  '#94a3b8',
  textFaint:  '#64748b',
  textStatus: '#cbd5e1',
  inputBg:    '#0f172a',
  mapStyle: [
    { elementType: 'geometry',           stylers: [{ color: '#1e293b' }] },
    { elementType: 'labels.text.fill',   stylers: [{ color: '#94a3b8' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
    { featureType: 'road',    elementType: 'geometry',        stylers: [{ color: '#334155' }] },
    { featureType: 'road',    elementType: 'geometry.stroke', stylers: [{ color: '#0f172a' }] },
    { featureType: 'water',   elementType: 'geometry',        stylers: [{ color: '#0f172a' }] },
    { featureType: 'poi',     elementType: 'geometry',        stylers: [{ color: '#1e293b' }] },
    { featureType: 'transit', elementType: 'geometry',        stylers: [{ color: '#1e293b' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#334155' }] },
    { featureType: 'landscape',      elementType: 'geometry', stylers: [{ color: '#172033' }] },
  ],
};
type Theme = typeof LIGHT;

// ─── Icons ────────────────────────────────────────────────────────────────────
function SunIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      {[0,45,90,135,180,225,270,315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <View key={deg} style={{
            position: 'absolute', width: 3, height: 3, borderRadius: 1.5,
            backgroundColor: color,
            left: 11 + Math.round(Math.cos(rad) * 9) - 1.5,
            top:  11 + Math.round(Math.sin(rad) * 9) - 1.5,
          }} />
        );
      })}
    </View>
  );
}

function MoonIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 16, color, lineHeight: 22 }}>☽</Text>
    </View>
  );
}

function ExpandIcon({ expanded, color }: { expanded: boolean; color: string }) {
  return (
    <Text style={{ fontSize: 15, color, lineHeight: 20 }}>{expanded ? '⤡' : '⤢'}</Text>
  );
}

// ─── Shared MapView content ───────────────────────────────────────────────────
type MapContentProps = {
  mapRef:      React.RefObject<MapView>;
  mapRegion:   object;
  mapStyle:    object[];
  hasUser:     boolean;
  userLat:     number | null;
  userLon:     number | null;
  hasCar:      boolean;
  carLat:      number | null;
  carLon:      number | null;
  routeCoords: Array<{ latitude: number; longitude: number }>;
};

function MapContent({
  mapRef, mapRegion, mapStyle,
  hasUser, userLat, userLon,
  hasCar,  carLat,  carLon,
  routeCoords,
}: MapContentProps) {
  return (
    <MapView
      ref={mapRef}
      style={{ width: '100%', height: '100%' }}
      region={mapRegion as any}
      customMapStyle={mapStyle}
    >
      {hasUser && userLat !== null && userLon !== null && (
        <Marker coordinate={{ latitude: userLat, longitude: userLon }} title="Ty" pinColor="blue" />
      )}
      {hasCar && carLat !== null && carLon !== null && (
        <Marker coordinate={{ latitude: carLat, longitude: carLon }} title="Auto" pinColor="red" />
      )}
      {routeCoords.length > 0 && (
        <Polyline coordinates={routeCoords} strokeColor="#1d4ed8" strokeWidth={4} />
      )}
    </MapView>
  );
}

// ─── Collapsible location box ─────────────────────────────────────────────────
type LocationBoxProps = {
  title:       string;
  latitude:    number | null;
  longitude:   number | null;
  lastUpdate:  string;
  statusLines: string[];
  theme:       Theme;
};

function LocationBox({ title, latitude, longitude, lastUpdate, statusLines, theme: t }: LocationBoxProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      style={{ width: '100%', maxWidth: 420, backgroundColor: t.surface, borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: t.border }}
      onPress={() => setExpanded((v) => !v)}
      activeOpacity={0.85}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>{title}</Text>
        <Text style={{ fontSize: 13, color: t.textFaint }}>{expanded ? '▲' : '▼'}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: t.textMuted, textAlign: 'center', marginBottom: 2 }}>Latitude</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.text, textAlign: 'center' }}>
            {latitude !== null ? latitude.toFixed(3) : '---'}
          </Text>
        </View>
        <View style={{ width: 1, height: 36, backgroundColor: t.divider, marginHorizontal: 8 }} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: t.textMuted, textAlign: 'center', marginBottom: 2 }}>Longitude</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.text, textAlign: 'center' }}>
            {longitude !== null ? longitude.toFixed(3) : '---'}
          </Text>
        </View>
      </View>
      {expanded && (
        <View style={{ marginTop: 10 }}>
          <View style={{ height: 1, backgroundColor: t.divider, marginBottom: 10 }} />
          <Text style={{ fontSize: 13, color: t.textMuted, textAlign: 'center', marginBottom: 2 }}>Ostatnia aktualizacja InfluxDB</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.text, textAlign: 'center', marginBottom: 4 }}>{lastUpdate}</Text>
          {statusLines.map((line, i) => (
            <Text key={i} style={{ fontSize: 12, color: t.textStatus, marginBottom: 4, textAlign: 'center' }}>{line}</Text>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Parking Timer component ──────────────────────────────────────────────────
type ParkingTimerProps = { theme: Theme };

type TimerState = 'idle' | 'running' | 'expired';

function ParkingTimer({ theme: t }: ParkingTimerProps) {
  const [expanded,      setExpanded]      = useState(false);
  const [inputMinutes,  setInputMinutes]  = useState('30');
  const [inputSeconds,  setInputSeconds]  = useState('00');
  const [timerState,    setTimerState]    = useState<TimerState>('idle');
  const [remaining,     setRemaining]     = useState(0);   // seconds left
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function startTimer() {
    const mins = Math.max(0, parseInt(inputMinutes || '0', 10));
    const secs = Math.max(0, Math.min(59, parseInt(inputSeconds || '0', 10)));
    const total = mins * 60 + secs;
    if (total <= 0) return;

    clearTimer();
    setRemaining(total);
    setTimerState('running');

    let left = total;
    intervalRef.current = setInterval(() => {
      left -= 1;
      setRemaining(left);
      if (left <= 0) {
        clearTimer();
        setTimerState('expired');
        sendParkingExpiredNotification();
      }
    }, 1000);
  }

  function stopTimer() {
    clearTimer();
    setTimerState('idle');
    setRemaining(0);
  }

  // Cleanup on unmount
  useEffect(() => () => clearTimer(), []);

  // Colour of the countdown ring / text
  const urgentColor =
    timerState === 'expired' ? '#dc2626' :
    timerState === 'running' && remaining <= 60 ? '#f59e0b' :
    '#16a34a';

  // Progress arc: fraction of total already elapsed (for visual ring)
  const totalSecs = (parseInt(inputMinutes || '0', 10) * 60) + parseInt(inputSeconds || '0', 10);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setExpanded((v) => !v)}
      style={{
        width: '100%', maxWidth: 420,
        backgroundColor: t.surface,
        borderRadius: 12, padding: 14, marginBottom: 10,
        borderWidth: 1, borderColor: t.border,
      }}
    >
      {/* ── Header row ───────────────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 18 }}>🅿️</Text>
          <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>Czas parkowania</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Running pill */}
          {timerState === 'running' && (
            <View style={{ backgroundColor: '#16a34a22', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#16a34a' }}>
                {formatCountdown(remaining)}
              </Text>
            </View>
          )}
          {timerState === 'expired' && (
            <View style={{ backgroundColor: '#dc262622', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#dc2626' }}>MINĄŁ!</Text>
            </View>
          )}
          <Text style={{ fontSize: 13, color: t.textFaint }}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </View>

      {/* ── Expanded body ─────────────────────────────────────────────────── */}
      {expanded && (
        <View style={{ marginTop: 14 }}>
          <View style={{ height: 1, backgroundColor: t.divider, marginBottom: 14 }} />

          {/* Big countdown display */}
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <Text style={{
              fontSize: 56, fontWeight: '800', letterSpacing: 2,
              color: timerState === 'idle' ? t.textFaint : urgentColor,
              fontVariant: ['tabular-nums'],
            }}>
              {timerState === 'idle'
                ? `${inputMinutes.padStart(2,'0')}:${inputSeconds.padStart(2,'0')}`
                : formatCountdown(remaining)}
            </Text>
            <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
              {timerState === 'idle'    ? 'ustaw czas i naciśnij START' :
               timerState === 'running' ? 'odliczanie trwa…' :
               'czas parkowania dobiegł końca'}
            </Text>
          </View>

          {/* Input row — only visible when idle */}
          {timerState === 'idle' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>minuty</Text>
                <TextInput
                  style={{
                    width: 72, height: 44, borderRadius: 10, textAlign: 'center',
                    fontSize: 22, fontWeight: '700', color: t.text,
                    backgroundColor: t.inputBg, borderWidth: 1, borderColor: t.border,
                  }}
                  keyboardType="number-pad"
                  maxLength={3}
                  value={inputMinutes}
                  onChangeText={(v) => setInputMinutes(v.replace(/[^0-9]/g, ''))}
                  selectTextOnFocus
                />
              </View>
              <Text style={{ fontSize: 28, fontWeight: '800', color: t.textMuted, marginTop: 18 }}>:</Text>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>sekundy</Text>
                <TextInput
                  style={{
                    width: 72, height: 44, borderRadius: 10, textAlign: 'center',
                    fontSize: 22, fontWeight: '700', color: t.text,
                    backgroundColor: t.inputBg, borderWidth: 1, borderColor: t.border,
                  }}
                  keyboardType="number-pad"
                  maxLength={2}
                  value={inputSeconds}
                  onChangeText={(v) => {
                    const n = parseInt(v.replace(/[^0-9]/g, '') || '0', 10);
                    setInputSeconds(String(Math.min(59, n)));
                  }}
                  selectTextOnFocus
                />
              </View>
            </View>
          )}

          {/* Quick presets */}
          {timerState === 'idle' && (
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, justifyContent: 'center' }}>
              {[15, 30, 60, 90, 120].map((min) => (
                <TouchableOpacity
                  key={min}
                  onPress={() => { setInputMinutes(String(min)); setInputSeconds('00'); }}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                    backgroundColor: inputMinutes === String(min) && inputSeconds === '00'
                      ? '#1d4ed8' : t.inputBg,
                    borderWidth: 1, borderColor: t.border,
                  }}
                >
                  <Text style={{
                    fontSize: 12, fontWeight: '700',
                    color: inputMinutes === String(min) && inputSeconds === '00' ? '#fff' : t.textMuted,
                  }}>
                    {min < 60 ? `${min}m` : `${min/60}h`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(timerState === 'idle' || timerState === 'expired') && (
              <TouchableOpacity
                onPress={startTimer}
                style={{
                  flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
                  backgroundColor: '#16a34a',
                  opacity: (parseInt(inputMinutes||'0',10)*60 + parseInt(inputSeconds||'0',10)) <= 0 ? 0.5 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
                  {timerState === 'expired' ? '🔄 Nowy timer' : '▶ START'}
                </Text>
              </TouchableOpacity>
            )}
            {timerState === 'running' && (
              <TouchableOpacity
                onPress={stopTimer}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#dc2626' }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>⏹ STOP</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
type WsStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

export default function Home() {
  const systemScheme = useColorScheme();
  const [isDark,      setIsDark]      = useState(systemScheme === 'dark');
  const [mapExpanded, setMapExpanded] = useState(false);
  const theme = isDark ? DARK : LIGHT;

  const [userLatitude,  setUserLatitude]  = useState<number | null>(null);
  const [userLongitude, setUserLongitude] = useState<number | null>(null);
  const [userTime,      setUserTime]      = useState('---');

  const [carLatitude,   setCarLatitude]   = useState<number | null>(null);
  const [carLongitude,  setCarLongitude]  = useState<number | null>(null);
  const [carTime,       setCarTime]       = useState('---');

  const [routeCoords,    setRouteCoords]    = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [locationStatus, setLocationStatus] = useState('Pobieram lokalizację użytkownika...');
  const [sendStatus,     setSendStatus]     = useState('Pozycja użytkownika nie została jeszcze wysłana.');
  const [wsStatus,       setWsStatus]       = useState<WsStatus>('connecting');

  const prevCarLatRef   = useRef<number | null>(null);
  const prevCarLonRef   = useRef<number | null>(null);
  const userLatRef      = useRef<number | null>(null);
  const userLonRef      = useRef<number | null>(null);
  const locationSubRef  = useRef<Location.LocationSubscription | null>(null);
  const wsRef           = useRef<WebSocket | null>(null);
  const wsRetryRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelayRef   = useRef(2000);
  const mapRef          = useRef<MapView>(null);
  const fullMapRef      = useRef<MapView>(null);
  const notifEnabledRef = useRef(false);

  useEffect(() => { userLatRef.current = userLatitude;  }, [userLatitude]);
  useEffect(() => { userLonRef.current = userLongitude; }, [userLongitude]);

  const distanceToCarMetres = useMemo<number | null>(() => {
    if (userLatitude === null || userLongitude === null ||
        carLatitude  === null || carLongitude  === null) return null;
    return haversineDistance(userLatitude, userLongitude, carLatitude, carLongitude);
  }, [userLatitude, userLongitude, carLatitude, carLongitude]);

  useEffect(() => {
    registerForNotifications().then((granted) => { notifEnabledRef.current = granted; });
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
    ws.onopen = () => { setWsStatus('connected'); retryDelayRef.current = 2000; };
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
    } catch { setSendStatus('Błąd połączenia z backendem.'); }
  }

  async function handleShowRoute() {
    if (userLatitude === null || userLongitude === null ||
        carLatitude  === null || carLongitude  === null) return;
    setIsLoadingRoute(true);
    try {
      setRouteCoords(await fetchOSRMRoute(userLatitude, userLongitude, carLatitude, carLongitude));
    } catch {
      Alert.alert('Błąd', 'Nie udało się pobrać trasy. Sprawdź połączenie.');
    } finally { setIsLoadingRoute(false); }
  }

  function focusMap(lat: number, lon: number) {
    const region = { latitude: lat, longitude: lon, latitudeDelta: 0.003, longitudeDelta: 0.003 };
    mapRef.current?.animateToRegion(region, 400);
    fullMapRef.current?.animateToRegion(region, 400);
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

  const t = theme;
  const mapContentProps: MapContentProps = {
    mapRegion, mapStyle: t.mapStyle,
    hasUser: hasUserLocation, userLat: userLatitude, userLon: userLongitude,
    hasCar:  hasCarLocation,  carLat:  carLatitude,  carLon:  carLongitude,
    routeCoords,
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={t.bg} />

      {/* ── Theme toggle — fixed top-left ─────────────────────────────────── */}
      <TouchableOpacity
        onPress={() => setIsDark((v) => !v)}
        style={{
          position: 'absolute', top: 52, left: 16, zIndex: 10,
          width: 40, height: 40, borderRadius: 20,
          backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 }, elevation: 4,
        }}
        accessibilityLabel={isDark ? 'Przełącz na tryb jasny' : 'Przełącz na tryb ciemny'}
      >
        {isDark ? <SunIcon color={t.text} /> : <MoonIcon color={t.text} />}
      </TouchableOpacity>

      {/* ── Fullscreen map Modal ──────────────────────────────────────────── */}
      <Modal
        visible={mapExpanded}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setMapExpanded(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <MapContent mapRef={fullMapRef} {...mapContentProps} />
          <TouchableOpacity
            onPress={() => setMapExpanded(false)}
            style={{
              position: 'absolute', top: 52, right: 16,
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: 'rgba(0,0,0,0.55)',
              alignItems: 'center', justifyContent: 'center',
            }}
            accessibilityLabel="Zamknij pełny ekran"
          >
            <ExpandIcon expanded color="#ffffff" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Main scroll content ───────────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'center', padding: 16, paddingBottom: 32 }}
      >
        <Text style={{ fontSize: 30, fontWeight: '800', color: t.text, marginTop: 28, marginBottom: 4, textAlign: 'center' }}>
          CarTracker
        </Text>
        <Text style={{ fontSize: 15, color: t.textMuted, marginBottom: 4, textAlign: 'center' }}>
          Mapa użytkownika i auta
        </Text>
        <Text style={{ fontSize: 12, color: t.textMuted, marginBottom: 12, textAlign: 'center' }}>
          {wsStatusLabel[wsStatus]}
        </Text>

        {/* ── Inline map ─────────────────────────────────────────────────── */}
        <View style={{
          width: '100%', maxWidth: 420, height: 260, borderRadius: 16,
          overflow: 'hidden', marginBottom: 12,
          borderWidth: 1, borderColor: t.border, backgroundColor: t.surface,
        }}>
          <MapContent mapRef={mapRef} {...mapContentProps} />
          <TouchableOpacity
            onPress={() => setMapExpanded(true)}
            style={{
              position: 'absolute', bottom: 10, right: 10,
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: 'rgba(0,0,0,0.45)',
              alignItems: 'center', justifyContent: 'center',
            }}
            accessibilityLabel="Rozwiń mapę na cały ekran"
          >
            <ExpandIcon expanded={false} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* ── Route button ─────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[
            { width: '100%', maxWidth: 420, backgroundColor: '#1d4ed8', padding: 14, borderRadius: 12, marginBottom: 10, alignItems: 'center' },
            (!hasUserLocation || !hasCarLocation || isLoadingRoute) && { opacity: 0.6 },
          ]}
          onPress={handleShowRoute}
          disabled={!hasUserLocation || !hasCarLocation || isLoadingRoute}
        >
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>
            {isLoadingRoute ? 'Pobieranie trasy...' : '🗺️ Pokaż trasę'}
          </Text>
        </TouchableOpacity>

        {/* ── Distance badge ────────────────────────────────────────────── */}
        <View style={{
          width: '100%', maxWidth: 420, backgroundColor: t.surface, borderRadius: 12,
          paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8,
          borderWidth: 1, borderColor: t.border,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Text style={{ fontSize: 14, color: t.textMuted, fontWeight: '600' }}>📍 Odległość od auta</Text>
          <Text style={{
            fontSize: 22, fontWeight: '800',
            color: distanceToCarMetres !== null && distanceToCarMetres <= 15 ? '#16a34a' : t.text,
          }}>
            {distanceToCarMetres !== null ? formatDistance(distanceToCarMetres) : '---'}
          </Text>
        </View>

        {/* ── Focus buttons ─────────────────────────────────────────────── */}
        <View style={{ width: '100%', maxWidth: 420, flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <TouchableOpacity
            style={[
              { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1,
                backgroundColor: isDark ? '#1e2d3d' : '#fef2f2',
                borderColor:     isDark ? '#4a3030' : '#fca5a5' },
              !hasCarLocation && { opacity: 0.6 },
            ]}
            onPress={() => hasCarLocation && focusMap(carLatitude!, carLongitude!)}
            disabled={!hasCarLocation}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>🚗 Auto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1,
                backgroundColor: isDark ? '#1a2a3d' : '#eff6ff',
                borderColor:     isDark ? '#2d4a6e' : '#93c5fd' },
              !hasUserLocation && { opacity: 0.6 },
            ]}
            onPress={() => hasUserLocation && focusMap(userLatitude!, userLongitude!)}
            disabled={!hasUserLocation}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>🧍 User</Text>
          </TouchableOpacity>
        </View>

        {/* ── Parking timer ─────────────────────────────────────────────── */}
        <ParkingTimer theme={theme} />

        {/* ── Location boxes ────────────────────────────────────────────── */}
        <LocationBox
          title="Twoja lokalizacja"
          latitude={userLatitude}   longitude={userLongitude}
          lastUpdate={userTime}     statusLines={[locationStatus, sendStatus]}
          theme={theme}
        />
        <LocationBox
          title="Lokalizacja auta"
          latitude={carLatitude}    longitude={carLongitude}
          lastUpdate={carTime}      statusLines={[]}
          theme={theme}
        />

        {/* ── Logout ────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={{ width: '100%', maxWidth: 420, backgroundColor: '#4b5563', padding: 14, borderRadius: 12, marginTop: 8, alignItems: 'center' }}
          onPress={handleLogout}
        >
          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>Wyloguj</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
