@echo off
rem Lance sureau.ps1 sans modifier la politique d'exécution de la machine.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sureau.ps1" %*
exit /b %errorlevel%
