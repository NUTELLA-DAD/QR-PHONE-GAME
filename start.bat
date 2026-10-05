@echo off
cd /d "%~dp0"
echo Installing (first run only, needs internet)...
if not exist node_modules call npm install
echo.
echo Starting the game server. Leave this window open.
start "" http://localhost:3000/host.html
node server.js
pause
