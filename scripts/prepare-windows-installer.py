"""Add a safe Windows installer to a simple native AE package."""
import re
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
    if len(natives) != 1:
        raise ValueError("A simple installer requires exactly one native plugin")
    native = PurePosixPath(natives[0].filename)
    if native.is_absolute() or ".." in native.parts or "'" in native.name or any(c in native.name for c in "\r\n"):
        raise ValueError("Unsafe native plugin path")
    parent = "" if str(native.parent) == "." else str(native.parent) + "/"
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
        additions = {parent + "Install.cmd": launcher, script.filename: text.replace("\n", "\r\n").encode("utf-8")}
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
    repaired = {"rebalance", "smart-grain", "smart-denoise", "choke-it"}
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
