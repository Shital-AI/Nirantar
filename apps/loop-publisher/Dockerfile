FROM alpine:3.18

RUN apk add --no-cache ffmpeg bash curl

WORKDIR /app

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Default variable, override in runtime
ENV RTMP_URL="rtmp://srs/live/stream"
ENV SOURCE_FILE="/app/media/source.mp4"

ENTRYPOINT ["/app/entrypoint.sh"]
