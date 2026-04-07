import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, Dimensions, ScrollView, Image
} from 'react-native';
import { LogIn, ChevronLeft, Shield, Briefcase, UserCheck, User } from 'lucide-react-native';
import { getDBConnection } from '../lib/database';
import { useAuth } from '../context/AuthContext';
import { fetchUsersFromSupabase } from '../lib/syncService';
import GelosLogo from '../../assets/GelosLogo.png';
import { Alert, TextInput } from 'react-native';

const { width, height } = Dimensions.get('window');

// Role icon map — formal Lucide icons
const ROLE_ICONS = {
    admin: Shield,
    cashier: Briefcase,
    staff: UserCheck,
};

const ROLE_COLORS = {
    admin: { bg: '#fbbf24', text: '#78350f', border: '#f59e0b' },
    cashier: { bg: '#60a5fa', text: '#1e3a5f', border: '#3b82f6' },
    staff: { bg: '#34d399', text: '#064e3b', border: '#10b981' },
};
function UserCard({ user, onSelect, selected }) {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.staff;
    const RoleIcon = ROLE_ICONS[user.role] || User;

    useEffect(() => {
        Animated.spring(scaleAnim, { toValue: selected ? 1.08 : 1, useNativeDriver: true }).start();
    }, [selected]);

    // Border color driven by plain JS state — no animated node conflict
    const borderColor = selected ? roleColor.border : 'rgba(255,255,255,0.15)';

    return (
        <TouchableOpacity onPress={() => onSelect(user)} activeOpacity={0.85}>
            {/* Outer: native-driver scale only */}
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                {/* Inner: plain border color from JS state */}
                <View style={[
                    styles.userCard,
                    { borderColor }
                ]}>
                    {/* Avatar with Lucide icon */}
                    <View style={[styles.avatarBox, { backgroundColor: roleColor.bg, borderColor: roleColor.border }]}>
                        <RoleIcon color={roleColor.text} size={36} />
                    </View>

                    {/* Name */}
                    <Text style={styles.userName}>{user.username}</Text>

                    {/* Role badge */}
                    <View style={[styles.roleBadge, { backgroundColor: roleColor.bg + '33' }]}>
                        <Text style={[styles.roleText, { color: roleColor.bg }]}>
                            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                        </Text>
                    </View>
                </View>
            </Animated.View>
        </TouchableOpacity>
    );
}

function PasswordPad({ onSubmit, onBack, selectedUser, loading, error }) {
    const [password, setPassword] = useState('');
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(40)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();
    }, []);

    useEffect(() => {
        if (error) {
            setPassword('');
            Animated.sequence([
                Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
                Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
                Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
                Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
            ]).start();
        }
    }, [error]);

    const handleSubmit = () => {
        if (password.length > 0) onSubmit(password);
    };

    const roleColor = ROLE_COLORS[selectedUser.role] || ROLE_COLORS.staff;
    const RoleIcon = ROLE_ICONS[selectedUser.role] || User;

    return (
        <Animated.View style={[
            styles.pinPadContainer,
            { transform: [{ translateY: slideAnim }, { translateX: shakeAnim }], opacity: opacityAnim }
        ]}>
            <TouchableOpacity style={styles.backBtn} onPress={onBack}>
                <ChevronLeft color="#fff" size={20} />
                <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>

            <View style={[styles.pinAvatarBox, { backgroundColor: roleColor.bg }]}>
                <RoleIcon color={roleColor.text} size={32} />
            </View>
            <Text style={styles.pinUserName}>{selectedUser.username}</Text>
            <Text style={styles.pinPrompt}>Enter Password</Text>

            <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoFocus
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.3)"
                onSubmitEditing={handleSubmit}
            />

            {error ? <Text style={styles.pinError}>{error}</Text> : null}

            <TouchableOpacity
                style={[styles.loginBtn, { backgroundColor: roleColor.border, marginTop: 10 }, loading && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={loading}
            >
                <LogIn color="#fff" size={20} />
                <Text style={styles.loginBtnText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
            </TouchableOpacity>
        </Animated.View>
    );
}

export default function LoginScreen() {
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [loginError, setLoginError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const titleY = useRef(new Animated.Value(-20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.spring(titleY, { toValue: 0, useNativeDriver: true }),
        ]).start();
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            await fetchUsersFromSupabase();
            const db = await getDBConnection();
            const rows = await db.getAllAsync('SELECT * FROM users ORDER BY id ASC');
            
            if (rows.length === 0) {
                Alert.alert("First Install", "No users found. Ensure you have an internet connection to fetch users from the database.");
            }
            setUsers(rows);
        } catch (e) {
            console.error('Failed to load users:', e);
        }
    };

    const handleSelectUser = (user) => {
        setSelectedUser(user);
        setLoginError('');
    };

    const handlePasswordSubmit = async (password) => {
        setIsLoading(true);
        const result = await login(selectedUser.id, password);
        setIsLoading(false);
        if (!result.success) {
            setLoginError(result.error);
        }
    };

    const handleBack = () => {
        setSelectedUser(null);
        setLoginError('');
    };

    return (
        <View style={styles.screen}>
            {/* Background gradient layers */}
            <View style={styles.bgBottom} />
            <View style={styles.bgTop} />
            <View style={styles.bgShimmer} />

            {/* Content */}
            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
                {/* Title — hidden when PIN pad is active to prevent overflow */}
                {!selectedUser && (
                    <Animated.View style={[styles.titleArea, { transform: [{ translateY: titleY }] }]}>
                        <View style={styles.logoBox}><Image source={GelosLogo} style={styles.logo} /></View>
                        <Text style={styles.appName}>Gelos</Text>
                        <Text style={styles.appSubtitle}>Point of Sale System</Text>
                    </Animated.View>
                )}

                {/* User picker or PIN pad */}
                {!selectedUser ? (
                    <View style={styles.pickerArea}>
                        <Text style={styles.pickerLabel}>Select your account</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.userList}
                        >
                            {users.map(u => (
                                <UserCard
                                    key={u.id}
                                    user={u}
                                    onSelect={handleSelectUser}
                                    selected={selectedUser?.id === u.id}
                                />
                            ))}
                        </ScrollView>
                        <View style={styles.divider} />
                        <Text style={styles.footer}>© 2026 GeloPOS · All rights reserved</Text>
                    </View>
                ) : (
                    <PasswordPad
                        selectedUser={selectedUser}
                        onSubmit={handlePasswordSubmit}
                        onBack={handleBack}
                        loading={isLoading}
                        error={loginError}
                    />
                )}
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#0d1117',
        justifyContent: 'center',
        alignItems: 'center',
    },
    bgBottom: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#0d1117',
    },
    bgTop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: height * 0.55,
        backgroundColor: '#111827',
        borderBottomLeftRadius: 80,
        borderBottomRightRadius: 80,
    },
    bgShimmer: {
        position: 'absolute',
        top: height * 0.1,
        left: width * 0.2,
        width: width * 0.6,
        height: height * 0.4,
        borderRadius: 300,
        backgroundColor: 'rgba(59,130,246,0.06)',
    },
    content: {
        flex: 1,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },

    // Title
    titleArea: {
        alignItems: 'center',
        marginBottom: 48,
    },
    logo: {
        width: 100,
        height: 100,
        resizeMode: 'contain',
        marginBottom: 5,
    },
    logoBox: {
        marginTop: 0,
        width: 100,
        height: 100,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
    },
    logoText: { fontSize: 40 },
    appName: {
        fontSize: 36,
        fontWeight: '800',
        color: '#ffffff',
        letterSpacing: 2,
        marginBottom: 6,
    },
    appSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 3,
        textTransform: 'uppercase',
    },

    // User picker
    pickerArea: {
        alignItems: 'center',
        width: '100%',
    },
    pickerLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.45)',
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 28,
    },
    userList: {
        paddingHorizontal: 40,
        gap: 24,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: width,
    },
    userCard: {
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1.5,
        borderRadius: 20,
        paddingVertical: 28,
        paddingHorizontal: 28,
        width: 160,
        gap: 12,
        backdropFilter: 'blur(10px)',
    },
    avatarBox: {
        width: 80,
        height: 80,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        marginBottom: 4,
    },
    avatarEmoji: { fontSize: 38 },
    userName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#ffffff',
        textAlign: 'center',
    },
    roleBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
    },
    roleText: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    divider: {
        width: 60,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginTop: 40,
        marginBottom: 16,
    },
    footer: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: 1,
    },

    // PIN pad
    pinPadContainer: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 28,
        padding: 36,
        alignItems: 'center',
        width: 360,
        maxWidth: '90%',
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        marginBottom: 24,
        gap: 4,
        opacity: 0.7,
    },
    backBtnText: { color: '#fff', fontSize: 14 },
    pinAvatarBox: {
        width: 72,
        height: 72,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    pinAvatarEmoji: { fontSize: 34 },
    pinUserName: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    pinPrompt: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
        marginBottom: 16,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    passwordInput: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 14,
        padding: 16,
        color: '#fff',
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 16,
    },
    pinError: {
        color: '#f87171',
        fontSize: 13,
        marginBottom: 12,
        textAlign: 'center',
    },

    loginBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 14,
        width: '100%',
        gap: 10,
    },
    loginBtnText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: 0.5,
        textDecorationLine: 'none',
    },
});
