@echo off
setlocal enabledelayedexpansion
title Deep Dish - Refresh Existing Restaurants
cd /d "%~dp0"
color 0B
mode con: cols=104 lines=48

echo.
echo  ========================================================================
echo    DEEP DISH - REFRESH EXISTING RESTAURANTS
echo  ========================================================================
echo.
echo   PURPOSE: Re-read restaurants already in Deep Dish when their information
 echo   is stale, incomplete, due for review, or had a prior fetch failure.
echo.
echo   This does NOT add new restaurants.
echo   Failure cooldowns prevent the same broken/blocked sites from occupying
 echo   every batch. The batch is also spread across markets before filling.
echo.
echo  ------------------------------------------------------------------------
echo.
pause

where node >nul 2>&1
if errorlevel 1 goto nonode
if not exist "node_modules\" (
  call npm install --no-audit --no-fund
  if errorlevel 1 goto failed
)
if not exist "scripts\pipeline\refresh-run.mjs" goto missing

echo  [1/5] Building the refresh queue and selecting eligible records...
call node scripts\pipeline\refresh-run.mjs --batch=30 --per-city=4
if errorlevel 1 goto failed
echo.

echo  [2/5] Rebuilding all derived intelligence layers...
call node scripts\pipeline\finalize.mjs
if errorlevel 1 goto failed
echo.

echo  [3/5] Refresh report...
call node scripts\pipeline\refresh.mjs --print=20
if errorlevel 1 goto failed
echo.

echo  [4/5] Corpus count...
for /f "tokens=*" %%c in ('node scripts\pipeline\corpus-count.mjs') do set TOTAL=%%c
echo        !TOTAL! restaurants remain in the corpus.
echo.

echo  [5/5] Complete.
echo        Selection report: reports\refresh-plan-latest.json
echo.
echo   Save refreshed data to GitHub?  Y = commit + push, N = local only
echo.
set /p SAVE="   Type Y or N then press Enter: "
if /i not "!SAVE!"=="Y" goto finish
git add src/data reports public
git commit -m "data: refresh Deep Dish restaurant intelligence"
if errorlevel 1 (
  echo   Nothing new to commit.
  goto finish
)
git push
if errorlevel 1 (
  echo   Commit is safe locally, but GitHub push failed.
) else (
  echo   Saved and pushed.
)
goto finish

:nonode
echo.
echo   ^>^> STOPPED. Node.js is not installed.
goto finish
:missing
echo.
echo   ^>^> STOPPED. The new refresh pipeline files are not installed.
goto finish
:failed
echo.
echo   ^>^> STOPPED. A refresh step failed. Nothing was automatically committed.
:finish
echo.
pause
endlocal
