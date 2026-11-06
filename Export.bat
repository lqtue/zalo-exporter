@echo off
chcp 65001 >nul
title Zalo Exporter
cd /d "%~dp0"
"tools\node.exe" "pc-backfill\export.js" %*
echo.
pause
