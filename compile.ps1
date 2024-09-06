# Set to stop on any error
$ErrorActionPreference = "Stop"

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
$buildDir = "./build"
if (-not (Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir
    Write-Host "Created build directory: $buildDir"
}

# Define variables
$baseName = (Get-Item .).BaseName
$fileName = "$baseName-$VERSION"
$zipFileName = "$fileName.zip"
$xpiFileName = "$fileName.xpi"
$zipFilePath = "$buildDir/$zipFileName"
$xpiFilePath = "$buildDir/$xpiFileName"

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

# Create the archive as a .zip file
if ($filesToCompress.Count -eq 0) {
    Write-Host "Error: No files found to compress after applying exclusion patterns."
    exit 1
}

Compress-Archive -Path $filesToCompress.FullName -DestinationPath $zipFilePath -Force
Write-Host "Archive created as .zip: $zipFilePath"

# Check if the .xpi file already exists
if (Test-Path $xpiFilePath) {
    # Ask the user if they want to overwrite the existing file
    $response = Read-Host "The file $xpiFilePath already exists. Do you want to replace it? (y/n)"
    if ($response.ToLower() -ne "y") {
        Write-Host "Skipping the renaming. Exiting script."
        exit 0
    }
    Write-Host "Overwriting the existing file..."
    # Remove the existing .xpi file
    Remove-Item -Path $xpiFilePath -Force
}

# Rename the .zip file to .xpi by specifying only the new file name
Rename-Item -Path $zipFilePath -NewName $xpiFileName
Write-Host "Archive renamed to: $xpiFilePath"
