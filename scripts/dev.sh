#!/bin/bash
# Development startup script for Spotify Looper Web
# Runs both backend (FastAPI) and frontend (Vite) concurrently

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

echo "🎵 Starting Spotify Looper Web (Development)"
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

echo "   Activating venv and installing dependencies..."
source .venv/bin/activate
pip install -q -r requirements.txt

# Check for .env file
if [ ! -f ".env" ]; then
    echo "   Creating .env from example..."
    cp .env.example .env 2>/dev/null || cat > .env << 'EOF'
# Spotify OAuth (get from https://developer.spotify.com/dashboard)
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_REDIRECT_URI=http://localhost:8000/api/auth/callback

# Server
HOST=0.0.0.0
PORT=8000

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000

# JWT
JWT_EXPIRES_MIN=43200
EOF
    echo "   ⚠️  Please edit backend/.env with your Spotify Client ID"
fi

# Setup frontend
echo "🔧 Setting up frontend..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
    echo "   Installing npm dependencies..."
    npm install
fi

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend
echo "🚀 Starting backend on http://localhost:8000..."
cd "$BACKEND_DIR"
source .venv/bin/activate
python app.py &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3

# Start frontend
echo "🚀 Starting frontend on http://localhost:5173..."
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Both servers running!"
echo "   Backend:  http://localhost:8000"
echo "   Frontend: http://localhost:5173"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers"

wait