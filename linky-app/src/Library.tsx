import { useState, useEffect, useRef, useCallback } from 'react';
import PocketBase from 'pocketbase';
import { type Doujin } from './types';

function escapeFilterValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

type LibraryQuery = {
  category: string;
  favorites: boolean;
  animated: boolean;
  q: string;
  cols: '1' | '2';
};

function parseLibraryQuery(): LibraryQuery {
  const params = new URLSearchParams(window.location.search);
  const category = params.get('category') || 'all';
  const normalizedCategory = category === 'manga' || category === 'video' ? category : 'all';
  return {
    category: normalizedCategory,
    favorites: params.get('favorites') === '1',
    animated: params.get('animated') === '1' && normalizedCategory === 'video',
    q: params.get('q') ?? '',
    cols: params.get('cols') === '2' ? '2' : '1'
  };
}

function libraryQueryToSearch(query: LibraryQuery) {
  const params = new URLSearchParams();
  if (query.category !== 'all') params.set('category', query.category);
  if (query.favorites) params.set('favorites', '1');
  if (query.animated && query.category === 'video') params.set('animated', '1');
  if (query.q.trim()) params.set('q', query.q.trim());
  if (query.cols === '2') params.set('cols', '2');
  const qs = params.toString();
  return `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
}

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
  const [libraryQuery, setLibraryQuery] = useState<LibraryQuery>(() => parseLibraryQuery());
  const [searchInput, setSearchInput] = useState(() => parseLibraryQuery().q);
  const observer = useRef<IntersectionObserver | null>(null);
  const categoryFilter = userId ? libraryQuery.category : 'all';
  const favoritesOnly = Boolean(userId && libraryQuery.favorites);
  const animatedOnly = Boolean(userId && categoryFilter === 'video' && libraryQuery.animated);
  const searchQuery = userId ? libraryQuery.q.trim() : '';
  const hasActiveFilters = categoryFilter !== 'all' || favoritesOnly || animatedOnly || Boolean(searchQuery);

  const mobileCols = libraryQuery.cols;
  const [itemToDelete, setItemToDelete] = useState<Doujin | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const commitLibraryQuery = useCallback((next: LibraryQuery, mode: 'push' | 'replace') => {
    const normalized: LibraryQuery = {
      category: next.category === 'manga' || next.category === 'video' ? next.category : 'all',
      favorites: Boolean(next.favorites),
      animated: Boolean(next.animated) && next.category === 'video',
      q: next.q.trim(),
      cols: next.cols === '2' ? '2' : '1'
    };
    setLibraryQuery(normalized);
    const url = libraryQueryToSearch(normalized);
    if (mode === 'push') {
      window.history.pushState(normalized, '', url);
    } else {
      window.history.replaceState(normalized, '', url);
    }
  }, []);

  const handleToggleMobileCols = (cols: '1' | '2') => {
    if (cols === libraryQuery.cols) return;
    commitLibraryQuery({ ...libraryQuery, cols }, 'replace');
  };

  useEffect(() => {
    const onPopState = () => {
      const next = parseLibraryQuery();
      setLibraryQuery(next);
      setSearchInput(next.q);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.trim() === libraryQuery.q) return;
      commitLibraryQuery({ ...libraryQuery, q: searchInput }, 'replace');
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, libraryQuery, commitLibraryQuery]);

  const fetchPage = async (pageToFetch: number, isRefresh: boolean = false) => {
    if (loading) return;
    setLoading(true);
    try {
      const filters: string[] = [];
      if (userId) filters.push(`user = "${userId}"`);
      if (categoryFilter !== 'all') filters.push(`category = "${categoryFilter}"`);
      if (favoritesOnly) filters.push('isFavorite = true');
      if (animatedOnly) filters.push('isAnimated = true');
      if (userId && searchQuery) filters.push(`field ~ "${escapeFilterValue(searchQuery)}"`);
      const filterStr = filters.join(' && ');
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
    setDoujins([]);
    setHasMore(true);
    fetchPage(1, true);
  }, [pb, userId, refreshTrigger, categoryFilter, searchQuery, favoritesOnly, animatedOnly]);

  const handleCategoryChange = (cat: string) => {
    if (cat === categoryFilter) return;
    commitLibraryQuery({
      ...libraryQuery,
      category: cat,
      animated: cat === 'video' ? libraryQuery.animated : false
    }, 'push');
  };

  const handleToggleFavorites = () => {
    commitLibraryQuery({ ...libraryQuery, favorites: !favoritesOnly }, 'push');
  };

  const handleToggleAnimated = () => {
    commitLibraryQuery({
      ...libraryQuery,
      category: 'video',
      animated: !animatedOnly
    }, 'push');
  };

  const handleClearSearch = () => {
    setSearchInput('');
    commitLibraryQuery({ ...libraryQuery, q: '' }, 'replace');
  };

  const handleClearFilters = () => {
    setSearchInput('');
    commitLibraryQuery({ category: 'all', favorites: false, animated: false, q: '', cols: libraryQuery.cols }, 'push');
  };

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

  const handleToggleFavorite = (item: Doujin) => {
    if (!userId) return;
    const nextFavorite = !item.isFavorite;
    setDoujins(prev => {
      const updated = prev.map(d => d.id === item.id ? { ...d, isFavorite: nextFavorite } : d);
      if (favoritesOnly && !nextFavorite) {
        return updated.filter(d => d.id !== item.id);
      }
      return updated;
    });
    pb.collection('doujins').update(item.id, { isFavorite: nextFavorite }).catch((err) => {
      console.error('Failed to update favorite', err);
      setDoujins(prev => {
        const restored = prev.some(d => d.id === item.id)
          ? prev.map(d => d.id === item.id ? { ...d, isFavorite: item.isFavorite } : d)
          : [item, ...prev];
        return restored;
      });
    });
  };

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

  const categories = [
    { value: 'all', label: 'All' },
    { value: 'manga', label: '📖 Manga' },
    { value: 'video', label: '▶️ Video' }
  ];

  return (
    <div className="library-container">
      <div className="library-toolbar">
        <div className="library-info">
          {doujins.length > 0 && (
            <span className="library-count-badge">{doujins.length} items</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {userId && (
          <>
          <div className="library-search">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by title..."
              aria-label="Search by title"
            />
            {searchInput && (
              <button
                type="button"
                className="library-search-clear"
                onClick={handleClearSearch}
                aria-label="Clear search"
              >
                ✕
              </button>
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
          </>
          )}
        </div>
      </div>

      {userId && (
      <div className="category-filter">
        {categories.map(cat => (
          <button
            key={cat.value}
            type="button"
            className={`category-filter-btn ${categoryFilter === cat.value ? 'active' : ''}`}
            onClick={() => handleCategoryChange(cat.value)}
          >
            {cat.label}
          </button>
        ))}
        <button
          type="button"
          className={`category-filter-btn ${favoritesOnly ? 'active' : ''}`}
          onClick={handleToggleFavorites}
        >
          ⭐ Favorites
        </button>
        {categoryFilter === 'video' && (
          <button
            type="button"
            className={`category-filter-btn ${animatedOnly ? 'active' : ''}`}
            onClick={handleToggleAnimated}
          >
            ✨ Animated
          </button>
        )}
        {hasActiveFilters && (
          <button
            type="button"
            className="category-filter-btn clear-filters-btn"
            onClick={handleClearFilters}
          >
            Clear filters
          </button>
        )}
      </div>
      )}

      <div className={`library-grid ${mobileCols === '2' ? 'cols-2' : 'cols-1'}`}>
        {doujins.map((item, index) => {
          const isLast = index === doujins.length - 1;
          const imgUrl = item.thumb ? `${import.meta.env.VITE_POCKETBASE_URL}/api/files/${item.collectionId}/${item.id}/${item.thumb}` : null;
          
          return (
            <div key={item.id} className="library-item" ref={isLast ? lastElementRef : null}>
              {userId && (
                <button
                  type="button"
                  className={`favorite-btn ${item.isFavorite ? 'is-favorite' : ''}`}
                  onClick={() => handleToggleFavorite(item)}
                  title={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  aria-label={item.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                      fill={item.isFavorite ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
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
                  {item.isAnimated && (
                    <span className="library-animated-badge">✨ Animated</span>
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
                    {item.category && (
                      <span className="library-category-badge">
                        {item.category === 'manga' ? '📖' : item.category === 'doujinshi' ? '📕' : item.category === 'video' ? '▶️' : '🔗'} {item.category}
                      </span>
                    )}
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
      
      {loading && doujins.length === 0 && (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          padding: '4rem 2rem', 
          color: '#888',
          gap: '1rem'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            border: '3px solid rgba(255,255,255,0.1)',
            borderTopColor: '#fff',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <span style={{ fontSize: '0.9rem' }}>Loading your library...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {loading && doujins.length > 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>Loading more...</div>
      )}
      {userId && !loading && doujins.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#888' }}>
          {hasActiveFilters ? 'No items match your search.' : 'No items yet.'}
        </div>
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
