# GeloPOS Documentation

## 1. System Overview
GeloPOS is a React Native Point of Sale (POS) system designed for Android tablets. It is optimized for small to medium food/beverage businesses. The app features local offline-first capabilities using SQLite for uninterrupted service, while providing an online synchronization feature with Supabase for cloud backup and centralized management.

## 2. Architecture and Data Flow
- **Local Database (SQLite)**: The primary data source holding tables for `categories`, `ingredients`, `products`, `product_variants`, `recipes`, `orders`, and `order_items`. It uses Write-Ahead Logging (WAL) and foreign keys for performance and data integrity.
- **Connection Management**: The SQLite connection is maintained as a singleton instance to prevent concurrency crashes ("prepareAsync" errors) when switching views rapidly.
- **Cloud Database (Supabase)**: Serves as the backup and centralized data warehouse.
- **Data Flow State**:
  1. Orders are taken and processed locally in the un-synced state (`synced = 0`).
  2. The Admin or Store Manager clicks "Sync to Online" (available on Admin/Analytics screens).
  3. The `syncService.js` reads all locally completed orders (`synced = 0`), pushes them to the `pos_orders` and `pos_order_items` tables in Supabase, and marks them as `synced = 1` locally upon success.
  4. Explicit error handling catches network drops to alert users gracefully.

## 3. Core Functionalities
- **Admin Panel**: Manages master data such as Product Categories, Ingredients (stock and cost), and Products (including their recipe mappings and variants).
- **POS Screen**: The cashier interface where staff select products, adjust quantities, process cash payments, and compute exact change.
- **Kitchen Queue**: A screen displaying pending orders in real-time. Kitchen staff can mark orders as "Completed" once prepared.
- **Analytics Dashboard**: Shows high-level KPIs like Total Revenue, Total Orders, and Average Order Value, along with top-selling products and AI-generated insights via the connected LLM endpoint.

## 4. Workflows

### 4.1. System Setup Workflow
1. The Store Admin initializes categories and ingredients in the Admin Tab.
2. The Store Admin creates products, links them to categories, and configures recipes (ingredient deduction mapping).
3. System is now ready to take orders.

### 4.2. Regular Operations Workflow
1. **Cashier** enters orders via the POS screen and processes payment.
2. The order is automatically routed to the **Kitchen Queue** as 'Pending'.
3. **Kitchen Staff** prepares the items and taps the checkmark to mark them as 'Completed'.
4. Completed orders appear in the **Analytics** tab calculations.
5. At the end of the shift, the **Manager** taps "Sync to Online" to backup the day's transactions.

## 5. End-User Flow
* **Cashier Flow**: Open POS -> Filter Category -> Tap Product -> Adjust Quantity / Variant -> Tap "Pay" -> Enter Cash Amount -> View Change -> Proceed.
* **Kitchen Flow**: Open Kitchen Screen -> View incoming 'Pending' tickets -> Tap ✅ when food is ready.
* **Manager Flow**: Open Admin Screen to add/edit stock -> Check Analytics -> Tap "Sync to Online" to back up to the cloud.
