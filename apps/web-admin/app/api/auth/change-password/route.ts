import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Pool } from 'pg';
import { hash, compare } from 'bcryptjs';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://livestream_admin:secure_password@postgres:5432/livestream_db?sslmode=disable",
});

export async function POST(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();

    if (!newPassword || newPassword.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const client = await pool.connect();
    try {
        const userRes = await client.query('SELECT password_hash FROM users WHERE email = $1', [session.user.email]);
        const user = userRes.rows[0];

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const isValid = await compare(currentPassword, user.password_hash);
        if (!isValid) {
            return NextResponse.json({ error: 'Current password incorrect' }, { status: 400 });
        }

        const newHash = await hash(newPassword, 10);
        await client.query('UPDATE users SET password_hash = $1 WHERE email = $2', [newHash, session.user.email]);

        return NextResponse.json({ status: "success" });
    } catch (e) {
        console.error("Change pass error", e);
        return NextResponse.json({ error: "Failed to update password" }, { status: 500 });
    } finally {
        client.release();
    }
}
