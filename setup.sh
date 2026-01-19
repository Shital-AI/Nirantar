#!/bin/bash

# ============================================================
# Nirantar RTMP - Installation Script
# ============================================================
# This script sets up Nirantar RTMP streaming system
# Usage: ./setup.sh
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                            ║${NC}"
echo -e "${BLUE}║              ${GREEN}NIRANTAR RTMP SETUP${BLUE}                          ║${NC}"
echo -e "${BLUE}║           Always-On Livestream System                      ║${NC}"
echo -e "${BLUE}║                                                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check for Docker
check_docker() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}❌ Docker is not installed.${NC}"
        echo "Please install Docker first: https://docs.docker.com/get-docker/"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker is installed${NC}"
    
    if ! docker info &> /dev/null; then
        echo -e "${RED}❌ Docker daemon is not running.${NC}"
        echo "Please start Docker Desktop or the Docker service."
        exit 1
    fi
    echo -e "${GREEN}✓ Docker is running${NC}"
    
    if ! command -v docker compose &> /dev/null; then
        echo -e "${RED}❌ Docker Compose is not installed.${NC}"
        echo "Please install Docker Compose: https://docs.docker.com/compose/install/"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker Compose is available${NC}"
    echo ""
}

# Create .env file if it doesn't exist
setup_env() {
    if [ ! -f .env ]; then
        echo -e "${YELLOW}Creating environment configuration...${NC}"
        
        # Generate secure secrets
        NEXTAUTH_SECRET=$(openssl rand -base64 48 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n' | head -c 64)
        ENCRYPTION_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
        DB_PASSWORD=$(openssl rand -base64 24 2>/dev/null || head -c 24 /dev/urandom | base64 | tr -d '\n/+=' | head -c 24)
        
        # Create .env from example
        cp .env.example .env
        
        # Replace placeholders with generated values
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/CHANGE_THIS_TO_SECURE_PASSWORD/${DB_PASSWORD}/g" .env
            sed -i '' "s/CHANGE_THIS_TO_RANDOM_64_CHAR_STRING/${NEXTAUTH_SECRET}/g" .env
            sed -i '' "s/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef/${ENCRYPTION_KEY}/g" .env
        else
            # Linux
            sed -i "s/CHANGE_THIS_TO_SECURE_PASSWORD/${DB_PASSWORD}/g" .env
            sed -i "s/CHANGE_THIS_TO_RANDOM_64_CHAR_STRING/${NEXTAUTH_SECRET}/g" .env
            sed -i "s/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef/${ENCRYPTION_KEY}/g" .env
        fi
        
        echo -e "${GREEN}✓ Environment file created with secure random keys${NC}"
    else
        echo -e "${GREEN}✓ Environment file already exists${NC}"
    fi
    echo ""
}

# Create necessary directories
setup_directories() {
    echo -e "${YELLOW}Setting up directories...${NC}"
    
    mkdir -p media
    mkdir -p logs
    
    echo -e "${GREEN}✓ Directories created${NC}"
    echo ""
}

# Build and start services
start_services() {
    echo -e "${YELLOW}Building and starting services...${NC}"
    echo "This may take a few minutes on first run..."
    echo ""
    
    docker compose up -d --build
    
    echo ""
    echo -e "${GREEN}✓ All services started${NC}"
    echo ""
}

# Wait for services to be healthy
wait_for_services() {
    echo -e "${YELLOW}Waiting for services to be ready...${NC}"
    
    # Wait for postgres
    echo -n "  Waiting for database..."
    for i in {1..30}; do
        if docker exec postgres pg_isready -U livestream_admin -d livestream_db &> /dev/null; then
            echo -e " ${GREEN}✓${NC}"
            break
        fi
        sleep 1
        echo -n "."
    done
    
    # Wait for web-admin
    echo -n "  Waiting for web admin..."
    for i in {1..60}; do
        if curl -s http://localhost:3002 > /dev/null 2>&1; then
            echo -e " ${GREEN}✓${NC}"
            break
        fi
        sleep 1
        echo -n "."
    done
    
    echo ""
}

# Print success message
print_success() {
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                            ║${NC}"
    echo -e "${GREEN}║              ✓ INSTALLATION COMPLETE!                      ║${NC}"
    echo -e "${GREEN}║                                                            ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Access your dashboard:${NC}"
    echo -e "  URL:      ${GREEN}http://localhost:3002${NC}"
    echo -e "  Email:    ${GREEN}admin@livestream.local${NC}"
    echo -e "  Password: ${GREEN}admin123${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  IMPORTANT: Change the default password after first login!${NC}"
    echo ""
    echo -e "${BLUE}RTMP Ingest URL:${NC}"
    echo -e "  ${GREEN}rtmp://localhost:1935/live${NC}"
    echo ""
    echo -e "${BLUE}Useful Commands:${NC}"
    echo -e "  View logs:     ${GREEN}docker compose logs -f${NC}"
    echo -e "  Stop system:   ${GREEN}docker compose down${NC}"
    echo -e "  Restart:       ${GREEN}docker compose restart${NC}"
    echo ""
}

# Main execution
main() {
    check_docker
    setup_env
    setup_directories
    start_services
    wait_for_services
    print_success
}

main
