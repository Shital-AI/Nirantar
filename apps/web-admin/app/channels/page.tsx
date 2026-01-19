"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
    Radio, Play, Square, RefreshCw, Eye, EyeOff, Copy, Plus, Trash2, Save, X, Pencil,
    Tv, Settings2, Send, Zap, Activity, CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";

interface Destination {
    id: number;
    channel_id: number;
    name: string;
    rtmp_url: string;
    stream_key?: string;
    enabled: boolean;
    status: string;
}

interface Channel {
    id: number;
    name: string;
    display_name: string;
    status: string;
    enabled: boolean;
    obs_token: string;
    loop_token: string;
    loop_source_file: string;
    active_source: string;
    loop_enabled: boolean;
    obs_override_enabled: boolean;
    auto_restart_loop: boolean;
    failover_timeout_seconds: number;
    keyframe_interval: number;
    video_bitrate: number;
    audio_bitrate: number;
    output_resolution: string;
    bitrate: number;
    uptime: string;
    destinations: Destination[];
}

interface ChannelCardProps {
    channel: Channel;
    mediaFiles: string[];
    onAction: (id: number, action: string) => Promise<void>;
    onAddDestination: (dest: Partial<Destination>) => Promise<void>;
    onToggleDestination: (id: number, enabled: boolean) => Promise<void>;
    onDeleteDestination: (id: number) => Promise<void>;
    onUpdateChannel: (id: number, settings: Record<string, unknown>) => Promise<void>;
    onDeleteChannel: (id: number) => Promise<void>;
    onUpdateDestination: (id: number, updates: Partial<Destination>) => Promise<void>;
}

function ChannelCard({ channel, mediaFiles, onAction, onAddDestination, onToggleDestination, onDeleteDestination, onUpdateChannel, onDeleteChannel, onUpdateDestination }: ChannelCardProps) {
    const [showOBSToken, setShowOBSToken] = useState(false);
    const [showLoopToken, setShowLoopToken] = useState(false);
    const [loading, setLoading] = useState<string | null>(null);
    const [isAddingDest, setIsAddingDest] = useState(false);
    const [newDest, setNewDest] = useState({ name: "", rtmp_url: "", stream_key: "" });
    const [editingDestId, setEditingDestId] = useState<number | null>(null);
    const [editDest, setEditDest] = useState({ name: "", rtmp_url: "", stream_key: "" });
    const [isDirty, setIsDirty] = useState(false);
    const [hostname, setHostname] = useState("localhost");
    const [settings, setSettings] = useState({
        display_name: channel.display_name,
        loop_source_file: channel.loop_source_file,
        obs_override_enabled: channel.obs_override_enabled,
        auto_restart_loop: channel.auto_restart_loop,
        loop_enabled: channel.loop_enabled,
        failover_timeout_seconds: channel.failover_timeout_seconds,
        keyframe_interval: channel.keyframe_interval || 2,
        video_bitrate: channel.video_bitrate || 0,
        audio_bitrate: channel.audio_bitrate || 128,
        output_resolution: channel.output_resolution || ""
    });

    useEffect(() => {
        const fetchHostname = async () => {
            try {
                const res = await fetch('/api/server-info');
                if (res.ok) {
                    const data = await res.json();
                    if (data.rtmp_host) { setHostname(data.rtmp_host); return; }
                }
            } catch { /* ignore */ }
            if (typeof window !== 'undefined') setHostname(window.location.hostname);
        };
        fetchHostname();
    }, []);

    const updateSettings = (newSettings: Partial<typeof settings>) => {
        setIsDirty(true);
        setSettings((prev) => ({ ...prev, ...newSettings }));
    };

    useEffect(() => {
        if (!isDirty) {
            setSettings({
                display_name: channel.display_name,
                loop_source_file: channel.loop_source_file,
                obs_override_enabled: channel.obs_override_enabled,
                auto_restart_loop: channel.auto_restart_loop,
                loop_enabled: channel.loop_enabled,
                failover_timeout_seconds: channel.failover_timeout_seconds,
                keyframe_interval: channel.keyframe_interval || 2,
                video_bitrate: channel.video_bitrate || 0,
                audio_bitrate: channel.audio_bitrate || 128,
                output_resolution: channel.output_resolution || ""
            });
        }
    }, [channel.id, isDirty, channel.display_name, channel.loop_source_file, channel.obs_override_enabled, channel.auto_restart_loop, channel.loop_enabled, channel.failover_timeout_seconds, channel.keyframe_interval, channel.video_bitrate, channel.audio_bitrate, channel.output_resolution]);

    const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); };

    const handleAction = async (action: string) => {
        setLoading(action);
        await onAction(channel.id, action);
        setLoading(null);
    };

    const handleSaveDestination = async () => {
        if (!newDest.name || !newDest.rtmp_url) return;
        setLoading("add-dest");
        await onAddDestination({ ...newDest, channel_id: channel.id });
        setLoading(null);
        setIsAddingDest(false);
        setNewDest({ name: "", rtmp_url: "", stream_key: "" });
    };

    const handleSaveSettings = async () => {
        setLoading("save-settings");
        await onUpdateChannel(channel.id, settings);
        setIsDirty(false);
        setLoading(null);
    };

    const getSourceColor = () => {
        switch (channel.active_source) {
            case "OBS": return "from-emerald-500 to-emerald-600";
            case "LOOP": return "from-blue-500 to-blue-600";
            default: return "from-red-500 to-red-600";
        }
    };

    const connectedDests = channel.destinations?.filter((d) => d.status === "CONNECTED").length || 0;
    const totalDests = channel.destinations?.length || 0;

    return (
        <Card className="overflow-hidden border-border/50 hover:border-primary/30 transition-all duration-300">
            <div className={`h-1 bg-gradient-to-r ${getSourceColor()}`} />

            <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`relative flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${getSourceColor()} text-white shadow-lg`}>
                            {channel.active_source === "OBS" ? <Tv className="h-5 w-5" /> : channel.active_source === "LOOP" ? <RefreshCw className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                            {channel.status === "LIVE" && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white"></span>
                                </span>
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-xl">{channel.display_name}</CardTitle>
                                {channel.status === "LIVE" && (
                                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500 text-white animate-pulse">LIVE</span>
                                )}
                            </div>
                            <CardDescription className="flex items-center gap-3 mt-1">
                                <span className="font-mono">/{channel.name}</span>
                                {channel.bitrate > 0 && (
                                    <span className="flex items-center gap-1 text-xs"><Activity className="h-3 w-3" />{channel.bitrate} kbps</span>
                                )}
                            </CardDescription>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-sm font-medium">{connectedDests}/{totalDests}</p>
                            <p className="text-xs text-muted-foreground">Destinations</p>
                        </div>
                        <Switch checked={channel.enabled} onCheckedChange={() => handleAction(channel.enabled ? 'disable' : 'enable')} disabled={loading !== null} />
                    </div>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50">
                    <span className="text-sm text-muted-foreground mr-2">Source:</span>
                    <Button size="sm" variant={channel.active_source === "LOOP" ? "default" : "outline"} onClick={() => handleAction('switch-to-loop')} disabled={loading !== null || channel.active_source === "LOOP"} className={channel.active_source === "LOOP" ? "bg-blue-500 hover:bg-blue-600" : ""}>
                        <RefreshCw className="h-4 w-4 mr-1" /> Loop
                    </Button>
                    <Button size="sm" variant={channel.active_source === "OBS" ? "default" : "outline"} onClick={() => handleAction('switch-to-obs')} disabled={loading !== null || channel.active_source === "OBS"} className={channel.active_source === "OBS" ? "bg-emerald-500 hover:bg-emerald-600" : ""}>
                        <Tv className="h-4 w-4 mr-1" /> OBS
                    </Button>
                    <div className="flex-1" />
                    <Button size="sm" variant="ghost" onClick={() => handleAction('restart')} disabled={loading !== null} className="text-muted-foreground">
                        <RefreshCw className={`h-4 w-4 mr-1 ${loading === 'restart' ? 'animate-spin' : ''}`} /> Restart
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="pt-0">
                <Tabs defaultValue="ingest" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-muted/50">
                        <TabsTrigger value="ingest" className="data-[state=active]:bg-background"><Zap className="h-4 w-4 mr-2" />Ingest</TabsTrigger>
                        <TabsTrigger value="destinations" className="data-[state=active]:bg-background"><Send className="h-4 w-4 mr-2" />Destinations</TabsTrigger>
                        <TabsTrigger value="settings" className="data-[state=active]:bg-background"><Settings2 className="h-4 w-4 mr-2" />Settings</TabsTrigger>
                    </TabsList>

                    <TabsContent value="ingest" className="space-y-4 mt-4">
                        <div className="p-4 rounded-xl border bg-gradient-to-br from-emerald-500/5 to-transparent">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2"><Tv className="h-5 w-5 text-emerald-500" /><h4 className="font-semibold">OBS Settings</h4></div>
                                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-emerald-500/30 text-emerald-600">Recommended</span>
                            </div>
                            <p className="text-sm text-muted-foreground mb-4">Configure OBS with these settings for automatic failover streaming.</p>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Server URL</label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <code className="flex-1 text-sm bg-background/80 p-3 rounded-lg border font-mono">rtmp://{hostname}:1935/live</code>
                                        <Button size="icon" variant="ghost" onClick={() => copyToClipboard(`rtmp://${hostname}:1935/live`)}><Copy className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Stream Key</label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <code className="flex-1 text-sm bg-background/80 p-3 rounded-lg border font-mono">{showOBSToken ? channel.obs_token : "••••••••••••••••••••"}</code>
                                        <Button size="icon" variant="ghost" onClick={() => setShowOBSToken(!showOBSToken)}>{showOBSToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                                        <Button size="icon" variant="ghost" onClick={() => copyToClipboard(channel.obs_token)}><Copy className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 rounded-xl border bg-gradient-to-br from-blue-500/5 to-transparent">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-blue-500" /><h4 className="font-semibold">Loop Publisher</h4></div>
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${channel.active_source === "LOOP" ? "bg-blue-500 text-white" : "bg-secondary text-secondary-foreground"}`}>
                                    {channel.active_source === "LOOP" ? "Active" : "Standby"}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><span className="text-muted-foreground">Source File</span><p className="font-mono text-xs mt-1 truncate">{channel.loop_source_file || "Not configured"}</p></div>
                                <div>
                                    <span className="text-muted-foreground">Token</span>
                                    <div className="flex items-center gap-1 mt-1">
                                        <span className="font-mono text-xs">{showLoopToken ? channel.loop_token : "••••••••"}</span>
                                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowLoopToken(!showLoopToken)}>{showLoopToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}</Button>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 mt-4">
                                <Button size="sm" variant="outline" onClick={() => handleAction('start')} disabled={loading !== null || channel.active_source === "LOOP"}><Play className="h-4 w-4 mr-1" /> Start</Button>
                                <Button size="sm" variant="outline" onClick={() => handleAction('stop')} disabled={loading !== null || channel.active_source !== "LOOP"}><Square className="h-4 w-4 mr-1" /> Stop</Button>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="destinations" className="space-y-3 mt-4">
                        {channel.destinations?.map((dest) => (
                            <div key={dest.id} className={`p-4 rounded-xl border transition-all ${dest.status === "CONNECTED" ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                                {editingDestId === dest.id ? (
                                    <div className="space-y-4">
                                        <div className="grid gap-3">
                                            <input className="w-full h-10 rounded-lg border bg-background px-3 text-sm" placeholder="Name" value={editDest.name} onChange={(e) => setEditDest({ ...editDest, name: e.target.value })} />
                                            <input className="w-full h-10 rounded-lg border bg-background px-3 text-sm font-mono" placeholder="RTMP URL" value={editDest.rtmp_url} onChange={(e) => setEditDest({ ...editDest, rtmp_url: e.target.value })} />
                                            <input type="password" className="w-full h-10 rounded-lg border bg-background px-3 text-sm" placeholder="Stream Key (leave empty to keep)" value={editDest.stream_key} onChange={(e) => setEditDest({ ...editDest, stream_key: e.target.value })} />
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                            <Button variant="ghost" size="sm" onClick={() => setEditingDestId(null)}>Cancel</Button>
                                            <Button size="sm" onClick={async () => { await onUpdateDestination(dest.id, editDest); setEditingDestId(null); }}><Save className="h-4 w-4 mr-1" /> Save</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start gap-3">
                                            {dest.status === "CONNECTED" ? <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5" /> : <XCircle className="h-5 w-5 text-red-500 mt-0.5" />}
                                            <div className="space-y-1">
                                                <p className="font-medium">{dest.name}</p>
                                                <p className="text-xs text-muted-foreground font-mono truncate max-w-[300px]">{dest.rtmp_url}</p>
                                                {dest.stream_key && (
                                                    <p className="text-xs font-mono bg-muted/50 px-2 py-1 rounded inline-block">
                                                        Key: {dest.stream_key}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {dest.enabled ? (
                                                <Button size="sm" variant="outline" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => onToggleDestination(dest.id, false)}>
                                                    <Square className="h-3 w-3 mr-1" /> Stop
                                                </Button>
                                            ) : (
                                                <Button size="sm" variant="outline" className="text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50" onClick={() => onToggleDestination(dest.id, true)}>
                                                    <Play className="h-3 w-3 mr-1" /> Start
                                                </Button>
                                            )}
                                            <Button size="sm" variant="ghost" onClick={async () => { await onToggleDestination(dest.id, false); setTimeout(() => onToggleDestination(dest.id, true), 1000); }} title="Restart connection">
                                                <RefreshCw className="h-3 w-3" />
                                            </Button>
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${dest.status === "CONNECTED" ? "bg-emerald-500 text-white" : dest.enabled ? "bg-amber-500 text-white" : "bg-gray-400 text-white"}`}>
                                                {dest.enabled ? dest.status : "STOPPED"}
                                            </span>
                                            <Button size="icon" variant="ghost" onClick={() => { setEditingDestId(dest.id); setEditDest({ name: dest.name, rtmp_url: dest.rtmp_url, stream_key: dest.stream_key || "" }); }}><Pencil className="h-4 w-4" /></Button>
                                            <Button size="icon" variant="ghost" className="text-destructive" onClick={() => onDeleteDestination(dest.id)}><Trash2 className="h-4 w-4" /></Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        {(!channel.destinations || channel.destinations.length === 0) && !isAddingDest && (
                            <div className="text-center py-8 text-muted-foreground"><Send className="h-8 w-8 mx-auto mb-2 opacity-50" /><p>No destinations configured</p></div>
                        )}

                        {isAddingDest ? (
                            <div className="p-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 space-y-4">
                                <h4 className="font-medium">Add New Destination</h4>
                                <div className="grid gap-3">
                                    <input className="w-full h-10 rounded-lg border bg-background px-3 text-sm" placeholder="e.g. YouTube Main" value={newDest.name} onChange={(e) => setNewDest({ ...newDest, name: e.target.value })} />
                                    <input className="w-full h-10 rounded-lg border bg-background px-3 text-sm font-mono" placeholder="rtmp://..." value={newDest.rtmp_url} onChange={(e) => setNewDest({ ...newDest, rtmp_url: e.target.value })} />
                                    <input type="password" className="w-full h-10 rounded-lg border bg-background px-3 text-sm" placeholder="Stream Key" value={newDest.stream_key} onChange={(e) => setNewDest({ ...newDest, stream_key: e.target.value })} />
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <Button variant="ghost" onClick={() => setIsAddingDest(false)}>Cancel</Button>
                                    <Button onClick={handleSaveDestination} disabled={loading === 'add-dest'}><Plus className="h-4 w-4 mr-1" /> Add Destination</Button>
                                </div>
                            </div>
                        ) : (
                            <Button variant="outline" className="w-full border-dashed" onClick={() => setIsAddingDest(true)}><Plus className="h-4 w-4 mr-2" /> Add Destination</Button>
                        )}
                    </TabsContent>

                    <TabsContent value="settings" className="space-y-4 mt-4">
                        <div className="grid gap-4">
                            <div className="p-4 rounded-xl border">
                                <label className="text-sm font-medium">Display Name</label>
                                <input className="w-full h-10 rounded-lg border bg-background px-3 text-sm mt-2" value={settings.display_name} onChange={(e) => updateSettings({ display_name: e.target.value })} />
                            </div>

                            <div className="p-4 rounded-xl border">
                                <label className="text-sm font-medium">Loop Source File</label>
                                <select className="w-full h-10 rounded-lg border bg-background px-3 text-sm mt-2" value={settings.loop_source_file} onChange={(e) => updateSettings({ loop_source_file: e.target.value })}>
                                    <option value="">Select a file...</option>
                                    {mediaFiles.filter((f: string) => !f.includes('.temp') && !f.includes('.original')).map((f: string) => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex items-center justify-between p-4 rounded-xl border">
                                    <div><p className="font-medium text-sm">OBS Override</p><p className="text-xs text-muted-foreground">Auto-switch when OBS connects</p></div>
                                    <Switch checked={settings.obs_override_enabled} onCheckedChange={(c: boolean) => updateSettings({ obs_override_enabled: c })} />
                                </div>
                                <div className="flex items-center justify-between p-4 rounded-xl border">
                                    <div><p className="font-medium text-sm">Auto-Restart Loop</p><p className="text-xs text-muted-foreground">Restart on failure</p></div>
                                    <Switch checked={settings.auto_restart_loop} onCheckedChange={(c: boolean) => updateSettings({ auto_restart_loop: c })} />
                                </div>
                                <div className="flex items-center justify-between p-4 rounded-xl border">
                                    <div><p className="font-medium text-sm">Enable Loop</p><p className="text-xs text-muted-foreground">Background loop source</p></div>
                                    <Switch checked={settings.loop_enabled} onCheckedChange={(c: boolean) => updateSettings({ loop_enabled: c })} />
                                </div>
                                <div className="flex items-center justify-between p-4 rounded-xl border">
                                    <div><p className="font-medium text-sm">Failover Timeout</p><p className="text-xs text-muted-foreground">Seconds before switch</p></div>
                                    <input type="number" className="w-20 h-8 rounded border bg-background px-2 text-sm text-center" value={settings.failover_timeout_seconds} onChange={(e) => updateSettings({ failover_timeout_seconds: parseInt(e.target.value) || 0 })} />
                                </div>
                            </div>

                            <div className="p-4 rounded-xl border bg-gradient-to-br from-primary/5 to-transparent">
                                <h4 className="font-semibold mb-4 flex items-center gap-2"><Settings2 className="h-4 w-4 text-primary" />Encoding Settings</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Video Bitrate (kbps)</label>
                                        <input type="number" className="w-full h-10 rounded-lg border bg-background px-3 text-sm mt-1" placeholder="4500" value={settings.video_bitrate} onChange={(e) => updateSettings({ video_bitrate: parseInt(e.target.value) || 0 })} />
                                        <p className="text-xs text-muted-foreground mt-1">0 = Auto (4500k)</p>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Audio Bitrate (kbps)</label>
                                        <input type="number" className="w-full h-10 rounded-lg border bg-background px-3 text-sm mt-1" value={settings.audio_bitrate} onChange={(e) => updateSettings({ audio_bitrate: parseInt(e.target.value) || 128 })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Keyframe Interval (s)</label>
                                        <input type="number" min="1" max="10" className="w-full h-10 rounded-lg border bg-background px-3 text-sm mt-1" value={settings.keyframe_interval} onChange={(e) => updateSettings({ keyframe_interval: parseInt(e.target.value) || 2 })} />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t">
                                <Button variant="destructive" size="sm" onClick={() => { if (confirm('Delete this channel?')) onDeleteChannel(channel.id); }}><Trash2 className="h-4 w-4 mr-1" /> Delete Channel</Button>
                                <Button onClick={handleSaveSettings} disabled={!isDirty || loading === 'save-settings'}><Save className="h-4 w-4 mr-1" /> {loading === 'save-settings' ? 'Saving...' : 'Save Settings'}</Button>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}

export default function ChannelsPage() {
    const [channels, setChannels] = useState<Channel[]>([]);
    const [mediaFiles, setMediaFiles] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newChannel, setNewChannel] = useState({ name: "", display_name: "", loop_source_file: "" });

    const fetchChannels = async () => {
        try {
            const res = await fetch('/api/channels');
            if (res.ok) { setChannels(await res.json()); setError(null); }
            else setError('Failed to fetch channels');
        } catch { setError('Failed to fetch channels'); }
        finally { setLoading(false); }
    };

    const fetchMedia = async () => {
        try {
            const res = await fetch('/api/media');
            if (res.ok) setMediaFiles(await res.json());
        } catch { /* ignore */ }
    };

    const handleAction = async (id: number, action: string) => {
        await fetch(`/api/channels/${id}/${action}`, { method: 'POST' });
        await fetchChannels();
    };

    const handleAddDestination = async (dest: Partial<Destination>) => {
        await fetch('/api/destinations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dest) });
        await fetchChannels();
    };

    const handleToggleDestination = async (id: number, enabled: boolean) => {
        await fetch(`/api/destinations/${id}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' });
        await fetchChannels();
    };

    const handleDeleteDestination = async (id: number) => {
        if (!confirm('Delete this destination?')) return;
        await fetch(`/api/destinations/${id}`, { method: 'DELETE' });
        await fetchChannels();
    };

    const handleUpdateChannel = async (id: number, settings: Record<string, unknown>) => {
        await fetch(`/api/channels/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
        await fetchChannels();
    };

    const handleDeleteChannel = async (id: number) => {
        await fetch(`/api/channels/${id}`, { method: 'DELETE' });
        await fetchChannels();
    };

    const handleUpdateDestination = async (id: number, updates: Partial<Destination>) => {
        await fetch(`/api/destinations/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
        await fetchChannels();
    };

    const handleCreateChannel = async () => {
        if (!newChannel.name || !newChannel.display_name) return;
        await fetch('/api/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newChannel) });
        setNewChannel({ name: "", display_name: "", loop_source_file: "" });
        setIsCreating(false);
        await fetchChannels();
    };

    useEffect(() => {
        fetchChannels();
        fetchMedia();
        const interval = setInterval(fetchChannels, 5000);
        return () => clearInterval(interval);
    }, []);

    const liveCount = channels.filter((c: Channel) => c.status === "LIVE").length;
    const loopCount = channels.filter((c: Channel) => c.active_source === "LOOP" && c.enabled).length;

    return (
        <div className="p-6 lg:p-8 space-y-6 fade-in">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-amber-500/10 border border-primary/20 shadow-lg">
                        <Radio className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Channels</h1>
                        <p className="text-muted-foreground text-sm lg:text-base">
                            {liveCount > 0 && <span className="text-emerald-500 font-medium">{liveCount} live</span>}
                            {liveCount > 0 && loopCount > 0 && " • "}
                            {loopCount > 0 && <span className="text-blue-500 font-medium">{loopCount} loop</span>}
                            {liveCount === 0 && loopCount === 0 && "Manage streaming channels"}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => { setLoading(true); fetchChannels(); fetchMedia(); }} className="btn-lift">
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                    <Button onClick={() => setIsCreating(true)} className="btn-lift bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90">
                        <Plus className="h-4 w-4 mr-2" /> New Channel
                    </Button>
                </div>
            </div>

            {error && (
                <Card className="border-destructive/50 bg-destructive/10">
                    <CardContent className="p-4 flex items-center gap-3"><AlertCircle className="h-5 w-5 text-destructive" /><span className="text-destructive">{error}</span></CardContent>
                </Card>
            )}

            {isCreating && (
                <Card className="border-2 border-primary/30 bg-primary/5">
                    <CardHeader><CardTitle>Create New Channel</CardTitle><CardDescription>Configure a new streaming channel</CardDescription></CardHeader>
                    <CardContent>
                        <div className="grid gap-4 max-w-xl">
                            <div><label className="text-sm font-medium">Display Name</label><input className="w-full h-10 rounded-lg border bg-background px-3 text-sm mt-1" placeholder="e.g. Main Temple Stream" value={newChannel.display_name} onChange={(e) => setNewChannel({ ...newChannel, display_name: e.target.value })} /></div>
                            <div><label className="text-sm font-medium">Slug (URL)</label><input className="w-full h-10 rounded-lg border bg-background px-3 text-sm mt-1 font-mono" placeholder="e.g. temple-main" value={newChannel.name} onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })} /></div>
                            <div>
                                <label className="text-sm font-medium">Loop Source File</label>
                                <select className="w-full h-10 rounded-lg border bg-background px-3 text-sm mt-1" value={newChannel.loop_source_file} onChange={(e) => setNewChannel({ ...newChannel, loop_source_file: e.target.value })}>
                                    <option value="">Select a video file...</option>
                                    {mediaFiles.filter((f: string) => !f.includes('.temp')).map((f: string) => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-2 justify-end pt-4"><Button variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button><Button onClick={handleCreateChannel}>Create Channel</Button></div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="space-y-6">
                {channels.length > 0 ? (
                    channels.map((channel: Channel) => (
                        <ChannelCard key={channel.id} channel={channel} mediaFiles={mediaFiles} onAction={handleAction} onAddDestination={handleAddDestination} onToggleDestination={handleToggleDestination} onDeleteDestination={handleDeleteDestination} onUpdateChannel={handleUpdateChannel} onDeleteChannel={handleDeleteChannel} onUpdateDestination={handleUpdateDestination} />
                    ))
                ) : !isCreating && (
                    <Card className="border-dashed">
                        <CardContent className="p-12 text-center">
                            <Radio className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                            <p className="text-lg font-medium text-muted-foreground">{loading ? "Loading channels..." : "No channels configured"}</p>
                            <p className="text-sm text-muted-foreground mt-1">Create your first channel to start streaming</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
