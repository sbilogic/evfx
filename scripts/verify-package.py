"""Check a distribution without executing it or extracting its contents."""
from pathlib import Path,PurePosixPath
import sys
import zipfile

for value in sys.argv[1:]:
    path=Path(value)
    if path.suffix.lower()=='.zip':
        with zipfile.ZipFile(path) as archive:
            for info in archive.infolist():
                name=PurePosixPath(info.filename.replace('\\','/'))
                if name.is_absolute() or '..' in name.parts:raise ValueError('Unsafe archive path: '+info.filename)
                if any(p.lower() in {'.git','.env','credentials.json','id_rsa','id_ed25519'} for p in name.parts):raise ValueError('Private file in distribution: '+info.filename)
            bad=archive.testzip()
            if bad:raise ValueError('Corrupt archive member: '+bad)
    elif path.suffix.lower()=='.exe':
        with path.open('rb') as stream:
            if stream.read(2)!=b'MZ':raise ValueError('Invalid Windows installer: '+path.name)
print('Distribution integrity checks passed.')
