import React, { createContext, useContext, useState, useCallback } from 'react';
import { getDBConnection } from '../lib/database';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null); // null = not logged in

    const login = useCallback(async (userId, pin) => {
        try {
            const db = await getDBConnection();
            const user = await db.getFirstAsync(
                'SELECT * FROM users WHERE id = ? AND pin = ?',
                [userId, pin]
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
                    }
                });
                return { success: true };
            } else {
                return { success: false, error: 'Incorrect PIN. Please try again.' };
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
