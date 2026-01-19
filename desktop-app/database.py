"""
Local SQLite Database Manager for RTMP Streaming Desktop App
Stores channels, destinations, and settings locally
"""

import sqlite3
import os
import secrets
from datetime import datetime
from typing import List, Dict, Optional, Any

DATABASE_PATH = os.path.join(os.path.dirname(__file__), "rtmp_streamer.db")


def get_connection() -> sqlite3.Connection:
    """Get database connection with row factory for dict-like access"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """Initialize the database with required tables"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Channels table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            display_name TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            obs_token TEXT,
            loop_token TEXT,
            loop_source_file TEXT,
            active_source TEXT DEFAULT 'NONE',
            loop_enabled INTEGER DEFAULT 1,
            obs_override_enabled INTEGER DEFAULT 1,
            auto_restart_loop INTEGER DEFAULT 1,
            failover_timeout_seconds INTEGER DEFAULT 5,
            keyframe_interval INTEGER DEFAULT 2,
            video_bitrate INTEGER DEFAULT 0,
            audio_bitrate INTEGER DEFAULT 128,
            output_resolution TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Destinations table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS destinations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            rtmp_url TEXT NOT NULL,
            stream_key TEXT,
            enabled INTEGER DEFAULT 1,
            status TEXT DEFAULT 'DISCONNECTED',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
        )
    """)
    
    # Settings table for app configuration
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    
    # Process tracking table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS processes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id INTEGER,
            destination_id INTEGER,
            process_type TEXT NOT NULL,
            pid INTEGER,
            status TEXT DEFAULT 'STOPPED',
            started_at TEXT,
            FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
            FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE CASCADE
        )
    """)
    
    # Logs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            level TEXT NOT NULL,
            message TEXT NOT NULL,
            channel_id INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Insert default settings if not exist
    default_settings = {
        'media_folder': os.path.join(os.path.dirname(__file__), 'media'),
        'ffmpeg_path': 'ffmpeg',  # Use system ffmpeg by default
        'srs_rtmp_port': '1935',
        'srs_enabled': '0',
        'theme': 'dark'
    }
    
    for key, value in default_settings.items():
        cursor.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
            (key, value)
        )
    
    conn.commit()
    conn.close()
    
    # Create media folder if not exists
    media_folder = get_setting('media_folder')
    if media_folder:
        os.makedirs(media_folder, exist_ok=True)


# ============ Settings Functions ============

def get_setting(key: str) -> Optional[str]:
    """Get a setting value by key"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row['value'] if row else None


def set_setting(key: str, value: str):
    """Set a setting value"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (key, value)
    )
    conn.commit()
    conn.close()


def get_all_settings() -> Dict[str, str]:
    """Get all settings as a dictionary"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    settings = {row['key']: row['value'] for row in cursor.fetchall()}
    conn.close()
    return settings


# ============ Channel Functions ============

def generate_token() -> str:
    """Generate a random stream token"""
    return secrets.token_urlsafe(16)


def create_channel(name: str, display_name: str, loop_source_file: str = "") -> int:
    """Create a new channel and return its ID"""
    conn = get_connection()
    cursor = conn.cursor()
    
    obs_token = generate_token()
    loop_token = generate_token()
    
    cursor.execute("""
        INSERT INTO channels (name, display_name, loop_source_file, obs_token, loop_token)
        VALUES (?, ?, ?, ?, ?)
    """, (name, display_name, loop_source_file, obs_token, loop_token))
    
    channel_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return channel_id


def get_all_channels() -> List[Dict]:
    """Get all channels with their destinations"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM channels ORDER BY id")
    channels = [dict(row) for row in cursor.fetchall()]
    
    # Get destinations for each channel
    for channel in channels:
        cursor.execute(
            "SELECT * FROM destinations WHERE channel_id = ?",
            (channel['id'],)
        )
        channel['destinations'] = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    return channels


def get_channel(channel_id: int) -> Optional[Dict]:
    """Get a single channel by ID"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM channels WHERE id = ?", (channel_id,))
    row = cursor.fetchone()
    
    if row:
        channel = dict(row)
        cursor.execute(
            "SELECT * FROM destinations WHERE channel_id = ?",
            (channel_id,)
        )
        channel['destinations'] = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return channel
    
    conn.close()
    return None


def update_channel(channel_id: int, **kwargs) -> bool:
    """Update channel settings"""
    if not kwargs:
        return False
    
    conn = get_connection()
    cursor = conn.cursor()
    
    # Build update query
    set_clause = ", ".join([f"{key} = ?" for key in kwargs.keys()])
    values = list(kwargs.values()) + [channel_id]
    
    cursor.execute(
        f"UPDATE channels SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        values
    )
    
    conn.commit()
    success = cursor.rowcount > 0
    conn.close()
    return success


def delete_channel(channel_id: int) -> bool:
    """Delete a channel and its destinations"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM channels WHERE id = ?", (channel_id,))
    
    conn.commit()
    success = cursor.rowcount > 0
    conn.close()
    return success


def set_channel_active_source(channel_id: int, source: str):
    """Set the active source for a channel (OBS, LOOP, or NONE)"""
    update_channel(channel_id, active_source=source)


# ============ Destination Functions ============

def create_destination(channel_id: int, name: str, rtmp_url: str, stream_key: str = "") -> int:
    """Create a new destination for a channel"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT INTO destinations (channel_id, name, rtmp_url, stream_key)
        VALUES (?, ?, ?, ?)
    """, (channel_id, name, rtmp_url, stream_key))
    
    dest_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return dest_id


def get_destinations(channel_id: int) -> List[Dict]:
    """Get all destinations for a channel"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT * FROM destinations WHERE channel_id = ?",
        (channel_id,)
    )
    destinations = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return destinations


def update_destination(dest_id: int, **kwargs) -> bool:
    """Update destination settings"""
    if not kwargs:
        return False
    
    conn = get_connection()
    cursor = conn.cursor()
    
    set_clause = ", ".join([f"{key} = ?" for key in kwargs.keys()])
    values = list(kwargs.values()) + [dest_id]
    
    cursor.execute(f"UPDATE destinations SET {set_clause} WHERE id = ?", values)
    
    conn.commit()
    success = cursor.rowcount > 0
    conn.close()
    return success


def delete_destination(dest_id: int) -> bool:
    """Delete a destination"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM destinations WHERE id = ?", (dest_id,))
    
    conn.commit()
    success = cursor.rowcount > 0
    conn.close()
    return success


# ============ Logging Functions ============

def add_log(level: str, message: str, channel_id: Optional[int] = None):
    """Add a log entry"""
    conn = get_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        "INSERT INTO logs (level, message, channel_id) VALUES (?, ?, ?)",
        (level, message, channel_id)
    )
    
    conn.commit()
    conn.close()


def get_logs(limit: int = 100, channel_id: Optional[int] = None) -> List[Dict]:
    """Get recent logs"""
    conn = get_connection()
    cursor = conn.cursor()
    
    if channel_id:
        cursor.execute(
            "SELECT * FROM logs WHERE channel_id = ? ORDER BY id DESC LIMIT ?",
            (channel_id, limit)
        )
    else:
        cursor.execute(
            "SELECT * FROM logs ORDER BY id DESC LIMIT ?",
            (limit,)
        )
    
    logs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return logs


def clear_logs():
    """Clear all logs"""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM logs")
    conn.commit()
    conn.close()


# Initialize database when module is imported
init_database()
