import React, { useState, useCallback } from 'react';
import bcrypt from 'bcryptjs';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    TextInput, Alert, Switch, ActivityIndicator, Modal
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
    Lock, UserPlus, Trash2, Shield, Edit3, Check, X, Users
} from 'lucide-react-native';
import { getDBConnection } from '../../lib/database';
import { useAuth } from '../../context/AuthContext';
import { fetchUsersFromSupabase, syncUsersToSupabase } from '../../lib/syncService';

const PAGE_PERMISSIONS = [
    { key: 'can_access_pos', label: 'POS', color: '#3b82f6' },
    { key: 'can_access_kitchen', label: 'Kitchen', color: '#f59e0b' },
    { key: 'can_access_admin', label: 'Admin Panel', color: '#ef4444' },
    { key: 'can_access_analytics', label: 'Analytics', color: '#8b5cf6' },
    { key: 'can_access_settings', label: 'Settings & Access', color: '#10b981' },
    { key: 'can_access_inventory', label: 'Inventory', color: '#f97316' },
];

const ROLE_OPTIONS = ['cashier', 'staff', 'admin'];
const MAX_USERS = 5;

const AVATAR_OPTIONS = ['💻', '👤', '📠', '🥄', '🧑‍🔧', '⭐'];

function PasswordChangeCard({ title, icon: Icon, color, onSave }) {
    const [current, setCurrent] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!newPassword) { Alert.alert('Error', 'New Password cannot be empty.'); return; }
        if (newPassword !== confirm) { Alert.alert('Error', 'New Password and confirmation do not match.'); return; }
        setLoading(true);
        await onSave(current, newPassword);
        setLoading(false);
        setCurrent(''); setNewPassword(''); setConfirm('');
    };

    return (
        <View style={[pc.card, { borderLeftColor: color }]}>
            <View style={pc.header}>
                <View style={[pc.iconWrap, { backgroundColor: color + '22' }]}>
                    <Icon color={color} size={20} />
                </View>
                <Text style={pc.title}>{title}</Text>
            </View>
            <TextInput
                style={pc.input}
                value={current}
                onChangeText={setCurrent}
                placeholder="Current Password"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                autoCapitalize="none"
            />
            <TextInput
                style={pc.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="New Password"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                autoCapitalize="none"
            />
            <TextInput
                style={pc.input}
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Confirm New Password"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                autoCapitalize="none"
            />
            <TouchableOpacity style={[pc.saveBtn, { backgroundColor: color }]} onPress={handleSave} disabled={loading}>
                {loading ? <ActivityIndicator size="small" color="#fff" /> : <Check color="#fff" size={16} />}
                <Text style={pc.saveBtnText}>Update Password</Text>
            </TouchableOpacity>
        </View>
    );
}

function UserCard({ user, onDelete, onUpdatePermissions, isCurrentUser, isLastAdmin }) {
    const [editing, setEditing] = useState(false);
    const [perms, setPerms] = useState({
        can_access_pos: !!user.can_access_pos,
        can_access_kitchen: !!user.can_access_kitchen,
        can_access_admin: !!user.can_access_admin,
        can_access_analytics: !!user.can_access_analytics,
        can_access_settings: !!user.can_access_settings,
        can_access_inventory: !!user.can_access_inventory,
    });
    const [avatar, setAvatar] = useState(user.avatar_emoji || '👤');
    const [newPassword, setNewPassword] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        await onUpdatePermissions(user.id, perms, newPassword || null, avatar);
        setSaving(false);
        setEditing(false);
        setNewPassword('');
    };

    const isAdmin = user.role === 'admin';

    return (
        <View style={uc.card}>
            {/* Header row */}
            <View style={uc.headerRow}>
                <View style={[uc.avatar, isAdmin && uc.avatarAdmin]}>
                    <Text style={uc.avatarText}>{editing ? avatar : user.avatar_emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={uc.username}>{user.username}</Text>
                    <View style={[uc.roleBadge, isAdmin && uc.roleBadgeAdmin]}>
                        <Text style={[uc.roleText, isAdmin && uc.roleTextAdmin]}>
                            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                        </Text>
                    </View>
                </View>
                {isCurrentUser && <Text style={uc.youBadge}>YOU</Text>}
                {!isLastAdmin && !isCurrentUser && (
                    <TouchableOpacity style={uc.deleteBtn} onPress={() => onDelete(user)}>
                        <Trash2 color="#ef4444" size={18} />
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[uc.editBtn, editing && uc.editBtnActive]}
                    onPress={() => setEditing(e => !e)}
                >
                    <Edit3 color={editing ? '#fff' : '#6b7280'} size={16} />
                </TouchableOpacity>
            </View>

            {/* Permissions editor */}
            {editing && (
                <View style={uc.editor}>
                    <Text style={uc.editorLabel}>Page Access</Text>
                    {PAGE_PERMISSIONS.map(p => (
                        <View key={p.key} style={uc.permRow}>
                            <View style={[uc.permDot, { backgroundColor: p.color }]} />
                            <Text style={uc.permLabel}>{p.label}</Text>
                            <Switch
                                value={isAdmin ? true : perms[p.key]}
                                onValueChange={v => !isAdmin && setPerms(prev => ({ ...prev, [p.key]: v }))}
                                disabled={isAdmin}
                                trackColor={{ false: '#e5e7eb', true: p.color + '66' }}
                                thumbColor={perms[p.key] ? p.color : '#9ca3af'}
                            />
                        </View>
                    ))}
                    {isAdmin && (
                        <Text style={uc.adminNote}>Admin has full access to all pages.</Text>
                    )}

                    {/* Avatar picker */}
                    <Text style={[uc.editorLabel, { marginTop: 12 }]}>Change Avatar</Text>
                    <View style={am.avatarRow}>
                        {AVATAR_OPTIONS.map(a => (
                            <TouchableOpacity
                                key={a}
                                style={[am.avatarOpt, avatar === a && am.avatarOptActive]}
                                onPress={() => setAvatar(a)}
                            >
                                <Text style={am.avatarOptText}>{a}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Change Password for this user */}
                    <Text style={[uc.editorLabel, { marginTop: 12 }]}>Change Password</Text>
                    <TextInput
                        style={uc.pinInput}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        placeholder="New Password (leave blank to keep)"
                        placeholderTextColor="#9ca3af"
                        secureTextEntry
                        autoCapitalize="none"
                    />

                    <View style={uc.editorBtns}>
                        <TouchableOpacity style={uc.cancelBtn} onPress={() => { setEditing(false); setNewPassword(''); setAvatar(user.avatar_emoji || '👤'); }}>
                            <X color="#6b7280" size={16} />
                            <Text style={uc.cancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={uc.saveBtn} onPress={handleSave} disabled={saving}>
                            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Check color="#fff" size={16} />}
                            <Text style={uc.saveBtnText}>Save</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}

function AddUserModal({ onAdd, onClose }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('cashier');
    const [avatar, setAvatar] = useState('👤');
    const [perms, setPerms] = useState({
        can_access_pos: true,
        can_access_kitchen: true,
        can_access_admin: false,
        can_access_analytics: false,
        can_access_settings: false,
        can_access_inventory: false,
    });
    const [loading, setLoading] = useState(false);

    const handleAdd = async () => {
        if (!username.trim()) { Alert.alert('Error', 'Username is required.'); return; }
        if (!password) { Alert.alert('Error', 'Password is required.'); return; }
        setLoading(true);
        await onAdd({ username: username.trim(), password, role, avatar, perms });
        setLoading(false);
    };

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <View style={am.backdrop}>
                <View style={am.modal}>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={am.modalContent}>
                        <Text style={am.title}>Add New User</Text>

                        {/* Avatar picker */}
                        <Text style={am.label}>Avatar</Text>
                <View style={am.avatarRow}>
                    {AVATAR_OPTIONS.map(a => (
                        <TouchableOpacity
                            key={a}
                            style={[am.avatarOpt, avatar === a && am.avatarOptActive]}
                            onPress={() => setAvatar(a)}
                        >
                            <Text style={am.avatarOptText}>{a}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={am.label}>Username</Text>
                <TextInput style={am.input} value={username} onChangeText={setUsername} placeholder="e.g. Staff 1" placeholderTextColor="#9ca3af" />

                <Text style={am.label}>Password</Text>
                <TextInput style={am.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="e.g. Secret123" placeholderTextColor="#9ca3af" />

                <Text style={am.label}>Role</Text>
                <View style={am.roleRow}>
                    {ROLE_OPTIONS.map(r => (
                        <TouchableOpacity
                            key={r}
                            style={[am.roleBtn, role === r && am.roleBtnActive]}
                            onPress={() => setRole(r)}
                        >
                            <Text style={[am.roleBtnText, role === r && am.roleBtnTextActive]}>
                                {r.charAt(0).toUpperCase() + r.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {role !== 'admin' && (
                    <>
                        <Text style={am.label}>Page Permissions</Text>
                        {PAGE_PERMISSIONS.map(p => (
                            <View key={p.key} style={uc.permRow}>
                                <View style={[uc.permDot, { backgroundColor: p.color }]} />
                                <Text style={uc.permLabel}>{p.label}</Text>
                                <Switch
                                    value={perms[p.key]}
                                    onValueChange={v => setPerms(prev => ({ ...prev, [p.key]: v }))}
                                    trackColor={{ false: '#e5e7eb', true: p.color + '66' }}
                                    thumbColor={perms[p.key] ? p.color : '#9ca3af'}
                                />
                            </View>
                        ))}
                    </>
                )}

                        <View style={am.btnRow}>
                            <TouchableOpacity style={am.cancelBtn} onPress={onClose}>
                                <Text style={am.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={am.addBtn} onPress={handleAdd} disabled={loading}>
                                {loading ? <ActivityIndicator size="small" color="#fff" /> : <UserPlus color="#fff" size={16} />}
                                <Text style={am.addBtnText}>Add User</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

export default function AccessTab() {
    const { currentUser, refreshCurrentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [isOffline, setIsOffline] = useState(false);
    const [isFetching, setIsFetching] = useState(true);

    useFocusEffect(
        useCallback(() => {
            loadUsers();
        }, [])
    );

    const loadUsers = async () => {
        setIsFetching(true);
        const syncRes = await fetchUsersFromSupabase();
        if (!syncRes.success && String(syncRes.error).includes('Network')) {
            setIsOffline(true);
        } else {
            setIsOffline(false);
            const db = await getDBConnection();
            const rows = await db.getAllAsync('SELECT * FROM users ORDER BY id ASC');
            setUsers(rows);
        }
        setIsFetching(false);
    };

    const adminCount = users.filter(u => u.role === 'admin').length;

    const handleChangeAdminPassword = async (currentPassword, newPassword) => {
        const db = await getDBConnection();
        const adminUser = users.find(u => u.role === 'admin' && u.id === currentUser.id);
        
        if (!adminUser) return;

        // Verify current password (could be plain-text if not migrated yet)
        let isValid = false;
        try {
            isValid = bcrypt.compareSync(currentPassword, adminUser.password);
        } catch (e) { isValid = false; }

        if (!isValid && currentPassword === adminUser.password) {
            isValid = true;
        }

        if (!isValid) {
            Alert.alert('Error', 'Current password is incorrect.');
            return;
        }

        const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
        await db.runAsync('UPDATE users SET password = ? WHERE id = ?', [hashedNewPassword, adminUser.id]);
        await syncUsersToSupabase();
        Alert.alert('Success', 'Admin password updated.');
        loadUsers();
        refreshCurrentUser();
    };

    const handleDeleteUser = (user) => {
        Alert.alert(
            'Delete User',
            `Remove "${user.username}"? This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete', style: 'destructive', onPress: async () => {
                        const db = await getDBConnection();
                        await db.runAsync('DELETE FROM users WHERE id = ?', [user.id]);
                        await syncUsersToSupabase();
                        loadUsers();
                    }
                }
            ]
        );
    };

    const handleUpdatePermissions = async (userId, perms, newPassword, avatar) => {
        const db = await getDBConnection();
        const passwordToSave = newPassword ? bcrypt.hashSync(newPassword, 10) : null;

        if (passwordToSave) {
            await db.runAsync(
                `UPDATE users SET can_access_pos=?, can_access_kitchen=?, can_access_admin=?, can_access_analytics=?, can_access_settings=?, can_access_inventory=?, password=?, avatar_emoji=? WHERE id=?`,
                [perms.can_access_pos ? 1 : 0, perms.can_access_kitchen ? 1 : 0, perms.can_access_admin ? 1 : 0, perms.can_access_analytics ? 1 : 0, perms.can_access_settings ? 1 : 0, perms.can_access_inventory ? 1 : 0, passwordToSave, avatar, userId]
            );
        } else {
            await db.runAsync(
                `UPDATE users SET can_access_pos=?, can_access_kitchen=?, can_access_admin=?, can_access_analytics=?, can_access_settings=?, can_access_inventory=?, avatar_emoji=? WHERE id=?`,
                [perms.can_access_pos ? 1 : 0, perms.can_access_kitchen ? 1 : 0, perms.can_access_admin ? 1 : 0, perms.can_access_analytics ? 1 : 0, perms.can_access_settings ? 1 : 0, perms.can_access_inventory ? 1 : 0, avatar, userId]
            );
        }
        await syncUsersToSupabase();
        Alert.alert('Saved', 'User profile updated.');
        loadUsers();
        if (userId === currentUser?.id) refreshCurrentUser();
    };

    const handleAddUser = async ({ username, password, role, avatar, perms }) => {
        try {
            const db = await getDBConnection();
            const adminPerms = role === 'admin' ? [1, 1, 1, 1, 1, 1] : [
                perms.can_access_pos ? 1 : 0,
                perms.can_access_kitchen ? 1 : 0,
                perms.can_access_admin ? 1 : 0,
                perms.can_access_analytics ? 1 : 0,
                perms.can_access_settings ? 1 : 0,
                perms.can_access_inventory ? 1 : 0,
            ];
            const hashedPassword = bcrypt.hashSync(password, 10);
            await db.runAsync(
                `INSERT INTO users (username, password, role, can_access_pos, can_access_kitchen, can_access_admin, can_access_analytics, can_access_settings, can_access_inventory, avatar_emoji)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [username, hashedPassword, role, ...adminPerms, avatar]
            );
            await syncUsersToSupabase();
            Alert.alert('Success', `${username} has been added.`);
            setShowAddModal(false);
            loadUsers();
        } catch (e) {
            if (e.message?.includes('UNIQUE')) {
                Alert.alert('Error', 'A user with that username already exists.');
            } else {
                Alert.alert('Error', 'Failed to create user.');
            }
        }
    };

    if (isFetching) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={{ marginTop: 12, color: '#6b7280' }}>Verifying Connection & Permissions...</Text>
            </View>
        );
    }

    if (isOffline) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 40 }}>
                <Shield color="#ef4444" size={48} />
                <Text style={{ fontSize: 18, color: '#ef4444', fontWeight: '700' }}>Internet Required</Text>
                <Text style={{ textAlign: 'center', color: '#6b7280', marginHorizontal: 30 }}>
                    You must be connected to the internet to change access settings and passwords in order to keep the system correctly synchronized.
                </Text>
                <TouchableOpacity onPress={loadUsers} style={s.refreshBtn}>
                    <Text style={s.refreshBtnText}>Try Again</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

            {/* Change Admin Password */}
            <View style={s.sectionHeader}>
                <Lock color="#ef4444" size={20} />
                <Text style={s.sectionTitle}>Security</Text>
            </View>
            <PasswordChangeCard
                title="Change Your Password"
                icon={Lock}
                color="#ef4444"
                onSave={handleChangeAdminPassword}
            />

            {/* Users section */}
            <View style={[s.sectionHeader, { marginTop: 24 }]}>
                <Users color="#3b82f6" size={20} />
                <Text style={s.sectionTitle}>User Accounts</Text>
                <Text style={s.userCount}>{users.length} / {MAX_USERS}</Text>
            </View>

            {users.map(u => (
                <UserCard
                    key={u.id}
                    user={u}
                    isCurrentUser={u.id === currentUser?.id}
                    isLastAdmin={u.role === 'admin' && adminCount <= 1}
                    onDelete={handleDeleteUser}
                    onUpdatePermissions={handleUpdatePermissions}
                />
            ))}

            {users.length < MAX_USERS ? (
                <TouchableOpacity style={s.addUserBtn} onPress={() => setShowAddModal(true)}>
                    <UserPlus color="#3b82f6" size={20} />
                    <Text style={s.addUserText}>Add New User ({MAX_USERS - users.length} slots remaining)</Text>
                </TouchableOpacity>
            ) : (
                <View style={s.maxUsersNote}>
                    <Text style={s.maxUsersText}>Maximum of {MAX_USERS} users reached.</Text>
                </View>
            )}

            {showAddModal && (
                <AddUserModal
                    onAdd={handleAddUser}
                    onClose={() => setShowAddModal(false)}
                />
            )}
        </ScrollView>
    );
}

const s = StyleSheet.create({
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1f2937', flex: 1 },
    userCount: { fontSize: 13, color: '#9ca3af', fontWeight: '600' },
    addUserBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18, borderRadius: 14, borderWidth: 2, borderColor: '#3b82f6', borderStyle: 'dashed', marginTop: 12 },
    addUserText: { color: '#3b82f6', fontWeight: '700', fontSize: 15 },
    maxUsersNote: { padding: 16, backgroundColor: '#fef9c3', borderRadius: 12, alignItems: 'center', marginTop: 12 },
    maxUsersText: { color: '#92400e', fontWeight: '600' },
    refreshBtn: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#f3f4f6', borderRadius: 10 },
    refreshBtnText: { color: '#3b82f6', fontWeight: '700' }
});

const pc = StyleSheet.create({
    card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, marginBottom: 12, borderLeftWidth: 4, elevation: 2 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
    iconWrap: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
    input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, color: '#1f2937', backgroundColor: '#f9fafb', marginBottom: 10 },
    saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 10, gap: 8, marginTop: 4 },
    saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

const uc = StyleSheet.create({
    card: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, overflow: 'hidden', elevation: 1 },
    headerRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
    avatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
    avatarAdmin: { backgroundColor: '#fffbeb' },
    avatarText: { fontSize: 22 },
    username: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
    roleBadge: { alignSelf: 'flex-start', backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    roleBadgeAdmin: { backgroundColor: '#fffbeb' },
    roleText: { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase' },
    roleTextAdmin: { color: '#d97706' },
    youBadge: { fontSize: 10, fontWeight: '700', color: '#3b82f6', backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    deleteBtn: { padding: 8, borderRadius: 8, backgroundColor: '#fef2f2' },
    editBtn: { padding: 8, borderRadius: 8, backgroundColor: '#f3f4f6', marginLeft: 4 },
    editBtnActive: { backgroundColor: '#6366f1' },
    editor: { borderTopWidth: 1, borderColor: '#f3f4f6', padding: 16 },
    editorLabel: { fontSize: 12, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
    permRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
    permDot: { width: 8, height: 8, borderRadius: 4 },
    permLabel: { fontSize: 14, color: '#374151', flex: 1, fontWeight: '600' },
    adminNote: { fontSize: 12, color: '#9ca3af', marginTop: 8, fontStyle: 'italic' },
    pinInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, color: '#1f2937', backgroundColor: '#f9fafb', marginBottom: 10 },
    editorBtns: { flexDirection: 'row', gap: 10, marginTop: 8 },
    cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#f3f4f6', borderRadius: 10, gap: 6 },
    cancelBtnText: { color: '#6b7280', fontWeight: '700' },
    saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#6366f1', borderRadius: 10, gap: 6 },
    saveBtnText: { color: '#fff', fontWeight: '700' },
});

const am = StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
    modal: { backgroundColor: '#fff', borderRadius: 20, width: 480, maxWidth: '95%', maxHeight: '85%', overflow: 'hidden' },
    modalContent: { padding: 28 },
    title: { fontSize: 20, fontWeight: '800', color: '#1f2937', marginBottom: 20 },
    label: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
    input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, color: '#1f2937', backgroundColor: '#f9fafb', marginBottom: 14 },
    avatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    avatarOpt: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
    avatarOptActive: { borderColor: '#6366f1', backgroundColor: '#eef2ff' },
    avatarOptText: { fontSize: 22 },
    roleRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    roleBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f3f4f6' },
    roleBtnActive: { backgroundColor: '#6366f1' },
    roleBtnText: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
    roleBtnTextActive: { color: '#fff' },
    btnRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
    cancelBtn: { flex: 1, padding: 14, backgroundColor: '#f3f4f6', borderRadius: 12, alignItems: 'center' },
    cancelBtnText: { color: '#6b7280', fontWeight: '700', fontSize: 15 },
    addBtn: { flex: 1, flexDirection: 'row', padding: 14, backgroundColor: '#3b82f6', borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
    addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
