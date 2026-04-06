import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Image, Modal, TextInput, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { getDBConnection, getDeviceId } from '../lib/database';
import { useFocusEffect } from '@react-navigation/native';
import { ShoppingCart, Plus, Minus, Trash2, X, CheckCircle, Search } from 'lucide-react-native';
import { useSyncContext } from '../context/SyncContext';
import * as Print from 'expo-print';

export default function POSScreen({ navigation }) {
    const { syncEpoch } = useSyncContext();
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [cart, setCart] = useState([]);
    const [discounts, setDiscounts] = useState([]);
    const [selectedDiscountId, setSelectedDiscountId] = useState(null);

    const [selectedCategory, setSelectedCategory] = useState(null); // null = "All"
    const [searchQuery, setSearchQuery] = useState('');

    const [selectedProduct, setSelectedProduct] = useState(null);
    const [variants, setVariants] = useState([]);
    const [variantModalVisible, setVariantModalVisible] = useState(false);

    const [paymentModalVisible, setPaymentModalVisible] = useState(false);
    const [cashReceived, setCashReceived] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [orderType, setOrderType] = useState('Dine In');
    const [orderComplete, setOrderComplete] = useState(false);
    const [completedOrderItems, setCompletedOrderItems] = useState([]);
    const [completedOrderId, setCompletedOrderId] = useState(null);
    const [completedOrderDetails, setCompletedOrderDetails] = useState(null);
    const [lastOrderDisplay, setLastOrderDisplay] = useState(null);
    const [finalChange, setFinalChange] = useState(0);

    // Low-stock warning state
    const [stockWarningVisible, setStockWarningVisible] = useState(false);
    const [stockWarnings, setStockWarnings] = useState([]);

    useFocusEffect(
        useCallback(() => {
            loadProducts();
            loadCategories();
            loadDiscounts();
        }, [syncEpoch])
    );

    const loadProducts = async () => {
        try {
            const db = await getDBConnection();
            const res = await db.getAllAsync("SELECT * FROM products WHERE (status = 'Available' OR status IS NULL OR status = '') AND deleted_at IS NULL");
            setProducts(res || []);
        } catch (e) { console.error("Failed to load POS products", e); }
    };

    const loadCategories = async () => {
        try {
            const db = await getDBConnection();
            const res = await db.getAllAsync('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY name ASC');
            setCategories(res || []);
        } catch (e) { console.error("Failed to load categories", e); }
    };

    const loadDiscounts = async () => {
        try {
            const db = await getDBConnection();
            const res = await db.getAllAsync('SELECT * FROM discounts WHERE deleted_at IS NULL');
            setDiscounts(res || []);
        } catch (e) { console.error("Failed to load discounts", e); }
    };

    const filteredProducts = useMemo(() => {
        let list = products;
        if (selectedCategory !== null) {
            list = list.filter(p => p.category_id === selectedCategory);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q));
        }
        return list;
    }, [products, selectedCategory, searchQuery]);

    const handleProductSelect = async (product) => {
        try {
            const db = await getDBConnection();
            // Clear stale variants before fetching to prevent duplicates
            setVariants([]);
            const vars = await db.getAllAsync('SELECT * FROM product_variants WHERE product_id = ? AND deleted_at IS NULL', product.id);

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
                return [...prev, { product, variant, quantity: 1, price: variant ? variant.price ?? product.price : product.price }];
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

    const appliedDiscount = useMemo(() => discounts.find(d => d.id === selectedDiscountId) || null, [discounts, selectedDiscountId]);

    const discountValue = useMemo(() => {
        if (!appliedDiscount) return 0;
        return totalAmount * (appliedDiscount.percentage / 100);
    }, [appliedDiscount, totalAmount]);

    const finalAmountDue = useMemo(() => Math.max(0, totalAmount - discountValue), [totalAmount, discountValue]);

    const handleCheckout = () => {
        if (cart.length === 0) return;
        setCashReceived('');
        setCustomerName('');
        setOrderType('Dine In');
        setOrderComplete(false);
        setLastOrderDisplay(null);
        setPaymentModalVisible(true);
    };

    const changeAmount = useMemo(() => {
        const cash = parseFloat(cashReceived) || 0;
        return cash - finalAmountDue;
    }, [cashReceived, finalAmountDue]);

    const submitOrder = async () => {
        const cash = parseFloat(cashReceived) || 0;
        if (cash < finalAmountDue) {
            Alert.alert("Insufficient Cash", "The cash received is less than the total amount due.");
            return;
        }

        try {
            const db = await getDBConnection();

            // --- Check if any ingredient will go negative ---
            const warnings = [];
            for (let item of cart) {
                let recs;
                if (item.variant) {
                    recs = await db.getAllAsync('SELECT r.*, i.name as ing_name, i.stock_quantity, i.unit FROM recipes r JOIN ingredients i ON r.ingredient_id = i.id WHERE r.product_id = ? AND r.variant_id = ?', item.product.id, item.variant.id);
                } else {
                    recs = await db.getAllAsync('SELECT r.*, i.name as ing_name, i.stock_quantity, i.unit FROM recipes r JOIN ingredients i ON r.ingredient_id = i.id WHERE r.product_id = ? AND r.variant_id IS NULL', item.product.id);
                }
                for (let r of recs) {
                    const totalUsed = r.quantity * item.quantity;
                    const remaining = r.stock_quantity - totalUsed;
                    if (remaining < 0) {
                        warnings.push(`⚠️ ${r.ing_name} (for ${item.product.name}${item.variant ? ` - ${item.variant.name}` : ''}): only ${r.stock_quantity} ${r.unit} left, needs ${totalUsed} ${r.unit}`);
                    }
                }
            }

            if (warnings.length > 0) {
                setStockWarnings(warnings);
                setStockWarningVisible(true);
                return; // Pause here — wait for cashier to decide
            }

            await confirmSubmitOrder();
        } catch (e) { console.error("Failed to check stock", e); }
    };

    const confirmSubmitOrder = async () => {
        setStockWarningVisible(false);
        const cash = parseFloat(cashReceived) || 0;
        try {
            const db = await getDBConnection();
            const trimmedName = customerName.trim() || null;

            // Deduct stock for ingredients
            console.log("--- STARTING INGREDIENT DEDUCTION ---");
            for (let item of cart) {
                const productId = item.product.id;
                const variantId = item.variant ? item.variant.id : null;

                let recs;
                if (variantId) {
                    recs = await db.getAllAsync('SELECT * FROM recipes WHERE product_id = ? AND variant_id = ? AND deleted_at IS NULL', productId, variantId);
                } else {
                    recs = await db.getAllAsync('SELECT * FROM recipes WHERE product_id = ? AND variant_id IS NULL AND deleted_at IS NULL', productId);
                }

                for (let r of recs) {
                    const totalUsed = r.quantity * item.quantity;
                    await db.runAsync(
                        'UPDATE ingredients SET stock_quantity = stock_quantity - ?, synced = 0 WHERE id = ?',
                        totalUsed, r.ingredient_id
                    );
                }
            }
            console.log("--- DEDUCTION COMPLETE ---");

            // Get daily order number
            const localDevId = await getDeviceId();
            const todayCount = await db.getFirstAsync(
                "SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = DATE('now', 'localtime') AND device_id = ?",
                localDevId
            );
            const dailyOrderNum = todayCount ? todayCount.count : 0; // Starts with 0

            // Create Order
            const res = await db.runAsync(
                'INSERT INTO orders (total_amount, cash_received, change_amount, status, customer_name, device_id, is_local, daily_order_number, discount_id, discount_name, discount_amount, order_type) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)',
                totalAmount, cash, changeAmount, 'Pending', trimmedName, localDevId, dailyOrderNum,
                appliedDiscount ? appliedDiscount.id : null,
                appliedDiscount ? appliedDiscount.name : null,
                discountValue,
                orderType
            );

            const orderId = res.lastInsertRowId;

            const dayStr = String(new Date().getDate()).padStart(2, '0');
            const paddedNo = String(dailyOrderNum + 1).padStart(2, '0');
            setLastOrderDisplay(`${dayStr}-${paddedNo}`);

            setFinalChange(changeAmount);

            // Create Order Items
            for (let item of cart) {
                await db.runAsync(
                    'INSERT INTO order_items (order_id, product_id, variant_id, quantity, price_at_time) VALUES (?, ?, ?, ?, ?)',
                    orderId, item.product.id, item.variant ? item.variant.id : null, item.quantity, item.price
                );
            }

            setCompletedOrderId(orderId);
            setCompletedOrderDetails({
                id: orderId,
                customerName: trimmedName || '',
                items: [...cart],
                total: finalAmountDue,
                change: changeAmount,
                discountAmt: discountValue,
                discountName: appliedDiscount ? appliedDiscount.name : ''
            });
            setCompletedOrderItems([...cart]);
            setOrderComplete(true);
            setCart([]);
            setSelectedDiscountId(null);

        } catch (e) { console.error("Failed to submit order", e); }
    };

    const closePaymentModal = () => {
        setPaymentModalVisible(false);
        setOrderComplete(false);
        setFinalChange(0);
        setCompletedOrderItems([]);
        setCompletedOrderId(null);
        setCompletedOrderDetails(null);
    };

    const generateReceiptHtml = (orderIdDisplay, customerName, items, total, change, discountAmt, discountName) => {
        const d = new Date();
        const dateStr = d.toLocaleString();

        let itemsHtml = items.map(item => `
            <tr>
                <td style="padding: 4px 0; font-size: 14px;">${item.quantity}x ${item.product.name} ${item.variant ? `(${item.variant.name})` : ''}</td>
                <td style="padding: 4px 0; text-align: right; font-size: 14px;">PHP ${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
        `).join('');

        let discountHtml = '';
        if (discountAmt > 0) {
            discountHtml = `
            <tr>
                <td style="padding: 4px 0; font-size: 14px; font-weight: bold;">Discount (${discountName || ''})</td>
                <td style="padding: 4px 0; text-align: right; font-size: 14px; font-weight: bold;">- PHP ${discountAmt.toFixed(2)}</td>
            </tr>`;
        }

        const totalCash = total + change;

        return `
            <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
                    <style>
                        body { font-family: 'Courier New', Courier, monospace; width: 300px; margin: 0 auto; color: #000; padding: 10px; }
                        h1 { text-align: center; font-size: 24px; }
                        h2 { text-align: center; font-size: 18px; }
                        p { margin: 0 0 5px 0; font-size: 12px; text-align: center; }
                        .divider { border-bottom: 1px dashed #000; margin: 10px 0; }
                        table { width: 100%; border-collapse: collapse; }
                        td { vertical-align: top; }
                        .center { text-align: center; }
                        .right { text-align: right; }
                        .bold { font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="divider"></div>
                    <p>THIS IS NOT AN OFFICIAL RECEIPT</p>
                    <div class="divider"></div>
                    <h1>Gelo's POS</h1>
                    <h2>ORDER SLIP</h2>
                    <p class="center">
                        ${dateStr}
                    </p>
                    <p>Order #${orderIdDisplay}</p>
                    <p>Order Type:<b> ${orderType} </b></p>
                    ${customerName ? `<p>Customer: ${customerName}</p>` : ''}
                    <div class="divider"></div>
                    <table>
                        ${itemsHtml}
                        ${discountHtml}
                    </table>
                    <div class="divider"></div>
                    <table>
                        <tr>
                            <td class="bold" style="padding: 4px 0;">Total</td>
                            <td class="right bold" style="padding: 4px 0;">PHP ${total.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0;">Cash</td>
                            <td class="right" style="padding: 4px 0;">PHP ${totalCash.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0;">Change</td>
                            <td class="right" style="padding: 4px 0;">PHP ${change.toFixed(2)}</td>
                        </tr>
                    </table>
                    <div class="divider"></div>
                    <p>FOR INTERNAL USE ONLY</p>
                    <p>THIS IS NOT AN OFFICIAL RECEIPT</p>
                    <div class="divider"></div>
                </body>
            </html>
        `;
    };

    const handlePrintReceipt = async () => {
        if (!completedOrderDetails) return;
        const { id, customerName, items, total, change, discountAmt, discountName } = completedOrderDetails;

        const html = generateReceiptHtml(lastOrderDisplay || id, customerName, items, total, change, discountAmt, discountName);

        try {
            if (Platform.OS === 'web') {
                const iframe = document.createElement('iframe');
                // Hiding via display: none causes Chromium to print the parent window. We must position it off-screen.
                iframe.style.position = 'absolute';
                iframe.style.top = '-10000px';
                iframe.style.left = '-10000px';
                iframe.style.width = '0px';
                iframe.style.height = '0px';
                iframe.style.border = 'none';

                document.body.appendChild(iframe);
                iframe.contentDocument.write(html);
                iframe.contentDocument.close();
                iframe.contentWindow.focus();
                // Adding a tiny delay ensures styles and fonts are applied before printing
                setTimeout(() => {
                    iframe.contentWindow.print();
                    setTimeout(() => {
                        document.body.removeChild(iframe);
                    }, 1000);
                }, 200);
            } else {
                await Print.printAsync({
                    html,
                    orientation: Print.Orientation.portrait
                });
            }
        } catch (e) {
            console.warn("Printing skipped or failed", e);
            Alert.alert("Print Error", "Could not print. Please proceed without printing.");
        }
    };

    const cancelCheckoutOrder = async () => {
        if (!completedOrderId) return;
        try {
            const db = await getDBConnection();

            const itemsRes = await db.getAllAsync('SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ?', completedOrderId);

            for (let item of itemsRes) {
                let recs;
                if (item.variant_id) {
                    recs = await db.getAllAsync('SELECT * FROM recipes WHERE product_id = ? AND variant_id = ? AND deleted_at IS NULL', item.product_id, item.variant_id);
                } else {
                    recs = await db.getAllAsync('SELECT * FROM recipes WHERE product_id = ? AND variant_id IS NULL AND deleted_at IS NULL', item.product_id);
                }
                for (let r of recs) {
                    const totalRestock = r.quantity * item.quantity;
                    await db.runAsync(
                        'UPDATE ingredients SET stock_quantity = stock_quantity + ?, synced = 0 WHERE id = ?',
                        totalRestock, r.ingredient_id
                    );
                }
            }

            await db.runAsync('UPDATE orders SET status = ?, synced = 0 WHERE id = ?', 'Cancelled', completedOrderId);

            Alert.alert("Order Cancelled", "The order was cancelled and inventory has been rolled back.");
            closePaymentModal();
        } catch (e) {
            console.error("Failed to cancel checkout order", e);
            Alert.alert("Error", "Failed to rollback inventory.");
        }
    };

    return (
        <View style={styles.container}>
            {/* Products Section */}
            <View style={styles.productsSection}>
                {/* Search Bar */}
                <View style={styles.topBar}>
                    <Text style={styles.title}>All Products</Text>
                    <View style={styles.searchContainer}>
                        <Search color="#9ca3af" size={18} style={{ marginRight: 8 }} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search products..."
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

                {/* Category Navbar */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.categoryNav}
                    contentContainerStyle={styles.categoryNavContent}
                >
                    <TouchableOpacity
                        style={[styles.categoryChip, selectedCategory === null && styles.categoryChipActive]}
                        onPress={() => setSelectedCategory(null)}
                    >
                        <Text style={[styles.categoryChipText, selectedCategory === null && styles.categoryChipTextActive]}>All</Text>
                    </TouchableOpacity>
                    {categories.map(cat => (
                        <TouchableOpacity
                            key={cat.id}
                            style={[styles.categoryChip, selectedCategory === cat.id && styles.categoryChipActive]}
                            onPress={() => setSelectedCategory(cat.id)}
                        >
                            <Text style={[styles.categoryChipText, selectedCategory === cat.id && styles.categoryChipTextActive]}>{cat.name}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Products Grid */}
                <FlatList
                    data={filteredProducts}
                    numColumns={3}
                    keyExtractor={item => item.id.toString()}
                    key={'grid-3'}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>
                                {searchQuery || selectedCategory !== null ? 'No products match your filter.' : 'No products available.'}
                            </Text>
                        </View>
                    }
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
                    {discounts.length > 0 && (
                        <View style={{ marginBottom: 15 }}>
                            <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: 'bold', marginBottom: 8 }}>Apply Discount:</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                <TouchableOpacity
                                    style={[styles.discountChip, selectedDiscountId === null && styles.discountChipActive]}
                                    onPress={() => setSelectedDiscountId(null)}
                                >
                                    <Text style={[styles.discountChipText, selectedDiscountId === null && styles.discountChipTextActive]}>None</Text>
                                </TouchableOpacity>
                                {discounts.map(d => (
                                    <TouchableOpacity
                                        key={d.id}
                                        style={[styles.discountChip, selectedDiscountId === d.id && styles.discountChipActive]}
                                        onPress={() => setSelectedDiscountId(d.id)}
                                    >
                                        <Text style={[styles.discountChipText, selectedDiscountId === d.id && styles.discountChipTextActive]}>{d.name} ({d.percentage}%)</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    )}

                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Subtotal</Text>
                        <Text style={styles.totalValue}>₱{totalAmount.toFixed(2)}</Text>
                    </View>

                    {appliedDiscount && (
                        <View style={[styles.totalRow, { marginTop: -10, marginBottom: 10 }]}>
                            <Text style={[styles.totalLabel, { fontSize: 16, color: '#f59e0b' }]}>Discount (-{appliedDiscount.percentage}%)</Text>
                            <Text style={[styles.totalValue, { fontSize: 18, color: '#f59e0b' }]}>-₱{discountValue.toFixed(2)}</Text>
                        </View>
                    )}

                    <View style={[styles.totalRow, { borderTopWidth: 1, borderColor: '#e5e7eb', paddingTop: 10 }]}>
                        <Text style={[styles.totalLabel, { fontSize: 22 }]}>Total Due</Text>
                        <Text style={[styles.totalValue, { fontSize: 32, color: '#10b981' }]}>₱{finalAmountDue.toFixed(2)}</Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.checkoutBtn, cart.length === 0 && styles.disabledBtn]}
                        disabled={cart.length === 0}
                        onPress={handleCheckout}>
                        <Text style={styles.checkoutBtnText}>Payment</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Low-Stock Warning Modal */}
            <Modal visible={stockWarningVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.warningModal}>
                        <Text style={styles.warningTitle}>⚠️ Low Stock Warning</Text>
                        <Text style={styles.warningSubtitle}>The following ingredients are insufficient for this order:</Text>
                        <ScrollView style={{ maxHeight: 200, marginVertical: 15 }}>
                            {stockWarnings.map((w, i) => (
                                <View key={i} style={styles.warningItem}>
                                    <Text style={styles.warningItemText}>{w}</Text>
                                </View>
                            ))}
                        </ScrollView>
                        <Text style={styles.warningQuestion}>Do you want to continue anyway?</Text>
                        <View style={styles.warningActions}>
                            <TouchableOpacity
                                style={styles.warnCancelBtn}
                                onPress={() => setStockWarningVisible(false)}
                            >
                                <Text style={styles.warnCancelText}>Cancel Order</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.warnContinueBtn}
                                onPress={confirmSubmitOrder}
                            >
                                <Text style={styles.warnContinueText}>Continue Anyway</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Variant Modal */}
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

            {/* Payment Modal */}
            <Modal visible={paymentModalVisible} transparent animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
                    {orderComplete ? (
                        <View style={[styles.paymentModal, { alignItems: 'center', justifyContent: 'center' }]}>
                            <CheckCircle color="#10b981" size={60} />
                            <Text style={[styles.modalTitle, { marginTop: 20 }]}>Payment Complete!</Text>
                            <Text style={{ color: '#4b5563', fontSize: 16, marginTop: 10 }}>
                                Change: <Text style={{ fontWeight: 'bold', color: '#1f2937' }}>₱{finalChange.toFixed(2)}</Text>
                            </Text>
                            {lastOrderDisplay && (
                                <Text style={{ color: '#6b7280', marginTop: 6, fontSize: 14 }}>
                                    Order #{lastOrderDisplay}{customerName.trim() ? ` · ${customerName.trim()}` : ''}
                                </Text>
                            )}

                            {completedOrderItems.length > 0 && (
                                <View style={{ width: '100%', maxHeight: 150, marginTop: 15, paddingHorizontal: 10 }}>
                                    <ScrollView showsVerticalScrollIndicator={false}>
                                        {completedOrderItems.map((item, idx) => (
                                            <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderColor: '#f3f4f6' }}>
                                                <Text style={{ color: '#374151', fontSize: 14, flex: 1 }} numberOfLines={1}>
                                                    {item.quantity}x {item.product.name} {item.variant ? `(${item.variant.name})` : ''}
                                                </Text>
                                                <Text style={{ color: '#6b7280', fontSize: 14 }}>
                                                    ₱{(item.price * item.quantity).toFixed(2)}
                                                </Text>
                                            </View>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}

                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 25, width: '100%' }}>
                                <TouchableOpacity
                                    style={[styles.checkoutBtn, { flex: 1, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#ef4444' }]}
                                    onPress={cancelCheckoutOrder}
                                >
                                    <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 16, textAlign: 'center' }}>Cancel Order</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.checkoutBtn, { flex: 1.5, backgroundColor: '#3b82f6' }]}
                                    onPress={handlePrintReceipt}
                                >
                                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, textAlign: 'center' }}>Print Receipt</Text>
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity
                                style={[styles.checkoutBtn, { width: '100%', marginTop: 10, backgroundColor: '#10b981' }]}
                                onPress={closePaymentModal}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, textAlign: 'center' }}>Done</Text>
                            </TouchableOpacity>
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
                                <Text style={styles.billTotalText}>Subtotal: ₱{totalAmount.toFixed(2)}</Text>
                                {appliedDiscount && (
                                    <Text style={[styles.billTotalText, { color: '#f59e0b', fontWeight: 'bold' }]}>
                                        Discount: -₱{discountValue.toFixed(2)}
                                    </Text>
                                )}
                                <Text style={{ fontSize: 18, color: '#6b7280', marginTop: 10 }}>Total Amount Due</Text>
                                <Text style={styles.billTotalAmount}>₱{finalAmountDue.toFixed(2)}</Text>
                            </View>

                            {/* Order Type */}
                            <Text style={styles.label}>Order Type</Text>
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                                <TouchableOpacity
                                    style={[styles.orderTypeChip, orderType === 'Dine In' && styles.orderTypeChipDineIn]}
                                    onPress={() => setOrderType('Dine In')}
                                >
                                    <Text style={[styles.orderTypeChipText, orderType === 'Dine In' && styles.orderTypeChipTextDineIn]}>🍽️ Dine In</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.orderTypeChip, orderType === 'Take Out' && styles.orderTypeChipTakeOut]}
                                    onPress={() => setOrderType('Take Out')}
                                >
                                    <Text style={[styles.orderTypeChipText, orderType === 'Take Out' && styles.orderTypeChipTextTakeOut]}>🥡 Take Out</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Customer Name */}
                            <Text style={styles.label}>Customer Name <Text style={{ color: '#9ca3af', fontWeight: 'normal' }}>(optional)</Text></Text>
                            <TextInput
                                style={styles.input}
                                value={customerName}
                                onChangeText={setCustomerName}
                                placeholder="Leave blank to use order number"
                                placeholderTextColor="#9ca3af"
                            />

                            <Text style={[styles.label, { marginTop: 20 }]}>Cash Received (₱)</Text>
                            <TextInput
                                style={[styles.input, { fontSize: 30, paddingVertical: 15, fontWeight: 'bold' }]}
                                value={cashReceived}
                                onChangeText={setCashReceived}
                                keyboardType="numeric"
                                autoFocus
                            />

                            <View style={[styles.billSummary, { backgroundColor: 'transparent', marginTop: 20 }]}>
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
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, flexDirection: 'row' },

    productsSection: { flex: 2, backgroundColor: '#f3f4f6', padding: 30 },

    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#1f2937' },

    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        flex: 1,
        marginLeft: 20,
        maxWidth: 320,
    },
    searchInput: { flex: 1, fontSize: 15, color: '#1f2937', padding: 0 },

    categoryNav: { marginBottom: 16, flexGrow: 0, minHeight: 45, overflowY: 'scroll' },
    categoryNavContent: { flexDirection: 'row', gap: 10, paddingBottom: 10 },
    categoryChip: {
        paddingHorizontal: 18,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    categoryChipActive: {
        backgroundColor: '#1f2937',
        borderColor: '#1f2937',
    },
    categoryChipText: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
    categoryChipTextActive: { color: '#fff' },

    emptyContainer: { alignItems: 'center', marginTop: 60 },
    emptyText: { fontSize: 16, color: '#9ca3af' },

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

    // Warning Modal
    warningModal: { width: '90%', maxWidth: 460, backgroundColor: '#fff', borderRadius: 16, padding: 30, elevation: 10 },
    warningTitle: { fontSize: 22, fontWeight: 'bold', color: '#b45309', marginBottom: 6 },
    warningSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 4 },
    warningItem: { backgroundColor: '#fef3c7', borderRadius: 8, padding: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#f59e0b' },
    warningItemText: { fontSize: 13, color: '#92400e' },
    warningQuestion: { fontSize: 15, fontWeight: '600', color: '#374151', marginTop: 5, textAlign: 'center' },
    warningActions: { flexDirection: 'row', gap: 12, marginTop: 20, justifyContent: 'center' },
    warnCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#d1d5db', alignItems: 'center' },
    warnCancelText: { fontWeight: 'bold', color: '#374151', fontSize: 15 },
    warnContinueBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#f59e0b', alignItems: 'center' },
    warnContinueText: { fontWeight: 'bold', color: '#fff', fontSize: 15 },

    paymentModal: { width: '90%', maxWidth: 500, backgroundColor: '#fff', borderRadius: 16, padding: 35, elevation: 10 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    modalTitle: { fontSize: 24, fontWeight: 'bold', color: '#1f2937' },

    billSummary: { backgroundColor: '#f3f4f6', padding: 20, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
    billTotalText: { fontSize: 16, color: '#6b7280', marginBottom: 5 },
    billTotalAmount: { fontSize: 36, fontWeight: 'bold', color: '#1f2937' },

    label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
    input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 15, color: '#1f2937', fontSize: 15 },

    modalActions: { flexDirection: 'row', justifyContent: 'center', marginTop: 30 },
    saveButton: { borderRadius: 12, backgroundColor: '#10b981', alignItems: 'center', paddingHorizontal: 20 },
    saveButtonText: { color: '#fff', fontWeight: 'bold' },

    discountChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
    discountChipActive: { backgroundColor: '#fef3c7', borderColor: '#f59e0b' },
    discountChipText: { fontSize: 13, color: '#6b7280', fontWeight: 'bold' },
    discountChipTextActive: { color: '#d97706' },

    orderTypeChip: { flex: 1, paddingVertical: 12, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1.5, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
    orderTypeChipDineIn: { backgroundColor: '#ecfdf5', borderColor: '#10b981' },
    orderTypeChipTakeOut: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
    orderTypeChipText: { fontSize: 15, color: '#6b7280', fontWeight: 'bold' },
    orderTypeChipTextDineIn: { color: '#059669' },
    orderTypeChipTextTakeOut: { color: '#2563eb' },
});
