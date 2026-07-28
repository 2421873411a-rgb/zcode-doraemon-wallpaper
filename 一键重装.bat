@echo off
chcp 65001 >nul
title ZCode 哆啦A梦四时壁纸 · 一键重装
cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║  ZCode 哆啦A梦四时壁纸 · 一键重装工具    ║
echo  ╚══════════════════════════════════════════╝
echo.
echo  即将执行：解包 app.asar → 注入壁纸机制 → 重新打包 → 备份并替换
echo  全程约 1-3 分钟，请勿关闭此窗口。
echo.

REM 检查 node
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js（https://nodejs.org）。
  pause
  exit /b 1
)

node apply.js
set RC=%errorlevel%

echo.
if "%RC%"=="0" (
  echo 完成！按任意键关闭窗口。
) else (
  echo 执行出错（退出码 %RC%）。按任意键关闭。
)
pause >nul
