@echo off
setlocal

:: Set version
set VERSION=2.2.3

:: Get the current directory name
for %%I in ("%CD%") do set "DIRNAME=%%~nI"

::Create build directory
mkdir build

:: Create the xpi file excluding certain files
7z a -tzip -mx=9 -xr!.git -xr!build ".\build\%DIRNAME%-%VERSION%.xpi" .

endlocal
