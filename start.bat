@echo off
echo Starting MayDiv Backend Server...
echo.

echo Checking if Node.js is installed...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js version:
node --version

echo.
echo Installing dependencies...
npm install

echo.
echo Starting server...
echo Server will be available at: http://localhost:3001
echo Database file: data/maydiv.db
echo.
echo Press Ctrl+C to stop the server
echo.

node server.js

pause 