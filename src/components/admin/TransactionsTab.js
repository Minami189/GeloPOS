import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { getDBConnection, getDeviceId } from '../../lib/database';
import { syncOrdersToSupabase, fetchOrdersFromSupabase } from '../../lib/syncService';
import { RefreshCw, History, CheckCircle, DownloadCloud } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function TransactionsTab() {
    const [transactions, setTransactions] = useState([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
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
            // Get today's transactions only for this device
            const res = await db.getAllAsync(`
                SELECT * FROM orders 
                WHERE DATE(created_at) = DATE('now', 'localtime')
                AND device_id = ?
                ORDER BY created_at DESC
            `, localDevId);
            setTransactions(res || []);
        } catch (error) {
            console.error("Failed to load today's transactions", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSyncToday = async () => {
        setIsSyncing(true);
        const result = await syncOrdersToSupabase();
        setIsSyncing(false);

        if (result.success) {
            Alert.alert("Sync Success", result.message);
            loadTransactions(); // Refresh to update sync status icons
        } else {
            Alert.alert("Sync Failed", result.error || "Unknown error occurred.");
        }
    };

    const handleFetchAll = async () => {
        setIsFetching(true);
        const result = await fetchOrdersFromSupabase();
        setIsFetching(false);

        if (result.success) {
            Alert.alert("Fetch Success", result.message);
            loadTransactions(); // Refresh the list
        } else {
            Alert.alert("Fetch Failed", result.error || "Unknown error occurred.");
        }
    };

    const renderItem = ({ item }) => (
        <View style={styles.transactionCard}>
            <View style={styles.cardHeader}>
                <View>
                    <Text style={styles.orderId}>Order #{item.daily_order_number ?? item.id}</Text>
                    <Text style={styles.orderDate}>{new Date(item.created_at).toLocaleString()}</Text>
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
                    <Text style={styles.value}>{item.customer_name || 'N/A'}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={styles.label}>Total Amount:</Text>
                    <Text style={styles.valueAmount}>₱{item.total_amount.toFixed(2)}</Text>
                </View>
            </View>
            
            <View style={styles.cardFooter}>
                <View style={styles.syncStatus}>
                    {item.synced === 1 ? (
                        <>
                            <CheckCircle size={16} color="#10b981" />
                            <Text style={styles.syncedText}>Synced to Cloud</Text>
                        </>
                    ) : (
                        <>
                            <RefreshCw size={16} color="#9ca3af" />
                            <Text style={styles.pendingText}>Pending Sync</Text>
                        </>
                    )}
                </View>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.titleContainer}>
                    <History color="#1f2937" size={28} />
                    <Text style={styles.title}>Today's Transactions</Text>
                </View>
                <TouchableOpacity style={styles.refreshBtn} onPress={loadTransactions} disabled={isLoading}>
                    <RefreshCw color="#3b82f6" size={20} />
                    <Text style={styles.refreshBtnText}>{isLoading ? 'Refreshing...' : 'Refresh'}</Text>
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
    container: {
        flex: 1,
        backgroundColor: '#ffffff'
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1f2937'
    },
    buttonGroup: {
        flexDirection: 'row',
        gap: 10
    },
    refreshBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: '#eff6ff',
        gap: 8
    },
    refreshBtnDisabled: {
        opacity: 0.5
    },
    refreshBtnText: {
        color: '#3b82f6',
        fontWeight: 'bold',
        fontSize: 14
    },
    listContainer: {
        paddingBottom: 20
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40
    },
    emptyText: {
        fontSize: 16,
        color: '#6b7280'
    },
    transactionCard: {
        backgroundColor: '#f9fafb',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb'
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb'
    },
    orderId: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1f2937'
    },
    orderDate: {
        fontSize: 12,
        color: '#6b7280',
        marginTop: 2
    },
    statusBadge: {
        backgroundColor: '#d1fae5',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12
    },
    statusText: {
        color: '#065f46',
        fontSize: 12,
        fontWeight: 'bold'
    },
    cardBody: {
        gap: 8,
        marginBottom: 12
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    label: {
        color: '#6b7280',
        fontSize: 14
    },
    value: {
        color: '#374151',
        fontSize: 14,
        fontWeight: '500'
    },
    valueAmount: {
        color: '#10b981',
        fontSize: 16,
        fontWeight: 'bold'
    },
    cardFooter: {
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb'
    },
    syncStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6
    },
    syncedText: {
        color: '#10b981',
        fontSize: 12,
        fontWeight: '500'
    },
    pendingText: {
        color: '#6b7280',
        fontSize: 12,
        fontWeight: '500'
    }
});
