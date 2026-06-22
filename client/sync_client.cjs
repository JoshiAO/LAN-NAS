const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const FormData = require('form-data');
const { updateFileState, getFileState, removeFileState } = require('./db.cjs');

function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

class SyncClient {
  constructor(serverUrl, localFolder, token) {
    this.serverUrl = serverUrl;
    this.localFolder = localFolder;
    this.token = token;
    this.axios = axios.create({
      baseURL: this.serverUrl,
      headers: { Authorization: `Bearer ${this.token}` }
    });
  }

  async handleFileDelete(eventPath) {
    const relPath = path.relative(this.localFolder, eventPath).replace(/\\/g, '/');
    try {
      await this.axios.delete(`/delete?filepath=${encodeURIComponent(relPath)}`);
      removeFileState(relPath);
      console.log(`[SYNC] Deleted ${relPath} successfully.`);
    } catch (err) {
      console.error(`[SYNC] Error deleting ${relPath}:`, err.message);
    }
  }

  async handleFileChange(eventPath) {
    // Relative path to the synced folder
    const relPath = path.relative(this.localFolder, eventPath).replace(/\\/g, '/');
    if (!fs.existsSync(eventPath)) return; // File deleted (handle later)

    const stats = fs.statSync(eventPath);
    if (stats.isDirectory()) return;

    try {
      const fileHash = await getFileHash(eventPath);
      const localState = getFileState(relPath);

      if (localState && localState.file_hash === fileHash) {
        // No actual change
        return;
      }

      // 1. Request a lock on the server to prevent conflicts
      try {
        await this.axios.post(`/lock?filepath=${encodeURIComponent(relPath)}`);
      } catch (err) {
        if (err.response && err.response.status === 403) {
          console.error(`[SYNC] Conflict: File ${relPath} is locked by another user!`);
          return;
        }
        throw err;
      }

      // 2. Upload file
      const form = new FormData();
      form.append('filepath', relPath);
      form.append('file', fs.createReadStream(eventPath));

      const res = await this.axios.post('/upload', form, {
        headers: form.getHeaders()
      });

      // 3. Update local state
      updateFileState(relPath, fileHash, stats.mtimeMs, 'synced');
      console.log(`[SYNC] Uploaded ${relPath} successfully.`);

      // 4. Unlock file
      await this.axios.post(`/unlock?filepath=${encodeURIComponent(relPath)}`);

    } catch (err) {
      console.error(`[SYNC] Error syncing ${relPath}:`, err.message);
      updateFileState(relPath, null, stats.mtimeMs, 'error');
    }
  }
}

module.exports = { SyncClient };
