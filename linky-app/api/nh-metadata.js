import { translateText } from './translate.js';

/**
 * Metadata API for nhentai galleries.
 * 
 * CRITICAL: nhentai.net and nhentai.xxx have COMPLETELY DIFFERENT gallery ID systems.
 * The same numeric ID refers to different doujins on each site.
 * 
 * Query params:
 *   id     - gallery ID (required)
 *   source - 'net' (default) or 'xxx' to specify which nhentai database to use
 */
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
    const source = req.query?.source || urlObj.searchParams.get('source') || 'net';

    if (!id) {
      return sendJson(400, { error: 'Missing gallery id' });
    }

    let coverUrl = '';
    let title = '';

    if (source === 'xxx') {
      // =====================================================
      // nhentai.xxx - separate database, must scrape directly
      // =====================================================
      try {
        const resp = await fetch(`https://nhentai.xxx/g/${id}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
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
    } else {
      // =====================================================
      // nhentai.net - use Cubari API (maps nhentai.net IDs correctly)
      // Fallback chain: Cubari API → Cubari reader page → nhentai.to mirror
      // NEVER use nhentai.xxx as fallback (different database!)
      // =====================================================

      // 1. Cubari nhentai API (best source - JSON, fast, correct ID mapping)
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

      // 2. Cubari reader page (embedded JSON has cover URL)
      if (!coverUrl) {
        try {
          const resp = await fetch(`https://cubari.moe/read/nhentai/${id}/`);
          if (resp.ok) {
            const html = await resp.text();
            const coverScript = html.match(/id="history_coverUrl"[^>]*>"([^"]+)"/i);
            if (coverScript && coverScript[1]) coverUrl = coverScript[1];
            if (!title) {
              const titleMatch = html.match(/<title>Read\s+([^|]+?)\s*\|\s*Cubari<\/title>/i);
              if (titleMatch && titleMatch[1]) title = titleMatch[1].trim();
            }
          }
        } catch (_) {}
      }

      // 3. nhentai.to mirror (same database as nhentai.net)
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
            if (!title) {
              const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
              if (titleMatch && titleMatch[1]) {
                title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
              }
            }
          }
        } catch (_) {}
      }
    }

    // Auto-translate non-ASCII titles
    const rawTitle = title;
    let translatedTitle = title;
    if (title) {
      const translation = await translateText(title);
      translatedTitle = translation.translated;
    }

    return sendJson(200, {
      id,
      source,
      title: translatedTitle,
      originalTitle: rawTitle,
      coverUrl
    });
  } catch (err) {
    return sendJson(500, { error: err.message });
  }
}
