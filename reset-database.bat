@echo off
cd /d "%~dp0\backend"
echo [INFO] Resetting CineRate database...
call venv\Scripts\activate
python reset_db.py
pause
