"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Shield,
    Users,
    Key,
    History,
    Lock,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Eye,
    EyeOff,
    Copy,
    Clock,
    User,
    Settings,
    Activity,
} from "lucide-react";

interface User {
    id: string;
    email: string;
    name: string;
    role: "ADMIN" | "OPERATOR" | "VIEWER";
    lastLogin: string;
    status: "active" | "inactive";
}

interface AuditLog {
    id: number;
    created_at: string;
    user_email: string;
    action: string;
    details: any;
}

interface Channel {
    id: number;
    name: string;
    display_name: string;
    obs_token: string;
    loop_token: string;
}

function getRoleBadge(role: string) {
    switch (role) {
        case "ADMIN":
            return (
                <Badge className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30">
                    <Shield className="h-3 w-3 mr-1" />
                    Admin
                </Badge>
            );
        case "OPERATOR":
            return (
                <Badge className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30">
                    <Key className="h-3 w-3 mr-1" />
                    Operator
                </Badge>
            );
        case "VIEWER":
            return (
                <Badge className="bg-gradient-to-r from-slate-500/20 to-gray-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30">
                    <User className="h-3 w-3 mr-1" />
                    Viewer
                </Badge>
            );
        default:
            return null;
    }
}

export default function SecurityPage() {
    const { data: session } = useSession();
    const isAdmin = (session?.user as any)?.role === "ADMIN";

    const [users, setUsers] = useState<User[]>([]);
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [passData, setPassData] = useState({ current: "", new: "", confirm: "" });
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null);
    const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});

    const fetchData = async () => {
        try {
            fetch('/api/audit-logs').then(r => r.json()).then(data => {
                if (Array.isArray(data)) setLogs(data);
            });
            if (isAdmin) {
                fetch('/api/users').then(r => r.json()).then(data => {
                    if (Array.isArray(data)) setUsers(data);
                });
            }
            fetch('/api/channels').then(r => r.json()).then(data => {
                if (Array.isArray(data)) setChannels(data);
            });
        } catch (e) {
            console.error("Failed to fetch data", e);
        }
    };

    useEffect(() => {
        fetchData();
    }, [isAdmin]);

    const handleChangePassword = async () => {
        if (passData.new !== passData.confirm) {
            setMsg({ type: 'error', text: "New passwords do not match" });
            return;
        }
        if (passData.new.length < 6) {
            setMsg({ type: 'error', text: "Password must be at least 6 characters" });
            return;
        }
        setLoading(true);
        setMsg(null);
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPassword: passData.current,
                    newPassword: passData.new
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setMsg({ type: 'success', text: "Password updated successfully" });
                setPassData({ current: "", new: "", confirm: "" });
            } else {
                setMsg({ type: 'error', text: data.error || "Failed to update password" });
            }
        } catch (e) {
            setMsg({ type: 'error', text: "An error occurred" });
        } finally {
            setLoading(false);
        }
    };

    const handleRotateToken = async (id: number, name: string) => {
        if (!confirm(`Rotate tokens for "${name}"? This will disconnect current streams.`)) return;
        try {
            const res = await fetch(`/api/channels/${id}/rotate`, { method: 'POST' });
            if (res.ok) {
                fetchData();
                setMsg({ type: 'success', text: `Tokens rotated for ${name}` });
            } else {
                setMsg({ type: 'error', text: "Failed to rotate tokens" });
            }
        } catch (e) {
            setMsg({ type: 'error', text: "Error rotating tokens" });
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const toggleShowToken = (id: string) => {
        setShowTokens(prev => ({ ...prev, [id]: !prev[id] }));
    };

    return (
        <div className="p-6 lg:p-8 space-y-6 fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-amber-500/10 border border-primary/20 shadow-lg">
                        <Shield className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Security</h1>
                        <p className="text-muted-foreground text-sm lg:text-base">
                            Access control, tokens, and audit logs
                        </p>
                    </div>
                </div>
                <Button variant="outline" onClick={fetchData} className="btn-lift">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Data
                </Button>
            </div>

            {/* Messages */}
            {msg && (
                <Card className={`border fade-in ${msg.type === 'error' ? 'border-destructive/30 bg-destructive/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
                    <CardContent className="p-4 flex items-center gap-3">
                        {msg.type === 'error' ? (
                            <AlertCircle className="h-5 w-5 text-destructive" />
                        ) : (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        )}
                        <span className={msg.type === 'error' ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}>
                            {msg.text}
                        </span>
                    </CardContent>
                </Card>
            )}

            <Tabs defaultValue="audit" className="space-y-6">
                <TabsList className="bg-muted/50 p-1 flex-wrap h-auto gap-1">
                    <TabsTrigger value="users" className="data-[state=active]:bg-background">
                        <Users className="h-4 w-4 mr-2" />
                        Users
                    </TabsTrigger>
                    <TabsTrigger value="tokens" className="data-[state=active]:bg-background">
                        <Key className="h-4 w-4 mr-2" />
                        Tokens
                    </TabsTrigger>
                    <TabsTrigger value="account" className="data-[state=active]:bg-background">
                        <Lock className="h-4 w-4 mr-2" />
                        Account
                    </TabsTrigger>
                    <TabsTrigger value="audit" className="data-[state=active]:bg-background">
                        <History className="h-4 w-4 mr-2" />
                        Audit Log
                    </TabsTrigger>
                </TabsList>

                {/* Users Tab */}
                <TabsContent value="users">
                    <Card className="border-border/50">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                        <Users className="h-5 w-5 text-purple-500" />
                                    </div>
                                    <div>
                                        <CardTitle>System Users</CardTitle>
                                        <CardDescription>View user access and roles</CardDescription>
                                    </div>
                                </div>
                                <Button variant="outline" size="sm" asChild>
                                    <a href="/users">Manage Users</a>
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {users.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                    <p>Loading users...</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {users.map((user) => (
                                        <div
                                            key={user.id}
                                            className="flex items-center justify-between p-4 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-base font-semibold ${user.status === "active"
                                                        ? 'bg-gradient-to-br from-primary/20 to-amber-500/20 text-primary'
                                                        : 'bg-muted text-muted-foreground'
                                                    }`}>
                                                    {user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-medium">{user.name}</p>
                                                    <p className="text-sm text-muted-foreground">{user.email}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                {getRoleBadge(user.role)}
                                                <div className="text-right text-sm hidden md:block">
                                                    <p className="text-muted-foreground text-xs">Last login</p>
                                                    <p>{user.lastLogin}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tokens Tab */}
                <TabsContent value="tokens">
                    <Card className="border-border/50">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                    <Key className="h-5 w-5 text-amber-500" />
                                </div>
                                <div>
                                    <CardTitle>Stream Tokens</CardTitle>
                                    <CardDescription>Manage authentication tokens for channels</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {channels.map((ch) => (
                                    <div key={ch.id} className="p-5 rounded-xl border border-border/50 bg-gradient-to-br from-card to-muted/20">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <p className="font-semibold">{ch.display_name}</p>
                                                <p className="text-sm text-muted-foreground font-mono">/{ch.name}</p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleRotateToken(ch.id, ch.display_name)}
                                                className="text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                                            >
                                                <RefreshCw className="h-4 w-4 mr-2" />
                                                Rotate
                                            </Button>
                                        </div>
                                        <div className="grid gap-3">
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">OBS Token</span>
                                                    <code className="font-mono text-sm">
                                                        {showTokens[`obs-${ch.id}`] ? ch.obs_token : '••••••••••••••••'}
                                                    </code>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => toggleShowToken(`obs-${ch.id}`)}
                                                        className="h-8 w-8 p-0"
                                                    >
                                                        {showTokens[`obs-${ch.id}`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => copyToClipboard(ch.obs_token)}
                                                        className="h-8 w-8 p-0"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Loop Token</span>
                                                    <code className="font-mono text-sm">
                                                        {showTokens[`loop-${ch.id}`] ? ch.loop_token : '••••••••••••••••'}
                                                    </code>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => toggleShowToken(`loop-${ch.id}`)}
                                                        className="h-8 w-8 p-0"
                                                    >
                                                        {showTokens[`loop-${ch.id}`] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => copyToClipboard(ch.loop_token)}
                                                        className="h-8 w-8 p-0"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Account Tab */}
                <TabsContent value="account">
                    <Card className="border-border/50 max-w-md">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Lock className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <CardTitle>Change Password</CardTitle>
                                    <CardDescription>Update your account security</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Current Password</label>
                                <input
                                    type="password"
                                    className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm"
                                    value={passData.current}
                                    onChange={e => setPassData({ ...passData, current: e.target.value })}
                                    placeholder="••••••••"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">New Password</label>
                                <input
                                    type="password"
                                    className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm"
                                    value={passData.new}
                                    onChange={e => setPassData({ ...passData, new: e.target.value })}
                                    placeholder="••••••••"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Confirm New Password</label>
                                <input
                                    type="password"
                                    className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm"
                                    value={passData.confirm}
                                    onChange={e => setPassData({ ...passData, confirm: e.target.value })}
                                    placeholder="••••••••"
                                />
                            </div>
                            <Button
                                onClick={handleChangePassword}
                                disabled={loading}
                                className="w-full h-11 bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90"
                            >
                                {loading ? 'Updating...' : 'Update Password'}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Audit Log Tab */}
                <TabsContent value="audit">
                    <Card className="border-border/50">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                    <Activity className="h-5 w-5 text-blue-500" />
                                </div>
                                <div>
                                    <CardTitle>Audit Log</CardTitle>
                                    <CardDescription>Track all system actions and changes</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {logs.length === 0 ? (
                                <div className="text-center py-12 text-muted-foreground">
                                    <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No audit logs found</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {logs.map((log) => (
                                        <div
                                            key={log.id}
                                            className="flex items-start justify-between p-4 rounded-xl border border-border/50 hover:bg-muted/30 transition-colors"
                                        >
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <Badge variant="outline" className="font-mono text-xs">
                                                        {log.action}
                                                    </Badge>
                                                    <span className="text-sm font-medium text-muted-foreground">
                                                        {log.user_email}
                                                    </span>
                                                </div>
                                                {log.details && (
                                                    <code className="text-xs bg-muted px-2 py-1 rounded max-w-md overflow-hidden truncate">
                                                        {JSON.stringify(log.details)}
                                                    </code>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-muted-foreground text-xs whitespace-nowrap">
                                                <Clock className="h-3 w-3" />
                                                {new Date(log.created_at).toLocaleString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
