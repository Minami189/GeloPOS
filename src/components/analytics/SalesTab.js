import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Switch, Dimensions
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDBConnection } from '../../lib/database';
import { useAuth } from '../../context/AuthContext';
import { BarChart } from 'react-native-chart-kit';
import { Eye } from 'lucide-react-native';

const screenWidth = Dimensions.get('window').width;

export default function SalesTab() {
    const [salesSummary, setSalesSummary] = useState({ totalRevenue: 0, totalOrders: 0, avgOrderValue: 0 });
    const [chartData, setChartData] = useState({ labels: [], data: [] });
    const [topProducts, setTopProducts] = useState([]);
    const [showDeleted, setShowDeleted] = useState(false);
    const [hasDeletedSales, setHasDeletedSales] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useFocusEffect(
        useCallback(() => {
            loadAnalytics();
        }, [showDeleted])
    );

    const loadAnalytics = async () => {
        setIsLoading(true);
        try {
            const db = await getDBConnection();
            const dateCondition = "AND DATE(o.created_at) = DATE('now', 'localtime')";

            // Check if deleted product sales exist
            const deletedCheck = await db.getFirstAsync(`
                SELECT COUNT(*) as cnt
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE o.status = 'Completed' AND p.id IS NULL
            `);
            setHasDeletedSales((deletedCheck?.cnt || 0) > 0);

            // Build WHERE clause based on toggle
            const deletedFilter = showDeleted ? '' : 'AND p.id IS NOT NULL';

            // Summary
            const summary = await db.getFirstAsync(`
                SELECT
                    COALESCE(SUM(o.total_amount), 0) as revenue,
                    COUNT(DISTINCT o.id) as orders
                FROM orders o
                WHERE o.status = 'Completed' ${dateCondition.replace('o.created_at', 'o.created_at')}
            `);
            const rev = summary?.revenue || 0;
            const cnt = summary?.orders || 0;
            setSalesSummary({ totalRevenue: rev, totalOrders: cnt, avgOrderValue: cnt > 0 ? rev / cnt : 0 });

            // Chart: top products
            const productSalesRes = await db.getAllAsync(`
                SELECT COALESCE(p.name, 'Deleted Product') as name,
                       SUM(oi.quantity * oi.price_at_time) as total_sales
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE o.status = 'Completed' ${dateCondition} ${deletedFilter}
                GROUP BY name
                ORDER BY total_sales DESC
                LIMIT 7
            `);

            if (productSalesRes?.length > 0) {
                setChartData({
                    labels: productSalesRes.map(p => p.name.substring(0, 8)),
                    data: productSalesRes.map(p => p.total_sales)
                });
                setTopProducts(productSalesRes);
            } else {
                setChartData({ labels: ['No Data'], data: [0] });
                setTopProducts([]);
            }
        } catch (e) {
            console.error('SalesTab error:', e);
        }
        setIsLoading(false);
    };

    const chartConfig = {
        backgroundColor: '#ffffff',
        backgroundGradientFrom: '#ffffff',
        backgroundGradientTo: '#ffffff',
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
        labelColor: (opacity = 1) => `rgba(55, 65, 81, ${opacity})`,
        style: { borderRadius: 16 },
    };

    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Summary cards */}
            <View style={s.titleContainer}>
                <Text style={s.chartTitle}>Sales Today</Text>
            </View>
            <View style={s.summaryRow}>
                <View style={s.card}>
                    <Text style={s.cardLabel}>Total Revenue</Text>
                    <Text style={s.cardValue}>₱{salesSummary.totalRevenue.toFixed(2)}</Text>
                </View>
                <View style={s.card}>
                    <Text style={s.cardLabel}>Total Orders</Text>
                    <Text style={s.cardValue}>{salesSummary.totalOrders}</Text>
                </View>
                <View style={s.card}>
                    <Text style={s.cardLabel}>Avg Order Value</Text>
                    <Text style={s.cardValue}>₱{salesSummary.avgOrderValue.toFixed(2)}</Text>
                </View>
            </View>

            {/* Bar chart */}
            <View style={s.chartBox}>
                <Text style={s.chartTitle}>Top Products Revenue</Text>
                {isLoading ? (
                    <ActivityIndicator size="large" color="#10b981" style={{ marginVertical: 60 }} />
                ) : (
                    <BarChart
                        data={{ labels: chartData.labels, datasets: [{ data: chartData.data }] }}
                        width={Math.min(screenWidth * 0.72, 700)}
                        height={280}
                        yAxisLabel="₱"
                        chartConfig={chartConfig}
                        style={{ marginVertical: 8, borderRadius: 16 }}
                    />
                )}
            </View>

            {/* Top Products table */}
            {topProducts.length > 0 && (
                <View style={s.tableBox}>
                    <Text style={s.chartTitle}>Revenue Breakdown</Text>
                    <View style={s.tableHeader}>
                        <Text style={[s.tableCell, s.tableHeaderText, { flex: 2 }]}>Product</Text>
                        <Text style={[s.tableCell, s.tableHeaderText]}>Revenue</Text>
                    </View>
                    {topProducts.map((p, i) => (
                        <View key={i} style={[s.tableRow, i % 2 === 0 && s.tableRowAlt]}>
                            <View style={[s.tableCell, { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                                <View style={[s.rankBadge, i === 0 && { backgroundColor: '#fbbf24' }]}>
                                    <Text style={s.rankText}>#{i + 1}</Text>
                                </View>
                                <Text style={s.productName} numberOfLines={1}>{p.name}</Text>
                            </View>
                            <Text style={[s.tableCell, s.revenueText]}>₱{p.total_sales.toFixed(2)}</Text>
                        </View>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

const s = StyleSheet.create({
    filterRow: { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' },
    filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#e5e7eb' },
    filterBtnActive: { backgroundColor: '#1f2937' },
    filterText: { fontSize: 14, color: '#4b5563', fontWeight: '600' },
    filterTextActive: { color: '#fff' },
    toggleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto', backgroundColor: '#f0f0ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    toggleLabel: { fontSize: 13, color: '#9ca3af', fontWeight: '600' },

    summaryRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
    card: { flex: 1, backgroundColor: '#fff', padding: 22, borderRadius: 16, elevation: 2, alignItems: 'center' },
    cardLabel: { fontSize: 13, color: '#6b7280', marginBottom: 8, fontWeight: '600' },
    cardValue: { fontSize: 26, fontWeight: '800', color: '#1f2937', textAlign: 'center' },

    chartBox: { backgroundColor: '#fff', padding: 24, borderRadius: 16, elevation: 2, marginBottom: 24, alignItems: 'center' },
    chartTitle: { fontSize: 18, fontWeight: '800', color: '#374151', alignSelf: 'flex-start', marginBottom: 16 },

    tableBox: { backgroundColor: '#fff', borderRadius: 16, elevation: 2, overflow: 'hidden', marginBottom: 20 },
    tableHeader: { flexDirection: 'row', backgroundColor: '#f9fafb', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#e5e7eb' },
    tableHeaderText: { fontSize: 13, color: '#6b7280', fontWeight: '700', textTransform: 'uppercase' },
    tableRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
    tableRowAlt: { backgroundColor: '#f9fafb' },
    tableCell: { flex: 1, fontSize: 15, color: '#1f2937' },
    rankBadge: { backgroundColor: '#e5e7eb', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    rankText: { fontSize: 12, fontWeight: '700', color: '#374151' },
    productName: { fontSize: 15, color: '#1f2937', fontWeight: '600', flex: 1 },
    revenueText: { fontWeight: '700', color: '#10b981', fontSize: 15 },
});
