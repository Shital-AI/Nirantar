import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://livestream_admin:secure_password@postgres:5432/livestream_db?sslmode=disable",
});

export async function GET(request: Request) {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await pool.connect();
    try {
        const res = await client.query(`
      SELECT id, email, name, role, last_login_at, is_active 
      FROM users 
      ORDER BY created_at DESC
    `);
        const users = res.rows.map(u => ({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            lastLogin: u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never',
            status: u.is_active ? 'active' : 'inactive'
        }));
        return NextResponse.json(users);
    } catch (error) {
        console.error("Fetch users error", error);
        return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    } finally {
        client.release();
    }
}
