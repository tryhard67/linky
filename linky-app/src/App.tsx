import { useState, useEffect } from 'react';
import PocketBase, { type AuthModel } from 'pocketbase';
import Library from './Library';
import DoujinsManager from './DoujinsManager';
import { type Doujin } from './types';
import './index.css';

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL);

function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(pb.authStore.isValid);
  const [user, setUser] = useState<AuthModel | null>(pb.authStore.model);
  const [error, setError] = useState('');
  
  const [showLogin, setShowLogin] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Doujin | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    return pb.authStore.onChange((token, model) => {
      setIsLoggedIn(pb.authStore.isValid);
      setUser(model);
      if (pb.authStore.isValid) setShowLogin(false);
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await pb.collection('users').authWithPassword(username, password);
      setUsername('');
      setPassword('');
    } catch (err: any) {
      setError('Failed to login. Please check credentials.');
    }
  };

  const handleLogout = () => {
    pb.authStore.clear();
  };

  const handleEdit = (item: Doujin) => {
    setEditingItem(item);
    setShowForm(true);
  };

  return (
    <div>
      <header style={{ padding: '1.5rem', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Library</h1>
        <div>
          {isLoggedIn ? (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span style={{ color: '#a3a3a3', fontSize: '0.875rem' }}>{user?.username}</span>
              <button onClick={() => { setEditingItem(null); setShowForm(true); }} className="btn" style={{ padding: '0.5rem 1rem' }}>+ Add</button>
              <button onClick={handleLogout} className="btn btn-danger" style={{ padding: '0.5rem 1rem' }}>Logout</button>
            </div>
          ) : (
            <button onClick={() => setShowLogin(true)} className="btn btn-danger" style={{ padding: '0.5rem 1rem' }}>Admin Login</button>
          )}
        </div>
      </header>

      <main>
        {/* The Landing Page is the Library */}
        <Library pb={pb} userId={user?.id} onEdit={handleEdit} refreshTrigger={refreshTrigger} />
      </main>

      {/* Login Modal */}
      {showLogin && !isLoggedIn && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '400px' }}>
            <h2 style={{ margin: '0 0 2rem 0', textAlign: 'center' }}>Admin Login</h2>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleLogin}>
              <div className="input-group">
                <label>Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="submit" className="btn" style={{ flex: 1 }}>Login</button>
                <button type="button" onClick={() => setShowLogin(false)} className="btn btn-danger" style={{ flex: 1 }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && isLoggedIn && (
        <DoujinsManager 
          pb={pb} 
          userId={user.id} 
          itemToEdit={editingItem}
          onClose={() => {
            setShowForm(false);
            setEditingItem(null);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditingItem(null);
            setRefreshTrigger(prev => prev + 1); // Trigger library reload
          }}
        />
      )}
    </div>
  );
}

export default App;
