import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Settings, Shield } from 'lucide-react-native';
import SettingsTab from '../components/analytics/SettingsTab';
import AccessTab from '../components/analytics/AccessTab';
import { useAuth } from '../context/AuthContext';

const TABS = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'access', label: 'Access', icon: Shield, adminOnly: true },
];

export default function SettingsScreen() {
    const [activeTab, setActiveTab] = useState('settings');
    const { currentUser } = useAuth();
    const isAdmin = currentUser?.role === 'admin';

    const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Settings</Text>
            </View>

            <View style={styles.tabBar}>
                {visibleTabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <TouchableOpacity
                            key={tab.id}
                            style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                            onPress={() => setActiveTab(tab.id)}
                        >
                            <Icon size={18} color={isActive ? '#6366f1' : '#9ca3af'} />
                            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <View style={styles.content}>
                {activeTab === 'settings' && <SettingsTab />}
                {activeTab === 'access' && isAdmin && <AccessTab />}
                {activeTab === 'access' && !isAdmin && (
                    <View style={styles.blocked}>
                        <Shield color="#d1d5db" size={40} />
                        <Text style={styles.blockedText}>Admin access required</Text>
                    </View>
                )}
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
    tabBtnActive: { backgroundColor: '#eef2ff' },
    tabLabel: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
    tabLabelActive: { color: '#6366f1', fontWeight: '700' },
    content: {
        flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 28,
        elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06, shadowRadius: 6,
    },
    blocked: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    blockedText: { fontSize: 16, color: '#9ca3af', fontWeight: '600' },
});
