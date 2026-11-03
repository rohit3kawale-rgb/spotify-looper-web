import ctypes
import sys

PROCESS_TERMINATE = 1
kernel32 = ctypes.windll.kernel32
pid = int(sys.argv[1])
handle = kernel32.OpenProcess(PROCESS_TERMINATE, 0, pid)
if not handle:
    print("OpenProcess failed:", kernel32.GetLastError())
    sys.exit(1)
ok = kernel32.TerminateProcess(handle, 0)
print("terminated:", ok)
kernel32.CloseHandle(handle)