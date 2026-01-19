import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar, MobileHeader } from "@/components/sidebar";
import { AuthProvider } from "@/components/auth-guard";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Nirantar - Livestream Control Center",
    description: "24/7 unattended streaming with automatic failover",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={`${inter.className} bg-background text-foreground antialiased`}>
                <AuthProvider>
                    <div className="flex min-h-screen">
                        <Sidebar />
                        <div className="flex flex-1 flex-col">
                            <MobileHeader />
                            <main className="flex-1 overflow-y-auto">
                                {children}
                            </main>
                            <footer className="border-t border-border/50 bg-card/50 px-6 py-4">
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                    <span>2024 Nirantar Livestream System</span>
                                    <span className="flex items-center gap-1">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        System Online
                                    </span>
                                </div>
                            </footer>
                        </div>
                    </div>
                </AuthProvider>
            </body>
        </html>
    );
}
