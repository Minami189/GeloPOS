import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { Sparkles, TrendingUp, TrendingDown, Send, Bot, User } from 'lucide-react-native';
import { getDBConnection } from '../../lib/database';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { POS_MANUAL } from '../../lib/posManual';

// GeloPOS-scope system prompt for the chatbot
const SYSTEM_PROMPT = `You are GeloPOS Assistant, an expert consultant for the GeloPOS system.
You have two primary sources of truth:
1. [POS MANUAL]: Use this to give step-by-step instructions for navigation, setup, and general system usage (e.g. "How do I add a product?").
2. [LIVE BUSINESS STATE]: Use this to answer questions about sales trends, inventory levels, and product performance.

IF THE USER ASKS A "HOW-TO" QUESTION: You MUST look into the [POS MANUAL] and provide the exact steps listed there.
IF THE USER ASKS ABOUT SALES/STOCK: You MUST look into the [LIVE BUSINESS STATE].

Be professional, concise, and helpful. If data is low, mention it.`;

export default function AITab() {
    const [messages, setMessages] = useState([
        { role: 'bot', text: "Hi! I'm your GeloPOS Business Assistant. I have access to your live sales, inventory, and product data. How can I help you today?" }
    ]);
    const [inputText, setInputText] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const scrollRef = useRef();



    const sendMessage = async () => {
        const text = inputText.trim();
        if (!text || isChatLoading) return;

        setInputText('');
        const newMessages = [...messages, { role: 'user', text }];
        setMessages(newMessages);
        setIsChatLoading(true);

        try {
            const db = await getDBConnection();

            // 1. Get All Products
            const allProducts = await db.getAllAsync('SELECT name, price FROM products WHERE deleted_at IS NULL');
            const productList = allProducts.map(p => `${p.name} (₱${p.price.toFixed(2)})`).join(', ');

            // 2. Get All Ingredients / Inventory
            const allIngredients = await db.getAllAsync('SELECT name, stock_quantity, unit FROM ingredients WHERE deleted_at IS NULL');
            const inventoryList = allIngredients.map(i => `${i.name}: ${i.stock_quantity} ${i.unit}`).join(', ');

            // 3. Get Top 10 Products (Last 30 Days)
            const recentTop = await db.getAllAsync(`
                SELECT COALESCE(p.name, 'Deleted') as name, SUM(oi.quantity) as qty
                FROM order_items oi
                JOIN orders o ON oi.order_id = o.id
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE o.status = 'Completed' AND DATE(o.created_at) >= DATE('now', '-30 days', 'localtime')
                GROUP BY name ORDER BY qty DESC LIMIT 10
            `);
            const topProducts = recentTop.map(s => `${s.name} (${s.qty} sold)`).join(', ') || 'No sales';

            // 4. Get Today's Totals
            const todayStats = await db.getFirstAsync(`
                SELECT COUNT(*) as count, SUM(total_amount) as revenue
                FROM orders
                WHERE status = 'Completed' AND DATE(created_at) = DATE('now', 'localtime')
            `);

            // 5. Get Last 7 Days Totals
            const weekStats = await db.getFirstAsync(`
                SELECT COUNT(*) as count, SUM(total_amount) as revenue
                FROM orders
                WHERE status = 'Completed' AND DATE(created_at) >= DATE('now', '-7 days', 'localtime')
            `);

            const posContext = `
[LIVE BUSINESS STATE]
- PRODUCTS: ${productList}
- INVENTORY: ${inventoryList}
- TOP 10 SELLERS (30d): ${topProducts}
- TODAY: ₱${(todayStats?.revenue || 0).toFixed(2)} (${todayStats?.count || 0} orders)
- 7-DAY: ₱${(weekStats?.revenue || 0).toFixed(2)} (${weekStats?.count || 0} orders)
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
                const combinedSystemText = SYSTEM_PROMPT + `\n\n[POS MANUAL]\n${POS_MANUAL}\n\n[LIVE BUSINESS STATE]\n${posContext}`;
                
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    // Try both string and object formats for systemInstruction for max compatibility
                    systemInstruction: { parts: [{ text: combinedSystemText }] }
                });

                // Hybrid approach: If history is empty, prepend the manual to the FIRST message
                // to ensure the AI "sees" it even if systemInstruction is ignored.
                let messageToSend = text;
                if (filteredHistory.length === 0) {
                    messageToSend = `[REFERENCE MANUAL]\n${POS_MANUAL}\n\n[BUSINESS DATA]\n${posContext}\n\n[QUESTION]\n${text}`;
                }

                const chat = model.startChat({ history: filteredHistory });
                const result = await chat.sendMessage(messageToSend);
                const response = await result.response;
                return response.text();
            };

            let reply = '';
            try {
                // Restore original model name sequence as requested
                reply = await attemptChat("gemini-2.5-flash-lite");
            } catch (err) {
                const errStr = String(err.message);
                if (errStr.includes('404') || errStr.includes('429') || errStr.includes('not found') || errStr.includes('quota')) {
                    console.log(`Fallback: gemini-2.5-flash-lite failed. Trying gemini-1.5-flash...`);
                    reply = await attemptChat("gemini-1.5-flash");
                } else {
                    throw err; 
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
            {/* Chatbot expanded to full screen height */}
            <View style={[s.chatContainer, { flex: 1 }]}>
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
