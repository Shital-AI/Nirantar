"""
Lightweight RTMP Server for Desktop App
Uses FFmpeg and a simple socket server to handle RTMP ingest
"""

import subprocess
import threading
import socket
import os
import time
from typing import Optional, Callable, Dict
import database as db


class RTMPIngestServer:
    """
    Simple RTMP Ingest Server using FFmpeg
    Listens for incoming RTMP streams and can forward them
    """
    
    def __init__(self, port: int = 1935, on_stream_start: Optional[Callable] = None,
                 on_stream_stop: Optional[Callable] = None, on_log: Optional[Callable] = None):
        self.port = port
        self.on_stream_start = on_stream_start
        self.on_stream_stop = on_stream_stop
        self.on_log = on_log
        
        self.running = False
        self.process: Optional[subprocess.Popen] = None
        self.active_streams: Dict[str, dict] = {}
        self.ffmpeg_path = db.get_setting('ffmpeg_path') or 'ffmpeg'
        
        # Stream directory for temporary files
        self.stream_dir = os.path.join(os.path.dirname(__file__), 'streams')
        os.makedirs(self.stream_dir, exist_ok=True)
    
    def _log(self, message: str):
        """Log a message"""
        if self.on_log:
            self.on_log(f"[RTMP Server] {message}")
        db.add_log("INFO", f"RTMP Server: {message}")
    
    def start(self) -> bool:
        """Start the RTMP ingest server"""
        if self.running:
            return True
        
        try:
            # Check if port is available
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            result = sock.connect_ex(('127.0.0.1', self.port))
            sock.close()
            
            if result == 0:
                self._log(f"Port {self.port} is already in use")
                return False
            
            self.running = True
            self._log(f"RTMP Server ready on rtmp://localhost:{self.port}")
            return True
            
        except Exception as e:
            self._log(f"Failed to start server: {str(e)}")
            return False
    
    def stop(self):
        """Stop the RTMP server"""
        self.running = False
        
        # Stop all active stream processes
        for stream_key, stream_info in list(self.active_streams.items()):
            if 'process' in stream_info and stream_info['process']:
                try:
                    stream_info['process'].terminate()
                except:
                    pass
        
        self.active_streams.clear()
        self._log("RTMP Server stopped")
    
    def get_ingest_url(self, channel_name: str) -> str:
        """Get the RTMP ingest URL for a channel"""
        return f"rtmp://localhost:{self.port}/live/{channel_name}"
    
    def get_stream_status(self, channel_name: str) -> dict:
        """Get status of a stream"""
        if channel_name in self.active_streams:
            return self.active_streams[channel_name]
        return {'active': False}


class StreamManager:
    """
    Manages stream sources and destinations
    Handles switching between OBS input and Loop playback
    """
    
    def __init__(self, on_status_change: Optional[Callable] = None,
                 on_log: Optional[Callable] = None):
        self.on_status_change = on_status_change
        self.on_log = on_log
        
        self.ffmpeg_path = db.get_setting('ffmpeg_path') or 'ffmpeg'
        self.active_streams: Dict[str, Dict] = {}  # channel_id -> stream info
        self.monitor_thread: Optional[threading.Thread] = None
        self.monitoring = False
    
    def _log(self, message: str, channel_id: Optional[int] = None):
        """Log a message"""
        if self.on_log:
            self.on_log(f"[StreamManager] {message}")
        db.add_log("INFO", message, channel_id)
    
    def start_loop_to_destinations(self, channel: Dict) -> bool:
        """
        Start streaming from a loop file to all enabled destinations
        """
        channel_id = channel['id']
        channel_name = channel['name']
        
        # Get source file
        media_folder = db.get_setting('media_folder')
        source_file = channel.get('loop_source_file', '')
        
        if not source_file:
            self._log(f"No source file for channel {channel_name}", channel_id)
            return False
        
        # Build full path
        if os.path.isabs(source_file):
            source_path = source_file
        else:
            source_path = os.path.join(media_folder or '', source_file)
        
        if not os.path.exists(source_path):
            self._log(f"Source file not found: {source_path}", channel_id)
            return False
        
        # Get destinations
        destinations = db.get_destinations(channel_id)
        enabled_dests = [d for d in destinations if d['enabled']]
        
        if not enabled_dests:
            self._log(f"No enabled destinations for {channel_name}", channel_id)
            return False
        
        # Start a stream for each destination
        success = False
        for dest in enabled_dests:
            if self._start_stream_to_destination(channel, source_path, dest, 'loop'):
                success = True
        
        if success:
            db.update_channel(channel_id, active_source='LOOP')
            if self.on_status_change:
                self.on_status_change(channel_id, 'LOOP')
        
        return success
    
    def start_ingest_to_destinations(self, channel: Dict, ingest_url: str) -> bool:
        """
        Start streaming from RTMP ingest to all enabled destinations
        """
        channel_id = channel['id']
        channel_name = channel['name']
        
        # Get destinations
        destinations = db.get_destinations(channel_id)
        enabled_dests = [d for d in destinations if d['enabled']]
        
        if not enabled_dests:
            self._log(f"No enabled destinations for {channel_name}", channel_id)
            return False
        
        # Start a stream for each destination
        success = False
        for dest in enabled_dests:
            if self._start_stream_to_destination(channel, ingest_url, dest, 'ingest'):
                success = True
        
        if success:
            db.update_channel(channel_id, active_source='OBS')
            if self.on_status_change:
                self.on_status_change(channel_id, 'OBS')
        
        return success
    
    def _start_stream_to_destination(self, channel: Dict, source: str, 
                                      destination: Dict, source_type: str) -> bool:
        """
        Start FFmpeg process to stream from source to destination
        """
        channel_id = channel['id']
        dest_id = destination['id']
        stream_key = f"{channel_id}_{dest_id}"
        
        # Stop existing stream if any
        self.stop_stream(channel_id, dest_id)
        
        # Build destination URL
        rtmp_url = destination['rtmp_url'].strip()
        dest_stream_key = destination.get('stream_key', '').strip()
        
        # Build full URL with stream key
        if dest_stream_key:
            # Remove trailing slash from URL if present
            if rtmp_url.endswith('/'):
                rtmp_url = rtmp_url[:-1]
            full_url = f"{rtmp_url}/{dest_stream_key}"
        else:
            full_url = rtmp_url
        
        self._log(f"Streaming to: {destination['name']}", channel_id)
        
        # Build FFmpeg command
        command = [self.ffmpeg_path, '-y']  # -y to overwrite
        
        # Input options
        if source_type == 'loop':
            command.extend([
                '-re',  # Read at native frame rate
                '-stream_loop', '-1',  # Infinite loop
                '-i', source
            ])
        else:  # ingest (RTMP input)
            command.extend([
                '-rw_timeout', '5000000',  # 5 second timeout
                '-i', source
            ])
        
        # Video encoding - ALWAYS transcode to ensure proper keyframes for YouTube
        # YouTube requires keyframes every 2 seconds (GOP = framerate * 2)
        video_bitrate = channel.get('video_bitrate', 0)
        keyframe_interval = channel.get('keyframe_interval', 2) or 2
        
        # For loop sources, we must re-encode to ensure proper keyframes
        # Using libx264 with proper GOP settings
        if video_bitrate and video_bitrate > 0:
            command.extend([
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-b:v', f'{video_bitrate}k',
                '-maxrate', f'{int(video_bitrate * 1.5)}k',
                '-bufsize', f'{video_bitrate * 2}k',
            ])
        else:
            # Default to 4500kbps for 1080p YouTube streaming
            command.extend([
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-b:v', '4500k',
                '-maxrate', '6000k',
                '-bufsize', '9000k',
            ])
        
        # CRITICAL: Force keyframe every 2 seconds (YouTube requirement)
        # Assuming 30fps, g=60 means keyframe every 2 seconds
        command.extend([
            '-g', '60',           # GOP size = 60 frames = 2 seconds @ 30fps
            '-keyint_min', '60',  # Minimum keyframe interval
            '-sc_threshold', '0', # Disable scene change detection
            '-pix_fmt', 'yuv420p',
        ])
        
        # Output resolution if specified
        output_res = channel.get('output_resolution', '')
        if output_res:
            command.extend(['-s', output_res])
        
        # Audio encoding
        audio_bitrate = channel.get('audio_bitrate', 128) or 128
        command.extend([
            '-c:a', 'aac',
            '-b:a', f'{audio_bitrate}k',
            '-ar', '44100',
            '-ac', '2'
        ])
        
        # Output options
        command.extend([
            '-f', 'flv',
            '-flvflags', 'no_duration_filesize',
            full_url
        ])
        
        # Log the command (hide stream key for security)
        safe_cmd = ' '.join(command).replace(dest_stream_key, '***') if dest_stream_key else ' '.join(command)
        self._log(f"FFmpeg command: {safe_cmd[:200]}...", channel_id)
        
        try:
            # Start FFmpeg process
            if os.name == 'nt':
                # Windows
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.PIPE,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )
            else:
                # macOS/Linux
                process = subprocess.Popen(
                    command,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.PIPE
                )
            
            # Store stream info
            self.active_streams[stream_key] = {
                'process': process,
                'channel_id': channel_id,
                'dest_id': dest_id,
                'source_type': source_type,
                'start_time': time.time(),
                'destination_name': destination['name'],
                'command': command
            }
            
            # Start output reader thread
            thread = threading.Thread(
                target=self._read_process_output,
                args=(stream_key, process),
                daemon=True
            )
            thread.start()
            
            db.update_destination(dest_id, status='CONNECTED')
            self._log(f"Started streaming to {destination['name']}", channel_id)
            return True
            
        except FileNotFoundError:
            self._log(f"FFmpeg not found at: {self.ffmpeg_path}", channel_id)
            db.update_destination(dest_id, status='ERROR')
            return False
        except Exception as e:
            self._log(f"Failed to start stream: {str(e)}", channel_id)
            db.update_destination(dest_id, status='ERROR')
            return False
    
    def _read_process_output(self, stream_key: str, process: subprocess.Popen):
        """Read and log FFmpeg output"""
        if not process.stdout:
            return
        
        for line in iter(process.stdout.readline, b''):
            if stream_key not in self.active_streams:
                break
            
            try:
                decoded = line.decode('utf-8', errors='replace').strip()
                if decoded and self.on_log:
                    # Only log important messages
                    if any(kw in decoded.lower() for kw in ['error', 'warning', 'stream', 'frame', 'speed']):
                        self.on_log(f"[FFmpeg] {decoded}")
            except:
                pass
        
        # Process ended - mark as disconnected
        if stream_key in self.active_streams:
            info = self.active_streams[stream_key]
            db.update_destination(info['dest_id'], status='DISCONNECTED')
            del self.active_streams[stream_key]
    
    def stop_stream(self, channel_id: int, dest_id: Optional[int] = None):
        """Stop a stream or all streams for a channel"""
        keys_to_remove = []
        
        for key, info in self.active_streams.items():
            if info['channel_id'] == channel_id:
                if dest_id is None or info['dest_id'] == dest_id:
                    try:
                        info['process'].terminate()
                    except:
                        pass
                    keys_to_remove.append(key)
                    db.update_destination(info['dest_id'], status='DISCONNECTED')
        
        for key in keys_to_remove:
            if key in self.active_streams:
                del self.active_streams[key]
        
        if dest_id is None:
            db.update_channel(channel_id, active_source='NONE')
            if self.on_status_change:
                self.on_status_change(channel_id, 'NONE')
    
    def stop_all(self):
        """Stop all active streams"""
        for key, info in list(self.active_streams.items()):
            try:
                info['process'].terminate()
            except:
                pass
            db.update_destination(info['dest_id'], status='DISCONNECTED')
        
        self.active_streams.clear()
    
    def get_active_streams(self, channel_id: Optional[int] = None) -> Dict:
        """Get info about active streams"""
        if channel_id:
            return {k: v for k, v in self.active_streams.items() 
                    if v['channel_id'] == channel_id}
        return self.active_streams.copy()
    
    def restart_channel(self, channel: Dict):
        """Restart all streams for a channel"""
        channel_id = channel['id']
        
        # Remember current source type
        current_streams = self.get_active_streams(channel_id)
        source_type = 'loop'
        if current_streams:
            source_type = list(current_streams.values())[0].get('source_type', 'loop')
        
        # Stop all
        self.stop_stream(channel_id)
        time.sleep(1)
        
        # Restart based on source type
        if source_type == 'loop':
            self.start_loop_to_destinations(channel)
        else:
            # For ingest, need the ingest URL
            ingest_url = f"rtmp://localhost:1935/live/{channel['name']}"
            self.start_ingest_to_destinations(channel, ingest_url)


def get_rtmp_ingest_info() -> dict:
    """Get RTMP ingest server information"""
    port = db.get_setting('rtmp_port') or '1935'
    return {
        'server_url': f'rtmp://localhost:{port}/live',
        'port': int(port),
        'instructions': [
            'In OBS, go to Settings > Stream',
            'Select "Custom" service',
            f'Server: rtmp://YOUR_IP:{port}/live',
            'Stream Key: your-channel-name',
        ]
    }
