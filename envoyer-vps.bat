@echo off
rem Envoie MMS sur le VPS OVH et l'installe (ou le met a jour). Double-cliquer.
rem Le mot de passe du VPS est demande dans cette fenetre (2 ou 3 fois) : il n'est enregistre nulle part.
setlocal
cd /d "%~dp0"
title MMS - envoi sur le VPS
set VPS_IP=15.235.103.226
set VPS_USER=ubuntu
set VPS_DOMAIN=npdcmedia.com
set VPS=%VPS_USER%@%VPS_IP%

where ssh >NUL 2>&1 || (echo OpenSSH est absent de Windows. Parametres ^> Applications ^> Fonctionnalites facultatives ^> Client OpenSSH. & pause & exit /b 1)

echo [1/3] Preparation de l'archive...
set ARCHIVE=%TEMP%\mms.tgz
if exist "%ARCHIVE%" del "%ARCHIVE%"
tar -czf "%ARCHIVE%" --exclude=./node_modules --exclude=./dist --exclude=./.git --exclude=./data/sessions.json --exclude=./data/images.json --exclude=./data/feedback.jsonl --exclude=./tsconfig.tsbuildinfo .
if errorlevel 1 (echo Echec de la creation de l'archive. & pause & exit /b 1)

echo.
echo [2/3] Envoi vers %VPS% (mot de passe du VPS demande ; a la premiere connexion, tapez yes)
scp "%ARCHIVE%" deploy\install-vps.sh %VPS%:/tmp/
if errorlevel 1 (echo Envoi impossible : verifiez l'adresse et le mot de passe. & pause & exit /b 1)

echo.
echo [3/3] Installation sur le serveur (mot de passe demande encore une ou deux fois, 3 a 6 minutes)
ssh -t %VPS% "sed -i 's/\r$//' /tmp/install-vps.sh && sudo MMS_DOMAIN=%VPS_DOMAIN% bash /tmp/install-vps.sh /tmp/mms.tgz"
if errorlevel 1 (echo L'installation a echoue : copiez le texte ci-dessus et envoyez-le a Claude. & pause & exit /b 1)

echo.
echo Termine. Ouvrez https://%VPS_DOMAIN% (ou http://%VPS_IP% si HTTPS n'a pas pu etre active).
start "" https://%VPS_DOMAIN%
pause
