@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if exist "%~dp0.tools\hugo.exe" (
  set "HUGO=%~dp0.tools\hugo.exe"
) else if exist "%~dp0..\.tools\hugo\hugo.exe" (
  set "HUGO=%~dp0..\.tools\hugo\hugo.exe"
) else (
  where hugo >nul 2>nul
  if errorlevel 1 (
    echo.
    echo 没有找到 Hugo。任选一种方式安装后重试：
    echo   1. winget install Hugo.Hugo.Extended
    echo   2. 下载 hugo_extended_windows-amd64.zip，解压后把 hugo.exe 放到本项目的 .tools\ 目录
    echo.
    pause
    exit /b 1
  )
  set "HUGO=hugo"
)

echo 正在启动本地预览：http://localhost:1313/
echo 按 Ctrl+C 停止。
"%HUGO%" server -D --port 1313
endlocal
