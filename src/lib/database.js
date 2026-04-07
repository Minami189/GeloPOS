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
                synced INTEGER DEFAULT 0,
                deleted_at TEXT DEFAULT NULL
            );

            CREATE TABLE IF NOT EXISTS ingredients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                unit TEXT NOT NULL,
                stock_quantity REAL NOT NULL DEFAULT 0,
                cost_per_unit REAL NOT NULL DEFAULT 0,
                reset_timer_days INTEGER DEFAULT 0,
                last_reset_at TEXT DEFAULT NULL,
                synced INTEGER DEFAULT 0,
                deleted_at TEXT DEFAULT NULL
            );

            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                category_id INTEGER,
                image_uri TEXT,
                status TEXT DEFAULT 'Available',
                synced INTEGER DEFAULT 0,
                deleted_at TEXT DEFAULT NULL,
                FOREIGN KEY(category_id) REFERENCES categories(id)
            );

            CREATE TABLE IF NOT EXISTS product_variants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER,
                name TEXT NOT NULL,
                synced INTEGER DEFAULT 0,
                deleted_at TEXT DEFAULT NULL,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS recipes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER,
                variant_id INTEGER,
                ingredient_id INTEGER,
                quantity REAL NOT NULL,
                synced INTEGER DEFAULT 0,
                deleted_at TEXT DEFAULT NULL,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
                FOREIGN KEY(ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                total_amount REAL NOT NULL,
                cash_received REAL NOT NULL,
                change_amount REAL NOT NULL,
                status TEXT DEFAULT 'Pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                synced INTEGER DEFAULT 0,
                device_id TEXT,
                is_local INTEGER DEFAULT 1,
                customer_name TEXT,
                daily_order_number INTEGER,
                discount_id INTEGER,
                discount_name TEXT,
                discount_amount REAL DEFAULT 0,
                order_type TEXT DEFAULT 'Dine In'
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

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS discounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                percentage REAL NOT NULL,
                synced INTEGER DEFAULT 0,
                deleted_at TEXT DEFAULT NULL
            );

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'staff',
                can_access_pos INTEGER DEFAULT 1,
                can_access_kitchen INTEGER DEFAULT 1,
                can_access_admin INTEGER DEFAULT 0,
                can_access_analytics INTEGER DEFAULT 0,
                can_access_settings INTEGER DEFAULT 0,
                can_access_inventory INTEGER DEFAULT 0,
                avatar_emoji TEXT DEFAULT '👤',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // --- Migration: Add 'synced' column to existing tables if missing ---
        const tablesToUpdate = ['categories', 'ingredients', 'products', 'product_variants', 'recipes', 'discounts'];

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

        // --- Migration: Add 'reset_timer_days' and 'last_reset_at' columns to ingredients ---
        try {
            const ingInfo = await db.getAllAsync(`PRAGMA table_info(ingredients)`);
            const hasResetTimer = ingInfo.some(col => col.name === 'reset_timer_days');
            const hasLastReset = ingInfo.some(col => col.name === 'last_reset_at');
            
            if (!hasResetTimer) {
                await db.execAsync(`ALTER TABLE ingredients ADD COLUMN reset_timer_days INTEGER DEFAULT 0;`);
                console.log("Added 'reset_timer_days' column to ingredients table");
            }
            if (!hasLastReset) {
                await db.execAsync(`ALTER TABLE ingredients ADD COLUMN last_reset_at TEXT DEFAULT NULL;`);
                console.log("Added 'last_reset_at' column to ingredients table");
            }
        } catch (err) {
            console.error('Migration error for ingredients timer columns:', err);
        }

        // --- Migration: Add 'device_id' and 'is_local' columns to orders if missing ---
        try {
            const ordersInfo = await db.getAllAsync(`PRAGMA table_info(orders)`);
            const hasDeviceId = ordersInfo.some(col => col.name === 'device_id');
            const hasIsLocal = ordersInfo.some(col => col.name === 'is_local');
            
            if (!hasDeviceId) {
                await db.execAsync(`ALTER TABLE orders ADD COLUMN device_id TEXT;`);
                console.log("Added 'device_id' column to orders table");
            }
            if (!hasIsLocal) {
                await db.execAsync(`ALTER TABLE orders ADD COLUMN is_local INTEGER DEFAULT 1;`);
                console.log("Added 'is_local' column to orders table");
            }

            const hasDailyOrderNum = ordersInfo.some(col => col.name === 'daily_order_number');
            if (!hasDailyOrderNum) {
                await db.execAsync(`ALTER TABLE orders ADD COLUMN daily_order_number INTEGER;`);
                console.log("Added 'daily_order_number' column to orders table");
            }

            const hasDiscountId = ordersInfo.some(col => col.name === 'discount_id');
            if (!hasDiscountId) {
                await db.execAsync(`
                    ALTER TABLE orders ADD COLUMN discount_id INTEGER;
                    ALTER TABLE orders ADD COLUMN discount_name TEXT;
                    ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0;
                `);
                console.log("Added discount columns to orders table");
            }
        } catch (err) {
            console.error('Migration error for orders device_id/is_local/daily_num/discounts:', err);
        }

        // --- Migration: Ensure 'settings' table exists for existing users ---
        try {
            await db.execAsync(`
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );
            `);
        } catch (err) {
            console.error('Migration error for settings table:', err);
        }

        // --- Migration: Add 'deleted_at' column to syncable tables if missing ---
        for (const table of tablesToUpdate) {
            try {
                const result = await db.getAllAsync(`PRAGMA table_info(${table})`);
                const hasDeletedAtColumn = result.some(col => col.name === 'deleted_at');

                if (!hasDeletedAtColumn) {
                    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT DEFAULT NULL;`);
                    console.log(`Added 'deleted_at' column to ${table} table`);
                }
            } catch (err) {
                console.error(`Migration error for ${table} deleted_at:`, err);
            }
        }

        // --- Migration: Add 'deleted_at' column to orders if missing ---
        try {
            const ordersInfo = await db.getAllAsync(`PRAGMA table_info(orders)`);
            const hasDeletedAt = ordersInfo.some(col => col.name === 'deleted_at');
            if (!hasDeletedAt) {
                await db.execAsync(`ALTER TABLE orders ADD COLUMN deleted_at TEXT DEFAULT NULL;`);
            }
        } catch (err) {
            console.error('Migration error for orders deleted_at:', err);
        }

        // --- Migration: Add 'order_type' column to orders if missing ---
        try {
            const ordersInfo = await db.getAllAsync(`PRAGMA table_info(orders)`);
            const hasOrderType = ordersInfo.some(col => col.name === 'order_type');
            if (!hasOrderType) {
                await db.execAsync(`ALTER TABLE orders ADD COLUMN order_type TEXT DEFAULT 'Dine In';`);
                console.log("Added 'order_type' column to orders table");
            }
        } catch (err) {
            console.error('Migration error for orders order_type:', err);
        }

        // --- Migration: Case-insensitive unique index for ingredient names ---
        // SQLite UNIQUE constraints are case-sensitive by default. This index
        // prevents "Sugar" and "sugar" from coexisting as separate ingredients.
        try {
            await db.execAsync(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredients_name_ci
                ON ingredients (name COLLATE NOCASE)
                WHERE deleted_at IS NULL;
            `);
        } catch (err) {
            // Index may already exist with a different definition — safe to ignore
            console.warn('ingredients CI index migration:', err.message);
        }

        // --- Migration: Case-insensitive unique index for variant names per product ---
        // "Regular" and "regular" for the same product should be treated as the same variant.
        // Variants with the same name on DIFFERENT products are allowed.
        try {
            await db.execAsync(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_product_name_ci
                ON product_variants (product_id, name COLLATE NOCASE)
                WHERE deleted_at IS NULL;
            `);
        } catch (err) {
            console.warn('product_variants CI index migration:', err.message);
        }

        // --- Seed default users if none exist ---
        try {
            const userCount = await db.getFirstAsync('SELECT COUNT(*) as cnt FROM users');
            if (!userCount || userCount.cnt === 0) {
                await db.execAsync(`
                    INSERT INTO users (username, password, role, can_access_pos, can_access_kitchen, can_access_admin, can_access_analytics, can_access_settings, can_access_inventory, avatar_emoji)
                    VALUES ('Admin', '1234', 'admin', 1, 1, 1, 1, 1, 1, '👑');
                    INSERT INTO users (username, password, role, can_access_pos, can_access_kitchen, can_access_admin, can_access_analytics, can_access_settings, can_access_inventory, avatar_emoji)
                    VALUES ('Cashier', '5678', 'cashier', 1, 1, 0, 1, 0, 0, '🧑‍💼');
                `);
                console.log('Seeded default Admin and Cashier users.');
            }
        } catch (err) {
            console.error('Error seeding default users:', err);
        }

        // --- Migration: Add users table for existing installs ---
        try {
            await db.execAsync(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password TEXT NOT NULL,
                    role TEXT DEFAULT 'staff',
                    can_access_pos INTEGER DEFAULT 1,
                    can_access_kitchen INTEGER DEFAULT 1,
                    can_access_admin INTEGER DEFAULT 0,
                    can_access_analytics INTEGER DEFAULT 0,
                    can_access_settings INTEGER DEFAULT 0,
                    can_access_inventory INTEGER DEFAULT 0,
                    avatar_emoji TEXT DEFAULT '👤',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Add new column to existing database if it already exists
            try {
                await db.execAsync(`ALTER TABLE users ADD COLUMN can_access_settings INTEGER DEFAULT 0;`);
                await db.execAsync(`UPDATE users SET can_access_settings = 1 WHERE role = 'admin';`);
            } catch (err) {
                // column exists
            }
            try {
                await db.execAsync(`ALTER TABLE users ADD COLUMN can_access_inventory INTEGER DEFAULT 0;`);
                await db.execAsync(`UPDATE users SET can_access_inventory = 1 WHERE role = 'admin';`);
            } catch (err) {
            }
        } catch (err) {
            console.error('Migration error for users table:', err);
        }

            try {
                const usersInfo = await db.getAllAsync(`PRAGMA table_info(users)`);
                const hasPinColumn = usersInfo.some(col => col.name === 'pin');
                const hasPasswordColumn = usersInfo.some(col => col.name === 'password');
                if (hasPinColumn && !hasPasswordColumn) {
                    await db.execAsync(`ALTER TABLE users RENAME COLUMN pin TO password;`);
                    console.log("Renamed 'pin' column to 'password' in users table");
                }
            } catch (err) {
                console.error('Migration error for users password column:', err);
            }

        console.log("Database initialized successfully.");
    } catch (e) {
        console.error("Database initialization error:", e);
    }
};

export const getDeviceId = async () => {
    try {
        const db = await getDBConnection();
        const settings = await db.getFirstAsync('SELECT value FROM settings WHERE key = ?', 'device_id');
        
        if (settings && settings.value) {
            return settings.value;
        }
        
        // Generate new random ID
        const newId = `DEV-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
        await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?)', 'device_id', newId);
        return newId;
    } catch (e) {
        console.error("Failed to get device_id", e);
        return 'UNKNOWN-DEVICE';
    }
};
