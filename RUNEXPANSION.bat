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
echo   searches for new restaurant candidates, verifies every candidate against
echo   the restaurant's own website, then enriches ONLY the newly-added records.
echo.
echo   Existing restaurants are deduplicated and skipped.
echo   Failed candidates enter a cooldown ledger so the next run moves on.
echo.
echo  ------------------------------------------------------------------------
echo.
pause

REM ---------------------------------------------------------------- setup
echo  [1/7] Checking Node, project files, and API key...
where node >nul 2>&1
if errorlevel 1 goto nonode
if not exist "node_modules\" (
  call npm install --no-audit --no-fund
  if errorlevel 1 goto failed
)
if not exist "scripts\pipeline\discover.mjs" goto missing
REM Existing repository convention is .env.local.pipeline. Read the key into
REM this process without printing it. .env.local is also accepted.
if exist ".env.local.pipeline" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.local.pipeline") do (
    if /i "%%A"=="GOOGLE_MAPS_API_KEY" set "GOOGLE_MAPS_API_KEY=%%B"
  )
)
if not defined GOOGLE_MAPS_API_KEY if exist ".env.local" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env.local") do (
    if /i "%%A"=="GOOGLE_MAPS_API_KEY" set "GOOGLE_MAPS_API_KEY=%%B"
  )
)
if not defined GOOGLE_MAPS_API_KEY (
  echo.
  echo   ^>^> STOPPED. GOOGLE_MAPS_API_KEY is not configured.
  echo      Copy .env.example to .env.local.pipeline and add the key there:
  echo      GOOGLE_MAPS_API_KEY=your_key_here
  echo.
  pause
  exit /b 1
)
echo        Ready.
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
echo        Google is candidate discovery only; the restaurant's own site is proof.
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
echo  [6/7] Rebuilding search, live intelligence, atlas, coverage, and sitemaps...
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
echo  ========================================================================
echo.
goto save

:save
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
goto finish

:failed
echo.
echo   ^>^> STOPPED. A pipeline step failed. No automatic GitHub commit was made.
echo      Read the error immediately above; your pre-run data snapshot is preserved.

:finish
echo.
pause
endlocal
