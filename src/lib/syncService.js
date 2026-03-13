import { supabase } from './supabase';
import { getDBConnection } from './database';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

export const syncOrdersToSupabase = async () => {
    try {
        const db = await getDBConnection();
        // Get all unsynced orders
        const unsyncedOrders = await db.getAllAsync('SELECT * FROM orders WHERE synced = 0');

        if (!unsyncedOrders || unsyncedOrders.length === 0) {
            return { success: true, count: 0, message: "No data to sync." };
        }

        let syncCount = 0;

        for (const order of unsyncedOrders) {
            const items = await db.getAllAsync('SELECT * FROM order_items WHERE order_id = ?', order.id);

            // Assume the user sets up a "pos_orders" table matching this insert structure 
            // the `.env` variable will make this dynamic in an actual production system.
            const { data: orderData, error: orderError } = await supabase
                .from('pos_orders')
                .insert([{
                    local_id: order.id,
                    total_amount: order.total_amount,
                    cash_received: order.cash_received,
                    change_amount: order.change_amount,
                    status: order.status,
                    created_at: order.created_at
                }])
                .select()
                .single();

            if (orderError) throw orderError;

            // Prepare items
            const itemsToInsert = items.map(item => ({
                supabase_order_id: orderData.id,
                local_order_id: item.order_id,
                product_id: item.product_id,
                variant_id: item.variant_id,
                quantity: item.quantity,
                price_at_time: item.price_at_time
            }));

            if (itemsToInsert.length > 0) {
                const { error: itemsError } = await supabase.from('pos_order_items').insert(itemsToInsert);
                if (itemsError) throw itemsError;
            }

            // Mark as synced locally
            await db.runAsync('UPDATE orders SET synced = 1 WHERE id = ?', order.id);
            syncCount++;
        }

        return { success: true, count: syncCount, message: `Successfully synced ${syncCount} orders.` };

    } catch (error) {
        console.error("Sync failed:", error);

        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
            const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'undefined';
            return { success: false, error: `Network Error: Could not reach ${url}. Please check emulator internet connection and restart Metro with -c.` };
        }

        return { success: false, error: error.message };
    }
};

export const syncCatalogToSupabase = async () => {
    try {
        const db = await getDBConnection();
        let totalSynced = 0;

        // Order matters for relational integrity (e.g., categories before products)
        const tablesToSync = [
            { local: 'categories', supabase: 'pos_categories' },
            { local: 'ingredients', supabase: 'pos_ingredients' },
            { local: 'products', supabase: 'pos_products' },
            { local: 'product_variants', supabase: 'pos_product_variants' },
            { local: 'recipes', supabase: 'pos_recipes' }
        ];

        for (const tableDef of tablesToSync) {
            const unsyncedItems = await db.getAllAsync(`SELECT * FROM ${tableDef.local} WHERE synced = 0`);

            if (unsyncedItems && unsyncedItems.length > 0) {
                // remove 'synced' column from the data before sending to Supabase
                // and ensure all data types are safe for JSON serialization (dates -> strings)
                const itemsToInsert = [];
                for (const item of unsyncedItems) {
                    const { synced, ...rest } = item;

                    // Handle Image Upload for Products
                    if (tableDef.local === 'products' && rest.image_uri && rest.image_uri.startsWith('file://')) {
                        try {
                            const fileName = rest.image_uri.split('/').pop();
                            const fileExt = fileName.split('.').pop() || 'jpg';
                            const mimeType = fileExt.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';
                            
                            // 1. Read local file as Base64 string
                            const base64File = await FileSystem.readAsStringAsync(rest.image_uri, {
                                encoding: FileSystem.EncodingType.Base64,
                            });
                            
                            // 2. Decode Base64 string to ArrayBuffer (Required for Supabase RN upload)
                            const arrayBuffer = decode(base64File);

                            const bucketPath = `products/${Date.now()}_${fileName}`;
                            
                            // 3. Upload ArrayBuffer
                            const { data: uploadData, error: uploadError } = await supabase.storage
                                .from('product_images')
                                .upload(bucketPath, arrayBuffer, {
                                    contentType: mimeType,
                                    cacheControl: '3600',
                                    upsert: false
                                });
                                
                            if (uploadError) {
                                console.error("Image upload failed, continuing without cloud image", uploadError);
                            } else {
                                const { data: publicUrlData } = supabase.storage
                                    .from('product_images')
                                    .getPublicUrl(bucketPath);
                                    
                                rest.image_uri = publicUrlData.publicUrl;
                                // update local db with public URL
                                await db.runAsync('UPDATE products SET image_uri = ? WHERE id = ?', rest.image_uri, rest.id);
                            }
                        } catch (imgErr) {
                            console.error("Image processing error", imgErr);
                        }
                    }

                    // Supabase requires proper JSON types. 
                    // React Native fetch crashes if it gets raw SQLite Date objects or undefined
                    const sanitized = {};
                    for (const key in rest) {
                        if (rest[key] === undefined) {
                            sanitized[key] = null;
                        } else if (rest[key] instanceof Date) {
                            sanitized[key] = rest[key].toISOString();
                        } else {
                            sanitized[key] = rest[key];
                        }
                    }
                    itemsToInsert.push(sanitized);
                }

                const { error } = await supabase
                    .from(tableDef.supabase)
                    // using upsert to avoid errors if the tablet re-syncs existing data
                    .upsert(itemsToInsert, { onConflict: 'id' });

                if (error) throw error;

                // Mark as synced locally
                for (const item of unsyncedItems) {
                    await db.runAsync(`UPDATE ${tableDef.local} SET synced = 1 WHERE id = ?`, item.id);
                }

                totalSynced += unsyncedItems.length;
            }
        }

        return { success: true, count: totalSynced, message: `Successfully synced ${totalSynced} catalog items.` };
    } catch (error) {
        console.error("Catalog sync failed:", error);
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
            const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'undefined';
            return { success: false, error: `Network Error: Could not reach ${url}. Please check emulator internet connection and restart Metro with -c.` };
        }
        return { success: false, error: error.message };
    }
};

// Top-level sync function to run everything
export const syncAllToSupabase = async () => {
    try {
        console.log("--- RUNNING RAW NETWORK DIAGNOSTIC ---");
        try {
            const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xyzcompany.supabase.co';
            const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key';

            console.log("Raw Fetching to URL:", url + "/rest/v1/");

            const rawRes = await fetch(`${url}/rest/v1/pos_categories?select=*`, {
                method: 'GET',
                headers: {
                    'apikey': key,
                    'Authorization': `Bearer ${key}`
                }
            });
            console.log("Raw Fetch Status:", rawRes.status);
            const text = await rawRes.text();
            console.log("Raw Fetch Response:", text.substring(0, 100));
            console.log("--- DIAGNOSTIC COMPLETE (NO CRASH) ---");
        } catch (rawErr) {
            console.error("!!! RAW FETCH CRASHED !!!");
            console.error("Message:", rawErr.message);
            console.error("This means the emulator physically cannot communicate with the Supabase URL, regardless of the Supabase library being used!");
        }

        const catalogResult = await syncCatalogToSupabase();
        if (!catalogResult.success) return catalogResult;

        const ordersResult = await syncOrdersToSupabase();
        if (!ordersResult.success) return ordersResult;

        return {
            success: true,
            message: `Synced ${catalogResult.count} catalog items and ${ordersResult.count} orders.`,
            catalogCount: catalogResult.count,
            ordersCount: ordersResult.count
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

export const fetchDataFromSupabase = async () => {
    try {
        const db = await getDBConnection();
        let totalDownloaded = 0;

        // SAFETY CHECK: Prevent fetching if there are unsynced local changes to avoid ID conflicts.
        const tablesToCheck = ['categories', 'ingredients', 'products', 'product_variants', 'recipes'];
        let hasUnsynced = false;
        for (const table of tablesToCheck) {
            const res = await db.getAllAsync(`SELECT count(*) as cnt FROM ${table} WHERE synced = 0`);
            if (res && res.length > 0 && res[0].cnt > 0) {
                hasUnsynced = true;
                break;
            }
        }

        if (hasUnsynced) {
            return { 
                success: false, 
                error: "You have unsynced local items. Please press 'Sync to Online' first to push your changes and prevent ID conflicts." 
            };
        }

        const tablesToFetch = [
            { local: 'categories', supabase: 'pos_categories' },
            { local: 'ingredients', supabase: 'pos_ingredients' },
            { local: 'products', supabase: 'pos_products' },
            { local: 'product_variants', supabase: 'pos_product_variants' },
            { local: 'recipes', supabase: 'pos_recipes' }
        ];

        for (const tableDef of tablesToFetch) {
            const { data, error } = await supabase.from(tableDef.supabase).select('*');
            if (error) throw error;

            if (data && data.length > 0) {
                for (const remoteItem of data) {
                    // Prepare columns and values dynamically based on remote object keys
                    const keys = Object.keys(remoteItem);
                    const values = Object.values(remoteItem);
                    
                    // Add 'synced = 1' since this comes directly from Supabase
                    keys.push('synced');
                    values.push(1);

                    const placeholders = keys.map(() => '?').join(', ');
                    
                    // Don't let a null image from the cloud overwrite a local image during upsert
                    let updateStr = keys.map(k => `${k}=excluded.${k}`).join(', ');
                    if (tableDef.local === 'products' && !remoteItem.image_uri) {
                        updateStr = keys.filter(k => k !== 'image_uri').map(k => `${k}=excluded.${k}`).join(', ');
                    }

                    // Upsert into local SQLite DB
                    await db.runAsync(`
                        INSERT INTO ${tableDef.local} (${keys.join(', ')}) 
                        VALUES (${placeholders})
                        ON CONFLICT(id) DO UPDATE SET ${updateStr}
                    `, ...values);
                }
                totalDownloaded += data.length;
            }
        }

        return { success: true, count: totalDownloaded, message: `Successfully fetched ${totalDownloaded} master records from cloud.` };
    } catch (error) {
        console.error("Fetch from cloud failed:", error);
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
            const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'undefined';
            return { success: false, error: `Network Error: Could not reach ${url}. Please check emulator internet connection and restart Metro with -c.` };
        }
        return { success: false, error: error.message };
    }
};

export const fetchOrdersFromSupabase = async () => {
    try {
        const db = await getDBConnection();
        
        // Fetch Orders
        const { data: ordersData, error: ordersError } = await supabase.from('pos_orders').select('*');
        if (ordersError) throw ordersError;

        let fetchedCount = 0;

        if (ordersData && ordersData.length > 0) {
            for (const order of ordersData) {
                const targetId = parseInt(order.local_id || order.id, 10);
                const totalAmount = parseFloat(order.total_amount || 0);
                const cashReceived = parseFloat(order.cash_received || 0);
                const changeAmount = parseFloat(order.change_amount || 0);
                const status = order.status ? String(order.status) : 'Pending';
                const createdAt = order.created_at ? String(order.created_at) : new Date().toISOString();

                await db.runAsync(`
                    INSERT INTO orders (id, total_amount, cash_received, change_amount, status, created_at, synced)
                    VALUES (?, ?, ?, ?, ?, ?, 1)
                    ON CONFLICT(id) DO UPDATE SET 
                        total_amount=excluded.total_amount,
                        cash_received=excluded.cash_received,
                        change_amount=excluded.change_amount,
                        status=excluded.status
                `, 
                targetId, 
                totalAmount, 
                cashReceived, 
                changeAmount, 
                status, 
                createdAt
                );
            }
            fetchedCount = ordersData.length;
        }

        // Fetch Order Items
        const { data: itemsData, error: itemsError } = await supabase.from('pos_order_items').select('*');
        if (itemsError) throw itemsError;

        if (itemsData && itemsData.length > 0) {
            for (const item of itemsData) {
                const orderId = parseInt(item.local_order_id || item.supabase_order_id, 10);
                const itemId = parseInt(item.id, 10);
                const productId = item.product_id ? parseInt(item.product_id, 10) : null;
                const variantId = item.variant_id ? parseInt(item.variant_id, 10) : null;
                const quantity = parseInt(item.quantity || 1, 10);
                const price = parseFloat(item.price_at_time || 0);

                // Basic insert for order items. Assuming item.id from supabase can map directly.
                await db.runAsync(`
                    INSERT INTO order_items (id, order_id, product_id, variant_id, quantity, price_at_time)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        quantity=excluded.quantity,
                        price_at_time=excluded.price_at_time
                `, 
                itemId, 
                orderId, 
                productId, 
                variantId, 
                quantity, 
                price
                );
            }
        }

        return { success: true, count: fetchedCount, message: `Successfully fetched ${fetchedCount} historical transactions from cloud.` };

    } catch (error) {
        console.error("Fetch orders failed:", error);
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
            const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'undefined';
            return { success: false, error: `Network Error: Could not reach ${url}. Please check emulator internet connection.` };
        }
        return { success: false, error: error.message };
    }
};

export const deleteRecordFromSupabase = async (table, id) => {
    try {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error(`Failed to delete from ${table}:`, error);
        return { success: false, error: error.message };
    }
};
