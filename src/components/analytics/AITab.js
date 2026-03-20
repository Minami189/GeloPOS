import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { Sparkles, TrendingUp, TrendingDown, Send, Bot, User } from 'lucide-react-native';
import { getDBConnection } from '../../lib/database';
import { GoogleGenerativeAI } from "@google/generative-ai";

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
            const db = await getDBConnection();

            // 1. Get Top 5 Products (Last 7 Days)
            const recentTop = await db.getAllAsync(`
                SELECT COALESCE(p.name, 'Deleted') as name, SUM(oi.quantity) as qty
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE o.status = 'Completed' AND DATE(o.created_at) >= DATE('now', '-7 days', 'localtime')
                GROUP BY name ORDER BY qty DESC LIMIT 5
            `);
            const topProducts = recentTop.map(s => `${s.name}: ${s.qty} units`).join(', ') || 'No sales';

            // 2. Get Today's Totals
            const todayStats = await db.getFirstAsync(`
                SELECT COUNT(*) as count, SUM(total_amount) as revenue
                FROM orders
                WHERE status = 'Completed' AND DATE(created_at) = DATE('now', 'localtime')
            `);

            // 3. Get Last 7 Days Totals
            const weekStats = await db.getFirstAsync(`
                SELECT COUNT(*) as count, SUM(total_amount) as revenue
                FROM orders
                WHERE status = 'Completed' AND DATE(created_at) >= DATE('now', '-7 days', 'localtime')
            `);

            const salesContext = `
                - Today's Revenue: ₱${(todayStats?.revenue || 0).toFixed(2)} (${todayStats?.count || 0} orders)
                - 7-Day Revenue: ₱${(weekStats?.revenue || 0).toFixed(2)} (${weekStats?.count || 0} orders)
                - Recent Top Sellers: ${topProducts}
            `.trim();

            const apiKey = process.env.EXPO_PUBLIC_AI_ENDPOINT;
            if (!apiKey || apiKey.includes('http')) {
                throw new Error("Invalid Gemini API Key in .env");
            }

            const genAI = new GoogleGenerativeAI(apiKey);

            // Reconstruct history (starts with 'user', alternates perfectly)
            const raw = newMessages.slice(1, -1);
            const filteredHistory = [];
            let nextRole = 'user';
            for (const m of raw) {
                const mappedRole = m.role === 'bot' ? 'model' : 'user';
                if (mappedRole === nextRole) {
                    filteredHistory.push({ role: mappedRole, parts: [{ text: m.text }] });
                    nextRole = nextRole === 'user' ? 'model' : 'user';
                }
            }

            // Function to attempt chat with a specific model
            const attemptChat = async (modelName) => {
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    systemInstruction: SYSTEM_PROMPT + `\n\nLive POS Context:\n${salesContext}`
                });
                const chat = model.startChat({ history: filteredHistory });
                const result = await chat.sendMessage(text);
                const response = await result.response;
                return response.text();
            };

            let reply = '';
            try {
                // Try 2.5 Flash Lite first as specifically requested
                reply = await attemptChat("gemini-2.5-flash-lite");
            } catch (err) {
                const errStr = String(err.message);
                if (errStr.includes('404') || errStr.includes('429') || errStr.includes('not found') || errStr.includes('quota')) {
                    console.log(`Fallback: gemini-2.5-flash-lite failed. Trying gemini-1.5-flash...`);
                    // Fallback to 1.5 Flash which has much better availability and quota
                    reply = await attemptChat("gemini-1.5-flash");
                } else {
                    throw err; // Re-throw if it's a different kind of error (like history order)
                }
            }

            setMessages(prev => [...prev, { role: 'bot', text: reply }]);
        } catch (e) {
            console.error('Gemini Chat error:', e);
            let fallback = "I encountered an error with the AI. ";
            if (String(e.message).includes('429')) {
                fallback = "The AI is currently busy or out of quota. Please wait about 60 seconds and try again.";
            } else if (String(e.message).includes('404')) {
                fallback = "The requested AI model (2.0/1.5) was not found in your region or account.";
            } else if (String(e.message).includes('history')) {
                fallback = "There was a conversation sync error. Try refreshing the tab.";
            }
            setMessages(prev => [...prev, { role: 'bot', text: fallback }]);
        }
        setIsChatLoading(false);
    };

    // Helper to render markdown-style bot messages (bolding, lists, etc)
    const renderBotMessage = (text) => {
        // 1. Split by double asterisks for bolding: **text**
        const parts = text.split(/(\*\*.*?\*\*)/g);

        return (
            <Text style={s.bubbleText}>
                {parts.map((part, index) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        // Bold part
                        return (
                            <Text key={index} style={{ fontWeight: '800', color: '#1f2937' }}>
                                {part.slice(2, -2)}
                            </Text>
                        );
                    }

                    // Handle line breaks and basic lists
                    const lines = part.split('\n');
                    return lines.map((line, lIndex) => {
                        let content = line;

                        // Basic bullet point recognition
                        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                            content = '  • ' + line.trim().substring(2);
                        }

                        return (
                            <Text key={`${index}-${lIndex}`}>
                                {content}
                                {lIndex < lines.length - 1 ? '\n' : ''}
                            </Text>
                        );
                    });
                })}
            </Text>
        );
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
                            {m.role === 'bot' ? (
                                <>
                                    <Bot color="#8b5cf6" size={14} style={{ marginTop: 4, marginRight: 8 }} />
                                    <View style={{ flex: 1 }}>
                                        {renderBotMessage(m.text)}
                                    </View>
                                </>
                            ) : (
                                <>
                                    <Text style={[s.bubbleText, s.bubbleTextUser]}>{m.text}</Text>
                                    <User color="#fff" size={14} style={{ marginTop: 2, marginLeft: 8 }} />
                                </>
                            )}
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

    chatContainer: { flex: 3, backgroundColor: '#fff', borderRadius: 16, elevation: 2, overflow: 'hidden', minHeight: 350 },
    chatHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#f3f4f6', gap: 8 },
    chatTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', flex: 1 },
    chatBadge: { backgroundColor: '#f5f3ff', color: '#8b5cf6', fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
    chatMessages: { flex: 1, padding: 12 },
    bubble: { flexDirection: 'row', gap: 8, marginBottom: 10, maxWidth: '85%', alignItems: 'flex-start' },
    bubbleBot: { alignSelf: 'flex-start', backgroundColor: '#f5f3ff', padding: 12, borderRadius: 14, borderBottomLeftRadius: 4 },
    bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#8b5cf6', padding: 12, borderRadius: 14, borderBottomRightRadius: 4 },
    bubbleText: { fontSize: 13, color: '#374151', flex: 1, lineHeight: 18 },
    bubbleTextUser: { color: '#fff' },
    chatInputRow: { flexDirection: 'row', padding: 12, gap: 10, borderTopWidth: 1, borderColor: '#f3f4f6' },
    chatInput: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1f2937', borderWidth: 1, borderColor: '#e5e7eb' },
    sendBtn: { backgroundColor: '#8b5cf6', borderRadius: 12, padding: 12, justifyContent: 'center', alignItems: 'center' },
});
