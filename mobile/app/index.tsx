import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const API_URL = 'http://85.215.210.57';

export default function Index() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin() {
    if (!login.trim()) {
      Alert.alert('Brak loginu', 'Wpisz login.');
      return;
    }

    if (!password.trim()) {
      Alert.alert('Brak hasła', 'Wpisz hasło.');
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: login.trim(),
          password: password,
        }),
      });

      if (!response.ok) {
        Alert.alert('Błąd logowania', 'Nieprawidłowy login lub hasło.');
        return;
      }

      router.push('/home');
    } catch (error) {
      Alert.alert('Błąd połączenia', 'Nie udało się połączyć z serwerem.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CarTracker</Text>
      <Text style={styles.subtitle}>Zaloguj się do aplikacji</Text>

      <TextInput
        style={styles.input}
        placeholder="Login"
        value={login}
        onChangeText={setLogin}
        autoCapitalize="none"
        textAlign="center"
      />

      <TextInput
        style={styles.input}
        placeholder="Hasło"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textAlign="center"
      />

      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={isLoading}
      >
        <Text style={styles.buttonText}>
          {isLoading ? 'Logowanie...' : 'Zaloguj'}
        </Text>
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
    fontSize: 36,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 28,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    fontSize: 16,
    backgroundColor: '#ffffff',
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
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});