@echo off
setlocal
cd /d "%~dp0"
echo ===================================================
echo        Starting Offline Exam Maker Local Server
echo ===================================================
echo.
echo    ExamForge Local - 100%% Offline Exam Paper Maker
echo    Server: http://127.0.0.1:5000
echo.
echo    Press Ctrl+C to stop the server.
echo ===================================================
echo.
start "" "http://127.0.0.1:5000"
python app.py
pause
