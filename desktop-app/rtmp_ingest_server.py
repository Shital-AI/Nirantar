"""
FFmpeg-based RTMP Ingest Server
RELIABLE VERSION: Uses FFmpeg native -listen flag.
No Python RTMP libraries required.
"""

import subprocess
import threading
import socket
import os
import time
from typing import Optional, Callable, Dict, List
import database as db

class FFmpegRTMPServer:
    def __init__(self, port: int = 1935, on_log: Optional[Callable] = None,
                 on_stream_start: Optional[Callable] = None,
                 on_stream_stop: Optional[Callable] = None):
        self.port = port
        self.on_log = on_log
        self.on_stream_start = on_stream_start
        self.on_stream_stop = on_stream_stop
        self.active_streams: Dict[str, dict] = {}
        self.ffmpeg_path = db.get_setting('ffmpeg_path') or 'ffmpeg'
        self.server = self # Compatibility
        self.running = False

    def _log(self, msg: str):
        if self.on_log: self.on_log(f"[Ingest] {msg}")
        db.add_log("INFO", f"Ingest: {msg}")

    def _find_free_port(self, start_port: int) -> int:
        for port in range(start_port, start_port + 20):
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.bind(('0.0.0.0', port))
                s.close()
                return port
            except OSError:
                continue
        return start_port

    def _get_local_ip(self) -> str:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return 'localhost'

    def start_ingest_listener(self, channel_name: str, destinations: List[Dict]) -> bool:
        """Start FFmpeg in Listen Mode"""
        # 1. Stop existing ingest for this channel
        self.stop_ingest(channel_name)
        
        # 2. Find a free port (Critical for Docker conflicts)
        self.port = self._find_free_port(self.port)
        
        # 3. Build Destinations
        output_args = []
        for dest in destinations:
            if not dest.get('enabled', True): continue
            
            rtmp_url = dest['rtmp_url'].strip()
            key = dest.get('stream_key', '').strip()
            full_url = f"{rtmp_url}/{key}" if key else rtmp_url
            
            # Use flv for RTMP destinations
            # Force AAC audio to ensure YouTube compatibility
            # Keep video copy to safe CPU, but ensure it's H.264 in OBS
            output_args.extend([
                '-c:v', 'copy',
                '-c:a', 'aac', '-ar', '44100', '-b:a', '128k',
                '-f', 'flv', full_url
            ])

        if not output_args:
            self._log("No destinations enabled")
            return False

        # 4. Construct FFmpeg Command
        # -listen 1 makes FFmpeg wait for connection
        # -f flv -i rtmp://... tells it to expect RTMP
        local_ip = self._get_local_ip()
        app_name = "live" # Standard RTMP app name
        
        # IMPORTANT: FFmpeg listen URL format: rtmp://0.0.0.0:PORT/APP
        listen_url = f"rtmp://0.0.0.0:{self.port}/{app_name}"
        
        command = [
            self.ffmpeg_path,
            '-y',
            '-listen', '1',
            '-timeout', '30000', # 30s timeout waiting for connection
            '-f', 'flv',         # Force FLV input format for RTMP
            '-i', listen_url,
        ] + output_args

        self._log(f"Starting server on port {self.port}...")
        self._log(f"OBS Server: rtmp://{local_ip}:{self.port}/{app_name}")
        
        try:
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.PIPE
            )
            
            self.running = True
            stream_key = f"ingest_{channel_name}"
            self.active_streams[stream_key] = {
                'channel_name': channel_name,
                'port': self.port,
                'process': process,
                'status': 'waiting'
            }
            
            # Monitor thread
            threading.Thread(target=self._monitor_ffmpeg, args=(stream_key, process), daemon=True).start()
            return True
            
        except Exception as e:
            self._log(f"Failed to start FFmpeg: {e}")
            return False

    def _monitor_ffmpeg(self, stream_key: str, process: subprocess.Popen):
        """Watch FFmpeg output for connection status"""
        if not process.stdout: return
        
        connected = False
        channel_name = None
        
        # Get channel name from stream key
        if stream_key in self.active_streams:
            channel_name = self.active_streams[stream_key].get('channel_name')
        
        for line in iter(process.stdout.readline, b''):
            try:
                line_str = line.decode('utf-8', errors='ignore').strip()
                
                # Connection detection
                if not connected and any(x in line_str for x in ["Input #0", "Stream #0", "Video:"]):
                    connected = True
                    self._log("✅ OBS Connected! Streaming...")
                    
                    # Update channel status in database
                    if channel_name:
                        # Find channel by name and update status
                        channels = db.get_all_channels()
                        for ch in channels:
                            if ch['name'] == channel_name:
                                db.update_channel(ch['id'], active_source='OBS')
                                break
                    
                    # Update stream status
                    if stream_key in self.active_streams:
                        self.active_streams[stream_key]['status'] = 'connected'
                    
                    # Trigger callback
                    if self.on_stream_start:
                        self.on_stream_start(stream_key)
                
                # Error logging
                if "Address already in use" in line_str:
                    self._log("❌ Port busy!")
                
                # Log errors regardless of case
                low = line_str.lower()
                if any(x in low for x in ["error", "fail", "invalid", "unable"]):
                    self._log(f"[FFmpeg Error] {line_str}")
                
                # Log progress occasionally
                if "speed=" in line_str and "frame=" in line_str:
                     # Optional: self._log(f"Stats: {line_str}")
                     pass
            except:
                pass

        self._log(f"FFmpeg process exited with code {process.poll()}")
        self._log("Ingest stopped")
        
        # Update channel status back to NONE
        if channel_name:
            channels = db.get_all_channels()
            for ch in channels:
                if ch['name'] == channel_name:
                    db.update_channel(ch['id'], active_source='NONE')
                    break
        
        # Call stop callback
        if self.on_stream_stop:
            self.on_stream_stop(stream_key)
        
        if stream_key in self.active_streams:
            del self.active_streams[stream_key]
        self.running = False

    def stop_ingest(self, channel_name: str = None):
        if not self.active_streams: return
        
        # Kill all processes
        keys = list(self.active_streams.keys())
        for k in keys:
            info = self.active_streams[k]
            if info.get('process'):
                try:
                    info['process'].terminate()
                    time.sleep(0.5)
                    info['process'].kill() 
                except: pass
            del self.active_streams[k]
        
        self.running = False
        self._log("Server stopped")

    def stop_all(self):
        self.stop_ingest()

    def is_running(self):
        return self.running
