import { useState } from 'react';
import PocketBase from 'pocketbase';
import './index.css';

interface Props {
  pb: PocketBase;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface ImportItemStatus {
  url: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  title?: string;
  error?: string;
}

export default function BulkImportModal({ pb, userId, onClose, onSuccess }: Props) {
  const [linksText, setLinksText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [items, setItems] = useState<ImportItemStatus[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [completedCount, setCompletedCount] = useState(0);

  const parsedUrls = linksText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && (line.startsWith('http://') || line.startsWith('https://')));

  const handleStartImport = async () => {
    if (parsedUrls.length === 0) return;

    const initialStatuses: ImportItemStatus[] = parsedUrls.map(url => ({
      url,
      status: 'pending'
    }));

    setItems(initialStatuses);
    setIsImporting(true);
    setCompletedCount(0);

    let successCount = 0;

    for (let i = 0; i < parsedUrls.length; i++) {
      const url = parsedUrls[i];
      setCurrentIndex(i);

      setItems(prev => prev.map((item, idx) => 
        idx === i ? { ...item, status: 'processing' } : item
      ));

      try {
        let title = '';
        let code = 0;
        let coverUrl = '';

        const nhMatch = url.match(/nhentai\.net\/g\/(\d+)/);
        const ytMatch = url.match(/(?:youtube\.com\/.*[?&]v=|youtu\.be\/)([^&?\n]+)/);

        if (nhMatch && nhMatch[1]) {
          code = parseInt(nhMatch[1], 10);
          title = `Doujin #${code}`;

          try {
            const metaRes = await fetch(`/api/nh-metadata?id=${code}`);
            if (metaRes.ok) {
              const metaData = await metaRes.json();
              if (metaData.title) title = metaData.title;
              if (metaData.coverUrl) coverUrl = metaData.coverUrl;
            }
          } catch (_) {}
        } else if (ytMatch && ytMatch[1]) {
          title = `YouTube Video`;
          coverUrl = `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
          try {
            const mlRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
            if (mlRes.ok) {
              const mlData = await mlRes.json();
              if (mlData?.data?.title) title = mlData.data.title;
            }
          } catch (_) {}
        } else {
          title = url;
          try {
            const mlRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
            if (mlRes.ok) {
              const mlData = await mlRes.json();
              if (mlData?.data?.title) title = mlData.data.title;
              coverUrl = mlData?.data?.image?.url || mlData?.data?.logo?.url || '';
            }
          } catch (_) {}
        }

        // Auto-translate non-English titles to English
        if (title && /[^\u0000-\u007F]/.test(title)) {
          try {
            const trRes = await fetch(`/api/translate?text=${encodeURIComponent(title)}`);
            if (trRes.ok) {
              const trData = await trRes.json();
              if (trData.translated) title = trData.translated;
            }
          } catch (_) {}
        }

        let imageBlob: Blob | null = null;
        let filename = 'thumb.jpg';

        if (coverUrl) {
          try {
            let imgRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(coverUrl)}`).catch(() => null);
            if (!imgRes || !imgRes.ok) {
              imgRes = await fetch(coverUrl).catch(() => null);
            }
            if (!imgRes || !imgRes.ok) {
              imgRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(coverUrl)}`).catch(() => null);
            }
            if (imgRes && imgRes.ok) {
              imageBlob = await imgRes.blob();
              let ext = 'jpg';
              if (imageBlob.type && imageBlob.type.includes('/')) {
                ext = imageBlob.type.split('/')[1].replace('jpeg', 'jpg');
              }
              filename = `thumb.${ext}`;
            }
          } catch (e) {
            console.warn('Cover download failed for bulk item:', e);
          }
        }

        const submitData = new FormData();
        submitData.append('nhurl', url);
        submitData.append('field', title);
        submitData.append('user', userId);
        submitData.append('code', code.toString());

        if (imageBlob) {
          submitData.append('thumb', imageBlob, filename);
        }

        await pb.collection('doujins').create(submitData);
        successCount++;

        setItems(prev => prev.map((item, idx) => 
          idx === i ? { ...item, status: 'success', title } : item
        ));
      } catch (err: any) {
        setItems(prev => prev.map((item, idx) => 
          idx === i ? { ...item, status: 'error', error: err.message || 'Failed to save' } : item
        ));
      }

      setCompletedCount(i + 1);
    }

    setIsImporting(false);
    if (successCount > 0) {
      onSuccess();
    }
  };

  const progressPercent = items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0;
  const isFinished = items.length > 0 && !isImporting && completedCount === items.length;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Bulk Import Links</h2>
          <button 
            type="button" 
            onClick={onClose} 
            disabled={isImporting}
            style={{ background: 'none', border: 'none', color: '#888', fontSize: '1.5rem', cursor: isImporting ? 'not-allowed' : 'pointer' }}
          >
            &times;
          </button>
        </div>

        {items.length === 0 ? (
          <div>
            <div className="input-group">
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Paste Links (one per newline)</span>
                <span style={{ color: '#888' }}>{parsedUrls.length} valid link{parsedUrls.length === 1 ? '' : 's'} detected</span>
              </label>
              <textarea
                value={linksText}
                onChange={e => setLinksText(e.target.value)}
                rows={10}
                placeholder={"https://nhentai.net/g/685252/\nhttps://nhentai.net/g/177013/\nhttps://www.youtube.com/watch?v=..."}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  background: '#000000',
                  border: '1px solid var(--glass-border)',
                  color: 'white',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button 
                type="button" 
                className="btn" 
                onClick={handleStartImport} 
                disabled={parsedUrls.length === 0}
                style={{ flex: 1, opacity: parsedUrls.length === 0 ? 0.5 : 1 }}
              >
                Start Import ({parsedUrls.length})
              </button>
              <button type="button" className="btn btn-danger" onClick={onClose} style={{ flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Progress bar */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.5rem', color: '#a3a3a3' }}>
                <span>{isImporting ? `Processing ${currentIndex + 1} of ${items.length}...` : 'Import Finished'}</span>
                <span>{progressPercent}%</span>
              </div>
              <div style={{ height: '8px', background: '#222', borderRadius: '4px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    width: `${progressPercent}%`, 
                    background: '#ffffff', 
                    transition: 'width 0.3s ease' 
                  }} 
                />
              </div>
            </div>

            {/* List of items and statuses */}
            <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #222', borderRadius: '8px', padding: '0.5rem', marginBottom: '1.5rem', background: '#050505' }}>
              {items.map((item, index) => (
                <div 
                  key={index} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '0.6rem 0.75rem', 
                    borderBottom: index < items.length - 1 ? '1px solid #1a1a1a' : 'none',
                    fontSize: '0.85rem'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.75rem' }}>
                    <div style={{ color: '#eee', fontWeight: item.status === 'processing' ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.title || item.url}
                    </div>
                    {item.title && <div style={{ fontSize: '0.75rem', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.url}</div>}
                  </div>

                  <div style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {item.status === 'pending' && <span style={{ color: '#666' }}>⏳ Pending</span>}
                    {item.status === 'processing' && <span style={{ color: '#38bdf8' }}>🔄 Saving...</span>}
                    {item.status === 'success' && <span style={{ color: '#4ade80' }}>✅ Saved</span>}
                    {item.status === 'error' && <span style={{ color: '#f87171' }} title={item.error}>❌ Failed</span>}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              {isFinished ? (
                <button type="button" className="btn" onClick={onClose} style={{ flex: 1 }}>
                  Done
                </button>
              ) : (
                <button type="button" className="btn btn-danger" onClick={onClose} disabled={isImporting} style={{ flex: 1 }}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
