"""
FFmpeg Process Manager for RTMP Streaming Desktop App
Handles loop publishing and RTMP restreaming
"""

import subprocess
import threading
import os
import signal
import time
from typing import Dict, Optional, Callable, List
import psutil

import database as db


class FFmpegProcess:
    """Represents a single FFmpeg process"""
    
    def __init__(self, name: str, command: List[str], on_output: Optional[Callable] = None):
        self.name = name
        self.command = command
        self.process: Optional[subprocess.Popen] = None
        self.thread: Optional[threading.Thread] = None
        self.on_output = on_output
        self.running = False
        self.output_lines: List[str] = []
        self.error_count = 0
        self.start_time: Optional[float] = None
    
    def start(self) -> bool:
        """Start the FFmpeg process"""
        if self.running:
            return False
        
        try:
            self.process = subprocess.Popen(
                self.command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            )
            self.running = True
            self.start_time = time.time()
            self.error_count = 0
            
            # Start output reader thread
            self.thread = threading.Thread(target=self._read_output, daemon=True)
            self.thread.start()
            
            db.add_log("INFO", f"Started process: {self.name}")
            return True
            
        except Exception as e:
            db.add_log("ERROR", f"Failed to start {self.name}: {str(e)}")
            return False
    
    def stop(self) -> bool:
        """Stop the FFmpeg process"""
        if not self.running or not self.process:
            return False
        
        try:
            self.running = False
            
            # Try graceful termination first
            if os.name == 'nt':
                self.process.terminate()
            else:
                self.process.send_signal(signal.SIGINT)
            
            # Wait for process to terminate
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            
            db.add_log("INFO", f"Stopped process: {self.name}")
            return True
            
        except Exception as e:
            db.add_log("ERROR", f"Failed to stop {self.name}: {str(e)}")
            return False
    
    def _read_output(self):
        """Read process output in a separate thread"""
        if not self.process or not self.process.stdout:
            return
        
        for line in iter(self.process.stdout.readline, b''):
            if not self.running:
                break
            
            try:
                decoded = line.decode('utf-8', errors='replace').strip()
                if decoded:
                    self.output_lines.append(decoded)
                    # Keep only last 100 lines
                    if len(self.output_lines) > 100:
                        self.output_lines.pop(0)
                    
                    if self.on_output:
                        self.on_output(self.name, decoded)
                    
                    # Check for errors
                    if 'error' in decoded.lower():
                        self.error_count += 1
            except:
                pass
        
        self.running = False
    
    def is_alive(self) -> bool:
        """Check if process is still running"""
        if self.process:
            return self.process.poll() is None
        return False
    
    def get_uptime(self) -> float:
        """Get process uptime in seconds"""
        if self.start_time and self.running:
            return time.time() - self.start_time
        return 0


class FFmpegManager:
    """Manages all FFmpeg processes for the application"""
    
    def __init__(self, on_status_change: Optional[Callable] = None, on_log: Optional[Callable] = None):
        self.processes: Dict[str, FFmpegProcess] = {}
        self.on_status_change = on_status_change
        self.on_log = on_log
        self.ffmpeg_path = db.get_setting('ffmpeg_path') or 'ffmpeg'
        self.monitor_thread: Optional[threading.Thread] = None
        self.monitoring = False
    
    def _get_process_key(self, process_type: str, channel_id: int, dest_id: Optional[int] = None) -> str:
        """Generate a unique key for a process"""
        if dest_id:
            return f"{process_type}_{channel_id}_{dest_id}"
        return f"{process_type}_{channel_id}"
    
    def _on_process_output(self, name: str, output: str):
        """Handle process output"""
        if self.on_log:
            self.on_log(name, output)
    
    def start_loop_publisher(self, channel: Dict) -> bool:
        """Start loop publishing for a channel"""
        channel_id = channel['id']
        key = self._get_process_key("loop", channel_id)
        
        # Stop existing process if any
        if key in self.processes:
            self.processes[key].stop()
        
        # Get media file path
        media_folder = db.get_setting('media_folder')
        source_file = channel.get('loop_source_file', '')
        
        if not source_file:
            db.add_log("ERROR", f"No source file configured for channel {channel['name']}", channel_id)
            return False
        
        source_path = os.path.join(media_folder, source_file) if media_folder else source_file
        
        if not os.path.exists(source_path):
            db.add_log("ERROR", f"Source file not found: {source_path}", channel_id)
            return False
        
        # Build FFmpeg command for loop publishing
        # This creates an infinite loop of the source file
        command = [
            self.ffmpeg_path,
            '-re',  # Read input at native frame rate
            '-stream_loop', '-1',  # Infinite loop
            '-i', source_path,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-g', str(channel.get('keyframe_interval', 2) * 30),  # GOP size
            '-c:a', 'aac',
            '-b:a', f"{channel.get('audio_bitrate', 128)}k",
            '-ar', '44100',
            '-f', 'flv',
        ]
        
        # Add video bitrate if transcoding
        video_bitrate = channel.get('video_bitrate', 0)
        if video_bitrate > 0:
            command.extend(['-b:v', f'{video_bitrate}k'])
        else:
            # Use copy if no transcoding needed
            command[command.index('-c:v') + 1] = 'copy'
        
        # Output resolution
        output_res = channel.get('output_resolution', '')
        if output_res:
            command.extend(['-s', output_res])
        
        # For now, output to null/nowhere - the actual streaming happens via destinations
        # This loop keeps the "source" ready - we'll pull from this for destinations
        # Actually, for standalone mode, we directly stream to destinations
        
        # We'll handle this differently - start restreaming directly
        db.update_channel(channel_id, active_source='LOOP')
        
        # Start destination streams
        self._start_channel_destinations(channel, source_path)
        
        if self.on_status_change:
            self.on_status_change(channel_id, 'LOOP')
        
        db.add_log("INFO", f"Loop publishing started for {channel['name']}", channel_id)
        return True
    
    def _start_channel_destinations(self, channel: Dict, source_path: str):
        """Start streaming to all enabled destinations for a channel"""
        channel_id = channel['id']
        destinations = db.get_destinations(channel_id)
        
        for dest in destinations:
            if dest['enabled']:
                self.start_destination_stream(channel, dest, source_path)
    
    def start_destination_stream(self, channel: Dict, destination: Dict, source_path: str) -> bool:
        """Start streaming to a specific destination"""
        channel_id = channel['id']
        dest_id = destination['id']
        key = self._get_process_key("dest", channel_id, dest_id)
        
        # Stop existing process if any
        if key in self.processes:
            self.processes[key].stop()
        
        # Build destination URL
        rtmp_url = destination['rtmp_url']
        stream_key = destination.get('stream_key', '')
        
        if stream_key:
            # Handle URL formats
            if rtmp_url.endswith('/'):
                full_url = f"{rtmp_url}{stream_key}"
            else:
                full_url = f"{rtmp_url}/{stream_key}"
        else:
            full_url = rtmp_url
        
        # Build FFmpeg command
        command = [
            self.ffmpeg_path,
            '-re',
            '-stream_loop', '-1',
            '-i', source_path,
        ]
        
        # Video settings
        video_bitrate = channel.get('video_bitrate', 0)
        if video_bitrate > 0:
            command.extend([
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-b:v', f'{video_bitrate}k',
                '-maxrate', f'{int(video_bitrate * 1.5)}k',
                '-bufsize', f'{video_bitrate * 2}k',
                '-g', str(channel.get('keyframe_interval', 2) * 30),
            ])
        else:
            command.extend(['-c:v', 'copy'])
        
        # Audio settings
        command.extend([
            '-c:a', 'aac',
            '-b:a', f"{channel.get('audio_bitrate', 128)}k",
            '-ar', '44100',
        ])
        
        # Output resolution
        output_res = channel.get('output_resolution', '')
        if output_res and video_bitrate > 0:
            command.extend(['-s', output_res])
        
        # Output
        command.extend([
            '-f', 'flv',
            '-flvflags', 'no_duration_filesize',
            full_url
        ])
        
        # Create and start process
        process = FFmpegProcess(
            f"Dest-{destination['name']}",
            command,
            self._on_process_output
        )
        
        if process.start():
            self.processes[key] = process
            db.update_destination(dest_id, status='CONNECTED')
            db.add_log("INFO", f"Started streaming to {destination['name']}", channel_id)
            return True
        else:
            db.update_destination(dest_id, status='ERROR')
            return False
    
    def stop_loop_publisher(self, channel_id: int) -> bool:
        """Stop loop publishing and all destination streams for a channel"""
        stopped = False
        
        # Stop all related processes
        keys_to_remove = []
        for key, process in self.processes.items():
            if f"_{channel_id}" in key or f"_{channel_id}_" in key:
                process.stop()
                keys_to_remove.append(key)
                stopped = True
        
        for key in keys_to_remove:
            del self.processes[key]
        
        # Update channel status
        db.update_channel(channel_id, active_source='NONE')
        
        # Update destination statuses
        for dest in db.get_destinations(channel_id):
            db.update_destination(dest['id'], status='DISCONNECTED')
        
        if self.on_status_change:
            self.on_status_change(channel_id, 'NONE')
        
        return stopped
    
    def restart_loop_publisher(self, channel: Dict) -> bool:
        """Restart loop publishing for a channel"""
        self.stop_loop_publisher(channel['id'])
        time.sleep(1)  # Brief pause
        return self.start_loop_publisher(channel)
    
    def stop_destination(self, channel_id: int, dest_id: int) -> bool:
        """Stop streaming to a specific destination"""
        key = self._get_process_key("dest", channel_id, dest_id)
        
        if key in self.processes:
            self.processes[key].stop()
            del self.processes[key]
            db.update_destination(dest_id, status='DISCONNECTED')
            return True
        return False
    
    def get_process_status(self, channel_id: int) -> Dict:
        """Get status of all processes for a channel"""
        status = {
            'loop_running': False,
            'destinations': {}
        }
        
        for key, process in self.processes.items():
            if f"loop_{channel_id}" in key:
                status['loop_running'] = process.is_alive()
                status['loop_uptime'] = process.get_uptime()
            elif f"dest_{channel_id}_" in key:
                dest_id = int(key.split('_')[-1])
                status['destinations'][dest_id] = {
                    'running': process.is_alive(),
                    'uptime': process.get_uptime(),
                    'errors': process.error_count
                }
        
        return status
    
    def start_monitoring(self):
        """Start monitoring thread to auto-restart failed processes"""
        self.monitoring = True
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
    
    def stop_monitoring(self):
        """Stop the monitoring thread"""
        self.monitoring = False
    
    def _monitor_loop(self):
        """Monitor and auto-restart failed processes"""
        while self.monitoring:
            try:
                channels = db.get_all_channels()
                
                for channel in channels:
                    if not channel['enabled']:
                        continue
                    
                    channel_id = channel['id']
                    
                    # Check if auto-restart is enabled
                    if not channel.get('auto_restart_loop'):
                        continue
                    
                    # Check loop process
                    if channel.get('active_source') == 'LOOP':
                        for key, process in list(self.processes.items()):
                            if f"_{channel_id}" in key and not process.is_alive():
                                db.add_log("WARN", f"Process died, restarting: {process.name}", channel_id)
                                # Restart the channel
                                self.restart_loop_publisher(channel)
                                break
                
            except Exception as e:
                db.add_log("ERROR", f"Monitor error: {str(e)}")
            
            time.sleep(5)  # Check every 5 seconds
    
    def stop_all(self):
        """Stop all FFmpeg processes"""
        for process in self.processes.values():
            process.stop()
        self.processes.clear()
        self.stop_monitoring()
    
    def get_all_output(self) -> Dict[str, List[str]]:
        """Get output from all processes"""
        return {key: proc.output_lines for key, proc in self.processes.items()}


# Check if FFmpeg is available
def check_ffmpeg() -> tuple[bool, str]:
    """Check if FFmpeg is installed and accessible"""
    ffmpeg_path = db.get_setting('ffmpeg_path') or 'ffmpeg'
    
    try:
        result = subprocess.run(
            [ffmpeg_path, '-version'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode == 0:
            # Extract version
            version_line = result.stdout.split('\n')[0]
            return True, version_line
        else:
            return False, "FFmpeg returned an error"
            
    except FileNotFoundError:
        return False, "FFmpeg not found. Please install FFmpeg."
    except subprocess.TimeoutExpired:
        return False, "FFmpeg check timed out"
    except Exception as e:
        return False, f"Error checking FFmpeg: {str(e)}"
