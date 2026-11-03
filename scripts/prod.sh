#!/bin/bash
# Production startup script for Spotify Looper Web
# Builds frontend and runs backend with Gunicorn/Uvicorn

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

echo "🎵 Building Spotify Looper Web (Production)"
echo "============================================="

# Check for required tools
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        exit 1
    fi
}

check_command python3
check_command node
check_command npm

# Setup backend
echo "🔧 Setting up backend..."
cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
    echo "   Creating Python virtual environment..."
    python3 -m venv .venv
fi

echo "   Installing production dependencies..."
source .venv/bin/activate
pip install -q -r requirements.txt
pip install -q gunicorn

# Check for .env file
if [ ! -f ".env" ]; then
    echo "   ⚠️  No .env file found. Creating from example..."
    cp .env.example .env 2>/dev/null || cat > .env << 'EOF'
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_REDIRECT_URI=https://yourdomain.com/api/auth/callback
HOST=0.0.0.0
PORT=8000
CORS_ORIGINS=https://yourdomain.com
JWT_EXPIRES_MIN=43200
EOF
    echo "   ⚠️  Please edit backend/.env with production values"
fi

# Build frontend
echo "🔨 Building frontend..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
    echo "   Installing npm dependencies..."
    npm ci
fi

echo "   Running production build..."
npm run build

# Copy built frontend to backend static
echo "   Copying build to backend/static..."
rm -rf "$BACKEND_DIR/static"
mkdir -p "$BACKEND_DIR/static"
cp -r dist/* "$BACKEND_DIR/static/"

echo ""
echo "✅ Build complete!"
echo ""
echo "To run in production:"
echo "  cd $BACKEND_DIR"
echo "  source .venv/bin/activate"
echo "  gunicorn app:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000"
echo ""
echo "Or with Docker:"
echo "  docker-compose up -d"