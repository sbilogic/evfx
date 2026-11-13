"""Add a safe Windows installer to a simple native AE package."""
import re
import hashlib
import json
import shutil
import sys
import zipfile
from pathlib import Path, PurePosixPath

source, destination, product = sys.argv[1:4]
if not re.fullmatch(r"[a-z0-9-]+", product):
    raise ValueError("Invalid product identifier")

launcher = r'''@echo off
setlocal
set "EVFX_INSTALL_SCRIPT=%~dp0Install.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $p=Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File ' + [char]34 + $env:EVFX_INSTALL_SCRIPT + [char]34); exit $p.ExitCode } catch { Write-Host ('Unable to start the installer as administrator: ' + $_.Exception.Message); exit 1 }"
set "EVFX_INSTALL_RESULT=%ERRORLEVEL%"
if not "%EVFX_INSTALL_RESULT%"=="0" echo Installation did not complete.
pause
exit /b %EVFX_INSTALL_RESULT%
'''.replace("\n", "\r\n").encode("utf-8")

with zipfile.ZipFile(source) as original:
    files = [item for item in original.infolist() if not item.is_dir()]
    natives = [item for item in files if item.filename.lower().endswith(".aex")]
    if not natives:
        shutil.copyfile(source, destination)
        sys.exit(0)
    if len(natives) != 1:
        raise ValueError("A simple installer requires exactly one native plugin")
    native = PurePosixPath(natives[0].filename)
    if native.is_absolute() or ".." in native.parts or "'" in native.name or any(c in native.name for c in "\r\n"):
        raise ValueError("Unsafe native plugin path")
    parent = "" if str(native.parent) == "." else str(native.parent) + "/"
    repaired = {"rebalance", "smart-grain", "smart-denoise", "choke-it", "flares", "crop-ae"}
    if product not in repaired:
        scripts = [item for item in files if item.filename.lower() == (parent + "install.ps1").lower()]
        wrappers = [item for item in files if item.filename.lower() in {(parent + "install.cmd").lower(), (parent + "install.bat").lower()}]
        if scripts or wrappers:
            if len(scripts) != 1 or not wrappers:
                raise ValueError("Native package has an incomplete installer")
            script = original.read(scripts[0]).decode("utf-8-sig", errors="replace")
            wrapper = original.read(wrappers[0]).decode("utf-8-sig", errors="replace")
            if (re.search(r"MediaCore[\\/]+Testing", script, re.I) or
                    not re.search(r"%~dp0", wrapper, re.I) or
                    not re.search(r"ExecutionPolicy\s+Bypass", wrapper, re.I) or
                    not re.search(r"-Verb\s+RunAs|ShellExecute[^\n]*runas", wrapper, re.I)):
                raise ValueError("Native package installer needs an elevation or path repair")
            shutil.copyfile(source, destination)
            sys.exit(0)
    installer = (r'''param([string]$PluginDirectory)
$ErrorActionPreference = 'Stop'
function Get-FileDigest([string]$Path) {
    $hash = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try { [BitConverter]::ToString($hash.ComputeHash($stream)) }
    finally { $stream.Dispose(); $hash.Dispose() }
}
try {
    if (Get-Process -Name AfterFX,aerender -ErrorAction SilentlyContinue) {
        throw 'Close After Effects and aerender before installing.'
    }
    $source = Join-Path $PSScriptRoot '__PLUGIN__'
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw 'The plugin is missing. Extract the complete ZIP first.'
    }
    if (-not $PluginDirectory) {
        $PluginDirectory = Join-Path $env:ProgramFiles 'Adobe\Common\Plug-ins\7.0\MediaCore\EVFX Collection'
    }
    $target = Join-Path $PluginDirectory '__PLUGIN__'
    if (Test-Path -LiteralPath $target -PathType Leaf) {
        $backup = Join-Path $env:LOCALAPPDATA 'EVFX\Backups\__PRODUCT__'
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        $backupFile = Join-Path $backup ((Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [Guid]::NewGuid().ToString('N') + '.aex.bak')
        Copy-Item -LiteralPath $target -Destination $backupFile
    }
    New-Item -ItemType Directory -Path $PluginDirectory -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Force
    if ((Get-FileDigest $source) -ne (Get-FileDigest $target)) {
        throw 'Installed file verification failed.'
    }
    Write-Host "Installed: $target"
    Write-Host 'Restart After Effects. Keep only one installed copy of this plugin.'
    exit 0
} catch {
    Write-Host ("Installation stopped: " + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
'''.replace("__PLUGIN__", native.name).replace("__PRODUCT__", product).replace("\n", "\r\n")).encode("utf-8")
    additions = {parent + "Install.cmd": launcher, parent + "Install.ps1": installer}
    existing = {item.filename.lower() for item in files}
    if product == "crop-ae":
        script_name = parent + "installer/Install.ps1"
        if script_name not in original.namelist():
            raise ValueError("Expected Crop installer is missing")
        text = original.read(script_name).decode("utf-8-sig").replace("\r\n", "\n")
        old_ae = "[string]$AfterEffectsRoot = 'C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files'"
        old_shared = "[string]$SharedPluginRoot = 'C:\\Program Files\\Adobe\\Common\\Plug-ins\\7.0\\MediaCore'"
        if old_ae not in text or old_shared not in text or "$appRoot = [IO.Path]::GetFullPath($AfterEffectsRoot)" not in text:
            raise ValueError("Crop installer has changed; preserve it for review")
        text = text.replace(old_ae, "[string]$AfterEffectsRoot = ''", 1)
        text = text.replace(old_shared, "[string]$SharedPluginRoot = (Join-Path $env:ProgramFiles 'Adobe/Common/Plug-ins/7.0/MediaCore')", 1)
        text = text.replace("[string]$UserDataRoot,", "[string]$UserDataRoot,\n    [string]$CallerAppData,\n    [string]$CallerLocalAppData,", 1)
        text = text.replace("$UserDataRoot = Join-Path $env:APPDATA", "$UserDataRoot = Join-Path $(if ($CallerAppData) { $CallerAppData } else { $env:APPDATA })", 1)
        text = text.replace("Join-Path $env:LOCALAPPDATA 'EVFX Crop\\Install Backups'", "Join-Path $(if ($CallerLocalAppData) { $CallerLocalAppData } else { $env:LOCALAPPDATA }) 'EVFX Crop\\Install Backups'", 1)
        discovery = r'''if (-not $AfterEffectsRoot) {
    $candidates = @()
    $versions = Get-ChildItem -LiteralPath 'HKLM:\SOFTWARE\Adobe\After Effects' -ErrorAction SilentlyContinue |
        Where-Object { $_.PSChildName -match '^\d+\.\d+$' } |
        Sort-Object { [version]$_.PSChildName } -Descending
    foreach ($version in $versions) {
        $entry = Get-ItemProperty -LiteralPath $version.PSPath -ErrorAction SilentlyContinue
        if ($entry.InstallPath) { $candidates += $entry.InstallPath }
    }
    $adobeRoot = Join-Path $env:ProgramFiles 'Adobe'
    $candidates += @(Get-ChildItem -LiteralPath $adobeRoot -Directory -Filter 'Adobe After Effects*' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'Support Files' })
    $AfterEffectsRoot = $candidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'AfterFX.exe') -PathType Leaf } | Select-Object -First 1
    if (-not $AfterEffectsRoot) { throw 'After Effects was not found. Install it first, or pass -AfterEffectsRoot.' }
}
'''
        text = text.replace("$appRoot = [IO.Path]::GetFullPath($AfterEffectsRoot)", discovery + "$appRoot = [IO.Path]::GetFullPath($AfterEffectsRoot)", 1)
        crop_launcher = launcher.replace(b"%~dp0Install.ps1", b"%~dp0installer\\Install.ps1")
        crop_launcher = crop_launcher.replace(
            b"+ $env:EVFX_INSTALL_SCRIPT + [char]34);",
            b"+ $env:EVFX_INSTALL_SCRIPT + [char]34 + ' -CallerAppData ' + [char]34 + $env:APPDATA + [char]34 + ' -CallerLocalAppData ' + [char]34 + $env:LOCALAPPDATA + [char]34);",
        )
        additions = {parent + "Install.cmd": crop_launcher, script_name: text.replace("\n", "\r\n").encode("utf-8")}
        readme_name = parent + "README.md"
        if readme_name in original.namelist():
            readme = original.read(readme_name).decode("utf-8-sig").replace("\r\n", "\n")
            readme = readme.replace("Run `installer/Install.ps1` with After Effects closed.", "Close After Effects, double-click `Install.cmd`, and approve the administrator prompt.")
            readme = readme.replace("Protected folders can require an elevated PowerShell on other machines.", "")
            additions[readme_name] = readme.encode("utf-8")
    if product == "flares":
        script = next((item for item in files if item.filename.lower() == (parent + "install.ps1").lower()), None)
        wrapper = next((item for item in files if item.filename.lower() == (parent + "Install EVFX Flares.cmd").lower()), None)
        if not script or not wrapper:
            raise ValueError("Expected Flares installer is missing")
        text = original.read(script).decode("utf-8-sig").replace("\r\n", "\n")
        marker = text.find("$aeRegistry=")
        start = text.rfind("if(-not $PluginDirectory) {", 0, marker)
        stop = text.find("if(-not $PluginDirectory) {throw", marker)
        end = text.find("\n", stop)
        if marker < 0 or start < 0 or stop < 0 or end < 0:
            raise ValueError("Flares installer has changed; preserve it for review")
        text = text[:start] + ("if(-not $PluginDirectory) {\n"
                               "    $PluginDirectory=Join-Path $env:ProgramFiles 'Adobe/Common/Plug-ins/7.0/MediaCore/EVFX Flares'\n"
                               "}\n") + text[end+1:]
        old_param = "param([string]$PluginDirectory='')"
        if old_param in text:
            text = text.replace(old_param, "param([string]$PluginDirectory='', [string]$CallerAppData='')", 1)
        elif re.match(r"\s*param\s*\(\s*\n", text, re.I) and "$CallerAppData" not in text:
            text = re.sub(r"(\bparam\s*\(\s*\n)", r"\1    [string]$CallerAppData='',\n", text, count=1, flags=re.I)
        elif "$CallerAppData" not in text:
            raise ValueError("Flares installer parameters changed; preserve them for review")
        text = text.replace("[Environment]::GetFolderPath('ApplicationData')",
                            "$(if ($CallerAppData) { $CallerAppData } else { [Environment]::GetFolderPath('ApplicationData') })")
        flares_launcher = launcher.replace(
            b"+ $env:EVFX_INSTALL_SCRIPT + [char]34);",
            b"+ $env:EVFX_INSTALL_SCRIPT + [char]34 + ' -CallerAppData ' + [char]34 + $env:APPDATA + [char]34);",
        )
        additions = {wrapper.filename: flares_launcher, script.filename: text.replace("\n", "\r\n").encode("utf-8")}
        manifest_name, checksums_name = parent + "manifest.json", parent + "SHA256SUMS.txt"
        if manifest_name not in original.namelist() or checksums_name not in original.namelist():
            raise ValueError("Flares package integrity files are missing")
        manifest = json.loads(original.read(manifest_name).decode("utf-8-sig"))
        for name, data in additions.items():
            relative = name[len(parent):]
            entries = [item for item in manifest["files"] if item.get("path") == relative]
            if len(entries) != 1:
                raise ValueError("Flares installer manifest is ambiguous")
            entries[0].update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
        additions[manifest_name] = (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
        hashes = original.read(checksums_name).decode("utf-8-sig").splitlines()
        for name, data in additions.items():
            relative = name[len(parent):]
            matches = [i for i, line in enumerate(hashes) if line.endswith("  " + relative)]
            if len(matches) != 1:
                raise ValueError("Flares checksum list is ambiguous")
            hashes[matches[0]] = hashlib.sha256(data).hexdigest() + "  " + relative
        additions[checksums_name] = ("\n".join(hashes) + "\n").encode("utf-8")
    if product == "choke-it":
        script = next((item for item in files if item.filename.lower() == (parent + "install.ps1").lower()), None)
        if not script:
            raise ValueError("Expected installation script is missing")
        text = original.read(script).decode("utf-8-sig").replace("\r\n", "\n")
        start = text.find("if (-not $PluginDirectory) {")
        end = text.find("$PluginDirectory=[IO.Path]::GetFullPath($PluginDirectory)", start)
        if start < 0 or end < 0:
            raise ValueError("Choke It installer has changed; preserve it for review")
        text = text[:start] + ("if (-not $PluginDirectory) {\n"
                               "    $PluginDirectory=Join-Path $env:ProgramFiles 'Adobe/Common/Plug-ins/7.0/MediaCore/EVFX Choke It'\n"
                               "}\n") + text[end:]
        old_param = "param([string]$PluginDirectory='')"
        if old_param not in text:
            raise ValueError("Choke It installer parameters changed; preserve them for review")
        text = text.replace(old_param, "param([string]$PluginDirectory='', [string]$BackupRoot='')", 1)
        old_backup = "$taskBackupRoot=[IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'EVFX\\Choke It\\Backups'))"
        new_backup = ("if (-not $BackupRoot) { $BackupRoot=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'EVFX\\Choke It\\Backups' }\n"
                      "$taskBackupRoot=[IO.Path]::GetFullPath($BackupRoot)")
        text = text.replace(old_backup, new_backup, 1)
        choke_launcher = launcher.replace(
            b"+ $env:EVFX_INSTALL_SCRIPT + [char]34);",
            b"+ $env:EVFX_INSTALL_SCRIPT + [char]34 + ' -BackupRoot ' + [char]34 + (Join-Path $env:LOCALAPPDATA 'EVFX\\Choke It\\Backups') + [char]34);",
        )
        additions = {parent + "Install.cmd": choke_launcher, script.filename: text.replace("\n", "\r\n").encode("utf-8")}
    if product in {"smart-grain", "smart-denoise"}:
        script = next((item for item in files if item.filename.lower() == (parent + "Install.ps1").lower()), None)
        if not script:
            raise ValueError("Expected installation script is missing")
        text = original.read(script).decode("utf-8-sig").replace("\r\n", "\n")
        default = "$targetFolder = Join-Path $env:ProgramFiles 'Adobe/Common/Plug-ins/7.0/MediaCore/EVFX Collection'"
        if default not in text or not text.startswith("$ErrorActionPreference"):
            raise ValueError("Installation script has changed; preserve it for review")
        text = "param([string]$PluginDirectory)\n" + text.replace(
            default,
            "$targetFolder = if ($PluginDirectory) { $PluginDirectory } else { Join-Path $env:ProgramFiles 'Adobe/Common/Plug-ins/7.0/MediaCore/EVFX Collection' }",
            1,
        )
        additions[parent + "Install.ps1"] = text.replace("\n", "\r\n").encode("utf-8")
    guide = parent + "START HERE.txt"
    if product == "rebalance" and guide.lower() in existing:
        guide_item = next(item for item in files if item.filename.lower() == guide.lower())
        text = original.read(guide_item).decode("utf-8-sig").replace("\r\n", "\n")
        old = ("Save your project and close AE. Run Install.ps1, or copy EVFXRebalance.aex\n"
               "to your AE Plug-ins folder. Restart AE. This machine uses the existing\n"
               "writable MediaCore Testing/EVFX development folder. Do not import the AEX\n"
               "as footage. Install only one version of the effect.")
        new = ("Save your project and close AE. Double-click Install.cmd and approve the\n"
               "Windows administrator prompt. The installer creates the standard shared\n"
               "Adobe MediaCore folder if needed. Restart AE. Do not import the AEX as\n"
               "footage. Install only one version of the effect.")
        if old not in text:
            raise ValueError("Rebalance install guide has changed; preserve it for review")
        additions[guide_item.filename] = text.replace(old, new, 1).replace("\n", "\r\n").encode("utf-8")
    if product not in repaired and any(name.lower() in existing for name in additions):
        raise ValueError("Existing installer needs a product-specific repair")
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as output:
        for item in files:
            name = PurePosixPath(item.filename.replace("\\", "/"))
            if name.is_absolute() or ".." in name.parts:
                raise ValueError("Unsafe package path")
            if product in repaired and item.filename.lower() in {name.lower() for name in additions}:
                continue
            with original.open(item) as src, output.open(item, "w") as dst:
                shutil.copyfileobj(src, dst, length=1024 * 1024)
        for name, data in additions.items():
            info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            output.writestr(info, data)
