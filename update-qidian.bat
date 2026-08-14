@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ================================================
echo   Qidian Bookshelf Updater
echo   0. Merge exported recommendations (qidian-recommend.json)
echo   1. Fetch bookshelf data (auto-login, no browser needed)
echo   2. Commit: YYYYMMDD_qidian_push_N
echo   3. Push to Git (triggers Cloudflare auto deploy)
echo ================================================
echo.
where pnpm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] pnpm not found. Install Node.js and pnpm first.
    pause
    exit /b 1
)
echo Browser will open only if login expired...
echo.
call pnpm update-qidian
echo.
echo ================================================
echo   Finished. Check the output above.
echo ================================================
pause