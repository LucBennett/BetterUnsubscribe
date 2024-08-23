VERSION="2.2.2"
7z a -tzip -mx=9 -xr!.git ../$(basename "$PWD")-$VERSION.xpi .