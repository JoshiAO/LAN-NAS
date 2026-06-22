import os
import sys
import shutil
# pyrefly: ignore [missing-import]
import uvicorn
import multiprocessing
import hashlib
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
# pyrefly: ignore [missing-import]
from fastapi.responses import FileResponse
# pyrefly: ignore [missing-import]
from fastapi.staticfiles import StaticFiles
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import datetime
from contextlib import asynccontextmanager

import models
import auth
from database import engine, get_db
from mdns_discovery import MDNSManager

# Create database tables
models.Base.metadata.create_all(bind=engine)

mdns_manager = MDNSManager(port=8000)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await mdns_manager.start()
    yield
    await mdns_manager.stop()

app = FastAPI(title="LAN-NAS Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Basic echo/ping pong
    except WebSocketDisconnect:
        manager.disconnect(websocket)

app.include_router(auth.router)

STORAGE_DIR = "./.lannas_storage"
if not os.path.exists(STORAGE_DIR):
    os.makedirs(STORAGE_DIR)

app.mount("/static", StaticFiles(directory=get_resource_path("static")), name="static_assets")

def get_file_hash(filepath: str) -> str:
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        buf = f.read(65536)
        while len(buf) > 0:
            hasher.update(buf)
            buf = f.read(65536)
    return hasher.hexdigest()

@app.get("/")
def read_root():
    static_index = os.path.join(get_resource_path("static"), "index.html")
    if os.path.exists(static_index):
        return FileResponse(static_index)
    return {"status": "LAN-NAS Server is running"}

@app.get("/admin/stats")
def get_admin_stats(db: Session = Depends(get_db)):
    user_count = db.query(models.User).count()
    file_count = db.query(models.FileMetadata).count()
    locked_count = db.query(models.FileMetadata).filter(models.FileMetadata.is_locked == True).count()
    total_size_result = db.query(models.FileMetadata.size).all()
    size_bytes = sum([s[0] for s in total_size_result if s[0]])
    return {
        "user_count": user_count,
        "file_count": file_count,
        "locked_count": locked_count,
        "storage_used_bytes": size_bytes
    }

@app.get("/admin/files")
def get_admin_files(db: Session = Depends(get_db)):
    files = db.query(models.FileMetadata).all()
    result = []
    for f in files:
        result.append({
            "id": f.id,
            "filename": f.filename,
            "filepath": f.filepath,
            "size": f.size,
            "is_locked": f.is_locked,
            "owner_id": f.owner_id
        })
    return {"files": result}

@app.post("/upload")
async def upload_file(
    filepath: str = Form(...),
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Check if file is locked by someone else
    db_file = db.query(models.FileMetadata).filter(
        models.FileMetadata.filepath == filepath,
        models.FileMetadata.owner_id == current_user.id
    ).first()
    if db_file and db_file.is_locked and db_file.locked_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="File is currently locked by another user")

    physical_path = os.path.join(STORAGE_DIR, current_user.username, filepath)
    os.makedirs(os.path.dirname(physical_path), exist_ok=True)
    
    with open(physical_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    file_size = os.path.getsize(physical_path)
    file_hash = get_file_hash(physical_path)
    
    if db_file:
        db_file.size = file_size
        db_file.file_hash = file_hash
        db_file.version += 1
        db_file.last_modified = datetime.utcnow()
        # If user uploaded, we can assume they're done. Let's auto-unlock or keep it? We'll keep it as is for now.
    else:
        db_file = models.FileMetadata(
            filename=file.filename,
            filepath=filepath,
            size=file_size,
            file_hash=file_hash,
            owner_id=current_user.id
        )
        db.add(db_file)
        
    db.commit()
    db.refresh(db_file)
    return {"message": "File uploaded successfully", "version": db_file.version}

@app.get("/download")
async def download_file(
    filepath: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_file = db.query(models.FileMetadata).filter(
        models.FileMetadata.filepath == filepath,
        models.FileMetadata.owner_id == current_user.id
    ).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
        
    physical_path = os.path.join(STORAGE_DIR, current_user.username, filepath)
    if not os.path.exists(physical_path):
        raise HTTPException(status_code=404, detail="Physical file missing")
        
    return FileResponse(physical_path, filename=db_file.filename)

@app.get("/metadata")
def get_metadata(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    files = db.query(models.FileMetadata).filter(models.FileMetadata.owner_id == current_user.id).all()
    return {"files": files}

@app.post("/lock")
def lock_file(
    filepath: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_file = db.query(models.FileMetadata).filter(
        models.FileMetadata.filepath == filepath,
        models.FileMetadata.owner_id == current_user.id
    ).first()
    if not db_file:
        # Create a placeholder locked file
        db_file = models.FileMetadata(
            filename=os.path.basename(filepath),
            filepath=filepath,
            size=0,
            file_hash="",
            owner_id=current_user.id,
            is_locked=True,
            locked_by_id=current_user.id
        )
        db.add(db_file)
        db.commit()
        return {"message": "New file locked successfully"}
        
    if db_file.is_locked and db_file.locked_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="File already locked by another user")
        
    db_file.is_locked = True
    db_file.locked_by_id = current_user.id
    db.commit()
    return {"message": "File locked successfully"}

@app.post("/unlock")
def unlock_file(
    filepath: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_file = db.query(models.FileMetadata).filter(
        models.FileMetadata.filepath == filepath,
        models.FileMetadata.owner_id == current_user.id
    ).first()
    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")
        
    if db_file.is_locked and db_file.locked_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot unlock a file locked by another user")
        
    db_file.is_locked = False
    db_file.locked_by_id = None
    db.commit()
    return {"message": "File unlocked successfully"}

@app.delete("/delete")
def delete_file(
    filepath: str,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    db_file = db.query(models.FileMetadata).filter(
        models.FileMetadata.filepath == filepath,
        models.FileMetadata.owner_id == current_user.id
    ).first()
    
    if not db_file:
        return {"message": "File not found or already deleted"}
        
    physical_path = os.path.join(STORAGE_DIR, current_user.username, filepath)
    if os.path.exists(physical_path):
        try:
            os.remove(physical_path)
        except OSError:
            pass
            
    db.delete(db_file)
    db.commit()
    return {"message": "File deleted successfully"}

# Mount static files (Admin UI) at the very end to avoid capturing API routes
app.mount("/", StaticFiles(directory=get_resource_path("static"), html=True), name="static")

if __name__ == "__main__":
    import webbrowser
    multiprocessing.freeze_support()
    # Automatically open the dashboard in the default browser
    webbrowser.open("http://127.0.0.1:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
