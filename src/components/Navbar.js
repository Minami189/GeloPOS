import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { LayoutGrid, ShoppingCart, ChefHat, BarChart2, LogOut, Settings, Shield, Briefcase, UserCheck, Archive } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { showConfirm } from '../lib/alerts';

const ROLE_ICONS = {
    admin: Shield,
    cashier: Briefcase,
    staff: UserCheck,
};

export default function Navbar() {
    const navigation = useNavigation();
    const { currentUser, logout } = useAuth();
    const perms = currentUser?.permissions || {};
    
    const UserIcon = currentUser ? (ROLE_ICONS[currentUser.role] || UserCheck) : null;
    const roleColor = currentUser?.role === 'admin' ? '#f59e0b' : currentUser?.role === 'cashier' ? '#3b82f6' : '#10b981';

    const handleLogout = () => {
        showConfirm(
            'Sign Out',
            `Sign out of ${currentUser?.username}?`,
            logout,
            'Sign Out'
        );
    };

    return (
        <View style={styles.container}>
            {/* Top: User icon */}
            <View style={styles.topSection}>
                {currentUser && (
                    <View style={styles.userChip}>
                        <UserIcon color={roleColor} size={24} />
                    </View>
                )}
            </View>

            {/* Navigation icons in middle */}
            <View style={styles.middleIcons}>
                {perms.admin && (
                    <TouchableOpacity style={styles.iconContainer} onPress={() => navigation.navigate('Admin')}>
                        <LayoutGrid color="#4b5563" size={26} />
                    </TouchableOpacity>
                )}
                {perms.inventory && (
                    <TouchableOpacity style={styles.iconContainer} onPress={() => navigation.navigate('Inventory')}>
                        <Archive color="#4b5563" size={26} />
                    </TouchableOpacity>
                )}
                {perms.pos && (
                    <TouchableOpacity style={styles.iconContainer} onPress={() => navigation.navigate('POS')}>
                        <ShoppingCart color="#4b5563" size={26} />
                    </TouchableOpacity>
                )}
                {perms.kitchen && (
                    <TouchableOpacity style={styles.iconContainer} onPress={() => navigation.navigate('Kitchen')}>
                        <ChefHat color="#4b5563" size={26} />
                    </TouchableOpacity>
                )}
                {perms.analytics && (
                    <TouchableOpacity style={styles.iconContainer} onPress={() => navigation.navigate('Analytics')}>
                        <BarChart2 color="#4b5563" size={26} />
                    </TouchableOpacity>
                )}
                {perms.settings && (
                    <TouchableOpacity style={styles.iconContainer} onPress={() => navigation.navigate('Settings')}>
                        <Settings color="#4b5563" size={26} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Bottom: logout */}
            <View style={styles.bottomSection}>
                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                    <LogOut color="#ef4444" size={22} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 80,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        paddingVertical: 20,
        borderRightWidth: 1,
        borderColor: '#e5e7eb',
        elevation: 1,
        justifyContent: 'space-between',
        zIndex: 10
    },
    topSection: {
        alignItems: 'center',
        paddingTop: 4,
    },
    userChip: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: '#f8fafc',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    middleIcons: {
        gap: 24,
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    bottomSection: {
        alignItems: 'center',
        gap: 12,
        paddingBottom: 8,
    },
    iconContainer: {
        padding: 12,
        borderRadius: 12,
        backgroundColor: 'transparent',
    },
    logoutBtn: {
        padding: 10,
        borderRadius: 12,
        backgroundColor: '#fef2f2',
    },
});
