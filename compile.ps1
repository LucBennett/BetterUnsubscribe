# Set to stop on any error
$ErrorActionPreference = "Stop"

# Check if jq is available
if (Get-Command jq -ErrorAction SilentlyContinue) {
    Write-Host "jq is installed."
    if (Test-Path "manifest.json") {
        # Set version using jq
        $VERSION = jq -r '.version' manifest.json
    } else {
        Write-Host "Error: manifest.json not found."
        exit 1
    }
} else {
    Write-Host "jq is not installed, falling back to regex-based version extraction."
    # Set version using Select-String and regex to parse manifest.json
    if (Test-Path "manifest.json") {
        $VERSION = Select-String -Path "manifest.json" -Pattern '"version"' | ForEach-Object {
            $_ -replace '.*"version"\s*:\s*"(.*?)".*', '$1'
        }

        if (-not $VERSION) {
            Write-Host "Error: Unable to extract version from manifest.json."
            exit 1
        }
    } else {
        Write-Host "Error: manifest.json not found."
        exit 1
    }
}

# Create build directory if it doesn't exist
$buildDir = "build"
if (-not (Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir
    Write-Host "Created build directory: $buildDir"
}

# Define variables
$baseName = (Get-Item .).BaseName
$destination = "./$buildDir/$baseName-$VERSION.xpi"

# Create an array of files to exclude
$excludePatterns = @(".*", "$buildDir/*", "*.sh", "*.ps1", "*.md")

# Get all the files and directories recursively, excluding the specified patterns
$filesToCompress = Get-ChildItem -Recurse | Where-Object {
    $exclude = $false
    foreach ($pattern in $excludePatterns) {
        if ($_ -like $pattern) {
            $exclude = $true
            break
        }
    }
    return -not $exclude
}

# Handle case where no files are found to compress
if ($filesToCompress.Count -eq 0) {
    Write-Host "Error: No files found to compress after applying exclusion patterns."
    exit 1
}

# Create the archive
Compress-Archive -Path $filesToCompress.FullName -DestinationPath $destination -Force
Write-Host "Archive created: $destination"
