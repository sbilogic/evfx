import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const run=(cmd,args,options={})=>spawnSync(cmd,args,{encoding:'utf8',windowsHide:true,...options});
async function verifyRepeatable(output,base,id){
  const second=join(base,'repaired-again.zip');
  const rerun=run('python',[join(root,'scripts','prepare-windows-installer.py'),output,second,id]);
  assert.equal(rerun.status,0,rerun.stderr);
  assert.deepEqual(await readFile(second),await readFile(output));
}

test('a native package installs from a path with spaces to a newly created MediaCore folder', {skip:process.platform!=='win32'},async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx installer test '));
  try{
    const input=join(base,'original.zip'),output=join(base,'fixed.zip'),folder=join(base,'extracted package');
    const make=run('python',['-c','import sys,zipfile;z=zipfile.ZipFile(sys.argv[1],"w");z.writestr("EVFX Example.aex",b"test binary");z.close()',input]);
    assert.equal(make.status,0,make.stderr);
    const fix=run('python',[join(root,'scripts','prepare-windows-installer.py'),input,output,'example']);
    assert.equal(fix.status,0,fix.stderr);
    const extract=run('python',['-c','import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',output,folder]);
    assert.equal(extract.status,0,extract.stderr);
    const launcher=await readFile(join(folder,'Install.cmd'),'utf8');
    assert.match(launcher,/%~dp0/i);
    assert.match(launcher,/ExecutionPolicy\s+Bypass/i);
    assert.match(launcher,/-Verb\s+RunAs/i);
    const line=launcher.split(/\r?\n/).find(value=>/^powershell\.exe\s/i.test(value));
    const expression=line?.match(/-Command "([\s\S]*)"$/i)?.[1];
    assert(expression,'launcher does not expose a PowerShell command');
    const checkElevation=`function Start-Process {
      param($FilePath,$Verb,[switch]$Wait,[switch]$PassThru,$ArgumentList)
      $expected = '-NoProfile -ExecutionPolicy Bypass -File ' + [char]34 + $env:EVFX_INSTALL_SCRIPT + [char]34
      if ($FilePath -ne 'powershell.exe' -or $Verb -ne 'RunAs' -or -not $Wait -or $ArgumentList -ne $expected) { throw 'Incorrect elevation arguments' }
      [pscustomobject]@{ ExitCode = 0 }
    }; `+expression;
    const elevation=run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',checkElevation],{
      env:{...process.env,EVFX_INSTALL_SCRIPT:join(folder,'Install.ps1')}
    });
    assert.equal(elevation.status,0,elevation.stderr+elevation.stdout);
    const programFiles=join(base,'Program Files'),local=join(base,'Local App Data');
    await mkdir(local,{recursive:true});
    const installer=join(folder,'Install.ps1');
    const destinationFolder=join(programFiles,'Adobe','Common','Plug-ins','7.0','MediaCore','EVFX Collection');
    assert.match(await readFile(installer,'utf8'),/\$env:ProgramFiles[^\r\n]*Adobe\\Common\\Plug-ins\\7\.0\\MediaCore/);
    const command=`function Get-Process { param($Name,$ErrorAction) }; & '${installer.replaceAll("'","''")}' -PluginDirectory '${destinationFolder.replaceAll("'","''")}'`;
    const result=run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',command],{
      env:{...process.env,LOCALAPPDATA:local}
    });
    assert.equal(result.status,0,result.stderr+result.stdout);
    const destination=join(programFiles,'Adobe','Common','Plug-ins','7.0','MediaCore','EVFX Collection','EVFX Example.aex');
    assert.equal((await readFile(destination)).toString(),'test binary');
    await writeFile(destination,'previous version');
    const again=run('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',command],{
      env:{...process.env,LOCALAPPDATA:local}
    });
    assert.equal(again.status,0,again.stderr+again.stdout);
    assert.equal((await readFile(destination)).toString(),'test binary');
    const backups=await (await import('node:fs/promises')).readdir(join(local,'EVFX','Backups','example'));
    assert.equal(backups.length,1);
    assert.equal((await readFile(join(local,'EVFX','Backups','example',backups[0]))).toString(),'previous version');
  }finally{await rm(base,{recursive:true,force:true});}
});

test('Rebalance replaces the developer-only installer and preserves the plugin',async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx rebalance installer '));
  try{
    const input=join(base,'input.zip'),output=join(base,'output.zip');
    const code='import sys,zipfile;z=zipfile.ZipFile(sys.argv[1],"w");z.writestr("EVFX Rebalance Plugin/EVFXRebalance.aex",b"plugin");z.writestr("EVFX Rebalance Plugin/Install.ps1",r"C:\\Program Files\\Adobe\\Common\\Plug-ins\\7.0\\MediaCore\\Testing\\EVFX");z.writestr("EVFX Rebalance Plugin/START HERE.txt",b"Save your project and close AE. Run Install.ps1, or copy EVFXRebalance.aex\\r\\nto your AE Plug-ins folder. Restart AE. This machine uses the existing\\r\\nwritable MediaCore Testing/EVFX development folder. Do not import the AEX\\r\\nas footage. Install only one version of the effect.");z.writestr("EVFX Rebalance Plugin/keep.txt",b"keep");z.close()';
    const make=run('python',['-c',code,input]);assert.equal(make.status,0,make.stderr);
    const fix=run('python',[join(root,'scripts','prepare-windows-installer.py'),input,output,'rebalance']);
    assert.equal(fix.status,0,fix.stderr);
    const check=run('python',['-c','import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);p="EVFX Rebalance Plugin/";s=z.read(p+"Install.ps1");assert b"MediaCore\\\\Testing" not in s;assert b"$env:ProgramFiles" in s;assert b"-Verb RunAs" in z.read(p+"Install.cmd");guide=z.read(p+"START HERE.txt");assert b"Install.cmd" in guide and b"Testing/EVFX" not in guide;assert z.read(p+"EVFXRebalance.aex")==b"plugin";assert z.read(p+"keep.txt")==b"keep"',output]);
    assert.equal(check.status,0,check.stderr);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('existing native installers gain an elevated launcher without losing their install script',async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx existing installer '));
  try{
    const input=join(base,'input.zip'),output=join(base,'output.zip');
    const code='import sys,zipfile;z=zipfile.ZipFile(sys.argv[1],"w");z.writestr("EVFXSmartGrainV2.aex",b"plugin");z.writestr("Install.ps1",b"$ErrorActionPreference = \'Stop\'\\n$targetFolder = Join-Path $env:ProgramFiles \'Adobe/Common/Plug-ins/7.0/MediaCore/EVFX Collection\'\\nWrite-Host $targetFolder\\n");z.writestr("Install.cmd",b"old wrapper");z.close()';
    const make=run('python',['-c',code,input]);assert.equal(make.status,0,make.stderr);
    const fix=run('python',[join(root,'scripts','prepare-windows-installer.py'),input,output,'smart-grain']);
    assert.equal(fix.status,0,fix.stderr);
    await verifyRepeatable(output,base,'smart-grain');
    const check=run('python',['-c','import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);s=z.read("Install.ps1");assert b"Write-Host $targetFolder" in s and b"$PluginDirectory" in s;w=z.read("Install.cmd");assert b"-Verb RunAs" in w and b"ExecutionPolicy Bypass" in w and b"%~dp0" in w;assert z.read("EVFXSmartGrainV2.aex")==b"plugin"',output]);
    assert.equal(check.status,0,check.stderr);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('an installer that depended on the developer registry defaults to shared MediaCore',async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx registry installer '));
  try{
    const input=join(base,'input.zip'),output=join(base,'output.zip');
    const code='import sys,zipfile;z=zipfile.ZipFile(sys.argv[1],"w");p="delivery/";z.writestr(p+"EVFX Choke It.aex",b"plugin");z.writestr(p+"install.ps1",b"param([string]$PluginDirectory=\'\')\\nif (-not $PluginDirectory) {\\n    $taskVersions=Get-ChildItem -LiteralPath \'HKLM:\\\\SOFTWARE\\\\Adobe\'\\n    if (-not $PluginDirectory) { throw \'After Effects not found\' }\\n}\\n$PluginDirectory=[IO.Path]::GetFullPath($PluginDirectory)\\n");z.writestr(p+"Install.cmd",b"old wrapper");z.close()';
    const make=run('python',['-c',code,input]);assert.equal(make.status,0,make.stderr);
    const fix=run('python',[join(root,'scripts','prepare-windows-installer.py'),input,output,'choke-it']);
    assert.equal(fix.status,0,fix.stderr);
    await verifyRepeatable(output,base,'choke-it');
    const check=run('python',['-c','import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);p="delivery/";s=z.read(p+"install.ps1");assert b"$env:ProgramFiles" in s and b"Adobe/Common/Plug-ins/7.0/MediaCore" in s and b"After Effects not found" not in s;assert b"-Verb RunAs" in z.read(p+"Install.cmd")',output]);
    assert.equal(check.status,0,check.stderr);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('repairing a package updates its installer manifest and checksums',async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx manifest installer '));
  try{
    const input=join(base,'input.zip'),output=join(base,'output.zip');
    const code=`import sys,zipfile,json,hashlib
files={'EVFX Flares.aex':b'plugin','Install EVFX Flares.cmd':b'old launcher','install.ps1':b"param([string]$PluginDirectory='')\\nif(-not $PluginDirectory) {\\n    $aeRegistry='HKLM:\\\\SOFTWARE\\\\Adobe'\\n}\\nif(-not $PluginDirectory) {throw 'After Effects installation not found.'}\\nWrite-Host $PluginDirectory\\n"}
manifest=json.dumps({'files':[{'path':n,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()} for n,b in files.items()]}).encode()
files['manifest.json']=manifest
files['SHA256SUMS.txt']=''.join(hashlib.sha256(b).hexdigest()+'  '+n+'\\n' for n,b in files.items()).encode()
with zipfile.ZipFile(sys.argv[1],'w') as z:
 for n,b in files.items():z.writestr(n,b)`;
    const make=run('python',['-c',code,input]);assert.equal(make.status,0,make.stderr);
    const fix=run('python',[join(root,'scripts','prepare-windows-installer.py'),input,output,'flares']);
    assert.equal(fix.status,0,fix.stderr);
    await verifyRepeatable(output,base,'flares');
    const check=run('python',['-c',`import sys,zipfile,json,hashlib
z=zipfile.ZipFile(sys.argv[1]);m=json.loads(z.read('manifest.json'))
for f in m['files']:
 b=z.read(f['path']);assert len(b)==f['bytes'] and hashlib.sha256(b).hexdigest()==f['sha256']
for line in z.read('SHA256SUMS.txt').decode().splitlines():
 h,n=line.split('  ',1);assert hashlib.sha256(z.read(n)).hexdigest()==h
assert b'-Verb RunAs' in z.read('Install EVFX Flares.cmd')
assert b'Adobe/Common/Plug-ins/7.0/MediaCore' in z.read('install.ps1')`,output]);
    assert.equal(check.status,0,check.stderr);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('a newer Flares installer keeps its panel options when repaired',async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx flares newer '));
  try{
    const input=join(base,'input.zip'),output=join(base,'output.zip');
    const code=`import sys,zipfile,json,hashlib
files={'EVFX Flares.aex':b'plugin','Install EVFX Flares.cmd':b'old launcher','install.ps1':b"param(\\n [string]$PluginDirectory='',\\n [string[]]$PanelVersion,\\n [switch]$PanelOnly\\n)\\nif(-not $PanelOnly) {\\n if(-not $PluginDirectory) {\\n  $aeRegistry='HKLM:Adobe'\\n }\\n if(-not $PluginDirectory) {throw 'After Effects not found'}\\n}\\n$userAeBase=[Environment]::GetFolderPath('ApplicationData')\\n"}
files['manifest.json']=json.dumps({'files':[{'path':n,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()} for n,b in files.items()]}).encode()
files['SHA256SUMS.txt']=''.join(hashlib.sha256(b).hexdigest()+'  '+n+'\\n' for n,b in files.items()).encode()
with zipfile.ZipFile(sys.argv[1],'w') as z:
 for n,b in files.items():z.writestr(n,b)`;
    const make=run('python',['-c',code,input]);assert.equal(make.status,0,make.stderr);
    const fix=run('python',[join(root,'scripts','prepare-windows-installer.py'),input,output,'flares']);
    assert.equal(fix.status,0,fix.stderr);
    await verifyRepeatable(output,base,'flares');
    const check=run('python',['-c',`import sys,zipfile
z=zipfile.ZipFile(sys.argv[1]);s=z.read('install.ps1');w=z.read('Install EVFX Flares.cmd')
assert b'$PanelVersion' in s and b'$PanelOnly' in s and b'$CallerAppData' in s
assert s.index(b'$PluginDirectory') < s.index(b'$PanelVersion') < s.index(b'$PanelOnly') < s.index(b'$CallerAppData')
assert b'Adobe/Common/Plug-ins/7.0/MediaCore' in s and b'-CallerAppData' in w`,output]);
    assert.equal(check.status,0,check.stderr);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('the Crop installer finds the installed AE version and has an elevated launcher',async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx crop installer '));
  try{
    const input=join(base,'input.zip'),output=join(base,'output.zip');
    const code=`import sys,zipfile
s="param(\\n    [string]$AfterEffectsRoot = 'C:\\\\Program Files\\\\Adobe\\\\Adobe After Effects 2026\\\\Support Files',\\n    [string]$PackageRoot,\\n    [string]$UserDataRoot,\\n    [string]$SharedPluginRoot = 'C:\\\\Program Files\\\\Adobe\\\\Common\\\\Plug-ins\\\\7.0\\\\MediaCore',\\n    [switch]$MachineWide\\n)\\n$ErrorActionPreference = 'Stop'\\n$appRoot = [IO.Path]::GetFullPath($AfterEffectsRoot)\\n"
with zipfile.ZipFile(sys.argv[1],'w') as z:
 z.writestr('EVFXCrop.aex',b'plugin');z.writestr('installer/Install.ps1',s)`;
    const make=run('python',['-c',code,input]);assert.equal(make.status,0,make.stderr);
    const fix=run('python',[join(root,'scripts','prepare-windows-installer.py'),input,output,'crop-ae']);
    assert.equal(fix.status,0,fix.stderr);
    await verifyRepeatable(output,base,'crop-ae');
    const check=run('python',['-c',`import sys,zipfile
z=zipfile.ZipFile(sys.argv[1]);s=z.read('installer/Install.ps1');w=z.read('Install.cmd')
assert b'Adobe After Effects 2026' not in s and b'HKLM:' in s and b'InstallPath' in s
assert b'$env:ProgramFiles' in s and b'MediaCore' in s
assert b'-Verb RunAs' in w and b'installer\\\\Install.ps1' in w`,output]);
    assert.equal(check.status,0,check.stderr);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('already safe packages stay byte-identical and unknown unsafe installers are rejected',async()=>{
  const base=await mkdtemp(join(tmpdir(),'evfx safe package '));
  try{
    const input=join(base,'input.zip'),output=join(base,'output.zip');
    const make=(safe)=>run('python',['-c',`import sys,zipfile
with zipfile.ZipFile(sys.argv[1],'w') as z:
 z.writestr('Example.aex',b'plugin')
 z.writestr('Install.ps1',b'$target = Join-Path $env:ProgramFiles "Adobe/Common/Plug-ins/7.0/MediaCore"')
 z.writestr('Install.cmd',sys.argv[2])`,input,safe?'%~dp0 ExecutionPolicy Bypass -Verb RunAs':'%~dp0 ExecutionPolicy Bypass']);
    assert.equal(make(true).status,0);
    let result=run('python',[join(root,'scripts','prepare-windows-installer.py'),input,output,'new-tool']);
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(await readFile(output),await readFile(input));
    assert.equal(make(false).status,0);
    result=run('python',[join(root,'scripts','prepare-windows-installer.py'),input,output,'new-tool']);
    assert.notEqual(result.status,0);
  }finally{await rm(base,{recursive:true,force:true});}
});
