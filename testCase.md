# GeloPOS Device Test Cases

This document outlines key scenarios to test GeloPOS on a physical Android tablet. Each test case reflects critical business logic, data integrity, and user experience requirements.

## 1. Authentication & Access Control
- [ ] **Login Success**: Enter valid credentials. Ensure the app transitions to the POS/Dashboard.
- [ ] **Login Failure**: Enter incorrect password or non-existent email. Verify error message.
- [ ] **Session Persistence**: Close the app and reopen. Ensure the user remains logged in if applicable.
- [ ] **Logout**: Tap Logout and confirm state returns to login screen.

## 2. POS Screen & Order Management
- [ ] **Category Filtering**: Switch between categories (e.g., Drinks, Fast Food). Ensure items update instantly.
- [ ] **Add to Cart**: Tap multiple products. Verify counter and cart totals update correctly.
- [ ] **Variants & Customization**: Select a product with variants (e.g., Size). Ensure the correct variant price is applied.
- [ ] **Remove/Adjust Quantity**: Increment/decrement items in the cart. Delete an item completely.
- [ ] **Checkout & Payment**: Tap 'Pay'. Enter cash amount. Verify the "Change" calculation is accurate.
- [ ] **Order Completion**: After "Proceed", ensure the cart is cleared and a success confirmation appears.

## 3. Kitchen Display System (KDS)
- [ ] **Real-time Updates**: Create an order on the POS. Switch to Kitchen Screen. The order should appear as "Pending".
- [ ] **Order Fulfillment**: Tap the "✅" button on a kitchen ticket. Ensure it disappears or moves to a "History" state.
- [ ] **Stock Deduction**: Verify that completing an order correctly reduces ingredient stock (if recipe is mapped).

## 4. Admin & Master Data Management
- [ ] **Category Management**: Add a new category. Verify it appears in the POS filter.
- [ ] **Product Management**: Add a product with a recipe (ingredient mapping). 
- [ ] **Inventory Update**: Manually adjust ingredient stock levels. 
- [ ] **Costing Check**: Ensure product costs are calculated based on ingredient unit costs.

## 5. Analytics & Dashboard
- [ ] **KPI Accuracy**: Verify "Total Revenue" matches the sum of completed orders.
- [ ] **Top Sellers**: Check if the "Most Sold" list reflects recent transactions.
- [ ] **AI Insights**: Tap the "Ask AI" or "Generate Insights" button. Verify that a response is received based on historical sales.

## 6. Data Synchronization (SQLite ↔ Supabase)
- [ ] **Local Persistence**: Create an order. Force quit the app. Reopen. Verify the order still exists in "History".
- [ ] **Sync Manual Trigger**: Tap "Sync to Online" in Analytics. Verify "synced" status changes from 0 to 1 in database logs.
- [ ] **Duplicate Prevention**: Re-run sync. Ensure no duplicate records appear in Supabase.

## 7. Offline & Reliability Tests
- [ ] **Airplane Mode POS**: Disable internet. Take 3 orders. Verify POS works normally.
- [ ] **Reconnect & Sync**: Enable internet. Trigger sync. Verify offline orders are pushed to Supabase.
- [ ] **Database Integrity**: Rapidly add/remove items to test SQLite stability under high-speed interactions.

## 8. UI/UX & Hardware
- [ ] **Tablet Layout**: Ensure buttons are large enough for touch input and no overlapping text.
- [ ] **Responsive Orientation**: Rotate device between Landscape and Portrait. Verify layout adapts or remains stable as designed.
- [ ] **Status Bar**: Ensure critical info (Sync status, User name) is always visible.
