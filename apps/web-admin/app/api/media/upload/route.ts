import { NextResponse } from 'next/server';

const CONTROLLER_URL = process.env.CONTROLLER_API_URL || 'http://controller:8080';

export async function POST(request: Request) {
    try {
        const contentType = request.headers.get("content-type") || "";

        // We proxy the stream directly to preserve multipart boundaries and efficiency
        // We must pass the Content-Type header so the backend knows the boundary
        const res = await fetch(`${CONTROLLER_URL}/api/media/upload`, {
            method: "POST",
            headers: {
                "Content-Type": contentType,
            },
            body: request.body,
            duplex: 'half', // Required for streaming bodies in fetch
        } as RequestInit & { duplex: string });

        if (!res.ok) {
            throw new Error(`Controller responded: ${res.status}`);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Upload Error:', error);
        return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }
}
