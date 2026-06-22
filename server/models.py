from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime
from sqlalchemy.orm import relationship
import datetime

from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

    files = relationship("FileMetadata", back_populates="owner", foreign_keys="[FileMetadata.owner_id]")
    locked_files = relationship("FileMetadata", back_populates="locked_by", foreign_keys="[FileMetadata.locked_by_id]")


class FileMetadata(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    filepath = Column(String, index=True) # Logical path within the NAS
    size = Column(Integer)
    file_hash = Column(String)
    version = Column(Integer, default=1)
    last_modified = Column(DateTime, default=datetime.datetime.utcnow)
    
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="files", foreign_keys=[owner_id])
    
    # File Locking
    is_locked = Column(Boolean, default=False)
    locked_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    locked_by = relationship("User", back_populates="locked_files", foreign_keys=[locked_by_id])
