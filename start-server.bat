@echo off
cd /d "%~dp0\backend"
echo Starting CineRate server...
call venv\Scripts\activate
python run.py
pause
