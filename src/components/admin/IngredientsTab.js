import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Modal, Alert } from 'react-native';
import { getDBConnection } from '../../lib/database';
import { deleteRecordFromSupabase } from '../../lib/syncService';
import { Plus, Edit2, Trash2, X } from 'lucide-react-native';

export default function IngredientsTab() {
    const [ingredients, setIngredients] = useState([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);

    // Form states
    const [name, setName] = useState('');
    const [unit, setUnit] = useState('');
    const [stock, setStock] = useState('');
    const [cost, setCost] = useState('');

    useEffect(() => {
        loadIngredients();
    }, []);

    const loadIngredients = async () => {
        try {
            const db = await getDBConnection();
            const result = await db.getAllAsync('SELECT * FROM ingredients WHERE deleted_at IS NULL ORDER BY name ASC');
            setIngredients(result || []);
        } catch (error) {
            console.error("Failed to load ingredients", error);
        }
    };

    const handleSave = async () => {
        if (!name || !unit) return;
        try {
            const db = await getDBConnection();
            if (editingItem) {
                await db.runAsync(
                    'UPDATE ingredients SET name = ?, unit = ?, stock_quantity = ?, cost_per_unit = ? WHERE id = ?',
                    name, unit, parseFloat(stock) || 0, parseFloat(cost) || 0, editingItem.id
                );
            } else {
                await db.runAsync(
                    'INSERT INTO ingredients (name, unit, stock_quantity, cost_per_unit) VALUES (?, ?, ?, ?)',
                    name, unit, parseFloat(stock) || 0, parseFloat(cost) || 0
                );
            }
            closeModal();
            loadIngredients();
        } catch (error) {
            console.error("Failed to save ingredient", error);
        }
    };

    const handleDelete = (id) => {
        Alert.alert(
            "Delete Ingredient",
            "Are you sure you want to delete this ingredient? This will also delete it from the Cloud database.",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Delete", 
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const db = await getDBConnection();
                            await db.runAsync('UPDATE ingredients SET deleted_at = CURRENT_TIMESTAMP, synced = 0 WHERE id = ?', id);
                            loadIngredients();
                        } catch (error) {
                            console.error("Failed to delete", error);
                        }
                    }
                }
            ]
        );
    };

    const openModal = (item = null) => {
        if (item) {
            setEditingItem(item);
            setName(item.name);
            setUnit(item.unit);
            setStock(item.stock_quantity.toString());
            setCost(item.cost_per_unit.toString());
        } else {
            setEditingItem(null);
            setName('');
            setUnit('');
            setStock('');
            setCost('');
        }
        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false);
        setEditingItem(null);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Ingredients</Text>
                <TouchableOpacity style={styles.addButton} onPress={() => openModal()}>
                    <Plus color="#1f2937" size={20} />
                    <Text style={styles.addButtonText}>Add Ingredient</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.tableHeader}>
                <Text style={[styles.tableCol, { flex: 2 }]}>Name</Text>
                <Text style={styles.tableCol}>Unit</Text>
                <Text style={styles.tableCol}>Stock</Text>
                <Text style={styles.tableCol}>Cost/Unit</Text>
                <Text style={[styles.tableCol, styles.actionsCol]}>Actions</Text>
            </View>

            <FlatList
                data={ingredients}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item }) => (
                    <View style={styles.tableRow}>
                        <Text style={[styles.cellText, { flex: 2, fontWeight: 'bold' }]}>{item.name}</Text>
                        <Text style={styles.cellText}>{item.unit}</Text>
                        <Text style={styles.cellText}>{item.stock_quantity}</Text>
                        <Text style={styles.cellText}>₱{item.cost_per_unit.toFixed(2)}</Text>
                        <View style={[styles.tableCol, styles.actionsCol, { flexDirection: 'row', gap: 15 }]}>
                            <TouchableOpacity onPress={() => openModal(item)}>
                                <Edit2 color="#6b7280" size={18} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDelete(item.id)}>
                                <Trash2 color="#ef4444" size={18} />
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
            />

            <Modal visible={modalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{editingItem ? 'Edit Ingredient' : 'Add Ingredient'}</Text>
                            <TouchableOpacity onPress={closeModal}>
                                <X color="#6b7280" size={24} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.label}>Ingredient Name</Text>
                        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Enter ingredient name" />

                        <Text style={styles.label}>Unit (g, ml, pcs, etc.)</Text>
                        <TextInput style={styles.input} value={unit} onChangeText={setUnit} placeholder="e.g. g" />

                        <Text style={styles.label}>Stock Quantity</Text>
                        <TextInput style={styles.input} value={stock} onChangeText={setStock} keyboardType="numeric" placeholder="0" />

                        <Text style={styles.label}>Cost per Unit (₱)</Text>
                        <TextInput style={styles.input} value={cost} onChangeText={setCost} keyboardType="numeric" placeholder="0" />

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                                <Text style={styles.saveButtonText}>{editingItem ? 'Update Ingredient' : 'Create Ingredient'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },
    addButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fde047', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, gap: 8 },
    addButtonText: { fontWeight: 'bold', color: '#1f2937' },

    tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e5e7eb', paddingBottom: 10, marginBottom: 10 },
    tableCol: { flex: 1, color: '#6b7280', fontSize: 14, fontWeight: '500' },
    tableRow: { flexDirection: 'row', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#f3f4f6', alignItems: 'center' },
    cellText: { flex: 1, color: '#374151', fontSize: 14 },
    actionsCol: { alignItems: 'flex-end', paddingRight: 10 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: 500, backgroundColor: '#fff', borderRadius: 12, padding: 30, elevation: 5 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },

    label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 15 },
    input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 15, color: '#1f2937' },

    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 30, gap: 15 },
    cancelButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db' },
    cancelButtonText: { color: '#374151', fontWeight: 'bold' },
    saveButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#fde047' },
    saveButtonText: { color: '#1f2937', fontWeight: 'bold' }
});
