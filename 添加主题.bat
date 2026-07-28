@echo off
chcp 65001 >nul
title ZCode 壁纸 · 添加新主题
cd /d "%~dp0"
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║  ZCode 壁纸 · 添加新主题（不用重打包）  ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  按提示操作，加完重启 ZCode 即可看到新主题。
echo.
node add-theme.js
echo.
pause
