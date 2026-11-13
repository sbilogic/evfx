"""Create a private distribution locally; the caller encrypts it before upload."""
import json
import hashlib
import os
import sys
import zipfile
from pathlib import Path, PurePosixPath


def archive_name(value):
    path = PurePosixPath(value)
    if path.is_absolute() or not value or any(part in ("", ".", "..") for part in path.parts) or "\\" in value:
        raise ValueError("Unsafe archive path")
    return path.as_posix()


recipe = json.load(sys.stdin)
output = Path(recipe["output"])
files = {}
for item in recipe.get("files", []):
    files[archive_name(item["to"])] = Path(item["from"])
for item in recipe.get("directories", []):
    source = Path(item["from"])
    target = archive_name(item["to"])
    if not source.is_dir():
        raise FileNotFoundError(source)
    for root, dirs, names in os.walk(source, followlinks=False):
        dirs[:] = [d for d in dirs if not (Path(root) / d).is_symlink()]
        dirs.sort()
        for name in sorted(names):
            path = Path(root) / name
            if path.is_symlink():
                continue
            files[archive_name(target + "/" + path.relative_to(source).as_posix())] = path
text = {archive_name(item["to"]): item["text"] for item in recipe.get("text", [])}
verification = recipe.get("verification")
if verification:
    binary_hash = hashlib.sha256(Path(verification["binary"]).read_bytes()).hexdigest()
    if binary_hash != verification["sha256"]:
        with zipfile.ZipFile(recipe["template"]) as template:
            previous = template.read(archive_name(verification["entry"])).decode("utf-8")
        text[archive_name(verification["entry"])] = (
            "WARNING: This binary differs from the previously verified build. "
            "The verification below applies only to the earlier build and has not been repeated.\r\n\r\n" + previous
        )
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as dest:
    if recipe.get("template"):
        with zipfile.ZipFile(recipe["template"]) as template:
            for item in template.infolist():
                archive_name(item.filename.rstrip("/"))
                if not item.is_dir() and item.filename not in files and item.filename not in text:
                    dest.writestr(item, template.read(item))
    for name, path in files.items():
        if not path.is_file():
            raise FileNotFoundError(path)
        before = path.stat()
        dest.write(path, name)
        after = path.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise RuntimeError("Build changed while it was being packaged")
    for name, value in text.items():
        info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        dest.writestr(info, value)
