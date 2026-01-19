import { NextResponse } from 'next/server';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const CONTROLLER_URL = process.env.CONTROLLER_API_URL || 'http://controller:8080';

export async function POST(
    request: Request,
    { params }: { params: { channel: string } }
) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const channel = params.channel;
    if (!channel) {
        return NextResponse.json({ error: 'Channel name required' }, { status: 400 });
    }

    try {
        const res = await fetch(`${CONTROLLER_URL}/api/takeover/${channel}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) {
            const error = await res.text();
            return NextResponse.json({ error }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Takeover API Error:', error);
        return NextResponse.json({ error: 'Failed to takeover channel' }, { status: 500 });
    }
}
