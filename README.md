# Nirantar

**An always-on livestream system that runs itself.**

Nirantar is an open-source, autonomous livestream system built to keep your stream continuously live, even when people, internet, or systems fail.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Docker](https://img.shields.io/badge/docker-required-blue.svg)

---

## 🚀 Quick Start

### Prerequisites

- **Docker** (20.10 or higher)
- **Docker Compose** (v2.0 or higher)
- **4GB RAM** minimum (8GB recommended)
- **10GB disk space** for media storage

### Installation (3 Steps)

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_REPO/nirantar-rtmp.git
cd nirantar-rtmp

# 2. Create your environment file
cp .env.example .env

# 3. Start the system
docker compose up -d --build
```

### Access the Dashboard

Open your browser and go to:
- **Dashboard**: http://localhost:3002
- **Default Login**:
  - Email: `admin@livestream.local`
  - Password: `admin123`

⚠️ **Important**: Change the default password immediately after first login!

---

## 📋 Configuration

### Environment Variables

Edit the `.env` file to configure your installation:

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | Database password | `CHANGE_THIS` |
| `NEXTAUTH_SECRET` | Auth encryption key | `CHANGE_THIS` |
| `PUBLIC_HOST` | Your server's public IP/domain | *(empty)* |
| `RTMP_PORT` | RTMP ingest port | `1935` |

### SMTP Configuration

SMTP settings are configured through the Admin UI:
1. Login to the dashboard
2. Go to **Config** → **Email** tab
3. Enter your SMTP server details

### Security Keys

Generate secure keys for production:

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 48

# Generate ENCRYPTION_KEY
openssl rand -hex 32
```

---

## 🎬 Usage

### For Streamers (OBS Setup)

1. Open OBS Studio
2. Go to **Settings** → **Stream**
3. Select **Custom** as Service
4. Enter:
   - **Server**: `rtmp://YOUR_SERVER_IP:1935/live`
   - **Stream Key**: Get from Dashboard → Channels

### Multi-Destination Streaming

Stream to YouTube, Facebook, Twitch simultaneously:
1. Go to **Channels** in the dashboard
2. Click on a channel
3. Add destinations with their RTMP URLs and stream keys

### Failover System

When your OBS stream stops:
1. System automatically switches to backup loop video
2. When OBS comes back online, it switches back automatically
3. Viewers never see a blank screen

---

## 🏗️ Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│   OBS/RTMP  │────▶│  Nirantar   │────▶│   YouTube    │
│   Source    │     │  Controller │     │   Facebook   │
└─────────────┘     │             │     │   Twitch     │
                    │  ┌───────┐  │     └──────────────┘
┌─────────────┐     │  │  SRS  │  │
│   Backup    │────▶│  │Server │  │
│   Loop      │     │  └───────┘  │
└─────────────┘     └─────────────┘
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| Web Admin | 3002 | Dashboard UI |
| Proxy | 80 | Main entry point |
| SRS | 1935 | RTMP ingest |
| SRS | 8080 | HLS streaming |
| Controller | 8080 | API server |
| PostgreSQL | 5432 | Database |

---

## 📁 Project Structure

```
nirantar-rtmp/
├── apps/
│   ├── controller/      # Go backend API
│   ├── web-admin/       # Next.js dashboard
│   ├── relay/           # RTMP relay manager
│   ├── loop-publisher/  # Backup loop publisher
│   └── proxy/           # Nginx proxy config
├── sql/                 # Database schema
├── srs/                 # SRS configuration
├── media/               # Media files (backup videos)
├── docker-compose.yml   # Docker orchestration
└── .env.example         # Environment template
```

---

## 🔧 Commands

### Start/Stop

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f web-admin
```

### Rebuild

```bash
# Rebuild after code changes
docker compose up -d --build

# Rebuild specific service
docker compose up -d --build web-admin
```

### Database

```bash
# Access PostgreSQL
docker exec -it postgres psql -U livestream_admin -d livestream_db

# Reset database (WARNING: deletes all data)
docker compose down -v
docker compose up -d
```

---

## 🔒 Production Deployment

### Security Checklist

- [ ] Change default admin password
- [ ] Set strong `POSTGRES_PASSWORD`
- [ ] Generate secure `NEXTAUTH_SECRET`
- [ ] Generate secure `ENCRYPTION_KEY`
- [ ] Configure SSL/TLS (use reverse proxy)
- [ ] Set `PUBLIC_HOST` to your domain
- [ ] Configure firewall rules

### Using a Reverse Proxy (Recommended)

For production, use nginx or Traefik with SSL:

```nginx
server {
    listen 443 ssl;
    server_name stream.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

---

## 🛠️ Troubleshooting

### Common Issues

**Container won't start**
```bash
# Check logs
docker compose logs controller
docker compose logs web-admin
```

**Database connection error**
```bash
# Ensure postgres is healthy
docker compose ps
# Should show "healthy" for postgres
```

**RTMP not accepting connections**
```bash
# Check SRS is running
docker compose logs srs
# Verify port 1935 is open
```

**Login not working**
```bash
# Reset to default admin user
docker exec postgres psql -U livestream_admin -d livestream_db \
  -c "UPDATE users SET password_hash='\$2a\$10\$K7L1OJ45/4Y2nIvhRVpCe.FSmhDdWoXehVzJptJ/op0lSsvqNu/X6' WHERE email='admin@livestream.local';"
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 🙏 Acknowledgements

- [SRS (Simple Realtime Server)](https://github.com/ossrs/srs) - The internal streaming engine
- [Next.js](https://nextjs.org/) - Dashboard framework
- [Go](https://golang.org/) - Backend controller

---

## 💬 Support

- **Documentation**: See the `/design` folder for system design docs
- **Issues**: Open a GitHub issue for bugs or feature requests
- **Email**: contact@shitalai.com

---

*Built with ❤️ by [Shital AI](https://shitalai.com)*