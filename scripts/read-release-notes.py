"""Read small release-note files from an archive without extracting it."""
import json
import os
import sys
import zipfile

names = {"changelog.md", "changelog.txt", "release_notes.md", "release_notes.txt",
         "release-notes.md", "release-notes.txt"}
result = []
try:
    with zipfile.ZipFile(sys.argv[1]) as archive:
        for item in archive.infolist():
            if os.path.basename(item.filename).lower() in names and 0 < item.file_size <= 256_000:
                result.append(archive.read(item).decode("utf-8-sig", errors="replace"))
                if len(result) == 3:
                    break
except (OSError, zipfile.BadZipFile):
    pass
json.dump(result, sys.stdout, ensure_ascii=True)
