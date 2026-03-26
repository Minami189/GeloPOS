import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { getDBConnection, getDeviceId } from '../../lib/database';
import { RefreshCw, History, CheckCircle } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function TodayTransactionsTab() {
    const [transactions, setTransactions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useFocusEffect(
        useCallback(() => {
            loadTransactions();
        }, [])
    );

    const loadTransactions = async () => {
        setIsLoading(true);
        try {
            const db = await getDBConnection();
            const localDevId = await getDeviceId();
            
            const res = await db.getAllAsync(`
                SELECT * FROM orders 
                WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')
                AND device_id = ?
                ORDER BY created_at DESC
            `, [localDevId]);
            
            let loaded = [];
            for (let o of res || []) {
                const items = await db.getAllAsync(`
                    SELECT oi.*, p.name as product_name, pv.name as variant_name 
                    FROM order_items oi
                    LEFT JOIN products p ON oi.product_id = p.id
                    LEFT JOIN product_variants pv ON oi.variant_id = pv.id
                    WHERE oi.order_id = ?
                `, [o.id]);
                loaded.push({...o, items: items || []});
            }
            setTransactions(loaded);
        } catch (error) {
            console.error("Failed to load today's transactions", error);
        } finally {
            setIsLoading(false);
        }
    };

    const renderItem = ({ item }) => (
        <View style={styles.transactionCard}>
            <View style={styles.cardHeader}>
                <View>
                    <Text style={styles.orderId}>
                        Order #{String(new Date(item.created_at).getDate()).padStart(2, '0')}-{String((item.daily_order_number ?? (item.id - 1)) + 1).padStart(2, '0')}
                    </Text>
                    <Text style={styles.orderDate}>
                        {new Date(item.created_at).toLocaleDateString()} - {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: item.status === 'Completed' ? '#dcfce7' : '#fef9c3' }]}>
                    <Text style={[styles.statusText, { color: item.status === 'Completed' ? '#166534' : '#854d0e' }]}>
                        {item.status}
                    </Text>
                </View>
            </View>
            
            <View style={styles.cardBody}>
                <View style={styles.row}>
                    <Text style={styles.label}>Customer:</Text>
                    <Text style={styles.value}>{item.customer_name || 'Walk-in'}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={styles.label}>Total Amount:</Text>
                    <Text style={styles.valueAmount}>₱{item.total_amount.toFixed(2)}</Text>
                </View>

                {item.discount_name && (
                    <View style={styles.row}>
                        <Text style={styles.label}>Discount applied:</Text>
                        <Text style={styles.discountValue}>{item.discount_name}</Text>
                    </View>
                )}

                {item.items && item.items.length > 0 && (
                    <View style={styles.itemsListContainer}>
                        <Text style={styles.itemsListLabel}>Items:</Text>
                        {item.items.map(oi => (
                            <Text key={oi.id} style={styles.itemRowText}>
                                {oi.quantity}x {oi.product_name} {oi.variant_name ? `(${oi.variant_name})` : ''}
                            </Text>
                        ))}
                    </View>
                )}
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.titleContainer}>
                    <History color="#1f2937" size={24} />
                    <Text style={styles.title}>Today's Transactions</Text>
                </View>
                <TouchableOpacity style={styles.refreshBtn} onPress={loadTransactions} disabled={isLoading}>
                    <RefreshCw color="#3b82f6" size={18} />
                    <Text style={styles.refreshBtnText}>{isLoading ? '...' : 'Refresh'}</Text>
                </TouchableOpacity>
            </View>

            {isLoading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#3b82f6" />
                </View>
            ) : (
                <FlatList
                    data={transactions}
                    keyExtractor={item => (item.id || Math.random()).toString()}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContainer}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.centerContainer}>
                            <Text style={styles.emptyText}>No transactions recorded today.</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#ffffff' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    titleContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },
    refreshBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eff6ff', gap: 8 },
    refreshBtnText: { color: '#3b82f6', fontWeight: 'bold', fontSize: 14 },
    listContainer: { paddingBottom: 20 },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
    emptyText: { fontSize: 16, color: '#6b7280' },
    transactionCard: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
    orderId: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },
    orderDate: { fontSize: 12, color: '#6b7280', marginTop: 2 },
    statusBadge: { backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statusText: { color: '#065f46', fontSize: 12, fontWeight: 'bold' },
    cardBody: { gap: 8, marginBottom: 4 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    label: { color: '#6b7280', fontSize: 14 },
    value: { color: '#374151', fontSize: 14, fontWeight: '500' },
    valueAmount: { color: '#10b981', fontSize: 16, fontWeight: 'bold' },
    discountValue: { color: '#f59e0b', fontSize: 14, fontWeight: 'bold' },
    itemsListContainer: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
    itemsListLabel: { color: '#6b7280', fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
    itemRowText: { color: '#374151', fontSize: 13, marginBottom: 2 }
});
