@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   Generation des cles JWT (RS256 / ES256)
echo ============================================
echo.

REM --- Verifie qu'openssl est disponible ---
where openssl >nul 2>nul
if errorlevel 1 (
    echo [ERREUR] "openssl" est introuvable dans le PATH.
    echo Installez Git for Windows ^(https://git-scm.com/download/win^)
    echo ou OpenSSL ^(https://slproweb.com/products/Win32OpenSSL.html^)
    echo puis relancez ce script.
    pause
    exit /b 1
)

REM --- Choix de l'algorithme ---
echo Quel algorithme voulez-vous utiliser ?
echo   1. ES256  (recommande : cles/tokens plus courts, plus rapide)
echo   2. RS256  (RSA, plus repandu / compatibilite maximale)
echo.
set /p CHOIX="Votre choix (1 ou 2) : "

if "%CHOIX%"=="1" (
    set ALGO=ES256
) else if "%CHOIX%"=="2" (
    set ALGO=RS256
) else (
    echo Choix invalide.
    pause
    exit /b 1
)

REM --- Prefixe des fichiers ---
set /p PREFIXE="Prefixe des fichiers de cle (defaut: jwt_access) : "
if "%PREFIXE%"=="" set PREFIXE=jwt_access

REM --- Dossier de sortie ---
set DOSSIER=keys
if not exist "%DOSSIER%" mkdir "%DOSSIER%"

set PRIVEE=%DOSSIER%\%PREFIXE%_private.pem
set PUBLIQUE=%DOSSIER%\%PREFIXE%_public.pem

REM --- Verifie l'ecrasement eventuel ---
if exist "%PRIVEE%" (
    echo.
    echo [ATTENTION] %PRIVEE% existe deja.
    set /p CONFIRME="Ecraser les cles existantes ? (o/n) : "
    if /i not "!CONFIRME!"=="o" (
        echo Annule.
        pause
        exit /b 0
    )
)

echo.
echo Generation en cours (%ALGO%)...
echo.

if "%ALGO%"=="ES256" (
    openssl ecparam -genkey -name prime256v1 -noout -out "%PRIVEE%"
    if errorlevel 1 goto :erreur
    openssl ec -in "%PRIVEE%" -pubout -out "%PUBLIQUE%"
    if errorlevel 1 goto :erreur
) else (
    openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "%PRIVEE%"
    if errorlevel 1 goto :erreur
    openssl rsa -pubout -in "%PRIVEE%" -out "%PUBLIQUE%"
    if errorlevel 1 goto :erreur
)

echo.
echo ============================================
echo   Cles generees avec succes !
echo ============================================
echo   Cle privee  : %PRIVEE%
echo   Cle publique: %PUBLIQUE%
echo.
echo Ajoutez ceci a votre fichier .env :
echo.
echo JWT_ACCESS_ALGORITHM="%ALGO%"
echo JWT_ACCESS_PRIVATE_KEY_PATH="./%PRIVEE:\=/%"
echo JWT_ACCESS_PUBLIC_KEY_PATH="./%PUBLIQUE:\=/%"
echo.
echo [IMPORTANT] N'ajoutez JAMAIS %PRIVEE% a git.
echo Ajoutez cette ligne a votre .gitignore :
echo   %DOSSIER%/%PREFIXE%_private.pem
echo.
pause
exit /b 0

:erreur
echo.
echo [ERREUR] La generation des cles a echoue.
pause
exit /b 1