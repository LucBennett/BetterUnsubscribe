# Set to stop on any error
$ErrorActionPreference = "Stop"

$currentDir = Get-Location

# Check if manifest.json exists and determine version
if (Test-Path "manifest.json") {
    if (Get-Command jq -ErrorAction SilentlyContinue) {
        Write-Host "jq is installed."
        $VERSION = & jq -r '.version' "manifest.json"
    }
    else {
        Write-Host "jq is not installed. Using regex to extract version."
        $versionMatch = Select-String -Path "manifest.json" -Pattern '"version"\s*:\s*"([^"]+)"'
        if ($versionMatch) {
            $VERSION = $versionMatch.Matches[0].Groups[1].Value
        }
        else {
            Write-Host "Error: Could not extract version from manifest.json."
            Exit 1
        }
    }
    Write-Host "Version: $VERSION"
}
else {
    Write-Host "Error: manifest.json not found."
    Exit 1
}

# Create build directory if it doesn't exist
$buildDir = Join-Path -Path $currentDir -ChildPath "build"
if (-not (Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir | Out-Null  # Avoid unnecessary output
    Write-Host "Created build directory: $buildDir"
}

# Define variables
$baseName = (Get-Item .).BaseName
$fileName = "$baseName-$VERSION"
$xpiFileName = "$fileName.xpi"
$xpiFilePath = Join-Path -Path $buildDir -ChildPath $xpiFileName

# List of files and directories to add
$files = @(
    "./manifest.json",
    "./_locales",
    "./icons",
    "./src/background.js",
    "./src/popup.html",
    "./src/popup.js",
    "./src/i18n.js",
    "./src/styles.css"
)

# Create the archive by adding files with their relative structure
if (Get-Command zip -ErrorAction SilentlyContinue) {
    Write-Host "zip is installed."

    # Loop through each item in the files list
    foreach ($item in $files) {
        if (Test-Path $item -PathType Container) {
            # If it's a directory, add it recursively, including the path
            & zip -r -9 $xpiFilePath $item
        }
        elseif (Test-Path $item -PathType Leaf) {
            # If it's a file, add it without the directory path
            & zip -j -9 $xpiFilePath $item
        }
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Failed to create the archive using zip."
        Exit 1
    }
}
elseif (Get-Command 7z -ErrorAction SilentlyContinue) {
    Write-Host "7z is installed."

    & 7z a -tzip -mx=9 $xpiFilePath @files

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Failed to create the archive using 7z."
        Exit 1
    }
}
else {
    Write-Host "No archiver found. Please install zip or 7z."
    Exit 1
}

Write-Host "Archive created successfully at $xpiFilePath"