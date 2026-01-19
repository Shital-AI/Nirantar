package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
)

type Config struct {
	SourceURL        string   `json:"source_url"`
	Destinations     []string `json:"destinations"`
	VideoBitrate     int      `json:"video_bitrate"`
	AudioBitrate     int      `json:"audio_bitrate"`
	KeyframeInterval int      `json:"keyframe_interval"`
}

type SRSStreamsResponse struct {
	Streams []struct {
		Name    string `json:"name"`
		Publish struct {
			Active bool `json:"active"`
		} `json:"publish"`
	} `json:"streams"`
}

var (
	currentConfig Config
	mu            sync.Mutex

	// Pumps
	loopCmd *exec.Cmd
	obsCmd  *exec.Cmd

	transcoderCmd *exec.Cmd
	distributors  = make(map[string]*exec.Cmd)
	destMu        sync.Mutex

	// Muxing
	modeMutex   sync.RWMutex
	currentMode string = "LOOP" // "LOOP" or "OBS"
	streamChan         = make(chan []byte, 100)

	// Backoff Tracking
	failureCounts = make(map[string]int)
	failureMu     sync.Mutex

	pipePath    = "/tmp/stream_pipe"
	pipeWriter  *os.File
	cleanStream = "rtmp://srs:1935/live/relay_clean"
	loopStream  = "rtmp://srs:1935/live/waheguru"
)

func main() {
	log.Println("[RELAY] Starting Relay Manager v27 (Pure Seamless Failover)...")

	os.Remove(pipePath)
	if err := syscall.Mkfifo(pipePath, 0666); err != nil {
		log.Fatalf("Failed to create pipe: %v", err)
	}

	var err error
	pipeWriter, err = os.OpenFile(pipePath, os.O_RDWR, os.ModeNamedPipe)
	if err != nil {
		log.Printf("[RELAY] Warning: Failed to hold pipe open: %v", err)
	} else {
		log.Println("[RELAY] Pipe held open for persistent connection")
		defer pipeWriter.Close()
	}

	// Start Pipe Writer
	go pipeWriterLoop()

	// Start Loop Pump (Always Running)
	go loopPumpLoop()

	http.HandleFunc("/update", handleUpdate)
	http.HandleFunc("/status", handleStatus)
	go func() {
		log.Println("[RELAY] Listening on :8080")
		log.Fatal(http.ListenAndServe(":8080", nil))
	}()

	go monitorSRS()

	initialConfig := Config{
		SourceURL:    os.Getenv("INITIAL_SOURCE_URL"),
		Destinations: []string{os.Getenv("INITIAL_DESTINATION")},
	}
	if initialConfig.SourceURL != "" {
		handleConfigChange(initialConfig)
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("[RELAY] Shutting down...")
	cleanup()
}

func pipeWriterLoop() {
	for b := range streamChan {
		if _, err := pipeWriter.Write(b); err != nil {
			log.Printf("[RELAY] Pipe Write Error: %v", err)
		}
	}
}

func loopPumpLoop() {
	for {
		log.Println("[RELAY] Starting Loop Pump (Background)")

		args := []string{
			"-hide_banner", "-loglevel", "error",
			"-re", "-i", loopStream,
			"-c", "copy", "-bsf:v", "h264_mp4toannexb",
			"-flush_packets", "1",
			"-f", "mpegts", "pipe:1",
		}
		cmd := exec.Command("ffmpeg", args...)
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			time.Sleep(100 * time.Millisecond)
			continue
		}
		if err := cmd.Start(); err != nil {
			time.Sleep(100 * time.Millisecond)
			continue
		}

		mu.Lock()
		loopCmd = cmd
		mu.Unlock()

		buf := make([]byte, 32*1024)
		for {
			n, err := stdout.Read(buf)
			if err != nil {
				break
			}

			modeMutex.RLock()
			active := (currentMode == "LOOP")
			modeMutex.RUnlock()

			if active {
				data := make([]byte, n)
				copy(data, buf[:n])
				streamChan <- data
			}
		}
		cmd.Wait()
		time.Sleep(50 * time.Millisecond)
	}
}

func restartLoopPump() {
	mu.Lock()
	if loopCmd != nil && loopCmd.Process != nil {
		log.Println("[RELAY] Killing Loop Pump for Fresh Start...")
		syscall.Kill(-loopCmd.Process.Pid, syscall.SIGKILL)
	}
	mu.Unlock()
	time.Sleep(200 * time.Millisecond) // Wait for auto-restart cycle
}

func startOBSPump(url string) {
	mu.Lock()
	if obsCmd != nil && obsCmd.Process != nil {
		syscall.Kill(-obsCmd.Process.Pid, syscall.SIGKILL)
		time.Sleep(100 * time.Millisecond)
	}
	mu.Unlock()

	go func() {
		log.Printf("[RELAY] Starting OBS Pump: %s", url)
		cmd := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-rw_timeout", "5000000", "-i", url, "-c", "copy", "-bsf:v", "h264_mp4toannexb", "-f", "mpegts", "pipe:1")
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			log.Printf("[RELAY] OBS Pump Pipe Error: %v", err)
			triggerFailover("ObsPipeError")
			return
		}
		if err := cmd.Start(); err != nil {
			log.Printf("[RELAY] OBS Pump Start Error: %v", err)
			triggerFailover("ObsStartError")
			return
		}

		mu.Lock()
		obsCmd = cmd
		mu.Unlock()

		// Immediately make active if intended
		mu.Lock()
		isTarget := currentConfig.SourceURL == url
		mu.Unlock()

		if isTarget {
			switchMode("OBS")
		}

		buf := make([]byte, 32*1024)
		for {
			n, err := stdout.Read(buf)
			if err != nil {
				break
			}

			modeMutex.RLock()
			active := (currentMode == "OBS")
			modeMutex.RUnlock()

			if active {
				data := make([]byte, n)
				copy(data, buf[:n])
				streamChan <- data
			}
		}
		cmd.Wait()
		log.Println("[RELAY] OBS Pump Exited")

		// Failover only if was active
		modeMutex.RLock()
		wasActive := (currentMode == "OBS")
		modeMutex.RUnlock()

		if wasActive {
			triggerFailover("ObsProcessExit")
		}
	}()
}

func triggerFailover(reason string) {
	modeMutex.RLock()
	isLoop := (currentMode == "LOOP")
	modeMutex.RUnlock()
	if isLoop {
		return
	}

	log.Printf("[RELAY] FAILOVER (%s) -> Switching to Running Loop (Seamless)...", reason)

	// 1. Switch Mode INSTANTLY (Like Manual, No Restart)
	switchMode("LOOP")

	// 2. Update Config
	mu.Lock()
	currentConfig.SourceURL = loopStream
	mu.Unlock()
}

func switchMode(mode string) {
	modeMutex.Lock()
	defer modeMutex.Unlock()
	currentMode = mode
	log.Printf("[RELAY] Muxer Mode: %s", mode)
}

func monitorSRS() {
	client := &http.Client{Timeout: 2 * time.Second}
	log.Println("[Tracker] SRS Stream Monitoring (v27)")

	for {
		time.Sleep(1 * time.Second)

		mu.Lock()
		src := currentConfig.SourceURL
		mu.Unlock()

		if src == loopStream {
			continue
		}
		if !strings.Contains(src, "srs:1935") && !strings.Contains(src, "localhost") {
			continue
		}

		parts := strings.Split(src, "/")
		if len(parts) == 0 {
			continue
		}
		streamName := parts[len(parts)-1]

		resp, err := client.Get("http://srs:1985/api/v1/streams")
		if err != nil {
			continue
		}

		var srsResp SRSStreamsResponse
		if err := json.NewDecoder(resp.Body).Decode(&srsResp); err != nil {
			resp.Body.Close()
			continue
		}
		resp.Body.Close()

		found := false
		for _, s := range srsResp.Streams {
			if s.Name == streamName && s.Publish.Active {
				found = true
				break
			}
		}

		if !found {
			triggerFailover("TrackerLost" + streamName)
		}
	}
}

func handleUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var newConfig Config
	json.NewDecoder(r.Body).Decode(&newConfig)
	handleConfigChange(newConfig)
	w.WriteHeader(http.StatusOK)
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	destMu.Lock()
	defer destMu.Unlock()
	dests := []map[string]interface{}{}
	for url, cmd := range distributors {
		running := cmd != nil && cmd.ProcessState == nil
		dests = append(dests, map[string]interface{}{"url": url, "running": running})
	}
	modeMutex.RLock()
	mode := currentMode
	modeMutex.RUnlock()
	status := map[string]interface{}{
		"source":             currentConfig.SourceURL,
		"mode":               mode,
		"destinations":       dests,
		"transcoder_running": transcoderCmd != nil && transcoderCmd.ProcessState == nil,
	}
	json.NewEncoder(w).Encode(status)
}

func handleConfigChange(newConfig Config) {
	mu.Lock()
	sourceChanged := newConfig.SourceURL != currentConfig.SourceURL
	oldSrc := currentConfig.SourceURL
	currentConfig = newConfig
	mu.Unlock()

	if sourceChanged {
		log.Printf("[RELAY] Source Change: %s -> %s", oldSrc, newConfig.SourceURL)
		if newConfig.SourceURL == loopStream {
			switchMode("LOOP")
		} else {
			// Start OBS Pump
			startOBSPump(newConfig.SourceURL)
		}
	}

	if transcoderCmd == nil || transcoderCmd.ProcessState != nil {
		startTranscoderProcess()
	}
	manageDistributors(newConfig.Destinations)
}

func startTranscoderProcess() {
	if transcoderCmd != nil && transcoderCmd.Process != nil {
		return
	}
	log.Println("[RELAY] Starting Transcoder (Pipe -> SRS Clean)")
	args := []string{
		"-hide_banner", "-loglevel", "warning",
		"-f", "mpegts", "-probesize", "32M", "-analyzeduration", "100000",
		"-i", pipePath,
		"-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
		"-b:v", "4000k", "-maxrate", "4000k", "-bufsize", "8000k", "-pix_fmt", "yuv420p",
		"-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
		"-c:a", "aac", "-b:a", "128k", "-ac", "2",
		"-f", "flv", cleanStream,
	}
	cmd := exec.Command("ffmpeg", args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Start()
	transcoderCmd = cmd
	go func() {
		cmd.Wait()
		log.Println("[RELAY] Transcoder exited")
		time.Sleep(500 * time.Millisecond)
		mu.Lock()
		if transcoderCmd == cmd {
			transcoderCmd = nil
		}
		mu.Unlock()
		startTranscoderProcess()
	}()
}

func manageDistributors(destinations []string) {
	destMu.Lock()
	defer destMu.Unlock()
	newDestSet := make(map[string]bool)
	for _, d := range destinations {
		newDestSet[d] = true
	}
	for url, cmd := range distributors {
		if !newDestSet[url] {
			if cmd != nil && cmd.Process != nil {
				syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
			}
			delete(distributors, url)
			failureMu.Lock()
			delete(failureCounts, url)
			failureMu.Unlock()
		}
	}
	for _, url := range destinations {
		if _, exists := distributors[url]; !exists {
			log.Printf("[RELAY] Starting Dist: %s", url)
			distributors[url] = nil
			startDistributor(url)
		}
	}
}

func startDistributor(destURL string) {
	go func() {
		failureMu.Lock()
		fails := failureCounts[destURL]
		failureMu.Unlock()
		if fails > 0 {
			time.Sleep(time.Duration(fails) * 2 * time.Second)
		}

		args := []string{"-hide_banner", "-loglevel", "warning", "-i", cleanStream, "-c", "copy", "-f", "flv", destURL}
		cmd := exec.Command("ffmpeg", args...)
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		start := time.Now()
		if err := cmd.Start(); err != nil {
			failureMu.Lock()
			failureCounts[destURL]++
			failureMu.Unlock()
			startDistributor(destURL)
			return
		}
		destMu.Lock()
		distributors[destURL] = cmd
		destMu.Unlock()
		cmd.Wait()

		if time.Since(start) > 60*time.Second {
			failureMu.Lock()
			failureCounts[destURL] = 0
			failureMu.Unlock()
		} else {
			failureMu.Lock()
			failureCounts[destURL]++
			failureMu.Unlock()
		}

		mu.Lock()
		needed := false
		for _, d := range currentConfig.Destinations {
			if d == destURL {
				needed = true
				break
			}
		}
		mu.Unlock()
		if needed {
			startDistributor(destURL)
		} else {
			destMu.Lock()
			delete(distributors, destURL)
			destMu.Unlock()
		}
	}()
}

func cleanup() {
	mu.Lock()
	defer mu.Unlock()
	if loopCmd != nil && loopCmd.Process != nil {
		syscall.Kill(-loopCmd.Process.Pid, syscall.SIGKILL)
	}
	if obsCmd != nil && obsCmd.Process != nil {
		syscall.Kill(-obsCmd.Process.Pid, syscall.SIGKILL)
	}
	if transcoderCmd != nil && transcoderCmd.Process != nil {
		syscall.Kill(-transcoderCmd.Process.Pid, syscall.SIGKILL)
	}
	destMu.Lock()
	for _, cmd := range distributors {
		if cmd != nil && cmd.Process != nil {
			syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		}
	}
	destMu.Unlock()
	os.Remove(pipePath)
}
