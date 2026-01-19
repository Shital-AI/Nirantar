@echo off
REM RTMP Livestream Desktop App - Windows Startup Script
REM This script sets up and runs the application

cd /d "%~dp0"

echo ================================================================
echo        Nirantar Live Desktop Manager
echo        Standalone Offline Streaming Application
echo ================================================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.9 or higher.
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo [OK] Python version: %PYTHON_VERSION%

REM Check FFmpeg
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo [WARNING] FFmpeg not found in PATH. You can set the path in Settings.
) else (
    echo [OK] FFmpeg found
)

echo.

REM Check if virtual environment exists
if exist "venv" (
    echo [OK] Virtual environment found
    call venv\Scripts\activate.bat
) else (
    echo Creating virtual environment...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo [OK] Virtual environment created
)

REM Install/Update dependencies
echo Checking dependencies...
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo [OK] Dependencies installed

echo.
echo Starting application...
echo ----------------------------------------------------------------
echo.

REM Run the application
python main.py

pause
