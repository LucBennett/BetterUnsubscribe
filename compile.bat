@echo off
setlocal

:: Set version
for /f "tokens=*" %%i in ('powershell -Command "(Get-Content manifest.json | ConvertFrom-Json).version"') do (
    set VERSION=%%i
)

:: Get the current directory name
for %%I in ("%CD%") do set "DIRNAME=%%~nI"

::Create build directory
mkdir build

:: Create the xpi file excluding certain files
7z a -tzip -mx=9 -xr!.git -xr!build ".\build\%DIRNAME%-%VERSION%.xpi" .

endlocal
