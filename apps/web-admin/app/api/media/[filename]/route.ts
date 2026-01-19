import { NextResponse } from 'next/server';

const CONTROLLER_URL = process.env.CONTROLLER_API_URL || 'http://controller:8080';

export async function GET(
    request: Request,
    { params }: { params: { filename: string } }
) {
    const { filename } = params;

    try {
        const res = await fetch(`${CONTROLLER_URL}/api/media/${filename}`, {
            method: 'GET',
        });

        if (!res.ok) {
            return new NextResponse('File not found', { status: 404 });
        }

        const contentType = res.headers.get('content-type') || 'video/mp4';
        const contentLength = res.headers.get('content-length');

        const headers: Record<string, string> = {
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
        };

        if (contentLength) {
            headers['Content-Length'] = contentLength;
        }

        // Stream the response body
        return new NextResponse(res.body, {
            status: 200,
            headers,
        });
    } catch (error) {
        console.error('Stream Error:', error);
        return NextResponse.json(
            { error: `Failed to stream file ${filename}` },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { filename: string } }
) {
    const { filename } = params;

    try {
        const res = await fetch(`${CONTROLLER_URL}/api/media/${filename}`, {
            method: 'DELETE',
        });

        if (!res.ok) {
            throw new Error(`Controller responded: ${res.status}`);
        }

        return new NextResponse(null, { status: 200 });
    } catch (error) {
        console.error('Delete Error:', error);
        return NextResponse.json(
            { error: `Failed to delete file ${filename}` },
            { status: 500 }
        );
    }
}
