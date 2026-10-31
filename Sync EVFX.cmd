@echo off
setlocal
cd /d "%~dp0"
node scripts\publish.mjs
if errorlevel 1 (
  echo.
  echo EVFX sync stopped. Read the error above before retrying.
  pause
  exit /b 1
)
echo.
echo EVFX releases are published. GitHub Pages is updating.
pause
