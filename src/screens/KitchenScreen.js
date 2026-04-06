import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, ScrollView, Alert } from 'react-native';
import { getDBConnection } from '../lib/database';
import { useFocusEffect } from '@react-navigation/native';
import { History, X, CheckCircle } from 'lucide-react-native';
import { useSyncContext } from '../context/SyncContext';

export default function KitchenScreen() {
    const { syncEpoch } = useSyncContext();
    const [orders, setOrders] = useState([]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [stockAlerts, setStockAlerts] = useState([]);

    // Confirmation modal
    const [confirmVisible, setConfirmVisible] = useState(false);
    const [pendingOrderId, setPendingOrderId] = useState(null);

    // Cancel modal
    const [cancelVisible, setCancelVisible] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState(null);

    // History modal
    const [historyVisible, setHistoryVisible] = useState(false);
    const [historyOrders, setHistoryOrders] = useState([]);

    useFocusEffect(
        React.useCallback(() => {
            loadPendingOrders();
            loadStockAlerts();
            const interval = setInterval(() => setCurrentTime(new Date()), 1000);
            return () => clearInterval(interval);
        }, [syncEpoch])
    );

    const loadPendingOrders = async () => {
        try {
            const db = await getDBConnection();
            const ordersRes = await db.getAllAsync('SELECT * FROM orders WHERE status = ? ORDER BY created_at ASC', 'Pending');

            let structuredOrders = [];
            for (let o of ordersRes) {
                const itemsRes = await db.getAllAsync(`
                    SELECT oi.*, p.name as product_name, pv.name as variant_name 
                    FROM order_items oi
                    LEFT JOIN products p ON oi.product_id = p.id
                    LEFT JOIN product_variants pv ON oi.variant_id = pv.id
                    WHERE oi.order_id = ?
                `, o.id);
                structuredOrders.push({ ...o, items: itemsRes });
            }
            setOrders(structuredOrders);
        } catch (e) { console.error("Failed to load kitchen queue", e); }
    };

    const loadStockAlerts = async () => {
        try {
            const db = await getDBConnection();
            const ingredientsRes = await db.getAllAsync('SELECT * FROM ingredients WHERE deleted_at IS NULL');
            let alerts = [];
            const nowMs = Date.now();
            (ingredientsRes || []).forEach(ing => {
                if (ing.reset_timer_days > 0 && ing.last_reset_at) {
                    const lastReset = new Date(ing.last_reset_at);
                    lastReset.setHours(0, 0, 0, 0);
                    const nextReset = new Date(lastReset.getTime() + ing.reset_timer_days * 24 * 60 * 60 * 1000);
                    if (new Date() >= nextReset) {
                        alerts.push(`Reset Overdue: ${ing.name}`);
                    }
                }
            });
            setStockAlerts(alerts);
        } catch (e) { console.error("Failed to load stock alerts", e); }
    };

    // Step 1: tap "Complete Order" → show confirmation modal
    const requestComplete = (orderId) => {
        setPendingOrderId(orderId);
        setConfirmVisible(true);
    };

    // Step 2: user confirms → actually complete the order
    const confirmComplete = async () => {
        setConfirmVisible(false);
        try {
            const db = await getDBConnection();
            // Important: Mark synced = 0 so the status update is pushed to Supabase
            await db.runAsync('UPDATE orders SET status = ?, synced = 0 WHERE id = ?', 'Completed', pendingOrderId);
            loadPendingOrders();
            // Reload history in the background so it is up to date when next opened
            const completedOrders = await db.getAllAsync(
                'SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 50',
                'Completed'
            );
            let structured = [];
            for (let o of completedOrders) {
                const items = await db.getAllAsync(`
                    SELECT oi.*, p.name as product_name, pv.name as variant_name 
                    FROM order_items oi
                    LEFT JOIN products p ON oi.product_id = p.id
                    LEFT JOIN product_variants pv ON oi.variant_id = pv.id
                    WHERE oi.order_id = ?
                `, o.id);
                structured.push({ ...o, items });
            }
            setHistoryOrders(structured);
        } catch (e) { console.error("Failed to complete order", e); }
        setPendingOrderId(null);
    };

    const cancelComplete = () => {
        setConfirmVisible(false);
        setPendingOrderId(null);
    };

    // Step 1: Request Cancel
    const requestCancel = (order) => {
        setOrderToCancel(order);
        setCancelVisible(true);
    };

    // Step 2: Confirm Cancel & Rollback Inventory
    const confirmCancel = async () => {
        setCancelVisible(false);
        try {
            const db = await getDBConnection();

            // Rollback inventory for each item
            for (let item of orderToCancel.items) {
                let recs;
                if (item.variant_id) {
                    recs = await db.getAllAsync('SELECT * FROM recipes WHERE product_id = ? AND variant_id = ? AND deleted_at IS NULL', item.product_id, item.variant_id);
                } else {
                    recs = await db.getAllAsync('SELECT * FROM recipes WHERE product_id = ? AND variant_id IS NULL AND deleted_at IS NULL', item.product_id);
                }
                for (let r of recs) {
                    const totalUsed = r.quantity * item.quantity;
                    await db.runAsync(
                        'UPDATE ingredients SET stock_quantity = stock_quantity + ?, synced = 0 WHERE id = ?',
                        totalUsed, r.ingredient_id
                    );
                }
            }

            // Mark order as cancelled
            await db.runAsync('UPDATE orders SET status = ?, synced = 0 WHERE id = ?', 'Cancelled', orderToCancel.id);
            loadPendingOrders();
        } catch (e) {
            console.error("Failed to cancel order and rollback stock", e);
        }
        setOrderToCancel(null);
    };

    const abortCancel = () => {
        setCancelVisible(false);
        setOrderToCancel(null);
    };

    const loadHistory = async () => {
        try {
            const db = await getDBConnection();
            const completedOrders = await db.getAllAsync(
                'SELECT * FROM orders WHERE status = \'Completed\' ORDER BY created_at DESC LIMIT 50'
            );
            let structured = [];
            for (let o of completedOrders) {
                const items = await db.getAllAsync(`
                    SELECT oi.*, p.name as product_name, pv.name as variant_name 
                    FROM order_items oi
                    LEFT JOIN products p ON oi.product_id = p.id
                    LEFT JOIN product_variants pv ON oi.variant_id = pv.id
                    WHERE oi.order_id = ?
                `, o.id);
                structured.push({ ...o, items });
            }
            setHistoryOrders(structured);
            setHistoryVisible(true);
        } catch (e) { console.error("Failed to load order history", e); }
    };

    // Safely parse a date string that may or may not already include timezone info.
    // Appending 'Z' to a string that already has '+HH:MM' produces an invalid date.
    const parseDate = (str) => {
        if (!str) return new Date(NaN);
        // If it already has a timezone offset or ends with Z, parse as-is
        if (/[Zz]$/.test(str) || /[+-]\d{2}:\d{2}$/.test(str)) return new Date(str);
        // Otherwise treat as UTC by appending Z
        return new Date(str + 'Z');
    };

    const formatElapsedTime = (createdAtStr) => {
        const createdMs = parseDate(createdAtStr).getTime();
        const nowMs = currentTime.getTime();
        const diffSecs = Math.max(0, Math.floor((nowMs - createdMs) / 1000));
        const m = Math.floor(diffSecs / 60);
        const s = diffSecs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const formatDateTime = (str) => {
        if (!str) return '';
        const d = parseDate(str);
        return isNaN(d.getTime()) ? str : d.toLocaleString();
    };

    const orderLabel = (order) => {
        if (order.customer_name) return `${order.customer_name} · #${order.id}`;
        return `Order #${order.id}`;
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.headerRow}>
                <Text style={styles.headerTitle}>Kitchen Queue</Text>
                <TouchableOpacity style={styles.historyBtn} onPress={loadHistory}>
                    <History color="#0369a1" size={20} />
                    <Text style={styles.historyBtnText}>Order History</Text>
                </TouchableOpacity>
            </View>

            {stockAlerts.length > 0 && (
                <View style={styles.alertBanner}>
                    <Text style={styles.alertBannerText}>⚠️ Warning Requires Action: {stockAlerts.join('  •  ')}</Text>
                </View>
            )}

            {orders.length === 0 ? (
                <Text style={{ fontSize: 18, color: '#6b7280', marginTop: 50 }}>No pending orders in the queue.</Text>
            ) : (
                <ScrollView
                    horizontal={true}
                    showsHorizontalScrollIndicator={true}
                    contentContainerStyle={styles.ordersGrid}
                >
                    {orders.map(item => (
                        <View key={item.id} style={styles.orderCard}>
                            <View style={styles.cardHeader}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.orderNumber}>{orderLabel(item)}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end', marginRight: 10 }}>
                                    <Text style={styles.timeLabel}>Time Elapsed</Text>
                                    <Text style={styles.timeValue}>{formatElapsedTime(item.created_at)}</Text>
                                </View>
                                <TouchableOpacity onPress={() => requestCancel(item)} style={{ paddingLeft: 10 }}>
                                    <X color="#ef4444" size={24} />
                                </TouchableOpacity>
                            </View>

                            {/* Order Type Pill */}
                            <View style={{ marginBottom: 15, flexDirection: 'row' }}>
                                <View style={[styles.orderTypeBadge, { backgroundColor: item.order_type === 'Take Out' ? '#dbeafe' : '#dcfce7' }]}>
                                    <Text style={[styles.orderTypeBadgeText, { color: item.order_type === 'Take Out' ? '#1d4ed8' : '#166534' }]}>
                                        {item.order_type === 'Take Out' ? 'Take Out' : 'Dine In'}
                                    </Text>
                                </View>
                            </View>

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

                            {/* Complete button — requires confirmation */}
                            <TouchableOpacity style={styles.completeBtn} onPress={() => requestComplete(item.id)}>
                                <CheckCircle color="#0369a1" size={16} style={{ marginRight: 6 }} />
                                <Text style={styles.completeBtnText}>Complete Order</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
            )}

            {/* ─── Confirmation Modal ─── */}
            <Modal visible={confirmVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.confirmModal}>
                        <Text style={styles.confirmTitle}>Complete Order?</Text>
                        <Text style={styles.confirmBody}>
                            Mark this order as done? This cannot be undone easily.
                        </Text>
                        <View style={styles.confirmActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={cancelComplete}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.doneBtn} onPress={confirmComplete}>
                                <Text style={styles.doneBtnText}>Yes, Complete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ─── Cancel Modal ─── */}
            <Modal visible={cancelVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.confirmModal}>
                        <Text style={[styles.confirmTitle, { color: '#ef4444' }]}>Cancel Order?</Text>
                        <Text style={styles.confirmBody}>
                            Are you sure you want to delete this order? Inventory will be rolled back automatically.
                        </Text>
                        <View style={styles.confirmActions}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={abortCancel}>
                                <Text style={styles.cancelBtnText}>Keep Order</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.doneBtn, { backgroundColor: '#ef4444' }]} onPress={confirmCancel}>
                                <Text style={styles.doneBtnText}>Yes, Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ─── Order History Modal ─── */}
            <Modal visible={historyVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.historyModal}>
                        <View style={styles.historyHeader}>
                            <Text style={styles.historyTitle}>Order History</Text>
                            <TouchableOpacity onPress={() => setHistoryVisible(false)}>
                                <X color="#6b7280" size={24} />
                            </TouchableOpacity>
                        </View>

                        {historyOrders.length === 0 ? (
                            <Text style={{ color: '#9ca3af', textAlign: 'center', marginTop: 40, fontSize: 16 }}>No completed orders yet.</Text>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {historyOrders.map(order => (
                                    <View key={order.id} style={styles.historyCard}>
                                        <View style={styles.historyCardHeader}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.historyOrderNum}>{orderLabel(order)}</Text>
                                                <View style={{ flexDirection: 'row', marginTop: 5 }}>
                                                    <View style={[styles.orderTypeBadge, { backgroundColor: order.order_type === 'Take Out' ? '#dbeafe' : '#dcfce7', paddingVertical: 2, paddingHorizontal: 8 }]}>
                                                        <Text style={[styles.orderTypeBadgeText, { color: order.order_type === 'Take Out' ? '#1d4ed8' : '#166534', fontSize: 10 }]}>
                                                            {order.order_type === 'Take Out' ? '🥡 Take Out' : '🍽️ Dine In'}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                            <Text style={styles.historyTotal}>₱{order.total_amount.toFixed(2)}</Text>
                                        </View>
                                        <Text style={styles.historyDate}>{formatDateTime(order.created_at)}</Text>
                                        {order.items.map((oi, idx) => (
                                            <Text key={`${oi.id}-${idx}`} style={styles.historyItem}>
                                                {oi.quantity}x {oi.product_name || '(deleted product)'}{oi.variant_name ? ` (${oi.variant_name})` : ''}
                                            </Text>
                                        ))}
                                    </View>
                                ))}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 40, backgroundColor: '#f8f9fa' },

    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    headerTitle: { fontSize: 32, fontWeight: 'bold', color: '#1f2937' },
    alertBanner: { backgroundColor: '#fef2f2', padding: 12, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: '#f87171' },
    alertBannerText: { color: '#b91c1c', fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
    historyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#e0f2fe',
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#bae6fd',
    },
    historyBtnText: { color: '#0369a1', fontWeight: 'bold', fontSize: 15 },

    ordersGrid: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingBottom: 20
    },

    orderCard: { width: 320, backgroundColor: '#fff', borderRadius: 16, padding: 20, margin: 15, elevation: 4 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#e0f2fe', padding: 15, borderRadius: 12, marginBottom: 15 },
    orderNumber: { fontSize: 18, fontWeight: 'bold', color: '#0369a1' },
    timeLabel: { fontSize: 12, color: '#0284c7' },
    timeValue: { fontSize: 18, fontWeight: 'bold', color: '#0369a1' },

    itemsList: { marginBottom: 15 },
    itemRow: { marginVertical: 8 },
    itemTitle: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },
    itemVariant: { fontSize: 14, color: '#6b7280', marginTop: 2 },
    divider: { height: 1, backgroundColor: '#f3f4f6', marginTop: 10 },

    completeBtn: {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#38bdf8',
        paddingVertical: 12,
        marginHorizontal: 10,
        borderRadius: 8,
    },
    completeBtnText: { color: '#0369a1', fontWeight: 'bold', fontSize: 14 },

    // Confirmation Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
    confirmModal: {
        width: 400,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 35,
        elevation: 10,
        alignItems: 'center',
    },
    confirmTitle: { fontSize: 22, fontWeight: 'bold', color: '#1f2937', marginBottom: 14 },
    confirmBody: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 30, lineHeight: 22 },
    confirmActions: { flexDirection: 'row', gap: 15 },
    cancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#d1d5db',
        alignItems: 'center',
    },
    cancelBtnText: { color: '#374151', fontWeight: 'bold', fontSize: 16 },
    doneBtn: {
        flex: 1,
        width: 250,
        paddingVertical: 14,
        borderRadius: 10,
        backgroundColor: '#10b981',
        alignItems: 'center',
    },
    doneBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    // History Modal
    historyModal: {
        width: '60%',
        maxHeight: '80%',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 30,
        elevation: 10,
    },
    historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    historyTitle: { fontSize: 22, fontWeight: 'bold', color: '#1f2937' },

    historyCard: {
        backgroundColor: '#f9fafb',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#10b981',
    },
    historyCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontWeight: 'bold' },
    historyOrderNum: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },
    historyTotal: { fontSize: 16, fontWeight: 'bold', color: '#10b981' },
    historyDate: { fontSize: 12, color: '#9ca3af', marginBottom: 8 },
    historyItem: { fontSize: 14, color: '#0e0e11ff', marginTop: 3, fontWeight: 'bold' },

    orderTypeBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        alignSelf: 'flex-start'
    },
    orderTypeBadgeText: {
        fontSize: 13,
        fontWeight: 'bold'
    }
});
