import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Package, Tags, Utensils, RefreshCw, History } from 'lucide-react-native';
import IngredientsTab from '../components/admin/IngredientsTab';
import ProductsTab from '../components/admin/ProductsTab';
import CategoriesTab from '../components/admin/CategoriesTab';
import TransactionsTab from '../components/admin/TransactionsTab';
import { syncAllToSupabase, fetchDataFromSupabase } from '../lib/syncService';
import { DownloadCloud } from 'lucide-react-native';

export default function AdminScreen() {
    const [activeTab, setActiveTab] = useState('Ingredients');
    const [isSyncing, setIsSyncing] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const [syncTrigger, setSyncTrigger] = useState(0);

    const handleSync = async () => {
        setIsSyncing(true);
        const result = await syncAllToSupabase();
        setIsSyncing(false);

        if (result.success) {
            setSyncTrigger(prev => prev + 1);
            Alert.alert("Sync Success", result.message);
        } else {
            Alert.alert("Sync Failed", result.error || "Unknown error occurred.");
        }
    };

    const handleFetch = async () => {
        setIsFetching(true);
        const result = await fetchDataFromSupabase();
        setIsFetching(false);

        if (result.success) {
            setSyncTrigger(prev => prev + 1);
            Alert.alert("Fetch Success", result.message);
        } else {
            Alert.alert("Fetch Failed", result.error || "Unknown error occurred.");
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
            <Text style={styles.headerTitle}>Admin Panel</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity style={[styles.syncBtn, { backgroundColor: '#8b5cf6' }]} onPress={handleFetch} disabled={isFetching || isSyncing}>
                        {isFetching ? <ActivityIndicator size="small" color="#fff" /> : <DownloadCloud color="#fff" size={20} />}
                        <Text style={styles.syncBtnText}>{isFetching ? 'Fetching...' : 'Fetch from Cloud'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.syncBtn} onPress={handleSync} disabled={isSyncing || isFetching}>
                        {isSyncing ? <ActivityIndicator size="small" color="#fff" /> : <RefreshCw color="#fff" size={20} />}
                        <Text style={styles.syncBtnText}>{isSyncing ? 'Syncing...' : 'Sync to Online'}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.tabsContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'Products' && styles.activeTab]}
                    onPress={() => setActiveTab('Products')}>
                    <Package color={activeTab === 'Products' ? "#1f2937" : "#6b7280"} size={20} />
                    <Text style={[styles.tabText, activeTab === 'Products' && styles.activeTabText]}>Products</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'Categories' && styles.activeTab]}
                    onPress={() => setActiveTab('Categories')}>
                    <Tags color={activeTab === 'Categories' ? "#1f2937" : "#6b7280"} size={20} />
                    <Text style={[styles.tabText, activeTab === 'Categories' && styles.activeTabText]}>Categories</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'Ingredients' && styles.activeTab]}
                    onPress={() => setActiveTab('Ingredients')}>
                    <Utensils color={activeTab === 'Ingredients' ? "#1f2937" : "#6b7280"} size={20} />
                    <Text style={[styles.tabText, activeTab === 'Ingredients' && styles.activeTabText]}>Ingredients</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'Transactions' && styles.activeTab]}
                    onPress={() => setActiveTab('Transactions')}>
                    <History color={activeTab === 'Transactions' ? "#1f2937" : "#6b7280"} size={20} />
                    <Text style={[styles.tabText, activeTab === 'Transactions' && styles.activeTabText]}>Today's Transactions</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.contentContainer}>
                {activeTab === 'Products' && <ProductsTab key={`products-${syncTrigger}`} />}
                {activeTab === 'Categories' && <CategoriesTab key={`categories-${syncTrigger}`} />}
                {activeTab === 'Ingredients' && <IngredientsTab key={`ingredients-${syncTrigger}`} />}
                {activeTab === 'Transactions' && <TransactionsTab key={`transactions-${syncTrigger}`} />}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 40, backgroundColor: '#f3f4f6' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
    headerTitle: { fontSize: 32, fontWeight: 'bold', color: '#1f2937' },
    syncBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#3b82f6', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, gap: 10 },
    syncBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    tabsContainer: {
        flexDirection: 'row',
        gap: 15,
        marginBottom: 20
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        backgroundColor: 'transparent',
        gap: 8
    },
    activeTab: {
        backgroundColor: '#ffffff',
        elevation: 1
    },
    tabText: {
        fontSize: 16,
        color: '#6b7280',
        fontWeight: '500'
    },
    activeTabText: {
        color: '#1f2937',
        fontWeight: 'bold'
    },
    contentContainer: {
        flex: 1,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 30,
        elevation: 2
    }
});
