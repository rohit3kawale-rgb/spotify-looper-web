@echo off
REM Development startup script for Spotify Looper Web (Windows)
REM Runs both backend (FastAPI) and frontend (Vite) concurrently

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..
set BACKEND_DIR=%PROJECT_ROOT%\backend
set FRONTEND_DIR=%PROJECT_ROOT%\frontend

echo 🎵 Starting Spotify Looper Web (Development)
echo =============================================

REM Check for required tools
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Python is not installed. Please install it first.
    exit /b 1
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install it first.
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install it first.
    exit /b 1
)

REM Setup backend
echo 🔧 Setting up backend...
cd /d "%BACKEND_DIR%"

if not exist ".venv" (
    echo    Creating Python virtual environment...
    python -m venv .venv
)

echo    Activating venv and installing dependencies...
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt

REM Check for .env file
if not exist ".env" (
    echo    Creating .env from example...
    copy .env.example .env >nul 2>nul
    if %errorlevel% neq 0 (
        echo SPOTIFY_CLIENT_ID=your_client_id_here > .env
        echo SPOTIFY_REDIRECT_URI=http://localhost:8000/api/auth/callback >> .env
        echo HOST=0.0.0.0 >> .env
        echo PORT=8000 >> .env
        echo CORS_ORIGINS=http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000 >> .env
        echo JWT_EXPIRES_MIN=43200 >> .env
    )
    echo    ⚠️  Please edit backend\.env with your Spotify Client ID
)

REM Setup frontend
echo 🔧 Setting up frontend...
cd /d "%FRONTEND_DIR%"

if not exist "node_modules" (
    echo    Installing npm dependencies...
    npm install
)

echo.
echo 🚀 Starting servers...
echo    Backend:  http://localhost:8000
echo    Frontend: http://localhost:5173
echo    API Docs: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop both servers
echo.

REM Start backend in new window
start "Spotify Looper Backend" cmd /k "cd /d "%BACKEND_DIR%" && call .venv\Scripts\activate.bat && python app.py"

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start frontend in new window
start "Spotify Looper Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && npm run dev"

echo ✅ Both servers launched in separate windows!
pause