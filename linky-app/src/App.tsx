import { useState, useEffect } from 'react';
import PocketBase, { AuthModel } from 'pocketbase';
import './index.css';

const pb = new PocketBase('https://drawing.pockethost.io');

function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(pb.authStore.isValid);
  const [user, setUser] = useState<AuthModel | null>(pb.authStore.model);
  const [error, setError] = useState('');

  useEffect(() => {
    // Listen to changes in the auth store
    return pb.authStore.onChange((token, model) => {
      setIsLoggedIn(pb.authStore.isValid);
      setUser(model);
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
      console.error(err);
      setError('Failed to login. Please check your credentials.');
    }
  };

  const handleLogout = () => {
    pb.authStore.clear();
  };

  if (isLoggedIn) {
    return (
      <div className="glass-panel">
        <h1 style={{ margin: '0 0 1rem 0', fontSize: '1.5rem' }}>Welcome Back! 👋</h1>
        <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
          You are logged in as: <strong style={{ color: 'white' }}>{user?.username || user?.email}</strong>
        </p>
        
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', marginBottom: '2rem', fontSize: '0.875rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#94a3b8' }}>Auth Debug Info</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', wordBreak: 'break-all' }}>
            <div><strong style={{ color: '#cbd5e1' }}>Token:</strong> {pb.authStore.token.substring(0, 20)}...</div>
            <div><strong style={{ color: '#cbd5e1' }}>User ID:</strong> {pb.authStore.model?.id}</div>
            <div><strong style={{ color: '#cbd5e1' }}>isValid:</strong> {String(pb.authStore.isValid)}</div>
          </div>
        </div>

        <button onClick={handleLogout} className="btn" style={{ background: '#ef4444' }}>
          Log Out
        </button>
      </div>
    );
  }

  return (
    <div className="glass-panel">
      <h1 style={{ margin: '0 0 2rem 0', textAlign: 'center', fontSize: '1.75rem' }}>Login</h1>
      
      {error && <div className="error-message">{error}</div>}
      
      <form onSubmit={handleLogin}>
        <div className="input-group">
          <label>Username or Email</label>
          <input 
            type="text" 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required 
            placeholder="Enter your username"
          />
        </div>
        
        <div className="input-group">
          <label>Password</label>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required 
            placeholder="••••••••"
          />
        </div>
        
        <button type="submit" className="btn" style={{ marginTop: '1rem' }}>
          Sign In
        </button>
      </form>
    </div>
  );
}

export default App;
