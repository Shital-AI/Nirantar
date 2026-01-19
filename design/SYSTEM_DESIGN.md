# Production Livestream Platform Design Document

## 1. System Overview
This platform provides a robust, 24x7 unattended livestreaming solution. It manages multiple isolated channels (e.g., Waheguru, Krishna), each with dual redundancies (OBS live input vs. Backup Looping MP4), automatic failover, and multi-destination restreaming (YouTube, Facebook, etc.).

### Core Philosophy
- **Media Plane (SRS)**: Single heavily-optimized RTMP server instance. Stateless packet shuttling.
- **Control Plane (Go + Postgres)**: Single source of truth. Reconciles state. No "magic" in the media plane; the controller orchestrates everything.
- **Isolation**: Each channel is a distinct logical entity with separate secrets, timestamps, and Docker containers.

## 2. Architecture

### 2.1 Component Diagram
```mermaid
graph TD
    subgraph "External Control"
        Admin[Admin User] -->|HTTPS| Traefik
        OBS[OBS Studio] -->|RTMP| TraefikTCP
    end
    
    subgraph "Edge / Ingress"
        Traefik[Traefik Proxy]
        TraefikTCP[Traefik TCP Router]
    end
    
    subgraph "Media Plane"
        SRS[SRS 5.x Media Server]
    end
    
    subgraph "Runtime Plane"
        Loop1[FFmpeg Loop Container (Waheguru)]
        Loop2[FFmpeg Loop Container (Krishna)]
    end
    
    subgraph "Control Plane"
        UI[Next.js Admin UI]
        API[Go Control API]
        Controller[Go Reconciler Agent]
        DB[(Postgres DB)]
    end
    
    subgraph "Desinations"
        YT[YouTube Live]
        FB[Facebook Live]
    end

    Traefik --> UI
    Traefik --> API
    TraefikTCP -->|Port 1935| SRS
    
    OBS -->|Stream: app/chan_obs| SRS
    Loop1 -->|Stream: app/chan_loop| SRS
    
    Controller -- 1. Health Poll --> SRS
    Controller -- 2. Manage --> Loop1
    Controller -- 3. Read/Write --> DB
    Controller -- 4. Update Config --> SRS
```

### 2.2 Data Flow & Failover Logic
For a channel "Waheguru":
1.  **Ingest A (Priority)**: OBS pushes to `rtmp://host/live/waheguru_obs?token=XYZ`
2.  **Ingest B (Backup)**: FFmpeg container loops a local MP4, pushes to `rtmp://host/live/waheguru_loop?token=ABC`
3.  **Failover Mechanism**:
    *   The **Controller** polls SRS API (`/api/v1/streams`) every 2 seconds.
    *   **Logic**:
        *   IF `waheguru_obs` is Publishing AND Stable (>5s):
            *   State = `OBS_ACTIVE`
            *   Action: Instruct SRS to forward `waheguru_obs` to `waheguru_final`.
            *   (Alternative simple logic): Controller Stops the Loop container locally to save resources (optional), or lets it run but ensures Output uses OBS.
            *   *Selected Strategy*: **SRS Forwarder Rewriting**.
                *   SRS is configured with an "Output/Restream" edge.
                *   However, dynamic restreaming configuration in SRS usually requires reload.
                *   **Better Strategy for Instant Switch**:
                    *   Controller manages a specialized **FFmpeg Switcher** process (or uses the Loop container as the switcher).
                    *   ACTUALLY: The prompt asks for "One FFmpeg LOOP publisher container... if active source fails... switch".
                    *   **Revised Strategy**:
                        *   The LOOP publisher container is *smart*. It's not just ffmpeg. It's a Go wrapper around ffmpeg or a shell script.
                        *   It checks "Is OBS active?" via API.
                        *   If YES -> Loop publishes "Silence/Black" or stops publishing entirely.
                        *   If NO -> Loop publishes Content.
                        *   This effectively gives OBS the airtime if they both push to the same destination? No, SRS blocks collisions.
                        *   **Final Strategy**: **Token-based Preemption NOT possible in standard SRS**.
                        *   **Controller-Driven Switch**:
                            *   OBS pushes to `_obs`.
                            *   Loop pushes to `_loop`.
                            *   Controller uses `ffmpeg` (Ephemeral Process) to pull from `_obs` (if alive) OR `_loop` and push to `YouTube`.
                            *   *Wait*, cost of re-encoding? No, `-c copy`.
                            *   This "Forwarder" is the reliability bottleneck but provides clean switching.
4.  **Output**:
    *   The "Active" content is pushed to remote RTMP (YouTube).

## 3. Security Model
-   **Publish Auth**: SRS HTTP Callback to `http://controller/api/hooks/on_publish`.
    -   Validates Stream Key (Token).
    -   Validates checks: `is_obs` vs `is_loop`.
    -   Enforces: `waheguru_obs` can ONLY be published by OBS token. `waheguru_loop` only by System Loop token.
-   **Admin UI**: NextAuth.js (email/password or OAuth). RBAC (Admin/Operator/Viewer) stored in Postgres.
-   **Encryption**: Secrets (Stream keys) stored encrypted in PG (AES-GCM).

## 4. Operational Runbook
-   **Startup**: `docker-compose up -d`. Controller monitors DB for desired channels. Spins up Loop containers.
-   **Backup**: Dump PG database.
-   **Rotation**: API endpoint to regenerate stream keys. Controller kills current stream to force reconnection with new key.

## 5. Directory Structure
-   `/srs`: Config templates.
-   `/apps/controller`: Go source for reconciler.
-   `/apps/web-admin`: Next.js source.
-   `/apps/loop-publisher`: Dockerfile for the looper.
-   `/docker`: Compose files.

