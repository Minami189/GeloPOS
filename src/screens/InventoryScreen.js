import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import InventoryTab from '../components/admin/InventoryTab';

export default function InventoryScreen() {
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Inventory</Text>
            </View>
            <View style={styles.contentContainer}>
                <InventoryTab />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 40, backgroundColor: '#f3f4f6' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
    headerTitle: { fontSize: 32, fontWeight: 'bold', color: '#1f2937' },
    contentContainer: {
        flex: 1,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 30,
        elevation: 2
    }
});
