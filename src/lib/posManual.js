export const POS_MANUAL = `
Table of Contents

Setup
Logging In
Logging Out
User Interface
Admin Page
- Creating a category for items
- Adding a product
- Adding ingredients
- Adding Discounts
- Monitoring Order Summary
Inventory Page
- Setting up Timer for Inventory
- Re-entering Stock
Point of Sale Page
- Searching For a Product
- Selecting A Product
- Choosing Discount
- Payment Window
- Inputting Order Details
- Completing Orders
- Print Receipt
Kitchen Queue
- Completing Order
- Cancelling Order
Analytics
- Viewing Sales
- Viewing Items Sold
- Today’s Transactions
- AI Recommendations
- Export Sales
Settings
- Viewing Statistics Of Orders
- Changing Passwords
- Creating User Accounts
- Editing Account Details
Export

---

### Setup
Step 1: Go to any windows supported browser and go to the link: https://gelospos.netlify.app
Step 2: Download the Progressive Web App By Clicking the icon on the right side of the search bar. 
Step 3: Install and Open Up Gelo’s POS - Tablet on your Windows Device.

### Logging In
Step 1: On the Log-In Screen, Select the profile that you will use.
Step 2: Enter in The Password that has been provided for the profile and Press on the Sign In Button

### Signing Out
Step 1: On the bottom Left side of the User Interface upon logging in, there is an exit button on the bottom left side of the screen.
Step 2: There will be a pop up notifying the user if they want to sign out. Press on Ok To Sign Out

### User Interface
After logging in to a profile, you will be presented to tabs that have given you access depending on the profile. The admin will have all access to the navigation tabs and have access to creating additional profiles for user expansion.

### Admin Panel
#### Creating a Category for Items
Navigate to the Admin Panel and click on the Categories section, Click the Add Category button and Enter a name for the category. After entering the name, confirm by clicking Create Category. The category will now appear in the POS system and can be used when assigning products.

#### Adding a Product
To add a new item to the menu, go to the Products section, Click Add Product. 
Input the product name, price, and assign it to a category. Optionally, you can also upload an image for easier identification on the POS screen. If the product includes variants or options, configure them during this step. You can also add Ingredients on this tab, it will deduct whatever you put on the quantity. Once all details are complete, click Create Product.

#### Adding Ingredients
Click Add Ingredients and Enter the ingredient name and unit of measurement (e.g., grams, ml, pieces) and click on create ingredient.
After creating ingredients, link them to products by specifying how much of each ingredient is consumed per item.

#### Adding Discounts
Click Add Discount and Enter the discount name and value. Save the discount to make it available during checkout.

#### Order Monitoring
The order summary page displays past order data, including totals and transaction counts. Use this information to monitor business performance.

### Inventory Panel
#### Setting up Timer for Inventory
Locate the timer configuration option and set the desired interval (e.g., daily or weekly). Confirm the setup to enable scheduled monitoring.
#### Re-entering Stock
Select the ingredient to update, input the new quantity, and confirm the adjustment.
#### Exporting Inventory
Upon pressing the Export Inventory on the top right of the screen, a csv file will export with all of the inventory information.

### Point of Sale Page
#### Searching for a Product
Use the categories to filter through products or use the search bar at the top of the POS screen.
#### Selecting a Product
Tap a product from the list or category view. Each tap adds the item to the cart.
#### Choosing Discount
Before checkout, tap the discount option. Select the appropriate discount from the list.
#### Payment Window
Enter the amount of money, Optional Name input and Order Type (Dine in or Take out) received from the customer. Click the complete order.
#### Printing Receipt
After completion, the system will have an option to print out a receipt.

### Kitchen Queue Panel
#### Completing Order
Locate the prepared order and tap Done. This removes it from the queue and signals completion.
#### Cancelling Order
Tap the X button on an order. Confirm the action. The system will remove the order and restore inventory.
#### Viewing Order History
Tap the order history button to be able to check the past orders that have been completed or cancelled.

### Analytics Panel
#### Sales Tab
Access this tab to view graphical representations of revenue over selected time periods.
#### Items Sold Tab
Review this section to see which products are selling the most and least.
#### Today’s Transactions Tab
To monitor daily activity, open this tab to see all transactions processed on the current date.
#### AI Recommendations Tab
Prompt questions here if you have any trouble navigating and trying to access specific functions of the application.
#### Exporting Sales
Upon pressing the export sales button on the top right of the screen, The Sales Report Window will pop up, prompting for date ranges and table selection.

### Settings Panel
#### Overview Tab
Lets you see the overall performance of the business.
#### Access Tab
To add a new staff member, tap “Add User” and input their details, including PIN and role. To reset a PIN, select the user and update their credentials.
`;
