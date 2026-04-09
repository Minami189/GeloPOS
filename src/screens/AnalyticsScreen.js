import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { BarChart2, Sparkles, ClipboardList, History } from 'lucide-react-native';
import SalesTab from '../components/analytics/SalesTab';
import ItemsSoldTab from '../components/analytics/ItemsSoldTab';
import TodayTransactionsTab from '../components/analytics/TodayTransactionsTab';
import AITab from '../components/analytics/AITab';
import { Download, X, Calendar } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { getDBConnection } from '../lib/database';
import { exportSalesToCSV } from '../lib/exportUtils';
import { ActivityIndicator, Modal, TextInput, Alert } from 'react-native';

const TABS = [
    { id: 'sales', label: 'Sales (Today)', icon: BarChart2 },
    { id: 'itemsSold', label: 'Items Sold', icon: ClipboardList },
    { id: 'transactions', label: 'Today\'s Transactions', icon: History },
    { id: 'ai', label: 'AI Recommendations', icon: Sparkles },
];

export default function AnalyticsScreen() {
    const [activeTab, setActiveTab] = useState('sales');
    const { currentUser } = useAuth();
    const [isExporting, setIsExporting] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    
    const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

    const handleOpenExport = async () => {
        const db = await getDBConnection();
        const unsynced = await db.getAllAsync('SELECT id FROM orders WHERE synced = 0');
        if (unsynced && unsynced.length > 0) {
            Alert.alert("Action Required", `You have ${unsynced.length} unsynced order(s) locally. Please press Sync on the Admin panel before exporting data from Supabase.`);
            return;
        }
        setShowExportModal(true);
    };

    const handleExport = async (mode) => {
        setShowExportModal(false);
        setIsExporting(true);
        const start = startDate || '2000-01-01';
        const end = endDate || '2099-12-31';
        await exportSalesToCSV(mode, start, end);
        setIsExporting(false);
    };

    const canExport = currentUser && (currentUser.role === 'admin' || currentUser.permissions?.analytics);

    return (
        <View style={styles.container}>
            {/* Export Selection Modal */}
            <Modal visible={showExportModal} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Export Sales Data</Text>
                            <TouchableOpacity onPress={() => setShowExportModal(false)}>
                                <X color="#6b7280" size={24} />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.modalSubtitle}>Disclaimer: This data is sourced directly from your global Supabase cloud server.</Text>
                        
                        <View style={{ marginBottom: 20 }}>
                            <Text style={styles.label}>Start Date (YYYY-MM-DD)</Text>
                            <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="2026-04-01" />
                            <Text style={[styles.label, {marginTop: 10}]}>End Date (YYYY-MM-DD)</Text>
                            <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="2026-04-30" />
                        </View>

                        <TouchableOpacity style={styles.modalBtn} onPress={() => handleExport('orders')}>
                            <Text style={styles.modalBtnTitle}>Orders Table</Text>
                            <Text style={styles.modalBtnDesc}>Totals, cash, and discounts</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.modalBtn} onPress={() => handleExport('items')}>
                            <Text style={styles.modalBtnTitle}>Order Items Table</Text>
                            <Text style={styles.modalBtnDesc}>Individual items and variants</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.modalBtn, {backgroundColor: '#10b981', marginBottom: 0}]} onPress={() => handleExport('both')}>
                            <Text style={[styles.modalBtnTitle, {color: '#fff'}]}>Both</Text>
                            <Text style={[styles.modalBtnDesc, {color: '#ecfdf5'}]}>Download both tables simultaneously</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <View style={styles.header}>
                <Text style={styles.headerTitle}>Analytics</Text>
                {canExport && (
                    <TouchableOpacity 
                        style={styles.exportBtn} 
                        onPress={handleOpenExport}
                        disabled={isExporting}
                    >
                        {isExporting ? <ActivityIndicator color="#10b981" size="small" /> : <Download color="#10b981" size={20} />}
                        <Text style={styles.exportBtnText}>{isExporting ? 'Exporting...' : 'Export Sales'}</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.tabBar}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, gap: 4 }}>
                    {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <TouchableOpacity
                            key={tab.id}
                            style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                            onPress={() => setActiveTab(tab.id)}
                        >
                            <Icon size={18} color={isActive ? '#10b981' : '#9ca3af'} />
                            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    );
                    })}
                </ScrollView>
            </View>

            <View style={styles.content}>
                {activeTab === 'sales' && <SalesTab />}
                {activeTab === 'itemsSold' && <ItemsSoldTab />}
                {activeTab === 'transactions' && <TodayTransactionsTab />}
                {activeTab === 'ai' && <AITab />}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f3f4f6', padding: 32 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    headerTitle: { fontSize: 30, fontWeight: '800', color: '#1f2937' },
    tabBar: {
        flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16,
        padding: 6, marginBottom: 24, gap: 4, elevation: 2,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 4,
    },
    tabBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 8,
        borderRadius: 12, gap: 8,
    },
    tabBtnActive: { backgroundColor: '#ecfdf5' },
    tabLabel: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
    tabLabelActive: { color: '#10b981', fontWeight: '700' },
    content: {
        flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 28,
        elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 6,
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
    },
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center'
    },
    modalContent: {
        backgroundColor: '#fff', padding: 24, borderRadius: 16, width: 400, maxWidth: '90%', elevation: 10
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },
    modalSubtitle: { fontSize: 13, color: '#f59e0b', marginBottom: 20, fontWeight: 'bold' },
    modalBtn: {
        backgroundColor: '#f3f4f6', padding: 16, borderRadius: 12, marginBottom: 12,
        flexDirection: 'column',
    },
    modalBtnTitle: { fontSize: 16, fontWeight: 'bold', color: '#374151' },
    modalBtnDesc: { fontSize: 13, color: '#6b7280', marginTop: 4 },
    label: { fontSize: 14, fontWeight: 'bold', color: '#4b5563', marginBottom: 4 },
    input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 16, color: '#1f2937' },
});
