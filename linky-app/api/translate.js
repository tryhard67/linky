export async function translateText(text) {
  if (!text || !text.trim()) return { translated: text, original: text, detectedLang: 'en' };

  // If purely ASCII English characters, numbers, and standard symbols, skip translation
  if (!/[^\u0000-\u007F]/.test(text)) {
    return { translated: text, original: text, detectedLang: 'en' };
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const detectedLang = data?.[2] || 'unknown';
      const translated = data?.[0]?.map(s => s[0]).join('')?.trim();
      if (translated) {
        return { translated, original: text, detectedLang };
      }
    }
  } catch (err) {
    console.warn('Translation error:', err);
  }

  return { translated: text, original: text, detectedLang: 'unknown' };
}

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
    const text = req.query?.text || urlObj.searchParams.get('text');
    if (!text) {
      return sendJson(400, { error: 'Missing text parameter' });
    }

    const result = await translateText(text);
    return sendJson(200, result);
  } catch (err) {
    return sendJson(500, { error: err.message });
  }
}
