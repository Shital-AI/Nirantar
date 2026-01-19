"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/auth-guard";
import { useState } from "react";
import {
    LayoutDashboard,
    Radio,
    Settings,
    Activity,
    Shield,
    FileText,
    FileVideo,
    Menu,
    X,
    Users,
    ChevronRight,
} from "lucide-react";

const navigation = [
    { name: "Dashboard", href: "/", icon: LayoutDashboard, description: "Overview & stats" },
    { name: "Channels", href: "/channels", icon: Radio, description: "Stream management" },
    { name: "Users", href: "/users", icon: Users, description: "User management" },
    { name: "Media", href: "/media", icon: FileVideo, description: "File library" },
    { name: "Health", href: "/health", icon: Activity, description: "System status" },
    { name: "Config", href: "/config", icon: Settings, description: "Settings" },
    { name: "Logs", href: "/logs", icon: FileText, description: "Activity logs" },
    { name: "Security", href: "/security", icon: Shield, description: "Access control" },
];

function SidebarContent({ pathname, session, onClose }: { pathname: string, session: any, onClose?: () => void }) {
    return (
        <div className="flex h-full flex-col bg-card border-r border-border/50">
            <div className="flex flex-shrink-0 items-center px-5 py-5 justify-between border-b border-border/50">
                <Link href="/" className="flex items-center gap-3 group" onClick={onClose}>
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-amber-500/30 rounded-xl blur-lg opacity-50 group-hover:opacity-75 transition-opacity" />
                        <div className="relative h-11 w-11 overflow-hidden rounded-xl bg-gradient-to-br from-card to-muted border border-border/50 flex items-center justify-center">
                            <img src="/logo.png" alt="Nirantar" className="h-8 w-8 object-contain" />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-xl font-bold font-serif gradient-text tracking-wide">Nirantar</h1>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
                            Control Center
                        </p>
                    </div>
                </Link>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="lg:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                )}
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
                <nav className="flex-1 space-y-1">
                    {navigation.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                onClick={onClose}
                                className={cn(
                                    "group flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 relative",
                                    isActive
                                        ? "bg-gradient-to-r from-primary to-amber-500 text-primary-foreground shadow-lg shadow-primary/20"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <item.icon
                                    className={cn(
                                        "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                                        isActive
                                            ? "text-primary-foreground"
                                            : "text-muted-foreground group-hover:text-foreground"
                                    )}
                                />
                                <span className="flex-1">{item.name}</span>
                                {isActive && (
                                    <ChevronRight className="h-4 w-4 text-primary-foreground/70" />
                                )}
                            </Link>
                        );
                    })}
                </nav>
            </div>

            <div className="flex flex-shrink-0 border-t border-border/50 p-4 bg-muted/30">
                {session ? (
                    <UserMenu />
                ) : (
                    <div className="flex items-center gap-3 w-full">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                            <div className="relative">
                                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 live-indicator" />
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">System Online</p>
                            <p className="text-xs text-muted-foreground">All services healthy</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export function Sidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();

    if (pathname === "/login") {
        return null;
    }

    return (
        <div className="hidden lg:flex lg:flex-shrink-0">
            <div className="flex w-64 flex-col">
                <SidebarContent pathname={pathname} session={session} />
            </div>
        </div>
    );
}

export function MobileHeader() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(false);

    if (pathname === "/login") return null;

    return (
        <>
            <div className="flex lg:hidden h-16 items-center justify-between border-b border-border/50 bg-card/95 backdrop-blur-lg px-4 z-40 relative">
                <Link href="/" className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                        <img src="/logo.png" alt="Nirantar" className="h-7 w-7 object-contain" />
                    </div>
                    <span className="font-bold font-serif gradient-text text-lg">Nirantar</span>
                </Link>
                <button
                    onClick={() => setIsOpen(true)}
                    className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                    <Menu className="h-5 w-5" />
                </button>
            </div>

            {isOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div
                        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="fixed inset-y-0 left-0 w-72 bg-card shadow-2xl animate-in slide-in-from-left duration-300">
                        <SidebarContent
                            pathname={pathname}
                            session={session}
                            onClose={() => setIsOpen(false)}
                        />
                    </div>
                </div>
            )}
        </>
    );
}
