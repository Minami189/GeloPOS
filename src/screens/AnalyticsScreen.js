import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDBConnection } from '../lib/database';
import { syncAllToSupabase, fetchOrdersFromSupabase } from '../lib/syncService';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { RefreshCw, TrendingUp, Sparkles, DownloadCloud } from 'lucide-react-native';
import AdminAuthGate from '../components/admin/AdminAuthGate';

const screenWidth = Dimensions.get('window').width;

export default function AnalyticsScreen() {
    const [salesSummary, setSalesSummary] = useState({ totalRevenue: 0, totalOrders: 0, avgOrderValue: 0 });
    const [chartData, setChartData] = useState({ labels: [], data: [] });
    const [isSyncing, setIsSyncing] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [filterPeriod, setFilterPeriod] = useState('All Time'); // 'All Time', 'Today', 'This Month'

    const [aiSuggestions, setAiSuggestions] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);

    useFocusEffect(
        useCallback(() => {
            loadAnalytics();
        }, [filterPeriod])
    );

    const loadAnalytics = async () => {
        try {
            const db = await getDBConnection();
            let dateCondition = "";
            if (filterPeriod === 'Today') {
                dateCondition = "AND DATE(created_at) = DATE('now', 'localtime')";
            } else if (filterPeriod === 'This Month') {
                dateCondition = "AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')";
            }

            // Basic Summary
            const summaryRes = await db.getAllAsync(`
                SELECT 
                    SUM(total_amount) as revenue, 
                    COUNT(id) as orders
                FROM orders 
                WHERE status = 'Completed' ${dateCondition}
            `);

            const rev = summaryRes[0]?.revenue || 0;
            const cnt = summaryRes[0]?.orders || 0;

            setSalesSummary({
                totalRevenue: rev,
                totalOrders: cnt,
                avgOrderValue: cnt > 0 ? (rev / cnt) : 0
            });

            // Demo Chart Data - getting sales by product for bar chart
            const productSalesRes = await db.getAllAsync(`
                SELECT COALESCE(p.name, 'Deleted Product') as name, SUM(oi.quantity * oi.price_at_time) as total_sales
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE o.status = 'Completed' ${dateCondition.replace('created_at', 'o.created_at')}
                GROUP BY name
                ORDER BY total_sales DESC
                LIMIT 5
            `);

            if (productSalesRes && productSalesRes.length > 0) {
                setChartData({
                    labels: productSalesRes.map(p => p.name.substring(0, 10)),
                    data: productSalesRes.map(p => p.total_sales)
                });
            } else {
                setChartData({ labels: ['No Data'], data: [0] });
            }

        } catch (error) {
            console.error("Failed to load analytics", error);
        }
    };

    const handleSync = async () => {
        setIsSyncing(true);
        const result = await syncAllToSupabase();
        setIsSyncing(false);

        if (result.success) {
            Alert.alert("Sync Success", result.message);
            loadAnalytics(); // Auto-refresh UI
        } else {
            Alert.alert("Sync Failed", result.error || "Unknown error occurred.");
        }
    };

    const handleFetch = async () => {
        setIsFetching(true);
        const result = await fetchOrdersFromSupabase();
        setIsFetching(false);

        if (result.success) {
            Alert.alert("Fetch Success", result.message);
            loadAnalytics(); // Auto-refresh UI merging local and cloud data
        } else {
            Alert.alert("Fetch Failed", result.error || "Unknown error occurred.");
        }
    };

    const generateAiSuggestions = async () => {
        setIsAiLoading(true);
        try {
            // Retrieve endpoint or simulate if not provided
            const aiEndpoint = process.env.EXPO_PUBLIC_AI_ENDPOINT;

            if (aiEndpoint && aiEndpoint !== 'https://your-ai-service.com/api/suggestions') {
                const response = await fetch(aiEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        salesData: chartData.data,
                        labels: chartData.labels,
                        totalRevenue: salesSummary.totalRevenue
                    })
                });

                if (!response.ok) {
                    setAiSuggestions("Unable to generate suggestions. The AI service returned an error.");
                    setIsAiLoading(false);
                    return;
                }

                try {
                    const data = await response.json();
                    setAiSuggestions(data.suggestion || "Try offering discounts on your highest-selling items to boost volume.");
                } catch (jsonErr) {
                    console.error("AI JSON Parse Failed", jsonErr);
                    setAiSuggestions("Received invalid response format from the AI Service.");
                }

            } else {
                // Simulated response for demo
                setTimeout(() => {
                    const topItem = chartData.labels.length > 0 && chartData.labels[0] !== 'No Data' ? chartData.labels[0] : 'your products';
                    setAiSuggestions(`It looks like **${topItem}** is driving most of your revenue. Consider stocking more ingredients for this item and creating package deals to increase your Average Order Value (AOV).`);
                    setIsAiLoading(false);
                }, 1500);
                return;
            }
        } catch (error) {
            console.error("AI Gen Failed", error);
            setAiSuggestions("Unable to generate suggestions at this time. Please check your AI endpoint configuration.");
        }
        setIsAiLoading(false);
    };

    const chartConfig = {
        backgroundColor: '#ffffff',
        backgroundGradientFrom: '#ffffff',
        backgroundGradientTo: '#ffffff',
        decimalPlaces: 0,
        color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
        labelColor: (opacity = 1) => `rgba(55, 65, 81, ${opacity})`,
        style: { borderRadius: 16 },
        propsForDots: { r: "6", strokeWidth: "2", stroke: "#10b981" }
    };

    return (
        <AdminAuthGate>
            <ScrollView style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>Sales Analytics</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity style={[styles.syncBtn, { backgroundColor: '#8b5cf6' }]} onPress={handleFetch} disabled={isFetching || isSyncing}>
                            {isFetching ? <ActivityIndicator size="small" color="#fff" /> : <DownloadCloud color="#fff" size={20} />}
                            <Text style={styles.syncBtnText}>{isFetching ? 'Fetching...' : 'Fetch All'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.syncBtn} onPress={handleSync} disabled={isSyncing || isFetching}>
                            {isSyncing ? <ActivityIndicator size="small" color="#fff" /> : <RefreshCw color="#fff" size={20} />}
                            <Text style={styles.syncBtnText}>{isSyncing ? 'Syncing...' : 'Sync to Supabase'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.filterContainer}>
                    {['All Time', 'Today', 'This Month'].map(period => (
                        <TouchableOpacity
                            key={period}
                            style={[styles.filterBtn, filterPeriod === period && styles.filterBtnActive]}
                            onPress={() => setFilterPeriod(period)}
                        >
                            <Text style={[styles.filterBtnText, filterPeriod === period && styles.filterBtnTextActive]}>{period}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={styles.summaryContainer}>
                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryLabel}>Total Revenue</Text>
                        <Text style={styles.summaryValue}>₱{salesSummary.totalRevenue.toFixed(2)}</Text>
                    </View>
                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryLabel}>Total Orders</Text>
                        <Text style={styles.summaryValue}>{salesSummary.totalOrders}</Text>
                    </View>
                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryLabel}>Avg Order Value</Text>
                        <Text style={styles.summaryValue}>₱{salesSummary.avgOrderValue.toFixed(2)}</Text>
                    </View>
                </View>

                <View style={styles.chartContainer}>
                    <Text style={styles.chartTitle}>Top Products Revenue</Text>
                    <BarChart
                        data={{ labels: chartData.labels, datasets: [{ data: chartData.data }] }}
                        width={screenWidth * 0.7}
                        height={280}
                        yAxisLabel="₱"
                        chartConfig={chartConfig}
                        style={{ marginVertical: 8, borderRadius: 16 }}
                    />
                </View>

                <View style={styles.aiContainer}>
                    <View style={styles.aiHeader}>
                        <Sparkles color="#8b5cf6" size={24} />
                        <Text style={styles.aiTitle}>AI Store Suggestions</Text>
                    </View>

                    {aiSuggestions ? (
                        <View style={styles.aiResultBox}>
                            <Text style={styles.aiResultText}>{aiSuggestions}</Text>
                        </View>
                    ) : (
                        <Text style={styles.aiPlaceholder}>Get actionable insights based on your recent sales data.</Text>
                    )}

                    <TouchableOpacity style={styles.aiBtn} onPress={generateAiSuggestions} disabled={isAiLoading}>
                        {isAiLoading ? <ActivityIndicator size="small" color="#fff" /> : <TrendingUp color="#fff" size={20} />}
                        <Text style={styles.aiBtnText}>Generate Insights</Text>
                    </TouchableOpacity>
                </View>

            </ScrollView>
        </AdminAuthGate>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 40, backgroundColor: '#f3f4f6' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
    title: { fontSize: 32, fontWeight: 'bold', color: '#1f2937' },

    syncBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, gap: 10 },
    syncBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

    filterContainer: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#e5e7eb' },
    filterBtnActive: { backgroundColor: '#1f2937' },
    filterBtnText: { fontSize: 14, color: '#4b5563', fontWeight: '600' },
    filterBtnTextActive: { color: '#fff' },

    summaryContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30, gap: 20 },
    summaryCard: { flex: 1, backgroundColor: '#fff', padding: 25, borderRadius: 16, elevation: 3, alignItems: 'center' },
    summaryLabel: { fontSize: 16, color: '#6b7280', marginBottom: 10 },
    summaryValue: { fontSize: 32, fontWeight: 'bold', color: '#1f2937' },

    chartContainer: { backgroundColor: '#fff', padding: 30, borderRadius: 16, elevation: 3, marginBottom: 30, alignItems: 'center' },
    chartTitle: { fontSize: 20, fontWeight: 'bold', color: '#374151', alignSelf: 'flex-start', marginBottom: 20 },

    aiContainer: { backgroundColor: '#f5f3ff', padding: 30, borderRadius: 16, borderWidth: 1, borderColor: '#ddd6fe', marginBottom: 50 },
    aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
    aiTitle: { fontSize: 20, fontWeight: 'bold', color: '#6d28d9' },
    aiPlaceholder: { color: '#8b5cf6', fontSize: 16, marginBottom: 25 },
    aiResultBox: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 25, borderWidth: 1, borderColor: '#e4e4e7' },
    aiResultText: { fontSize: 16, color: '#374151', lineHeight: 24 },
    aiBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#8b5cf6', paddingVertical: 15, borderRadius: 12, gap: 10 },
    aiBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
