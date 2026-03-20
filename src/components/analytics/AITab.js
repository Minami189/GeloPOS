import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { Sparkles, TrendingUp, TrendingDown, Send, Bot, User } from 'lucide-react-native';
import { getDBConnection } from '../../lib/database';

// GeloPOS-scope system prompt for the chatbot
const SYSTEM_PROMPT = `You are GeloPOS Assistant, an AI helper for the GeloPOS point-of-sale system. 
You ONLY answer questions related to: sales data, product performance, ingredient stock, order trends, 
pricing strategies, and GeloPOS operations. 
If the user asks anything unrelated to the POS system or business operations, politely redirect them 
back to GeloPOS topics. Always be concise and actionable.`;

// Simple linear regression forecast
function linearForecast(values) {
    if (!values || values.length < 2) return 0;
    const n = values.length;
    const meanX = (n - 1) / 2;
    const meanY = values.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
        num += (i - meanX) * (values[i] - meanY);
        den += (i - meanX) ** 2;
    }
    const slope = den !== 0 ? num / den : 0;
    return Math.max(0, meanY + slope * n); // one step ahead
}

export default function AITab() {
    const [predictions, setPredictions] = useState(null);
    const [isPredLoading, setIsPredLoading] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'bot', text: "Hi! I'm your GeloPOS Assistant. Ask me about your sales, stock levels, or product performance." }
    ]);
    const [inputText, setInputText] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const scrollRef = useRef();

    const generatePredictions = async () => {
        setIsPredLoading(true);
        try {
            const db = await getDBConnection();

            // Get daily revenue for the past 30 days
            const dailyData = await db.getAllAsync(`
                SELECT DATE(created_at, 'localtime') as day, SUM(total_amount) as revenue
                FROM orders
                WHERE status = 'Completed'
                  AND DATE(created_at) >= DATE('now', '-30 days', 'localtime')
                GROUP BY day ORDER BY day ASC
            `);

            // Get weekly data for past 12 weeks
            const weeklyData = await db.getAllAsync(`
                SELECT strftime('%Y-%W', created_at, 'localtime') as week, SUM(total_amount) as revenue
                FROM orders
                WHERE status = 'Completed'
                  AND DATE(created_at) >= DATE('now', '-84 days', 'localtime')
                GROUP BY week ORDER BY week ASC
            `);

            // Get top and bottom products
            const allProducts = await db.getAllAsync(`
                SELECT COALESCE(p.name, 'Deleted Product') as name,
                       SUM(oi.quantity) as qty,
                       SUM(oi.quantity * oi.price_at_time) as revenue
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE o.status = 'Completed'
                GROUP BY name
                ORDER BY revenue DESC
            `);

            const dailyRevenues = dailyData.map(d => d.revenue);
            const weeklyRevenues = weeklyData.map(w => w.revenue);

            const avgDaily = dailyRevenues.length > 0
                ? dailyRevenues.reduce((a, b) => a + b, 0) / dailyRevenues.length : 0;

            const nextWeek = linearForecast(weeklyRevenues) * 1;
            const nextMonth = avgDaily * 30;
            const nextYear = avgDaily * 365;

            const top = allProducts[0] || null;
            const bottom = allProducts.length > 0 ? allProducts[allProducts.length - 1] : null;

            setPredictions({
                nextWeek,
                nextMonth,
                nextYear,
                top,
                bottom,
                totalProducts: allProducts.length,
            });
        } catch (e) {
            console.error('AI predictions error:', e);
        }
        setIsPredLoading(false);
    };

    const sendMessage = async () => {
        const text = inputText.trim();
        if (!text || isChatLoading) return;

        setInputText('');
        const newMessages = [...messages, { role: 'user', text }];
        setMessages(newMessages);
        setIsChatLoading(true);

        try {
            // Get some context from DB
            const db = await getDBConnection();
            const recentSales = await db.getAllAsync(`
                SELECT COALESCE(p.name, 'Deleted') as name, SUM(oi.quantity) as qty
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE o.status = 'Completed' AND DATE(o.created_at) >= DATE('now', '-7 days', 'localtime')
                GROUP BY name ORDER BY qty DESC LIMIT 5
            `);

            const salesContext = recentSales.map(s => `${s.name}: ${s.qty} units`).join(', ') || 'No recent sales data';

            const aiEndpoint = process.env.EXPO_PUBLIC_AI_ENDPOINT;

            if (aiEndpoint && aiEndpoint !== 'https://your-ai-service.com/api/suggestions') {
                const response = await fetch(aiEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemPrompt: SYSTEM_PROMPT,
                        userMessage: text,
                        context: `Recent 7-day sales: ${salesContext}`,
                        history: newMessages.slice(-6).map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }))
                    })
                });
                const data = await response.json();
                setMessages(prev => [...prev, { role: 'bot', text: data.reply || data.suggestion || 'Unable to get a response.' }]);
            } else {
                // Local simulated responses scoped to POS
                const lower = text.toLowerCase();
                let reply = '';

                if (lower.includes('sales') || lower.includes('revenue') || lower.includes('income')) {
                    reply = `Based on your recent data: ${salesContext}. Consider promoting your top sellers and creating combo deals to boost your average order value.`;
                } else if (lower.includes('stock') || lower.includes('ingredient') || lower.includes('inventory')) {
                    reply = `Check the Admin → Ingredients tab for current stock levels. Items with low or negative stock will affect product availability on the POS.`;
                } else if (lower.includes('product') || lower.includes('item') || lower.includes('menu')) {
                    reply = `Your recent top sellers (7 days): ${salesContext}. Consider adding variants or promotions for slower-moving items.`;
                } else if (lower.includes('recommend') || lower.includes('suggest') || lower.includes('tip')) {
                    reply = `Tip: Your best-selling items are ${salesContext.split(',')[0] || 'your products'}. Try bundling them with lower-selling items to balance sales across your menu.`;
                } else if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
                    reply = `Hello! I can help with your GeloPOS data — ask me about sales trends, product performance, or inventory suggestions!`;
                } else {
                    reply = `I'm specialized in GeloPOS topics. I can help with sales analysis, product performance, ingredient stock, and operational tips. What would you like to know about your store?`;
                }

                setTimeout(() => {
                    setMessages(prev => [...prev, { role: 'bot', text: reply }]);
                    setIsChatLoading(false);
                }, 800);
                return;
            }
        } catch (e) {
            console.error('Chat error:', e);
            setMessages(prev => [...prev, { role: 'bot', text: 'Sorry, I encountered an error. Please try again.' }]);
        }
        setIsChatLoading(false);
    };

    return (
        <View style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                {/* Predictions section */}
                <View style={s.section}>
                    <View style={s.sectionHeader}>
                        <Sparkles color="#8b5cf6" size={22} />
                        <Text style={s.sectionTitle}>Sales Predictions</Text>
                    </View>
                    <Text style={s.sectionSub}>AI-powered forecast based on your historical data</Text>

                    {!predictions ? (
                        <TouchableOpacity style={s.generateBtn} onPress={generatePredictions} disabled={isPredLoading}>
                            {isPredLoading
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Sparkles color="#fff" size={18} />}
                            <Text style={s.generateBtnText}>
                                {isPredLoading ? 'Analyzing data...' : 'Generate Predictions'}
                            </Text>
                        </TouchableOpacity>
                    ) : (
                        <>
                            <View style={s.predictRow}>
                                {[
                                    { label: 'Next Week', value: predictions.nextWeek, color: '#3b82f6', bg: '#eff6ff' },
                                    { label: 'Next Month', value: predictions.nextMonth, color: '#8b5cf6', bg: '#f5f3ff' },
                                    { label: 'Next Year', value: predictions.nextYear, color: '#10b981', bg: '#ecfdf5' },
                                ].map((p, i) => (
                                    <View key={i} style={[s.predictCard, { backgroundColor: p.bg, borderColor: p.color + '44' }]}>
                                        <Text style={[s.predictPeriod, { color: p.color }]}>{p.label}</Text>
                                        <Text style={[s.predictValue, { color: p.color }]}>₱{p.value.toFixed(0)}</Text>
                                        <Text style={s.predictSub}>predicted revenue</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Summary paragraph */}
                            {predictions.top && (
                                <View style={s.summaryBox}>
                                    <View style={s.summaryRow}>
                                        <TrendingUp color="#10b981" size={18} />
                                        <Text style={s.summaryText}>
                                            <Text style={s.summaryBold}>{predictions.top.name}</Text> is your highest-grossing product
                                            with ₱{predictions.top.revenue?.toFixed(2)} in total revenue
                                            ({predictions.top.qty} units sold).
                                        </Text>
                                    </View>
                                    {predictions.bottom && predictions.bottom.name !== predictions.top.name && (
                                        <View style={s.summaryRow}>
                                            <TrendingDown color="#ef4444" size={18} />
                                            <Text style={s.summaryText}>
                                                <Text style={s.summaryBold}>{predictions.bottom.name}</Text> has the lowest sales
                                                ({predictions.bottom.qty} units, ₱{predictions.bottom.revenue?.toFixed(2)}).
                                                Consider promoting it or reviewing its pricing.
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            )}

                            <TouchableOpacity style={s.refreshPredBtn} onPress={generatePredictions}>
                                <Text style={s.refreshPredText}>Refresh Predictions</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </ScrollView>

            {/* Chatbot */}
            <View style={s.chatContainer}>
                <View style={s.chatHeader}>
                    <Bot color="#8b5cf6" size={20} />
                    <Text style={s.chatTitle}>GeloPOS Assistant</Text>
                    <Text style={s.chatBadge}>POS-Scoped</Text>
                </View>

                <ScrollView
                    ref={scrollRef}
                    style={s.chatMessages}
                    onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
                >
                    {messages.map((m, i) => (
                        <View key={i} style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleBot]}>
                            {m.role === 'bot' && <Bot color="#8b5cf6" size={14} style={{ marginTop: 2 }} />}
                            <Text style={[s.bubbleText, m.role === 'user' && s.bubbleTextUser]}>{m.text}</Text>
                            {m.role === 'user' && <User color="#fff" size={14} style={{ marginTop: 2 }} />}
                        </View>
                    ))}
                    {isChatLoading && (
                        <View style={[s.bubble, s.bubbleBot]}>
                            <ActivityIndicator size="small" color="#8b5cf6" />
                        </View>
                    )}
                </ScrollView>

                <View style={s.chatInputRow}>
                    <TextInput
                        style={s.chatInput}
                        value={inputText}
                        onChangeText={setInputText}
                        placeholder="Ask about your sales, stock, or products..."
                        placeholderTextColor="#9ca3af"
                        onSubmitEditing={sendMessage}
                        returnKeyType="send"
                    />
                    <TouchableOpacity style={s.sendBtn} onPress={sendMessage} disabled={!inputText.trim() || isChatLoading}>
                        <Send color="#fff" size={18} />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    section: { backgroundColor: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, elevation: 2 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
    sectionTitle: { fontSize: 20, fontWeight: '800', color: '#1f2937' },
    sectionSub: { fontSize: 13, color: '#9ca3af', marginBottom: 20 },
    generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#8b5cf6', paddingVertical: 16, borderRadius: 12, gap: 10 },
    generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    predictRow: { flexDirection: 'row', gap: 14, marginBottom: 20 },
    predictCard: { flex: 1, padding: 18, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', gap: 4 },
    predictPeriod: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
    predictValue: { fontSize: 22, fontWeight: '800' },
    predictSub: { fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' },
    summaryBox: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, gap: 12, marginBottom: 16 },
    summaryRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    summaryText: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
    summaryBold: { fontWeight: '700', color: '#1f2937' },
    refreshPredBtn: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#f5f3ff', borderRadius: 20 },
    refreshPredText: { color: '#8b5cf6', fontWeight: '700', fontSize: 13 },

    chatContainer: { backgroundColor: '#fff', borderRadius: 16, elevation: 2, overflow: 'hidden', maxHeight: 360 },
    chatHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#f3f4f6', gap: 8 },
    chatTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', flex: 1 },
    chatBadge: { backgroundColor: '#f5f3ff', color: '#8b5cf6', fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    chatMessages: { flex: 1, padding: 12, maxHeight: 220 },
    bubble: { flexDirection: 'row', gap: 8, marginBottom: 10, maxWidth: '85%', alignItems: 'flex-start' },
    bubbleBot: { alignSelf: 'flex-start', backgroundColor: '#f5f3ff', padding: 12, borderRadius: 14, borderBottomLeftRadius: 4 },
    bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#8b5cf6', padding: 12, borderRadius: 14, borderBottomRightRadius: 4 },
    bubbleText: { fontSize: 13, color: '#374151', flex: 1, lineHeight: 18 },
    bubbleTextUser: { color: '#fff' },
    chatInputRow: { flexDirection: 'row', padding: 12, gap: 10, borderTopWidth: 1, borderColor: '#f3f4f6' },
    chatInput: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1f2937', borderWidth: 1, borderColor: '#e5e7eb' },
    sendBtn: { backgroundColor: '#8b5cf6', borderRadius: 12, padding: 12, justifyContent: 'center', alignItems: 'center' },
});
