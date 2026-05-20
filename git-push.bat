@echo off
cd /d "%~dp0"
title Internal-Tax-Dashboard Push

echo ==========================================
echo Current git status
echo ==========================================
echo.
git status --short
echo.

set /p COMMIT_MSG=Enter commit message: 

if "%COMMIT_MSG%"=="" (
  echo.
  echo Commit message cannot be empty.
  pause
  exit /b 1
)

echo.
echo ==========================================
echo Adding files...
echo ==========================================
git add .

echo.
echo ==========================================
echo Committing changes...
echo ==========================================
git commit -m "%COMMIT_MSG%"

echo.
echo ==========================================
echo Pushing to GitHub...
echo ==========================================
git push

echo.
echo ==========================================
echo Push finished.
echo ==========================================
pause
