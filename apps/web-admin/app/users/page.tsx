"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Plus, Trash2, Save, X, RefreshCw, Key, UserPlus, Pencil,
    Users, Shield, CheckCircle2, AlertCircle, Search, Filter,
    MoreVertical, Mail, Calendar, Clock
} from "lucide-react";

interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    is_active: boolean;
    last_login_at?: string;
    created_at: string;
    updated_at: string;
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState<string>("all");
    const [newUser, setNewUser] = useState({ email: "", password: "", name: "", role: "VIEWER" });
    const [editUser, setEditUser] = useState({ name: "", email: "", role: "" });

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/users');
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data);
            setError("");
        } catch (err) {
            console.error(err);
            setError('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    // Auto-dismiss messages
    useEffect(() => {
        if (error || success) {
            const timer = setTimeout(() => {
                setError("");
                setSuccess("");
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [error, success]);

    const handleCreateUser = async () => {
        if (!newUser.email || !newUser.password || !newUser.name) {
            setError('Email, password, and name are required');
            return;
        }
        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to create user');
            }
            setIsCreating(false);
            setNewUser({ email: "", password: "", name: "", role: "VIEWER" });
            setSuccess("User created successfully");
            fetchUsers();
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleUpdateUser = async (id: string) => {
        try {
            const res = await fetch(`/api/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editUser),
            });
            if (!res.ok) throw new Error('Failed to update user');
            setEditingUserId(null);
            setSuccess("User updated successfully");
            fetchUsers();
        } catch (err) {
            console.error(err);
            setError('Failed to update user');
        }
    };

    const handleDeleteUser = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;
        try {
            const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete user');
            setSuccess("User deleted successfully");
            fetchUsers();
        } catch (err) {
            console.error(err);
            setError('Failed to delete user');
        }
    };

    const handleToggleActive = async (id: string, isActive: boolean, name: string) => {
        try {
            const action = isActive ? 'activate' : 'deactivate';
            const res = await fetch(`/api/users/${id}/${action}`, { method: 'POST' });
            if (!res.ok) throw new Error('Failed to update user status');
            setSuccess(`${name} ${isActive ? 'activated' : 'deactivated'} successfully`);
            fetchUsers();
        } catch (err) {
            console.error(err);
            setError('Failed to update user status');
        }
    };

    const handleResetPassword = async (id: string, name: string) => {
        const newPassword = prompt(`Enter new password for ${name}:`);
        if (!newPassword) return;
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        try {
            const res = await fetch(`/api/users/${id}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_password: newPassword }),
            });
            if (!res.ok) throw new Error('Failed to reset password');
            setSuccess(`Password reset for ${name}`);
        } catch (err) {
            console.error(err);
            setError('Failed to reset password');
        }
    };

    const getRoleBadgeStyles = (role: string) => {
        switch (role) {
            case 'ADMIN':
                return 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30';
            case 'OPERATOR':
                return 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30';
            default:
                return 'bg-gradient-to-r from-slate-500/20 to-gray-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30';
        }
    };

    const getRoleIcon = (role: string) => {
        switch (role) {
            case 'ADMIN':
                return <Shield className="h-3 w-3 mr-1" />;
            case 'OPERATOR':
                return <Key className="h-3 w-3 mr-1" />;
            default:
                return <Users className="h-3 w-3 mr-1" />;
        }
    };

    const formatDate = (dateStr: string) => {
        try {
            if (!dateStr) return 'N/A';
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return 'N/A';
            return new Intl.DateTimeFormat('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            }).format(date);
        } catch {
            return 'N/A';
        }
    };

    const formatLastLogin = (dateStr?: string) => {
        try {
            if (!dateStr) return 'Never';
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return 'Never';
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffHours / 24);

            if (diffHours < 1) return 'Just now';
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            return formatDate(dateStr);
        } catch {
            return 'Never';
        }
    };

    // Filter users
    const filteredUsers = users.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.email.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesRole = roleFilter === 'all' || user.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    // Stats
    const stats = {
        total: users.length,
        active: users.filter(u => u.is_active).length,
        admins: users.filter(u => u.role === 'ADMIN').length,
        operators: users.filter(u => u.role === 'OPERATOR').length,
    };

    return (
        <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto fade-in">
            {/* Header Section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 shadow-lg">
                        <Users className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">User Management</h1>
                        <p className="text-muted-foreground text-sm lg:text-base">
                            Manage system users, roles and permissions
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={fetchUsers} disabled={loading} className="btn-lift">
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button onClick={() => setIsCreating(true)} className="btn-lift bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90">
                        <UserPlus className="h-4 w-4 mr-2" />
                        Add User
                    </Button>
                </div>
            </div>

            {/* Alerts */}
            {error && (
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-xl flex items-center justify-between gap-3 fade-in">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/20">
                            <AlertCircle className="h-5 w-5 text-destructive" />
                        </div>
                        <p className="text-destructive font-medium">{error}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setError('')} className="text-destructive hover:bg-destructive/10">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {success && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3 fade-in">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20">
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        </div>
                        <p className="text-emerald-600 dark:text-emerald-400 font-medium">{success}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSuccess('')} className="text-emerald-600 hover:bg-emerald-500/10">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="stat-card card-hover border-border/50 bg-gradient-to-br from-card to-card/80">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Total Users</p>
                                <p className="text-3xl font-bold mt-1">{stats.total}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Users className="h-6 w-6 text-primary" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="stat-card card-hover border-border/50 bg-gradient-to-br from-card to-card/80">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Active</p>
                                <p className="text-3xl font-bold mt-1 text-emerald-500">{stats.active}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="stat-card card-hover border-border/50 bg-gradient-to-br from-card to-card/80">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Admins</p>
                                <p className="text-3xl font-bold mt-1 text-purple-500">{stats.admins}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                <Shield className="h-6 w-6 text-purple-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="stat-card card-hover border-border/50 bg-gradient-to-br from-card to-card/80">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Operators</p>
                                <p className="text-3xl font-bold mt-1 text-blue-500">{stats.operators}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                <Key className="h-6 w-6 text-blue-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Create User Form */}
            {isCreating && (
                <Card className="border-2 border-primary/30 shadow-lg shadow-primary/5 fade-in">
                    <CardHeader className="pb-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                                <UserPlus className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle>Create New User</CardTitle>
                                <CardDescription>Add a new user to the system</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-5 max-w-2xl">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-1">
                                        Full Name <span className="text-destructive">*</span>
                                    </label>
                                    <input
                                        className="w-full flex h-11 rounded-xl border border-input bg-background px-4 py-2 text-sm transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                                        placeholder="John Doe"
                                        value={newUser.name}
                                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-1">
                                        Email Address <span className="text-destructive">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        className="w-full flex h-11 rounded-xl border border-input bg-background px-4 py-2 text-sm transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                                        placeholder="user@example.com"
                                        value={newUser.email}
                                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-1">
                                        Password <span className="text-destructive">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        className="w-full flex h-11 rounded-xl border border-input bg-background px-4 py-2 text-sm transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                                        placeholder="••••••••"
                                        value={newUser.password}
                                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Role</label>
                                    <select
                                        className="w-full flex h-11 rounded-xl border border-input bg-background px-4 py-2 text-sm transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                                        value={newUser.role}
                                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                                    >
                                        <option value="VIEWER">Viewer - Read only access</option>
                                        <option value="OPERATOR">Operator - Can manage streams</option>
                                        <option value="ADMIN">Admin - Full access</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-3 justify-end pt-4 border-t">
                                <Button variant="ghost" onClick={() => { setIsCreating(false); setNewUser({ email: "", password: "", name: "", role: "VIEWER" }); }}>
                                    Cancel
                                </Button>
                                <Button onClick={handleCreateUser} className="bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Create User
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search users by name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-11 pl-11 pr-4 rounded-xl border border-input bg-background text-sm transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <select
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="h-11 px-4 rounded-xl border border-input bg-background text-sm transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                    >
                        <option value="all">All Roles</option>
                        <option value="ADMIN">Admin</option>
                        <option value="OPERATOR">Operator</option>
                        <option value="VIEWER">Viewer</option>
                    </select>
                </div>
            </div>

            {/* Users Table */}
            <Card className="border-border/50 overflow-hidden">
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-12 text-center">
                            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary mb-3" />
                            <p className="text-muted-foreground">Loading users...</p>
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="p-12 text-center">
                            <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                            <p className="text-lg font-medium text-muted-foreground">No users found</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                {searchQuery || roleFilter !== 'all'
                                    ? 'Try adjusting your search or filter'
                                    : 'Create your first user to get started'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b bg-muted/30">
                                        <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-4">User</th>
                                        <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-4">Role</th>
                                        <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-4 hidden md:table-cell">Last Login</th>
                                        <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-4 hidden lg:table-cell">Created</th>
                                        <th className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-4">Status</th>
                                        <th className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-4">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map((user) => (
                                        <tr key={user.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
                                            <td className="px-6 py-4">
                                                {editingUserId === user.id ? (
                                                    <div className="flex flex-col gap-2 max-w-xs">
                                                        <input
                                                            className="h-9 rounded-lg border bg-background px-3 text-sm"
                                                            placeholder="Name"
                                                            value={editUser.name}
                                                            onChange={(e) => setEditUser({ ...editUser, name: e.target.value })}
                                                        />
                                                        <input
                                                            type="email"
                                                            className="h-9 rounded-lg border bg-background px-3 text-sm"
                                                            placeholder="Email"
                                                            value={editUser.email}
                                                            onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-3">
                                                        <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-base font-semibold transition-all ${user.is_active
                                                            ? 'bg-gradient-to-br from-primary/20 to-amber-500/20 text-primary'
                                                            : 'bg-muted text-muted-foreground'
                                                            }`}>
                                                            {user.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium">{user.name}</p>
                                                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                                <Mail className="h-3 w-3" />
                                                                {user.email}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {editingUserId === user.id ? (
                                                    <select
                                                        className="h-9 rounded-lg border bg-background px-3 text-sm"
                                                        value={editUser.role}
                                                        onChange={(e) => setEditUser({ ...editUser, role: e.target.value })}
                                                    >
                                                        <option value="VIEWER">Viewer</option>
                                                        <option value="OPERATOR">Operator</option>
                                                        <option value="ADMIN">Admin</option>
                                                    </select>
                                                ) : (
                                                    <Badge className={`${getRoleBadgeStyles(user.role)} border font-medium`}>
                                                        {getRoleIcon(user.role)}
                                                        {user.role}
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 hidden md:table-cell">
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    {formatLastLogin(user.last_login_at)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 hidden lg:table-cell">
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    {formatDate(user.created_at)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <Switch
                                                        checked={user.is_active}
                                                        onCheckedChange={(checked) => handleToggleActive(user.id, checked, user.name)}
                                                        disabled={editingUserId === user.id}
                                                    />
                                                    <span className={`text-xs font-medium ${user.is_active ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                                                        {user.is_active ? 'Active' : 'Inactive'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center justify-end gap-1">
                                                    {editingUserId === user.id ? (
                                                        <>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => setEditingUserId(null)}
                                                                className="h-8 w-8 p-0"
                                                            >
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleUpdateUser(user.id)}
                                                                className="h-8 px-3 bg-primary hover:bg-primary/90"
                                                            >
                                                                <Save className="h-4 w-4 mr-1" />
                                                                Save
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    setEditingUserId(user.id);
                                                                    setEditUser({ name: user.name, email: user.email, role: user.role });
                                                                }}
                                                                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                title="Edit user"
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleResetPassword(user.id, user.name)}
                                                                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                title="Reset password"
                                                            >
                                                                <Key className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleDeleteUser(user.id, user.name)}
                                                                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                title="Delete user"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Help Text */}
            <div className="text-center text-sm text-muted-foreground px-4">
                <p>
                    <strong>Tip:</strong> Admin users have full access, Operators can manage streams, and Viewers have read-only access.
                </p>
            </div>
        </div>
    );
}
