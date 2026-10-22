@echo off
cd /d "%~dp0"
title MMS
if not exist .env copy .env.example .env >NUL
if not exist node_modules\nodemailer (
  echo Installation des dependances, une seule fois...
  call npm install
  if errorlevel 1 (echo Echec de npm install. Node.js est-il installe ? & pause & exit /b 1)
)
start "" cmd /c "timeout /t 6 >NUL & start http://localhost:5174"
echo MMS demarre. Laissez cette fenetre ouverte (Ctrl+C pour arreter).
call npm run dev
pause
