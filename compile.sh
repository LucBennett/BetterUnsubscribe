#!/bin/sh
set -eu

# Define the build directory variable
BUILD_DIR="build"

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
        VERSION=$(grep -m 1 '"version"' manifest.json | awk -F'"' '/"version"/ {print $4}')
    else
        echo "Error: manifest.json not found."
        exit 1
    fi
fi

# Check if version is successfully extracted
if [ -z "$VERSION" ]; then
    echo "Error: Version could not be determined."
    exit 1
fi

# Create build directory if it doesn't exist
mkdir -p "$BUILD_DIR"

# Define the archive output path using the build directory variable
OUTPUT_FILE="./$BUILD_DIR/$(basename "$PWD")-$VERSION.xpi"

# Create the xpi file, excluding certain files
if command -v zip >/dev/null 2>&1; then
    echo "zip is installed."
    zip -r -9 -x '.*' -x "$BUILD_DIR/*" -x '*.sh' -x '*.ps1' -x '*.md' "$OUTPUT_FILE" .
elif command -v 7z >/dev/null 2>&1; then
    echo "7z is installed."
    7z a -tzip -mx=9 -xr'!.*' -xr"!$BUILD_DIR" -xr'!*.sh' -xr'!*.ps1' -xr'!*.md' "$OUTPUT_FILE" .
else
    echo "No archiver found. Please install zip or 7z."
    exit 1
fi

echo "Archive created successfully at $OUTPUT_FILE"
