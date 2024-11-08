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

MANIFEST_FILE="./src/manifest.json"

# Check for jq and use it if available to set the version
if command -v jq >/dev/null 2>&1; then
    echo "jq is installed."
    if [ -f "$MANIFEST_FILE" ]; then
        VERSION=$(jq -r '.version' "$MANIFEST_FILE")
    else
        echo "Error: manifest.json not found."
        exit 1
    fi
else
    echo "jq is not installed."
    # Fall back to grep and awk to parse manifest.json
    if [ -f "$MANIFEST_FILE" ]; then
        VERSION=$(grep -m 1 '"version"' "$MANIFEST_FILE" | awk -F'"' '{print $4}')
        if [ -z "$VERSION" ]; then
            echo "Error: Could not extract version from $MANIFEST_FILE"
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

cd "./src/"

# Define the list of files and directories to include, relative to ./src
FILES="manifest.json _locales icons background.js popup.html popup.js i18n.js styles.css"

# Define the archive output path using the build directory variable
OUTPUT_FILE="../$BUILD_DIR/BetterUnsubscribe-$VERSION.xpi"

# Check which archiver to use based on the flag
if [ "$ARCHIVER" = "zip" ]; then
    echo "Using zip to create the archive."

    # Check if zip is installed
    if ! command -v zip >/dev/null 2>&1; then
        echo "Error: zip is not installed."
        exit 1
    fi

    # Change to the src directory to keep paths relative
    zip -r -9 "$OUTPUT_FILE" $FILES

elif [ "$ARCHIVER" = "7z" ]; then
    echo "Using 7z to create the archive."

    # Check if 7z is installed
    if ! command -v 7z >/dev/null 2>&1; then
        echo "Error: 7z is not installed."
        exit 1
    fi

    7z a -tzip -mx=9 "$OUTPUT_FILE" $FILES
fi

echo "Archive created successfully at $OUTPUT_FILE"
