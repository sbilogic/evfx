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
    output.parent.mkdir(parents=True,exist_ok=True)
    written=0
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        if config.get('template'):
            replacement=[(name,data) for name,data in entries.items() if name.lower().endswith('.aex')]
            if len(replacement)!=1:raise ValueError('A native overlay requires exactly one AEX')
            replacement_name,replacement_data=replacement[0]
            with zipfile.ZipFile(config['template']) as template:
                candidates=[name for name in template.namelist() if name.lower().endswith('.aex')]
                matching=[name for name in candidates if Path(name).name.lower()==replacement_name.lower()]
                if len(matching)>1:
                    depth=min(name.count('/') for name in matching)
                    matching=[name for name in matching if name.count('/')==depth]
                target=matching[0] if len(matching)==1 else candidates[0] if len(candidates)==1 else None
                if not target:raise ValueError('The existing package does not identify a unique AEX to update')
                patches={target:replacement_data}
                for companion,data in entries.items():
                    if companion.lower().endswith('.aex'):continue
                    matches=[name for name in template.namelist() if Path(name).name.lower()==Path(companion).name.lower()]
                    if not matches:continue
                    depth=min(name.count('/') for name in matches)
                    matches=[name for name in matches if name.count('/')==depth]
                    if len(matches)!=1:raise ValueError('Ambiguous companion file in existing package: '+companion)
                    patches[matches[0]]=data
                for info in template.infolist():
                    if info.is_dir():continue
                    name=info.filename.replace('\\','/')
                    if name.startswith('/') or ':' in name.split('/')[0] or '..' in Path(name).parts:raise ValueError('Template entry escaped package root')
                    data=patches.get(info.filename,None)
                    if data is None:data=template.read(info)
                    fixed=zipfile.ZipInfo(name,date_time=(2020,1,1,0,0,0));fixed.compress_type=zipfile.ZIP_DEFLATED;fixed.external_attr=0o100644<<16
                    archive.writestr(fixed,data)
                    written+=1
            entries={}
        else:
            entries['INSTALL.txt']=config['guide'].encode('utf-8')
        for name,data in sorted(entries.items()):
            info=zipfile.ZipInfo(name,date_time=(2020,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644<<16
            archive.writestr(info,data)
            written+=1
    print(json.dumps({'files':written,'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}))

if __name__=='__main__':main()
