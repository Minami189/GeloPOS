import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Modal, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { getDBConnection } from '../../lib/database';
import { Edit2, RefreshCw, X, AlertCircle } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSyncContext } from '../../context/SyncContext';

const TIMER_OPTIONS = [
    { label: 'None', value: 0 },
    { label: 'Daily (1 Day)', value: 1 },
    { label: 'Every 2 Days', value: 2 },
    { label: 'Weekly (7 Days)', value: 7 }
];

export default function InventoryTab() {
    const { syncEpoch } = useSyncContext();
    const [ingredients, setIngredients] = useState([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [stock, setStock] = useState('');
    const [timerOption, setTimerOption] = useState(0);

    useFocusEffect(
        useCallback(() => {
            loadIngredients();
        }, [syncEpoch])
    );

    const loadIngredients = async () => {
        try {
            const db = await getDBConnection();
            const result = await db.getAllAsync('SELECT * FROM ingredients WHERE deleted_at IS NULL ORDER BY name ASC');
            setIngredients(result || []);
        } catch (error) {
            console.error("Failed to load ingredients", error);
        }
    };

    const getStatus = (item) => {
        if (!item.reset_timer_days) return { text: 'No Timer Set', color: '#6b7280', urgent: false, isLocked: false };
        if (!item.last_reset_at) return { text: 'Never Reset', color: '#ef4444', urgent: true, isLocked: false };

        const lastReset = new Date(item.last_reset_at);
        lastReset.setHours(0, 0, 0, 0);
        const nextReset = new Date(lastReset.getTime() + item.reset_timer_days * 24 * 60 * 60 * 1000);
        const now = new Date();

        if (now >= nextReset) {
            return { text: 'Needs Re-entry', color: '#ef4444', urgent: true, isLocked: false };
        }

        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const daysLeft = Math.round((nextReset.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));

        const timeLeftText = daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} Days`;
        return { text: timeLeftText, color: '#10b981', urgent: false, isLocked: true };
    };

    const handleSave = async () => {
        if (!editingItem) return;
        const newStock = parseFloat(stock);
        if (isNaN(newStock) || newStock < 0) {
            Alert.alert("Invalid Input", "Stock must be a valid positive number.");
            return;
        }

        try {
            const db = await getDBConnection();
            await db.runAsync(
                'UPDATE ingredients SET stock_quantity = ?, reset_timer_days = ?, last_reset_at = CURRENT_TIMESTAMP, synced = 0 WHERE id = ?',
                newStock, timerOption, editingItem.id
            );
            closeModal();
            loadIngredients();
        } catch (error) {
            console.error("Failed to update inventory", error);
        }
    };

    const openModal = (item) => {
        setEditingItem(item);
        setStock(item.stock_quantity.toString());
        setTimerOption(item.reset_timer_days || 0);
        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false);
        setEditingItem(null);
    };

    const handleReentryPress = (item, status) => {
        if (status.isLocked) {
            if (Platform.OS === 'web') {
                if (window.confirm("Reset Interval has not yet ended. Still Edit?")) {
                    openModal(item);
                }
            } else {
                Alert.alert(
                    "Timer Active",
                    "Reset Interval has not yet ended. Still Edit?",
                    [
                        { text: "Cancel", style: "cancel" },
                        { text: "Edit", onPress: () => openModal(item) }
                    ]
                );
            }
        } else {
            openModal(item);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Inventory Management</Text>
            </View>

            <View style={styles.tableHeader}>
                <Text style={[styles.tableCol, { flex: 2 }]}>Ingredient</Text>
                <Text style={[styles.tableCol, { flex: 1 }]}>Current Stock</Text>
                <Text style={[styles.tableCol, { flex: 1.5 }]}>Reset Interval</Text>
                <Text style={[styles.tableCol, { flex: 1.5 }]}>Status</Text>
                <Text style={[styles.tableCol, styles.actionsCol]}>Actions</Text>
            </View>

            <FlatList
                data={ingredients}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item }) => {
                    const status = getStatus(item);
                    return (
                        <View style={[styles.tableRow, status.urgent && { backgroundColor: '#fef2f2' }]}>
                            <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
                                {status.urgent && <AlertCircle color="#ef4444" size={16} style={{ marginRight: 6 }} />}
                                <Text style={[styles.cellText, { fontWeight: 'bold' }]}>{item.name}</Text>
                            </View>
                            <Text style={[styles.cellText, { flex: 1 }]}>{item.stock_quantity.toFixed(2)} {item.unit}</Text>

                            <Text style={[styles.cellText, { flex: 1.5, color: '#6b7280' }]}>
                                {TIMER_OPTIONS.find(o => o.value === item.reset_timer_days)?.label || 'Unknown'}
                            </Text>

                            <View style={{ flex: 1.5 }}>
                                <Text style={[styles.statusBadge, { color: status.color, borderColor: status.color }]}>
                                    {status.text}
                                </Text>
                            </View>

                            <View style={[styles.tableCol, styles.actionsCol, { flexDirection: 'row', gap: 15 }]}>
                                <TouchableOpacity
                                    style={styles.actionBtn}
                                    onPress={() => handleReentryPress(item, status)}
                                >
                                    <RefreshCw color="#3b82f6" size={16} />
                                    <Text style={styles.actionBtnText}>Re-entry</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    );
                }}
            />

            <Modal visible={modalVisible} transparent animationType="fade">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Re-entry Stock: {editingItem?.name}</Text>
                            <TouchableOpacity onPress={closeModal}>
                                <X color="#6b7280" size={24} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.label}>New Stock Quantity ({editingItem?.unit})</Text>
                        <TextInput style={styles.input} value={stock} onChangeText={setStock} keyboardType="numeric" />

                        <Text style={styles.label}>Reset Timer Interval</Text>
                        <View style={styles.timerOptionsContainer}>
                            {TIMER_OPTIONS.map(opt => (
                                <TouchableOpacity
                                    key={opt.value}
                                    style={[styles.timerOptionBtn, timerOption === opt.value && styles.timerOptionActive]}
                                    onPress={() => setTimerOption(opt.value)}
                                >
                                    <Text style={[styles.timerOptionText, timerOption === opt.value && styles.timerOptionTextActive]}>
                                        {opt.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={styles.noteText}>
                            Saving will update the stock and reset the timer starting from today.
                        </Text>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                                <Text style={styles.saveButtonText}>Save & Reset Clock</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },

    tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e5e7eb', paddingBottom: 10, marginBottom: 10 },
    tableCol: { flex: 1, color: '#6b7280', fontSize: 14, fontWeight: '500' },
    tableRow: { flexDirection: 'row', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#f3f4f6', alignItems: 'center', paddingHorizontal: 5, borderRadius: 8 },
    cellText: { flex: 1, color: '#374151', fontSize: 14 },
    actionsCol: { alignItems: 'flex-end', paddingRight: 10 },

    statusBadge: { fontSize: 13, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start' },

    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
    actionBtnText: { color: '#3b82f6', fontSize: 13, fontWeight: '600' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: 500, backgroundColor: '#fff', borderRadius: 12, padding: 30, elevation: 5 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },

    label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 15 },
    input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 15, color: '#1f2937' },

    timerOptionsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 5 },
    timerOptionBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
    timerOptionActive: { backgroundColor: '#1f2937', borderColor: '#1f2937' },
    timerOptionText: { fontSize: 13, color: '#4b5563', fontWeight: '500' },
    timerOptionTextActive: { color: '#fff' },

    noteText: { marginTop: 20, fontSize: 13, color: '#6b7280', fontStyle: 'italic', textAlign: 'center' },

    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 30, gap: 15 },
    cancelButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db' },
    cancelButtonText: { color: '#374151', fontWeight: 'bold' },
    saveButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#3b82f6' },
    saveButtonText: { color: '#fff', fontWeight: 'bold' }
});
