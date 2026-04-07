import React, { createContext, useContext, useState, useCallback } from 'react';
import { getDBConnection } from '../lib/database';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null); // null = not logged in

    const login = useCallback(async (userId, password) => {
        try {
            const db = await getDBConnection();
            const user = await db.getFirstAsync(
                'SELECT * FROM users WHERE id = ? AND password = ?',
                [userId, password]
            );
            if (user) {
                setCurrentUser({
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    avatarEmoji: user.avatar_emoji,
                    permissions: {
                        pos: user.role === 'admin' ? true : !!user.can_access_pos,
                        kitchen: user.role === 'admin' ? true : !!user.can_access_kitchen,
                        admin: user.role === 'admin' ? true : !!user.can_access_admin,
                        analytics: user.role === 'admin' ? true : !!user.can_access_analytics,
                        settings: user.role === 'admin' ? true : !!user.can_access_settings,
                        inventory: user.role === 'admin' ? true : !!user.can_access_inventory,
                    }
                });
                return { success: true };
            } else {
                return { success: false, error: 'Incorrect Password. Please try again.' };
            }
        } catch (e) {
            console.error('Login error:', e);
            return { success: false, error: 'Login failed. Please try again.' };
        }
    }, []);

    const logout = useCallback(() => {
        setCurrentUser(null);
    }, []);

    const refreshCurrentUser = useCallback(async () => {
        if (!currentUser) return;
        try {
            const db = await getDBConnection();
            const user = await db.getFirstAsync('SELECT * FROM users WHERE id = ?', [currentUser.id]);
            if (user) {
                setCurrentUser({
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    avatarEmoji: user.avatar_emoji,
                    permissions: {
                        pos: user.role === 'admin' ? true : !!user.can_access_pos,
                        kitchen: user.role === 'admin' ? true : !!user.can_access_kitchen,
                        admin: user.role === 'admin' ? true : !!user.can_access_admin,
                        analytics: user.role === 'admin' ? true : !!user.can_access_analytics,
                        settings: user.role === 'admin' ? true : !!user.can_access_settings,
                        inventory: user.role === 'admin' ? true : !!user.can_access_inventory,
                    }
                });
            }
        } catch (e) {
            console.error('Refresh user error:', e);
        }
    }, [currentUser]);

    return (
        <AuthContext.Provider value={{ currentUser, login, logout, refreshCurrentUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
