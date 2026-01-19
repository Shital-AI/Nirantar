"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
    Upload, FileVideo, RefreshCw, Trash2, Play, Film, HardDrive,
    CheckCircle2, XCircle, AlertTriangle, Loader2, X, Pause, Image
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Channel {
    id: number;
    name: string;
    display_name: string;
    loop_source_file: string;
    loop_enabled: boolean;
    active_source: string;
}

interface MediaFileInfo {
    filename: string;
    size: number;
    is_optimizing: boolean;
    progress: number;
    temp_size?: number;
}

export default function MediaPage() {
    const [files, setFiles] = useState<MediaFileInfo[]>([]);
    const [channels, setChannels] = useState<Channel[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [previewFile, setPreviewFile] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchFiles = async () => {
        try {
            const res = await fetch("/api/media/status");
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    const videoFiles = data.filter((f: MediaFileInfo) =>
                        !f.filename.includes(".original") &&
                        !f.filename.includes(".temp") &&
                        !f.filename.includes(".optimized") &&
                        f.filename !== "README.md"
                    );
                    setFiles(videoFiles);
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchChannels = async () => {
        try {
            const res = await fetch("/api/channels");
            if (res.ok) {
                const data = await res.json();
                setChannels(data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchFiles();
        fetchChannels();
        const interval = setInterval(() => {
            fetchFiles();
            fetchChannels();
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    // Auto-dismiss messages
    useEffect(() => {
        if (error || success) {
            const timer = setTimeout(() => {
                setError(null);
                setSuccess(null);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [error, success]);

    const getFileUsage = (filename: string): Channel[] => {
        return channels.filter((ch: Channel) =>
            ch.loop_source_file === filename &&
            ch.loop_enabled &&
            ch.active_source === "LOOP"
        );
    };

    const getAssignedChannels = (filename: string): Channel[] => {
        return channels.filter((ch: Channel) => ch.loop_source_file === filename);
    };

    const handleUpload = async (file: File) => {
        setUploading(true);
        setUploadProgress(0);
        setError(null);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener("progress", (e) => {
                if (e.lengthComputable) {
                    setUploadProgress(Math.round((e.loaded / e.total) * 100));
                }
            });

            xhr.onload = () => {
                if (xhr.status === 200) {
                    setSuccess(`${file.name} uploaded successfully`);
                    fetchFiles();
                } else {
                    setError("Upload failed. Please try again.");
                }
                setUploading(false);
                setUploadProgress(0);
            };

            xhr.onerror = () => {
                setError("Upload failed. Check your connection.");
                setUploading(false);
                setUploadProgress(0);
            };

            xhr.open("POST", "/api/media/upload");
            xhr.send(formData);
        } catch (err) {
            console.error(err);
            setError("Upload failed.");
            setUploading(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleUpload(e.target.files[0]);
            e.target.value = "";
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleUpload(e.dataTransfer.files[0]);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDelete = async (filename: string) => {
        const usedBy = getFileUsage(filename);
        if (usedBy.length > 0) {
            const channelNames = usedBy.map((ch: Channel) => ch.display_name).join(", ");
            setError(`Cannot delete "${filename}". It is actively streaming on: ${channelNames}`);
            return;
        }

        const fileInfo = files.find(f => f.filename === filename);
        if (fileInfo?.is_optimizing) {
            setError(`Cannot delete "${filename}" while it's being optimized.`);
            return;
        }

        if (!confirm(`Delete "${filename}"? This action cannot be undone.`)) return;

        try {
            const res = await fetch(`/api/media/${filename}`, { method: "DELETE" });
            if (res.ok) {
                setSuccess(`${filename} deleted successfully`);
                fetchFiles();
            } else {
                setError("Failed to delete file.");
            }
        } catch (err) {
            setError("Failed to delete file.");
        }
    };

    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    };

    const optimizingCount = files.filter(f => f.is_optimizing).length;
    const optimizedCount = files.filter(f => !f.is_optimizing).length;
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);

    return (
        <div className="p-6 lg:p-8 fade-in">
            <div className="mx-auto max-w-7xl space-y-6">
                {/* Header */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-amber-500/10 border border-primary/20 shadow-lg">
                            <Film className="h-7 w-7 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Media Library</h1>
                            <p className="text-muted-foreground text-sm lg:text-base">
                                Manage streaming source files • Auto-optimized for broadcast
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => { fetchFiles(); fetchChannels(); }}
                        className="btn-lift"
                    >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>

                {/* Alerts */}
                {error && (
                    <Card className="border-destructive/30 bg-destructive/10 fade-in">
                        <CardContent className="p-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-lg bg-destructive/20 flex items-center justify-center">
                                    <AlertTriangle className="h-5 w-5 text-destructive" />
                                </div>
                                <p className="text-destructive font-medium">{error}</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setError(null)} className="text-destructive hover:bg-destructive/10">
                                <X className="h-4 w-4" />
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {success && (
                    <Card className="border-emerald-500/30 bg-emerald-500/10 fade-in">
                        <CardContent className="p-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                </div>
                                <p className="text-emerald-600 dark:text-emerald-400 font-medium">{success}</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setSuccess(null)} className="text-emerald-600 hover:bg-emerald-500/10">
                                <X className="h-4 w-4" />
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="stat-card card-hover border-border/50">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Total Videos</p>
                                    <p className="text-3xl font-bold mt-1">{files.length}</p>
                                </div>
                                <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                    <FileVideo className="h-6 w-6 text-blue-500" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="stat-card card-hover border-border/50">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Optimized</p>
                                    <p className="text-3xl font-bold mt-1 text-emerald-500">{optimizedCount}</p>
                                </div>
                                <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="stat-card card-hover border-border/50">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Processing</p>
                                    <p className={`text-3xl font-bold mt-1 ${optimizingCount > 0 ? 'text-amber-500' : ''}`}>
                                        {optimizingCount}
                                    </p>
                                </div>
                                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${optimizingCount > 0 ? 'bg-amber-500/10' : 'bg-muted'}`}>
                                    {optimizingCount > 0 ? (
                                        <Loader2 className="h-6 w-6 text-amber-500 animate-spin" />
                                    ) : (
                                        <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="stat-card card-hover border-border/50">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Total Size</p>
                                    <p className="text-3xl font-bold mt-1">{formatSize(totalSize)}</p>
                                </div>
                                <div className="h-12 w-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                    <HardDrive className="h-6 w-6 text-purple-500" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Upload Zone */}
                <Card
                    className={`relative overflow-hidden transition-all duration-300 cursor-pointer group ${isDragging
                            ? "border-primary border-2 bg-primary/5 scale-[1.01] shadow-lg shadow-primary/10"
                            : "border-dashed border-2 border-border hover:border-primary/50 hover:bg-primary/5"
                        }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => !uploading && fileInputRef.current?.click()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".mp4,.mov,.mkv,.avi,.webm"
                        className="hidden"
                        onChange={handleFileSelect}
                        disabled={uploading}
                    />
                    <CardContent className="p-10 lg:p-12">
                        <div className="flex flex-col items-center justify-center text-center space-y-4">
                            {uploading ? (
                                <>
                                    <div className="relative h-20 w-20">
                                        <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
                                            <path
                                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                className="text-muted"
                                            />
                                            <path
                                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeDasharray={`${uploadProgress}, 100`}
                                                className="text-primary"
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-lg font-bold">{uploadProgress}%</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-semibold">Uploading...</p>
                                        <p className="text-sm text-muted-foreground">File will be available immediately</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className={`flex h-20 w-20 items-center justify-center rounded-2xl transition-all duration-300 ${isDragging
                                            ? "bg-primary/20 scale-110"
                                            : "bg-muted group-hover:bg-primary/10"
                                        }`}>
                                        <Upload className={`h-10 w-10 transition-colors ${isDragging
                                                ? "text-primary"
                                                : "text-muted-foreground group-hover:text-primary"
                                            }`} />
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-xl font-semibold">
                                            {isDragging ? "Drop to upload" : "Drag & drop video files"}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            or click to browse • Supports MP4, MOV, MKV, AVI, WebM
                                        </p>
                                    </div>
                                    <Badge variant="secondary" className="mt-2">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        Files usable immediately • Auto-optimization in background
                                    </Badge>
                                </>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Files Grid */}
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Video Files</h2>

                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[1, 2, 3].map((i) => (
                                <Card key={i} className="overflow-hidden">
                                    <div className="aspect-video bg-muted shimmer" />
                                    <CardContent className="p-4 space-y-2">
                                        <div className="h-4 bg-muted rounded shimmer w-3/4" />
                                        <div className="h-3 bg-muted rounded shimmer w-1/2" />
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : files.length === 0 ? (
                        <Card className="border-dashed border-2">
                            <CardContent className="p-12 text-center">
                                <FileVideo className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                                <p className="text-lg font-medium text-muted-foreground">No videos uploaded yet</p>
                                <p className="text-sm text-muted-foreground mt-1">Upload your first video to get started</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {files.map((fileInfo) => {
                                const activeUsage = getFileUsage(fileInfo.filename);
                                const assignedTo = getAssignedChannels(fileInfo.filename);
                                const isActive = activeUsage.length > 0;

                                return (
                                    <Card
                                        key={fileInfo.filename}
                                        className={`group overflow-hidden card-hover transition-all duration-300 ${fileInfo.is_optimizing
                                                ? "ring-2 ring-amber-500/30"
                                                : isActive
                                                    ? "ring-2 ring-blue-500/30"
                                                    : ""
                                            }`}
                                    >
                                        <div className="relative aspect-video bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
                                            {previewFile === fileInfo.filename ? (
                                                <video
                                                    src={`/api/media/${fileInfo.filename}`}
                                                    controls
                                                    autoPlay
                                                    className="absolute inset-0 w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <FileVideo className="h-16 w-16 text-muted-foreground/20" />
                                                    <Button
                                                        size="icon"
                                                        className="absolute inset-0 m-auto h-14 w-14 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 bg-primary/90 hover:bg-primary text-primary-foreground shadow-xl"
                                                        onClick={(e) => { e.stopPropagation(); setPreviewFile(fileInfo.filename); }}
                                                    >
                                                        <Play className="h-6 w-6 ml-0.5" fill="currentColor" />
                                                    </Button>
                                                </div>
                                            )}

                                            {previewFile === fileInfo.filename && (
                                                <Button
                                                    size="icon"
                                                    variant="secondary"
                                                    className="absolute top-2 right-2 h-8 w-8 bg-black/60 hover:bg-black/80 text-white"
                                                    onClick={(e) => { e.stopPropagation(); setPreviewFile(null); }}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            )}

                                            {/* Status badges */}
                                            <div className="absolute top-2 left-2 flex flex-col gap-1">
                                                {fileInfo.is_optimizing && (
                                                    <Badge className="bg-amber-500 text-white border-0 gap-1">
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                        {Math.round(fileInfo.progress)}%
                                                    </Badge>
                                                )}
                                                {isActive && (
                                                    <Badge className="bg-blue-500 text-white border-0">
                                                        🔴 Streaming
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Progress bar */}
                                            {fileInfo.is_optimizing && (
                                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-500"
                                                        style={{ width: `${Math.min(fileInfo.progress, 100)}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-medium truncate" title={fileInfo.filename}>
                                                        {fileInfo.filename}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatSize(fileInfo.size)}
                                                        </span>
                                                        {fileInfo.is_optimizing ? (
                                                            <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-600 dark:text-amber-400">
                                                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                                Optimizing
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="secondary" className="text-xs">
                                                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                                                Ready
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {assignedTo.length > 0 && (
                                                        <p className="text-xs text-muted-foreground mt-2 truncate">
                                                            Used by: {assignedTo.map((ch: Channel) => ch.display_name).join(", ")}
                                                        </p>
                                                    )}
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={`shrink-0 h-8 w-8 ${isActive || fileInfo.is_optimizing
                                                            ? "text-muted-foreground/30 cursor-not-allowed"
                                                            : "text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100"
                                                        } transition-all`}
                                                    onClick={() => handleDelete(fileInfo.filename)}
                                                    disabled={isActive || fileInfo.is_optimizing}
                                                    title={isActive ? "Stop the stream first" : fileInfo.is_optimizing ? "Wait for optimization" : "Delete file"}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
