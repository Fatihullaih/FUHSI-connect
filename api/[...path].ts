import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const backendBase = String(process.env.BACKEND_API_URL || '').trim().replace(/\/+$/, '');
  if (!backendBase) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error:
          'Backend API URL is not configured on Vercel. Set BACKEND_API_URL in your Vercel Project Environment Variables pointing to your running Express server.',
      })
    );
    return;
  }

  try {
    const reqUrl = req.url || '/api';
    const targetUrl = `${backendBase}${reqUrl.startsWith('/') ? reqUrl : `/${reqUrl}`}`;

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const bodyBuffer = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

    const forwardHeaders = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (!value) continue;
      const lower = key.toLowerCase();
      if (['host', 'connection', 'content-length', 'transfer-encoding'].includes(lower)) continue;
      forwardHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
    }

    const method = (req.method || 'GET').toUpperCase();
    const upstream = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body: method !== 'GET' && method !== 'HEAD' ? bodyBuffer : undefined,
      redirect: 'manual',
    });

    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (['transfer-encoding', 'connection', 'content-encoding'].includes(lower)) return;
      res.setHeader(key, value);
    });

    const respBuffer = Buffer.from(await upstream.arrayBuffer());
    res.end(respBuffer);
  } catch (err: any) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: err?.message || 'Failed to reach upstream backend server.',
      })
    );
  }
}
