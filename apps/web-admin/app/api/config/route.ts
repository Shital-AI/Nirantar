import { NextResponse } from 'next/server';

const CONTROLLER_URL = process.env.CONTROLLER_API_URL || 'http://controller:8080';

export async function GET() {
    try {
        const res = await fetch(`${CONTROLLER_URL}/api/config`, { cache: 'no-store' });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json([], { status: 500 });
    }
}

export async function PUT(request: Request) {
    try {
        const body = await request.json();
        const res = await fetch(`${CONTROLLER_URL}/api/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
