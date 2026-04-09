import { Alert } from 'react-native';
import { supabase } from './supabase';


const escapeCSV = (value) => {
    if (value === null || value === undefined) return '""';
    const str = String(value);
    return `"${str.replace(/"/g, '""')}"`;
};

export const downloadCSV = (filename, csvContent) => {
    if (typeof window !== 'undefined') {
        try {
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', filename);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            console.error("Export Error:", error);
            Alert.alert("Export Error", "Failed to generate file for download.");
        }
    } else {
        Alert.alert("Unsupported Environment", "File downloading is currently only supported on the Web/PWA version.");
    }
};

export const exportSalesToCSV = async (mode = 'both', startDateStr, endDateStr) => {
    try {
        const dateStr = new Date().toISOString().split('T')[0];

        // Format Date Helper
        const formatDate = (isoStr) => {
            if (!isoStr || typeof isoStr !== 'string') return isoStr;
            const parts = isoStr.split('T');
            if (parts.length === 2) {
                const timePart = parts[1].split('.')[0];
                return `${parts[0]} ${timePart}`;
            }
            return isoStr;
        };

        // Safely parse date strings the user might have entered manually (e.g. MM/DD/YYYY)
        const parseStandardDate = (dStr, defaultStr) => {
            if (!dStr || dStr.trim() === '') return defaultStr;
            const clean = dStr.replace(/\//g, '-');
            const parts = clean.split('-');
            if (parts.length === 3) {
                // If user typed MM-DD-YYYY or DD-MM-YYYY, attempt JS parse
                if (parts[0].length !== 4) {
                    const parsed = new Date(dStr);
                    if (!isNaN(parsed)) return parsed.toISOString().split('T')[0];
                }
            }
            return clean;
        };

        const safeStart = parseStandardDate(startDateStr || '2000-01-01', '2000-01-01');
        const safeEnd = parseStandardDate(endDateStr || '2099-12-31', '2099-12-31');

        // Construct Supabase Timestamp boundaries
        const startTimestamp = `${safeStart}T00:00:00.000Z`;
        const endTimestamp = `${safeEnd}T23:59:59.999Z`;

        // 1. Fetch Orders from Supabase
        const { data: dOrders, error: eOrders } = await supabase
            .from('pos_orders')
            .select('*')
            .gte('created_at', startTimestamp)
            .lte('created_at', endTimestamp)
            .order('created_at', { ascending: false });

        if (eOrders) throw eOrders;
        if (!dOrders || dOrders.length === 0) {
            Alert.alert("No Data", "No sales found for the selected date range in Supabase.");
            return;
        }

        if (mode === 'orders' || mode === 'both') {
            const headers = ["Order #", "Date", "Customer", "Order Type", "Status", "Total Amount", "Cash", "Change", "Discount", "Discount Amount"];
            let csvContent = headers.join(',') + '\n';
            
            dOrders.forEach(row => {
                let cName = row.customer_name || 'Walk-in';
                let oType = row.order_type || 'Dine In';

                // Legacy Data Cleanup: If user previously typed "Take out" in Customer Name
                const cNameLower = cName.trim().toLowerCase();
                if (cNameLower === 'take out' || cNameLower === 'dine in') {
                    oType = cNameLower === 'take out' ? 'Take Out' : 'Dine In';
                    cName = 'Walk-in';
                }

                const rowData = [
                    row.local_id, formatDate(row.created_at), cName,
                    oType, row.status, row.total_amount, row.cash_received, 
                    row.change_amount, row.discount_name || 'None', row.discount_amount || 0
                ];
                csvContent += rowData.map(escapeCSV).join(',') + '\n';
            });
            downloadCSV(`sales_orders_${dateStr}.csv`, csvContent);
        }
        if (mode === 'items' || mode === 'both') {
            // Extract the Supabase IDs we just fetched to filter Items
            const supOrderIds = dOrders.map(o => o.id);
            
            const { data: dItems, error: eItems } = await supabase
                .from('pos_order_items')
                .select('*')
                .in('supabase_order_id', supOrderIds);
            
            if (eItems) throw eItems;

            if (dItems && dItems.length > 0) {
                // Fetch catalog dictionaries to manually map names in case Supabase FKs are offline/unconfigured
                const { data: dProducts } = await supabase.from('pos_products').select('id, name');
                const { data: dVariants } = await supabase.from('pos_product_variants').select('id, name');

                const prodMap = {};
                if (dProducts) dProducts.forEach(p => prodMap[p.id] = p.name);
                
                const varMap = {};
                if (dVariants) dVariants.forEach(v => varMap[v.id] = v.name);

                // Map Orders lookup for Date
                const orderMap = {};
                dOrders.forEach(o => {
                    orderMap[o.id] = { local_id: o.local_id, date: o.created_at };
                });

                const headers = ["Order #", "Date", "Item Name", "Variant Name", "Quantity", "Unit Price"];
                let csvContent = headers.join(',') + '\n';
                
                dItems.forEach(item => {
                    const parentOrder = orderMap[item.supabase_order_id] || {};
                    const rowData = [
                        parentOrder.local_id || 'Unknown',
                        formatDate(parentOrder.date), 
                        prodMap[item.product_id] || 'Unknown Item', 
                        varMap[item.variant_id] || 'Regular', 
                        item.quantity, 
                        item.price_at_time
                    ];
                    csvContent += rowData.map(escapeCSV).join(',') + '\n';
                });
                downloadCSV(`sales_order_items_${dateStr}.csv`, csvContent);
            }
        }

    } catch (error) {
        console.error("Sales Export Error:", error);
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network'))) {
            Alert.alert("Network Error", "Could not connect to Supabase. Check your internet connection.");
        } else {
            Alert.alert("Export Failed", "Could not generate Sales data.");
        }
    }
};


export const exportInventoryToCSV = async () => {
    try {
        const { data: rows, error } = await supabase
            .from('pos_ingredients')
            .select('*')
            .order('name', { ascending: true });
        
        if (error) throw error;
        
        if (!rows || rows.length === 0) {
            Alert.alert("No Data", "There is no inventory to export from Supabase.");
            return;
        }

        // Export ALL columns exactly as they exist in Supabase
        const headers = Object.keys(rows[0]);
        let csvContent = headers.join(',') + '\n';

        rows.forEach(row => {
            const rowData = headers.map(header => {
                const val = row[header];
                return val !== undefined && val !== null ? val : '';
            });
            csvContent += rowData.map(escapeCSV).join(',') + '\n';
        });

        const dateStr = new Date().toISOString().split('T')[0];
        downloadCSV(`cloud_inventory_full_${dateStr}.csv`, csvContent);
        
    } catch (error) {
        console.error("Inventory Export Error:", error);
        if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('Network'))) {
            Alert.alert("Network Error", "Could not connect to Supabase. Check your internet connection.");
        } else {
            Alert.alert("Export Failed", "Could not generate Inventory data from Supabase.");
        }
    }
};
