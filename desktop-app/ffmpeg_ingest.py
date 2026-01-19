"""
FFmpeg-based RTMP Ingest Server for Desktop App
Uses FFmpeg to receive RTMP streams from OBS and forward them
No external RTMP server dependency required
"""

import subprocess
import threading
import socket
import os
import time
from typing import Optional, Callable, Dict, List
import database as db


class FFmpegRTMPServer:
    """
    RTMP Ingest Server using FFmpeg
    FFmpeg listens on a TCP port and receives FLV streams from OBS/encoders
    Then forwards to configured destinations
    
    Note: FFmpeg's RTMP listener uses TCP with FLV format
    OBS connects to: rtmp://IP:PORT/live/channel
    """
    
    def __init__(self, port: int = 1935, on_log: Optional[Callable] = None,
                 on_stream_start: Optional[Callable] = None,
                 on_stream_stop: Optional[Callable] = None):
        self.port = port
        self.on_log = on_log
        self.on_stream_start = on_stream_start
        self.on_stream_stop = on_stream_stop
        
        self.ffmpeg_path = db.get_setting('ffmpeg_path') or 'ffmpeg'
        self.running = False
        self.active_streams: Dict[str, dict] = {}
    
    def _log(self, message: str):
        """Log a message"""
        if self.on_log:
            self.on_log(f"[RTMP Ingest] {message}")
        db.add_log("INFO", f"RTMP Ingest: {message}")
    
    def _get_local_ip(self) -> str:
        """Get local IP address"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0)
            s.connect(('10.254.254.254', 1))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return 'localhost'
    
    def _is_port_in_use(self, port: int) -> bool:
        """Check if port is in use"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex(('127.0.0.1', port))
            sock.close()
            return result == 0
        except:
            return False
    
    def start_ingest_listener(self, channel_name: str, destinations: List[Dict]) -> bool:
        """
        Start FFmpeg to listen for RTMP stream and forward to destinations
        
        Uses FFmpeg's TCP listen mode with FLV format
        """
        if not destinations:
            self._log(f"No destinations for channel {channel_name}")
            return False
        
        stream_key = f"ingest_{channel_name}"
        
        # Stop any existing ingest for this channel
        self.stop_ingest(channel_name)
        time.sleep(0.5)
        
        # Find an available port (use channel-specific port to allow multiple channels)
        listen_port = self.port
        
        # Check if port is in use
        if self._is_port_in_use(listen_port):
            self._log(f"Port {listen_port} is already in use")
            # Try to use port + 1, 2, etc
            for offset in range(1, 10):
                alt_port = listen_port + offset
                if not self._is_port_in_use(alt_port):
                    listen_port = alt_port
                    self._log(f"Using alternative port: {listen_port}")
                    break
            else:
                return False
        
        # Build output destinations
        output_args = []
        dest_names = []
        
        for dest in destinations:
            if not dest.get('enabled', True):
                continue
            
            rtmp_url = dest['rtmp_url'].strip()
            dest_key = dest.get('stream_key', '').strip()
            
            if dest_key:
                if rtmp_url.endswith('/'):
                    full_url = f"{rtmp_url}{dest_key}"
                else:
                    full_url = f"{rtmp_url}/{dest_key}"
            else:
                full_url = rtmp_url
            
            # Add output for this destination (copy codecs for low latency)
            output_args.extend([
                '-c', 'copy',
                '-f', 'flv',
                '-flvflags', 'no_duration_filesize',
                full_url
            ])
            dest_names.append(dest.get('name', 'Unknown'))
        
        if not output_args:
            self._log("No enabled destinations")
            return False
        
        # Build FFmpeg command
        # Use TCP listen mode with FLV format
        # The -listen 1 flag makes FFmpeg act as a server
        command = [
            self.ffmpeg_path,
            '-y',
            '-loglevel', 'info',
            '-f', 'flv',
            '-listen', '1',
            '-i', f'tcp://0.0.0.0:{listen_port}?listen_timeout=60000',
        ] + output_args
        
        local_ip = self._get_local_ip()
        self._log(f"Starting ingest listener on port {listen_port}...")
        self._log(f"OBS Server URL: rtmp://{local_ip}:{listen_port}")
        self._log(f"Destinations: {', '.join(dest_names)}")
        
        try:
            if os.name == 'nt':
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.PIPE,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
            else:
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.PIPE
                )
            
            self.active_streams[stream_key] = {
                'process': process,
                'channel_name': channel_name,
                'port': listen_port,
                'start_time': time.time(),
                'status': 'waiting',
                'destinations': dest_names
            }
            
            # Start output reader
            thread = threading.Thread(
                target=self._read_output,
                args=(stream_key, process),
                daemon=True
            )
            thread.start()
            
            self.running = True
            return True
            
        except FileNotFoundError:
            self._log(f"FFmpeg not found at: {self.ffmpeg_path}")
            return False
        except Exception as e:
            self._log(f"Failed to start ingest: {str(e)}")
            return False
    
    def _read_output(self, stream_key: str, process: subprocess.Popen):
        """Read and parse FFmpeg output"""
        if not process.stdout:
            return
        
        connected = False
        
        for line in iter(process.stdout.readline, b''):
            if stream_key not in self.active_streams:
                break
            
            try:
                decoded = line.decode('utf-8', errors='replace').strip()
                
                # Detect connection established
                if 'Opening' in decoded and ('output' in decoded.lower() or 'flv' in decoded.lower()):
                    if not connected:
                        connected = True
                        self._log("✅ OBS Connected! Streaming to destinations...")
                        self.active_streams[stream_key]['status'] = 'connected'
                        if self.on_stream_start:
                            self.on_stream_start(stream_key)
                
                # Detect stream progress (frame=...)
                if 'frame=' in decoded and 'fps=' in decoded:
                    if not connected:
                        connected = True
                        self._log("✅ OBS Connected! Streaming to destinations...")
                        self.active_streams[stream_key]['status'] = 'connected'
                        if self.on_stream_start:
                            self.on_stream_start(stream_key)
                
                # Log important messages
                if decoded:
                    lower = decoded.lower()
                    if any(kw in lower for kw in ['error', 'warning', 'failed']):
                        if self.on_log:
                            self.on_log(f"[FFmpeg] {decoded[:200]}")
                    elif 'frame=' in decoded:
                        # Only log progress occasionally
                        pass
            except:
                pass
        
        # Process ended
        if stream_key in self.active_streams:
            self._log("Ingest stream ended")
            if self.on_stream_stop:
                self.on_stream_stop(stream_key)
            del self.active_streams[stream_key]
        
        if not self.active_streams:
            self.running = False
    
    def stop_ingest(self, channel_name: str = None):
        """Stop ingest for a channel or all"""
        keys_to_remove = []
        
        for key, info in list(self.active_streams.items()):
            if channel_name is None or info.get('channel_name') == channel_name:
                try:
                    info['process'].terminate()
                    info['process'].wait(timeout=3)
                except:
                    try:
                        info['process'].kill()
                    except:
                        pass
                keys_to_remove.append(key)
                self._log(f"Stopped ingest for {info.get('channel_name', 'unknown')}")
        
        for key in keys_to_remove:
            if key in self.active_streams:
                del self.active_streams[key]
        
        if not self.active_streams:
            self.running = False
    
    def stop_all(self):
        """Stop all ingest streams"""
        self.stop_ingest()
    
    def is_running(self) -> bool:
        """Check if any ingest is running"""
        return self.running and len(self.active_streams) > 0
    
    def get_status(self) -> dict:
        """Get ingest server status"""
        return {
            'running': self.running,
            'port': self.port,
            'active_streams': len(self.active_streams),
            'streams': {k: {
                'status': v['status'], 
                'channel': v['channel_name'],
                'port': v.get('port', self.port)
            } for k, v in self.active_streams.items()}
        }
    
    def get_ingest_url(self, channel_name: str) -> str:
        """Get the ingest URL for OBS"""
        local_ip = self._get_local_ip()
        
        # Check if there's an active stream with a specific port
        stream_key = f"ingest_{channel_name}"
        if stream_key in self.active_streams:
            port = self.active_streams[stream_key].get('port', self.port)
            return f"rtmp://{local_ip}:{port}"
        
        return f"rtmp://{local_ip}:{self.port}"
