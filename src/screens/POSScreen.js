import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, Modal, TextInput, Alert } from 'react-native';
import { getDBConnection } from '../lib/database';
import { ShoppingCart, Plus, Minus, Trash2, X, CheckCircle } from 'lucide-react-native';

export default function POSScreen() {
    const [products, setProducts] = useState([]);
    const [cart, setCart] = useState([]); // { CartItem: { product, variant, quantity, price } }

    const [selectedProduct, setSelectedProduct] = useState(null);
    const [variants, setVariants] = useState([]);
    const [variantModalVisible, setVariantModalVisible] = useState(false);

    const [paymentModalVisible, setPaymentModalVisible] = useState(false);
    const [cashReceived, setCashReceived] = useState('');
    const [orderComplete, setOrderComplete] = useState(false);

    useEffect(() => {
        loadProducts();
    }, []);

    const loadProducts = async () => {
        try {
            const db = await getDBConnection();
            const res = await db.getAllAsync('SELECT * FROM products WHERE status = "Available"');
            setProducts(res || []);
        } catch (e) { console.error("Failed to load POS products", e); }
    };

    const handleProductSelect = async (product) => {
        try {
            const db = await getDBConnection();
            const vars = await db.getAllAsync('SELECT * FROM product_variants WHERE product_id = ?', product.id);

            if (vars && vars.length > 0) {
                setSelectedProduct(product);
                setVariants(vars);
                setVariantModalVisible(true);
            } else {
                addToCart(product, null);
            }
        } catch (e) { console.error("Failed to get variants", e); }
    };

    const addToCart = (product, variant) => {
        setCart(prev => {
            const index = prev.findIndex(item => item.product.id === product.id && item.variant?.id === variant?.id);
            if (index !== -1) {
                const newCart = [...prev];
                newCart[index].quantity += 1;
                return newCart;
            } else {
                return [...prev, { product, variant, quantity: 1, price: product.price }];
            }
        });
        setVariantModalVisible(false);
    };

    const updateQuantity = (index, delta) => {
        setCart(prev => {
            const newCart = [...prev];
            const newQ = newCart[index].quantity + delta;
            if (newQ > 0) {
                newCart[index].quantity = newQ;
                return newCart;
            }
            return prev;
        });
    };

    const removeCartItem = (index) => {
        setCart(prev => prev.filter((_, i) => i !== index));
    };

    const totalAmount = useMemo(() => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0), [cart]);

    const handleCheckout = () => {
        if (cart.length === 0) return;
        setCashReceived('');
        setOrderComplete(false);
        setPaymentModalVisible(true);
    };

    const changeAmount = useMemo(() => {
        const cash = parseFloat(cashReceived) || 0;
        return cash - totalAmount;
    }, [cashReceived, totalAmount]);

    const submitOrder = async () => {
        const cash = parseFloat(cashReceived) || 0;
        if (cash < totalAmount) {
            Alert.alert("Insufficient Cash", "The cash received is less than the total amount.");
            return;
        }

        try {
            const db = await getDBConnection();

            // Deduct stock for ingredients
            for (let item of cart) {
                // Get recipe for this product/variant
                let recs;
                if (item.variant) {
                    recs = await db.getAllAsync('SELECT * FROM recipes WHERE product_id = ? AND variant_id = ?', item.product.id, item.variant.id);
                } else {
                    recs = await db.getAllAsync('SELECT * FROM recipes WHERE product_id = ? AND variant_id IS NULL', item.product.id);
                }

                // For each recipe item, subtract quantity * ordered_quantity from stock
                for (let r of recs) {
                    const totalUsed = r.quantity * item.quantity;
                    await db.runAsync('UPDATE ingredients SET stock_quantity = stock_quantity - ? WHERE id = ?', totalUsed, r.ingredient_id);
                }
            }

            // Create Order
            const res = await db.runAsync(
                'INSERT INTO orders (total_amount, cash_received, change_amount, status) VALUES (?, ?, ?, "Pending")',
                totalAmount, cash, changeAmount
            );
            const orderId = res.lastInsertRowId;

            // Create Order Items
            for (let item of cart) {
                await db.runAsync(
                    'INSERT INTO order_items (order_id, product_id, variant_id, quantity, price_at_time) VALUES (?, ?, ?, ?, ?)',
                    orderId, item.product.id, item.variant ? item.variant.id : null, item.quantity, item.price
                );
            }

            setOrderComplete(true);
            setCart([]);
            setTimeout(() => {
                setPaymentModalVisible(false);
                setOrderComplete(false);
            }, 3000);

        } catch (e) { console.error("Failed to submit order", e); }
    };

    return (
        <View style={styles.container}>
            {/* Products Grid */}
            <View style={styles.productsSection}>
                <Text style={styles.title}>All Products</Text>
                <FlatList
                    data={products}
                    numColumns={3}
                    keyExtractor={item => item.id.toString()}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.productCard} onPress={() => handleProductSelect(item)}>
                            {item.image_uri ?
                                <Image source={{ uri: item.image_uri }} style={styles.productImage} /> :
                                <View style={styles.productPlaceholder} />
                            }
                            <Text numberOfLines={2} style={styles.productName}>{item.name}</Text>
                            <Text style={styles.productPrice}>₱{item.price.toFixed(2)}</Text>
                        </TouchableOpacity>
                    )}
                />
            </View>

            {/* Cart Sidebar */}
            <View style={styles.cartSection}>
                <View style={styles.cartHeader}>
                    <ShoppingCart color="#1f2937" size={24} />
                    <Text style={styles.cartTitle}>Current Order</Text>
                </View>

                <FlatList
                    data={cart}
                    keyExtractor={(_, i) => i.toString()}
                    style={styles.cartList}
                    renderItem={({ item, index }) => (
                        <View style={styles.cartItem}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.cartItemName}>{item.product.name} {item.variant ? `(${item.variant.name})` : ''}</Text>
                                <Text style={styles.cartItemPrice}>₱{(item.price).toFixed(2)}</Text>
                            </View>
                            <View style={styles.qtyControls}>
                                <TouchableOpacity onPress={() => updateQuantity(index, -1)} style={styles.qtyBtn}><Minus size={16} color="#4b5563" /></TouchableOpacity>
                                <Text style={styles.qtyText}>{item.quantity}</Text>
                                <TouchableOpacity onPress={() => updateQuantity(index, 1)} style={styles.qtyBtn}><Plus size={16} color="#4b5563" /></TouchableOpacity>
                            </View>
                            <TouchableOpacity onPress={() => removeCartItem(index)} style={{ marginLeft: 10 }}>
                                <Trash2 color="#ef4444" size={20} />
                            </TouchableOpacity>
                        </View>
                    )}
                />

                <View style={styles.cartFooter}>
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Total</Text>
                        <Text style={styles.totalValue}>₱{totalAmount.toFixed(2)}</Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.checkoutBtn, cart.length === 0 && styles.disabledBtn]}
                        disabled={cart.length === 0}
                        onPress={handleCheckout}>
                        <Text style={styles.checkoutBtnText}>Payment</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Modals */}
            <Modal visible={variantModalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.variantModal}>
                        <Text style={styles.modalTitle}>Select Variant</Text>
                        {variants.map(v => (
                            <TouchableOpacity key={v.id} style={styles.variantItem} onPress={() => addToCart(selectedProduct, v)}>
                                <Text style={styles.variantItemText}>{v.name}</Text>
                                <Text style={styles.variantItemText}>₱{selectedProduct?.price.toFixed(2)}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity style={{ marginTop: 20 }} onPress={() => setVariantModalVisible(false)}>
                            <Text style={{ color: '#ef4444', textAlign: 'center', fontWeight: 'bold' }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={paymentModalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    {orderComplete ? (
                        <View style={[styles.paymentModal, { alignItems: 'center', justifyContent: 'center' }]}>
                            <CheckCircle color="#10b981" size={60} />
                            <Text style={[styles.modalTitle, { marginTop: 20 }]}>Payment Complete!</Text>
                            <Text style={{ color: '#4b5563', fontSize: 16, marginTop: 10 }}>Change: <Text style={{ fontWeight: 'bold', color: '#1f2937' }}>₱{changeAmount.toFixed(2)}</Text></Text>
                            <Text style={{ color: '#6b7280', marginTop: 15 }}>Sending to Kitchen Queue...</Text>
                        </View>
                    ) : (
                        <View style={styles.paymentModal}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Checkout</Text>
                                <TouchableOpacity onPress={() => setPaymentModalVisible(false)}>
                                    <X color="#6b7280" size={24} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.billSummary}>
                                <Text style={styles.billTotalText}>Total Amount Due</Text>
                                <Text style={styles.billTotalAmount}>₱{totalAmount.toFixed(2)}</Text>
                            </View>

                            <Text style={styles.label}>Cash Received (₱)</Text>
                            <TextInput
                                style={[styles.input, { fontSize: 30, paddingVertical: 15, fontWeight: 'bold' }]}
                                value={cashReceived}
                                onChangeText={setCashReceived}
                                keyboardType="numeric"
                                autoFocus
                            />

                            <View style={[styles.billSummary, { backgroundColor: 'transparent', flexRow: 'row', justifyContent: 'space-between', marginTop: 30 }]}>
                                <Text style={{ fontSize: 20, color: '#4b5563' }}>Change:</Text>
                                <Text style={{ fontSize: 28, fontWeight: 'bold', color: changeAmount < 0 ? '#ef4444' : '#10b981' }}>
                                    ₱{changeAmount < 0 ? '0.00' : changeAmount.toFixed(2)}
                                </Text>
                            </View>

                            <View style={styles.modalActions}>
                                <TouchableOpacity style={[styles.saveButton, { flex: 1, height: 60, justifyContent: 'center' }]} onPress={submitOrder}>
                                    <Text style={[styles.saveButtonText, { fontSize: 18 }]}>Complete Order</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, flexDirection: 'row' },

    productsSection: { flex: 2, backgroundColor: '#f3f4f6', padding: 30 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#1f2937', marginBottom: 20 },

    productCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 15, margin: 10, alignItems: 'center', elevation: 2, height: 180 },
    productImage: { width: 80, height: 80, borderRadius: 40, marginBottom: 15 },
    productPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#e5e7eb', marginBottom: 15 },
    productName: { fontSize: 16, fontWeight: 'bold', color: '#374151', textAlign: 'center', marginBottom: 5 },
    productPrice: { fontSize: 14, color: '#10b981', fontWeight: 'bold' },

    cartSection: { flex: 1, backgroundColor: '#ffffff', borderLeftWidth: 1, borderColor: '#e5e7eb', elevation: 5 },
    cartHeader: { flexDirection: 'row', alignItems: 'center', padding: 25, borderBottomWidth: 1, borderColor: '#e5e7eb', gap: 10 },
    cartTitle: { fontSize: 22, fontWeight: 'bold', color: '#1f2937' },

    cartList: { flex: 1, padding: 20 },
    cartItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 25 },
    cartItemName: { fontSize: 16, fontWeight: 'bold', color: '#1f2937' },
    cartItemPrice: { fontSize: 14, color: '#6b7280', marginTop: 2 },
    qtyControls: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 5 },
    qtyBtn: { padding: 8 },
    qtyText: { marginHorizontal: 10, fontSize: 16, fontWeight: 'bold' },

    cartFooter: { padding: 25, borderTopWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    totalLabel: { fontSize: 20, color: '#4b5563', fontWeight: 'bold' },
    totalValue: { fontSize: 28, color: '#1f2937', fontWeight: 'bold' },
    checkoutBtn: { backgroundColor: '#10b981', paddingVertical: 18, borderRadius: 12, alignItems: 'center' },
    disabledBtn: { backgroundColor: '#9ca3af' },
    checkoutBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    variantModal: { width: 350, backgroundColor: '#fff', borderRadius: 12, padding: 25 },
    variantItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#f3f4f6' },
    variantItemText: { fontSize: 16, fontWeight: '500', color: '#374151' },

    paymentModal: { width: 500, backgroundColor: '#fff', borderRadius: 16, padding: 35, elevation: 10 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#1f2937' },

    billSummary: { backgroundColor: '#f3f4f6', padding: 20, borderRadius: 12, alignItems: 'center', marginBottom: 30 },
    billTotalText: { fontSize: 16, color: '#6b7280', marginBottom: 5 },
    billTotalAmount: { fontSize: 36, fontWeight: 'bold', color: '#1f2937' },

    label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
    input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 15, color: '#1f2937' },

    modalActions: { flexDirection: 'row', justifyContent: 'center', marginTop: 40 },
    saveButton: { borderRadius: 12, backgroundColor: '#10b981', alignItems: 'center' },
    saveButtonText: { color: '#fff', fontWeight: 'bold' }
});
