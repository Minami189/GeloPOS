import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Lock, ArrowLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

// Default PIN if not in .env
const ADMIN_PIN = process.env.EXPO_PUBLIC_ADMIN_PIN || '1234';

export default function AdminAuthGate({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const navigation = useNavigation();

    const handleLogin = () => {
        if (pin === ADMIN_PIN) {
            setIsAuthenticated(true);
            setError('');
        } else {
            setError('Incorrect PIN. Please try again.');
            setPin('');
        }
    };

    if (isAuthenticated) {
        return <>{children}</>;
    }

    return (
        <View style={styles.overlay}>
            <View style={styles.headerRow}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('POS')}>
                    <ArrowLeft color="#4b5563" size={24} />
                    <Text style={styles.backBtnText}>Return to POS</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
                <View style={styles.iconContainer}>
                    <Lock color="#4b5563" size={40} />
                </View>
                <Text style={styles.title}>Admin Access</Text>
                <Text style={styles.subtitle}>Enter PIN to continue</Text>

                <TextInput
                    style={styles.input}
                    value={pin}
                    onChangeText={(text) => {
                        setPin(text);
                        setError(''); // Clear error on typing
                    }}
                    keyboardType="numeric"
                    secureTextEntry
                    placeholder="****"
                    placeholderTextColor="#9ca3af"
                    maxLength={4}
                    onSubmitEditing={handleLogin}
                />

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <TouchableOpacity style={styles.button} onPress={handleLogin}>
                    <Text style={styles.buttonText}>Unlock</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#f3f4f6', 
        alignItems: 'center',
        zIndex: 999
    },
    headerRow: {
        width: '100%',
        padding: 20,
        alignItems: 'flex-start'
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 10,
        backgroundColor: '#e5e7eb',
        borderRadius: 8
    },
    backBtnText: {
        fontSize: 16,
        color: '#4b5563',
        fontWeight: '600'
    },
    modalContent: {
        marginTop: 60,
        backgroundColor: '#fff',
        padding: 40,
        borderRadius: 16,
        width: 400,
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8
    },
    iconContainer: {
        backgroundColor: '#f3f4f6',
        padding: 16,
        borderRadius: 40,
        marginBottom: 20
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1f2937',
        marginBottom: 8
    },
    subtitle: {
        fontSize: 16,
        color: '#6b7280',
        marginBottom: 30
    },
    input: {
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 8,
        padding: 15,
        fontSize: 24,
        textAlign: 'center',
        letterSpacing: 8,
        width: '100%',
        color: '#1f2937',
        backgroundColor: '#f9fafb',
        marginBottom: 10
    },
    errorText: {
        color: '#ef4444',
        fontSize: 14,
        marginBottom: 20,
        alignSelf: 'flex-start'
    },
    button: {
        backgroundColor: '#10b981',
        paddingVertical: 15,
        borderRadius: 8,
        width: '100%',
        alignItems: 'center',
        marginTop: 10
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold'
    }
});
