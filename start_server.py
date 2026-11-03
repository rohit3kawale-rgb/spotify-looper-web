import subprocess, sys, os

# Change to backend directory
os.chdir('C:\\Users\\rohit\\omniroute_claude\\spotify-looper-web\\backend')

# Start uvicorn
subprocess.run([sys.executable, '-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', '8000'])