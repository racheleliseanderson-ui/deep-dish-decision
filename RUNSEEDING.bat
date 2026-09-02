@echo off
setlocal enabledelayedexpansion
title Deep Dish - Find Restaurants
cd /d "%~dp0"
color 0F
mode con: cols=100 lines=45

echo.
echo  ================================================================
echo    DEEP DISH - FIND RESTAURANTS
echo  ================================================================
echo.
echo   This takes the restaurant names listed in
echo   scripts\data\seed-targets.json, finds each restaurant's own
echo   website, checks the site really belongs to that restaurant,
echo   and reads the address and phone straight off it.
echo.
echo   Anything it cannot prove is DROPPED, never guessed.
echo.
echo   Roughly a minute per 8 restaurants. You do not have to watch.
echo   You can stop any time by closing this window - nothing breaks.
echo.
echo   Leave your laptop plugged in, awake, and on the internet.
echo.
echo  ----------------------------------------------------------------
echo.
pause
echo.

REM ---------------------------------------------------------------- step 1
echo  [1/6] Checking your computer has what it needs...
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   ^>^> STOPPED. Node.js is not installed on this computer.
  echo.
  echo      Go to    https://nodejs.org
  echo      Click the big green "LTS" button, install it,
  echo      then RESTART this file.
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODEV=%%v
echo        Node.js !NODEV! - good.
if exist ".git\index.lock" (
  del /f /q ".git\index.lock" >nul 2>&1
  echo        Cleared a leftover Git lock file.
)
if not exist "scripts\data\seed-targets.json" (
  echo.
  echo   ^>^> STOPPED. scripts\data\seed-targets.json is missing.
  echo      That file is the list of restaurants to look for.
  echo.
  pause
  exit /b 1
)
echo.

REM ---------------------------------------------------------------- step 2
echo  [2/6] Installing the tools the project needs...
echo        (first time only - this can take a few minutes)
if not exist "node_modules\" (
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   ^>^> STOPPED. The install failed - usually no internet.
    echo.
    pause
    exit /b 1
  )
) else (
  echo        Already installed - skipping.
)
echo.

REM ---------------------------------------------------------------- step 3
echo  [3/6] Counting what you have now...
for /f "tokens=*" %%c in ('node scripts\pipeline\corpus-count.mjs') do set BEFORE=%%c
echo        !BEFORE! restaurants in the corpus before this run.
echo.

REM ---------------------------------------------------------------- step 4
echo  [4/6] Finding and checking the websites. THIS IS THE LONG PART.
echo.
echo        Every restaurant it proves prints a + line.
echo        Silence just means it is still checking one.
echo.
echo  ----------------------------------------------------------------
set RI_PLAYWRIGHT=0
call node scripts\pipeline\resolve-targets.mjs --concurrency=4
if errorlevel 1 (
  echo.
  echo   ^>^> The lookup stopped early. Nothing was saved.
  echo      Send the messages above to Claude.
  echo.
  pause
  exit /b 1
)
echo  ----------------------------------------------------------------
echo.

REM ---------------------------------------------------------------- step 5
echo  [5/6] Adding what it proved, then reading each new site in full...
call node scripts\pipeline\seed-listings.mjs
echo.
call node scripts\pipeline\enrich.mjs --hygiene --batch=25
echo.
call node scripts\corpus-invariants.mjs
if errorlevel 1 (
  echo.
  echo   ^>^> WARNING: the corpus check did not pass.
  echo      Nothing has been saved to GitHub. Tell Claude.
  echo.
  pause
  exit /b 1
)
echo.

REM ---------------------------------------------------------------- step 6
echo  [6/6] Counting what you have now...
for /f "tokens=*" %%c in ('node scripts\pipeline\corpus-count.mjs') do set AFTER=%%c
echo.
echo  ================================================================
echo    DONE.
echo  ================================================================
echo.
echo    Before:  !BEFORE! restaurants
echo    After:   !AFTER! restaurants
echo.
echo    Everything it could not prove is listed, with the reason, in
echo    the newest file in the reports folder.
echo.
echo  ================================================================
echo.

echo   Do you want to SAVE these results to GitHub?
echo.
echo     Y = yes, save and upload
echo     N = no, leave everything on this computer only
echo.
set /p SAVE="   Type Y or N then press Enter: "
if /i not "!SAVE!"=="Y" goto finish
echo.
echo   Saving...
git add src/data scripts/data/seed-targets.json reports
git commit -m "data: resolve and seed verified restaurant targets"
if errorlevel 1 (
  echo   Nothing new to save.
  goto finish
)
git push
if errorlevel 1 (
  echo.
  echo   Saved on this computer, but the upload to GitHub failed.
  echo   That is usually a sign-in issue. Your work is safe here.
  echo   Tell Claude "the push failed" and it can sort it out.
) else (
  echo   Saved and uploaded. GitHub will now rebuild the site data
  echo   and sync the database.
)

:finish
echo.
pause
endlocal
