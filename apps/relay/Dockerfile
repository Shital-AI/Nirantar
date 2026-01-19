FROM golang:1.21-alpine AS builder

WORKDIR /app
COPY main.go .
RUN go mod init relay-manager && go build -o relay-manager main.go

FROM linuxserver/ffmpeg:latest

# Copy binary
COPY --from=builder /app/relay-manager /usr/local/bin/relay-manager

# Create media dir just in case
RUN mkdir -p /app/media

ENTRYPOINT ["/usr/local/bin/relay-manager"]
