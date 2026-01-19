import { NextResponse } from 'next/server';

const CONTROLLER_URL = process.env.CONTROLLER_API_URL || 'http://controller:8080';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level') || 'all';
    const limit = searchParams.get('limit') || '100';

    try {
        const res = await fetch(
            `${CONTROLLER_URL}/api/logs?level=${level}&limit=${limit}`,
            { cache: 'no-store' }
        );
        if (!res.ok) {
            throw new Error(`Controller responded: ${res.status}`);
        }
        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({
            logs: [],
            error: 'Failed to fetch logs'
        }, { status: 500 });
    }
}
