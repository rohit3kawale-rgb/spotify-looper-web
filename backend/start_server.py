import subprocess
import sys
import os
os.chdir('/c/Users/rohit/omniroute_claude/spotify-looper-web/backend')
subprocess.run([sys.executable, '-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', '8000', '--reload'])
