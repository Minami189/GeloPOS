import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Platform, Alert } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { initDB } from './src/lib/database';

// Global Web Fallback for React Native Alerts
if (Platform.OS === 'web') {
  Alert.alert = (title, message, buttons) => {
    if (!buttons || buttons.length === 0 || (buttons.length === 1 && !buttons[0].onPress)) {
      window.alert(`${title}\n\n${message}`);
    } else {
      const confirmBtn = buttons.find(b => b.style === 'destructive' || b.text !== 'Cancel') || buttons[buttons.length - 1];
      const result = window.confirm(`${title}\n\n${message}`);
      if (result && confirmBtn && confirmBtn.onPress) {
        confirmBtn.onPress();
      }
    }
  };
}
import { AuthProvider } from './src/context/AuthContext';
import { SyncProvider } from './src/context/SyncContext';

export default function App() {
  const [dbReady, setDbReady] = React.useState(false);

  // Secondary PWA Guard
  const isStandalone = 
    window.matchMedia('(display-mode: standalone)').matches || 
    window.navigator.standalone ||
    (Platform.OS === 'web' && navigator.userAgent.includes('Electron'));

  if (Platform.OS === 'web' && !isStandalone) {
    return null; // The index.html gatekeeper handles the UI for this
  }

  useEffect(() => {
    const setup = async () => {
      await initDB();
      setDbReady(true);
    };
    setup();
  }, []);

  if (!dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0d1117' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <SyncProvider>
      <AuthProvider>
        <View style={styles.container}>
          <AppNavigator />
          <StatusBar style="light" />
        </View>
      </AuthProvider>
    </SyncProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
