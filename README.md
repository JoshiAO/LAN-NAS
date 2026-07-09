
<h1 align="center">
  LAN-NAS
</h1>

<h4 align="center">A zero-configuration, self-hosted Local Area Network Attached Storage and File Synchronization engine.</h4>

<p align="center">
  <a href="#key-features">Key Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#installation--usage">Installation & Usage</a> •
  <a href="#technologies-used">Technologies Used</a>
</p>

<table>
  <tr>
    <td><img height="400" alt="Server Dashboard" src="https://github.com/user-attachments/assets/49cd9514-baf5-422d-a8f6-6f4c4afc487b" /></td>
    <td><img height="400" alt="Client Dashboard" src="https://github.com/user-attachments/assets/831e1308-a63a-4873-9795-04b3bd12e93b" /></td>
    <td><img height="400" alt="Client Connecting" src="https://github.com/user-attachments/assets/f0f01abf-9576-4acd-9201-329b464163b4" /></td>
  </tr>
</table>

**LAN-NAS** is a fully automated, bi-directional file synchronization system built to seamlessly mimic cloud storage experiences (like Google Drive or Dropbox) but entirely localized to your own physical network. It ensures absolute data privacy, rapid transfer speeds over LAN, and requires zero IP configuration to connect clients to the server.

This project was built from the ground up to demonstrate a full-stack, distributed architecture involving real-time file system watchers, multi-cast DNS network discovery, binary compilation, and a system-integrated desktop client.

---

## Key Features

* **Zero-Config Network Discovery**: Uses **mDNS (Bonjour/Avahi)** to broadcast the server's presence. Clients automatically discover the server on the LAN without any manual IP address entry.
* **Real-time Background Sync**: Built with `chokidar`, the client watches local folders for changes (additions, modifications, deletions) and syncs them instantly over REST and WebSockets.
* **Standalone Server Executable**: The entire Python backend, database, and HTML/CSS Admin Dashboard are compiled into a single, highly portable `.exe` file using PyInstaller.
* **Admin Dashboard**: A responsive, embedded web dashboard running directly from the server executable, providing live metrics on storage usage, connected users, and file statuses.
* **System Integration**: The Electron client integrates natively with Windows, featuring a System Tray icon for background operation and dynamic custom `.ico` tagging of synchronized directories in Windows File Explorer.
* **Multi-Tenant Architecture**: Supports multiple authenticated users, each with their own isolated storage silo and JWT-secured access tokens.

## Architecture

LAN-NAS is divided into two distinct components that communicate securely over the local network:

1. **The Server (FastAPI / SQLite)**
   - Acts as the central source of truth.
   - Manages an embedded SQLite database storing user credentials and file metadata.
   - Hosts a static Admin Dashboard that is dynamically unpacked at runtime.
   - Broadcasts its IP and Port via mDNS.
   - Exposes RESTful endpoints for file uploads/downloads and WebSockets for real-time status bridging.

2. **The Client (Electron / React / Vite)**
   - A background-first desktop application.
   - Uses `bonjour-service` to listen for the server's broadcast and establish a connection.
   - Provides a React-based UI to log in and select a local directory to sync.
   - Injects custom `desktop.ini` rules into the user's filesystem to visually brand the synced folder.
   - Minimizes to the System Tray to maintain continuous file synchronization without cluttering the taskbar.

## How It Works

1. **Discovery**: When the `LAN-NAS-Server.exe` starts, it binds to `0.0.0.0` and registers a multi-cast DNS service (`_http._tcp.local`). 
2. **Handshake**: The Electron client boots up, listens for the mDNS broadcast, extracts the Server's IP address, and automatically points its API requests to the discovered host.
3. **Authentication**: The user logs in. The server hashes the password with `bcrypt`, verifies it, and issues a JWT token.
4. **Sync Loop**: The client registers a file watcher on the selected folder. 
   - When a file is created or edited, it is hashed (SHA-256) and streamed to the server.
   - If the server has a newer version, the client downloads it.
   - Deletions are mirrored to preserve state parity.
5. **Persistence**: The client can be "closed" by the user but will intercept the OS close event and hide in the System Tray, ensuring uninterrupted background syncing.

## Installation & Usage

### Running the Server
The server has been bundled into a standalone executable. No Python installation is required for deployment!
1. Navigate to `server/dist/`.
2. Double-click `LAN-NAS-Server.exe`.
3. The server will launch in a terminal window, and automatically open your default web browser to the Admin Dashboard (`http://localhost:8000`).

*(To build from source: `pip install -r requirements.txt` then `uvicorn main:app`)*

### Running the Client
The client requires Node.js to run in development mode.
1. Navigate to the `client/` directory.
2. Run `npm install` to install dependencies.
3. Run `npm start` to boot the Electron app.
4. The client will automatically find the running server. Log in, pick a folder, and watch it sync!

## Technologies Used

### Backend (Server)
- **FastAPI**: High-performance asynchronous API framework.
- **SQLAlchemy & SQLite**: ORM and embedded database for zero-setup data persistence.
- **Uvicorn**: ASGI web server.
- **PyInstaller**: Cross-platform compilation into a single binary.
- **zeroconf**: Python mDNS implementation.
- **Passlib/Bcrypt**: Industry-standard cryptographic hashing.

### Frontend (Client)
- **Electron**: Native desktop application framework.
- **React & Vite**: Lightning-fast UI rendering and bundling.
- **Chokidar**: High-performance file system watcher.
- **Bonjour-service**: Node.js mDNS network discovery.
- **Vanilla CSS & HTML**: Lightweight, highly custom Admin Dashboard design.

## License

**All Rights Reserved.**

This repository and its source code are the proprietary property of the author. It is published publicly strictly for educational and portfolio review purposes. You may not copy, reproduce, distribute, compile, or utilize this software for any personal or commercial purposes without explicit written consent from the author. 

Please see the `LICENSE` file for more details.

---
*Built as a showcase of modern full-stack development, distributed systems, and localized network engineering.*
