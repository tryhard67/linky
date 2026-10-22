export default async function handler(req, res) {
  const sendError = (status, msg) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (typeof res.status === 'function') {
      return res.status(status).send(msg);
    }
    res.statusCode = status;
    return res.end(msg);
  };

  try {
    const urlObj = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
    const targetUrl = req.query?.url || urlObj.searchParams.get('url');
    if (!targetUrl) {
      return sendError(400, 'Missing url parameter');
    }

    const imgRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://nhentai.net/'
      }
    });

    if (!imgRes.ok) {
      return sendError(imgRes.status, `Failed to fetch image: ${imgRes.statusText}`);
    }

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (typeof res.status === 'function') {
      return res.status(200).send(buffer);
    }
    res.statusCode = 200;
    return res.end(buffer);
  } catch (err) {
    return sendError(500, `Proxy error: ${err.message}`);
  }
}
