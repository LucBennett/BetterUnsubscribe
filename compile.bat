@echo off
setlocal

:: Set version
set VERSION=2.2.1

:: Get the current directory name
for %%I in ("%CD%") do set "DIRNAME=%%~nI"

:: Create the zip file excluding certain files
7z a -tzip -mx=9 ..\%DIRNAME%-%VERSION%.xpi .

endlocal