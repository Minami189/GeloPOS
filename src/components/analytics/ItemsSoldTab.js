import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator, TouchableOpacity } from 'react-native';
import { getDBConnection } from '../../lib/database';
import { useFocusEffect } from '@react-navigation/native';
import { Search, X } from 'lucide-react-native';

export default function ItemsSoldTab() {
    const [itemsSold, setItemsSold] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useFocusEffect(
        useCallback(() => {
            loadItems();
        }, [])
    );

    const loadItems = async () => {
        setIsLoading(true);
        try {
            const db = await getDBConnection();
            const res = await db.getAllAsync(`
                SELECT 
                    COALESCE(p.name, 'Deleted Product') as product_name,
                    pv.name as variant_name,
                    SUM(oi.quantity) as total_quantity,
                    SUM(oi.quantity * oi.price_at_time) as total_revenue
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                LEFT JOIN products p ON oi.product_id = p.id
                LEFT JOIN product_variants pv ON oi.variant_id = pv.id
                WHERE o.status = 'Completed' AND DATE(o.created_at) = DATE('now', 'localtime')
                GROUP BY p.id, pv.id
                ORDER BY total_quantity DESC
            `);
            setItemsSold(res || []);
        } catch (error) {
            console.error("Failed to load items sold", error);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) return itemsSold;
        const q = searchQuery.toLowerCase();
        return itemsSold.filter(item => {
            const name = item.product_name.toLowerCase();
            const varName = item.variant_name ? item.variant_name.toLowerCase() : '';
            return name.includes(q) || varName.includes(q);
        });
    }, [itemsSold, searchQuery]);

    const renderItem = ({ item }) => (
        <View style={styles.itemCard}>
            <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.product_name} {item.variant_name ? `(${item.variant_name})` : ''}</Text>
            </View>
            <View style={styles.statsCol}>
                <Text style={styles.qtyText}>{item.total_quantity} sold</Text>
                <Text style={styles.revenueText}>₱{item.total_revenue.toFixed(2)}</Text>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Items Sold Today</Text>
                <View style={styles.searchContainer}>
                    <Search color="#9ca3af" size={18} style={{ marginRight: 8 }} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search items..."
                        placeholderTextColor="#9ca3af"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <X color="#9ca3af" size={16} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {isLoading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#10b981" />
                </View>
            ) : (
                <FlatList
                    data={filteredItems}
                    keyExtractor={(item, index) => index.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContainer}
                    ListEmptyComponent={
                        <View style={styles.centerContainer}>
                            <Text style={styles.emptyText}>No items match your search or no sales today.</Text>
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
    title: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f9fafb',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        width: 300
    },
    searchInput: { flex: 1, fontSize: 14, color: '#1f2937', padding: 0 },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
    emptyText: { fontSize: 16, color: '#6b7280' },
    listContainer: { paddingBottom: 20 },
    itemCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#f9fafb',
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#e5e7eb'
    },
    itemName: { fontSize: 16, fontWeight: '600', color: '#374151' },
    statsCol: { alignItems: 'flex-end' },
    qtyText: { fontSize: 15, fontWeight: 'bold', color: '#1f2937' },
    revenueText: { fontSize: 14, color: '#10b981', fontWeight: 'bold', marginTop: 4 }
});
