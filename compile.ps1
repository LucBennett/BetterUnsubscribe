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
    Write-Host "jq is not installed."
    # Set version using Select-String and regex to parse manifest.json
    if (Test-Path "manifest.json") {
        $VERSION = Select-String -Path "manifest.json" -Pattern '"version"' | ForEach-Object {
            $_ -replace '.*"version"\s*:\s*"(.*)".*', '$1'
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
}

# Create the xpi file excluding certain files
if (Get-Command zip -ErrorAction SilentlyContinue) {
    Write-Host "zip is installed."
    & zip -r -9 -x '*.git*' -x 'build/*' "./build/$((Get-Item .).BaseName)-$VERSION.xpi" .
} elseif (Get-Command 7z -ErrorAction SilentlyContinue) {
    Write-Host "7z is installed."
    & 7z a -tzip -mx=9 "-xr!.git" "-xr!build" "./build/$((Get-Item .).BaseName)-$VERSION.xpi" .
} else {
    Write-Host "No archiver found. Please install zip or 7z."
    exit 1
}
