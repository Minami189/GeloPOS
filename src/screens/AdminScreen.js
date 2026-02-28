import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Package, Tags, Utensils } from 'lucide-react-native';
import IngredientsTab from '../components/admin/IngredientsTab';
import ProductsTab from '../components/admin/ProductsTab';
import CategoriesTab from '../components/admin/CategoriesTab';

export default function AdminScreen() {
    const [activeTab, setActiveTab] = useState('Ingredients');

    return (
        <View style={styles.container}>
            <Text style={styles.headerTitle}>Admin Panel</Text>

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
            </View>

            <View style={styles.contentContainer}>
                {activeTab === 'Products' && <ProductsTab />}
                {activeTab === 'Categories' && <CategoriesTab />}
                {activeTab === 'Ingredients' && <IngredientsTab />}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 40, backgroundColor: '#f3f4f6' },
    headerTitle: { fontSize: 32, fontWeight: 'bold', color: '#1f2937', marginBottom: 30 },
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
