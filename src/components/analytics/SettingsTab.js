import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, Modal
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDBConnection } from '../../lib/database';
import { syncAllToSupabase } from '../../lib/syncService';
import { RefreshCw, ShoppingBag, DollarSign, TrendingUp, Clock, ChevronDown, Check } from 'lucide-react-native';

const FILTER_OPTIONS = [
    { label: 'Today', value: 'today' },
    { label: 'This Week', value: 'week' },
    { label: 'This Month', value: 'month' },
    { label: 'This Year', value: 'year' },
    { label: 'All Time', value: 'all' },
];

function buildDateCondition(filter, tablePrefix = '') {
    const col = tablePrefix ? `${tablePrefix}.created_at` : 'created_at';
    switch (filter) {
        case 'today':
            return `AND DATE(${col}) = DATE('now', 'localtime')`;
        case 'week':
            return `AND DATE(${col}) >= DATE('now', '-6 days', 'localtime')`;
        case 'month':
            return `AND strftime('%Y-%m', ${col}) = strftime('%Y-%m', 'now', 'localtime')`;
        case 'year':
            return `AND strftime('%Y', ${col}) = strftime('%Y', 'now', 'localtime')`;
        default:
            return '';
    }
}

export default function SettingsTab() {
    const [filter, setFilter] = useState('today');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [todayStats, setTodayStats] = useState({
        itemsOrdered: 0,
        totalIncome: 0,
        totalOrders: 0,
        avgOrderValue: 0,
        topProduct: 'N/A',
        pendingOrders: 0,
    });
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState('');

    useFocusEffect(
        useCallback(() => {
            loadStats();
        }, [filter])
    );

    const loadStats = async () => {
        try {
            const db = await getDBConnection();
            const dc = buildDateCondition(filter);
            const dcO = buildDateCondition(filter, 'o');

            const summary = await db.getFirstAsync(`
                SELECT COUNT(id) as total_orders, COALESCE(SUM(total_amount), 0) as total_income
                FROM orders WHERE status = 'Completed' ${dc}
            `);

            const items = await db.getFirstAsync(`
                SELECT COALESCE(SUM(oi.quantity), 0) as total_items
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                WHERE o.status = 'Completed' ${dcO}
            `);

            const top = await db.getFirstAsync(`
                SELECT COALESCE(p.name, 'Deleted Product') as name, SUM(oi.quantity) as qty
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE o.status = 'Completed' ${dcO}
                GROUP BY name ORDER BY qty DESC LIMIT 1
            `);

            const pending = await db.getFirstAsync(
                `SELECT COUNT(id) as cnt FROM orders WHERE status = 'Pending'`
            );

            const cnt = summary?.total_orders || 0;
            const income = summary?.total_income || 0;
            setTodayStats({
                itemsOrdered: items?.total_items || 0,
                totalIncome: income,
                totalOrders: cnt,
                avgOrderValue: cnt > 0 ? income / cnt : 0,
                topProduct: top?.name || 'N/A',
                pendingOrders: pending?.cnt || 0,
            });
            setLastUpdated(new Date().toLocaleTimeString());
        } catch (e) {
            console.error('SettingsTab stats error:', e);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        const result = await syncAllToSupabase();
        setIsSyncing(false);
        if (result.success) {
            Alert.alert('Sync Success', result.message);
            loadStats();
        } else {
            Alert.alert('Sync Failed', result.error || 'Unknown error occurred.');
        }
    };

    const selectedLabel = FILTER_OPTIONS.find(f => f.value === filter)?.label || 'Today';

    const stats = [
        { label: 'Items Ordered', value: todayStats.itemsOrdered, icon: ShoppingBag, color: '#3b82f6', bg: '#eff6ff' },
        { label: 'Total Income', value: `₱${todayStats.totalIncome.toFixed(2)}`, icon: DollarSign, color: '#10b981', bg: '#ecfdf5' },
        { label: 'Orders Completed', value: todayStats.totalOrders, icon: TrendingUp, color: '#8b5cf6', bg: '#f5f3ff' },
        { label: 'Avg Order Value', value: `₱${todayStats.avgOrderValue.toFixed(2)}`, icon: TrendingUp, color: '#f59e0b', bg: '#fffbeb' },
        { label: 'Top Product', value: todayStats.topProduct, icon: ShoppingBag, color: '#ec4899', bg: '#fdf2f8', isText: true },
        { label: 'Pending Orders', value: todayStats.pendingOrders, icon: Clock, color: '#6b7280', bg: '#f9fafb' },
    ];

    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Header row */}
            <View style={s.headerRow}>
                <View style={s.leftHeader}>
                    <Text style={s.sectionTitle}>Overview</Text>
                    {lastUpdated ? <Text style={s.lastUpdated}>Updated {lastUpdated}</Text> : null}
                </View>

                <View style={s.headerRight}>
                    {/* Filter dropdown */}
                    <TouchableOpacity style={s.dropdown} onPress={() => setDropdownOpen(true)}>
                        <Text style={s.dropdownText}>{selectedLabel}</Text>
                        <ChevronDown color="#374151" size={16} />
                    </TouchableOpacity>

                    <TouchableOpacity style={s.syncBtn} onPress={handleSync} disabled={isSyncing}>
                        {isSyncing
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <RefreshCw color="#fff" size={16} />}
                        <Text style={s.syncBtnText}>{isSyncing ? 'Syncing...' : 'Sync'}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Stat cards */}
            <View style={s.grid}>
                {stats.map((st, i) => {
                    const Icon = st.icon;
                    return (
                        <View key={i} style={[s.card, { backgroundColor: st.bg }]}>
                            <View style={[s.iconWrap, { backgroundColor: st.color + '22' }]}>
                                <Icon color={st.color} size={20} />
                            </View>
                            <Text style={s.cardLabel}>{st.label}</Text>
                            <Text style={[s.cardValue, st.isText && s.cardValueText]} numberOfLines={1}>
                                {st.value}
                            </Text>
                        </View>
                    );
                })}
            </View>

            <TouchableOpacity style={s.refreshBtn} onPress={loadStats}>
                <RefreshCw color="#6b7280" size={14} />
                <Text style={s.refreshBtnText}>Refresh</Text>
            </TouchableOpacity>

            {/* Dropdown modal */}
            <Modal transparent visible={dropdownOpen} animationType="fade" onRequestClose={() => setDropdownOpen(false)}>
                <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setDropdownOpen(false)}>
                    <View style={s.dropdownMenu}>
                        <Text style={s.dropdownMenuTitle}>Filter Period</Text>
                        {FILTER_OPTIONS.map(opt => (
                            <TouchableOpacity
                                key={opt.value}
                                style={[s.dropdownItem, filter === opt.value && s.dropdownItemActive]}
                                onPress={() => { setFilter(opt.value); setDropdownOpen(false); }}
                            >
                                <Text style={[s.dropdownItemText, filter === opt.value && s.dropdownItemTextActive]}>
                                    {opt.label}
                                </Text>
                                {filter === opt.value && <Check color="#6366f1" size={16} />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>
        </ScrollView>
    );
}

const s = StyleSheet.create({
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
    leftHeader: {},
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sectionTitle: { fontSize: 22, fontWeight: '800', color: '#1f2937' },
    lastUpdated: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

    dropdown: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#f3f4f6', paddingHorizontal: 14, paddingVertical: 10,
        borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    },
    dropdownText: { fontSize: 14, fontWeight: '700', color: '#374151' },

    syncBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, gap: 6 },
    syncBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 },
    card: { flex: 1, minWidth: 180, padding: 22, borderRadius: 16, gap: 10 },
    iconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    cardLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
    cardValue: { fontSize: 26, fontWeight: '800', color: '#1f2937' },
    cardValueText: { fontSize: 16 },
    refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#f3f4f6' },
    refreshBtnText: { color: '#6b7280', fontSize: 13, fontWeight: '600' },

    // Dropdown modal
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
    dropdownMenu: { backgroundColor: '#fff', borderRadius: 16, padding: 12, width: 260, elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
    dropdownMenuTitle: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 8, paddingBottom: 8, borderBottomWidth: 1, borderColor: '#f3f4f6', marginBottom: 4 },
    dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10 },
    dropdownItemActive: { backgroundColor: '#eef2ff' },
    dropdownItemText: { fontSize: 15, color: '#374151', fontWeight: '600' },
    dropdownItemTextActive: { color: '#6366f1', fontWeight: '700' },
});
