@echo off
REM ===========================================
REM  Lead Scraper - One-Click Start (Windows)
REM  Double-click this file to launch.
REM ===========================================

cd /d "%~dp0"
echo.
echo ========================================
echo   Lead Scraper - Setting up...
echo ========================================
echo.

REM Check for Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Python 3 is required but not installed.
    echo Install it from https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

REM Create virtual environment if needed
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate
call venv\Scripts\activate.bat

REM Install dependencies if needed
if not exist "venv\.deps_installed" (
    echo Installing dependencies (first time only)...
    pip install -q -r requirements.txt
    playwright install chromium
    echo. > venv\.deps_installed
    echo.
)

echo ========================================
echo   Starting Lead Scraper UI...
echo   http://localhost:5500
echo ========================================
echo.

python app.py
pause
