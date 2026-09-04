@echo off
setlocal enabledelayedexpansion
title Deep Dish - Curated Target Intake
cd /d "%~dp0"
color 0F
mode con: cols=104 lines=48

echo.
echo  ========================================================================
echo    DEEP DISH - CURATED TARGET INTAKE
echo  ========================================================================
echo.
echo   PURPOSE: Process restaurant names you intentionally placed in
 echo   scripts\data\seed-targets.json.
echo.
echo   This is NOT geographic discovery and NOT refresh.
echo   It verifies the official site, inserts only genuinely new restaurants,
echo   and enriches ONLY the records inserted by this run.
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
if not exist "scripts\data\seed-targets.json" goto missing

echo  [1/5] Counting current restaurants...
for /f "tokens=*" %%c in ('node scripts\pipeline\corpus-count.mjs') do set BEFORE=%%c
echo        !BEFORE! restaurants before this run.
echo.

echo  [2/5] Resolving curated names against their official websites...
call node scripts\pipeline\resolve-targets.mjs --concurrency=4
if errorlevel 1 goto failed
echo.

echo  [3/5] Inserting verified targets and enriching ONLY newly inserted records...
call node scripts\pipeline\seed-and-enrich.mjs
if errorlevel 1 goto failed
echo.

echo  [4/5] Rebuilding all derived intelligence layers...
call node scripts\pipeline\finalize.mjs
if errorlevel 1 goto failed
echo.

echo  [5/5] Counting results...
for /f "tokens=*" %%c in ('node scripts\pipeline\corpus-count.mjs') do set AFTER=%%c
echo.
echo  ========================================================================
echo    CURATED INTAKE COMPLETE
echo  ========================================================================
echo    Before: !BEFORE!
echo    After:  !AFTER!
echo  ========================================================================
echo.
echo   Save these results to GitHub?  Y = commit + push, N = local only
echo.
set /p SAVE="   Type Y or N then press Enter: "
if /i not "!SAVE!"=="Y" goto finish
git add src/data scripts/data/seed-targets.json reports public
git commit -m "data: resolve curated Deep Dish targets"
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
echo   ^>^> STOPPED. scripts\data\seed-targets.json is missing.
goto finish
:failed
echo.
echo   ^>^> STOPPED. A pipeline step failed. Nothing was automatically committed.
:finish
echo.
pause
endlocal
