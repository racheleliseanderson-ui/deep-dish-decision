@echo off
setlocal enabledelayedexpansion
title Deep Dish - Expand to New Restaurants
cd /d "%~dp0"
color 0A
mode con: cols=104 lines=48

echo.
echo  ========================================================================
echo    DEEP DISH - EXPAND TO NEW RESTAURANTS
echo  ========================================================================
echo.
echo   PURPOSE: Add genuinely NEW restaurants in under-covered markets.
echo.
echo   This is not a refresh job. It uses the expansion queue to pick cities,
echo   searches for new candidates, verifies every candidate against the
echo   restaurant's own website, then enriches ONLY newly-added records.
echo.
echo   NO GOOGLE KEY IS REQUIRED. OpenStreetMap is the default discovery source.
echo   Google Places remains optional if you explicitly run discover.mjs with
echo   --provider=google and have a GOOGLE_MAPS_API_KEY configured.
echo.
echo   Existing restaurants are deduplicated and skipped.
echo   Failed candidates enter a cooldown ledger so the next run moves on.
echo.
echo  ------------------------------------------------------------------------
echo.
pause

REM ---------------------------------------------------------------- setup
echo  [1/7] Checking Node and project files...
where node >nul 2>&1
if errorlevel 1 goto nonode
if not exist "node_modules\" (
  call npm install --no-audit --no-fund
  if errorlevel 1 goto failed
)
if not exist "scripts\pipeline\discover.mjs" goto missing
echo        Ready. No API key required.
echo.

REM ---------------------------------------------------------------- queue
echo  [2/7] Rebuilding the geographic expansion queue from the current corpus...
call node scripts\pipeline\build-queue.mjs
if errorlevel 1 goto failed
echo.

REM ---------------------------------------------------------------- count
echo  [3/7] Counting the corpus before expansion...
for /f "tokens=*" %%c in ('node scripts\pipeline\corpus-count.mjs') do set BEFORE=%%c
echo        !BEFORE! restaurants before this run.
echo.

REM ---------------------------------------------------------------- discover
echo  [4/7] Discovering new restaurants in the next under-covered markets...
echo        Default: up to 3 cities, up to 20 verified additions per city.
echo        OpenStreetMap surfaces candidates; the restaurant's own site is proof.
echo.
call node scripts\pipeline\discover.mjs --cities=3 --limit=20
if errorlevel 1 goto failed
echo.

REM ---------------------------------------------------------------- insert + new-only enrich
echo  [5/7] Adding verified discoveries and enriching ONLY the new records...
call node scripts\pipeline\seed-and-enrich.mjs
if errorlevel 1 goto failed
echo.

REM ---------------------------------------------------------------- rebuild derived
echo  [6/7] Leveling case files and rebuilding search, live data, atlas, and coverage...
call node scripts\pipeline\finalize.mjs
if errorlevel 1 goto failed
echo.

REM ---------------------------------------------------------------- finish
echo  [7/7] Counting the corpus after expansion...
for /f "tokens=*" %%c in ('node scripts\pipeline\corpus-count.mjs') do set AFTER=%%c
echo.
echo  ========================================================================
echo    EXPANSION COMPLETE
echo  ========================================================================
echo    Before: !BEFORE!
echo    After:  !AFTER!
echo.
echo    Discovery report: reports\discovery-latest.json
echo    Retry ledger:      src\data\discovery-ledger.json
echo    Geo cache:         src\data\discovery-geo-cache.json
echo  ========================================================================
echo.

echo   Save these results to GitHub?  Y = commit + push, N = local only
echo.
set /p SAVE="   Type Y or N then press Enter: "
if /i not "!SAVE!"=="Y" goto finish
git add src/data reports public scripts/data
git commit -m "data: expand Deep Dish restaurant coverage"
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
echo   ^>^> STOPPED. Node.js is not installed. Install the current LTS from nodejs.org.
goto finish

:missing
echo.
echo   ^>^> STOPPED. The new pipeline files are not installed in this checkout.
echo      Running from: %CD%
goto finish

:failed
echo.
echo   ^>^> STOPPED. A pipeline step failed. No automatic GitHub commit was made.
echo      Read the error immediately above; your pre-run data snapshot is preserved.

:finish
echo.
pause
endlocal
