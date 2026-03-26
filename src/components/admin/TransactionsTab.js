import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, TextInput, ScrollView } from 'react-native';
import { getDBConnection, getDeviceId } from '../../lib/database';
import { syncOrdersToSupabase, fetchOrdersFromSupabase } from '../../lib/syncService';
import { RefreshCw, History, CheckCircle, Search } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function TransactionsTab() {
    const [transactions, setTransactions] = useState([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const [filter, setFilter] = useState('All Time');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('Date (Newest)');
    const FILTER_OPTIONS = ['Today', 'This Week', 'This Month', 'This Year', 'All Time'];
    const SORT_OPTIONS = ['Date (Newest)', 'Date (Oldest)', 'Name (A-Z)', 'Name (Z-A)'];

    useFocusEffect(
        useCallback(() => {
            loadTransactions();
        }, [filter, sortBy]) // Reload when filter or sort changes
    );

    // Also reload if searchQuery changes but usually typing shouldn't spam DB, so let's use a simple effect or rely on manual refresh/debounce. 
    // Wait, simple enough to just filter in DB when the user clicks 'Search' or debounced. 
    // Since SQL is cheap locally, let's load on search change.
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            loadTransactions();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const loadTransactions = async () => {
        setIsLoading(true);
        try {
            const db = await getDBConnection();

            let dateClause = "";
            if (filter === 'Today') {
                dateClause = "DATE(created_at, 'localtime') = DATE('now', 'localtime')";
            } else if (filter === 'This Week') {
                dateClause = "created_at >= datetime('now', 'localtime', '-7 days')";
            } else if (filter === 'This Month') {
                dateClause = "strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')";
            } else if (filter === 'This Year') {
                dateClause = "strftime('%Y', created_at, 'localtime') = strftime('%Y', 'now', 'localtime')";
            }

            let searchClause = "";
            let params = [];
            if (searchQuery.trim()) {
                searchClause = "(id LIKE ? OR daily_order_number LIKE ? OR customer_name LIKE ? COLLATE NOCASE)";
                const q = `%${searchQuery.trim()}%`;
                params.push(q, q, q);
            }

            let whereClauses = [];
            if (dateClause) whereClauses.push(dateClause);
            if (searchClause) whereClauses.push(searchClause);

            const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            let orderClause = "created_at DESC";
            if (sortBy === 'Date (Oldest)') orderClause = "created_at ASC";
            if (sortBy === 'Name (A-Z)') orderClause = "customer_name ASC";
            if (sortBy === 'Name (Z-A)') orderClause = "customer_name DESC";

            const res = await db.getAllAsync(`
                SELECT * FROM orders 
                ${whereString}
                ORDER BY ${orderClause}
            `, params);
            
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
            console.error("Failed to load transactions", error);
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
                    <Text style={styles.orderId}>
                        Order #{String(new Date(item.created_at).getDate()).padStart(2, '0')}-{String((item.daily_order_number ?? (item.id - 1)) + 1).padStart(2, '0')}
                    </Text>
                    <Text style={styles.orderDate}>
                        {new Date(item.created_at).toLocaleDateString()} - {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.statusBadge, { backgroundColor: item.status === 'Completed' ? '#dcfce7' : '#fef9c3' }]}>
                        <Text style={[styles.statusText, { color: item.status === 'Completed' ? '#166534' : '#854d0e' }]}>
                            {item.status}
                        </Text>
                    </View>
                    <View style={[styles.orderTypeBadge, { backgroundColor: item.order_type === 'Take Out' ? '#dbeafe' : '#dcfce7' }]}>
                        <Text style={[styles.orderTypeBadgeText, { color: item.order_type === 'Take Out' ? '#1d4ed8' : '#166534' }]}>
                            {item.order_type === 'Take Out' ? '🥡 Take Out' : '🍽️ Dine In'}
                        </Text>
                    </View>
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
                    <Text style={styles.title}>Orders Summary</Text>
                </View>
                <TouchableOpacity style={styles.refreshBtn} onPress={loadTransactions} disabled={isLoading}>
                    <RefreshCw color="#3b82f6" size={20} />
                    <Text style={styles.refreshBtnText}>{isLoading ? 'Refreshing...' : 'Refresh'}</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.filterSection}>
                <View style={styles.searchContainer}>
                    <Search color="#9ca3af" size={20} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search Order # or Customer"
                        placeholderTextColor="#9ca3af"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ gap: 10, paddingBottom: 5 }}>
                    {FILTER_OPTIONS.map(opt => (
                        <TouchableOpacity 
                            key={opt}
                            style={[styles.filterChip, filter === opt && styles.filterChipActive]}
                            onPress={() => setFilter(opt)}
                        >
                            <Text style={[styles.filterChipText, filter === opt && styles.filterChipTextActive]}>{opt}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ gap: 10, marginTop: 10, paddingBottom: 5 }}>
                    {SORT_OPTIONS.map(opt => (
                        <TouchableOpacity 
                            key={opt}
                            style={[styles.sortChip, sortBy === opt && styles.sortChipActive]}
                            onPress={() => setSortBy(opt)}
                        >
                            <Text style={[styles.sortChipText, sortBy === opt && styles.sortChipTextActive]}>Sort: {opt}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
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
                            <Text style={styles.emptyText}>No transactions found for this filter.</Text>
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
    filterSection: {
        marginBottom: 20
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 10,
        paddingHorizontal: 15,
        paddingVertical: 10,
        marginBottom: 15
    },
    searchInput: {
        flex: 1,
        marginLeft: 10,
        fontSize: 16,
        color: '#1f2937'
    },
    filterScroll: {
        flexGrow: 0
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f3f4f6',
        borderWidth: 1,
        borderColor: '#e5e7eb'
    },
    filterChipActive: {
        backgroundColor: '#1f2937',
        borderColor: '#1f2937'
    },
    filterChipText: {
        fontSize: 14,
        color: '#6b7280',
        fontWeight: '600'
    },
    filterChipTextActive: {
        color: '#ffffff'
    },
    sortChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#d1d5db'
    },
    sortChipActive: {
        backgroundColor: '#eff6ff',
        borderColor: '#3b82f6'
    },
    sortChipText: {
        fontSize: 13,
        color: '#4b5563',
        fontWeight: '500'
    },
    sortChipTextActive: {
        color: '#2563eb',
        fontWeight: 'bold'
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
    discountValue: {
        color: '#f59e0b',
        fontSize: 14,
        fontWeight: 'bold'
    },
    cardFooter: {
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb'
    },
    itemsListContainer: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#f3f4f6'
    },
    itemsListLabel: {
        color: '#6b7280',
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 4
    },
    itemRowText: {
        color: '#374151',
        fontSize: 13,
        marginBottom: 2
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
    },
    orderTypeBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12
    },
    orderTypeBadgeText: {
        fontSize: 12,
        fontWeight: 'bold'
    }
});
