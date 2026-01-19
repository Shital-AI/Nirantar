const CONTROLLER_URL = process.env.CONTROLLER_API_URL || 'http://controller:8080';

export async function fetchFromController(endpoint: string, options?: RequestInit) {
    const url = `${CONTROLLER_URL}${endpoint}`;
    try {
        const res = await fetch(url, {
            ...options,
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
        });
        if (!res.ok) {
            throw new Error(`Controller error: ${res.status}`);
        }
        return res.json();
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error);
        throw error;
    }
}

export async function postToController(endpoint: string, data: any) {
    return fetchFromController(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
