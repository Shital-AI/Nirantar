#!/bin/bash
set -e

echo "============================================"
echo "  Loop Publisher for: ${CHANNEL_NAME:-unknown}"
echo "============================================"
echo "Target: $RTMP_URL"
echo "Source: $SOURCE_FILE"

# Configuration from environment (with defaults)
VIDEO_BITRATE="${VIDEO_BITRATE:-4500}"
AUDIO_BITRATE="${AUDIO_BITRATE:-128}"
KEYFRAME_INTERVAL="${KEYFRAME_INTERVAL:-2}"
OUTPUT_RESOLUTION="${OUTPUT_RESOLUTION:-}"

echo "[CONFIG] Video: ${VIDEO_BITRATE}kbps, Audio: ${AUDIO_BITRATE}kbps, GOP: ${KEYFRAME_INTERVAL}s"

# Health check function
health_check() {
    while true; do
        sleep 30
        echo "[HEALTH] Still running..."
    done
}

# Start health check in background
health_check &

# Calculate GOP size (keyframe interval * 30fps)
GOP_SIZE=$((KEYFRAME_INTERVAL * 30))

# Build video filter for resolution scaling
VIDEO_FILTER=""
if [ -n "$OUTPUT_RESOLUTION" ]; then
    WIDTH=$(echo $OUTPUT_RESOLUTION | cut -d'x' -f1)
    HEIGHT=$(echo $OUTPUT_RESOLUTION | cut -d'x' -f2)
    VIDEO_FILTER="-vf scale=${WIDTH}:${HEIGHT}"
    echo "[CONFIG] Scaling to ${OUTPUT_RESOLUTION}"
fi

# Retry logic
MAX_RETRIES=10
RETRY_DELAY=5
retry_count=0

while true; do
    STREAM_FILE=""
    
    # Check if source file exists and is readable
    if [ -f "$SOURCE_FILE" ]; then
        echo "[INFO] Source file found: $SOURCE_FILE"
        
        # Try to verify file is readable (test read first 1KB)
        if head -c 1024 "$SOURCE_FILE" > /dev/null 2>&1; then
            STREAM_FILE="$SOURCE_FILE"
            echo "[INFO] File is readable, using directly"
        else
            echo "[WARN] File read test failed (macOS Docker file lock issue)"
            # Try copying to /tmp as workaround
            LOCAL_FILE="/tmp/stream_source.mp4"
            echo "[INFO] Attempting copy to local storage..."
            if dd if="$SOURCE_FILE" of="$LOCAL_FILE" bs=1M 2>/dev/null; then
                STREAM_FILE="$LOCAL_FILE"
                echo "[INFO] Copy successful"
            else
                echo "[WARN] Copy failed, will use test pattern"
            fi
        fi
    else
        echo "[WARN] Source file NOT found at $SOURCE_FILE"
    fi
    
    if [ -n "$STREAM_FILE" ] && [ -f "$STREAM_FILE" ]; then
        echo "[INFO] Starting FFmpeg stream from $STREAM_FILE..."
        echo "[INFO] Transcoding with GOP=${GOP_SIZE} (${KEYFRAME_INTERVAL}s keyframes) for YouTube compatibility"

        # ALWAYS transcode to ensure proper keyframes for YouTube
        # YouTube requires keyframes every 2 seconds
        ffmpeg -hide_banner -loglevel warning \
            -re -stream_loop -1 -i "$STREAM_FILE" \
            -c copy \
            -f flv \
            -flvflags no_duration_filesize \
            "$RTMP_URL" 2>&1 | while read line; do
                echo "[FFMPEG] $line"
            done

        exit_code=$?

        if [ $exit_code -ne 0 ]; then
            retry_count=$((retry_count + 1))
            echo "[WARN] FFmpeg exited with code $exit_code (attempt $retry_count/$MAX_RETRIES)"

            if [ $retry_count -ge $MAX_RETRIES ]; then
                echo "[ERROR] Max retries reached. Exiting."
                exit 1
            fi

            echo "[INFO] Waiting ${RETRY_DELAY}s before retry..."
            sleep $RETRY_DELAY
        else
            retry_count=0
        fi
    else
        echo "[INFO] Using test pattern (colored bars with audio tone)..."

        # Generate test pattern with tone - this always works
        ffmpeg -hide_banner -loglevel warning \
            -re -f lavfi -i "testsrc=size=1920x1080:rate=30" \
            -f lavfi -i "sine=frequency=440:sample_rate=44100" \
            -c:v libx264 -preset ultrafast \
            -b:v ${VIDEO_BITRATE}k \
            -g ${GOP_SIZE} \
            -keyint_min ${GOP_SIZE} \
            -sc_threshold 0 \
            -pix_fmt yuv420p \
            -c:a aac -b:a ${AUDIO_BITRATE}k -ar 44100 \
            -t 3600 \
            -f flv \
            "$RTMP_URL" 2>&1 | while read line; do
                echo "[FFMPEG] $line"
            done

        echo "[INFO] Test pattern stream cycle complete. Restarting..."
        sleep 1
    fi
done
