# Set to stop on any error
$ErrorActionPreference = "Stop"

$currentDir = Get-Location

# Check if manifest.json exists and determine version
if (Test-Path "manifest.json")
{
    if (Get-Command jq -ErrorAction SilentlyContinue)
    {
        Write-Host "jq is installed."
        $VERSION = & jq -r '.version' "manifest.json"
    }
    else
    {
        Write-Host "jq is not installed."
        $VERSION = Select-String -Path "manifest.json" -Pattern '"version"' | ForEach-Object {
            $_.Matches[0].Groups[1].Value
        }
    }
}
else
{
    Write-Host "Error: manifest.json not found."
    Exit 1
}

# Create build directory if it doesn't exist
$buildDir = Join-Path -Path $currentDir -ChildPath "build"
if (-not (Test-Path $buildDir))
{
    New-Item -ItemType Directory -Path $buildDir | Out-Null
    Write-Host "Created build directory: $buildDir"
}

# Define variables
$baseName = (Get-Item .).BaseName
$fileName = "$baseName-$VERSION"
$zipFileName = "$fileName.zip"
$xpiFileName = "$fileName.xpi"
$zipFilePath = Join-Path -Path "$buildDir" -ChildPath $zipFileName
$xpiFilePath = Join-Path -Path "$buildDir" -ChildPath $xpiFileName

# Add required .NET assemblies for compression
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Create the ZIP archive
$zip = [System.IO.Compression.ZipFile]::Open($zipFilePath, [System.IO.Compression.ZipArchiveMode]::Create)

# List of files to include in the ZIP
$files = @(
    "./manifest.json",
    "./_locales",
    "./icons",
    "./background.js",
    "./popup.html",
    "./popup.js",
    "./styles.css"
)

# Iterate through each file and add it to the ZIP
foreach ($file in $files)
{
    $fileObject = Get-Item $file

    # Calculate the relative path inside the ZIP archive
    $relativePath = $fileObject.FullName.Substring($currentDir.Path.Length + 1) -replace '\\', '/'
    Write-Host "Adding: $relativePath"

    if ($fileObject.PSIsContainer)
    {
        # Add all files inside the directory to the ZIP
        $directoryFiles = Get-ChildItem -Path $fileObject.FullName -Recurse -File
        foreach ($dirFile in $directoryFiles)
        {
            $relativeDirFilePath = $dirFile.FullName.Substring($currentDir.Path.Length + 1) -replace '\\', '/'
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $dirFile.FullName, $relativeDirFilePath)
        }
    }
    else
    {
        # Add the single file to the ZIP
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $fileObject.FullName, $relativePath)
    }
}

# Release the ZIP file
$zip.Dispose()

# Output the location of the ZIP file
Write-Host "Directory compressed into: $zipFilePath"

# Check if the .xpi file already exists
if (Test-Path $xpiFilePath)
{
    # Ask the user if they want to overwrite the existing file
    $response = Read-Host "The file $xpiFilePath already exists. Do you want to replace it? (y/n)"
    if ($response.ToLower() -ne "y")
    {
        Write-Host "Skipping the renaming. Exiting script."
        Exit 0
    }
    Write-Host "Overwriting the existing file..."
    # Remove the existing .xpi file
    Remove-Item -Path $xpiFilePath -Force
}

# Rename the .zip file to .xpi
Rename-Item -Path $zipFilePath -NewName $xpiFileName
Write-Host "Archive renamed to: $xpiFileName"
