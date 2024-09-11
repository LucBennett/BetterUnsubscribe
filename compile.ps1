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
$zipFileName = "$fileName.zip"
$xpiFileName = "$fileName.xpi"
$zipFilePath = Join-Path -Path "$buildDir" -ChildPath $zipFileName
$xpiFilePath = Join-Path -Path "$buildDir" -ChildPath $xpiFileName

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipFilePath, [System.IO.Compression.ZipArchiveMode]::Create)

$files = Get-ChildItem -Recurse -Exclude *.md, .*, *.sh, *.ps1, build |
        Where-Object { $_.FullName -notlike "$buildDir\*" } |
        Where-Object { $_.FullName -notlike "$currentDir\.*\*" }

# Iterate through each file and add it to the ZIP
foreach ($file in $files) {

    # Calculate the relative path inside the ZIP archive
    $relativePath = (Resolve-Path -Path $file.FullName -Relative) -replace '^\.\\', ''
    $relativePath = $relativePath -replace '\\', '/'
    Write-Host "$relativePath"

    if ($file.PSIsContainer) {
        # Write-Host "$($file.FullName) is a directory."
        # Create an entry in the ZIP archive
        $entry = $zip.CreateEntry("$relativePath/")
    } else {
        # Write-Host "$($file.FullName) is a file."
        # Create an entry in the ZIP archive
        $entry = $zip.CreateEntry($relativePath)

        $entry.LastWriteTime = $file.LastWriteTimeUtc
        $entry.ExternalAttributes = $file.Attributes

        # Open a stream to write the file's contents to the ZIP entry
        $fileStream = [System.IO.File]::OpenRead($file)
        $entryStream = $entry.Open()
        $fileStream.CopyTo($entryStream)

        # Close the streams
        $fileStream.Close()
        $entryStream.Close()
    }
}

# release zip file
$zip.Dispose()

# Output the location of the zip file
Write-Host "Directory compressed into: $zipFilePath"

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
