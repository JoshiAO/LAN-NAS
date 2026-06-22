const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(require('os').homedir(), '.lannas_client');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'sync_state.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS local_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filepath TEXT UNIQUE NOT NULL,
    file_hash TEXT,
    last_modified INTEGER,
    sync_status TEXT DEFAULT 'pending' -- 'synced', 'pending', 'error'
  );

  CREATE TABLE IF NOT EXISTS server_info (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

function updateFileState(filepath, fileHash, modifiedTime, status = 'pending') {
  const stmt = db.prepare(`
    INSERT INTO local_files (filepath, file_hash, last_modified, sync_status) 
    VALUES (?, ?, ?, ?)
    ON CONFLICT(filepath) DO UPDATE SET 
      file_hash=excluded.file_hash, 
      last_modified=excluded.last_modified,
      sync_status=excluded.sync_status
  `);
  stmt.run(filepath, fileHash, modifiedTime, status);
}

function getFileState(filepath) {
  const stmt = db.prepare('SELECT * FROM local_files WHERE filepath = ?');
  return stmt.get(filepath);
}

function removeFileState(filepath) {
  const stmt = db.prepare('DELETE FROM local_files WHERE filepath = ?');
  stmt.run(filepath);
}

function clearAllState() {
  const stmt = db.prepare('DELETE FROM local_files');
  stmt.run();
}

module.exports = {
  db,
  updateFileState,
  getFileState,
  removeFileState,
  clearAllState
};
