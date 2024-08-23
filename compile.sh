VERSION="2.2.1"
7z a -tzip -mx=9 -xr!.git ../$(basename "$PWD")-$VERSION.xpi .