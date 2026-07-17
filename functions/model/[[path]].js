export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  
  // Build the R2 key from the path - key is just the filename (rapfi.data)
  const path = params.path || '';
  const key = path; // Key is directly the path (e.g., rapfi.data)
  
  console.log('Fetching from R2:', key);
  
  try {
    const object = await env.MODEL_BUCKET.get(key);
    if (!object) {
      return new Response('Not Found: ' + key, { status: 404 });
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', object.size);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Range, Content-Type');

    const range = request.headers.get('Range');
    if (range) {
      const [, startStr, endStr] = range.match(/bytes=(\d+)-(\d*)/) || [];
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : object.size - 1;
      
      if (start >= 0 && end < object.size && start <= end) {
        const slice = object.slice(start, end + 1);
        headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
        headers.set('Content-Length', (end - start + 1).toString());
        return new Response(slice.body, { status: 206, headers });
      }
    }

    return new Response(object.body, { headers });
  } catch (err) {
    console.error('R2 fetch error:', err);
    return new Response('Internal Server Error: ' + err.message, { status: 500 });
  }
}
