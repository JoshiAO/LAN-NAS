document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    lucide.createIcons();

    fetchStats();
    fetchUsers();
    fetchFiles();

    // Setup Create User form
    document.getElementById('create-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;
        
        try {
            const res = await fetch(`/auth/register?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`, {
                method: 'POST'
            });
            if (res.ok) {
                document.getElementById('new-username').value = '';
                document.getElementById('new-password').value = '';
                fetchUsers();
                fetchStats();
                alert('User created successfully!');
            } else {
                const data = await res.json();
                alert(`Error: ${data.detail}`);
            }
        } catch (err) {
            alert('Failed to create user.');
        }
    });

    // Auto-refresh stats every 5 seconds
    setInterval(() => {
        fetchStats();
        fetchUsers();
        fetchFiles();
    }, 5000);
});

async function fetchStats() {
    try {
        const res = await fetch('/admin/stats');
        const data = await res.json();
        
        document.getElementById('stat-users').innerText = data.user_count;
        document.getElementById('stat-files').innerText = data.file_count;
        
        const mbs = (data.storage_used_bytes / (1024 * 1024)).toFixed(2);
        document.getElementById('stat-storage').innerText = `${mbs} MB`;
    } catch (err) {
        console.error("Failed to fetch stats", err);
    }
}

async function fetchUsers() {
    try {
        const res = await fetch('/auth/users');
        const users = await res.json();
        
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = '';
        
        users.forEach(u => {
            const tr = document.createElement('tr');
            const mb = (u.storage_used / (1024 * 1024)).toFixed(2);
            tr.innerHTML = `
                <td>${u.id}</td>
                <td><strong>${u.username}</strong></td>
                <td>${mb} MB</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-primary" onclick="editUser(${u.id}, '${u.username}')">Edit</button>
                        <button class="btn-danger" onclick="deleteUser(${u.id}, '${u.username}')">Delete</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Failed to fetch users", err);
    }
}

async function editUser(id, oldUsername) {
    const newUsername = prompt(`Enter new username for ${oldUsername}:`, oldUsername);
    if (newUsername === null) return; // cancelled
    
    const newPassword = prompt(`Enter new password (leave blank to keep current):`);
    if (newPassword === null) return; // cancelled
    
    const payload = {};
    if (newUsername.trim() !== '' && newUsername !== oldUsername) {
        payload.username = newUsername.trim();
    }
    if (newPassword.trim() !== '') {
        payload.password = newPassword;
    }
    
    if (Object.keys(payload).length === 0) {
        return; // nothing to update
    }
    
    try {
        const res = await fetch(`/auth/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            fetchUsers();
            alert('User updated successfully!');
        } else {
            const data = await res.json();
            alert(`Error: ${data.detail}`);
        }
    } catch (err) {
        alert("Failed to edit user");
    }
}

async function deleteUser(id, username) {
    if (!confirm(`Are you sure you want to delete ${username}? This will wipe all their synced files!`)) return;
    
    try {
        await fetch(`/auth/users/${id}`, { method: 'DELETE' });
        fetchUsers();
        fetchStats();
        fetchFiles();
    } catch (err) {
        alert("Failed to delete user");
    }
}

async function fetchFiles() {
    try {
        const res = await fetch('/admin/files');
        const data = await res.json();
        
        const tbody = document.querySelector('#files-table tbody');
        tbody.innerHTML = '';
        
        data.files.forEach(f => {
            const tr = document.createElement('tr');
            const kb = (f.size / 1024).toFixed(1);
            tr.innerHTML = `
                <td>${f.id}</td>
                <td>Owner ID: ${f.owner_id}</td>
                <td style="font-family: monospace;">${f.filepath}</td>
                <td>${kb} KB</td>
                <td>${f.is_locked ? '<span style="color:var(--warning)">Locked</span>' : '<span style="color:var(--success)">Unlocked</span>'}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error("Failed to fetch files", err);
    }
}
