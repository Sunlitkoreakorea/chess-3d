@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   3D Chess - local server on http://localhost:8766/
echo   Close this window to stop.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8766/"
python -m http.server 8766
