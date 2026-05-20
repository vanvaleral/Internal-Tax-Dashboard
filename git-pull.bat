@echo off
cd /d "%~dp0"
title Internal-Tax-Dashboard Pull

echo ==========================================
echo Pulling latest changes from GitHub...
echo ==========================================
echo.

git pull

echo.
echo ==========================================
echo Pull finished.
echo ==========================================
pause
