import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { BarChart2, Sparkles, ClipboardList, History } from 'lucide-react-native';
import SalesTab from '../components/analytics/SalesTab';
import ItemsSoldTab from '../components/analytics/ItemsSoldTab';
import TodayTransactionsTab from '../components/analytics/TodayTransactionsTab';
import AITab from '../components/analytics/AITab';

const TABS = [
    { id: 'sales', label: 'Sales (Today)', icon: BarChart2 },
    { id: 'itemsSold', label: 'Items Sold', icon: ClipboardList },
    { id: 'transactions', label: 'Today\'s Transactions', icon: History },
    { id: 'ai', label: 'AI Recommendations', icon: Sparkles },
];

export default function AnalyticsScreen() {
    const [activeTab, setActiveTab] = useState('sales');

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Analytics</Text>
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
    header: { marginBottom: 24 },
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
});
