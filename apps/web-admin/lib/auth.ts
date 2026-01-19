import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                // Try to authenticate against backend API
                const apiUrl = process.env.CONTROLLER_API_URL || process.env.API_URL || 'http://controller:8080';
                try {
                    const res = await fetch(`${apiUrl}/api/auth/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: credentials.email,
                            password: credentials.password,
                        }),
                    });

                    if (res.ok) {
                        const user = await res.json();
                        return {
                            id: user.id || '1',
                            email: user.email || credentials.email,
                            name: user.name || 'Admin',
                            role: user.role || 'ADMIN',
                        };
                    }
                } catch (error) {
                    console.log('Backend auth not available, using fallback login');
                }

                // Fallback login for when backend auth endpoint is not available 
                // Matches database user: admin@livestream.local / admin123
                if (credentials.email === 'admin@livestream.local' && credentials.password === 'admin123') {
                    return {
                        id: '1',
                        email: 'admin@livestream.local',
                        name: 'System Administrator',
                        role: 'ADMIN',
                    };
                }

                return null;
            },
        }),
    ],
    session: {
        strategy: "jwt",
        maxAge: 24 * 60 * 60,
    },
    pages: {
        signIn: "/login",
        error: "/login",
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.role = (user as any).role;
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).role = token.role;
                (session.user as any).id = token.id;
            }
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET || "super-secret-key-change-in-production",
};
