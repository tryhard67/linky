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

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [isFetchingThumb, setIsFetchingThumb] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [formData, setFormData] = useState<DoujinPayload>({
    nhurl: itemToEdit?.nhurl || '',
    field: itemToEdit?.field || '',
    user: itemToEdit?.user || userId,
    code: itemToEdit?.code || 0
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
        // 2. nhentai Handler
        const nhMatch = formData.nhurl.match(/nhentai\.net\/g\/(\d+)/);

        if (nhMatch && nhMatch[1]) {
          const nhCode = parseInt(nhMatch[1], 10);
          setFormData(prev => ({
            ...prev,
            code: prev.code === 0 ? nhCode : prev.code,
            field: !prev.field.trim() ? `Doujin #${nhCode}` : prev.field
          }));

          // Direct cover image resolution
          imageUrl = `https://t3.nhentai.net/galleries/${nhCode}/cover.jpg`;
        } else if (ytMatch && ytMatch[1]) {
          imageUrl = `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
          fetch(`https://api.microlink.io/?url=${encodeURIComponent(formData.nhurl)}`)
            .then(res => res.json())
            .then(mlData => {
              const metaTitle = mlData?.data?.title;
              if (metaTitle) setFormData(prev => (!prev.field.trim() ? { ...prev, field: metaTitle } : prev));
            }).catch(() => { });
        } else if (!formData.nhurl.includes('nhentai.net')) {
          try {
            const mlRes = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(formData.nhurl)}`);
            if (mlRes.ok) {
              const mlData = await mlRes.json();
              const metaTitle = mlData?.data?.title;
              if (metaTitle && !metaTitle.includes('Cloudflare')) {
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'code' ? parseInt(value) || 0 : value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setManualFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      let imageBlob: Blob | null = manualFile;
      let filename = manualFile ? manualFile.name : '';
      const pocketbaseUrl = import.meta.env.VITE_POCKETBASE_URL;

      if (!imageBlob && previewUrl && previewUrl.startsWith('http') && (!pocketbaseUrl || !previewUrl.includes(pocketbaseUrl))) {
        try {
          let imgRes = await fetch(previewUrl).catch(() => null);
          if (!imgRes || !imgRes.ok) imgRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(previewUrl)}`);
          if (imgRes && imgRes.ok) {
            imageBlob = await imgRes.blob();
            let ext = 'jpg';
            if (imageBlob.type && imageBlob.type.includes('/')) ext = imageBlob.type.split('/')[1];
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
            <input type="url" name="nhurl" value={formData.nhurl} onChange={handleInputChange} required placeholder="https://example.net/g/685252/" />
          </div>

          <div className="input-group">
            <label>Name</label>
            <input type="text" name="field" value={formData.field} onChange={handleInputChange} required />
          </div>

          <div className="input-group">
            <label>Code</label>
            <input type="number" name="code" value={formData.code || ''} onChange={handleInputChange} required />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#a3a3a3' }}>Thumbnail Preview</label>
            <div style={{ minHeight: '120px', background: '#000', borderRadius: '8px', border: '1px dashed #333', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '0.5rem' }}>
              {isFetchingThumb ? (
                <span style={{ color: '#666' }}>Extracting...</span>
              ) : previewUrl ? (
                <img src={previewUrl} alt="Preview" style={{ width: '100%', height: 'auto', display: 'block' }} />
              ) : (
                <span style={{ color: '#666' }}>Enter URL or upload custom image</span>
              )}
            </div>

            <div style={{ fontSize: '0.8rem', color: '#888' }}>
              Custom Image File (optional):
              <input type="file" accept="image/*" onChange={handleFileChange} style={{ marginTop: '0.25rem', color: '#ccc', width: '100%' }} />
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
    </div>
  );
}
