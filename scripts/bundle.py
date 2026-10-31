"""Deterministic, allow-listed distribution bundles. No build or install occurs."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

def main():
    config=json.load(sys.stdin)
    base=Path(config['base']).resolve()
    output=Path(config['output']).resolve()
    entries={}
    excluded={'__pycache__','.git','.claude','.agents','node_modules','tests','test-output'}
    allowed={'.py','.jsx','.aex','.exe','.cmd','.ps1','.json','.md','.txt','.html','.ico','.png','.svg','.dll','.license'}
    for value in config['files']:
        source=(base/value).resolve()
        if not source.is_relative_to(base):raise ValueError('Input escaped source root')
        if not source.exists():raise FileNotFoundError(value)
        candidates=source.rglob('*') if source.is_dir() else [source]
        for file in candidates:
            if not file.is_file():continue
            relative=file.relative_to(base)
            if any(part in excluded for part in relative.parts):continue
            if file.suffix.lower() not in allowed and file.name not in {'LICENSE','COPYING','NOTICE'}:continue
            name=str(relative if config.get('preservePaths') else Path(file.name)).replace('\\','/')
            if name in entries:raise ValueError('Duplicate distribution path: '+name)
            entries[name]=file.read_bytes()
    if not entries:raise ValueError('Distribution contains no payload files')
    entries['INSTALL.txt']=config['guide'].encode('utf-8')
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name,data in sorted(entries.items()):
            info=zipfile.ZipInfo(name,date_time=(2020,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644<<16
            archive.writestr(info,data)
    print(json.dumps({'files':len(entries),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}))

if __name__=='__main__':main()
