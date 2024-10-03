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
        VERSION=$(grep -m 1 '"version"' manifest.json | awk -F'"' '{print $4}')
        if [ -z "$VERSION" ]; then
            echo "Error: Could not extract version from manifest.json."
            exit 1
        fi
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

# Create the list of files as a space-separated string
FILES="./manifest.json ./_locales ./icons ./src/background.js ./src/popup.html ./src/popup.js ./src/i18n.js ./src/styles.css"

# Create the xpi file, excluding certain files
if command -v zip >/dev/null 2>&1; then
    echo "zip is installed."

    # Loop through each item in the FILES list
    for item in $FILES; do
        if [ -d "$item" ]; then
            # If it's a directory, add it recursively, including the path
            zip -r -9 "$OUTPUT_FILE" "$item"
        elif [ -f "$item" ]; then
            # If it's a file, add it without the directory path
            zip -j -9 "$OUTPUT_FILE" "$item"
        fi
    done
elif command -v 7z >/dev/null 2>&1; then
    echo "7z is installed."
    7z a -tzip -mx=9 "$OUTPUT_FILE" $FILES
else
    echo "No archiver found. Please install zip or 7z."
    exit 1
fi

echo "Archive created successfully at $OUTPUT_FILE"
