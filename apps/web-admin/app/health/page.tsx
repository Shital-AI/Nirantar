"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
    Activity,
    Server,
    HardDrive,
    Cpu,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    RefreshCw,
    Wifi,
    Clock,
    Zap,
    BarChart3,
} from "lucide-react";

interface ServiceHealth {
    name: string;
    status: string;
    latency: number;
    uptime: string;
    last_check: string;
    details: string;
}

interface SystemMetrics {
    cpu_usage: number;
    memory_usage: number;
    memory_used_mb: number;
    memory_total_mb: number;
    network_in: number;
    network_out: number;
}

function StatusIcon({ status }: { status: string }) {
    switch (status) {
        case "healthy":
            return (
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                </div>
            );
        case "degraded":
            return (
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
            );
        case "down":
            return (
                <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <XCircle className="h-5 w-5 text-red-500" />
                </div>
            );
        default:
            return (
                <div className="h-10 w-10 rounded-xl bg-slate-500/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-slate-500" />
                </div>
            );
    }
}

export default function HealthPage() {
    const [services, setServices] = useState<ServiceHealth[]>([]);
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState(new Date());

    const fetchData = async () => {
        try {
            const [healthRes, metricsRes] = await Promise.all([
                fetch('/api/health'),
                fetch('/api/system'),
            ]);

            if (healthRes.ok) {
                const data = await healthRes.json();
                setServices(data.services || []);
            }

            if (metricsRes.ok) {
                const data = await metricsRes.json();
                setMetrics({
                    cpu_usage: 0,
                    memory_usage: data.memory_used_mb ? (data.memory_used_mb / 512) * 100 : 0,
                    memory_used_mb: data.memory_used_mb || 0,
                    memory_total_mb: 512,
                    network_in: 0,
                    network_out: 0,
                });
            }

            setError(null);
            setLastUpdate(new Date());
        } catch (err) {
            setError('Failed to fetch health data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    const healthyCount = services.filter((s) => s.status === "healthy").length;
    const degradedCount = services.filter((s) => s.status === "degraded").length;
    const downCount = services.filter((s) => s.status === "down").length;

    const overallStatus = downCount > 0 ? 'critical' : degradedCount > 0 ? 'degraded' : 'healthy';

    return (
        <div className="p-6 lg:p-8 space-y-6 fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border shadow-lg ${overallStatus === 'healthy'
                            ? 'bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-500/20'
                            : overallStatus === 'degraded'
                                ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/20'
                                : 'bg-gradient-to-br from-red-500/20 to-rose-500/10 border-red-500/20'
                        }`}>
                        <Activity className={`h-7 w-7 ${overallStatus === 'healthy' ? 'text-emerald-500' :
                                overallStatus === 'degraded' ? 'text-amber-500' : 'text-red-500'
                            }`} />
                    </div>
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Health Monitor</h1>
                        <p className="text-muted-foreground text-sm lg:text-base">
                            Real-time system and service health
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex gap-2">
                        <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                            {healthyCount} Healthy
                        </Badge>
                        {degradedCount > 0 && (
                            <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30">
                                {degradedCount} Degraded
                            </Badge>
                        )}
                        {downCount > 0 && (
                            <Badge className="bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30">
                                {downCount} Down
                            </Badge>
                        )}
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="btn-lift">
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Error Alert */}
            {error && (
                <Card className="border-destructive/30 bg-destructive/10 fade-in">
                    <CardContent className="p-4 flex items-center gap-3">
                        <XCircle className="h-5 w-5 text-destructive" />
                        <span className="text-destructive font-medium">{error}</span>
                    </CardContent>
                </Card>
            )}

            {/* System Metrics */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <Card className="stat-card card-hover border-border/50">
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Memory Usage</p>
                                <p className="text-3xl font-bold mt-1">{metrics?.memory_used_mb || 0}</p>
                                <p className="text-xs text-muted-foreground mt-1">MB used</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                <Cpu className="h-6 w-6 text-blue-500" />
                            </div>
                        </div>
                        <Progress value={metrics?.memory_usage || 0} className="mt-3 h-2" />
                    </CardContent>
                </Card>

                <Card className="stat-card card-hover border-border/50">
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Services</p>
                                <p className="text-3xl font-bold mt-1">{services.length}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    {healthyCount} healthy, {degradedCount + downCount} issues
                                </p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                <HardDrive className="h-6 w-6 text-purple-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="stat-card card-hover border-border/50">
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Avg Response</p>
                                <p className="text-3xl font-bold mt-1">
                                    {services.length > 0
                                        ? Math.round(services.reduce((a, b) => a + b.latency, 0) / services.length)
                                        : 0}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">milliseconds</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                <Zap className="h-6 w-6 text-emerald-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="stat-card card-hover border-border/50">
                    <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Status</p>
                                <p className={`text-2xl font-bold mt-1 ${downCount > 0 ? 'text-red-500' :
                                        degradedCount > 0 ? 'text-amber-500' :
                                            'text-emerald-500'
                                    }`}>
                                    {downCount > 0 ? 'CRITICAL' : degradedCount > 0 ? 'DEGRADED' : 'HEALTHY'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Updated {lastUpdate.toLocaleTimeString()}
                                </p>
                            </div>
                            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${downCount > 0 ? 'bg-red-500/10' :
                                    degradedCount > 0 ? 'bg-amber-500/10' :
                                        'bg-emerald-500/10'
                                }`}>
                                <Server className={`h-6 w-6 ${downCount > 0 ? 'text-red-500' :
                                        degradedCount > 0 ? 'text-amber-500' :
                                            'text-emerald-500'
                                    }`} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Service Status */}
            <Card className="border-border/50">
                <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-amber-500/20 flex items-center justify-center">
                            <BarChart3 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle>Service Status</CardTitle>
                            <CardDescription>All monitored services and their current health</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {services.length > 0 ? (
                        <div className="space-y-3">
                            {services.map((service, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-center justify-between p-4 rounded-xl border transition-all hover:shadow-md ${service.status === 'healthy'
                                            ? 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40'
                                            : service.status === 'degraded'
                                                ? 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40'
                                                : 'bg-red-500/5 border-red-500/20 hover:border-red-500/40'
                                        }`}
                                >
                                    <div className="flex items-center gap-4">
                                        <StatusIcon status={service.status} />
                                        <div>
                                            <p className="font-semibold">{service.name}</p>
                                            <p className="text-sm text-muted-foreground">{service.details}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6 text-sm">
                                        <div className="text-right hidden md:block">
                                            <p className="text-muted-foreground text-xs">Latency</p>
                                            <p className="font-mono font-medium">{service.latency}ms</p>
                                        </div>
                                        <div className="text-right hidden lg:block">
                                            <p className="text-muted-foreground text-xs">Uptime</p>
                                            <p className="font-mono font-medium">{service.uptime}</p>
                                        </div>
                                        <div className="text-right hidden lg:block">
                                            <p className="text-muted-foreground text-xs">Last Check</p>
                                            <p className="font-mono font-medium">{service.last_check}</p>
                                        </div>
                                        <Badge
                                            className={`capitalize ${service.status === "healthy"
                                                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                                    : service.status === "degraded"
                                                        ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                                        : "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30"
                                                }`}
                                        >
                                            {service.status}
                                        </Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <Server className="h-12 w-12 mx-auto mb-4 opacity-30" />
                            <p className="text-lg font-medium">
                                {loading ? "Loading services..." : "No services found"}
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
