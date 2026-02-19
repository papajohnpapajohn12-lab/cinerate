@echo off
cd /d "%~dp0"
echo Starting frontend server on http://localhost:3000...
python -m http.server 3000
pause
