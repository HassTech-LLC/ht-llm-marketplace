@echo off
title Lumina LLM Marketplace Launcher
echo ===================================================
echo   Lumina Local LLM Marketplace Launcher
echo ===================================================
echo.

:: Check if Node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found on your system PATH!
    echo Please install Node.js (v18+) to run Lumina.
    pause
    exit /b 1
)

:: Verify Ollama is running
tasklist /fi "imagename eq ollama.exe" | find /i "ollama.exe" >nul
if %errorlevel% neq 0 (
    echo [WARNING] Ollama process is NOT currently running!
    echo Lumina runs on top of Ollama. Please open/start Ollama
    echo so you can download and run models at peak performance.
    echo.
) else (
    echo [OK] Ollama is active and running!
)

echo [1/3] Resolving Backend dependencies...
cd lumina-backend
if not exist node_modules (
    echo node_modules missing, running npm install...
    call npm install
)
cd ..

echo [2/3] Resolving Frontend dependencies...
cd lumina-frontend
if not exist node_modules (
    echo node_modules missing, running npm install...
    call npm install
)
cd ..

echo [3/3] Launching servers...
echo.
echo Starting Lumina Backend (Port 3001)...
start "Lumina Backend" cmd /c "cd lumina-backend && npm run dev"

echo Starting Lumina Frontend (Port 3009)...
start "Lumina Frontend" cmd /c "cd lumina-frontend && npm run dev"

echo.
echo ===================================================
echo   Lumina launched successfully!
echo   Open your browser to: http://localhost:3009
echo ===================================================
echo.
timeout /t 3 >nul
start http://localhost:3009
