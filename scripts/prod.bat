@echo off
REM Production build script for Spotify Looper Web (Windows)
REM Builds frontend and prepares backend for production

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..
set BACKEND_DIR=%PROJECT_ROOT%\backend
set FRONTEND_DIR=%PROJECT_ROOT%\frontend

echo 🎵 Building Spotify Looper Web (Production)
echo ===============================================

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

echo    Installing production dependencies...
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt
pip install -q gunicorn

REM Check for .env file
if not exist ".env" (
    echo    ⚠️  No .env file found. Creating from example...
    copy .env.example .env >nul 2>nul
    if %errorlevel% neq 0 (
        echo SPOTIFY_CLIENT_ID=your_client_id_here > .env
        echo SPOTIFY_REDIRECT_URI=https://yourdomain.com/api/auth/callback >> .env
        echo HOST=0.0.0.0 >> .env
        echo PORT=8000 >> .env
        echo CORS_ORIGINS=https://yourdomain.com >> .env
        echo JWT_EXPIRES_MIN=43200 >> .env
    )
    echo    ⚠️  Please edit backend\.env with production values
)

REM Build frontend
echo 🔨 Building frontend...
cd /d "%FRONTEND_DIR%"

if not exist "node_modules" (
    echo    Installing npm dependencies...
    npm ci
)

echo    Running production build...
npm run build

REM Copy built frontend to backend static
echo    Copying build to backend\static...
if exist "%BACKEND_DIR%\static" rmdir /s /q "%BACKEND_DIR%\static"
mkdir "%BACKEND_DIR%\static"
xcopy /E /I /Y "dist\*" "%BACKEND_DIR%\static\" >nul

echo.
echo ✅ Build complete!
echo.
echo To run in production:
echo   cd %BACKEND_DIR%
echo   call .venv\Scripts\activate.bat
echo   gunicorn app:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
echo.
echo Or with Docker:
echo   docker-compose up -d
echo.
pause