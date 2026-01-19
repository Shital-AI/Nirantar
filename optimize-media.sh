#!/bin/bash

# Nirantar Media Optimizer
# Converts videos to RTMP-ready format (H.264/AAC, CBR, 30fps, GOP=2s)
# Usage: ./optimize-media.sh

MEDIA_DIR="./media"
mkdir -p "$MEDIA_DIR"

echo "Checking for Docker..."
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running."
  exit 1
fi

echo "Scanning $MEDIA_DIR for videos..."

# Use linuxserver/ffmpeg image mounted to local media dir
# We use $(pwd) to get absolute path for Docker volume
HOST_MEDIA_PATH="$(pwd)/media"

for file in "$MEDIA_DIR"/*.mp4 "$MEDIA_DIR"/*.mkv "$MEDIA_DIR"/*.mov; do
  # Check if file exists (loop might return literal string if no match)
  [ -e "$file" ] || continue

  filename=$(basename "$file")
  
  # Skip already backed up originals
  if [[ "$filename" == *".original."* ]]; then
    continue
  fi

  # Skip if we suspect it's already optimized (metadata check is hard from bash, so we rely on user running this once)
  # Or we check if ".original" version exists
  if [ -f "$MEDIA_DIR/${filename%.*}.original.mp4" ]; then
    echo "Skipping $filename (Already optimized version exists)"
    continue
  fi

  echo "----------------------------------------------------------------"
  echo "Optimizing: $filename"
  echo "Target: H.264, 4500kbps CBR, 30fps, AAC"
  echo "----------------------------------------------------------------"

  # Run FFmpeg Container
  # -r 30: Force 30fps
  # -g 60: Keyframe every 60 frames (2s at 30fps)
  # -b:v 4500k -maxrate 4500k -bufsize 4500k: Strict CBR
  docker run --rm -v "$HOST_MEDIA_PATH":/config linuxserver/ffmpeg:latest \
    -hide_banner -loglevel error -stats \
    -i "/config/$filename" \
    -vf "scale=-2:'max(1080,ih)'" \
    -c:v libx264 -preset medium -profile:v high -level 4.2 \
    -pix_fmt yuv420p \
    -r 30 -g 60 -keyint_min 60 -sc_threshold 0 \
    -force_key_frames "expr:gte(t,n_forced*2)" \
    -b:v 4000k -minrate 4000k -maxrate 4000k -bufsize 8000k \
    -c:a aac -b:a 128k -ar 44100 \
    -movflags +faststart \
    -y "/config/${filename%.*}.optimized.temp.mp4"

  if [ $? -eq 0 ]; then
    echo "Conversion successful."
    # Backup original
    mv "$file" "$MEDIA_DIR/${filename%.*}.original.${filename##*.}"
    # Move new file to original location
    mv "$MEDIA_DIR/${filename%.*}.optimized.temp.mp4" "$MEDIA_DIR/${filename%.*}.mp4"
    echo "Updated $filename with optimized version."
  else
    echo "Error converting $filename"
    rm -f "$MEDIA_DIR/${filename%.*}.optimized.temp.mp4"
  fi

done

echo "----------------------------------------------------------------"
echo "All done! Your media is now ready for Direct Copy streaming."
