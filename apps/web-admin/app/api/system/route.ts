import { NextResponse } from 'next/server';

const CONTROLLER_URL = process.env.CONTROLLER_API_URL || 'http://controller:8080';

export async function GET() {
    try {
        const res = await fetch(`${CONTROLLER_URL}/api/system/status`, { cache: 'no-store' });
        if (!res.ok) {
            throw new Error(`Controller responded: ${res.status}`);
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({
            status: 'error',
            error: 'Failed to fetch system status'
        }, { status: 500 });
    }
}
