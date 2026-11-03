"""Kill all uvicorn/python processes on ports 8000 and 8001."""
import subprocess, sys

for port in [8000, 8001]:
    r = subprocess.run(['netstat', '-ano'], capture_output=True, text=True)
    for line in r.stdout.splitlines():
        if f':{port}' in line and 'LISTENING' in line:
            pid = line.strip().split()[-1]
            if pid.isdigit():
                subprocess.run(['taskkill', '/PID', pid, '/F'], capture_output=True)
                print(f'Killed PID {pid} on port {port}')