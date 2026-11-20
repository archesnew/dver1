@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===================================================
echo   Запуск интернет-магазина «Двери №1»
echo ===================================================
echo Проект: %CD%
echo Порт: 3000
echo.
echo Открытие сайта в браузере...
start http://localhost:3000/
echo.
echo Сервер запущен. Чтобы остановить, закройте это окно (или нажмите Ctrl+C).
where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
  node server.js
) else (
  py -m http.server 3000
)
pause
