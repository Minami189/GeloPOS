import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Navbar from '../components/Navbar';

import AdminScreen from '../screens/AdminScreen';
import POSScreen from '../screens/POSScreen';
import KitchenScreen from '../screens/KitchenScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';

const Stack = createNativeStackNavigator();

function AppContent() {
    return (
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#f3f4f6' }}>
            <Navbar />
            <View style={{ flex: 1 }}>
                <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
                    <Stack.Screen name="Admin" component={AdminScreen} />
                    <Stack.Screen name="POS" component={POSScreen} />
                    <Stack.Screen name="Kitchen" component={KitchenScreen} />
                    <Stack.Screen name="Analytics" component={AnalyticsScreen} />
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
