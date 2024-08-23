#!/bin/bash

# set version
VERSION="2.2.3"

#create build directory
mkdir build

#Create the xpi file excluding certain files
7z a -tzip -mx=9 -xr!.git -xr!build "./build/$(basename "$PWD")-$VERSION.xpi" .