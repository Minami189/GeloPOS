import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Download } from 'lucide-react-native';
import InventoryTab from '../components/admin/InventoryTab';
import { useAuth } from '../context/AuthContext';
import { exportInventoryToCSV } from '../lib/exportUtils';
import { getDBConnection } from '../lib/database';

export default function InventoryScreen() {
    const { currentUser } = useAuth();
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        const db = await getDBConnection();
        const unsynced = await db.getAllAsync("SELECT id FROM ingredients WHERE synced = 0");
        if (unsynced && unsynced.length > 0) {
            Alert.alert("Action Required", `You have ${unsynced.length} unsynced ingredient update(s) locally. Please press Sync on the Admin panel before exporting data from Supabase.`);
            return;
        }

        setIsExporting(true);
        await exportInventoryToCSV();
        setIsExporting(false);
    };

    const canExport = currentUser && (currentUser.permissions?.inventory);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Inventory</Text>
                {canExport && (
                    <TouchableOpacity 
                        style={styles.exportBtn} 
                        onPress={handleExport}
                        disabled={isExporting}
                    >
                        {isExporting ? <ActivityIndicator color="#10b981" size="small" /> : <Download color="#10b981" size={20} />}
                        <Text style={styles.exportBtnText}>{isExporting ? 'Exporting...' : 'Export Inventory'}</Text>
                    </TouchableOpacity>
                )}
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
    },
    exportBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ecfdf5',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 12,
        gap: 8,
    },
    exportBtnText: {
        color: '#10b981',
        fontWeight: 'bold',
        fontSize: 14,
    }
});
