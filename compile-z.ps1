# Parse command-line arguments
param(
    [switch]$use7z,
    [switch]$useZip
)

# Set to stop on any error
$ErrorActionPreference = "Stop"

$manifestFile = "./src/manifest.json"

# Ensure at least one of the options is provided or detect available archiver
if (-not ($use7z -or $useZip)) {
    if (Get-Command zip -ErrorAction SilentlyContinue) {
        Write-Host "zip is installed."
        $useZip = $true
    }
    elseif (Get-Command 7z -ErrorAction SilentlyContinue) {
        Write-Host "7z is installed."
        $use7z = $true
    }
    else {
        Write-Host "No archiver found. Please install zip or 7z."
        Exit 1
    }
}

$currentDir = Get-Location

# Check if manifest.json exists and determine version
if (Test-Path "$manifestFile") {
    if (Get-Command jq -ErrorAction SilentlyContinue) {
        Write-Host "jq is installed."
        $VERSION = & jq -r '.version' "$manifestFile"
    }
    else {
        Write-Host "jq is not installed. Using regex to extract version."
        $versionMatch = Select-String -Path "$manifestFile" -Pattern '"version"\s*:\s*"([^"]+)"'
        if ($versionMatch) {
            $VERSION = $versionMatch.Matches[0].Groups[1].Value
        }
        else {
            Write-Host "Error: Could not extract version from $manifestFile."
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
$fileName = "BetterUnsubscribe-$VERSION"
$xpiFileName = "$fileName.xpi"
$xpiFilePath = Join-Path -Path $buildDir -ChildPath $xpiFileName

# List of files and directories to add, relative to ./src
$files = @(
    "manifest.json",
    "_locales",
    "icons",
    "background.js",
    "popup.html",
    "popup.js",
    "i18n.js",
    "styles.css"
)

# Check for the requested archiver
if ($useZip) {
    if (Get-Command zip -ErrorAction SilentlyContinue) {
        Write-Host "Using zip to create the archive."

        # Temporarily change directory to src
        Push-Location -Path "./src"

        try {
            # Create the archive, adding each file and directory without the "src" prefix
            foreach ($item in $files) {
                if (Test-Path $item -PathType Container) {
                    # If it's a directory, add it recursively
                    & zip -r -9 "$xpiFilePath" $item
                }
                elseif (Test-Path $item -PathType Leaf) {
                    # If it's a file, add it without the directory path
                    & zip -j -9 "$xpiFilePath" $item
                }
            }
        }
        finally {
            # Return to the original directory
            Pop-Location
        }

        if ($LASTEXITCODE -ne 0) {
            Write-Host "Error: Failed to create the archive using zip."
            Exit 1
        }
    }
    else {
        Write-Host "Error: zip is not installed."
        Exit 1
    }
}
elseif ($use7z) {
    if (Get-Command 7z -ErrorAction SilentlyContinue) {
        Write-Host "Using 7z to create the archive."

        # Temporarily change directory to src
        Push-Location -Path "./src"

        try {
            # Create the archive using 7z with relative paths
            & 7z a -tzip -mx=9 $xpiFilePath @($files)
        }
        finally {
            # Return to the original directory
            Pop-Location
        }

        if ($LASTEXITCODE -ne 0) {
            Write-Host "Error: Failed to create the archive using 7z."
            Exit 1
        }
    }
    else {
        Write-Host "Error: 7z is not installed."
        Exit 1
    }
}
else {
    Write-Host "No archiver found. Please install zip or 7z."
    Exit 1
}

Write-Host "Archive created successfully at $xpiFilePath"
