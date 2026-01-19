"""
Nirantar Live
Enterprise-Grade Production Dashboard
"""

import customtkinter as ctk
import tkinter as tk
from tkinter import messagebox, filedialog
import subprocess
import threading
import os
import time
from datetime import datetime
from typing import List, Dict, Optional, Callable
import webbrowser
import platform
import socket

import database as db
from rtmp_server import StreamManager, get_rtmp_ingest_info
from ffmpeg_manager import check_ffmpeg
from rtmp_ingest_server import FFmpegRTMPServer

# ═══════════════════════════════════════════════════════════════════════════════
# DESIGN SYSTEM
# ═══════════════════════════════════════════════════════════════════════════════

ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

# Professional Dark Theme - Inspired by Linear, Vercel, Raycast
THEME = {
    # Backgrounds
    'bg_app': "#0a0a0a",
    'bg_sidebar': "#0f0f0f", 
    'bg_content': "#0a0a0a",
    'bg_card': "#141414",
    'bg_card_elevated': "#1a1a1a",
    'bg_hover': "#1f1f1f",
    'bg_active': "#262626",
    'bg_input': "#0f0f0f",
    
    # Borders
    'border_subtle': "#1f1f1f",
    'border_default': "#262626",
    'border_strong': "#333333",
    
    # Text
    'text_primary': "#ffffff",
    'text_secondary': "#a3a3a3",
    'text_tertiary': "#737373",
    'text_disabled': "#525252",
    
    # Semantic Colors
    'accent': "#3b82f6",
    'accent_hover': "#2563eb",
    'success': "#22c55e",
    'warning': "#eab308",
    'error': "#ef4444",
    'info': "#06b6d4",
    
    # Special
    'live_indicator': "#22c55e",
    'obs_indicator': "#a855f7",
}

# Typography System
TYPOGRAPHY = {
    'display': ("Inter", 28, "bold"),
    'title': ("Inter", 20, "bold"),
    'heading': ("Inter", 16, "bold"),
    'subheading': ("Inter", 14, "bold"),
    'body': ("Inter", 13),
    'body_medium': ("Inter", 13, "bold"),
    'caption': ("Inter", 11),
    'mono': ("JetBrains Mono", 12),
    'mono_small': ("JetBrains Mono", 10),
}

# Spacing Constants
SPACING = {
    'xs': 4,
    'sm': 8,
    'md': 12,
    'lg': 16,
    'xl': 24,
    'xxl': 32,
}

def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return '127.0.0.1'


# ═══════════════════════════════════════════════════════════════════════════════
# BASE COMPONENTS
# ═══════════════════════════════════════════════════════════════════════════════

class IconButton(ctk.CTkButton):
    """Minimal icon-only button"""
    def __init__(self, master, icon: str, command=None, size=32, **kwargs):
        super().__init__(
            master,
            text=icon,
            width=size,
            height=size,
            corner_radius=6,
            fg_color="transparent",
            hover_color=THEME['bg_hover'],
            text_color=THEME['text_secondary'],
            font=("Inter", 14),
            command=command,
            **kwargs
        )


class PrimaryButton(ctk.CTkButton):
    """Primary action button"""
    def __init__(self, master, text: str, command=None, width=120, **kwargs):
        super().__init__(
            master,
            text=text,
            width=width,
            height=36,
            corner_radius=8,
            fg_color=THEME['accent'],
            hover_color=THEME['accent_hover'],
            text_color="#ffffff",
            font=TYPOGRAPHY['body_medium'],
            command=command,
            **kwargs
        )


class SecondaryButton(ctk.CTkButton):
    """Secondary/ghost button"""
    def __init__(self, master, text: str, command=None, width=100, **kwargs):
        super().__init__(
            master,
            text=text,
            width=width,
            height=32,
            corner_radius=6,
            fg_color=THEME['bg_card_elevated'],
            hover_color=THEME['bg_hover'],
            border_width=1,
            border_color=THEME['border_default'],
            text_color=THEME['text_primary'],
            font=TYPOGRAPHY['body'],
            command=command,
            **kwargs
        )


class DangerButton(ctk.CTkButton):
    """Destructive action button"""
    def __init__(self, master, text: str, command=None, width=100, **kwargs):
        super().__init__(
            master,
            text=text,
            width=width,
            height=32,
            corner_radius=6,
            fg_color="transparent",
            hover_color=THEME['error'],
            border_width=1,
            border_color=THEME['error'],
            text_color=THEME['error'],
            font=TYPOGRAPHY['body'],
            command=command,
            **kwargs
        )


class StatusBadge(ctk.CTkFrame):
    """Status indicator badge"""
    def __init__(self, master, status: str, **kwargs):
        colors = {
            'live': (THEME['success'], "#052e16"),
            'obs': (THEME['obs_indicator'], "#3b0764"),
            'offline': (THEME['text_tertiary'], THEME['bg_card_elevated']),
            'error': (THEME['error'], "#450a0a"),
        }
        
        text_color, bg_color = colors.get(status.lower(), colors['offline'])
        
        super().__init__(master, fg_color=bg_color, corner_radius=4, **kwargs)
        
        # Dot indicator
        dot = ctk.CTkLabel(self, text="●", text_color=text_color, font=("Inter", 8))
        dot.pack(side="left", padx=(8, 4), pady=4)
        
        # Status text
        label = ctk.CTkLabel(
            self, 
            text=status.upper(),
            text_color=text_color,
            font=TYPOGRAPHY['caption']
        )
        label.pack(side="left", padx=(0, 8), pady=4)


# ═══════════════════════════════════════════════════════════════════════════════
# SIDEBAR NAVIGATION
# ═══════════════════════════════════════════════════════════════════════════════

class NavItem(ctk.CTkFrame):
    """Sidebar navigation item"""
    def __init__(self, master, icon: str, label: str, command: Callable, active=False):
        super().__init__(master, fg_color="transparent", height=40, corner_radius=8)
        
        self.command = command
        self.active = active
        self.pack_propagate(False)
        
        # Container for hover effects
        self.container = ctk.CTkFrame(
            self, 
            fg_color=THEME['bg_active'] if active else "transparent",
            corner_radius=8
        )
        self.container.pack(fill="both", expand=True, padx=8)
        
        # Icon
        self.icon_label = ctk.CTkLabel(
            self.container,
            text=icon,
            font=("Inter", 15),
            text_color=THEME['text_primary'] if active else THEME['text_tertiary'],
            width=24
        )
        self.icon_label.pack(side="left", padx=(12, 8))
        
        # Label
        self.text_label = ctk.CTkLabel(
            self.container,
            text=label,
            font=TYPOGRAPHY['body_medium'] if active else TYPOGRAPHY['body'],
            text_color=THEME['text_primary'] if active else THEME['text_secondary'],
            anchor="w"
        )
        self.text_label.pack(side="left", fill="x", expand=True)
        
        # Active indicator
        if active:
            indicator = ctk.CTkFrame(self.container, width=3, height=20, corner_radius=2, fg_color=THEME['accent'])
            indicator.place(relx=0, rely=0.5, anchor="w", x=4)
        
        # Bindings
        for widget in [self, self.container, self.icon_label, self.text_label]:
            widget.bind("<Button-1>", self._on_click)
            widget.bind("<Enter>", self._on_enter)
            widget.bind("<Leave>", self._on_leave)
    
    def _on_click(self, event):
        if self.command:
            self.command()
    
    def _on_enter(self, event):
        if not self.active:
            self.container.configure(fg_color=THEME['bg_hover'])
    
    def _on_leave(self, event):
        if not self.active:
            self.container.configure(fg_color="transparent")
    
    def set_active(self, active: bool):
        self.active = active
        self.container.configure(fg_color=THEME['bg_active'] if active else "transparent")
        self.icon_label.configure(text_color=THEME['text_primary'] if active else THEME['text_tertiary'])
        self.text_label.configure(
            text_color=THEME['text_primary'] if active else THEME['text_secondary'],
            font=TYPOGRAPHY['body_medium'] if active else TYPOGRAPHY['body']
        )


class Sidebar(ctk.CTkFrame):
    """Main sidebar navigation"""
    def __init__(self, master, on_navigate: Callable):
        super().__init__(master, fg_color=THEME['bg_sidebar'], width=240, corner_radius=0)
        self.pack_propagate(False)
        
        self.on_navigate = on_navigate
        self.nav_items = {}
        
        # Brand Header
        brand_frame = ctk.CTkFrame(self, fg_color="transparent", height=64)
        brand_frame.pack(fill="x")
        brand_frame.pack_propagate(False)
        
        brand_label = ctk.CTkLabel(
            brand_frame,
            text="⚡ RTMP Pro",
            font=TYPOGRAPHY['title'],
            text_color=THEME['text_primary']
        )
        brand_label.pack(side="left", padx=20, pady=20)
        
        # Separator
        sep = ctk.CTkFrame(self, fg_color=THEME['border_subtle'], height=1)
        sep.pack(fill="x", padx=16)
        
        # Navigation Section
        nav_section = ctk.CTkFrame(self, fg_color="transparent")
        nav_section.pack(fill="x", pady=16)
        
        nav_label = ctk.CTkLabel(
            nav_section,
            text="NAVIGATION",
            font=TYPOGRAPHY['caption'],
            text_color=THEME['text_tertiary']
        )
        nav_label.pack(anchor="w", padx=20, pady=(0, 8))
        
        # Nav Items
        self.nav_items['dashboard'] = NavItem(nav_section, "📊", "Dashboard", lambda: self._navigate('dashboard'), active=True)
        self.nav_items['dashboard'].pack(fill="x")
        
        self.nav_items['logs'] = NavItem(nav_section, "📄", "Logs", lambda: self._navigate('logs'))
        self.nav_items['logs'].pack(fill="x")
        
        # Settings Section (bottom)
        settings_section = ctk.CTkFrame(self, fg_color="transparent")
        settings_section.pack(side="bottom", fill="x", pady=16)
        
        sep2 = ctk.CTkFrame(settings_section, fg_color=THEME['border_subtle'], height=1)
        sep2.pack(fill="x", padx=16, pady=(0, 16))
        
        self.nav_items['settings'] = NavItem(settings_section, "⚙", "Settings", lambda: self._navigate('settings'))
        self.nav_items['settings'].pack(fill="x")
        
        # System Status
        status_frame = ctk.CTkFrame(self, fg_color=THEME['bg_card'], corner_radius=8)
        status_frame.pack(side="bottom", fill="x", padx=16, pady=(0, 16))
        
        self.ffmpeg_status = ctk.CTkLabel(
            status_frame,
            text="● FFmpeg Ready",
            font=TYPOGRAPHY['caption'],
            text_color=THEME['success']
        )
        self.ffmpeg_status.pack(pady=12)
        
        self._check_ffmpeg()
    
    def _navigate(self, view: str):
        for key, item in self.nav_items.items():
            item.set_active(key == view)
        self.on_navigate(view)
    
    def _check_ffmpeg(self):
        available, version = check_ffmpeg()
        if available:
            self.ffmpeg_status.configure(text="● FFmpeg Ready", text_color=THEME['success'])
        else:
            self.ffmpeg_status.configure(text="● FFmpeg Missing", text_color=THEME['error'])


# ═══════════════════════════════════════════════════════════════════════════════
# CHANNEL CARD
# ═══════════════════════════════════════════════════════════════════════════════

class ChannelCard(ctk.CTkFrame):
    """Professional channel card with status and controls"""
    def __init__(self, master, channel: Dict, on_action: Callable, on_edit: Callable, **kwargs):
        super().__init__(
            master, 
            fg_color=THEME['bg_card'],
            corner_radius=12,
            border_width=1,
            border_color=THEME['border_subtle'],
            **kwargs
        )
        
        self.channel = channel
        self.on_action = on_action
        self.on_edit = on_edit
        
        self._build_ui()
    
    def _build_ui(self):
        # Main container with padding
        container = ctk.CTkFrame(self, fg_color="transparent")
        container.pack(fill="both", expand=True, padx=20, pady=16)
        
        # ─── Top Row: Info + Status ───
        top_row = ctk.CTkFrame(container, fg_color="transparent")
        top_row.pack(fill="x", pady=(0, 16))
        
        # Channel Info
        info_frame = ctk.CTkFrame(top_row, fg_color="transparent")
        info_frame.pack(side="left", fill="x", expand=True)
        
        # Name with status dot
        name_row = ctk.CTkFrame(info_frame, fg_color="transparent")
        name_row.pack(anchor="w")
        
        title = ctk.CTkLabel(
            name_row,
            text=self.channel['display_name'],
            font=TYPOGRAPHY['heading'],
            text_color=THEME['text_primary']
        )
        title.pack(side="left")
        
        # Status
        status = self.channel.get('active_source', 'NONE')
        status_type = 'offline'
        if status == 'LOOP':
            status_type = 'live'
        elif status == 'OBS':
            status_type = 'obs'
        
        badge = StatusBadge(name_row, status_type)
        badge.pack(side="left", padx=(12, 0))
        
        # Slug
        slug = ctk.CTkLabel(
            info_frame,
            text=f"/{self.channel['name']}",
            font=TYPOGRAPHY['caption'],
            text_color=THEME['text_tertiary']
        )
        slug.pack(anchor="w", pady=(4, 0))
        
        # Settings button
        settings_btn = IconButton(top_row, "⚙", command=lambda: self.on_edit(self.channel))
        settings_btn.pack(side="right")
        
        # ─── Separator ───
        sep = ctk.CTkFrame(container, fg_color=THEME['border_subtle'], height=1)
        sep.pack(fill="x", pady=(0, 16))
        
        # ─── Action Buttons ───
        actions_row = ctk.CTkFrame(container, fg_color="transparent")
        actions_row.pack(fill="x")
        
        # Start Loop button
        start_loop_btn = SecondaryButton(
            actions_row,
            text="▶  Start Loop",
            width=120,
            command=lambda: self.on_action(self.channel['id'], 'start_loop')
        )
        start_loop_btn.pack(side="left", padx=(0, 8))
        
        # OBS Ingest button
        obs_btn = SecondaryButton(
            actions_row,
            text="📡  OBS Ingest",
            width=120,
            command=lambda: self.on_action(self.channel['id'], 'start_ingest')
        )
        obs_btn.pack(side="left", padx=(0, 8))
        
        # Stop button (only if streaming)
        if status != 'NONE':
            stop_btn = DangerButton(
                actions_row,
                text="Stop",
                width=80,
                command=lambda: self.on_action(self.channel['id'], 'stop')
            )
            stop_btn.pack(side="left")
        
        # Destinations count
        dests = self.channel.get('destinations', [])
        enabled_count = sum(1 for d in dests if d.get('enabled', True))
        
        dest_label = ctk.CTkLabel(
            actions_row,
            text=f"{enabled_count} destination{'s' if enabled_count != 1 else ''}",
            font=TYPOGRAPHY['caption'],
            text_color=THEME['text_tertiary']
        )
        dest_label.pack(side="right")


# ═══════════════════════════════════════════════════════════════════════════════
# LOGS PANEL
# ═══════════════════════════════════════════════════════════════════════════════

class LogsPanel(ctk.CTkFrame):
    """Real-time logs viewer"""
    def __init__(self, master, **kwargs):
        super().__init__(master, fg_color=THEME['bg_card'], corner_radius=12, **kwargs)
        
        # Header
        header = ctk.CTkFrame(self, fg_color="transparent", height=48)
        header.pack(fill="x", padx=16, pady=(16, 0))
        header.pack_propagate(False)
        
        title = ctk.CTkLabel(header, text="System Logs", font=TYPOGRAPHY['heading'], text_color=THEME['text_primary'])
        title.pack(side="left")
        
        clear_btn = SecondaryButton(header, text="Clear", width=60, command=self.clear)
        clear_btn.pack(side="right")
        
        # Log area
        self.log_area = ctk.CTkTextbox(
            self,
            font=TYPOGRAPHY['mono_small'],
            fg_color=THEME['bg_input'],
            text_color=THEME['text_secondary'],
            corner_radius=8
        )
        self.log_area.pack(fill="both", expand=True, padx=16, pady=16)
        self.log_area.configure(state="disabled")
    
    def log(self, message: str, level: str = "INFO"):
        self.log_area.configure(state="normal")
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        level_colors = {
            "INFO": THEME['text_secondary'],
            "SUCCESS": THEME['success'],
            "WARNING": THEME['warning'],
            "ERROR": THEME['error']
        }
        
        self.log_area.insert("end", f"[{timestamp}] [{level}] {message}\n")
        self.log_area.see("end")
        self.log_area.configure(state="disabled")
    
    def clear(self):
        self.log_area.configure(state="normal")
        self.log_area.delete("1.0", "end")
        self.log_area.configure(state="disabled")


# ═══════════════════════════════════════════════════════════════════════════════
# DIALOGS
# ═══════════════════════════════════════════════════════════════════════════════

class NewChannelDialog(ctk.CTkToplevel):
    """Create new channel dialog"""
    def __init__(self, parent, on_save: Callable):
        super().__init__(parent)
        self.on_save = on_save
        
        self.title("New Channel")
        self.geometry("480x400")
        self.configure(fg_color=THEME['bg_app'])
        self.resizable(False, False)
        
        # Center on parent
        self.transient(parent)
        self.grab_set()
        
        # Content
        content = ctk.CTkFrame(self, fg_color="transparent")
        content.pack(fill="both", expand=True, padx=32, pady=32)
        
        # Title
        title = ctk.CTkLabel(content, text="Create New Channel", font=TYPOGRAPHY['title'], text_color=THEME['text_primary'])
        title.pack(anchor="w", pady=(0, 24))
        
        # Display Name
        ctk.CTkLabel(content, text="Display Name", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w", pady=(0, 4))
        self.name_entry = ctk.CTkEntry(content, height=40, fg_color=THEME['bg_input'], border_color=THEME['border_default'], placeholder_text="My Channel")
        self.name_entry.pack(fill="x", pady=(0, 16))
        self.name_entry.bind("<KeyRelease>", self._auto_slug)
        
        # Slug
        ctk.CTkLabel(content, text="URL Slug", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w", pady=(0, 4))
        self.slug_entry = ctk.CTkEntry(content, height=40, fg_color=THEME['bg_input'], border_color=THEME['border_default'], placeholder_text="my-channel")
        self.slug_entry.pack(fill="x", pady=(0, 16))
        
        # Source File (Optional)
        ctk.CTkLabel(content, text="Loop Source File (Optional)", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w", pady=(0, 4))
        
        source_row = ctk.CTkFrame(content, fg_color="transparent")
        source_row.pack(fill="x", pady=(0, 24))
        
        self.source_entry = ctk.CTkEntry(source_row, height=40, fg_color=THEME['bg_input'], border_color=THEME['border_default'], placeholder_text="/path/to/video.mp4")
        self.source_entry.pack(side="left", fill="x", expand=True, padx=(0, 8))
        
        browse_btn = SecondaryButton(source_row, text="Browse", width=80, command=self._browse)
        browse_btn.pack(side="right")
        
        # Actions
        actions = ctk.CTkFrame(content, fg_color="transparent")
        actions.pack(fill="x", side="bottom")
        
        cancel_btn = SecondaryButton(actions, text="Cancel", command=self.destroy)
        cancel_btn.pack(side="left")
        
        create_btn = PrimaryButton(actions, text="Create Channel", command=self._save)
        create_btn.pack(side="right")
    
    def _auto_slug(self, event):
        name = self.name_entry.get().lower()
        slug = "".join(c if c.isalnum() else "-" for c in name).strip("-")
        self.slug_entry.delete(0, "end")
        self.slug_entry.insert(0, slug)
    
    def _browse(self):
        path = filedialog.askopenfilename(filetypes=[("Video", "*.mp4 *.mkv *.mov *.flv *.avi")])
        if path:
            self.source_entry.delete(0, "end")
            self.source_entry.insert(0, path)
    
    def _save(self):
        name = self.name_entry.get().strip()
        slug = self.slug_entry.get().strip()
        source = self.source_entry.get().strip()
        
        if not name or not slug:
            messagebox.showerror("Error", "Name and slug are required.")
            return
        
        db.create_channel(slug, name, source)
        self.on_save()
        self.destroy()


class ChannelSettingsDialog(ctk.CTkToplevel):
    """Edit channel settings and destinations"""
    def __init__(self, parent, channel: Dict, on_update: Callable):
        super().__init__(parent)
        self.channel = channel
        self.on_update = on_update
        
        self.title(f"Settings: {channel['display_name']}")
        self.geometry("700x650")
        self.configure(fg_color=THEME['bg_app'])
        self.resizable(False, False)
        
        self.transient(parent)
        self.grab_set()
        
        # Tabs
        self.tabview = ctk.CTkTabview(self, fg_color=THEME['bg_card'], segmented_button_fg_color=THEME['bg_card_elevated'])
        self.tabview.pack(fill="both", expand=True, padx=24, pady=24)
        
        self.tabview.add("General")
        self.tabview.add("Stream Settings")
        self.tabview.add("Destinations")
        
        self._build_general_tab()
        self._build_stream_settings_tab()
        self._build_destinations_tab()
    
    def _build_general_tab(self):
        tab = self.tabview.tab("General")
        
        # Scrollable content
        scroll = ctk.CTkScrollableFrame(tab, fg_color="transparent")
        scroll.pack(fill="both", expand=True)
        
        # Name
        ctk.CTkLabel(scroll, text="Display Name", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w", pady=(16, 4))
        self.name_entry = ctk.CTkEntry(scroll, height=40, fg_color=THEME['bg_input'], border_color=THEME['border_default'])
        self.name_entry.insert(0, self.channel['display_name'])
        self.name_entry.pack(fill="x", pady=(0, 16))
        
        # Source
        ctk.CTkLabel(scroll, text="Loop Source File", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w", pady=(0, 4))
        source_row = ctk.CTkFrame(scroll, fg_color="transparent")
        source_row.pack(fill="x", pady=(0, 24))
        
        self.source_entry = ctk.CTkEntry(source_row, height=40, fg_color=THEME['bg_input'], border_color=THEME['border_default'])
        self.source_entry.insert(0, self.channel.get('loop_source_file', '') or '')
        self.source_entry.pack(side="left", fill="x", expand=True, padx=(0, 8))
        
        SecondaryButton(source_row, text="Browse", width=80, command=self._browse).pack(side="right")
        
        # Save button
        PrimaryButton(scroll, text="Save Changes", command=self._save_general).pack(anchor="w", pady=(0, 32))
        
        # Danger Zone
        danger_label = ctk.CTkLabel(scroll, text="Danger Zone", font=TYPOGRAPHY['subheading'], text_color=THEME['error'])
        danger_label.pack(anchor="w", pady=(16, 8))
        
        DangerButton(scroll, text="Delete Channel", width=140, command=self._delete_channel).pack(anchor="w")
    
    def _build_stream_settings_tab(self):
        """Build stream encoding settings tab"""
        tab = self.tabview.tab("Stream Settings")
        
        scroll = ctk.CTkScrollableFrame(tab, fg_color="transparent")
        scroll.pack(fill="both", expand=True)
        
        # Section: Video Settings
        ctk.CTkLabel(scroll, text="VIDEO SETTINGS", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w", pady=(16, 12))
        
        # Video Bitrate
        row1 = ctk.CTkFrame(scroll, fg_color="transparent")
        row1.pack(fill="x", pady=(0, 12))
        
        ctk.CTkLabel(row1, text="Video Bitrate (kbps)", font=TYPOGRAPHY['body'], text_color=THEME['text_secondary'], width=180).pack(side="left")
        self.video_bitrate_entry = ctk.CTkEntry(row1, width=120, height=36, fg_color=THEME['bg_input'], placeholder_text="4500")
        self.video_bitrate_entry.insert(0, str(self.channel.get('video_bitrate', 0) or ''))
        self.video_bitrate_entry.pack(side="left", padx=(0, 8))
        ctk.CTkLabel(row1, text="0 = Auto (4500k)", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(side="left")
        
        # Output Resolution
        row2 = ctk.CTkFrame(scroll, fg_color="transparent")
        row2.pack(fill="x", pady=(0, 12))
        
        ctk.CTkLabel(row2, text="Output Resolution", font=TYPOGRAPHY['body'], text_color=THEME['text_secondary'], width=180).pack(side="left")
        self.resolution_combo = ctk.CTkComboBox(
            row2, 
            width=150,
            values=["", "1920x1080", "1280x720", "854x480", "640x360"],
            fg_color=THEME['bg_input'],
            border_color=THEME['border_default']
        )
        self.resolution_combo.set(self.channel.get('output_resolution', '') or '')
        self.resolution_combo.pack(side="left")
        
        # Keyframe Interval
        row3 = ctk.CTkFrame(scroll, fg_color="transparent")
        row3.pack(fill="x", pady=(0, 12))
        
        ctk.CTkLabel(row3, text="Keyframe Interval (sec)", font=TYPOGRAPHY['body'], text_color=THEME['text_secondary'], width=180).pack(side="left")
        self.keyframe_entry = ctk.CTkEntry(row3, width=80, height=36, fg_color=THEME['bg_input'], placeholder_text="2")
        self.keyframe_entry.insert(0, str(self.channel.get('keyframe_interval', 2) or 2))
        self.keyframe_entry.pack(side="left", padx=(0, 8))
        ctk.CTkLabel(row3, text="YouTube requires 2", font=TYPOGRAPHY['caption'], text_color=THEME['warning']).pack(side="left")
        
        # Section: Audio Settings
        ctk.CTkLabel(scroll, text="AUDIO SETTINGS", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w", pady=(24, 12))
        
        # Audio Bitrate
        row4 = ctk.CTkFrame(scroll, fg_color="transparent")
        row4.pack(fill="x", pady=(0, 12))
        
        ctk.CTkLabel(row4, text="Audio Bitrate (kbps)", font=TYPOGRAPHY['body'], text_color=THEME['text_secondary'], width=180).pack(side="left")
        self.audio_bitrate_combo = ctk.CTkComboBox(
            row4, 
            width=120,
            values=["64", "96", "128", "160", "192", "256", "320"],
            fg_color=THEME['bg_input'],
            border_color=THEME['border_default']
        )
        self.audio_bitrate_combo.set(str(self.channel.get('audio_bitrate', 128) or 128))
        self.audio_bitrate_combo.pack(side="left")
        
        # Section: Advanced
        ctk.CTkLabel(scroll, text="ADVANCED", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w", pady=(24, 12))
        
        # Loop Settings
        row5 = ctk.CTkFrame(scroll, fg_color="transparent")
        row5.pack(fill="x", pady=(0, 12))
        
        self.loop_enabled_var = ctk.BooleanVar(value=self.channel.get('loop_enabled', True))
        ctk.CTkCheckBox(
            row5, 
            text="Enable Loop Playback", 
            variable=self.loop_enabled_var,
            font=TYPOGRAPHY['body'],
            text_color=THEME['text_secondary']
        ).pack(side="left")
        
        row6 = ctk.CTkFrame(scroll, fg_color="transparent")
        row6.pack(fill="x", pady=(0, 12))
        
        self.auto_restart_var = ctk.BooleanVar(value=self.channel.get('auto_restart_loop', True))
        ctk.CTkCheckBox(
            row6, 
            text="Auto-restart on failure", 
            variable=self.auto_restart_var,
            font=TYPOGRAPHY['body'],
            text_color=THEME['text_secondary']
        ).pack(side="left")
        
        # Save button
        PrimaryButton(scroll, text="Save Stream Settings", command=self._save_stream_settings).pack(anchor="w", pady=(24, 16))
    
    def _save_stream_settings(self):
        """Save stream encoding settings"""
        try:
            video_bitrate = int(self.video_bitrate_entry.get() or 0)
        except ValueError:
            video_bitrate = 0
            
        try:
            audio_bitrate = int(self.audio_bitrate_combo.get() or 128)
        except ValueError:
            audio_bitrate = 128
            
        try:
            keyframe = int(self.keyframe_entry.get() or 2)
        except ValueError:
            keyframe = 2
        
        db.update_channel(
            self.channel['id'],
            video_bitrate=video_bitrate,
            audio_bitrate=audio_bitrate,
            keyframe_interval=keyframe,
            output_resolution=self.resolution_combo.get(),
            loop_enabled=self.loop_enabled_var.get(),
            auto_restart_loop=self.auto_restart_var.get()
        )
        
        self.on_update()
        messagebox.showinfo("Saved", "Stream settings updated successfully.")
    
    def _build_destinations_tab(self):
        tab = self.tabview.tab("Destinations")
        
        # Header
        header = ctk.CTkFrame(tab, fg_color="transparent")
        header.pack(fill="x", pady=16)
        
        ctk.CTkLabel(header, text="Streaming Destinations", font=TYPOGRAPHY['heading'], text_color=THEME['text_primary']).pack(side="left")
        PrimaryButton(header, text="+ Add", width=80, command=self._add_destination).pack(side="right")
        
        # Destinations list
        self.dest_list = ctk.CTkScrollableFrame(tab, fg_color="transparent")
        self.dest_list.pack(fill="both", expand=True)
        
        self._refresh_destinations()
    
    def _refresh_destinations(self):
        for w in self.dest_list.winfo_children():
            w.destroy()
        
        dests = db.get_destinations(self.channel['id'])
        
        if not dests:
            ctk.CTkLabel(self.dest_list, text="No destinations added yet.", font=TYPOGRAPHY['body'], text_color=THEME['text_tertiary']).pack(pady=32)
            return
        
        for dest in dests:
            self._create_dest_row(dest)
    
    def _create_dest_row(self, dest: Dict):
        row = ctk.CTkFrame(self.dest_list, fg_color=THEME['bg_card_elevated'], corner_radius=8)
        row.pack(fill="x", pady=4)
        
        # Toggle
        var = ctk.BooleanVar(value=dest.get('enabled', True))
        toggle = ctk.CTkSwitch(row, text="", variable=var, width=40, command=lambda: db.update_destination(dest['id'], enabled=var.get()))
        toggle.pack(side="left", padx=12, pady=12)
        
        # Info
        info = ctk.CTkFrame(row, fg_color="transparent")
        info.pack(side="left", fill="x", expand=True, pady=12)
        
        ctk.CTkLabel(info, text=dest['name'], font=TYPOGRAPHY['body_medium'], text_color=THEME['text_primary']).pack(anchor="w")
        ctk.CTkLabel(info, text=dest['rtmp_url'][:45] + "..." if len(dest['rtmp_url']) > 45 else dest['rtmp_url'], font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w")
        
        # Delete
        IconButton(row, "🗑", command=lambda d=dest['id']: self._delete_dest(d)).pack(side="right", padx=8)
    
    def _add_destination(self):
        dialog = ctk.CTkToplevel(self)
        dialog.title("Add Destination")
        dialog.geometry("400x320")
        dialog.configure(fg_color=THEME['bg_app'])
        dialog.transient(self)
        dialog.grab_set()
        
        content = ctk.CTkFrame(dialog, fg_color="transparent")
        content.pack(fill="both", expand=True, padx=24, pady=24)
        
        ctk.CTkLabel(content, text="Add Destination", font=TYPOGRAPHY['title']).pack(anchor="w", pady=(0, 16))
        
        ctk.CTkLabel(content, text="Name", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w", pady=(0, 4))
        name_entry = ctk.CTkEntry(content, height=36, placeholder_text="YouTube, Facebook, etc.")
        name_entry.pack(fill="x", pady=(0, 12))
        
        ctk.CTkLabel(content, text="RTMP URL", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w", pady=(0, 4))
        url_entry = ctk.CTkEntry(content, height=36, placeholder_text="rtmp://a.rtmp.youtube.com/live2")
        url_entry.pack(fill="x", pady=(0, 12))
        
        ctk.CTkLabel(content, text="Stream Key", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w", pady=(0, 4))
        key_entry = ctk.CTkEntry(content, height=36, show="*")
        key_entry.pack(fill="x", pady=(0, 20))
        
        def save():
            if name_entry.get() and url_entry.get():
                db.create_destination(self.channel['id'], name_entry.get(), url_entry.get(), key_entry.get())
                self._refresh_destinations()
                dialog.destroy()
        
        PrimaryButton(content, text="Add Destination", command=save).pack(anchor="e")
    
    def _delete_dest(self, dest_id: int):
        if messagebox.askyesno("Confirm", "Delete this destination?"):
            db.delete_destination(dest_id)
            self._refresh_destinations()
    
    def _browse(self):
        path = filedialog.askopenfilename(filetypes=[("Video", "*.mp4 *.mkv *.mov *.flv")])
        if path:
            self.source_entry.delete(0, "end")
            self.source_entry.insert(0, path)
    
    def _save_general(self):
        db.update_channel(self.channel['id'], 
                          display_name=self.name_entry.get(),
                          loop_source_file=self.source_entry.get())
        self.on_update()
        messagebox.showinfo("Saved", "Channel updated successfully.")
    
    def _delete_channel(self):
        if messagebox.askyesno("Delete Channel", "Are you sure? This cannot be undone."):
            db.delete_channel(self.channel['id'])
            self.on_update()
            self.destroy()


class SettingsDialog(ctk.CTkToplevel):
    """Application settings"""
    def __init__(self, parent, on_save: Callable):
        super().__init__(parent)
        self.on_save = on_save
        
        self.title("Settings")
        self.geometry("500x400")
        self.configure(fg_color=THEME['bg_app'])
        self.resizable(False, False)
        
        self.transient(parent)
        self.grab_set()
        
        content = ctk.CTkFrame(self, fg_color="transparent")
        content.pack(fill="both", expand=True, padx=32, pady=32)
        
        ctk.CTkLabel(content, text="Application Settings", font=TYPOGRAPHY['title']).pack(anchor="w", pady=(0, 24))
        
        # FFmpeg Path
        ctk.CTkLabel(content, text="FFmpeg Path", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w", pady=(0, 4))
        self.ffmpeg_entry = ctk.CTkEntry(content, height=40, fg_color=THEME['bg_input'])
        self.ffmpeg_entry.insert(0, db.get_setting('ffmpeg_path') or 'ffmpeg')
        self.ffmpeg_entry.pack(fill="x", pady=(0, 16))
        
        # RTMP Port
        ctk.CTkLabel(content, text="RTMP Ingest Port", font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(anchor="w", pady=(0, 4))
        self.port_entry = ctk.CTkEntry(content, height=40, fg_color=THEME['bg_input'], width=120)
        self.port_entry.insert(0, db.get_setting('rtmp_port') or '1935')
        self.port_entry.pack(anchor="w", pady=(0, 8))
        
        ctk.CTkLabel(content, text="Change if port 1935 is in use.", font=TYPOGRAPHY['caption'], text_color=THEME['warning']).pack(anchor="w", pady=(0, 32))
        
        # Actions
        actions = ctk.CTkFrame(content, fg_color="transparent")
        actions.pack(fill="x", side="bottom")
        
        SecondaryButton(actions, text="Cancel", command=self.destroy).pack(side="left")
        PrimaryButton(actions, text="Save Settings", command=self._save).pack(side="right")
    
    def _save(self):
        db.set_setting('ffmpeg_path', self.ffmpeg_entry.get())
        db.set_setting('rtmp_port', self.port_entry.get())
        self.on_save()
        self.destroy()


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN APPLICATION
# ═══════════════════════════════════════════════════════════════════════════════

class RTMPManagerApp(ctk.CTk):
    """Main Application Window"""
    def __init__(self):
        super().__init__()
        
        self.title("Nirantar Live")
        self.geometry("1280x800")
        self.minsize(1024, 600)
        self.configure(fg_color=THEME['bg_app'])
        
        # Initialize managers
        self.stream_manager = StreamManager(on_log=self._log)
        self.ingest_server = FFmpegRTMPServer(
            port=int(db.get_setting('rtmp_port') or '1935'),
            on_log=self._log,
            on_stream_start=self._on_ingest_start,
            on_stream_stop=self._on_ingest_stop
        )
        
        self.current_view = "dashboard"
        
        # Layout
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)
        
        # Sidebar
        self.sidebar = Sidebar(self, on_navigate=self._navigate)
        self.sidebar.grid(row=0, column=0, sticky="nsew")
        
        # Content Area
        self.content_frame = ctk.CTkFrame(self, fg_color=THEME['bg_content'], corner_radius=0)
        self.content_frame.grid(row=0, column=1, sticky="nsew")
        self.content_frame.grid_columnconfigure(0, weight=1)
        self.content_frame.grid_rowconfigure(1, weight=1)
        
        # Views
        self._build_header()
        self._build_views()
        self._build_footer()
        
        # Initial load
        self._refresh_channels()
    
    def _build_header(self):
        """Top header bar"""
        header = ctk.CTkFrame(self.content_frame, fg_color="transparent", height=72)
        header.grid(row=0, column=0, sticky="ew", padx=32, pady=(24, 0))
        header.grid_propagate(False)
        
        # Title (will be updated based on view)
        self.header_title = ctk.CTkLabel(header, text="Dashboard", font=TYPOGRAPHY['display'], text_color=THEME['text_primary'])
        self.header_title.pack(side="left", pady=16)
        
        # Right side actions
        actions = ctk.CTkFrame(header, fg_color="transparent")
        actions.pack(side="right", pady=16)
        
        self.new_channel_btn = PrimaryButton(actions, text="+ New Channel", command=self._new_channel)
        self.new_channel_btn.pack(side="right")
    
    def _build_views(self):
        """Build different views"""
        # Container for views
        self.view_container = ctk.CTkFrame(self.content_frame, fg_color="transparent")
        self.view_container.grid(row=1, column=0, sticky="nsew", padx=32, pady=24)
        
        # Dashboard View
        self.dashboard_view = ctk.CTkScrollableFrame(self.view_container, fg_color="transparent")
        self.dashboard_view.pack(fill="both", expand=True)
        
        # Logs View
        self.logs_view = ctk.CTkFrame(self.view_container, fg_color="transparent")
        self.logs_panel = LogsPanel(self.logs_view)
        self.logs_panel.pack(fill="both", expand=True)

    def _build_footer(self):
        """Bottom footer with copyright"""
        footer = ctk.CTkFrame(self.content_frame, fg_color="transparent")
        footer.grid(row=2, column=0, sticky="ew", padx=32, pady=(0, 16))
        
        # Centered container
        container = ctk.CTkFrame(footer, fg_color="transparent")
        container.pack(expand=True)
        
        copyright_text = f"© {datetime.now().year} "
        ctk.CTkLabel(container, text=copyright_text, font=TYPOGRAPHY['caption'], text_color=THEME['text_tertiary']).pack(side="left")
        
        link = ctk.CTkLabel(container, text="Shital AI", font=TYPOGRAPHY['caption'], text_color=THEME['accent'], cursor="hand2")
        link.pack(side="left")
        link.bind("<Button-1>", lambda e: webbrowser.open("https://shitalai.com"))
    
    def _navigate(self, view: str):
        self.current_view = view
        
        # Hide all views
        self.dashboard_view.pack_forget()
        self.logs_view.pack_forget()
        
        if view == "dashboard":
            self.header_title.configure(text="Dashboard")
            self.new_channel_btn.pack(side="right")
            self.dashboard_view.pack(fill="both", expand=True)
        elif view == "logs":
            self.header_title.configure(text="System Logs")
            self.new_channel_btn.pack_forget()
            self.logs_view.pack(fill="both", expand=True)
        elif view == "settings":
            SettingsDialog(self, self._on_settings_save)
    
    def _refresh_channels(self):
        """Reload channel list"""
        for widget in self.dashboard_view.winfo_children():
            widget.destroy()
        
        channels = db.get_all_channels()
        
        if not channels:
            empty = ctk.CTkFrame(self.dashboard_view, fg_color="transparent")
            empty.pack(fill="both", expand=True, pady=100)
            
            ctk.CTkLabel(empty, text="No Channels", font=TYPOGRAPHY['title'], text_color=THEME['text_primary']).pack()
            ctk.CTkLabel(empty, text="Create your first channel to get started.", font=TYPOGRAPHY['body'], text_color=THEME['text_tertiary']).pack(pady=(8, 24))
            PrimaryButton(empty, text="+ Create Channel", command=self._new_channel).pack()
        else:
            for channel in channels:
                card = ChannelCard(self.dashboard_view, channel, self._handle_action, self._edit_channel)
                card.pack(fill="x", pady=(0, 12))
    
    def _handle_action(self, channel_id: int, action: str):
        """Handle channel actions"""
        channel = db.get_channel(channel_id)
        if not channel:
            return
        
        if action == 'start_loop':
            dests = [d for d in db.get_destinations(channel_id) if d['enabled']]
            if not channel.get('loop_source_file'):
                messagebox.showerror("Error", "No source file configured for this channel.")
                return
            if not dests:
                messagebox.showerror("Error", "Add at least one destination first.")
                return
            
            self._log(f"Starting loop for {channel['display_name']}")
            self.stream_manager.start_loop_to_destinations(channel)
            
        elif action == 'start_ingest':
            dests = [d for d in db.get_destinations(channel_id) if d['enabled']]
            if not dests:
                messagebox.showwarning("Warning", "Add at least one destination in channel settings first.")
                return
            
            local_ip = get_local_ip()
            if self.ingest_server.start_ingest_listener(channel['name'], dests):
                port = self.ingest_server.port
                self._log(f"OBS ingest ready on port {port}")
                messagebox.showinfo("OBS Ready", f"Stream to:\nrtmp://{local_ip}:{port}/live\n\nStream Key: any value")
            else:
                messagebox.showerror("Error", "Failed to start ingest server.")
                
        elif action == 'stop':
            self.stream_manager.stop_stream(channel_id)
            self.ingest_server.stop_ingest(channel['name'])
            self._log(f"Stopped streaming for {channel['display_name']}")
        
        self.after(500, self._refresh_channels)
    
    def _new_channel(self):
        NewChannelDialog(self, self._refresh_channels)
    
    def _edit_channel(self, channel: Dict):
        ChannelSettingsDialog(self, channel, self._refresh_channels)
    
    def _on_settings_save(self):
        port = int(db.get_setting('rtmp_port') or 1935)
        self.ingest_server.port = port
        self._log("Settings updated")
    
    def _log(self, message: str, level: str = "INFO"):
        self.logs_panel.log(message, level)
    
    def _on_ingest_start(self, key: str):
        self._log(f"OBS connected: {key}", "SUCCESS")
        self.after(500, self._refresh_channels)
    
    def _on_ingest_stop(self, key: str):
        self._log(f"OBS disconnected: {key}", "WARNING")
        self.after(500, self._refresh_channels)


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    app = RTMPManagerApp()
    app.mainloop()
