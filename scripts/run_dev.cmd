@echo off
rem Run Chronos Terra from source with the locally-installed Electron.
rem Requires: npm install
setlocal
set ROOT=%~dp0..
set ELEC=%ROOT%\node_modules\.bin\electron.cmd
if not exist "%ELEC%" (
  echo Run "npm install" first - electron not found.
  exit /b 1
)
"%ELEC%" --enable-logging "%ROOT%"