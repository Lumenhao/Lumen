@echo off
setlocal
cd /d "%~dp0"

echo.
echo   Lumen - launcher
echo   ---------------

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo   Python 3.11+ was not found.
  echo   Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH".
  pause
  exit /b 1
)

%PY% -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" >nul 2>nul
if errorlevel 1 (
  echo   Python 3.11 or newer is required, found:
  %PY% -V
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo   Creating .venv ...
  %PY% -m venv .venv || goto :fail
)

echo   Checking dependencies ...
".venv\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check -r "app\requirements.txt" || goto :fail

".venv\Scripts\python.exe" -c "from app.config import settings; print(settings.port)" > "%TEMP%\lumen-port.txt"
set /p PORT=<"%TEMP%\lumen-port.txt"
del "%TEMP%\lumen-port.txt" >nul 2>nul
if not defined PORT set "PORT=8080"

echo   Opening http://127.0.0.1:%PORT%
start "" /b powershell -NoProfile -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:%PORT%'"

".venv\Scripts\python.exe" -m app.main
exit /b 0

:fail
echo.
echo   Setup failed - see the messages above.
pause
exit /b 1
