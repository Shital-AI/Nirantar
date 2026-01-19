"""
SRS RTMP Server Manager for Desktop App
Handles downloading, starting, and managing SRS for RTMP ingest
"""

import subprocess
import threading
import os
import platform
import urllib.request
import tarfile
import zipfile
import time
from typing import Optional, Callable
import database as db


class SRSManager:
    """
    Manages the SRS (Simple Realtime Server) for RTMP ingest
    """
    
    SRS_VERSION = "5.0.200"
    
    # Download URLs for different platforms
    DOWNLOAD_URLS = {
        'darwin_arm64': f"https://github.com/ossrs/srs/releases/download/v{SRS_VERSION}/srs-server-{SRS_VERSION}-darwin-arm64.zip",
        'darwin_x86_64': f"https://github.com/ossrs/srs/releases/download/v{SRS_VERSION}/srs-server-{SRS_VERSION}-darwin-x86_64.zip",
        'linux_x86_64': f"https://github.com/ossrs/srs/releases/download/v{SRS_VERSION}/srs-server-{SRS_VERSION}-linux-x86_64.tar.gz",
        'linux_arm64': f"https://github.com/ossrs/srs/releases/download/v{SRS_VERSION}/srs-server-{SRS_VERSION}-linux-aarch64.tar.gz",
    }
    
    def __init__(self, on_log: Optional[Callable] = None, on_status_change: Optional[Callable] = None):
        self.on_log = on_log
        self.on_status_change = on_status_change
        
        self.srs_dir = os.path.join(os.path.dirname(__file__), 'srs')
        self.process: Optional[subprocess.Popen] = None
        self.running = False
        self.port = int(db.get_setting('rtmp_port') or '1935')
        
        os.makedirs(self.srs_dir, exist_ok=True)
    
    def _log(self, message: str):
        """Log a message"""
        if self.on_log:
            self.on_log(f"[SRS] {message}")
        db.add_log("INFO", f"SRS: {message}")
    
    def _get_platform_key(self) -> str:
        """Get the platform key for downloads"""
        system = platform.system().lower()
        machine = platform.machine().lower()
        
        if system == 'darwin':
            if machine in ['arm64', 'aarch64']:
                return 'darwin_arm64'
            return 'darwin_x86_64'
        elif system == 'linux':
            if machine in ['arm64', 'aarch64']:
                return 'linux_arm64'
            return 'linux_x86_64'
        
        return None
    
    def get_srs_path(self) -> str:
        """Get the path to the SRS executable"""
        system = platform.system().lower()
        if system == 'darwin':
            return os.path.join(self.srs_dir, 'srs')
        elif system == 'linux':
            return os.path.join(self.srs_dir, 'srs')
        else:  # Windows not supported by SRS
            return None
    
    def is_installed(self) -> bool:
        """Check if SRS is installed"""
        srs_path = self.get_srs_path()
        return srs_path and os.path.exists(srs_path)
    
    def download(self, progress_callback: Optional[Callable] = None) -> bool:
        """Download SRS for the current platform"""
        platform_key = self._get_platform_key()
        
        if not platform_key:
            self._log(f"Unsupported platform: {platform.system()} {platform.machine()}")
            return False
        
        if platform_key not in self.DOWNLOAD_URLS:
            self._log(f"No SRS download available for {platform_key}")
            return False
        
        url = self.DOWNLOAD_URLS[platform_key]
        self._log(f"Downloading SRS from {url}...")
        
        try:
            # Download file
            archive_name = os.path.basename(url)
            archive_path = os.path.join(self.srs_dir, archive_name)
            
            def report_progress(block_num, block_size, total_size):
                if progress_callback and total_size > 0:
                    progress = min(100, (block_num * block_size * 100) // total_size)
                    progress_callback(progress)
            
            urllib.request.urlretrieve(url, archive_path, report_progress)
            
            self._log("Download complete. Extracting...")
            
            # Extract
            if archive_path.endswith('.zip'):
                with zipfile.ZipFile(archive_path, 'r') as zf:
                    zf.extractall(self.srs_dir)
            elif archive_path.endswith('.tar.gz'):
                with tarfile.open(archive_path, 'r:gz') as tf:
                    tf.extractall(self.srs_dir)
            
            # Clean up archive
            os.remove(archive_path)
            
            # Make executable
            srs_path = self.get_srs_path()
            if srs_path and os.path.exists(srs_path):
                os.chmod(srs_path, 0o755)
            
            self._log("SRS installed successfully")
            return True
            
        except Exception as e:
            self._log(f"Failed to download SRS: {str(e)}")
            return False
    
    def _create_config(self) -> str:
        """Create SRS configuration file"""
        config_path = os.path.join(self.srs_dir, 'srs.conf')
        
        config = f"""
listen              {self.port};
max_connections     100;
daemon              off;
srs_log_tank        console;

http_server {{
    enabled         on;
    listen          {self.port + 80};
    dir             ./objs/nginx/html;
}}

vhost __defaultVhost__ {{
    tcp_nodelay     on;
    min_latency     on;
    
    play {{
        gop_cache       off;
        queue_length    10;
        mw_latency      100;
    }}
    
    publish {{
        mr          off;
    }}
}}
"""
        
        with open(config_path, 'w') as f:
            f.write(config)
        
        return config_path
    
    def start(self) -> bool:
        """Start the SRS server"""
        if self.running:
            return True
        
        if not self.is_installed():
            self._log("SRS not installed. Please download first.")
            return False
        
        srs_path = self.get_srs_path()
        config_path = self._create_config()
        
        self._log(f"Starting SRS on port {self.port}...")
        
        try:
            self.process = subprocess.Popen(
                [srs_path, '-c', config_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=self.srs_dir
            )
            
            # Start output reader
            thread = threading.Thread(target=self._read_output, daemon=True)
            thread.start()
            
            # Wait a bit and check if started
            time.sleep(2)
            
            if self.process.poll() is None:
                self.running = True
                self._log(f"SRS started on rtmp://localhost:{self.port}/live")
                if self.on_status_change:
                    self.on_status_change('running')
                return True
            else:
                self._log("SRS failed to start")
                return False
                
        except Exception as e:
            self._log(f"Failed to start SRS: {str(e)}")
            return False
    
    def _read_output(self):
        """Read SRS output"""
        if not self.process or not self.process.stdout:
            return
        
        for line in iter(self.process.stdout.readline, b''):
            try:
                decoded = line.decode('utf-8', errors='replace').strip()
                if decoded:
                    # Check for client connect/disconnect
                    if 'client identified' in decoded.lower():
                        self._log("OBS/Client connected!")
                        if self.on_status_change:
                            self.on_status_change('client_connected')
                    elif 'disconnect' in decoded.lower():
                        self._log("OBS/Client disconnected")
                        if self.on_status_change:
                            self.on_status_change('client_disconnected')
            except:
                pass
        
        self.running = False
        if self.on_status_change:
            self.on_status_change('stopped')
    
    def stop(self):
        """Stop the SRS server"""
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except:
                try:
                    self.process.kill()
                except:
                    pass
        
        self.running = False
        self.process = None
        self._log("SRS stopped")
        
        if self.on_status_change:
            self.on_status_change('stopped')
    
    def is_running(self) -> bool:
        """Check if SRS is running"""
        if self.process and self.process.poll() is None:
            return True
        self.running = False
        return False
    
    def get_ingest_url(self, stream_key: str) -> str:
        """Get the RTMP ingest URL for a stream key"""
        return f"rtmp://localhost:{self.port}/live/{stream_key}"
    
    def get_status(self) -> dict:
        """Get SRS status"""
        return {
            'installed': self.is_installed(),
            'running': self.is_running(),
            'port': self.port,
            'ingest_url': f"rtmp://localhost:{self.port}/live"
        }
