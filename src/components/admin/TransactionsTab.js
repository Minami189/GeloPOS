import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { getDBConnection } from '../../lib/database';
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
            // Get today's transactions only
            const res = await db.getAllAsync(`
                SELECT * FROM orders 
                WHERE DATE(created_at) = DATE('now', 'localtime')
                ORDER BY created_at DESC
            `);
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
                <Text style={styles.orderId}>Order #{item.id}</Text>
                <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{item.status}</Text>
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
                <View style={styles.row}>
                    <Text style={styles.label}>Time:</Text>
                    <Text style={styles.value}>{new Date(item.created_at).toLocaleTimeString()}</Text>
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
                    <History color="#1f2937" size={24} />
                    <Text style={styles.title}>Today's Transactions</Text>
                </View>
                <View style={styles.buttonGroup}>
                    <TouchableOpacity 
                        style={[styles.syncButton, { backgroundColor: '#8b5cf6' }, isFetching && styles.syncButtonDisabled]} 
                        onPress={handleFetchAll} 
                        disabled={isFetching || isSyncing}
                    >
                        {isFetching ? <ActivityIndicator size="small" color="#fff" /> : <DownloadCloud color="#fff" size={18} />}
                        <Text style={styles.syncButtonText}>
                            {isFetching ? 'Fetching...' : 'Fetch All'}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]} 
                        onPress={handleSyncToday} 
                        disabled={isSyncing || isFetching}
                    >
                        {isSyncing ? <ActivityIndicator size="small" color="#fff" /> : <RefreshCw color="#fff" size={18} />}
                        <Text style={styles.syncButtonText}>
                            {isSyncing ? 'Syncing...' : 'Sync Today'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {isLoading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#3b82f6" />
                </View>
            ) : (
                <FlatList
                    data={transactions}
                    keyExtractor={item => item.id.toString()}
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
    syncButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#3b82f6',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        gap: 8
    },
    syncButtonDisabled: {
        backgroundColor: '#9ca3af'
    },
    syncButtonText: {
        color: '#ffffff',
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
