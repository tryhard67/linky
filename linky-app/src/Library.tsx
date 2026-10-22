import { useState, useEffect, useRef, useCallback } from 'react';
import PocketBase from 'pocketbase';
import { type Doujin } from './types';

interface Props {
  pb: PocketBase;
  userId?: string;
  onEdit: (item: Doujin) => void;
  refreshTrigger: number;
}

export default function Library({ pb, userId, onEdit, refreshTrigger }: Props) {
  const [doujins, setDoujins] = useState<Doujin[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);

  const [itemToDelete, setItemToDelete] = useState<Doujin | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [mobileCols, setMobileCols] = useState<'1' | '2'>(() => {
    try {
      const saved = localStorage.getItem('linky_mobile_cols');
      return saved === '2' ? '2' : '1';
    } catch {
      return '1';
    }
  });

  const handleToggleMobileCols = (cols: '1' | '2') => {
    setMobileCols(cols);
    try {
      localStorage.setItem('linky_mobile_cols', cols);
    } catch {}
  };

  const fetchPage = async (pageToFetch: number, isRefresh: boolean = false) => {
    if (loading) return;
    setLoading(true);
    try {
      // Filter by current logged in user if available
      const filterStr = userId ? `user = "${userId}"` : '';
      const res = await pb.collection<Doujin>('doujins').getList(pageToFetch, 20, {
        sort: '-created',
        filter: filterStr,
        $autoCancel: false 
      });
      
      setDoujins(prev => isRefresh ? res.items : [...prev, ...res.items]);
      setHasMore(res.page < res.totalPages);
    } catch (err: any) {
      if (!err.isAbort) {
        console.error("Failed to load library", err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchPage(1, true);
  }, [pb, refreshTrigger]); // Reload when refreshTrigger changes

  const lastElementRef = useCallback((node: HTMLDivElement) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        const nextPage = page + 1;
        setPage(nextPage);
        fetchPage(nextPage);
      }
    });
    
    if (node) observer.current.observe(node);
  }, [loading, hasMore, page]);

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await pb.collection('doujins').delete(itemToDelete.id);
      setDoujins(prev => prev.filter(d => d.id !== itemToDelete.id));
      setItemToDelete(null);
    } catch (err: any) {
      console.error(err);
      setDeleteError(err.message || 'Failed to delete record');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="library-container">
      <div className="library-toolbar">
        <div className="library-info">
          {doujins.length > 0 && (
            <span className="library-count-badge">{doujins.length} items</span>
          )}
        </div>
        <div className="library-view-switcher">
          <span className="switcher-label">View:</span>
          <div className="switcher-group">
            <button
              type="button"
              className={`switcher-btn ${mobileCols === '1' ? 'active' : ''}`}
              onClick={() => handleToggleMobileCols('1')}
              title="Single column"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              <span>1 Col</span>
            </button>
            <button
              type="button"
              className={`switcher-btn ${mobileCols === '2' ? 'active' : ''}`}
              onClick={() => handleToggleMobileCols('2')}
              title="Double column"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="8" height="18" rx="1.5" />
                <rect x="13" y="3" width="8" height="18" rx="1.5" />
              </svg>
              <span>2 Col</span>
            </button>
          </div>
        </div>
      </div>

      <div className={`library-grid ${mobileCols === '2' ? 'cols-2' : 'cols-1'}`}>
        {doujins.map((item, index) => {
          const isLast = index === doujins.length - 1;
          const imgUrl = item.thumb ? `${import.meta.env.VITE_POCKETBASE_URL}/api/files/${item.collectionId}/${item.id}/${item.thumb}` : null;
          
          return (
            <div key={item.id} className="library-item" ref={isLast ? lastElementRef : null}>
              <a href={item.nhurl} target="_blank" rel="noreferrer" className="library-item-link">
                <div className="library-thumb-wrapper">
                  {imgUrl ? (
                    <img src={imgUrl} alt={item.field} loading="lazy" className="library-thumb-img" />
                  ) : (
                    <div className="library-no-thumb">
                      <span style={{ fontSize: '1.5rem' }}>🖼️</span>
                      <span>No Thumbnail</span>
                    </div>
                  )}
                  {item.code ? (
                    <span className="library-code-badge">#{item.code}</span>
                  ) : null}
                </div>
                <div className="library-item-content">
                  <div className="library-item-title" title={item.field || 'Untitled'}>
                    {item.field || 'Untitled'}
                  </div>
                  <div className="library-item-meta">
                    <span className="library-source-badge">
                      {item.nhurl.includes('youtube') || item.nhurl.includes('youtu.be') ? '▶ YouTube' : item.nhurl.includes('nhentai') ? '📖 nhentai' : '🔗 Link'}
                    </span>
                  </div>
                </div>
              </a>
              
              {userId && (
                <div className="library-item-actions">
                  <button 
                    type="button"
                    onClick={() => onEdit(item)} 
                    className="btn card-btn"
                  >
                    Edit
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setItemToDelete(item); setDeleteError(''); }} 
                    className="btn btn-danger card-btn"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {loading && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>Loading more...</div>
      )}
      {!hasMore && doujins.length > 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>No more items</div>
      )}

      {/* In-Browser Delete Confirmation Modal */}
      {itemToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, padding: '1rem' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', boxSizing: 'border-box' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.3rem' }}>Confirm Delete</h2>
            {deleteError && <div className="error-message">{deleteError}</div>}
            
            <p style={{ color: '#ccc', fontSize: '0.95rem', lineHeight: '1.5' }}>
              Are you sure you want to delete <strong style={{ color: '#fff' }}>"{itemToDelete.field || 'Untitled'}"</strong>?
            </p>
            <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              Code: {itemToDelete.code} &bull; This action cannot be undone.
            </p>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.75rem' }}>
              <button 
                type="button" 
                onClick={confirmDelete} 
                disabled={isDeleting} 
                className="btn btn-danger" 
                style={{ flex: 1 }}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
              <button 
                type="button" 
                onClick={() => { setItemToDelete(null); setDeleteError(''); }} 
                disabled={isDeleting} 
                className="btn" 
                style={{ flex: 1 }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
