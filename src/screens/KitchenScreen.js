import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { getDBConnection } from '../lib/database';
import { useFocusEffect } from '@react-navigation/native';

export default function KitchenScreen() {
    const [orders, setOrders] = useState([]); // [{id, items: []}]
    const [currentTime, setCurrentTime] = useState(new Date());

    useFocusEffect(
        React.useCallback(() => {
            loadPendingOrders();
            const interval = setInterval(() => setCurrentTime(new Date()), 1000);
            return () => clearInterval(interval);
        }, [])
    );

    const loadPendingOrders = async () => {
        try {
            const db = await getDBConnection();
            const ordersRes = await db.getAllAsync('SELECT * FROM orders WHERE status = "Pending" ORDER BY created_at ASC');

            let structuredOrders = [];
            for (let o of ordersRes) {
                const itemsRes = await db.getAllAsync(`
                    SELECT oi.*, p.name as product_name, pv.name as variant_name 
                    FROM order_items oi
                    JOIN products p ON oi.product_id = p.id
                    LEFT JOIN product_variants pv ON oi.variant_id = pv.id
                    WHERE oi.order_id = ?
                `, o.id);
                structuredOrders.push({ ...o, items: itemsRes });
            }
            setOrders(structuredOrders);
        } catch (e) { console.error("Failed to load kitchen queue", e); }
    };

    const completeOrder = async (orderId) => {
        try {
            const db = await getDBConnection();
            await db.runAsync('UPDATE orders SET status = "Completed" WHERE id = ?', orderId);
            loadPendingOrders();
        } catch (e) { console.error("Failed to complete order", e); }
    };

    const formatElapsedTime = (createdAtStr) => {
        // createdAt is in UTC from SQLite CURRENT_TIMESTAMP
        // This is a naive calculation assuming local time sync. 
        // For production, exact timezone handling is better.
        const createdMs = new Date(createdAtStr + 'Z').getTime(); // append Z to parse as UTC
        const nowMs = currentTime.getTime();
        const diffSecs = Math.max(0, Math.floor((nowMs - createdMs) / 1000));

        const m = Math.floor(diffSecs / 60);
        const s = diffSecs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <View style={styles.container}>
            <Text style={styles.headerTitle}>Kitchen Queue</Text>

            <FlatList
                data={orders}
                numColumns={3}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item, index }) => (
                    <View style={styles.orderCard}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.orderNumber}>Order #{item.id}</Text>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.timeLabel}>Time Elapsed</Text>
                                <Text style={styles.timeValue}>{formatElapsedTime(item.created_at)}</Text>
                            </View>
                        </View>

                        <TouchableOpacity style={styles.completeBtn} onPress={() => completeOrder(item.id)}>
                            <Text style={styles.completeBtnText}>Complete Order</Text>
                        </TouchableOpacity>

                        <FlatList
                            data={item.items}
                            keyExtractor={i => i.id.toString()}
                            style={styles.itemsList}
                            scrollEnabled={false}
                            renderItem={({ item: oi }) => (
                                <View style={styles.itemRow}>
                                    <Text style={styles.itemTitle}>{oi.quantity}x - {oi.product_name}</Text>
                                    {oi.variant_name ? <Text style={styles.itemVariant}>Variant: {oi.variant_name}</Text> : null}
                                    <View style={styles.divider} />
                                </View>
                            )}
                        />
                    </View>
                )}
                ListEmptyComponent={<Text style={{ fontSize: 18, color: '#6b7280', marginTop: 50 }}>No pending orders in the queue.</Text>}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 40, backgroundColor: '#f8f9fa' },
    headerTitle: { fontSize: 32, fontWeight: 'bold', color: '#1f2937', marginBottom: 30 },

    orderCard: { width: 320, backgroundColor: '#fff', borderRadius: 16, padding: 20, margin: 15, elevation: 4 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#e0f2fe', padding: 15, borderRadius: 12, marginBottom: 15 },
    orderNumber: { fontSize: 20, fontWeight: 'bold', color: '#0369a1' },
    timeLabel: { fontSize: 12, color: '#0284c7' },
    timeValue: { fontSize: 18, fontWeight: 'bold', color: '#0369a1' },

    completeBtn: { borderWidth: 1, borderColor: '#38bdf8', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 20 },
    completeBtnText: { color: '#0369a1', fontWeight: 'bold', fontSize: 14 },

    itemsList: { flex: 1 },
    itemRow: { marginVertical: 8 },
    itemTitle: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },
    itemVariant: { fontSize: 14, color: '#6b7280', marginTop: 2 },
    divider: { height: 1, backgroundColor: '#f3f4f6', marginTop: 10 }
});
