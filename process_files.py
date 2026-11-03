import json
import os

results = []

# Process Music directory
music_dir = r'C:\Users\rohit\Music'
for root, dirs, files in os.walk(music_dir):
    for f in files:
        path = os.path.join(root, f)
        try:
            size = os.path.getsize(path)
            name = f
            if '.' in name:
                ext = name.rsplit('.', 1)[-1]
            else:
                ext = ''
            path_unix = path.replace('\\', '/')
            results.append({'path': path_unix, 'size': size, 'name': name, 'ext': ext})
        except:
            pass

# Process Documents directory
docs_dir = r'C:\Users\rohit\Documents'
for root, dirs, files in os.walk(docs_dir):
    for f in files:
        path = os.path.join(root, f)
        try:
            size = os.path.getsize(path)
            name = f
            if '.' in name:
                ext = name.rsplit('.', 1)[-1]
            else:
                ext = ''
            path_unix = path.replace('\\', '/')
            results.append({'path': path_unix, 'size': size, 'name': name, 'ext': ext})
        except:
            pass

# Sort by size descending
results.sort(key=lambda x: x['size'], reverse=True)

print(json.dumps(results, indent=2))