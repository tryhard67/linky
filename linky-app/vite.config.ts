import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, type Plugin } from 'vite'

async function translateText(text: string): Promise<string> {
  if (!text || !text.trim()) return text;
  // If purely ASCII letters/numbers/punctuation, no need to translate
  if (!/[^\u0000-\u007F]/.test(text)) return text;

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = (await res.json()) as any;
      const translated = data?.[0]?.map((s: any) => s[0]).join('')?.trim();
      if (translated) return translated;
    }
  } catch (err) {
    console.warn('Translation error in dev server:', err);
  }
  return text;
}

function nhentaiDevProxyPlugin(): Plugin {
  return {
    name: 'nhentai-dev-proxy',
    configureServer(server) {
      // 1. Metadata with auto-translation to English
      server.middlewares.use('/api/nh-metadata', async (req, res) => {
        try {
          const urlObj = new URL(req.url || '', 'http://localhost:5173');
          const id = urlObj.searchParams.get('id');
          if (!id) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing gallery id' }));
            return;
          }

          let coverUrl = '';
          let title = '';

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

          if (!coverUrl) {
            try {
              const resp = await fetch(`https://nhentai.xxx/g/${id}`);
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
            translatedTitle = await translateText(title);
          }

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ 
            id, 
            title: translatedTitle, 
            originalTitle: rawTitle,
            coverUrl 
          }));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // 2. Generic translation endpoint
      server.middlewares.use('/api/translate', async (req, res) => {
        try {
          const urlObj = new URL(req.url || '', 'http://localhost:5173');
          const text = urlObj.searchParams.get('text');
          if (!text) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing text parameter' }));
            return;
          }

          const translated = await translateText(text);
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({ translated, original: text }));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });

      // 3. Image Proxy
      server.middlewares.use('/api/proxy-image', async (req, res) => {
        try {
          const urlObj = new URL(req.url || '', 'http://localhost:5173');
          const targetUrl = urlObj.searchParams.get('url');
          if (!targetUrl) {
            res.statusCode = 400;
            res.end('Missing url');
            return;
          }

          const imgRes = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://nhentai.net/'
            }
          });

          if (!imgRes.ok) {
            res.statusCode = imgRes.status;
            res.end(`Failed to fetch image: ${imgRes.statusText}`);
            return;
          }

          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'public, max-age=86400');

          const arrayBuffer = await imgRes.arrayBuffer();
          res.end(Buffer.from(arrayBuffer));
        } catch (err: any) {
          res.statusCode = 500;
          res.end(`Proxy error: ${err.message}`);
        }
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    nhentaiDevProxyPlugin()
  ],
})
