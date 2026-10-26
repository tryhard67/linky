import { useState, useEffect, useRef } from 'react';
import PocketBase from 'pocketbase';
import { type Doujin } from './types';
import './index.css';

export type DoujinPayload = Omit<Doujin, 'id' | 'collectionId' | 'collectionName' | 'created' | 'updated' | 'thumb'>;

interface Props {
  pb: PocketBase;
  userId: string;
  itemToEdit: Doujin | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DoujinsManager({ pb, userId, itemToEdit, onClose, onSuccess }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showAnimatedPrompt, setShowAnimatedPrompt] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [isFetchingThumb, setIsFetchingThumb] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [pasteFeedback, setPasteFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleImageFile = (file: File) => {
    setManualFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setPasteFeedback({
      type: 'success',
      text: `Image set: ${file.name || 'clipboard image'} (${(file.size / 1024).toFixed(0)} KB)`
    });
    setTimeout(() => setPasteFeedback(null), 3500);
  };

  const handleClipboardPasteBtn = async () => {
    setPasteFeedback(null);
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const ext = imageType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
            const file = new File([blob], `clipboard_${Date.now()}.${ext}`, { type: imageType });
            handleImageFile(file);
            return;
          }
        }
        setPasteFeedback({ type: 'error', text: 'No image found on clipboard. Copy an image first.' });
        setTimeout(() => setPasteFeedback(null), 3500);
      } else {
        setPasteFeedback({
          type: 'info',
          text: 'Clipboard API unavailable. On desktop, press Ctrl+V / Cmd+V to paste.'
        });
        setTimeout(() => setPasteFeedback(null), 4000);
      }
    } catch (err: any) {
      console.warn('Clipboard read error:', err);
      if (err.name === 'NotAllowedError') {
        setPasteFeedback({
          type: 'error',
          text: 'Clipboard permission was denied. Please grant permission to paste.'
        });
      } else {
        setPasteFeedback({
          type: 'error',
          text: err.message || 'Could not access clipboard image.'
        });
      }
      setTimeout(() => setPasteFeedback(null), 4000);
    }
  };

  const handleClearImage = () => {
    setManualFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setPasteFeedback(null);
  };

  // Global window paste listener for Cmd+V / Ctrl+V
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            handleImageFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const [formData, setFormData] = useState<DoujinPayload>({
    nhurl: itemToEdit?.nhurl || '',
    field: itemToEdit?.field || '',
    user: itemToEdit?.user || userId,
    code: itemToEdit?.code || 0,
    category: itemToEdit?.category || 'manga',
    isFavorite: itemToEdit?.isFavorite ?? false,
    isAnimated: itemToEdit?.isAnimated ?? false
  });

  useEffect(() => {
    if (itemToEdit?.thumb) {
      setPreviewUrl(`${import.meta.env.VITE_POCKETBASE_URL}/api/files/${itemToEdit.collectionId}/${itemToEdit.id}/${itemToEdit.thumb}`);
    }
  }, [itemToEdit]);

  useEffect(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (!formData.nhurl || !formData.nhurl.startsWith('http')) {
      if (!itemToEdit && !manualFile) setPreviewUrl(null);
      return;
    }

    typingTimeoutRef.current = setTimeout(async () => {
      setIsFetchingThumb(true);
      try {
        let imageUrl = '';

        // 1. YouTube Handler
        const ytMatch = formData.nhurl.match(/(?:youtube\.com\/.*[?&]v=|youtu\.be\/)([^&?\n]+)/);
        // 2. nhentai Handler - match both nhentai.net AND nhentai.xxx (separate databases!)
        const nhNetMatch = formData.nhurl.match(/nhentai\.net\/g\/(\d+)/);
        const nhXxxMatch = formData.nhurl.match(/nhentai\.xxx\/g\/(\d+)/);
        const nhMatch = nhNetMatch || nhXxxMatch;
        const nhSource = nhNetMatch ? 'net' : nhXxxMatch ? 'xxx' : 'net';

        if (nhMatch && nhMatch[1]) {
          const nhCode = parseInt(nhMatch[1], 10);
          setFormData(prev => ({
            ...prev,
            code: prev.code === 0 ? nhCode : prev.code,
            field: !prev.field.trim() ? `Doujin #${nhCode}` : prev.field
          }));

          try {
            const metaRes = await fetch(`/api/nh-metadata?id=${nhCode}&source=${nhSource}`);
            if (metaRes.ok) {
              const metaData = await metaRes.json();
              if (metaData.title) {
                setFormData(prev => (!prev.field || prev.field.startsWith('Doujin #') ? { ...prev, field: metaData.title } : prev));
              }
              if (metaData.coverUrl) {
                imageUrl = `/api/proxy-image?url=${encodeURIComponent(metaData.coverUrl)}`;
              }
            }
          } catch (e) {
            console.warn("Failed to fetch nh metadata:", e);
          }
        } else if (ytMatch && ytMatch[1]) {
          imageUrl = `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
          fetch(`https://api.microlink.io/?url=${encodeURIComponent(formData.nhurl)}`)
            .then(res => res.json())
            .then(async mlData => {
              let metaTitle = mlData?.data?.title;
              if (metaTitle) {
                if (/[^\u0000-\u007F]/.test(metaTitle)) {
                  try {
                    const trRes = await fetch(`/api/translate?text=${encodeURIComponent(metaTitle)}`);
                    if (trRes.ok) {
                      const trData = await trRes.json();
                      if (trData.translated) metaTitle = trData.translated;
                    }
                  } catch (_) {}
                }
                setFormData(prev => (!prev.field.trim() ? { ...prev, field: metaTitle } : prev));
              }
            }).catch(() => { });
        } else if (!formData.nhurl.includes('nhentai')) {
          try {
            const mlRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(formData.nhurl)}`);
            if (mlRes.ok) {
              const mlData = await mlRes.json();
              let metaTitle = mlData?.data?.title;
              if (metaTitle && !metaTitle.includes('Cloudflare')) {
                if (/[^\u0000-\u007F]/.test(metaTitle)) {
                  try {
                    const trRes = await fetch(`/api/translate?text=${encodeURIComponent(metaTitle)}`);
                    if (trRes.ok) {
                      const trData = await trRes.json();
                      if (trData.translated) metaTitle = trData.translated;
                    }
                  } catch (_) {}
                }
                setFormData(prev => (!prev.field.trim() ? { ...prev, field: metaTitle } : prev));
              }
              imageUrl = mlData?.data?.image?.url || mlData?.data?.logo?.url;
            }
          } catch (e) {
            // Ignore fetch errors for blocked domains
          }
        }

        if (imageUrl && !manualFile) {
          setPreviewUrl(imageUrl);
        }
      } catch (err) {
        console.warn("Failed to fetch preview:", err);
      } finally {
        setIsFetchingThumb(false);
      }
    }, 800);

    return () => { if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current); };
  }, [formData.nhurl, itemToEdit, manualFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'code' ? parseInt(value) || 0 : value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  };

  const handleTranslateField = async () => {
    if (!formData.field.trim() || isTranslating) return;
    setIsTranslating(true);
    try {
      const res = await fetch(`/api/translate?text=${encodeURIComponent(formData.field)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.translated) {
          setFormData(prev => ({ ...prev, field: data.translated }));
        }
      }
    } catch (e) {
      console.warn('Translation failed:', e);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (formData.category === 'video') {
      setShowAnimatedPrompt(true);
      return;
    }
    await saveRecord(false);
  };

  const saveRecord = async (isAnimated: boolean) => {
    setShowAnimatedPrompt(false);
    setIsSubmitting(true);

    try {
      let imageBlob: Blob | null = manualFile;
      let filename = manualFile ? manualFile.name : '';
      const pocketbaseUrl = import.meta.env.VITE_POCKETBASE_URL;

      if (!imageBlob && previewUrl && (!pocketbaseUrl || !previewUrl.includes(pocketbaseUrl))) {
        try {
          let imgRes = await fetch(previewUrl).catch(() => null);
          if (!imgRes || !imgRes.ok) {
            if (previewUrl.startsWith('http')) {
              imgRes = await fetch(`/api/proxy-image?url=${encodeURIComponent(previewUrl)}`).catch(() => null);
            }
          }
          if (!imgRes || !imgRes.ok) {
            imgRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(previewUrl)}`).catch(() => null);
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
          console.warn("Image download failed", e);
        }
      }

      const submitData = new FormData();
      submitData.append('nhurl', formData.nhurl);
      submitData.append('field', formData.field);
      submitData.append('user', formData.user || userId);
      submitData.append('code', formData.code.toString());
      submitData.append('category', formData.category || 'manga');
      submitData.append('isFavorite', String(formData.isFavorite ?? false));
      submitData.append('isAnimated', String(formData.category === 'video' ? isAnimated : false));

      if (imageBlob) {
        submitData.append('thumb', imageBlob, filename || 'thumb.jpg');
      }

      if (itemToEdit) {
        await pb.collection('doujins').update(itemToEdit.id, submitData);
      } else {
        await pb.collection('doujins').create(submitData);
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to save record');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ marginTop: 0 }}>{itemToEdit ? 'Edit Record' : 'Add New Record'}</h2>
        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>URL</label>
            <input type="url" name="nhurl" value={formData.nhurl} onChange={handleInputChange} required placeholder="https://nhentai.net/g/... or nhentai.xxx/g/..." />
          </div>

          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <label style={{ margin: 0 }}>Name</label>
              {/[^\u0000-\u007F]/.test(formData.field) && (
                <button
                  type="button"
                  onClick={handleTranslateField}
                  disabled={isTranslating}
                  style={{
                    background: 'none',
                    border: '1px solid #444',
                    color: '#38bdf8',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '0.75rem',
                    cursor: isTranslating ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isTranslating ? 'Translating...' : '🌐 Translate to English'}
                </button>
              )}
            </div>
            <input type="text" name="field" value={formData.field} onChange={handleInputChange} required />
          </div>

          <div className="input-group">
            <label>Code</label>
            <input type="number" name="code" value={formData.code || ''} onChange={handleInputChange} required />
          </div>

          <div className="input-group">
            <label>Category</label>
            <select
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                background: '#000000',
                border: '1px solid var(--glass-border)',
                color: 'white',
                fontSize: '1rem',
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23888' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 1rem center'
              }}
            >
              <option value="manga">📖 Manga</option>
              <option value="video">▶️ Video</option>
            </select>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <label style={{ margin: 0, fontSize: '0.875rem', color: '#a3a3a3', fontWeight: 500 }}>
                Thumbnail
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleClipboardPasteBtn}
                  className="btn"
                  style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    padding: '4px 10px',
                    fontSize: '0.775rem',
                    borderRadius: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer'
                  }}
                  title="Paste copied image from clipboard"
                >
                  📋 Paste Image from Clipboard
                </button>
                {manualFile && (
                  <button
                    type="button"
                    onClick={handleClearImage}
                    style={{
                      background: 'transparent',
                      color: '#f87171',
                      border: '1px solid rgba(248, 113, 113, 0.4)',
                      padding: '4px 8px',
                      fontSize: '0.75rem',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    ✕ Clear
                  </button>
                )}
              </div>
            </div>

            {pasteFeedback && (
              <div style={{
                padding: '0.45rem 0.75rem',
                marginBottom: '0.5rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                background: pasteFeedback.type === 'success' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                color: pasteFeedback.type === 'success' ? '#4ade80' : '#f87171',
                border: `1px solid ${pasteFeedback.type === 'success' ? 'rgba(74, 222, 128, 0.3)' : 'rgba(248, 113, 113, 0.3)'}`
              }}>
                {pasteFeedback.text}
              </div>
            )}

            <div 
              style={{ 
                minHeight: '140px', 
                background: '#050505', 
                borderRadius: '8px', 
                border: '1px dashed #333', 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                justifyContent: 'center', 
                overflow: 'hidden', 
                marginBottom: '0.6rem',
                padding: previewUrl ? '0' : '1.25rem',
                position: 'relative'
              }}
            >
              {isFetchingThumb ? (
                <span style={{ color: '#888', fontSize: '0.875rem' }}>🔄 Extracting thumbnail...</span>
              ) : previewUrl ? (
                <img src={previewUrl} alt="Preview" style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', display: 'block' }} />
              ) : (
                <div style={{ textAlign: 'center', color: '#666', fontSize: '0.85rem' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>📋 / 🖼️</div>
                  <div>Tap <strong>Paste Image from Clipboard</strong>, press <strong>Ctrl+V</strong>,</div>
                  <div style={{ marginTop: '0.2rem', fontSize: '0.75rem', color: '#555' }}>or browse a file below</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: '#888', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span>Or select file:</span>
              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*" 
                onChange={handleFileChange} 
                style={{ color: '#ccc', maxWidth: '200px', fontSize: '0.75rem' }} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button type="submit" className="btn" disabled={isSubmitting} style={{ flex: 1 }}>
              {isSubmitting ? 'Saving...' : (itemToEdit ? 'Update' : 'Create')}
            </button>
            <button type="button" className="btn btn-danger" onClick={onClose} disabled={isSubmitting} style={{ flex: 1 }}>
              Cancel
            </button>
          </div>
        </form>
      </div>

      {showAnimatedPrompt && (
        <div className="animated-prompt-overlay">
          <div className="glass-panel animated-prompt-panel">
            <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Is this video animated?</h3>
            <p style={{ color: '#aaa', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 1.5rem 0' }}>
              Choose whether <strong style={{ color: '#fff' }}>"{formData.field || 'this video'}"</strong> should be marked as animated.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn"
                disabled={isSubmitting}
                onClick={() => saveRecord(true)}
                style={{ flex: 1 }}
              >
                Yes, animated
              </button>
              <button
                type="button"
                className="btn"
                disabled={isSubmitting}
                onClick={() => saveRecord(false)}
                style={{ flex: 1, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
              >
                No
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowAnimatedPrompt(false)}
              disabled={isSubmitting}
              style={{
                marginTop: '1rem',
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: '#888',
                cursor: 'pointer',
                fontSize: '0.85rem'
              }}
            >
              Back to form
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
