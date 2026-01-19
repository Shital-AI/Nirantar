"use client";

import { SessionProvider, useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, User, Settings, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AuthProvider({ children }: { children: React.ReactNode }) {
    return <SessionProvider>{children}</SessionProvider>;
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (status === "loading") return;
        if (!session && pathname !== "/login") {
            router.push("/login");
        }
    }, [session, status, router, pathname]);

    if (status === "loading") {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-muted-foreground">Loading...</span>
                </div>
            </div>
        );
    }

    if (!session && pathname !== "/login") {
        return null;
    }

    return <>{children}</>;
}

export function UserMenu() {
    const { data: session } = useSession();
    const [isOpen, setIsOpen] = useState(false);

    if (!session?.user) {
        return null;
    }

    const handleSignOut = async () => {
        await signOut({ callbackUrl: "/login" });
    };

    return (
        <div className="relative w-full">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center gap-3 rounded-xl p-2 hover:bg-muted transition-colors"
            >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-amber-500/20 font-semibold text-primary">
                    {session.user.name?.charAt(0) || session.user.email?.charAt(0) || "U"}
                </div>
                <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium truncate">{session.user.name || "User"}</p>
                    <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute bottom-full left-0 right-0 mb-2 z-50 rounded-xl border bg-card shadow-lg overflow-hidden">
                        <div className="p-2 space-y-1">
                            <a
                                href="/security"
                                onClick={() => setIsOpen(false)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
                            >
                                <User className="h-4 w-4" />
                                Profile & Security
                            </a>
                            <a
                                href="/config"
                                onClick={() => setIsOpen(false)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors"
                            >
                                <Settings className="h-4 w-4" />
                                Settings
                            </a>
                        </div>
                        <div className="border-t p-2">
                            <button
                                onClick={handleSignOut}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                            >
                                <LogOut className="h-4 w-4" />
                                Sign Out
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
