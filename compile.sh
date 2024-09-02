#!/bin/sh
set -e

# Check for jq and use it if available to set the version
if command -v jq >/dev/null 2>&1; then
    echo "jq is installed."
    if [ -f "manifest.json" ]; then
        VERSION=$(jq -r '.version' manifest.json)
    else
        echo "Error: manifest.json not found."
        exit 1
    fi
else
    echo "jq is not installed."
    # Fall back to grep and awk to parse manifest.json
    if [ -f "manifest.json" ]; then
        VERSION=$(grep '"version"' manifest.json | awk -F'"' '{print $4}')
    else
        echo "Error: manifest.json not found."
        exit 1
    fi
fi

# Create build directory
mkdir -p build

# Create the xpi file, excluding certain files
if command -v zip >/dev/null 2>&1; then
    echo "zip is installed."
    zip -r -9 -x '.*' -x 'build/*' -x '*.sh' -x '*.ps1' -x '*.md' "./build/$(basename "$PWD")-$VERSION.xpi" .
elif command -v 7z >/dev/null 2>&1; then
    echo "7z is installed."
    7z a -tzip -mx=9 -xr'!.*' -xr'!build' -xr'!*.sh' -xr'!*.ps1' -xr'!*.md' "./build/$(basename "$PWD")-$VERSION.xpi" .
else
    echo "No archiver found. Please install zip or 7z."
    exit 1
fi
