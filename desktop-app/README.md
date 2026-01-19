# Nirantar Live Desktop
### Professional Offline Streaming Manager

This is the standalone desktop version of the Nirantar platform. It's designed for broadcasters who need a powerful, offline-capable tool to manage their streams directly from their laptop or workstation.

No servers, no monthly subscriptions, no complex cloud setups. Just you and your stream.

---

## Why use the Desktop App?

- **100% Offline**: Runs entirely on your machine. Perfect for locations with spotty internet where you need local control.
- **Privacy**: Your stream keys and settings never leave your computer.
- **Simplicity**: Manage multiple channels and destinations (YouTube, FB, Twitch) from one clean interface.
- **Smart Looping**: Have a video file ready? We'll loop it 24/7 if you want, ensuring your channel never goes offline.

---

## Quick Start

### Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Windows 10, macOS 11+, Linux | macOS Sonoma or Windows 11 |
| **Processor** | Intel i5 (8th Gen) or Apple M1 | Apple M2/M3 or Intel i7 |
| **Memory** | 8 GB RAM | 16 GB RAM |
| **Network** | 5 Mbps Upload (per stream) | Fiber Connection |
| **Software** | Python 3.9+, FFmpeg | Python 3.12 |

### How to Run

1. **Open Terminal** in this folder.
2. **Run the setup script**:
   ```bash
   # On Mac/Linux
   ./start.sh
   
   # On Windows
   start.bat
   ```
   *This script automatically creates a virtual environment, installs dependencies, and launches the app.*

3. **Or run manually**:
   ```bash
   pip install -r requirements.txt
   python main.py
   ```

---

## User Guide

### 1. Create a Channel
Click **"+ New Channel"**. Give it a name and pick a video file to use as your "Loop" source. This file plays whenever you aren't live.

### 2. Add Destinations
Click the **Gear Icon (⚙)** on your new channel card. Scroll down to add destinations like YouTube or Facebook.
- **Tip**: You can stream to multiple platforms simultaneously!

### 3. Start Streaming
- **Loop**: Click "Start Loop" to begin broadcasting your video file immediately.
- **Live Ingest**: Want to use OBS? We provide a local RTMP ingest server. Just point your OBS to `rtmp://localhost:1935/live/{slug}` and start streaming. We handle the rest.

---

## For Developers

Built with **Python** and **CustomTkinter** for a modern, dark-mode UI.
- **Database**: Local SQLite (`rtmp_streamer.db`)
- **Engine**: FFmpeg wrapper for robust encoding.

---

**© 2026 Shital AI** | [shitalai.com](https://shitalai.com)
