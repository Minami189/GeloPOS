import { supabase } from './supabase';
import { getDBConnection } from './database';

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
            return { success: false, error: "Network Error: Please check your internet connection and try again." };
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
                const itemsToInsert = unsyncedItems.map(item => {
                    const { synced, ...rest } = item;

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
                    return sanitized;
                });

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
            return { success: false, error: "Network Error: Please check your internet connection and try again." };
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
