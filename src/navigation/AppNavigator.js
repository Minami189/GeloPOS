import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Navbar from '../components/Navbar';
import LoginScreen from '../screens/LoginScreen';
import { useAuth } from '../context/AuthContext';

import AdminScreen from '../screens/AdminScreen';
import POSScreen from '../screens/POSScreen';
import KitchenScreen from '../screens/KitchenScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();

function AppContent() {
    const { currentUser } = useAuth();

    // Not logged in — show full-screen login
    if (!currentUser) {
        return <LoginScreen />;
    }

    // Get the first permitted screen as the initial route
    const { permissions } = currentUser;
    let initialRoute = 'POS';
    if (permissions.pos) initialRoute = 'POS';
    else if (permissions.kitchen) initialRoute = 'Kitchen';
    else if (permissions.admin) initialRoute = 'Admin';
    else if (permissions.analytics) initialRoute = 'Analytics';
    else if (permissions.settings) initialRoute = 'Settings';

    return (
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#f3f4f6' }}>
            <Navbar />
            <View style={{ flex: 1 }}>
                <Stack.Navigator
                    initialRouteName={initialRoute}
                    screenOptions={{ headerShown: false, animation: 'none' }}
                >
                    {permissions.pos && <Stack.Screen name="POS" component={POSScreen} />}
                    {permissions.kitchen && <Stack.Screen name="Kitchen" component={KitchenScreen} />}
                    {permissions.admin && <Stack.Screen name="Admin" component={AdminScreen} />}
                    {permissions.analytics && <Stack.Screen name="Analytics" component={AnalyticsScreen} />}
                    {permissions.settings && <Stack.Screen name="Settings" component={SettingsScreen} />}
                </Stack.Navigator>
            </View>
        </View>
    );
}

export default function AppNavigator() {
    return (
        <NavigationContainer>
            <AppContent />
        </NavigationContainer>
    );
}
