"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
    Radio,
    Activity,
    Cpu,
    RefreshCw,
    Play,
    Square,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Zap,
    TrendingUp,
    Wifi,
    Server,
    ArrowUpRight,
} from "lucide-react";

interface Channel {
    id: number;
    name: string;
    display_name: string;
    status: string;
    active_source: string;
    uptime: string;
    bitrate: number;
    enabled: boolean;
    destinations: { name: string; status: string }[];
}

interface SystemStatus {
    status: string;
    uptime: string;
    active_streams: number;
    total_bitrate: number;
    live_channels: number;
    loop_channels: number;
    total_channels: number;
    memory_used_mb: number;
    goroutines: number;
}

function getStatusBadge(status: string, activeSource: string) {
    if (status === "LIVE" || activeSource === "OBS") {
        return (
            <Badge className="gap-1.5 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30">
                <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                LIVE
            </Badge>
        );
    }
    if (activeSource === "LOOP") {
        return (
            <Badge className="gap-1.5 bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/30">
                <RefreshCw className="h-3 w-3" />
                LOOP
            </Badge>
        );
    }
    if (status === "DOWN" || !status) {
        return (
            <Badge className="gap-1.5 bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/30">
                <Square className="h-3 w-3" />
                OFFLINE
            </Badge>
        );
    }
    return (
        <Badge className="gap-1.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/30">
            <AlertTriangle className="h-3 w-3" />
            {status}
        </Badge>
    );
}

function StatCard({
    title,
    value,
    icon: Icon,
    unit,
    trend,
    color = "primary"
}: {
    title: string;
    value: number | string;
    icon: React.ElementType;
    unit?: string;
    trend?: string;
    color?: "primary" | "emerald" | "blue" | "purple";
}) {
    const colorClasses = {
        primary: "from-primary/20 to-amber-500/20 text-primary",
        emerald: "from-emerald-500/20 to-teal-500/20 text-emerald-500",
        blue: "from-blue-500/20 to-cyan-500/20 text-blue-500",
        purple: "from-purple-500/20 to-pink-500/20 text-purple-500",
    };

    return (
        <Card className="stat-card card-hover border-border/50 overflow-hidden">
            <CardContent className="p-5">
                <div className="flex items-start justify-between">
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">{title}</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-bold tracking-tight">{value}</span>
                            {unit && (
                                <span className="text-sm font-medium text-muted-foreground">{unit}</span>
                            )}
                        </div>
                        {trend && (
                            <div className="flex items-center gap-1 text-xs text-emerald-500">
                                <TrendingUp className="h-3 w-3" />
                                {trend}
                            </div>
                        )}
                    </div>
                    <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center`}>
                        <Icon className="h-6 w-6" />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

interface ChannelCardProps {
    channel: Channel;
    onAction: (id: number, action: string) => Promise<void>;
}

function ChannelCard({ channel, onAction }: ChannelCardProps) {
    const isLive = channel.active_source === "OBS" || channel.status === "LIVE";
    const isLoop = channel.active_source === "LOOP";
    const [loading, setLoading] = useState<string | null>(null);

    const handleAction = async (action: string) => {
        setLoading(action);
        await onAction(channel.id, action);
        setLoading(null);
    };

    const connectedDests = channel.destinations?.filter(d => d.status === "CONNECTED").length || 0;
    const totalDests = channel.destinations?.length || 0;

    return (
        <Card className={`card-hover border-border/50 overflow-hidden transition-all duration-300 ${isLive ? 'ring-2 ring-emerald-500/20' : isLoop ? 'ring-2 ring-blue-500/10' : ''
            }`}>
            {/* Status Bar */}
            <div className={`h-1 w-full ${isLive ? 'bg-gradient-to-r from-emerald-500 to-teal-500' :
                isLoop ? 'bg-gradient-to-r from-blue-500 to-cyan-500' :
                    'bg-gradient-to-r from-slate-400 to-slate-500'
                }`} />

            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`relative flex h-12 w-12 items-center justify-center rounded-xl ${isLive ? 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20' :
                            isLoop ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20' :
                                'bg-gradient-to-br from-slate-500/20 to-gray-500/20'
                            }`}>
                            <Radio className={`h-6 w-6 ${isLive ? 'text-emerald-500' :
                                isLoop ? 'text-blue-500' :
                                    'text-slate-500'
                                }`} />
                            {isLive && (
                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                </span>
                            )}
                        </div>
                        <div>
                            <CardTitle className="text-lg">{channel.display_name}</CardTitle>
                            <CardDescription className="font-mono text-xs">/{channel.name}</CardDescription>
                        </div>
                    </div>
                    {getStatusBadge(channel.status, channel.active_source)}
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Source</p>
                        <p className="font-semibold text-sm">{channel.active_source || "NONE"}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Uptime</p>
                        <p className="font-semibold text-sm">{channel.uptime || "0h 0m"}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Bitrate</p>
                        <p className="font-semibold text-sm">{channel.bitrate || 0} <span className="text-muted-foreground font-normal">kbps</span></p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/30 border border-border/50">
                        <p className="text-xs text-muted-foreground mb-1">Destinations</p>
                        <p className="font-semibold text-sm">
                            <span className={connectedDests > 0 ? 'text-emerald-500' : ''}>{connectedDests}</span>
                            <span className="text-muted-foreground">/{totalDests}</span>
                        </p>
                    </div>
                </div>

                {/* Destination Badges */}
                {channel.destinations && channel.destinations.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {channel.destinations.map((dest, idx) => (
                            <Badge
                                key={idx}
                                variant="outline"
                                className={`text-xs ${dest.status === "CONNECTED"
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : dest.status === "ERROR"
                                        ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                                        : "border-border"
                                    }`}
                            >
                                {dest.status === "CONNECTED" && <Wifi className="h-3 w-3 mr-1" />}
                                {dest.name}
                            </Badge>
                        ))}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1" asChild>
                        <a href="/channels" className="flex items-center justify-center gap-1">
                            Manage
                            <ArrowUpRight className="h-3 w-3" />
                        </a>
                    </Button>
                    {channel.enabled ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="text-red-500 hover:text-red-400 hover:bg-red-500/10 border-red-500/30"
                            onClick={() => handleAction('disable')}
                            disabled={loading !== null}
                        >
                            <Square className={`h-4 w-4 ${loading === 'disable' ? 'animate-spin' : ''}`} />
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/30"
                            onClick={() => handleAction('enable')}
                            disabled={loading !== null}
                        >
                            <Play className={`h-4 w-4 ${loading === 'enable' ? 'animate-spin' : ''}`} />
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export default function Dashboard() {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdate, setLastUpdate] = useState(new Date());

    const fetchData = async () => {
        try {
            const [channelsRes, statusRes] = await Promise.all([
                fetch('/api/channels'),
                fetch('/api/system'),
            ]);

            if (channelsRes.ok) {
                const channelsData = await channelsRes.json();
                setChannels(Array.isArray(channelsData) ? channelsData : []);
            }

            if (statusRes.ok) {
                const statusData = await statusRes.json();
                setSystemStatus(statusData);
            }

            setError(null);
            setLastUpdate(new Date());
        } catch (err) {
            setError('Failed to fetch data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    const liveCount = channels.filter(c => c.active_source === "OBS" || c.status === "LIVE").length;
    const loopCount = channels.filter(c => c.active_source === "LOOP" && c.enabled).length;

    const handleAction = async (id: number, action: string) => {
        try {
            const res = await fetch(`/api/channels/${id}/${action}`, {
                method: 'POST',
            });
            if (!res.ok) throw new Error('Action failed');
            await fetchData();
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="p-6 lg:p-8 space-y-6 fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-amber-500/10 border border-primary/20 shadow-lg glow-effect">
                        <Activity className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Dashboard</h1>
                        <p className="text-muted-foreground text-sm lg:text-base">
                            Real-time system overview and channel status
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="text-sm text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg border border-border/50" suppressHydrationWarning>
                        <Clock className="h-3.5 w-3.5 inline mr-1.5" />
                        Updated {lastUpdate.toLocaleTimeString()}
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
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        <span className="text-destructive font-medium">{error}</span>
                    </CardContent>
                </Card>
            )}

            {/* Stats Grid */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Active Streams"
                    value={systemStatus?.active_streams || 0}
                    icon={Radio}
                    color="emerald"
                    trend={liveCount > 0 ? `${liveCount} live now` : undefined}
                />
                <StatCard
                    title="Total Bitrate"
                    value={systemStatus?.total_bitrate || 0}
                    icon={Zap}
                    unit="kbps"
                    color="blue"
                />
                <StatCard
                    title="System Uptime"
                    value={systemStatus?.uptime || "0s"}
                    icon={Clock}
                    color="purple"
                />
                <StatCard
                    title="Memory Used"
                    value={systemStatus?.memory_used_mb || 0}
                    icon={Cpu}
                    unit="MB"
                    color="primary"
                />
            </div>

            {/* System Health */}
            {systemStatus && (
                <Card className="border-border/50 overflow-hidden">
                    <CardHeader className="pb-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-amber-500/20 flex items-center justify-center">
                                <Server className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle>System Health</CardTitle>
                                <CardDescription>Performance metrics and resource usage</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Goroutines</span>
                                    <span className="font-medium">{systemStatus.goroutines}</span>
                                </div>
                                <Progress value={Math.min(systemStatus.goroutines, 100)} className="h-2" />
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Total Channels</span>
                                    <span className="font-medium">{systemStatus.total_channels}</span>
                                </div>
                                <Progress value={(systemStatus.total_channels / 10) * 100} className="h-2" />
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Live Channels</span>
                                    <span className="font-medium text-emerald-500">{systemStatus.live_channels}</span>
                                </div>
                                <Progress
                                    value={(systemStatus.live_channels / Math.max(systemStatus.total_channels, 1)) * 100}
                                    className="h-2"
                                />
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Loop Channels</span>
                                    <span className="font-medium text-blue-500">{systemStatus.loop_channels}</span>
                                </div>
                                <Progress
                                    value={(systemStatus.loop_channels / Math.max(systemStatus.total_channels, 1)) * 100}
                                    className="h-2"
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Channels */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold">Channels</h2>
                        <div className="flex gap-2">
                            {liveCount > 0 && (
                                <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                                    {liveCount} Live
                                </Badge>
                            )}
                            {loopCount > 0 && (
                                <Badge className="bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30">
                                    {loopCount} Loop
                                </Badge>
                            )}
                        </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <a href="/channels">View All</a>
                    </Button>
                </div>

                {channels.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {channels.map((channel) => (
                            <ChannelCard
                                key={channel.id}
                                channel={channel}
                                onAction={handleAction}
                            />
                        ))}
                    </div>
                ) : (
                    <Card className="border-dashed border-2">
                        <CardContent className="p-12 text-center">
                            <Radio className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                            <p className="text-lg font-medium text-muted-foreground">
                                {loading ? "Loading channels..." : "No channels configured"}
                            </p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Create your first channel to start streaming
                            </p>
                            <Button className="mt-4" asChild>
                                <a href="/channels">Go to Channels</a>
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
