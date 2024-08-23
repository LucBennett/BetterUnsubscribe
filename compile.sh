#!/bin/bash

# set version
VERSION=$(jq -r '.version' manifest.json)

#create build directory
mkdir build

#Create the xpi file excluding certain files
7z a -tzip -mx=9 -xr!.git -xr!build "./build/$(basename "$PWD")-$VERSION.xpi" .