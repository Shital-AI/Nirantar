"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
    FileText,
    Search,
    Download,
    RefreshCw,
    AlertTriangle,
    Info,
    AlertCircle,
    Bug,
    Clock,
    Filter,
    ChevronDown,
    Terminal,
} from "lucide-react";

interface LogEntry {
    id: number;
    timestamp: string;
    level: string;
    component: string;
    message: string;
}

function formatTimestamp(timestamp: string): string {
    try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
            return '--:--:--';
        }
        return date.toLocaleTimeString();
    } catch {
        return '--:--:--';
    }
}

function getLevelConfig(level: string) {
    switch (level) {
        case "info":
            return {
                icon: Info,
                color: "text-blue-500",
                bg: "bg-blue-500/10",
                border: "border-blue-500/20",
            };
        case "warn":
            return {
                icon: AlertTriangle,
                color: "text-amber-500",
                bg: "bg-amber-500/10",
                border: "border-amber-500/20",
            };
        case "error":
            return {
                icon: AlertCircle,
                color: "text-red-500",
                bg: "bg-red-500/10",
                border: "border-red-500/20",
            };
        case "debug":
            return {
                icon: Bug,
                color: "text-slate-400",
                bg: "bg-slate-500/10",
                border: "border-slate-500/20",
            };
        default:
            return {
                icon: Info,
                color: "text-slate-400",
                bg: "bg-slate-500/10",
                border: "border-slate-500/20",
            };
    }
}

export default function LogsPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const level = filter === "all" ? "" : filter;
            const res = await fetch(`/api/logs?level=${level}&limit=200`);
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs || []);
                setError(null);
            } else {
                setError('Failed to fetch logs');
            }
        } catch (err) {
            setError('Failed to fetch logs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        if (autoRefresh) {
            const interval = setInterval(fetchLogs, 3000);
            return () => clearInterval(interval);
        }
    }, [filter, autoRefresh]);

    const filteredLogs = logs.filter((log) => {
        if (search && !log.message.toLowerCase().includes(search.toLowerCase())) {
            return false;
        }
        return true;
    });

    const stats = {
        total: logs.length,
        errors: logs.filter(l => l.level === 'error').length,
        warnings: logs.filter(l => l.level === 'warn').length,
        info: logs.filter(l => l.level === 'info').length,
    };

    return (
        <div className="p-6 lg:p-8 space-y-6 fade-in">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-amber-500/10 border border-primary/20 shadow-lg">
                        <FileText className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">System Logs</h1>
                        <p className="text-muted-foreground text-sm lg:text-base">
                            Real-time system and component logs
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        variant={autoRefresh ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={autoRefresh ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                    >
                        <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                        {autoRefresh ? 'Live' : 'Paused'}
                    </Button>
                    <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                    <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Error Alert */}
            {error && (
                <Card className="border-destructive/30 bg-destructive/10 fade-in">
                    <CardContent className="p-4 flex items-center gap-3">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <span className="text-destructive font-medium">{error}</span>
                    </CardContent>
                </Card>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="stat-card card-hover border-border/50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <Terminal className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold">{stats.total}</p>
                                <p className="text-xs text-muted-foreground">Total Entries</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="stat-card card-hover border-border/50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                                <AlertCircle className="h-5 w-5 text-red-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-red-500">{stats.errors}</p>
                                <p className="text-xs text-muted-foreground">Errors</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="stat-card card-hover border-border/50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                <AlertTriangle className="h-5 w-5 text-amber-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-amber-500">{stats.warnings}</p>
                                <p className="text-xs text-muted-foreground">Warnings</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="stat-card card-hover border-border/50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                <Info className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-blue-500">{stats.info}</p>
                                <p className="text-xs text-muted-foreground">Info</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Log Viewer */}
            <Card className="border-border/50 overflow-hidden">
                <CardHeader className="pb-4 border-b border-border/50">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                                <Terminal className="h-5 w-5 text-emerald-400" />
                            </div>
                            <div>
                                <CardTitle>Live Logs</CardTitle>
                                <CardDescription>Streaming log entries in real-time</CardDescription>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Search logs..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-10 h-9 w-48 lg:w-64 rounded-lg border border-input bg-background px-3 py-1 text-sm transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <Tabs value={filter} onValueChange={setFilter}>
                                <TabsList className="bg-muted/50">
                                    <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
                                    <TabsTrigger value="error" className="text-xs">Errors</TabsTrigger>
                                    <TabsTrigger value="warn" className="text-xs">Warnings</TabsTrigger>
                                    <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="font-mono text-sm bg-gradient-to-b from-slate-950 to-slate-900 max-h-[600px] overflow-y-auto">
                        {filteredLogs.length > 0 ? (
                            <div className="divide-y divide-slate-800/50">
                                {filteredLogs.map((log) => {
                                    const config = getLevelConfig(log.level);
                                    const Icon = config.icon;
                                    return (
                                        <div
                                            key={log.id}
                                            className={`flex items-start gap-3 py-3 px-4 hover:bg-slate-800/30 transition-colors group ${config.border} border-l-2`}
                                        >
                                            <span className="text-slate-500 shrink-0 text-xs pt-0.5 w-20">
                                                {formatTimestamp(log.timestamp)}
                                            </span>
                                            <div className={`shrink-0 p-1 rounded ${config.bg}`}>
                                                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                                            </div>
                                            <span className="text-slate-400 shrink-0 text-xs font-medium uppercase tracking-wider">
                                                {log.component}
                                            </span>
                                            <span className={`flex-1 break-all ${log.level === "error" ? "text-red-400" :
                                                log.level === "warn" ? "text-amber-400" :
                                                    log.level === "debug" ? "text-slate-500" :
                                                        "text-slate-300"
                                                }`}>
                                                {log.message}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                                <Terminal className="h-12 w-12 mb-4 opacity-30" />
                                <p className="text-base font-medium">
                                    {loading ? "Loading logs..." : "No logs found"}
                                </p>
                                <p className="text-sm opacity-70 mt-1">
                                    {!loading && "Try adjusting your filters"}
                                </p>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
