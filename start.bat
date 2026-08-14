@echo off
rem Minecraft-style 3D sandbox launcher. Double-click to start.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
