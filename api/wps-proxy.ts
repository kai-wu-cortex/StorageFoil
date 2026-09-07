const WPS_API_BASE = 'https://openapi.wps.cn';
const ALLOWED_ENDPOINTS = [
  /^\/oauth2\/token$/,
  /^\/v7\/sheets\/[^/]+\/worksheets$/,
  /^\/v7\/sheets\/[^/]+\/worksheets\/\d+\/range_data(?:\?.*)?$/,
];

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      endpoint?: string;
      method?: string;
      body?: Record<string, string>;
      headers?: Record<string, string>;
    };
    const endpoint = payload.endpoint || '';
    const method = (payload.method || 'GET').toUpperCase();

    if (!ALLOWED_ENDPOINTS.some(pattern => pattern.test(endpoint))) {
      return Response.json({ error: 'WPS endpoint is not allowed' }, { status: 400 });
    }
    if (!['GET', 'POST'].includes(method)) {
      return Response.json({ error: 'HTTP method is not allowed' }, { status: 405 });
    }

    const headers: Record<string, string> = {};
    if (payload.headers?.Authorization) {
      headers.Authorization = payload.headers.Authorization;
    }

    let body: BodyInit | undefined;
    if (method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(payload.body || {});
    }

    const response = await fetch(`${WPS_API_BASE}${endpoint}`, { method, headers, body });
    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });
  } catch (error) {
    return Response.json(
      { error: 'WPS proxy request failed', message: String(error) },
      { status: 500 },
    );
  }
}
