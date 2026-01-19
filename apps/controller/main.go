package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	_ "github.com/lib/pq"
)

// ========================================
// Configuration
// ========================================

type Config struct {
	DatabaseURL        string
	SRSApiURL          string
	DockerNetwork      string
	LoopImage          string
	RelayImage         string
	EncryptionKey      string
	EnableAutoFailover bool
	CheckInterval      time.Duration
	StabilityWindow    int
	FailoverTimeout    time.Duration
	MediaPath          string
	MediaHostPath      string
}

func LoadConfig() *Config {
	return &Config{
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://livestream_admin:secure_password@postgres:5432/livestream_db?sslmode=disable"),
		SRSApiURL:          getEnv("SRS_API_URL", "http://srs:1985"),
		DockerNetwork:      getEnv("DOCKER_NETWORK", "shital_rtmp_livestream-net"),
		LoopImage:          getEnv("LOOP_IMAGE", "local/loop-publisher:latest"),
		RelayImage:         getEnv("RELAY_IMAGE", "local/relay-manager:latest"),
		EncryptionKey:      getEnv("ENCRYPTION_KEY", "change_me_in_prod_1234567890"), // 32 chars
		EnableAutoFailover: getEnvAsBool("ENABLE_AUTO_FAILOVER", true),
		CheckInterval:      time.Duration(getEnvAsInt("CHECK_INTERVAL_SECONDS", 2)) * time.Second,
		StabilityWindow:    getEnvAsInt("STABILITY_WINDOW", 3),
		FailoverTimeout:    time.Duration(getEnvAsInt("FAILOVER_TIMEOUT_SECONDS", 10)) * time.Second,
		MediaPath:          getEnv("MEDIA_PATH", "/app/media"),
		MediaHostPath:      getEnv("MEDIA_HOST_PATH", "./media"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ========================================
// Data Models
// ========================================

type Channel struct {
	ID                 int    `json:"id"`
	Name               string `json:"name"`
	DisplayName        string `json:"display_name"`
	OBSToken           string `json:"obs_token,omitempty"`
	LoopToken          string `json:"loop_token,omitempty"`
	LoopSourceFile     string `json:"loop_source_file"`
	LoopEnabled        bool   `json:"loop_enabled"`
	Enabled            bool   `json:"enabled"`
	ActiveSource       string `json:"active_source"`
	OBSOverrideEnabled bool   `json:"obs_override_enabled"`
	AutoRestartLoop    bool   `json:"auto_restart_loop"`
	FailoverTimeout    int    `json:"failover_timeout_seconds"`
	// Stream Settings
	KeyframeInterval int    `json:"keyframe_interval"`
	VideoBitrate     int    `json:"video_bitrate"`
	AudioBitrate     int    `json:"audio_bitrate"`
	OutputResolution string `json:"output_resolution"`
	// Runtime Status
	Status       string        `json:"status"`
	Bitrate      int           `json:"bitrate"`
	FPS          float64       `json:"fps"`
	Uptime       string        `json:"uptime"`
	Destinations []Destination `json:"destinations"`

	// Internal: Actual OBS stream name detected (e.g. waheguru-obs or obs_waheguru_...)
	ObsSourceStream string `json:"-"`
}

type Destination struct {
	ID        int    `json:"id"`
	ChannelID int    `json:"channel_id"`
	Name      string `json:"name"`
	RTMPURL   string `json:"rtmp_url"`
	StreamKey string `json:"stream_key,omitempty"`
	Enabled   bool   `json:"enabled"`
	Status    string `json:"status"`
}

type SRSStream struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	App     string `json:"app"`
	LiveMs  int64  `json:"live_ms"`
	Clients int    `json:"clients"`
	Kbps    struct {
		Recv int `json:"recv_30s"`
		Send int `json:"send_30s"`
	} `json:"kbps"`
	Video struct {
		Codec   string `json:"codec"`
		Profile string `json:"profile"`
		Width   int    `json:"width"`
		Height  int    `json:"height"`
	} `json:"video"`
	Audio struct {
		Codec      string `json:"codec"`
		SampleRate int    `json:"sample_rate"`
		Channel    int    `json:"channel"`
	} `json:"audio"`
	Publish struct {
		Active bool   `json:"active"`
		CID    string `json:"cid"`
	} `json:"publish"`
}

type SRSResponse struct {
	Code    int         `json:"code"`
	Server  string      `json:"server"`
	Streams []SRSStream `json:"streams"`
}

type ServiceHealth struct {
	Name      string `json:"name"`
	Status    string `json:"status"`
	Latency   int64  `json:"latency"`
	Uptime    string `json:"uptime"`
	LastCheck string `json:"last_check"`
	Details   string `json:"details"`
}

type SystemMetrics struct {
	CPUUsage      float64 `json:"cpu_usage"`
	MemoryUsage   float64 `json:"memory_usage"`
	MemoryUsedMB  int64   `json:"memory_used_mb"`
	MemoryTotalMB int64   `json:"memory_total_mb"`
	NetworkIn     float64 `json:"network_in"`
	NetworkOut    float64 `json:"network_out"`
}

type LogEntry struct {
	ID        int64  `json:"id"`
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Component string `json:"component"`
	Message   string `json:"message"`
}

type User struct {
	ID          string  `json:"id"`
	Email       string  `json:"email"`
	Name        string  `json:"name"`
	Role        string  `json:"role"`
	IsActive    bool    `json:"is_active"`
	LastLoginAt *string `json:"last_login_at,omitempty"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

// ========================================
// Controller
// ========================================

type Controller struct {
	Config             *Config
	DB                 *sql.DB
	Docker             *client.Client
	HealthHistory      map[string][]bool
	LogBuffer          []LogEntry
	takeoverCooldown   map[string]time.Time // Prevents loop restart after takeover
	activeSourceMap    map[string]string    // In-memory active source tracking (instant updates)
	manualLoopOverride map[string]bool      // Tracks when user manually switched to LOOP (prevents auto-OBS)
	mu                 sync.RWMutex
	logMu              sync.RWMutex
	logID              int64
}

func NewController(cfg *Config) (*Controller, error) {
	var db *sql.DB
	var err error
	for i := 0; i < 30; i++ {
		db, err = sql.Open("postgres", cfg.DatabaseURL)
		if err == nil {
			if err = db.Ping(); err == nil {
				break
			}
		}
		log.Printf("Waiting for database... (%d/30)", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return nil, fmt.Errorf("database connection failed: %v", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	dockerCli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("docker client failed: %v", err)
	}

	ctrl := &Controller{
		Config:             cfg,
		DB:                 db,
		Docker:             dockerCli,
		HealthHistory:      make(map[string][]bool),
		LogBuffer:          make([]LogEntry, 0, 1000),
		takeoverCooldown:   make(map[string]time.Time),
		activeSourceMap:    make(map[string]string),
		manualLoopOverride: make(map[string]bool),
	}

	ctrl.Log("info", "controller", "Controller initialized successfully")
	return ctrl, nil
}

func (c *Controller) Log(level, component, message string) {
	c.logMu.Lock()
	defer c.logMu.Unlock()

	c.logID++
	entry := LogEntry{
		ID:        c.logID,
		Timestamp: time.Now().Format(time.RFC3339),
		Level:     level,
		Component: component,
		Message:   message,
	}

	c.LogBuffer = append(c.LogBuffer, entry)
	if len(c.LogBuffer) > 1000 {
		c.LogBuffer = c.LogBuffer[1:]
	}

	// Also print to stdout
	log.Printf("[%s] [%s] %s", strings.ToUpper(level), component, message)
}

// ========================================
// Reconciliation Loop
// ========================================

func (c *Controller) StartReconciler() {
	log.Printf("Reconciler starting with interval: %v", c.Config.CheckInterval)

	// Run immediately first
	c.Reconcile()

	ticker := time.NewTicker(c.Config.CheckInterval)
	for range ticker.C {
		log.Printf("[RECONCILE] Cycle starting...")
		c.Reconcile()
	}
}

func (c *Controller) Reconcile() {
	channels, err := c.GetChannels()
	if err != nil {
		log.Printf("[ERROR] Failed to get channels: %v", err)
		return
	}

	srsStreams, err := c.FetchSRSStreams()
	if err != nil {
		log.Printf("[WARN] Failed to fetch SRS streams: %v", err)
	}

	// Log stream detection for debugging
	for name, stream := range srsStreams {
		log.Printf("[STREAM] %s: %d kbps (clients=%d, active=%v)",
			name, stream.Kbps.Recv, stream.Clients, stream.Publish.Active)
	}

	for _, ch := range channels {
		c.ReconcileChannel(ch, srsStreams)
	}
}

func (c *Controller) ReconcileChannel(ch Channel, streams map[string]SRSStream) {
	if !ch.Enabled {
		c.EnsureContainerStopped(fmt.Sprintf("loop-%s", ch.Name))
		c.ReconcileDestinations(ch, false)
		return
	}

	containerName := fmt.Sprintf("loop-%s", ch.Name)

	// Check both the main stream and the -obs stream
	loopStream, loopAlive := streams[ch.Name]

	// Check for standard OBS stream name ({channel}-obs)
	obsStream, obsAlive := streams[ch.Name+"-obs"]
	ch.ObsSourceStream = ch.Name + "-obs" // Default expected

	// Fallback: Check if user is streaming to the token name directly
	if !obsAlive && ch.OBSToken != "" {
		if stream, ok := streams[ch.OBSToken]; ok {
			obsStream = stream
			obsAlive = true
			ch.ObsSourceStream = ch.OBSToken
			log.Printf("[DEBUG] Channel %s detected OBS on token stream: %s", ch.Name, ch.OBSToken)
		}
	}

	// More robust liveness check:
	// A stream is alive if it exists AND has an active publisher with actual data
	isLoopRobust := loopAlive && loopStream.Publish.Active && (loopStream.Kbps.Recv > 0 || loopStream.Video.Width > 0)
	// OBS MUST have an active publisher to be considered alive (prevents stale stream detection)
	isObsRobust := obsAlive && obsStream.Publish.Active && obsStream.Kbps.Recv > 100

	// Debug logging for OBS detection
	if obsAlive {
		log.Printf("[DEBUG] Channel %s OBS detected: Robust=%v (kbps=%d, w=%d, active=%v)",
			ch.Name, isObsRobust, obsStream.Kbps.Recv, obsStream.Video.Width, obsStream.Publish.Active)
	}

	c.UpdateHealthHistory(ch.Name+"_loop", isLoopRobust)
	c.UpdateHealthHistory(ch.Name+"_obs", isObsRobust)

	// Get current in-memory source
	c.mu.RLock()
	currentSource := c.activeSourceMap[ch.Name]
	c.mu.RUnlock()
	if currentSource == "" {
		currentSource = "LOOP"
	}

	// Sync from database if different
	if ch.ActiveSource != "" && ch.ActiveSource != currentSource {
		c.mu.Lock()
		c.activeSourceMap[ch.Name] = ch.ActiveSource
		c.mu.Unlock()
		currentSource = ch.ActiveSource
	}

	// Check if user has a manual LOOP override active
	c.mu.RLock()
	hasManualLoopOverride := c.manualLoopOverride[ch.Name]
	c.mu.RUnlock()

	// Clear manual override when OBS disconnects (so next OBS connection can auto-switch)
	if !isObsRobust && hasManualLoopOverride {
		c.mu.Lock()
		delete(c.manualLoopOverride, ch.Name)
		c.mu.Unlock()
		hasManualLoopOverride = false
		log.Printf("[OVERRIDE] Channel %s: Cleared manual LOOP override (OBS disconnected)", ch.Name)
	}

	// AUTO-SWITCH TO OBS: When OBS connects and is robust, auto-switch to OBS
	// BUT respect manual LOOP override - if user manually switched to LOOP, don't auto-switch
	if ch.OBSOverrideEnabled && isObsRobust && currentSource != "OBS" && !hasManualLoopOverride {
		c.mu.Lock()
		c.activeSourceMap[ch.Name] = "OBS"
		c.mu.Unlock()

		log.Printf("[AUTO-SWITCH] Channel %s: LOOP -> OBS (OBS connected with kbps=%d)",
			ch.Name, obsStream.Kbps.Recv)
		c.Log("info", "switch", fmt.Sprintf("Channel %s auto-switched to OBS (connected)", ch.Name))

		// Update database
		go c.UpdateActiveSource(ch.ID, "OBS")
		currentSource = "OBS"
	}

	// Log when manual override is active
	if hasManualLoopOverride && isObsRobust {
		log.Printf("[OVERRIDE] Channel %s: OBS connected (kbps=%d) but manual LOOP override active",
			ch.Name, obsStream.Kbps.Recv)
	}

	// Log when OBS disconnects but we're still on OBS (manual switch needed)
	if currentSource == "OBS" && !isObsRobust {
		log.Printf("[OBS-STATUS] Channel %s: OBS disconnected but staying on OBS source (manual switch to LOOP required)",
			ch.Name)
	}

	// Update struct so subsequent calls use correct source
	ch.ActiveSource = currentSource

	// Check if we're in takeover cooldown (OBS requested but not yet connected)
	c.mu.RLock()
	cooldownTime, inCooldown := c.takeoverCooldown[ch.Name]
	c.mu.RUnlock()

	failoverTimeout := time.Duration(ch.FailoverTimeout) * time.Second
	if failoverTimeout <= 0 {
		failoverTimeout = 60 * time.Second
	}

	if inCooldown && time.Since(cooldownTime) < failoverTimeout {
		c.EnsureContainerStopped(containerName)
		c.ReconcileDestinations(ch, obsAlive || loopAlive)
		return
	} else if inCooldown {
		c.mu.Lock()
		delete(c.takeoverCooldown, ch.Name)
		c.mu.Unlock()
	}

	// Loop management - loop always runs unless manually disabled
	if ch.LoopEnabled {
		c.EnsureContainerRunning(ch, containerName)
	} else {
		// Stop loop if disabled (Direct OBS mode)
		c.EnsureContainerStopped(containerName)
	}

	// Forward to destinations if any stream is active
	streamActive := obsAlive || loopAlive || ch.LoopEnabled
	c.ReconcileDestinations(ch, streamActive)
}

// GetActiveSource returns the current active source from in-memory map (instant)
func (c *Controller) GetActiveSource(channelName string) string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if source, ok := c.activeSourceMap[channelName]; ok {
		return source
	}
	return "LOOP"
}

// GetAllActiveSources returns all active sources from in-memory map
func (c *Controller) GetAllActiveSources() map[string]string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	result := make(map[string]string)
	for k, v := range c.activeSourceMap {
		result[k] = v
	}
	return result
}
func (c *Controller) UpdateHealthHistory(key string, healthy bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	history := c.HealthHistory[key]
	history = append(history, healthy)
	if len(history) > c.Config.StabilityWindow {
		history = history[1:]
	}
	c.HealthHistory[key] = history
}

func (c *Controller) IsStable(key string, expectedState bool) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	history := c.HealthHistory[key]
	if len(history) < c.Config.StabilityWindow {
		return false
	}
	for _, h := range history {
		if h != expectedState {
			return false
		}
	}
	return true
}

// ========================================
// Container Management
// ========================================

func getEnvAsInt(name string, defaultVal int) int {
	valueStr := getEnv(name, "")
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	return defaultVal
}

func getEnvAsBool(name string, defaultVal bool) bool {
	valStr := getEnv(name, "")
	if val, err := strconv.ParseBool(valStr); err == nil {
		return val
	}
	return defaultVal
}

func (c *Controller) EnsureContainerRunning(ch Channel, containerName string) {
	ctx := context.Background()

	info, err := c.Docker.ContainerInspect(ctx, containerName)
	if err == nil {
		if info.State.Running {
			return
		}
		// Not running, remove it to prevent conflicts
		c.Docker.ContainerRemove(ctx, containerName, container.RemoveOptions{Force: true})
	}

	c.Log("info", "docker", fmt.Sprintf("Starting loop container for %s", ch.Name))

	targetURL := fmt.Sprintf("rtmp://srs:1935/live/%s?token=%s", ch.Name, ch.LoopToken)

	videoBitrate := ch.VideoBitrate
	if videoBitrate <= 0 {
		videoBitrate = 4500
	}
	audioBitrate := ch.AudioBitrate
	if audioBitrate <= 0 {
		audioBitrate = 128
	}
	keyframeInterval := ch.KeyframeInterval
	if keyframeInterval <= 0 {
		keyframeInterval = 2
	}

	config := &container.Config{
		Image: c.Config.LoopImage,
		Env: []string{
			fmt.Sprintf("RTMP_URL=%s", targetURL),
			fmt.Sprintf("SOURCE_FILE=/app/media/%s", ch.LoopSourceFile),
			fmt.Sprintf("CHANNEL_NAME=%s", ch.Name),
			fmt.Sprintf("VIDEO_BITRATE=%d", videoBitrate),
			fmt.Sprintf("AUDIO_BITRATE=%d", audioBitrate),
			fmt.Sprintf("KEYFRAME_INTERVAL=%d", keyframeInterval),
			fmt.Sprintf("OUTPUT_RESOLUTION=%s", ch.OutputResolution),
		},
		Labels: map[string]string{
			"managed_by": "livestream-controller",
			"channel":    ch.Name,
		},
	}

	hostConfig := &container.HostConfig{
		NetworkMode:   container.NetworkMode(c.Config.DockerNetwork),
		RestartPolicy: container.RestartPolicy{Name: "on-failure", MaximumRetryCount: 5},
		Resources: container.Resources{
			Memory:   1024 * 1024 * 1024,
			NanoCPUs: 1000000000,
		},
		Binds: []string{
			fmt.Sprintf("%s:/app/media", c.Config.MediaHostPath),
		},
	}

	resp, err := c.Docker.ContainerCreate(ctx, config, hostConfig, nil, nil, containerName)

	if err != nil {
		// Auto-resolve conflict
		if strings.Contains(err.Error(), "Conflict") || strings.Contains(err.Error(), "already in use") {
			c.Log("warn", "docker", fmt.Sprintf("Container conflict for %s, removing old container and retrying...", containerName))
			c.Docker.ContainerRemove(ctx, containerName, container.RemoveOptions{Force: true})
			resp, err = c.Docker.ContainerCreate(ctx, config, hostConfig, nil, nil, containerName)
		}
	}

	if err != nil {
		c.Log("error", "docker", fmt.Sprintf("Failed to create container %s: %v", containerName, err))
		return
	}

	if err := c.Docker.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		c.Log("error", "docker", fmt.Sprintf("Failed to start container %s: %v", containerName, err))
	}
}

func (c *Controller) EnsureContainerStopped(containerName string) {
	ctx := context.Background()
	c.Docker.ContainerRemove(ctx, containerName, container.RemoveOptions{Force: true})
}

// ========================================
// Destination Forwarding
// ========================================

func (c *Controller) ReconcileDestinations(ch Channel, streamActive bool) {
	containerName := fmt.Sprintf("relay-%s", ch.Name)

	// Collect enabled destinations
	var enabledDests []Destination
	for _, dest := range ch.Destinations {
		if dest.Enabled {
			enabledDests = append(enabledDests, dest)
		}
	}

	// Stop relay if stream is down or no enabled destinations
	if !streamActive || len(enabledDests) == 0 {
		c.EnsureContainerStopped(containerName)
		// Update all destinations to disconnected
		for _, dest := range ch.Destinations {
			if dest.Status != "DISCONNECTED" {
				c.UpdateDestinationStatus(dest.ID, "DISCONNECTED")
			}
		}
		return
	}

	// Ensure relay is running/updated with all enabled destinations
	c.EnsureRelayRunning(ch, enabledDests, containerName)
}

func (c *Controller) checkRelayNeedsRestart(ch Channel, containerName string, enabledDests []Destination) bool {
	ctx := context.Background()

	info, err := c.Docker.ContainerInspect(ctx, containerName)
	if err != nil {
		// Container doesn't exist, will be created
		return false
	}

	// Calculate current config hash
	destIDs := make([]string, len(enabledDests))
	for i, d := range enabledDests {
		destIDs[i] = strconv.Itoa(d.ID)
	}
	configHash := fmt.Sprintf("%s|%d|%d|%d|%s|%s",
		strings.Join(destIDs, ","),
		ch.VideoBitrate,
		ch.KeyframeInterval,
		ch.AudioBitrate,
		ch.OutputResolution,
		ch.ActiveSource)

	// Check if config hash matches
	currentHash := info.Config.Labels["config_hash"]
	if currentHash != configHash {
		c.Log("info", "relay", fmt.Sprintf("Configuration changed for %s, restarting relay", ch.Name))
		return true
	}

	return false
}

func (c *Controller) EnsureRelayRunning(ch Channel, destinations []Destination, containerName string) {
	ctx := context.Background()

	// 1. Determine Source URL
	sourceURL := fmt.Sprintf("rtmp://srs:1935/live/%s", ch.Name)
	if ch.ActiveSource == "OBS" {
		obsSource := ch.ObsSourceStream
		if obsSource == "" {
			obsSource = fmt.Sprintf("%s-obs", ch.Name)
		}
		sourceURL = fmt.Sprintf("rtmp://srs:1935/live/%s", obsSource)
	}

	// 2. Build Destinations List
	var destUrls []string
	for _, d := range destinations {
		url := d.RTMPURL
		if d.StreamKey != "" {
			if strings.HasSuffix(url, "/") {
				url += d.StreamKey
			} else {
				url += "/" + d.StreamKey
			}
		}
		// Direct URL - no tee prefix needed (individual FFmpeg per destination)
		destUrls = append(destUrls, url)
	}

	// Default bitrates
	videoBitrate := ch.VideoBitrate
	if videoBitrate <= 0 {
		videoBitrate = 4500
	}
	audioBitrate := ch.AudioBitrate
	if audioBitrate <= 0 {
		audioBitrate = 128
	}
	keyframeInterval := ch.KeyframeInterval
	if keyframeInterval <= 0 {
		keyframeInterval = 2
	}

	payload := map[string]interface{}{
		"source_url":        sourceURL,
		"destinations":      destUrls,
		"video_bitrate":     videoBitrate,
		"audio_bitrate":     audioBitrate,
		"keyframe_interval": keyframeInterval,
	}

	// 3. Check Container
	info, err := c.Docker.ContainerInspect(ctx, containerName)

	// Force recreation if image is different (Migration from old system)
	if err == nil && info.Config.Image != c.Config.RelayImage {
		c.Log("info", "relay", fmt.Sprintf("Upgrading relay %s to new image %s", containerName, c.Config.RelayImage))
		c.Docker.ContainerRemove(ctx, containerName, container.RemoveOptions{Force: true})
		// Set err so logic below creates new one
		err = fmt.Errorf("recreating")
	}

	if err != nil {
		// New Container Logic
		c.Log("info", "relay", fmt.Sprintf("Creating relay manager for %s", ch.Name))

		// Initial Env (simplified, just to boot)
		env := []string{
			fmt.Sprintf("INITIAL_SOURCE_URL=%s", sourceURL),
			fmt.Sprintf("INITIAL_DESTINATION=%s", destUrls[0]), // Just the first one for boot
		}

		// Create Container using RelayImage
		createResp, err := c.Docker.ContainerCreate(ctx, &container.Config{
			Image: c.Config.RelayImage,
			Env:   env,
			Labels: map[string]string{
				"managed_by": "livestream-controller",
				"channel":    ch.Name,
			},
		}, &container.HostConfig{
			NetworkMode: container.NetworkMode(c.Config.DockerNetwork),
			RestartPolicy: container.RestartPolicy{
				Name:              "on-failure",
				MaximumRetryCount: 10,
			},
			Resources: container.Resources{
				Memory:   1024 * 1024 * 1024,
				NanoCPUs: 1000000000,
			},
		}, nil, nil, containerName)

		if err != nil {
			c.Log("error", "relay", fmt.Sprintf("Failed to create container %s: %v", containerName, err))
			return
		}

		if err := c.Docker.ContainerStart(ctx, createResp.ID, container.StartOptions{}); err != nil {
			c.Log("error", "relay", fmt.Sprintf("Failed to start container %s: %v", containerName, err))
			return
		}

		// Wait a moment for startup
		c.Log("info", "relay", fmt.Sprintf("Started relay manager for %s", ch.Name))
		return
	}

	// 4. Update Logic - If running, send update
	if !info.State.Running {
		c.Docker.ContainerStart(ctx, info.ID, container.StartOptions{})
		return
	}

	// Send HTTP Update
	payloadBytes, _ := json.Marshal(payload)
	apiURL := fmt.Sprintf("http://%s:8080/update", containerName)

	// Set timeout
	httpClient := &http.Client{Timeout: 2 * time.Second}

	resp, err := httpClient.Post(apiURL, "application/json", bytes.NewBuffer(payloadBytes))
	if err != nil {
		// Container might be starting up or restarting, silent error
		// c.Log("warn", "relay", fmt.Sprintf("Failed to update relay %s: %v", ch.Name, err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		// Update status to CONNECTED if update succeeded
		for _, d := range destinations {
			if d.Status != "CONNECTED" {
				c.UpdateDestinationStatus(d.ID, "CONNECTED")
			}
		}
	}
}

func (c *Controller) UpdateDestinationStatus(destID int, status string) {
	_, err := c.DB.Exec("UPDATE destinations SET status = $1 WHERE id = $2", status, destID)
	if err != nil {
		c.Log("error", "database", fmt.Sprintf("Failed to update destination status: %v", err))
	}
}

// ========================================
// Database Operations
// ========================================

func (c *Controller) GetChannels() ([]Channel, error) {
	// Fetch Columns including Encrypted ones and Stream Settings
	rows, err := c.DB.Query(`
		SELECT id, name, display_name, obs_token, loop_token, loop_source_file, 
		       loop_enabled, enabled, current_active_source, obs_override_enabled, 
		       auto_restart_loop, failover_timeout_seconds,
		       obs_token_encrypted, obs_token_iv, loop_token_encrypted, loop_token_iv,
		       COALESCE(keyframe_interval, 2), COALESCE(video_bitrate, 0), 
		       COALESCE(audio_bitrate, 128), COALESCE(output_resolution, '')
		FROM channels
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	srsStreams, _ := c.FetchSRSStreams()

	var channels []Channel
	for rows.Next() {
		var ch Channel
		var obsTokenEnc, obsTokenIV, loopTokenEnc, loopTokenIV sql.NullString

		err := rows.Scan(
			&ch.ID, &ch.Name, &ch.DisplayName, &ch.OBSToken, &ch.LoopToken,
			&ch.LoopSourceFile, &ch.LoopEnabled, &ch.Enabled, &ch.ActiveSource,
			&ch.OBSOverrideEnabled, &ch.AutoRestartLoop, &ch.FailoverTimeout,
			&obsTokenEnc, &obsTokenIV, &loopTokenEnc, &loopTokenIV,
			&ch.KeyframeInterval, &ch.VideoBitrate, &ch.AudioBitrate, &ch.OutputResolution,
		)
		if err != nil {
			continue
		}

		// Decrypt tokens if present
		if obsTokenEnc.Valid && obsTokenIV.Valid {
			if decrypted, err := Decrypt(obsTokenEnc.String, obsTokenIV.String); err == nil {
				ch.OBSToken = decrypted
			}
		}
		if loopTokenEnc.Valid && loopTokenIV.Valid {
			if decrypted, err := Decrypt(loopTokenEnc.String, loopTokenIV.String); err == nil {
				ch.LoopToken = decrypted
			}
		}

		// Enrich with live data
		if stream, ok := srsStreams[ch.Name]; ok {
			ch.Bitrate = stream.Kbps.Recv
			ch.Status = "LIVE"
			ch.Uptime = fmt.Sprintf("%dh %dm", stream.LiveMs/3600000, (stream.LiveMs%3600000)/60000)
		} else if ch.Enabled {
			ch.Status = ch.ActiveSource
		} else {
			ch.Status = "DOWN"
		}

		// Get destinations
		ch.Destinations, _ = c.GetDestinations(ch.ID)

		channels = append(channels, ch)
	}
	return channels, nil
}

func (c *Controller) GetDestinations(channelID int) ([]Destination, error) {
	rows, err := c.DB.Query(`
		SELECT id, channel_id, name, rtmp_url, COALESCE(stream_key, ''), enabled, status
		FROM destinations WHERE channel_id = $1
	`, channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dests []Destination
	for rows.Next() {
		var d Destination
		if err := rows.Scan(&d.ID, &d.ChannelID, &d.Name, &d.RTMPURL, &d.StreamKey, &d.Enabled, &d.Status); err != nil {
			continue
		}
		dests = append(dests, d)
	}
	return dests, nil
}

func (c *Controller) UpdateActiveSource(channelID int, source string) {
	_, err := c.DB.Exec(`
		UPDATE channels SET current_active_source = $1, updated_at = NOW() 
		WHERE id = $2
	`, source, channelID)
	if err != nil {
		c.Log("error", "database", fmt.Sprintf("Failed to update active source: %v", err))
	}
}

// ========================================
// SRS Integration
// ========================================

func (c *Controller) FetchSRSStreams() (map[string]SRSStream, error) {
	resp, err := http.Get(c.Config.SRSApiURL + "/api/v1/streams")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var srsResp SRSResponse
	if err := json.NewDecoder(resp.Body).Decode(&srsResp); err != nil {
		return nil, err
	}

	result := make(map[string]SRSStream)
	for _, s := range srsResp.Streams {
		result[s.Name] = s
	}
	return result, nil
}

// ========================================
// HTTP API
// ========================================

func (c *Controller) SetupRoutes() *http.ServeMux {
	mux := http.NewServeMux()

	// Health endpoints
	mux.HandleFunc("/health", c.HealthHandler)
	mux.HandleFunc("/ready", c.ReadyHandler)

	// SRS Hooks
	mux.HandleFunc("/api/hooks/on_publish", c.OnPublishHandler)
	mux.HandleFunc("/api/hooks/on_unpublish", c.OnUnpublishHandler)

	// API endpoints
	mux.HandleFunc("/api/channels", c.ChannelsHandler)
	mux.HandleFunc("/api/channels/", c.ChannelActionHandler)
	mux.HandleFunc("/api/destinations", c.DestinationsHandler)
	mux.HandleFunc("/api/destinations/", c.DestinationActionHandler)
	mux.HandleFunc("/api/media", c.MediaHandler)
	mux.HandleFunc("/api/media/status", c.MediaStatusHandler)
	mux.HandleFunc("/api/media/upload", c.UploadHandler)
	mux.HandleFunc("/api/media/", c.MediaItemHandler)
	mux.HandleFunc("/api/system/status", c.SystemStatusHandler)
	mux.HandleFunc("/api/health/services", c.ServicesHealthHandler)
	mux.HandleFunc("/api/logs", c.LogsHandler)
	mux.HandleFunc("/api/metrics", c.MetricsHandler)
	mux.HandleFunc("/api/audit-logs", c.AuditLogsHandler)
	mux.HandleFunc("/api/config", c.SystemConfigHandler)
	mux.HandleFunc("/api/takeover/", c.TakeoverHandler)
	mux.HandleFunc("/api/hooks/on_connect", c.OnConnectHandler)
	mux.HandleFunc("/api/active-sources", c.ActiveSourcesHandler) // Real-time in-memory sources
	mux.HandleFunc("/api/users", c.UsersHandler)
	mux.HandleFunc("/api/users/", c.UserActionHandler)

	return mux
}

func generateToken() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (c *Controller) setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")
}

func (c *Controller) HealthHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
}

func (c *Controller) ReadyHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if err := c.DB.Ping(); err != nil {
		http.Error(w, "Database not ready", http.StatusServiceUnavailable)
		return
	}
	json.NewEncoder(w).Encode(map[string]string{"status": "ready"})
}

// ActiveSourcesHandler returns real-time in-memory active sources
func (c *Controller) ActiveSourcesHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	sources := c.GetAllActiveSources()
	json.NewEncoder(w).Encode(sources)
}

func (c *Controller) MediaHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if r.Method == "OPTIONS" {
		return
	}

	// Ensure media directory exists
	if _, err := os.Stat(c.Config.MediaPath); os.IsNotExist(err) {
		if err := os.MkdirAll(c.Config.MediaPath, 0755); err != nil {
			c.Log("error", "api", fmt.Sprintf("Failed to create media directory %s: %v", c.Config.MediaPath, err))
			http.Error(w, "Failed to initialize media directory", http.StatusInternalServerError)
			return
		}
	}

	files, err := os.ReadDir(c.Config.MediaPath)
	if err != nil {
		c.Log("error", "api", fmt.Sprintf("Failed to read media directory %s: %v", c.Config.MediaPath, err))
		http.Error(w, "Failed to read media directory", http.StatusInternalServerError)
		return
	}

	mediaFiles := []string{}
	for _, f := range files {
		if !f.IsDir() && (strings.HasSuffix(f.Name(), ".mp4") || strings.HasSuffix(f.Name(), ".mkv") || strings.HasSuffix(f.Name(), ".mov")) {
			mediaFiles = append(mediaFiles, f.Name())
		}
	}
	json.NewEncoder(w).Encode(mediaFiles)
}

// MediaStatusHandler returns detailed info about each media file including optimization status
func (c *Controller) MediaStatusHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if r.Method == "OPTIONS" {
		return
	}

	type MediaFileInfo struct {
		Filename     string  `json:"filename"`
		Size         int64   `json:"size"`
		IsOptimizing bool    `json:"is_optimizing"`
		Progress     float64 `json:"progress"` // 0-100
		TempSize     int64   `json:"temp_size,omitempty"`
	}

	files, err := os.ReadDir(c.Config.MediaPath)
	if err != nil {
		http.Error(w, "Failed to read media directory", http.StatusInternalServerError)
		return
	}

	// Build a map of temp files and their sizes
	tempFiles := make(map[string]int64)
	for _, f := range files {
		if strings.Contains(f.Name(), ".temp") && !f.IsDir() {
			info, err := f.Info()
			if err == nil {
				tempFiles[f.Name()] = info.Size()
			}
		}
	}

	result := []MediaFileInfo{}
	for _, f := range files {
		if f.IsDir() {
			continue
		}
		name := f.Name()
		// Skip temp, original, optimized marker files
		if strings.Contains(name, ".temp") || strings.Contains(name, ".original") || strings.Contains(name, ".optimized") {
			continue
		}
		if !strings.HasSuffix(name, ".mp4") && !strings.HasSuffix(name, ".mkv") && !strings.HasSuffix(name, ".mov") {
			continue
		}

		info, err := f.Info()
		if err != nil {
			continue
		}

		fileInfo := MediaFileInfo{
			Filename: name,
			Size:     info.Size(),
		}

		// Check if there's a temp file being created for this
		baseName := strings.TrimSuffix(name, filepath.Ext(name))
		tempName := baseName + ".optimized.temp.mp4"
		if tempSize, ok := tempFiles[tempName]; ok {
			fileInfo.IsOptimizing = true
			fileInfo.TempSize = tempSize
			// Estimate progress: temp file grows towards original size (roughly)
			if info.Size() > 0 {
				// Since we're transcoding, output is typically similar size
				// Use 80% of original as target estimate
				targetSize := float64(info.Size()) * 0.8
				if targetSize > 0 {
					fileInfo.Progress = (float64(tempSize) / targetSize) * 100
					if fileInfo.Progress > 99 {
						fileInfo.Progress = 99 // Cap at 99 until complete
					}
				}
			}
		}

		result = append(result, fileInfo)
	}

	json.NewEncoder(w).Encode(result)
}

func (c *Controller) UploadHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if r.Method == "OPTIONS" {
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 10GB limit
	r.Body = http.MaxBytesReader(w, r.Body, 10<<30)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "File too big or parse error", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Invalid file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	filename := filepath.Base(header.Filename)
	ext := strings.ToLower(filepath.Ext(filename))
	if ext != ".mp4" && ext != ".mkv" && ext != ".mov" {
		http.Error(w, "Only mp4, mkv, mov allowed", http.StatusBadRequest)
		return
	}

	dstPath := filepath.Join(c.Config.MediaPath, filename)
	if err := os.MkdirAll(c.Config.MediaPath, 0755); err != nil {
		c.Log("error", "api", fmt.Sprintf("Failed to create directory %s: %v", c.Config.MediaPath, err))
		http.Error(w, "Failed to create directory", http.StatusInternalServerError)
		return
	}

	dst, err := os.Create(dstPath)
	if err != nil {
		c.Log("error", "api", fmt.Sprintf("Failed to create file %s: %v", dstPath, err))
		http.Error(w, "Failed to create file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		c.Log("error", "api", fmt.Sprintf("Failed to write file %s: %v", dstPath, err))
		http.Error(w, "Failed to save file", http.StatusInternalServerError)
		return
	}

	c.Log("info", "api", fmt.Sprintf("Uploaded file %s", filename))
	json.NewEncoder(w).Encode(map[string]string{"status": "uploaded", "file": filename})
}

func (c *Controller) MediaItemHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if r.Method == "OPTIONS" {
		return
	}

	filename := strings.TrimPrefix(r.URL.Path, "/api/media/")
	if filename == "" || filename == "/" {
		http.Error(w, "Filename required", http.StatusBadRequest)
		return
	}

	if strings.Contains(filename, "..") || strings.Contains(filename, "/") {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(c.Config.MediaPath, filename)

	if r.Method == "GET" {
		http.ServeFile(w, r, filePath)
		return
	}

	if r.Method == "DELETE" {
		if err := os.Remove(filePath); err != nil {
			if os.IsNotExist(err) {
				http.Error(w, "File not found", http.StatusNotFound)
				return
			}
			c.Log("error", "api", fmt.Sprintf("Failed to delete file %s: %v", filePath, err))
			http.Error(w, "Failed to delete file", http.StatusInternalServerError)
			return
		}
		c.Log("info", "api", fmt.Sprintf("Deleted file %s", filename))
		w.WriteHeader(http.StatusOK)
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func (c *Controller) AuditLogsHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if r.Method == "OPTIONS" {
		return
	}

	rows, err := c.DB.Query("SELECT id, action, user_email, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100")
	if err != nil {
		c.Log("error", "api", fmt.Sprintf("Failed to fetch audit logs: %v", err))
		http.Error(w, "Failed to fetch logs", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var logs []map[string]interface{}
	for rows.Next() {
		var id int
		var action string
		var email sql.NullString
		var details []byte // jsonb
		var createdAt time.Time
		if err := rows.Scan(&id, &action, &email, &details, &createdAt); err != nil {
			continue
		}

		var detailsMap map[string]interface{}
		if len(details) > 0 {
			json.Unmarshal(details, &detailsMap)
		}

		logs = append(logs, map[string]interface{}{
			"id":         id,
			"action":     action,
			"user_email": email.String,
			"details":    detailsMap,
			"created_at": createdAt,
		})
	}
	if logs == nil {
		logs = []map[string]interface{}{}
	}
	json.NewEncoder(w).Encode(logs)
}

func (c *Controller) SystemConfigHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if r.Method == "OPTIONS" {
		return
	}

	if r.Method == "GET" {
		rows, err := c.DB.Query("SELECT key, value, description FROM system_config")
		if err != nil {
			c.Log("error", "api", fmt.Sprintf("Failed to fetch config: %v", err))
			http.Error(w, "Failed to fetch config", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		configs := []map[string]interface{}{}
		for rows.Next() {
			var key string
			var value []byte
			var description sql.NullString
			if err := rows.Scan(&key, &value, &description); err != nil {
				continue
			}
			var val interface{}
			json.Unmarshal(value, &val)
			configs = append(configs, map[string]interface{}{
				"key":         key,
				"value":       val,
				"description": description.String,
			})
		}
		json.NewEncoder(w).Encode(configs)
		return
	}

	if r.Method == "PUT" {
		var req struct {
			Key   string                 `json:"key"`
			Value map[string]interface{} `json:"value"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		valBytes, _ := json.Marshal(req.Value)
		_, err := c.DB.Exec("UPDATE system_config SET value = $1 WHERE key = $2", valBytes, req.Key)
		if err != nil {
			c.Log("error", "api", fmt.Sprintf("Failed to update config %s: %v", req.Key, err))
			http.Error(w, "Db error", http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
		return
	}
}

func (c *Controller) ChannelsHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if r.Method == "OPTIONS" {
		return
	}

	if r.Method == "POST" {
		var req struct {
			Name           string `json:"name"`
			DisplayName    string `json:"display_name"`
			LoopSourceFile string `json:"loop_source_file"`
			Enabled        bool   `json:"enabled"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		if req.Name == "" || req.DisplayName == "" {
			http.Error(w, "Name and Display Name required", http.StatusBadRequest)
			return
		}

		obsToken := generateToken()
		loopToken := generateToken()

		// Encryption
		obsHash := HashToken(obsToken)
		obsEnc, obsIV, _ := Encrypt(obsToken)
		loopHash := HashToken(loopToken)
		loopEnc, loopIV, _ := Encrypt(loopToken)

		// Get Org ID (Default)
		var orgID string
		if err := c.DB.QueryRow("SELECT id FROM organizations LIMIT 1").Scan(&orgID); err != nil {
			c.Log("error", "api", "No organization found")
			http.Error(w, "System not initialized", http.StatusInternalServerError)
			return
		}

		var id int
		err := c.DB.QueryRow(`
			INSERT INTO channels 
			(name, display_name, enabled, obs_token, loop_token, loop_source_file, current_active_source, loop_enabled, obs_override_enabled, auto_restart_loop, failover_timeout_seconds, organization_id, obs_token_hash, obs_token_encrypted, obs_token_iv, loop_token_hash, loop_token_encrypted, loop_token_iv)
			VALUES ($1, $2, $3, $4, $5, $6, 'NONE', false, true, true, 10, $7, $8, $9, $10, $11, $12, $13)
			RETURNING id
		`, req.Name, req.DisplayName, req.Enabled, obsToken, loopToken, req.LoopSourceFile, orgID, obsHash, obsEnc, obsIV, loopHash, loopEnc, loopIV).Scan(&id)

		if err != nil {
			c.Log("error", "api", fmt.Sprintf("Failed to create channel: %v", err))
			http.Error(w, "Failed to create channel", http.StatusInternalServerError)
			return
		}

		c.Log("info", "api", fmt.Sprintf("Created channel %s (%d)", req.Name, id))
		json.NewEncoder(w).Encode(map[string]interface{}{"id": id, "status": "created"})
		return
	}

	channels, err := c.GetChannels()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(channels)
}

func (c *Controller) ChannelActionHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if r.Method == "OPTIONS" {
		return
	}

	// Parse path: /api/channels/{id}/{action} or /api/channels/{id}
	path := strings.TrimPrefix(r.URL.Path, "/api/channels/")
	parts := strings.Split(path, "/")

	if len(parts) < 1 {
		http.Error(w, "Channel ID required", http.StatusBadRequest)
		return
	}

	channelID, err := strconv.Atoi(parts[0])
	if err != nil {
		http.Error(w, "Invalid channel ID", http.StatusBadRequest)
		return
	}

	// Handle Updates (PUT)
	if r.Method == "PUT" && len(parts) == 1 {
		var req struct {
			DisplayName            string `json:"display_name"`
			LoopSourceFile         string `json:"loop_source_file"`
			LoopEnabled            bool   `json:"loop_enabled"`
			OBSOverrideEnabled     bool   `json:"obs_override_enabled"`
			AutoRestartLoop        bool   `json:"auto_restart_loop"`
			FailoverTimeoutSeconds int    `json:"failover_timeout_seconds"`
			KeyframeInterval       int    `json:"keyframe_interval"`
			VideoBitrate           int    `json:"video_bitrate"`
			AudioBitrate           int    `json:"audio_bitrate"`
			OutputResolution       string `json:"output_resolution"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		_, err := c.DB.Exec(`
			UPDATE channels 
			SET display_name = COALESCE(NULLIF($1, ''), display_name), 
			    loop_source_file = $2, 
			    loop_enabled = $3, 
			    obs_override_enabled = $4, 
			    auto_restart_loop = $5, 
			    failover_timeout_seconds = $6,
			    keyframe_interval = $7,
			    video_bitrate = $8,
			    audio_bitrate = $9,
			    output_resolution = $10
			WHERE id = $11
		`, req.DisplayName, req.LoopSourceFile, req.LoopEnabled, req.OBSOverrideEnabled,
			req.AutoRestartLoop, req.FailoverTimeoutSeconds,
			req.KeyframeInterval, req.VideoBitrate, req.AudioBitrate, req.OutputResolution, channelID)

		if err != nil {
			c.Log("error", "api", fmt.Sprintf("Failed to update channel %d: %v", channelID, err))
			http.Error(w, "Failed to update channel", http.StatusInternalServerError)
			return
		}

		c.Log("info", "api", fmt.Sprintf("Updated settings for channel %d", channelID))
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
		return
	}

	// Handle Delete (DELETE)
	if r.Method == "DELETE" && len(parts) == 1 {
		// Get channel info for container cleanup
		var chName string
		err := c.DB.QueryRow("SELECT name FROM channels WHERE id = $1", channelID).Scan(&chName)
		if err != nil && err != sql.ErrNoRows {
			http.Error(w, "Failed to get channel", http.StatusInternalServerError)
			return
		}

		// 1. Stop and remove container if it exists
		if chName != "" {
			ctx := context.Background()
			containerName := fmt.Sprintf("loop-%s", chName)
			c.Docker.ContainerRemove(ctx, containerName, container.RemoveOptions{Force: true})
		}

		// 2. Delete destinations (cascade is usually better but explicit here)
		_, err = c.DB.Exec("DELETE FROM destinations WHERE channel_id = $1", channelID)
		if err != nil {
			c.Log("error", "api", fmt.Sprintf("Failed to delete destinations for channel %d: %v", channelID, err))
		}

		// 3. Delete channel
		_, err = c.DB.Exec("DELETE FROM channels WHERE id = $1", channelID)
		if err != nil {
			c.Log("error", "api", fmt.Sprintf("Failed to delete channel %d: %v", channelID, err))
			http.Error(w, "Failed to delete channel", http.StatusInternalServerError)
			return
		}

		c.Log("info", "api", fmt.Sprintf("Deleted channel %d", channelID))
		w.WriteHeader(http.StatusOK)
		return
	}

	action := ""
	if len(parts) > 1 {
		action = parts[1]
	}

	// Get channel info (needed for start/stop actions)
	var ch Channel
	err = c.DB.QueryRow(`
		SELECT id, name, display_name, enabled, loop_enabled
		FROM channels WHERE id = $1
	`, channelID).Scan(&ch.ID, &ch.Name, &ch.DisplayName, &ch.Enabled, &ch.LoopEnabled)

	if err == sql.ErrNoRows {
		http.Error(w, "Channel not found", http.StatusNotFound)
		return
	}

	containerName := fmt.Sprintf("loop-%s", ch.Name)
	ctx := context.Background()

	switch action {
	case "start":
		// Start the loop container
		c.Log("info", "api", fmt.Sprintf("Starting loop for channel %s", ch.Name))
		// First ensure loop_enabled is true
		c.DB.Exec("UPDATE channels SET loop_enabled = true WHERE id = $1", channelID)
		// Get full channel for container creation
		channels, _ := c.GetChannels()
		for _, fullCh := range channels {
			if fullCh.ID == channelID {
				c.EnsureContainerRunning(fullCh, containerName)
				break
			}
		}
		json.NewEncoder(w).Encode(map[string]string{"status": "started", "channel": ch.Name})

	case "stop":
		// Stop the loop container
		c.Log("info", "api", fmt.Sprintf("Stopping loop for channel %s", ch.Name))
		c.Docker.ContainerRemove(ctx, containerName, container.RemoveOptions{Force: true})
		json.NewEncoder(w).Encode(map[string]string{"status": "stopped", "channel": ch.Name})

	case "restart":
		// Restart the loop container
		c.Log("info", "api", fmt.Sprintf("Restarting loop for channel %s", ch.Name))
		c.Docker.ContainerRemove(ctx, containerName, container.RemoveOptions{Force: true})
		time.Sleep(500 * time.Millisecond)
		channels, _ := c.GetChannels()
		for _, fullCh := range channels {
			if fullCh.ID == channelID {
				c.EnsureContainerRunning(fullCh, containerName)
				break
			}
		}
		json.NewEncoder(w).Encode(map[string]string{"status": "restarted", "channel": ch.Name})

	case "enable":
		c.Log("info", "api", fmt.Sprintf("Enabling channel %s", ch.Name))
		c.DB.Exec("UPDATE channels SET enabled = true WHERE id = $1", channelID)
		json.NewEncoder(w).Encode(map[string]string{"status": "enabled", "channel": ch.Name})

	case "disable":
		c.Log("info", "api", fmt.Sprintf("Disabling channel %s", ch.Name))
		c.DB.Exec("UPDATE channels SET enabled = false WHERE id = $1", channelID)
		c.Docker.ContainerRemove(ctx, containerName, container.RemoveOptions{Force: true})
		json.NewEncoder(w).Encode(map[string]string{"status": "disabled", "channel": ch.Name})

	case "switch-to-loop":
		c.Log("info", "api", fmt.Sprintf("Manually switching channel %s to LOOP", ch.Name))
		// Update database
		c.DB.Exec("UPDATE channels SET current_active_source = 'LOOP' WHERE id = $1", channelID)
		// Update in-memory map and set manual override
		c.mu.Lock()
		c.activeSourceMap[ch.Name] = "LOOP"
		c.manualLoopOverride[ch.Name] = true // Prevent auto-switch back to OBS
		c.mu.Unlock()
		c.Log("info", "switch", fmt.Sprintf("Channel %s switched to LOOP (manual override active)", ch.Name))
		json.NewEncoder(w).Encode(map[string]string{"status": "switched", "source": "LOOP", "channel": ch.Name})

	case "switch-to-obs":
		c.Log("info", "api", fmt.Sprintf("Manually switching channel %s to OBS", ch.Name))
		// Update database
		c.DB.Exec("UPDATE channels SET current_active_source = 'OBS' WHERE id = $1", channelID)
		// Update in-memory map and clear manual override
		c.mu.Lock()
		c.activeSourceMap[ch.Name] = "OBS"
		delete(c.manualLoopOverride, ch.Name) // Clear override
		c.mu.Unlock()
		c.Log("info", "switch", fmt.Sprintf("Channel %s switched to OBS (manual)", ch.Name))
		json.NewEncoder(w).Encode(map[string]string{"status": "switched", "source": "OBS", "channel": ch.Name})

	default:
		// Return channel details if no action
		if r.Method == "GET" && len(parts) == 1 {
			channels, _ := c.GetChannels()
			for _, fullCh := range channels {
				if fullCh.ID == channelID {
					json.NewEncoder(w).Encode(fullCh)
					return
				}
			}
		}
		http.Error(w, "Action not found", http.StatusNotFound)
	}
}

func (c *Controller) DestinationsHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if r.Method == "OPTIONS" {
		return
	}

	if r.Method == "POST" {
		var dest Destination
		if err := json.NewDecoder(r.Body).Decode(&dest); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		err := c.DB.QueryRow(`
			INSERT INTO destinations (channel_id, name, rtmp_url, stream_key, enabled, status)
			VALUES ($1, $2, $3, $4, true, 'DISCONNECTED')
			RETURNING id
		`, dest.ChannelID, dest.Name, dest.RTMPURL, dest.StreamKey).Scan(&dest.ID)

		if err != nil {
			c.Log("error", "api", fmt.Sprintf("Failed to create destination: %v", err))
			http.Error(w, "Failed to create destination", http.StatusInternalServerError)
			return
		}

		c.Log("info", "api", fmt.Sprintf("Created destination %s for channel %d", dest.Name, dest.ChannelID))
		json.NewEncoder(w).Encode(dest)
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func (c *Controller) DestinationActionHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if r.Method == "OPTIONS" {
		return
	}

	// Parse path: /api/destinations/{id}/{action} or /api/destinations/{id}
	path := strings.TrimPrefix(r.URL.Path, "/api/destinations/")
	parts := strings.Split(path, "/")

	if len(parts) < 1 {
		http.Error(w, "Destination ID required", http.StatusBadRequest)
		return
	}

	destID, err := strconv.Atoi(parts[0])
	if err != nil {
		http.Error(w, "Invalid destination ID", http.StatusBadRequest)
		return
	}

	if r.Method == "DELETE" {
		_, err := c.DB.Exec("DELETE FROM destinations WHERE id = $1", destID)
		if err != nil {
			http.Error(w, "Failed to delete destination", http.StatusInternalServerError)
			return
		}
		c.Log("info", "api", fmt.Sprintf("Deleted destination %d", destID))
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method == "PUT" {
		var update struct {
			Name      string `json:"name"`
			RTMPURL   string `json:"rtmp_url"`
			StreamKey string `json:"stream_key"`
		}
		if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		// Build dynamic update query
		updates := []string{}
		args := []interface{}{}
		argIdx := 1

		if update.Name != "" {
			updates = append(updates, fmt.Sprintf("name = $%d", argIdx))
			args = append(args, update.Name)
			argIdx++
		}
		if update.RTMPURL != "" {
			updates = append(updates, fmt.Sprintf("rtmp_url = $%d", argIdx))
			args = append(args, update.RTMPURL)
			argIdx++
		}
		if update.StreamKey != "" {
			updates = append(updates, fmt.Sprintf("stream_key = $%d", argIdx))
			args = append(args, update.StreamKey)
			argIdx++
		}

		if len(updates) == 0 {
			http.Error(w, "No fields to update", http.StatusBadRequest)
			return
		}

		query := fmt.Sprintf("UPDATE destinations SET %s WHERE id = $%d", strings.Join(updates, ", "), argIdx)
		args = append(args, destID)

		_, err := c.DB.Exec(query, args...)
		if err != nil {
			http.Error(w, "Failed to update destination", http.StatusInternalServerError)
			return
		}

		c.Log("info", "api", fmt.Sprintf("Updated destination %d", destID))
		w.WriteHeader(http.StatusOK)
		return
	}

	if len(parts) > 1 {
		action := parts[1]
		switch action {
		case "enable":
			c.DB.Exec("UPDATE destinations SET enabled = true WHERE id = $1", destID)
			json.NewEncoder(w).Encode(map[string]string{"status": "enabled"})
		case "disable":
			c.DB.Exec("UPDATE destinations SET enabled = false WHERE id = $1", destID)
			json.NewEncoder(w).Encode(map[string]string{"status": "disabled"})
		default:
			http.Error(w, "Unknown action", http.StatusBadRequest)
		}
		return
	}
}

func (c *Controller) SystemStatusHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)

	streams, _ := c.FetchSRSStreams()
	channels, _ := c.GetChannels()

	activeCount := 0
	totalBitrate := 0
	for _, s := range streams {
		activeCount++
		totalBitrate += s.Kbps.Recv
	}

	liveCount := 0
	loopCount := 0
	for _, ch := range channels {
		if ch.Status == "LIVE" || ch.ActiveSource == "OBS" {
			liveCount++
		} else if ch.ActiveSource == "LOOP" && ch.Enabled {
			loopCount++
		}
	}

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	status := map[string]interface{}{
		"status":         "online",
		"uptime":         time.Since(startTime).String(),
		"active_streams": activeCount,
		"total_bitrate":  totalBitrate,
		"live_channels":  liveCount,
		"loop_channels":  loopCount,
		"total_channels": len(channels),
		"database":       "connected",
		"memory_used_mb": m.Alloc / 1024 / 1024,
		"goroutines":     runtime.NumGoroutine(),
	}
	json.NewEncoder(w).Encode(status)
}

func (c *Controller) ServicesHealthHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)

	services := []ServiceHealth{}

	// Check SRS
	start := time.Now()
	_, srsErr := c.FetchSRSStreams()
	srsLatency := time.Since(start).Milliseconds()
	srsStatus := "healthy"
	srsDetails := "Responding to API calls"
	if srsErr != nil {
		srsStatus = "down"
		srsDetails = srsErr.Error()
	}
	services = append(services, ServiceHealth{
		Name:      "SRS Media Server",
		Status:    srsStatus,
		Latency:   srsLatency,
		Uptime:    time.Since(startTime).Round(time.Second).String(),
		LastCheck: time.Now().Format("15:04:05"),
		Details:   srsDetails,
	})

	// Check Database
	start = time.Now()
	dbErr := c.DB.Ping()
	dbLatency := time.Since(start).Milliseconds()
	dbStatus := "healthy"
	dbDetails := "Connected, responding"
	if dbErr != nil {
		dbStatus = "down"
		dbDetails = dbErr.Error()
	}
	services = append(services, ServiceHealth{
		Name:      "PostgreSQL Database",
		Status:    dbStatus,
		Latency:   dbLatency,
		Uptime:    time.Since(startTime).Round(time.Second).String(),
		LastCheck: time.Now().Format("15:04:05"),
		Details:   dbDetails,
	})

	// Controller itself
	services = append(services, ServiceHealth{
		Name:      "Controller Agent",
		Status:    "healthy",
		Latency:   1,
		Uptime:    time.Since(startTime).Round(time.Second).String(),
		LastCheck: time.Now().Format("15:04:05"),
		Details:   fmt.Sprintf("Goroutines: %d", runtime.NumGoroutine()),
	})

	// Check loop containers
	channels, _ := c.GetChannels()
	for _, ch := range channels {
		if !ch.Enabled || !ch.LoopEnabled {
			continue
		}
		containerName := fmt.Sprintf("loop-%s", ch.Name)
		ctx := context.Background()
		info, err := c.Docker.ContainerInspect(ctx, containerName)

		status := "down"
		details := "Container not found"
		uptime := "0s"
		if err == nil {
			if info.State.Running {
				status = "healthy"
				details = fmt.Sprintf("Running, Source: %s", ch.ActiveSource)
				if info.State.StartedAt != "" {
					if t, err := time.Parse(time.RFC3339Nano, info.State.StartedAt); err == nil {
						uptime = time.Since(t).Round(time.Second).String()
					}
				}
			} else {
				status = "degraded"
				details = fmt.Sprintf("State: %s", info.State.Status)
			}
		}

		services = append(services, ServiceHealth{
			Name:      fmt.Sprintf("Loop Publisher (%s)", ch.DisplayName),
			Status:    status,
			Latency:   0,
			Uptime:    uptime,
			LastCheck: time.Now().Format("15:04:05"),
			Details:   details,
		})
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"services": services,
	})
}

func (c *Controller) LogsHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)

	level := r.URL.Query().Get("level")
	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	c.logMu.RLock()
	defer c.logMu.RUnlock()

	var filtered []LogEntry
	for i := len(c.LogBuffer) - 1; i >= 0 && len(filtered) < limit; i-- {
		entry := c.LogBuffer[i]
		if level == "" || level == "all" || entry.Level == level {
			filtered = append(filtered, entry)
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"logs": filtered,
	})
}

func (c *Controller) MetricsHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	metrics := SystemMetrics{
		CPUUsage:      0, // Would need OS-level metrics
		MemoryUsage:   float64(m.Alloc) / float64(m.Sys) * 100,
		MemoryUsedMB:  int64(m.Alloc / 1024 / 1024),
		MemoryTotalMB: int64(m.Sys / 1024 / 1024),
		NetworkIn:     0,
		NetworkOut:    0,
	}

	json.NewEncoder(w).Encode(metrics)
}

func (c *Controller) OnPublishHandler(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Action string `json:"action"`
		Stream string `json:"stream"`
		Param  string `json:"param"`
		IP     string `json:"ip"`
	}

	body, _ := io.ReadAll(r.Body)
	// Debug Log
	c.Log("info", "auth", fmt.Sprintf("Raw Publish Body: %s", string(body)))

	if err := json.Unmarshal(body, &payload); err != nil {
		c.Log("error", "auth", fmt.Sprintf("Unmarshal failed: %v", err))
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	token := strings.TrimPrefix(payload.Param, "?token=")

	// Check if stream ends with -obs (OBS uses {channel}-obs pattern)
	streamName := payload.Stream
	isOBSStream := false
	if strings.HasSuffix(payload.Stream, "-obs") {
		streamName = strings.TrimSuffix(payload.Stream, "-obs")
		isOBSStream = true
	}

	// Hash the incoming token for comparison
	tokenHash := HashToken(token)

	var ch Channel
	var obsTokenHash, loopTokenHash sql.NullString
	// Select hashes and legacy plaintext - use base channel name
	err := c.DB.QueryRow(`
		SELECT id, name, obs_token_hash, loop_token_hash, obs_token, loop_token 
		FROM channels WHERE name = $1 AND enabled = true
	`, streamName).Scan(&ch.ID, &ch.Name, &obsTokenHash, &loopTokenHash, &ch.OBSToken, &ch.LoopToken)

	if err == sql.ErrNoRows {
		// Fallback: Check if user is streaming to the obs_token directly
		// This happens if user puts the token as the Stream Key instead of {channel}-obs
		err = c.DB.QueryRow(`
			SELECT id, name, obs_token_hash, loop_token_hash, obs_token, loop_token 
			FROM channels WHERE obs_token = $1 AND enabled = true
		`, streamName).Scan(&ch.ID, &ch.Name, &obsTokenHash, &loopTokenHash, &ch.OBSToken, &ch.LoopToken)

		if err == sql.ErrNoRows {
			c.Log("warn", "auth", fmt.Sprintf("Rejected unknown stream: %s (base: %s)", payload.Stream, streamName))
			http.Error(w, "Unknown stream", http.StatusForbidden)
			return
		}
		// If found via token lookup, it is an OBS stream
		isOBSStream = true
	}

	// For -obs streams, only accept OBS token
	if isOBSStream {
		if token != ch.OBSToken && (obsTokenHash.Valid && obsTokenHash.String != tokenHash) {
			c.Log("warn", "auth", fmt.Sprintf("Invalid OBS token for stream: %s", payload.Stream))
			http.Error(w, "Invalid token", http.StatusForbidden)
			return
		}
	}

	matchFound := false
	sourceType := "LOOP"

	// Check Hash Matches First (New System)
	if obsTokenHash.Valid && obsTokenHash.String == tokenHash {
		matchFound = true
		sourceType = "OBS"
	} else if loopTokenHash.Valid && loopTokenHash.String == tokenHash {
		matchFound = true
		sourceType = "LOOP"
	} else {
		// Legacy Check (Plaintext) - Fallback
		if token == ch.OBSToken {
			matchFound = true
			sourceType = "OBS"
		} else if token == ch.LoopToken {
			matchFound = true
			sourceType = "LOOP"
		}
	}

	if !matchFound {
		c.Log("warn", "auth", fmt.Sprintf("Invalid token for stream: %s from %s", payload.Stream, payload.IP))
		http.Error(w, "Invalid token", http.StatusForbidden)
		return
	}

	c.Log("info", "auth", fmt.Sprintf("Accepted %s publish for %s from %s", sourceType, payload.Stream, payload.IP))

	// If OBS is connecting, IMMEDIATELY stop the loop container to free the stream
	if sourceType == "OBS" {
		containerName := fmt.Sprintf("loop-%s", streamName)
		c.Log("info", "failover", fmt.Sprintf("OBS connected for %s - stopping loop container for automatic takeover", streamName))

		// Set takeover cooldown to prevent reconciler from restarting loop
		c.mu.Lock()
		c.takeoverCooldown[streamName] = time.Now()
		c.mu.Unlock()

		go c.EnsureContainerStopped(containerName) // Stop async to not block auth response

		// Update active source
		c.DB.Exec("UPDATE channels SET current_active_source = 'OBS' WHERE name = $1", streamName)
	}

	c.DB.Exec(`
		INSERT INTO audit_logs (action, resource_type, resource_id, details, ip_address)
		VALUES ($1, $2, $3, $4, $5)
	`, "STREAM_PUBLISH", "channel", payload.Stream,
		fmt.Sprintf(`{"source": "%s"}`, sourceType), payload.IP)

	w.Write([]byte("0"))
}

func (c *Controller) OnUnpublishHandler(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Action string `json:"action"`
		Stream string `json:"stream"`
		Param  string `json:"param"`
		IP     string `json:"ip"`
	}

	body, _ := io.ReadAll(r.Body)
	if err := json.Unmarshal(body, &payload); err != nil {
		w.Write([]byte("0"))
		return
	}

	token := strings.TrimPrefix(payload.Param, "?token=")

	// Normalization
	streamName := payload.Stream
	if strings.HasSuffix(payload.Stream, "-obs") {
		streamName = strings.TrimSuffix(payload.Stream, "-obs")
	}

	// Check if this was an OBS stream that disconnected
	var obsToken string
	err := c.DB.QueryRow("SELECT obs_token FROM channels WHERE name = $1", streamName).Scan(&obsToken)
	if err == nil && token == obsToken {
		c.Log("info", "failover", fmt.Sprintf("OBS disconnected for %s - clearing cooldown to allow loop restart", streamName))

		// Clear takeover cooldown to allow loop to restart
		c.mu.Lock()
		delete(c.takeoverCooldown, streamName)
		c.mu.Unlock()

		// Update active source back to LOOP
		c.DB.Exec("UPDATE channels SET current_active_source = 'LOOP' WHERE name = $1", streamName)

		// Log audit
		c.DB.Exec(`
			INSERT INTO audit_logs (action, resource_type, resource_id, details, ip_address)
			VALUES ($1, $2, $3, $4, $5)
		`, "STREAM_UNPUBLISH", "channel", payload.Stream, `{"source": "OBS", "action": "failback_to_loop"}`, payload.IP)
	}

	w.Write([]byte("0"))
}

// OnConnectHandler handles SRS on_connect callback
// This fires when RTMP handshake completes, BEFORE stream acquisition
func (c *Controller) OnConnectHandler(w http.ResponseWriter, r *http.Request) {
	// Always accept connections - authentication happens in on_publish
	w.Write([]byte("0"))
}

// TakeoverHandler stops the loop container for a channel to allow OBS to take over
// Usage: POST /api/takeover/{channel_name}
func (c *Controller) TakeoverHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if r.Method == "OPTIONS" {
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract channel name from URL
	path := strings.TrimPrefix(r.URL.Path, "/api/takeover/")
	channelName := strings.TrimSuffix(path, "/")

	if channelName == "" {
		http.Error(w, "Channel name required", http.StatusBadRequest)
		return
	}

	// Verify channel exists and is enabled
	var ch Channel
	err := c.DB.QueryRow("SELECT id, name, failover_timeout_seconds FROM channels WHERE name = $1 AND enabled = true", channelName).Scan(&ch.ID, &ch.Name, &ch.FailoverTimeout)
	if err == sql.ErrNoRows {
		http.Error(w, "Channel not found or disabled", http.StatusNotFound)
		return
	}

	// Stop the loop container
	containerName := fmt.Sprintf("loop-%s", channelName)
	c.Log("info", "api", fmt.Sprintf("OBS takeover requested for %s - stopping loop container", channelName))

	c.EnsureContainerStopped(containerName)

	// Set takeover cooldown to prevent reconciler from restarting loop
	c.mu.Lock()
	c.takeoverCooldown[channelName] = time.Now()
	c.mu.Unlock()

	// Update active source to OBS
	c.UpdateActiveSource(ch.ID, "OBS")

	// Log audit
	c.DB.Exec(`
		INSERT INTO audit_logs (action, resource_type, resource_id, details, ip_address)
		VALUES ($1, $2, $3, $4, $5)
	`, "OBS_TAKEOVER", "channel", channelName, `{"action": "loop_stopped"}`, r.RemoteAddr)

	timeout := ch.FailoverTimeout
	if timeout <= 0 {
		timeout = 60
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "success",
		"message":  fmt.Sprintf("Loop stopped for channel %s - OBS can now connect (%ds window)", channelName, timeout),
		"rtmp_url": fmt.Sprintf("rtmp://localhost:1935/live/%s", channelName),
	})
}

// ========================================
// Main
// ========================================

var startTime time.Time

// ========================================
// User Management Handlers
// ========================================

func hashPassword(password string) string {
	// Simple SHA256 hash (for production, use bcrypt)
	h := fmt.Sprintf("%x", sha256.Sum256([]byte(password)))
	return h
}

func (c *Controller) UsersHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if r.Method == "OPTIONS" {
		return
	}

	if r.Method == "GET" {
		users := []User{}
		rows, err := c.DB.Query(`
			SELECT id, email, name, role, is_active, last_login_at, created_at, updated_at 
			FROM users ORDER BY created_at DESC
		`)
		if err != nil {
			http.Error(w, "Database error", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		for rows.Next() {
			var u User
			var lastLogin sql.NullString
			var createdAt, updatedAt time.Time
			err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.IsActive, &lastLogin, &createdAt, &updatedAt)
			if err != nil {
				continue
			}
			if lastLogin.Valid {
				u.LastLoginAt = &lastLogin.String
			}
			u.CreatedAt = createdAt.Format(time.RFC3339)
			u.UpdatedAt = updatedAt.Format(time.RFC3339)
			users = append(users, u)
		}
		json.NewEncoder(w).Encode(users)
		return
	}

	if r.Method == "POST" {
		var req struct {
			Email    string `json:"email"`
			Password string `json:"password"`
			Name     string `json:"name"`
			Role     string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		if req.Email == "" || req.Password == "" || req.Name == "" {
			http.Error(w, "Email, password, and name are required", http.StatusBadRequest)
			return
		}

		if req.Role == "" {
			req.Role = "VIEWER"
		}

		passwordHash := hashPassword(req.Password)

		var userID string
		err := c.DB.QueryRow(`
			INSERT INTO users (email, password_hash, name, role)
			VALUES ($1, $2, $3, $4)
			RETURNING id
		`, req.Email, passwordHash, req.Name, req.Role).Scan(&userID)

		if err != nil {
			if strings.Contains(err.Error(), "duplicate key") {
				http.Error(w, "User with this email already exists", http.StatusConflict)
				return
			}
			http.Error(w, "Failed to create user", http.StatusInternalServerError)
			return
		}

		c.Log("info", "users", fmt.Sprintf("Created user: %s (%s)", req.Email, req.Role))
		json.NewEncoder(w).Encode(map[string]string{"id": userID, "status": "created"})
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func (c *Controller) UserActionHandler(w http.ResponseWriter, r *http.Request) {
	c.setCORS(w)
	if r.Method == "OPTIONS" {
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/users/")
	parts := strings.Split(path, "/")

	if len(parts) < 1 || parts[0] == "" {
		http.Error(w, "User ID required", http.StatusBadRequest)
		return
	}

	userID := parts[0]
	action := ""
	if len(parts) > 1 {
		action = parts[1]
	}

	// Handle actions
	switch action {
	case "reset-password":
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			NewPassword string `json:"new_password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.NewPassword == "" {
			http.Error(w, "New password required", http.StatusBadRequest)
			return
		}
		passwordHash := hashPassword(req.NewPassword)
		_, err := c.DB.Exec("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", passwordHash, userID)
		if err != nil {
			http.Error(w, "Failed to update password", http.StatusInternalServerError)
			return
		}
		c.Log("info", "users", fmt.Sprintf("Password reset for user: %s", userID))
		json.NewEncoder(w).Encode(map[string]string{"status": "password_reset"})
		return

	case "send-reset-email":
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var email string
		err := c.DB.QueryRow("SELECT email FROM users WHERE id = $1", userID).Scan(&email)
		if err != nil {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}

		// Generate reset token
		token := generateToken()
		// In production, store this token with expiry and send email
		// For now, just log it
		c.Log("info", "users", fmt.Sprintf("Password reset requested for %s, token: %s", email, token))

		// Try to send email if SMTP is configured
		smtpHost := os.Getenv("SMTP_HOST")
		if smtpHost != "" {
			go c.sendPasswordResetEmail(email, token)
		}

		json.NewEncoder(w).Encode(map[string]string{"status": "reset_email_sent", "email": email})
		return

	case "activate":
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		_, err := c.DB.Exec("UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1", userID)
		if err != nil {
			http.Error(w, "Failed to activate user", http.StatusInternalServerError)
			return
		}
		c.Log("info", "users", fmt.Sprintf("Activated user: %s", userID))
		json.NewEncoder(w).Encode(map[string]string{"status": "activated"})
		return

	case "deactivate":
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		_, err := c.DB.Exec("UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1", userID)
		if err != nil {
			http.Error(w, "Failed to deactivate user", http.StatusInternalServerError)
			return
		}
		c.Log("info", "users", fmt.Sprintf("Deactivated user: %s", userID))
		json.NewEncoder(w).Encode(map[string]string{"status": "deactivated"})
		return

	case "":
		// No action - handle CRUD on user itself
		break

	default:
		http.Error(w, "Unknown action", http.StatusBadRequest)
		return
	}

	// Direct user operations (GET, PUT, DELETE)
	if r.Method == "GET" {
		var u User
		var lastLogin sql.NullString
		var createdAt, updatedAt time.Time
		err := c.DB.QueryRow(`
			SELECT id, email, name, role, is_active, last_login_at, created_at, updated_at 
			FROM users WHERE id = $1
		`, userID).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.IsActive, &lastLogin, &createdAt, &updatedAt)
		if err != nil {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		if lastLogin.Valid {
			u.LastLoginAt = &lastLogin.String
		}
		u.CreatedAt = createdAt.Format(time.RFC3339)
		u.UpdatedAt = updatedAt.Format(time.RFC3339)
		json.NewEncoder(w).Encode(u)
		return
	}

	if r.Method == "PUT" {
		var req struct {
			Name     string `json:"name"`
			Role     string `json:"role"`
			Email    string `json:"email"`
			IsActive *bool  `json:"is_active"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		// Build dynamic update
		updates := []string{"updated_at = NOW()"}
		args := []interface{}{}
		argIdx := 1

		if req.Name != "" {
			updates = append(updates, fmt.Sprintf("name = $%d", argIdx))
			args = append(args, req.Name)
			argIdx++
		}
		if req.Role != "" {
			updates = append(updates, fmt.Sprintf("role = $%d", argIdx))
			args = append(args, req.Role)
			argIdx++
		}
		if req.Email != "" {
			updates = append(updates, fmt.Sprintf("email = $%d", argIdx))
			args = append(args, req.Email)
			argIdx++
		}
		if req.IsActive != nil {
			updates = append(updates, fmt.Sprintf("is_active = $%d", argIdx))
			args = append(args, *req.IsActive)
			argIdx++
		}

		query := fmt.Sprintf("UPDATE users SET %s WHERE id = $%d", strings.Join(updates, ", "), argIdx)
		args = append(args, userID)

		_, err := c.DB.Exec(query, args...)
		if err != nil {
			http.Error(w, "Failed to update user", http.StatusInternalServerError)
			return
		}

		c.Log("info", "users", fmt.Sprintf("Updated user: %s", userID))
		json.NewEncoder(w).Encode(map[string]string{"status": "updated"})
		return
	}

	if r.Method == "DELETE" {
		_, err := c.DB.Exec("DELETE FROM users WHERE id = $1", userID)
		if err != nil {
			http.Error(w, "Failed to delete user", http.StatusInternalServerError)
			return
		}
		c.Log("info", "users", fmt.Sprintf("Deleted user: %s", userID))
		w.WriteHeader(http.StatusOK)
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func (c *Controller) sendPasswordResetEmail(email, token string) {
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPort := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("SMTP_USER")
	smtpPass := os.Getenv("SMTP_PASS")
	smtpFrom := os.Getenv("SMTP_FROM")
	appURL := os.Getenv("APP_URL")

	if smtpHost == "" || smtpPort == "" {
		log.Println("[EMAIL] SMTP not configured, skipping email")
		return
	}

	if smtpFrom == "" {
		smtpFrom = smtpUser
	}
	if appURL == "" {
		appURL = "http://localhost:3000"
	}

	resetLink := fmt.Sprintf("%s/reset-password?token=%s", appURL, token)

	subject := "Password Reset Request"
	body := fmt.Sprintf(`Hello,

You requested a password reset. Click the link below to reset your password:

%s

If you didn't request this, please ignore this email.

Best regards,
Livestream Platform`, resetLink)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s", smtpFrom, email, subject, body)

	auth := smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)
	addr := fmt.Sprintf("%s:%s", smtpHost, smtpPort)

	err := smtp.SendMail(addr, auth, smtpFrom, []string{email}, []byte(msg))
	if err != nil {
		log.Printf("[EMAIL] Failed to send email to %s: %v", email, err)
	} else {
		log.Printf("[EMAIL] Password reset email sent to %s", email)
	}
}

func (c *Controller) StartMediaWatcher() {
	log.Println("Starting Media Watcher...")
	ticker := time.NewTicker(30 * time.Second)
	go func() {
		for range ticker.C {
			c.scanAndOptimizeMedia()
		}
	}()
}

func (c *Controller) scanAndOptimizeMedia() {
	mediaDir := "/app/media" // Internal path in controller container

	files, err := os.ReadDir(mediaDir)
	if err != nil {
		log.Printf("[MEDIA] Error scanning media dir: %v", err)
		return
	}

	for _, f := range files {
		if f.IsDir() {
			continue
		}
		name := f.Name()
		ext := strings.ToLower(filepath.Ext(name))

		// Only process video files
		if ext != ".mp4" && ext != ".mov" && ext != ".mkv" {
			continue
		}

		// Skip artifacts and running temps
		if strings.Contains(name, ".original.") || strings.Contains(name, ".optimized.") || strings.Contains(name, ".temp.") {
			continue
		}

		// Check for marker file to prevent re-processing
		markerPath := filepath.Join(mediaDir, name+".optimized")
		if info, err := os.Stat(markerPath); err == nil {
			// Marker exists. Check dates to handle re-uploads.
			fileInfo, _ := f.Info()
			if fileInfo.ModTime().Before(info.ModTime()) {
				continue // File is old and already optimized
			}
			log.Printf("[MEDIA] File %s is newer than optimization marker. Reprocessing.", name)
		}

		// Found a new raw file!
		log.Printf("[MEDIA] Found new unoptimized file: %s. Starting optimization...", name)

		ctx := context.Background()
		baseName := strings.TrimSuffix(name, ext)
		tempName := baseName + ".optimized.temp.mp4"

		cmd := []string{
			"-hide_banner", "-loglevel", "error", "-y",
			"-i", fmt.Sprintf("/data/%s", name),
			"-vf", "scale=-2:'max(1080,ih)'",
			"-c:v", "libx264", "-preset", "fast", "-profile:v", "high", "-level", "4.2",
			"-pix_fmt", "yuv420p",
			"-r", "30", "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
			"-force_key_frames", "expr:gte(t,n_forced*2)",
			"-b:v", "4000k", "-minrate", "4000k", "-maxrate", "4000k", "-bufsize", "8000k",
			"-c:a", "aac", "-b:a", "128k", "-ar", "44100",
			"-movflags", "+faststart",
			fmt.Sprintf("/data/%s", tempName),
		}

		resp, err := c.Docker.ContainerCreate(ctx, &container.Config{
			Image: "linuxserver/ffmpeg:latest",
			Cmd:   cmd,
		}, &container.HostConfig{
			Binds: []string{
				fmt.Sprintf("%s:/data", c.Config.MediaHostPath),
			},
			AutoRemove: false, // Wait for exit code
		}, nil, nil, "")

		if err != nil {
			log.Printf("[MEDIA] Failed to create optimization container: %v", err)
			continue
		}

		if err := c.Docker.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
			log.Printf("[MEDIA] Failed to start optimization container: %v", err)
			c.Docker.ContainerRemove(ctx, resp.ID, container.RemoveOptions{})
			continue
		}

		log.Printf("[MEDIA] Optimization started for %s (Container %s)", name, resp.ID[:12])

		// Wait for completion
		statusCh, errCh := c.Docker.ContainerWait(ctx, resp.ID, container.WaitConditionNotRunning)
		select {
		case err := <-errCh:
			if err != nil {
				log.Printf("[MEDIA] Error waiting for container: %v", err)
			}
		case <-statusCh:
		}

		// Check exit code
		inspect, err := c.Docker.ContainerInspect(ctx, resp.ID)
		if err == nil && inspect.State.ExitCode == 0 {
			// Success! Swap files.
			log.Printf("[MEDIA] Optimization successful. Swapping files...")

			// 1. Delete original raw file
			err1 := os.Remove(filepath.Join(mediaDir, name))
			// 2. Rename temp to original name
			err2 := os.Rename(filepath.Join(mediaDir, tempName), filepath.Join(mediaDir, name))
			// 3. Create/Update marker file
			if f, err := os.Create(markerPath); err == nil {
				f.Close()
			}

			if err1 == nil && err2 == nil {
				log.Printf("[MEDIA] Replaced %s successfully.", name)
			} else {
				log.Printf("[MEDIA] Error swapping files: %v, %v", err1, err2)
			}
		} else {
			log.Printf("[MEDIA] Optimization failed. Keeping original.")
			os.Remove(filepath.Join(mediaDir, tempName))
		}

		// Cleanup container
		c.Docker.ContainerRemove(ctx, resp.ID, container.RemoveOptions{})
	}
}

func main() {
	startTime = time.Now()
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("===========================================")
	log.Println("  Livestream Controller Starting...")
	log.Println("===========================================")

	InitCrypto()

	cfg := LoadConfig()
	log.Printf("Config: SRS=%s, AutoFailover=%v", cfg.SRSApiURL, cfg.EnableAutoFailover)

	ctrl, err := NewController(cfg)
	if err != nil {
		log.Fatalf("FATAL: %v", err)
	}
	defer ctrl.DB.Close()

	go ctrl.StartReconciler()
	go ctrl.StartMediaWatcher()

	mux := ctrl.SetupRoutes()
	port := "8080"
	log.Printf("Controller listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
