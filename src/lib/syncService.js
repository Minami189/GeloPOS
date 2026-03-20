import { supabase } from './supabase';
import { getDBConnection, getDeviceId } from './database';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

let isSyncInProgress = false;

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
            // Check if order already exists in Supabase by local_id to avoid 42P10 Upsert error
            // (since local_id might not have a unique constraint in the cloud).
            const { data: existingOrder } = await supabase
                .from('pos_orders')
                .select('id')
                .eq('local_id', order.id)
                .eq('device_id', order.device_id) // Add device_id to unique check
                .single();

            let orderData, orderError;
            const orderPayload = {
                local_id: order.id,
                total_amount: order.total_amount,
                cash_received: order.cash_received,
                change_amount: order.change_amount,
                status: order.status,
                created_at: order.created_at,
                device_id: order.device_id,
                customer_name: order.customer_name,
                daily_order_number: order.daily_order_number
            };

            if (existingOrder) {
                const { data, error } = await supabase
                    .from('pos_orders')
                    .update(orderPayload)
                    .eq('id', existingOrder.id)
                    .select()
                    .single();
                orderData = data;
                orderError = error;
            } else {
                const { data, error } = await supabase
                    .from('pos_orders')
                    .insert([orderPayload])
                    .select()
                    .single();
                orderData = data;
                orderError = error;
            }

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
            // Process items meant to be deleted vs updated/inserted
            const unsyncedItems = await db.getAllAsync(`SELECT * FROM ${tableDef.local} WHERE synced = 0 AND deleted_at IS NULL`);
            const deletedItems = await db.getAllAsync(`SELECT * FROM ${tableDef.local} WHERE synced = 0 AND deleted_at IS NOT NULL`);

            // Handle hard deletes to Supabase
            if (deletedItems && deletedItems.length > 0) {
                for (const delItem of deletedItems) {
                    // First check if the item still exists in Supabase
                    const { data: checkData, error: checkErr } = await supabase
                        .from(tableDef.supabase)
                        .select('id')
                        .eq('id', delItem.id)
                        .maybeSingle();

                    // If checking failed due to network, abort immediately
                    if (checkErr && (checkErr.message?.includes('Failed to fetch') || checkErr.message?.includes('Network request'))) {
                        throw checkErr;
                    }

                    // If checking didn't error, but no data was returned, the item is already gone.
                    if (!checkData && !checkErr) {
                        // Already deleted remotely, safe to clear local tombstone
                        await db.runAsync(`DELETE FROM ${tableDef.local} WHERE id = ?`, delItem.id);
                        totalSynced++;
                    } else {
                        // Item exists (or check failed for other reasons), attempt deletion
                        const { error: delErr } = await supabase.from(tableDef.supabase).delete().eq('id', delItem.id);
                        if (delErr) {
                            if (delErr.message?.includes('Failed to fetch') || delErr.message?.includes('Network request')) {
                                throw delErr;
                            }
                            console.error(`Failed to delete ${tableDef.local} ${delItem.id} from Supabase:`, delErr);
                        } else {
                            // Hard delete locally after successful cloud sync
                            await db.runAsync(`DELETE FROM ${tableDef.local} WHERE id = ?`, delItem.id);
                            totalSynced++;
                        }
                    }
                }
            }

            if (unsyncedItems && unsyncedItems.length > 0) {
                const itemsToInsert = [];
                for (const item of unsyncedItems) {
                    const { synced, deleted_at, ...rest } = item;

                    // Handle Image Upload for Products
                    if (tableDef.local === 'products' && rest.image_uri && rest.image_uri.startsWith('file://')) {
                        try {
                            const fileName = rest.image_uri.split('/').pop();
                            const fileExt = fileName.split('.').pop() || 'jpg';
                            const mimeType = fileExt.toLowerCase() === 'png' ? 'image/png' : 'image/jpeg';

                            const base64File = await FileSystem.readAsStringAsync(rest.image_uri, {
                                encoding: FileSystem.EncodingType.Base64,
                            });
                            const arrayBuffer = decode(base64File);
                            const bucketPath = `products/${Date.now()}_${fileName}`;

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
                                const { data: publicUrlData } = supabase.storage.from('product_images').getPublicUrl(bucketPath);
                                rest.image_uri = publicUrlData.publicUrl;
                                await db.runAsync('UPDATE products SET image_uri = ? WHERE id = ?', rest.image_uri, rest.id);
                            }
                        } catch (imgErr) {
                            console.error("Image processing error", imgErr);
                        }
                    }

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
                    .upsert(itemsToInsert, { onConflict: 'id' });

                if (error) {
                    console.warn(`Bulk upsert failed for ${tableDef.local}, falling back to singular upserts. Error: ${error.message}`);
                    for (const item of itemsToInsert) {
                        const { error: singleErr } = await supabase.from(tableDef.supabase).upsert([item], { onConflict: 'id' });
                        if (singleErr) {
                            console.error(`Failed to upsert item ${item.id} in ${tableDef.local}:`, singleErr);
                            // If it's a foreign key violation (23503), the parent is missing in the cloud. Delete local orphan.
                            if (singleErr.code === '23503') {
                                console.log(`Deleting local orphan ${item.id} from ${tableDef.local} due to missing parent reference.`);
                                await db.runAsync(`DELETE FROM ${tableDef.local} WHERE id = ?`, item.id);
                            }
                        } else {
                            await db.runAsync(`UPDATE ${tableDef.local} SET synced = 1 WHERE id = ?`, item.id);
                            totalSynced++;
                        }
                    }
                } else {
                    for (const item of unsyncedItems) {
                        await db.runAsync(`UPDATE ${tableDef.local} SET synced = 1 WHERE id = ?`, item.id);
                    }
                    totalSynced += unsyncedItems.length;
                }
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
    if (isSyncInProgress) {
        console.warn("Sync already in progress, skipping...");
        return { success: false, error: "Sync already in progress" };
    }
    isSyncInProgress = true;
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
            return { success: false, error: `Network Error: Could not reach Supabase. Please check your emulator/device internet connection.` };
        }

        const catalogResult = await syncCatalogToSupabase();
        if (!catalogResult.success) return catalogResult;

        const ordersResult = await syncOrdersToSupabase();
        if (!ordersResult.success) return ordersResult;

        // After pushing local changes up, pull the latest catalog + orders back
        // down from Supabase. This keeps the local DB (and analytics graph) in
        // sync with any data that exists on the server from other devices.
        const fetchResult = await fetchOrdersFromSupabase();
        if (!fetchResult.success) {
            // Non-fatal: the push succeeded, just warn about the fetch step
            console.warn('Sync push succeeded but fetch-back failed:', fetchResult.error);
        }

        return {
            success: true,
            message: `Synced ${catalogResult.count} catalog items and ${ordersResult.count} orders. Pulled latest data from cloud.`,
            catalogCount: catalogResult.count,
            ordersCount: ordersResult.count
        };
    } catch (error) {
        return { success: false, error: error.message };
    } finally {
        isSyncInProgress = false;
    }
};

// Internal helper: FULL REPLACE of all catalog data from Supabase.
// Wipes the local catalog tables and re-populates from cloud.
// Cloud is the source of truth — no merging, no duplicates.
const _fetchCatalogRecords = async (db) => {
    // Fetch everything from cloud BEFORE touching local DB
    // Insert order (parents first): categories → ingredients → products → product_variants → recipes
    const tables = [
        { local: 'categories', supabase: 'pos_categories' },
        { local: 'ingredients', supabase: 'pos_ingredients' },
        { local: 'products', supabase: 'pos_products' },
        { local: 'product_variants', supabase: 'pos_product_variants' },
        { local: 'recipes', supabase: 'pos_recipes' },
    ];

    const cloudData = {};
    for (const t of tables) {
        const { data, error } = await supabase.from(t.supabase).select('*');
        if (error) throw error;
        cloudData[t.local] = data || [];
    }

    // --- DEDUPLICATION ---
    // If the cloud database contains duplicates (e.g. "Sugar" and "sugar")
    // the local database re-insert will fail due to the NOCASE unique index.
    // We deduplicate here, keeping the first one seen.

    // Deduplicate Ingredients by name
    if (cloudData.ingredients) {
        const seenNames = new Set();
        cloudData.ingredients = cloudData.ingredients.filter(ing => {
            const normalized = ing.name.trim().toLowerCase();
            if (seenNames.has(normalized)) return false;
            seenNames.add(normalized);
            return true;
        });
    }

    // Deduplicate Variants by (product_id, name)
    if (cloudData.product_variants) {
        const seenVariants = new Set();
        cloudData.product_variants = cloudData.product_variants.filter(v => {
            const key = `${v.product_id}_${v.name.trim().toLowerCase()}`;
            if (seenVariants.has(key)) return false;
            seenVariants.add(key);
            return true;
        });
    }

    // order_items has FK references to products and product_variants WITHOUT ON DELETE CASCADE.
    // If we try to DELETE FROM products/product_variants while order_items still references
    // them, SQLite will throw a FK violation. Null out those references first so the
    // catalog delete can proceed cleanly. Orders/order_items are re-inserted by
    // fetchOrdersFromSupabase, so this is safe.
    await db.runAsync('UPDATE order_items SET product_id = NULL, variant_id = NULL WHERE product_id IS NOT NULL OR variant_id IS NOT NULL');

    // Delete in reverse order (children first) so remaining FK constraints are respected
    for (let i = tables.length - 1; i >= 0; i--) {
        await db.runAsync(`DELETE FROM ${tables[i].local}`);
    }

    // Re-insert from cloud in parent-first order
    let totalInserted = 0;
    for (const t of tables) {
        const rows = cloudData[t.local];
        for (const row of rows) {
            const keys = [...Object.keys(row), 'synced'];
            const values = [...Object.values(row), 1];
            const placeholders = keys.map(() => '?').join(', ');
            await db.runAsync(
                `INSERT INTO ${t.local} (${keys.join(', ')}) VALUES (${placeholders})`,
                ...values
            );
        }
        totalInserted += rows.length;
    }
    return totalInserted;
};

export const fetchDataFromSupabase = async () => {
    try {
        const db = await getDBConnection();
        const totalDownloaded = await _fetchCatalogRecords(db);
        return { success: true, count: totalDownloaded, message: `Successfully replaced local catalog with ${totalDownloaded} records from cloud.` };
    } catch (error) {
        console.error('Fetch catalog from cloud failed:', error);
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
            const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'undefined';
            return { success: false, error: `Network Error: Could not reach ${url}. Please check your internet connection.` };
        }
        return { success: false, error: error.message };
    }
};

export const fetchOrdersFromSupabase = async () => {
    try {
        const db = await getDBConnection();

        // Fetch all cloud data first before touching local DB
        const { data: ordersData, error: ordersError } = await supabase.from('pos_orders').select('*');
        if (ordersError) throw ordersError;

        const { data: itemsData, error: itemsError } = await supabase.from('pos_order_items').select('*');
        if (itemsError) throw itemsError;

        let fetchedCount = 0;

        // Bypass FK constraints temporarily to allow pulling orders/items 
        // that might reference deleted products/variants (orphaned data).
        // Must be outside the transaction for reliability in many SQLite versions.
        await db.runAsync('PRAGMA foreign_keys = OFF');

        try {
            await db.withTransactionAsync(async () => {
                await db.runAsync('DELETE FROM order_items');
                await db.runAsync('DELETE FROM orders');

                // Now safely replace catalog (no FK blockers from order_items any more)
                await _fetchCatalogRecords(db);

                // Deduplicate orders and items from cloud to prevent local UNIQUE collisions
                const uniqueOrders = [];
                const seenOrderIds = new Set();
                if (ordersData) {
                    for (const o of ordersData) {
                        const sid = parseInt(o.id, 10) || parseInt(o.local_id, 10);
                        if (sid && !seenOrderIds.has(sid)) {
                            uniqueOrders.push(o);
                            seenOrderIds.add(sid);
                        }
                    }
                }

                const uniqueItems = [];
                const seenItemIds = new Set();
                if (itemsData) {
                    for (const i of itemsData) {
                        const iid = parseInt(i.id, 10);
                        if (iid && !seenItemIds.has(iid)) {
                            uniqueItems.push(i);
                            seenItemIds.add(iid);
                        }
                    }
                }

                const localDevId = await getDeviceId();

                // Re-insert orders using local IDs
                for (const order of uniqueOrders) {
                    const sId = parseInt(order.local_id, 10) || parseInt(order.id, 10);
                    const totalAmount = parseFloat(order.total_amount || 0);
                    const cashRecv = parseFloat(order.cash_received || 0);
                    const changeAmt = parseFloat(order.change_amount || 0);
                    const status = order.status ? String(order.status) : 'Pending';
                    const createdAt = order.created_at ? String(order.created_at) : new Date().toISOString();
                    const custName = order.customer_name ? String(order.customer_name) : null;
                    const deviceId = order.device_id || 'UNKNOWN';
                    const isLocal = deviceId === localDevId ? 1 : 0;
                    const dailyNum = order.daily_order_number || 0;

                    await db.runAsync(
                        `INSERT OR REPLACE INTO orders (id, total_amount, cash_received, change_amount, status, created_at, customer_name, device_id, is_local, daily_order_number, synced)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                        sId, totalAmount, cashRecv, changeAmt, status, createdAt, custName, deviceId, isLocal, dailyNum
                    );
                }

                // Re-insert order items
                for (const item of uniqueItems) {
                    const itemId = parseInt(item.id, 10);
                    const orderId = parseInt(item.local_order_id, 10) || parseInt(item.supabase_order_id, 10);
                    const productId = item.product_id ? parseInt(item.product_id, 10) : null;
                    const variantId = item.variant_id ? parseInt(item.variant_id, 10) : null;
                    const quantity = parseInt(item.quantity || 1, 10);
                    const price = parseFloat(item.price_at_time || 0);

                    await db.runAsync(
                        `INSERT OR REPLACE INTO order_items (id, order_id, product_id, variant_id, quantity, price_at_time)
                        VALUES (?, ?, ?, ?, ?, ?)`,
                        itemId, orderId, productId, variantId, quantity, price
                    );
                }
                fetchedCount = uniqueOrders.length;
            });
        } finally {
            // ALWAYS re-enable FK constraints
            await db.runAsync('PRAGMA foreign_keys = ON');
        }

        return { success: true, count: fetchedCount, message: `Successfully replaced local data with ${fetchedCount} orders from cloud.` };

    } catch (error) {
        console.error('Fetch orders from cloud failed:', error);
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network request failed'))) {
            const url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'undefined';
            return { success: false, error: `Network Error: Could not reach ${url}. Please check your internet connection.` };
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
