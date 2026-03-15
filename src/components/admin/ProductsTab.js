import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, Modal, Image, ScrollView, Alert } from 'react-native';
import { getDBConnection } from '../../lib/database';
import { deleteRecordFromSupabase } from '../../lib/syncService';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, X, UploadCloud, ChevronDown } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

const DropdownPicker = ({ label, items, selectedId, onSelect, displayKey = "name", valueKey = "id", placeholder = "Select..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <View style={{ marginBottom: 15 }}>
            {label && <Text style={styles.label}>{label}</Text>}
            <TouchableOpacity
                style={[styles.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9fafb', marginTop: label ? 0 : 5 }]}
                onPress={() => setIsOpen(!isOpen)}
            >
                <Text style={{ color: selectedId ? '#1f2937' : '#6b7280' }}>
                    {items.find(i => i[valueKey] === selectedId)?.[displayKey] || placeholder}
                </Text>
                <ChevronDown size={20} color="#6b7280" />
            </TouchableOpacity>
            {isOpen && (
                <View style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, marginTop: 5, backgroundColor: '#fff', maxHeight: 150 }}>
                    <ScrollView nestedScrollEnabled={true}>
                        {items.map(item => (
                            <TouchableOpacity
                                key={item[valueKey]}
                                style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
                                onPress={() => { onSelect(item[valueKey]); setIsOpen(false); }}
                            >
                                <Text style={{ color: '#374151' }}>{item[displayKey]}</Text>
                            </TouchableOpacity>
                        ))}
                        {items.length === 0 && <Text style={{ padding: 12, color: '#9ca3af' }}>No options available.</Text>}
                    </ScrollView>
                </View>
            )}
        </View>
    );
};

export default function ProductsTab() {
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [ingredientsList, setIngredientsList] = useState([]);

    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);

    // Form States
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [imageUri, setImageUri] = useState(null);
    const [status, setStatus] = useState('Available');

    // Complex States for Recipes
    const [variants, setVariants] = useState([]);
    const [newVariant, setNewVariant] = useState('');
    const [recipes, setRecipes] = useState([]); // { ingredient_id, quantity }

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const db = await getDBConnection();
            const prodRes = await db.getAllAsync('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.deleted_at IS NULL');
            const catRes = await db.getAllAsync('SELECT * FROM categories WHERE deleted_at IS NULL');
            const ingRes = await db.getAllAsync('SELECT * FROM ingredients WHERE deleted_at IS NULL');

            setProducts(prodRes || []);
            setCategories(catRes || []);
            setIngredientsList(ingRes || []);
        } catch (error) {
            console.error("Failed to load products data", error);
        }
    };

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.5,
        });

        if (!result.canceled) {
            setImageUri(result.assets[0].uri);
        }
    };

    const handleAddVariant = () => {
        if (newVariant.trim()) {
            setVariants([...variants, { name: newVariant.trim(), ingredient_id: null, quantity: 1 }]);
            setNewVariant('');
        }
    };

    const updateVariantIngredient = (index, id) => {
        let newVars = [...variants];
        newVars[index].ingredient_id = id ? Number(id) : null;
        setVariants(newVars);
    };

    const updateVariantQuantity = (index, val) => {
        let newVars = [...variants];
        newVars[index].quantity = parseFloat(val) || 1;
        setVariants(newVars);
    };

    const handleAddRecipeIngredient = () => {
        if (ingredientsList.length > 0) {
            setRecipes([...recipes, { ingredient_id: parseInt(ingredientsList[0].id, 10), quantity: 1 }]);
        }
    };

    const updateRecipeQuantity = (index, val) => {
        let newRecipes = [...recipes];
        newRecipes[index].quantity = parseFloat(val) || 0;
        setRecipes(newRecipes);
    };

    const updateRecipeIngredient = (index, id) => {
        let newRecipes = [...recipes];
        newRecipes[index].ingredient_id = Number(id);
        setRecipes(newRecipes);
    };

    const removeRecipeIngredient = (index) => {
        setRecipes(recipes.filter((_, i) => i !== index));
    };

    const removeVariant = (index) => {
        setVariants(variants.filter((_, i) => i !== index));
    };

    const handleSave = async () => {
        if (!name || !price) {
            Alert.alert("Validation", "Name and Price are required.");
            return;
        }

        // Validate that all recipe ingredient IDs are valid numbers
        for (const r of recipes) {
            const ingId = Number(r.ingredient_id);
            if (!ingId || isNaN(ingId)) {
                Alert.alert("Validation", "One or more recipe ingredients is invalid. Please re-select the ingredient.");
                return;
            }
        }

        try {
            const db = await getDBConnection();

            // Validate Category if set
            if (categoryId) {
                const catExists = await db.getFirstAsync('SELECT id FROM categories WHERE id = ?', categoryId);
                if (!catExists) {
                    Alert.alert("Error", `Selected category does not exist. Please re-select.`);
                    return;
                }
            }

            // Verify every ingredient_id actually exists in the DB before inserting
            for (const r of recipes) {
                const ingId = Number(r.ingredient_id);
                const exists = await db.getFirstAsync('SELECT id FROM ingredients WHERE id = ?', ingId);
                if (!exists) {
                    Alert.alert("Error", `Ingredient with ID ${ingId} was not found in the database. Please remove it and re-add it.`);
                    return;
                }
            }

            if (editingItem) {
                try {
                    await db.runAsync(
                        'UPDATE products SET name = ?, price = ?, category_id = ?, image_uri = ?, status = ? WHERE id = ?',
                        name, parseFloat(price), categoryId || null, imageUri, status, editingItem.id
                    );
                } catch (e) {
                    throw new Error("Failed to update product details: " + e.message);
                }

                // Disconnect foreign keys from historical orders BEFORE wiping variants
                try {
                    await db.runAsync(`UPDATE order_items SET variant_id = NULL WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = ?)`, editingItem.id);
                } catch (e) {
                    throw new Error("Failed to disconnect old variants from orders: " + e.message);
                }

                try {
                    // Delete and re-insert variants / recipes
                    await db.runAsync('DELETE FROM product_variants WHERE product_id = ?', editingItem.id);
                    await db.runAsync('DELETE FROM recipes WHERE product_id = ?', editingItem.id);
                } catch (e) {
                    throw new Error("Failed to wipe old variants and recipes: " + e.message);
                }

                for (let v of variants) {
                    try {
                        const varRes = await db.runAsync('INSERT INTO product_variants (product_id, name) VALUES (?, ?)', editingItem.id, v.name);
                        if (v.ingredient_id) {
                            await db.runAsync('INSERT INTO recipes (product_id, variant_id, ingredient_id, quantity) VALUES (?, ?, ?, ?)', editingItem.id, varRes.lastInsertRowId, Number(v.ingredient_id), v.quantity || 1);
                        }
                    } catch (e) {
                        throw new Error(`Failed to insert variant ${v.name}: ` + e.message);
                    }
                }
                for (let r of recipes) {
                    try {
                        await db.runAsync('INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES (?, ?, ?)', editingItem.id, Number(r.ingredient_id), r.quantity);
                    } catch (e) {
                        throw new Error(`Failed to insert recipe for ingredient ID ${r.ingredient_id}: ` + e.message);
                    }
                }

            } else {
                let newProductId;
                try {
                    const result = await db.runAsync(
                        'INSERT INTO products (name, price, category_id, image_uri, status) VALUES (?, ?, ?, ?, ?)',
                        name, parseFloat(price), categoryId || null, imageUri, status
                    );
                    newProductId = result.lastInsertRowId;
                } catch (e) {
                    throw new Error("Failed to create new product: " + e.message);
                }

                for (let v of variants) {
                    try {
                        const varRes = await db.runAsync('INSERT INTO product_variants (product_id, name) VALUES (?, ?)', newProductId, v.name);
                        if (v.ingredient_id) {
                            await db.runAsync('INSERT INTO recipes (product_id, variant_id, ingredient_id, quantity) VALUES (?, ?, ?, ?)', newProductId, varRes.lastInsertRowId, Number(v.ingredient_id), v.quantity || 1);
                        }
                    } catch (e) {
                        throw new Error(`Failed to insert variant ${v.name}: ` + e.message);
                    }
                }
                for (let r of recipes) {
                    try {
                        await db.runAsync('INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES (?, ?, ?)', newProductId, Number(r.ingredient_id), r.quantity);
                    } catch (e) {
                        throw new Error(`Failed to insert recipe for ingredient ID ${r.ingredient_id} on new product: ` + e.message);
                    }
                }
            }
            closeModal();
            loadData();
        } catch (error) {
            console.error("Failed to save product", error);
            Alert.alert("Save Failed", error.message || "An unknown error occurred while saving the product.");
        }
    };

    const handleDelete = (id) => {
        Alert.alert(
            "Delete Product",
            "Are you sure you want to delete this product? This will also delete it from the Cloud database.",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            const db = await getDBConnection();

                            // Prevent Foreign Key constraint failures by detaching in SQLite
                            await db.runAsync('UPDATE order_items SET product_id = NULL, variant_id = NULL WHERE product_id = ?', id);

                            // Soft delete to track offline
                            await db.runAsync('UPDATE products SET deleted_at = CURRENT_TIMESTAMP, synced = 0 WHERE id = ?', id);

                            // Let syncService handle updating Supabase

                            loadData();
                        } catch (error) {
                            console.error("Failed to delete product", error);
                        }
                    }
                }
            ]
        );
    };

    const openModal = async (item = null) => {
        try {
            const db = await getDBConnection();

            // Always reload ingredients and categories fresh so newly-added ones are available
            const freshIngredients = await db.getAllAsync('SELECT * FROM ingredients WHERE deleted_at IS NULL ORDER BY name ASC');
            setIngredientsList(freshIngredients || []);

            const freshCategories = await db.getAllAsync('SELECT * FROM categories WHERE deleted_at IS NULL');
            setCategories(freshCategories || []);

            if (item) {
                setEditingItem(item);
                setName(item.name);
                setPrice(item.price.toString());
                setCategoryId(item.category_id);
                setImageUri(item.image_uri);
                setStatus(item.status || 'Available');

                const vars = await db.getAllAsync('SELECT * FROM product_variants WHERE product_id = ?', item.id);
                const recs = await db.getAllAsync('SELECT * FROM recipes WHERE product_id = ? AND variant_id IS NULL', item.id);
                const varRecs = await db.getAllAsync('SELECT * FROM recipes WHERE product_id = ? AND variant_id IS NOT NULL', item.id);

                const loadedVariants = (vars || []).map(v => {
                    const vr = (varRecs || []).find(r => r.variant_id === v.id);
                    return {
                        ...v,
                        ingredient_id: vr ? Number(vr.ingredient_id) : null,
                        quantity: vr ? vr.quantity : 1
                    };
                });

                setVariants(loadedVariants);
                // Ensure ingredient_ids are proper numbers when loading from DB
                setRecipes((recs || []).map(r => ({ ...r, ingredient_id: Number(r.ingredient_id) })));
            } else {
                setEditingItem(null);
                setName('');
                setPrice('');
                setCategoryId(categories.length > 0 ? categories[0].id : null);
                setImageUri(null);
                setStatus('Available');
                setVariants([]);
                setRecipes([]);
                setNewVariant('');
            }
            setModalVisible(true);
        } catch (e) {
            console.error("Error opening modal", e);
        }
    };

    const closeModal = () => {
        setModalVisible(false);
        setEditingItem(null);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Products</Text>
                <TouchableOpacity style={styles.addButton} onPress={() => openModal()}>
                    <Plus color="#1f2937" size={20} />
                    <Text style={styles.addButtonText}>Add Product</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.tableHeader}>
                <Text style={[styles.tableCol, { flex: 1 }]}>Image</Text>
                <Text style={[styles.tableCol, { flex: 2 }]}>Name</Text>
                <Text style={styles.tableCol}>Category</Text>
                <Text style={styles.tableCol}>Price</Text>
                <Text style={styles.tableCol}>Status</Text>
                <Text style={[styles.tableCol, styles.actionsCol]}>Actions</Text>
            </View>

            <FlatList
                data={products}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item }) => (
                    <View style={styles.tableRow}>
                        <View style={{ flex: 1 }}>
                            {item.image_uri ?
                                <Image source={{ uri: item.image_uri }} style={styles.thumbnail} /> :
                                <View style={styles.thumbnailPlaceholder} />
                            }
                        </View>
                        <Text style={[styles.cellText, { flex: 2, fontWeight: 'bold' }]}>{item.name}</Text>
                        <Text style={styles.cellText}>{item.category_name || 'Uncategorized'}</Text>
                        <Text style={styles.cellText}>₱{item.price.toFixed(2)}</Text>
                        <Text style={styles.cellText}>{item.status}</Text>
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

            <Modal visible={modalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{editingItem ? 'Edit Product' : 'Add Product'}</Text>
                            <TouchableOpacity onPress={closeModal}>
                                <X color="#6b7280" size={24} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={{ maxHeight: '80%' }} showsVerticalScrollIndicator={false}>
                            <Text style={styles.label}>Product Name</Text>
                            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Enter product name" />

                            <Text style={styles.label}>Price (₱)</Text>
                            <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="0.00" />

                            <DropdownPicker
                                label="Category"
                                items={categories}
                                selectedId={categoryId}
                                onSelect={setCategoryId}
                                placeholder="Select Category"
                            />

                            <Text style={styles.label}>Product Image</Text>
                            <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
                                {imageUri ? <Image source={{ uri: imageUri }} style={styles.previewImage} /> :
                                    <View style={styles.imagePickerContent}>
                                        <UploadCloud color="#6b7280" size={24} />
                                        <Text style={styles.imagePickerText}>Upload Image</Text>
                                    </View>
                                }
                            </TouchableOpacity>

                            <Text style={styles.label}>Variants (e.g., Spicy, Regular)</Text>
                            <View style={styles.variantInputRow}>
                                <TextInput style={[styles.input, { flex: 1, marginTop: 0 }]} value={newVariant} onChangeText={setNewVariant} placeholder="Add variant" />
                                <TouchableOpacity style={styles.addVariantBtn} onPress={handleAddVariant}>
                                    <Plus color="#fff" size={20} />
                                </TouchableOpacity>
                            </View>
                            <View style={{ marginTop: 10 }}>
                                {variants.map((v, i) => (
                                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' }}>
                                        <View style={{ flex: 1, marginRight: 10 }}>
                                            <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#374151', marginBottom: 5 }}>{v.name}</Text>
                                            <DropdownPicker
                                                items={[{ id: null, name: "No Ingredient (Leave Empty)" }, ...ingredientsList]}
                                                selectedId={v.ingredient_id}
                                                onSelect={(id) => updateVariantIngredient(i, id)}
                                                placeholder="Link Ingredient (Optional)"
                                            />
                                        </View>
                                        {v.ingredient_id && (
                                            <TextInput
                                                style={[styles.input, { width: 60, marginRight: 10, textAlign: 'center' }]}
                                                value={v.quantity?.toString()}
                                                onChangeText={(val) => updateVariantQuantity(i, val)}
                                                keyboardType="numeric"
                                                placeholder="Qty"
                                            />
                                        )}
                                        <TouchableOpacity onPress={() => removeVariant(i)} style={{ padding: 8, backgroundColor: '#fee2e2', borderRadius: 8 }}>
                                            <Trash2 color="#ef4444" size={20} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>

                            <View style={[styles.header, { marginTop: 20 }]}>
                                <Text style={styles.label}>Recipe Ingredients</Text>
                                <TouchableOpacity style={styles.addRecipeBtn} onPress={handleAddRecipeIngredient}>
                                    <Plus color="#374151" size={16} />
                                    <Text style={styles.addRecipeText}>Add Ingredient</Text>
                                </TouchableOpacity>
                            </View>

                            {recipes.map((r, i) => (
                                <View key={i} style={styles.recipeRow}>
                                    <View style={{ flex: 2 }}>
                                        <DropdownPicker
                                            items={ingredientsList}
                                            selectedId={r.ingredient_id}
                                            onSelect={(id) => updateRecipeIngredient(i, id)}
                                            placeholder="Select Ingredient"
                                        />
                                    </View>
                                    <TextInput style={[styles.input, { flex: 1, marginHorizontal: 10, alignSelf: 'flex-start', marginTop: 5 }]} value={r.quantity.toString()} onChangeText={(val) => updateRecipeQuantity(i, val)} keyboardType="numeric" placeholder="Qty" />
                                    <TouchableOpacity style={{ alignSelf: 'flex-start', marginTop: 15 }} onPress={() => removeRecipeIngredient(i)}>
                                        <Trash2 color="#ef4444" size={20} />
                                    </TouchableOpacity>
                                </View>
                            ))}

                        </ScrollView>

                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.cancelButton} onPress={closeModal}>
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                                <Text style={styles.saveButtonText}>{editingItem ? 'Update Product' : 'Create Product'}</Text>
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

    thumbnail: { width: 40, height: 40, borderRadius: 8 },
    thumbnailPlaceholder: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#e5e7eb' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { width: 600, maxHeight: '95%', backgroundColor: '#fff', borderRadius: 12, padding: 30, elevation: 5 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },

    label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8, marginTop: 15 },
    input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, fontSize: 15, color: '#1f2937' },

    fakeDropdown: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, backgroundColor: '#f9fafb' },

    imagePicker: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, borderStyle: 'dashed', height: 100, justifyContent: 'center', alignItems: 'center', marginTop: 5 },
    imagePickerContent: { alignItems: 'center', gap: 5 },
    imagePickerText: { color: '#6b7280', fontSize: 14 },
    previewImage: { width: '100%', height: '100%', borderRadius: 8, resizeMode: 'cover' },

    variantInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    addVariantBtn: { backgroundColor: '#1f2937', padding: 12, borderRadius: 8 },
    badgesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
    badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
    badgeText: { fontSize: 12, color: '#374151' },

    addRecipeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    addRecipeText: { fontSize: 14, fontWeight: '600', color: '#374151' },
    recipeRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 5 },

    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 30, gap: 15 },
    cancelButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db' },
    cancelButtonText: { color: '#374151', fontWeight: 'bold' },
    saveButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, backgroundColor: '#fde047' },
    saveButtonText: { color: '#1f2937', fontWeight: 'bold' }
});
