import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    // Auto-detect host from request headers
    const forwardedHost = request.headers.get('x-forwarded-host');
    const host = request.headers.get('host');

    // Get the hostname without port
    let detectedHost = forwardedHost || host || '';
    if (detectedHost.includes(':')) {
        detectedHost = detectedHost.split(':')[0];
    }

    // Use env override if set, otherwise use detected host
    const rtmpHost = process.env.RTMP_HOST || process.env.PUBLIC_HOST || detectedHost;
    const rtmpPort = process.env.RTMP_PORT || '1935';

    return NextResponse.json({
        rtmp_host: rtmpHost,
        rtmp_port: rtmpPort,
        rtmp_url: rtmpHost ? `rtmp://${rtmpHost}:${rtmpPort}` : '',
        auto_detected: !process.env.RTMP_HOST && !process.env.PUBLIC_HOST,
    });
}
