import { API } from 'nhentai-api';

const api = new API();

export async function getCover(galleryId) {
  try {
    const book = await api.getBook(galleryId);
    const coverUrl = api.getImageURL(book.cover);
    console.log('Cover URL:', coverUrl);
    return coverUrl;
  } catch (err) {
    // nhentai.net blocks direct API requests with Cloudflare 403 Forbidden.
    // Fall back to resolving the gallery page directly to extract the cover.
    try {
      const res = await fetch(`https://nhentai.to/g/${galleryId}`);
      if (res.ok) {
        const html = await res.text();
        const match = html.match(/id="cover"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i) 
          || html.match(/<img[^>]+src="([^"]+cover[^"]*)"/i);
        if (match && match[1]) {
          const coverUrl = match[1];
          console.log('Cover URL:', coverUrl);
          return coverUrl;
        }
      }
    } catch (_) {}

    console.error('Failed to get cover:', err.message);
    return null;
  }
}

// Usage
getCover(685252);
