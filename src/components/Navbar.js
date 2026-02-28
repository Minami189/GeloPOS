import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LayoutGrid, ShoppingCart, ChefHat, Settings } from 'lucide-react-native';

export default function Navbar() {
    const navigation = useNavigation();

    return (
        <View style={styles.container}>
            <View style={styles.topIcons}>
                <TouchableOpacity style={styles.iconContainer} onPress={() => navigation.navigate('Admin')}>
                    <LayoutGrid color="#4b5563" size={28} />
                </TouchableOpacity>
            </View>

            <View style={styles.middleIcons}>
                <TouchableOpacity style={styles.iconContainer} onPress={() => navigation.navigate('POS')}>
                    <ShoppingCart color="#9ca3af" size={28} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.iconContainer} onPress={() => navigation.navigate('Kitchen')}>
                    <ChefHat color="#9ca3af" size={28} />
                </TouchableOpacity>
            </View>

            <View style={styles.bottomIcons}>
                <TouchableOpacity style={styles.iconContainer} onPress={() => navigation.navigate('Analytics')}>
                    <Settings color="#9ca3af" size={28} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 80,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        paddingVertical: 20,
        borderRightWidth: 1,
        borderColor: '#e5e7eb',
        elevation: 1,
        justifyContent: 'space-between',
        zIndex: 10
    },
    topIcons: {
        gap: 20,
        paddingTop: 10
    },
    middleIcons: {
        gap: 30,
        flex: 1,
        justifyContent: 'center'
    },
    bottomIcons: {
        paddingBottom: 20
    },
    iconContainer: {
        padding: 12,
        borderRadius: 12,
        backgroundColor: 'transparent'
    },
    iconContainerActive: {
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#fde047'
    }
});
