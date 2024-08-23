@echo off
setlocal

:: Set version
set VERSION=2.2.2

:: Get the current directory name
for %%I in ("%CD%") do set "DIRNAME=%%~nI"

:: Create the zip file excluding certain files
7z a -tzip -mx=9 -xr!.git ..\%DIRNAME%-%VERSION%.xpi .

endlocal
