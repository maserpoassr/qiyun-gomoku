export async function onRequest(context) {
  const { request, env } = context;

  // 仅允许 GET/HEAD 请求
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // 1. 优先通过 R2 绑定直接获取（免除公网 Egress 流量费并提升速度）
  if (env.MODEL_BUCKET) {
    try {
      const objectKey = 'rapfi.data';
      const object = await env.MODEL_BUCKET.get(objectKey);

      if (!object) {
        return new Response('Model file not found in R2 Bucket', { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');

      // 处理 Range 请求（断点续传支持）
      const range = request.headers.get('Range');
      if (range) {
        const match = range.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : object.size - 1;
          if (start >= 0 && end < object.size && start <= end) {
            const sliced = object.slice(start, end + 1);
            headers.set('Content-Range', `bytes ${start}-${end}/${object.size}`);
            headers.set('Content-Length', (end - start + 1).toString());
            return new Response(sliced.body, { status: 206, headers });
          }
        }
      }

      // 关键：直接将 object.body (ReadableStream) 返回，不占用 Worker 运行内存
      return new Response(object.body, { headers });
    } catch (err) {
      console.error('R2 fetch error:', err);
      // R2 失败时静默降级到兜底方案
    }
  }

  // 2. 兜底方案：通过 CDN 代理流式转发
  const fallbackUrl = 'https://pub-48ebff44fc3541d08f962a38d5a56563.r2.dev/rapfi.data';
  try {
    const response = await fetch(fallbackUrl, {
      headers: { Range: request.headers.get('Range') || '' },
    });

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');

    // 同样使用流式转发，不占用 Worker 内存
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (err) {
    console.error('Fallback CDN fetch error:', err);
    return new Response('Failed to fetch model file from all sources', { status: 502 });
  }
}
