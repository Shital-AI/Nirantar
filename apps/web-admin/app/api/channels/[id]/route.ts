import { NextResponse } from 'next/server';

const CONTROLLER_URL = process.env.CONTROLLER_API_URL || 'http://controller:8080';

export async function PUT(
    request: Request,
    { params }: { params: { id: string } }
) {
    const { id } = params;

    try {
        const body = await request.json();
        const res = await fetch(`${CONTROLLER_URL}/api/channels/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            throw new Error(`Controller responded: ${res.status}`);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: `Failed to update channel ${id}` },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
    const { id } = params;

    try {
        const res = await fetch(`${CONTROLLER_URL}/api/channels/${id}`, {
            method: 'DELETE',
        });

        if (!res.ok) {
            throw new Error(`Controller responded: ${res.status}`);
        }

        return new NextResponse(null, { status: 200 });
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: `Failed to delete channel ${id}` },
            { status: 500 }
        );
    }
}
