@echo off
chcp 65001 >nul
title ZCode 壁纸系统 · 状态自检
cd /d "%~dp0"
echo.
echo  正在检查当前壁纸系统状态...
echo.
node status.js
echo.
pause
