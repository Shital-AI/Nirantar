"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Settings,
    Server,
    Shield,
    Database,
    Save,
    RotateCcw,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Zap,
    Clock,
    Cpu,
    HardDrive,
    Mail,
} from "lucide-react";

export default function ConfigPage() {
    const [config, setConfig] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/config');
            if (res.ok) {
                const data = await res.json();
                const map: Record<string, any> = {};
                data.forEach((d: any) => {
                    map[d.key] = d.value;
                });
                setConfig(map);
                setError(null);
            }
        } catch (e) {
            console.error("Failed to load config", e);
            setError("Failed to load configuration");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            if (config.failover) {
                await fetch('/api/config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'failover', value: config.failover })
                });
            }
            if (config.resources) {
                await fetch('/api/config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'resources', value: config.resources })
                });
            }
            if (config.smtp) {
                await fetch('/api/config', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'smtp', value: config.smtp })
                });
            }
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) {
            console.error(e);
            setError("Failed to save configuration");
        } finally {
            setSaving(false);
        }
    };

    const updateFailover = (key: string, value: any) => {
        setConfig(prev => ({
            ...prev,
            failover: {
                ...prev.failover,
                [key]: value
            }
        }));
    };

    const updateResources = (key: string, value: any) => {
        setConfig(prev => ({
            ...prev,
            resources: {
                ...prev.resources,
                [key]: value
            }
        }));
    };

    const updateSmtp = (key: string, value: any) => {
        setConfig(prev => ({
            ...prev,
            smtp: {
                ...prev.smtp,
                [key]: value
            }
        }));
    };

    if (loading) {
        return (
            <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Loading configuration...</p>
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 space-y-6 max-w-5xl mx-auto fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-amber-500/10 border border-primary/20 shadow-lg">
                        <Settings className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Configuration</h1>
                        <p className="text-muted-foreground text-sm lg:text-base">
                            System settings and preferences
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={fetchConfig} disabled={loading} className="btn-lift">
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn-lift bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90"
                    >
                        {saving ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : saved ? (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                        ) : (
                            <Save className="h-4 w-4 mr-2" />
                        )}
                        {saved ? 'Saved!' : 'Save Changes'}
                    </Button>
                </div>
            </div>

            {/* Alerts */}
            {error && (
                <Card className="border-destructive/30 bg-destructive/10 fade-in">
                    <CardContent className="p-4 flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <span className="text-destructive font-medium">{error}</span>
                    </CardContent>
                </Card>
            )}

            {saved && (
                <Card className="border-emerald-500/30 bg-emerald-500/10 fade-in">
                    <CardContent className="p-4 flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            Configuration saved successfully
                        </span>
                    </CardContent>
                </Card>
            )}

            {/* Tabs */}
            <Tabs defaultValue="failover" className="space-y-6">
                <TabsList className="bg-muted/50 p-1">
                    <TabsTrigger value="general" className="data-[state=active]:bg-background">
                        <Server className="h-4 w-4 mr-2" />
                        General
                    </TabsTrigger>
                    <TabsTrigger value="failover" className="data-[state=active]:bg-background">
                        <Shield className="h-4 w-4 mr-2" />
                        Failover
                    </TabsTrigger>
                    <TabsTrigger value="email" className="data-[state=active]:bg-background">
                        <Mail className="h-4 w-4 mr-2" />
                        Email
                    </TabsTrigger>
                    <TabsTrigger value="advanced" className="data-[state=active]:bg-background">
                        <Database className="h-4 w-4 mr-2" />
                        Advanced
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="general">
                    <Card className="border-border/50">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                    <Server className="h-5 w-5 text-blue-500" />
                                </div>
                                <div>
                                    <CardTitle>General Settings</CardTitle>
                                    <CardDescription>Core system configuration (managed via environment variables)</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                                <label className="text-sm font-medium text-muted-foreground">SRS API URL</label>
                                <input
                                    type="text"
                                    disabled
                                    value="Managed via Environment Variables"
                                    className="w-full h-11 mt-2 rounded-xl border border-input bg-muted px-4 text-sm text-muted-foreground cursor-not-allowed"
                                />
                            </div>
                            <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
                                <label className="text-sm font-medium text-muted-foreground">Database URL</label>
                                <input
                                    type="text"
                                    disabled
                                    value="Managed via Environment Variables"
                                    className="w-full h-11 mt-2 rounded-xl border border-input bg-muted px-4 text-sm text-muted-foreground cursor-not-allowed"
                                />
                            </div>
                            <p className="text-sm text-muted-foreground italic px-1">
                                These settings are configured through environment variables for security purposes.
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="failover">
                    <Card className="border-border/50">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                    <Shield className="h-5 w-5 text-emerald-500" />
                                </div>
                                <div>
                                    <CardTitle>Failover Settings</CardTitle>
                                    <CardDescription>Configure automatic failover behavior</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Auto-Failover Toggle */}
                            <div className="flex items-center justify-between p-5 rounded-xl bg-gradient-to-r from-emerald-500/5 to-transparent border border-emerald-500/20">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                        <Zap className="h-6 w-6 text-emerald-500" />
                                    </div>
                                    <div>
                                        <p className="font-semibold">Auto-Failover Enabled</p>
                                        <p className="text-sm text-muted-foreground">Automatically switch sources on failure</p>
                                    </div>
                                </div>
                                <Switch
                                    checked={config.failover?.enabled ?? true}
                                    onCheckedChange={(c) => updateFailover('enabled', c)}
                                />
                            </div>

                            {/* Timeout Settings */}
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="p-4 rounded-xl border border-border/50 bg-card">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Clock className="h-4 w-4 text-primary" />
                                        <label className="text-sm font-medium">Failover Timeout</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={config.failover?.timeout_seconds ?? 5}
                                            onChange={(e) => updateFailover('timeout_seconds', parseInt(e.target.value))}
                                            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                                        />
                                        <span className="text-sm text-muted-foreground whitespace-nowrap">sec</span>
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl border border-border/50 bg-card">
                                    <div className="flex items-center gap-2 mb-3">
                                        <CheckCircle2 className="h-4 w-4 text-primary" />
                                        <label className="text-sm font-medium">Stability Window</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={config.failover?.stability_window ?? 3}
                                            onChange={(e) => updateFailover('stability_window', parseInt(e.target.value))}
                                            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                                        />
                                        <span className="text-sm text-muted-foreground whitespace-nowrap">checks</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">Successful checks before stable</p>
                                </div>

                                <div className="p-4 rounded-xl border border-border/50 bg-card">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Shield className="h-4 w-4 text-primary" />
                                        <label className="text-sm font-medium">Anti-Flap Cooldown</label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={config.failover?.anti_flap_cooldown ?? 30}
                                            onChange={(e) => updateFailover('anti_flap_cooldown', parseInt(e.target.value))}
                                            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                                        />
                                        <span className="text-sm text-muted-foreground whitespace-nowrap">sec</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">Min time between failovers</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="email">
                    <Card className="border-border/50">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-pink-500/10 flex items-center justify-center">
                                    <Mail className="h-5 w-5 text-pink-500" />
                                </div>
                                <div>
                                    <CardTitle>Email Settings</CardTitle>
                                    <CardDescription>Configure SMTP for sending notifications and alerts</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="p-4 rounded-xl border border-border/50 bg-card">
                                    <label className="text-sm font-medium mb-2 block">SMTP Host</label>
                                    <input
                                        type="text"
                                        placeholder="smtp.gmail.com"
                                        value={config.smtp?.host ?? ''}
                                        onChange={(e) => updateSmtp('host', e.target.value)}
                                        className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                                    />
                                </div>
                                <div className="p-4 rounded-xl border border-border/50 bg-card">
                                    <label className="text-sm font-medium mb-2 block">SMTP Port</label>
                                    <input
                                        type="number"
                                        placeholder="587"
                                        value={config.smtp?.port ?? 587}
                                        onChange={(e) => updateSmtp('port', parseInt(e.target.value))}
                                        className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="p-4 rounded-xl border border-border/50 bg-card">
                                    <label className="text-sm font-medium mb-2 block">SMTP Username</label>
                                    <input
                                        type="email"
                                        placeholder="your-email@gmail.com"
                                        value={config.smtp?.user ?? ''}
                                        onChange={(e) => updateSmtp('user', e.target.value)}
                                        className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                                    />
                                </div>
                                <div className="p-4 rounded-xl border border-border/50 bg-card">
                                    <label className="text-sm font-medium mb-2 block">SMTP Password</label>
                                    <input
                                        type="password"
                                        placeholder="••••••••"
                                        value={config.smtp?.pass ?? ''}
                                        onChange={(e) => updateSmtp('pass', e.target.value)}
                                        className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                                    />
                                    <p className="text-xs text-muted-foreground mt-2">For Gmail, use an App Password</p>
                                </div>
                            </div>
                            <div className="p-4 rounded-xl border border-border/50 bg-card">
                                <label className="text-sm font-medium mb-2 block">From Address</label>
                                <input
                                    type="email"
                                    placeholder="no-reply@yourdomain.com"
                                    value={config.smtp?.from ?? ''}
                                    onChange={(e) => updateSmtp('from', e.target.value)}
                                    className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                                />
                                <p className="text-xs text-muted-foreground mt-2">The email address that will appear as the sender</p>
                            </div>
                            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20">
                                <div className="flex items-start gap-3">
                                    <Mail className="h-5 w-5 text-blue-500 mt-0.5" />
                                    <div>
                                        <p className="font-medium text-blue-600 dark:text-blue-400">SMTP Configuration</p>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            These settings are used to send email notifications for password resets and system alerts.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="advanced">
                    <Card className="border-border/50">
                        <CardHeader className="pb-4">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                    <Database className="h-5 w-5 text-purple-500" />
                                </div>
                                <div>
                                    <CardTitle>Advanced Settings</CardTitle>
                                    <CardDescription>Container resource limits and performance tuning</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="p-5 rounded-xl border border-border/50 bg-gradient-to-br from-purple-500/5 to-transparent">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                            <HardDrive className="h-5 w-5 text-purple-500" />
                                        </div>
                                        <div>
                                            <p className="font-semibold">Memory Limit</p>
                                            <p className="text-xs text-muted-foreground">Loop container memory</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={config.resources?.loop_container_memory_mb ?? 512}
                                            onChange={(e) => updateResources('loop_container_memory_mb', parseInt(e.target.value))}
                                            className="h-11 flex-1 rounded-xl border border-input bg-background px-4 text-sm"
                                        />
                                        <span className="text-sm text-muted-foreground font-medium">MB</span>
                                    </div>
                                </div>

                                <div className="p-5 rounded-xl border border-border/50 bg-gradient-to-br from-blue-500/5 to-transparent">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                            <Cpu className="h-5 w-5 text-blue-500" />
                                        </div>
                                        <div>
                                            <p className="font-semibold">CPU Limit</p>
                                            <p className="text-xs text-muted-foreground">Loop container CPU</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            step={0.1}
                                            value={config.resources?.loop_container_cpu ?? 0.5}
                                            onChange={(e) => updateResources('loop_container_cpu', parseFloat(e.target.value))}
                                            className="h-11 flex-1 rounded-xl border border-input bg-background px-4 text-sm"
                                        />
                                        <span className="text-sm text-muted-foreground font-medium">cores</span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                                    <div>
                                        <p className="font-medium text-amber-600 dark:text-amber-400">Caution</p>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Modifying resource limits may affect system performance. Ensure adequate resources are available before making changes.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
