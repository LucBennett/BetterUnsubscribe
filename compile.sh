#!/bin/sh
set -eu

# Define the default archiver
ARCHIVER=""

# Parse the command-line arguments for -useZip or -use7z
while [ $# -gt 0 ]; do
    case "$1" in
        -useZip)
            ARCHIVER="zip"
            ;;
        -use7z)
            ARCHIVER="7z"
            ;;
        *)
            echo "Error: Unknown option $1"
            echo "Usage: $0 [-useZip | -use7z]"
            exit 1
            ;;
    esac
    shift
done

# Check if an archiver option was provided
if [ -z "$ARCHIVER" ]; then
    if command -v zip >/dev/null 2>&1; then
        echo "zip is installed."
        ARCHIVER="zip"
    elif command -v 7z >/dev/null 2>&1; then
        echo "7z is installed."
        ARCHIVER="7z"
    else
        echo "No archiver found. Please install zip or 7z."
        exit 1
    fi
fi

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

# Check which archiver to use based on the flag
if [ "$ARCHIVER" = "zip" ]; then
    echo "Using zip to create the archive."

    # Check if zip is installed
    if ! command -v zip >/dev/null 2>&1; then
        echo "Error: zip is not installed."
        exit 1
    fi

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

elif [ "$ARCHIVER" = "7z" ]; then
    echo "Using 7z to create the archive."

    # Check if 7z is installed
    if ! command -v 7z >/dev/null 2>&1; then
        echo "Error: 7z is not installed."
        exit 1
    fi

    # Create the archive with 7z
    7z a -tzip -mx=9 "$OUTPUT_FILE" $FILES
fi

echo "Archive created successfully at $OUTPUT_FILE"