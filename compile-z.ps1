# Set to stop on any error
$ErrorActionPreference = "Stop"

$currentDir = Get-Location

if (Test-Path "manifest.json") {
    if (Get-Command jq -ErrorAction SilentlyContinue) {
        Write-Host "jq is installed."
        $VERSION = jq -r '.version' manifest.json
    } else {
        Write-Host "jq is not installed."
        $VERSION = Select-String -Path "manifest.json" -Pattern '"version"' | ForEach-Object {
            $_ -replace '.*"version"\s*:\s*"(.*?)".*', '$1'
        }
    }
} else {
    Write-Host "Error: manifest.json not found."
    exit 1
}

# Create build directory if it doesn't exist
$buildDir = Join-Path -Path $currentDir -ChildPath "build"
if (-not (Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir
    Write-Host "Created build directory: $buildDir"
}

# Define variables
$baseName = (Get-Item .).BaseName
$fileName = "$baseName-$VERSION"
$xpiFileName = "$fileName.xpi"
$xpiFilePath = Join-Path -Path "$buildDir" -ChildPath $xpiFileName

# Create the xpi file excluding certain files
if (Get-Command zip -ErrorAction SilentlyContinue) {
    Write-Host "zip is installed."
    & zip -r -9 -x '.*' -x "$buildDir/*" -x '*.sh' -x '*.ps1' -x '*.md' "$xpiFilePath" .
} elseif (Get-Command 7z -ErrorAction SilentlyContinue) {
    Write-Host "7z is installed."
    & 7z a -tzip -mx=9 "-xr!.*" "-xr!$buildDir" "-xr!*.sh" "-xr!*.ps1" "-xr!*.md" "$xpiFilePath" .
} else {
    Write-Host "No archiver found. Please install zip or 7z."
    exit 1
}

Write-Host "Archive created successfully at $xpiFilePath"