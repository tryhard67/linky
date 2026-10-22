import { translateText } from './translate.js';

export default async function handler(req, res) {
  const sendJson = (status, data) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (typeof res.status === 'function') {
      return res.status(status).json(data);
    }
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(data));
  };

  try {
    const urlObj = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
    const id = req.query?.id || urlObj.searchParams.get('id');
    if (!id) {
      return sendJson(400, { error: 'Missing gallery id' });
    }

    let coverUrl = '';
    let title = '';

    // 1. Try Cubari nhentai API (official direct resolution for nhentai.net gallery IDs)
    try {
      const resp = await fetch(`https://cubari.moe/read/api/nhentai/series/${id}/`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.cover) coverUrl = data.cover;
        if (data.title) title = data.title;
      }
    } catch (_) {}

    // 2. Fallback to Cubari reader page
    if (!coverUrl) {
      try {
        const resp = await fetch(`https://cubari.moe/read/nhentai/${id}/`);
        if (resp.ok) {
          const html = await resp.text();
          const match = html.match(/id="history_coverUrl"[^>]*>"([^"]+)"/i);
          if (match && match[1]) coverUrl = match[1];
          const titleMatch = html.match(/<title>Read\s+([^|]+?)\s*\|\s*Cubari<\/title>/i);
          if (titleMatch && titleMatch[1]) title = titleMatch[1].trim();
        }
      } catch (_) {}
    }

    // 3. Fallback to nhentai.to mirror
    if (!coverUrl) {
      try {
        const resp = await fetch(`https://nhentai.to/g/${id}`);
        if (resp.ok) {
          const html = await resp.text();
          const coverMatch = html.match(/id="cover"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i) 
            || html.match(/<img[^>]+src="([^"]+cover[^"]*)"/i);
          if (coverMatch && coverMatch[1]) {
            coverUrl = coverMatch[1];
          }
          const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
          if (titleMatch && titleMatch[1]) {
            title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
          }
        }
      } catch (_) {}
    }

    const rawTitle = title;
    let translatedTitle = title;
    if (title) {
      const translation = await translateText(title);
      translatedTitle = translation.translated;
    }

    return sendJson(200, { 
      id, 
      title: translatedTitle, 
      originalTitle: rawTitle,
      coverUrl 
    });
  } catch (err) {
    return sendJson(500, { error: err.message });
  }
}
