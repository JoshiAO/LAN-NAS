import { useState, useEffect } from 'react';
import { FolderSync, Server, Activity, FileLock2, UploadCloud, CheckCircle2, Lock, User } from 'lucide-react';
import './App.css';

// @ts-ignore
const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;

function App() {
  const [folderPath, setFolderPath] = useState('');
  const [status, setStatus] = useState('Disconnected');
  const [events, setEvents] = useState<{type: string, path: string}[]>([]);
  const [serverUrl, setServerUrl] = useState('Searching for server...');
  const [isFolderLocked, setIsFolderLocked] = useState(false);
  
  const [filesSynced, setFilesSynced] = useState(0);
  const [lockedFiles, setLockedFiles] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState('Never');
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.on('server-found', (_event: any, url: string) => setServerUrl(url));
      ipcRenderer.on('watch-status', (_event: any, msg: string) => setStatus(msg));
      ipcRenderer.on('file-event', (_event: any, data: any) => {
        setEvents(prev => [{...data, time: new Date().toLocaleTimeString()}, ...prev].slice(0, 10));
      });
      ipcRenderer.send('get-server-url');
    }
  }, []);

  useEffect(() => {
    if (serverUrl.startsWith('http') && !isLoggedIn) {
      const savedUser = localStorage.getItem('lannas_user');
      const savedPass = localStorage.getItem('lannas_pass');
      const savedFolder = localStorage.getItem('lannas_sync_folder');
      
      if (savedUser && savedPass) {
        const authBody = new URLSearchParams({
          grant_type: 'password',
          username: savedUser,
          password: savedPass
        });
        fetch(`${serverUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: authBody
        }).then(res => {
          if (res.ok) return res.json();
          throw new Error('Invalid auto-login');
        }).then(data => {
          localStorage.setItem('lannas_token', data.access_token);
          setUsername(savedUser);
          setPassword(savedPass);
          setIsLoggedIn(true);
          
          if (savedFolder && ipcRenderer) {
            setFolderPath(savedFolder);
            setIsFolderLocked(true);
            ipcRenderer.send('start-watch', { folderPath: savedFolder, username: savedUser, password: savedPass });
          }
        }).catch(err => {
          console.error('Auto login failed', err);
          localStorage.removeItem('lannas_user');
          localStorage.removeItem('lannas_pass');
        });
      }
    }
  }, [serverUrl, isLoggedIn]);

  useEffect(() => {
    let interval: any;
    if (isLoggedIn && serverUrl.startsWith('http')) {
      const fetchStats = async () => {
        try {
          const token = localStorage.getItem('lannas_token');
          if (!token) return;
          const res = await fetch(`${serverUrl}/metadata`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setFilesSynced(data.metadata.length);
            setLockedFiles(data.metadata.filter((f: any) => f.is_locked).length);
            setLastSyncTime(new Date().toLocaleTimeString());
          }
        } catch (e) {
          console.error("Failed to fetch stats", e);
        }
      };
      
      fetchStats();
      interval = setInterval(fetchStats, 5000);
    }
    return () => clearInterval(interval);
  }, [isLoggedIn, serverUrl]);

  const handleStartSync = () => {
    if (!folderPath) return alert('Please enter a folder path');
    localStorage.setItem('lannas_sync_folder', folderPath);
    setIsFolderLocked(true);
    if (ipcRenderer) {
      ipcRenderer.send('start-watch', { folderPath, username, password });
    } else {
      setStatus(`Watching: ${folderPath} (Mocked in Browser)`);
    }
  };

  const handleStopSync = () => {
    if (ipcRenderer) {
      ipcRenderer.send('stop-watch');
    } else {
      setStatus('Disconnected');
    }
  };

  const handleBrowse = async () => {
    if (ipcRenderer) {
      const result = await ipcRenderer.invoke('open-directory-dialog');
      if (!result.canceled && result.filePaths.length > 0) {
        setFolderPath(result.filePaths[0]);
      }
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('lannas_user');
    localStorage.removeItem('lannas_pass');
    localStorage.removeItem('lannas_token');
    localStorage.removeItem('lannas_sync_folder');
    setIsLoggedIn(false);
    setIsFolderLocked(false);
    setFolderPath('');
    handleStopSync();
    if (ipcRenderer) {
      ipcRenderer.send('clear-local-db');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return alert('Please fill in both fields');
    if (!serverUrl.startsWith('http')) return alert('Wait for server connection first');
    
    try {
      const authBody = new URLSearchParams({
        grant_type: 'password',
        username: username,
        password: password
      });
      const res = await fetch(`${serverUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: authBody
      });
      
      if (!res.ok) {
        throw new Error('Invalid username or password');
      }
      
      const data = await res.json();
      localStorage.setItem('lannas_token', data.access_token);
      localStorage.setItem('lannas_user', username);
      localStorage.setItem('lannas_pass', password);
      setIsLoggedIn(true);
      
      if (folderPath) {
        handleStartSync();
      }
    } catch (err: any) {
      alert(err.message || 'Login failed');
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="app-container login-container">
        <div className="login-card">
          <FolderSync size={48} color="#4F46E5" className="login-icon" />
          <h2>LAN-NAS Login</h2>
          <p>Sign in to sync your local files</p>
          <form onSubmit={handleLogin} className="login-form">
            <div className="input-group-vertical">
              <User size={18} />
              <input 
                type="text" 
                placeholder="Username" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                required 
              />
            </div>
            <div className="input-group-vertical">
              <Lock size={18} />
              <input 
                type="password" 
                placeholder="Password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
              />
            </div>
            <button type="submit" className="btn-primary w-full">Sign In / Register</button>
          </form>
          <p className="login-footer">Server: {serverUrl}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <FolderSync size={28} color="#4F46E5" />
          <h1>LAN-NAS Sync</h1>
        </div>
        <div className="header-right">
          <div className="status-badge">
            <Server size={16} />
            <span>Server: {serverUrl}</span>
          </div>
          <div className="user-badge" onClick={handleLogout} title="Click to logout">
            <User size={16} />
            <span>{username}</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <section className="control-panel card">
          <h2>Local Folder Configuration</h2>
          <div className="input-group">
            {isFolderLocked ? (
              <div className="locked-folder-display" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-color)', padding: '0.5rem 1rem', borderRadius: '6px', flex: 1, border: '1px solid var(--border-color)'}}>
                <Lock size={16} color="var(--primary-color)" />
                <span style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.9rem' }}>{folderPath}</span>
                <button className="btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => {
                  if (confirm('Are you sure you want to change the sync folder? This will stop syncing the current folder.')) {
                      localStorage.removeItem('lannas_sync_folder');
                      setIsFolderLocked(false);
                      handleStopSync();
                      if (ipcRenderer) {
                        ipcRenderer.send('clear-local-db');
                      }
                  }
                }}>Change Folder</button>
              </div>
            ) : (
              <>
                <input 
                  type="text" 
                  placeholder="e.g. C:\Users\User\Documents\SyncFolder"
                  value={folderPath}
                  onChange={e => setFolderPath(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn-secondary" onClick={handleBrowse}>Browse...</button>
                <button className="btn-primary" onClick={handleStartSync}>Start Sync</button>
              </>
            )}
            {isFolderLocked && (
              status.includes('Watching') ? (
                <button className="btn-secondary" onClick={handleStopSync}>Stop</button>
              ) : (
                <button className="btn-primary" onClick={handleStartSync}>Start Sync</button>
              )
            )}
          </div>
          <div className="status-indicator">
            <Activity size={18} color={status.includes('Watching') ? '#10B981' : '#6B7280'} />
            <span>Status: <strong>{status}</strong></span>
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="card stat-card">
            <UploadCloud size={24} color="#3B82F6" />
            <div className="stat-info">
              <h3>Files Synced</h3>
              <p>{filesSynced}</p>
            </div>
          </div>
          <div className="card stat-card">
            <CheckCircle2 size={24} color="#10B981" />
            <div className="stat-info">
              <h3>Last Sync</h3>
              <p>{lastSyncTime}</p>
            </div>
          </div>
          <div className="card stat-card">
            <FileLock2 size={24} color="#F59E0B" />
            <div className="stat-info">
              <h3>Locked Files</h3>
              <p>{lockedFiles}</p>
            </div>
          </div>
        </section>

        <section className="log-panel card">
          <h2>Recent Activity</h2>
          <ul className="event-list">
            {events.length === 0 ? (
              <li className="empty-state">No recent file events.</li>
            ) : (
              events.map((evt, i) => (
                <li key={i}>
                  <span className={`event-type ${evt.type}`}>{evt.type}</span>
                  <span className="event-path">{evt.path}</span>
                  <span className="event-time">{(evt as any).time}</span>
                </li>
              ))
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}

export default App;
