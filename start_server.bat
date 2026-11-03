@echo off
cd /d "C:\Users\rohit\omniroute_claude\spotify-looper-web\backend"
python -m uvicorn app:app --host 0.0.0.0 --port 8000