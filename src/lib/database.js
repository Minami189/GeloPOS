import * as SQLite from 'expo-sqlite';

const dbName = 'pos_database.db';
let dbInstancePromise = null;

export const getDBConnection = async () => {
    if (!dbInstancePromise) {
        dbInstancePromise = SQLite.openDatabaseAsync(dbName);
    }
    return dbInstancePromise;
};

export const initDB = async () => {
    try {
        const db = await getDBConnection();
        await db.execAsync(`
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                synced INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS ingredients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                unit TEXT NOT NULL,
                stock_quantity REAL NOT NULL DEFAULT 0,
                cost_per_unit REAL NOT NULL DEFAULT 0,
                synced INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                category_id INTEGER,
                image_uri TEXT,
                status TEXT DEFAULT 'Available',
                synced INTEGER DEFAULT 0,
                FOREIGN KEY(category_id) REFERENCES categories(id)
            );

            CREATE TABLE IF NOT EXISTS product_variants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER,
                name TEXT NOT NULL,
                synced INTEGER DEFAULT 0,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS recipes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER,
                variant_id INTEGER,
                ingredient_id INTEGER,
                quantity REAL NOT NULL,
                synced INTEGER DEFAULT 0,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
                FOREIGN KEY(ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                total_amount REAL NOT NULL,
                cash_received REAL NOT NULL,
                change_amount REAL NOT NULL,
                status TEXT DEFAULT 'Pending', -- 'Pending', 'Completed' (for Kitchen Queue)
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                synced INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER,
                product_id INTEGER,
                variant_id INTEGER,
                quantity INTEGER NOT NULL,
                price_at_time REAL NOT NULL,
                FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
                FOREIGN KEY(product_id) REFERENCES products(id),
                FOREIGN KEY(variant_id) REFERENCES product_variants(id)
            );
        `);

        // --- Migration: Add 'synced' column to existing tables if missing ---
        const tablesToUpdate = ['categories', 'ingredients', 'products', 'product_variants', 'recipes'];

        for (const table of tablesToUpdate) {
            try {
                const result = await db.getAllAsync(`PRAGMA table_info(${table})`);
                const hasSyncedColumn = result.some(col => col.name === 'synced');

                if (!hasSyncedColumn) {
                    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN synced INTEGER DEFAULT 0;`);
                    console.log(`Added 'synced' column to ${table} table`);
                }
            } catch (err) {
                console.error(`Migration error for ${table}:`, err);
            }
        }

        // --- Migration: Add 'customer_name' column to orders if missing ---
        try {
            const ordersInfo = await db.getAllAsync(`PRAGMA table_info(orders)`);
            const hasCustomerName = ordersInfo.some(col => col.name === 'customer_name');
            if (!hasCustomerName) {
                await db.execAsync(`ALTER TABLE orders ADD COLUMN customer_name TEXT;`);
                console.log("Added 'customer_name' column to orders table");
            }
        } catch (err) {
            console.error('Migration error for orders customer_name:', err);
        }

        console.log("Database initialized successfully.");
    } catch (e) {
        console.error("Database initialization error:", e);
    }
};
