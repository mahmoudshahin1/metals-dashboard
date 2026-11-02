@echo off
chcp 65001 > nul
title رفع المشروع إلى GitHub - Metals Dashboard
echo ========================================================
echo        رفع داشبورد قسم المعادن إلى GitHub
echo ========================================================
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0push_to_github.ps1"
echo.
echo اضغط أي مفتاح للإغلاق...
pause > nul

