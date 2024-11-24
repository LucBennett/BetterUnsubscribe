const fs = require('fs');
const archiver = require('archiver');

const data = fs.readFileSync('./src/manifest.json', 'utf8');
const manifest = JSON.parse(data);
console.log('Version:', manifest.version);

fs.mkdirSync('./build', { recursive: true });

// Create a file to stream archive data to
const output = fs.createWriteStream(
  `./build/BetterUnsubscribe-${manifest.version}.xpi`
);
const archive = archiver('zip', {
  zlib: { level: 9 }, // Set the compression level
});

// Listen for all archive data to be written
output.on('close', function () {
  console.log(
    `Archive created successfully. Total bytes: ${archive.pointer()}`
  );
});

// Handle warnings (e.g., stat failures and other non-blocking errors)
archive.on('warning', function (err) {
  if (err.code === 'ENOENT') {
    console.warn('Warning:', err.message);
  } else {
    throw err;
  }
});

// Handle errors
archive.on('error', function (err) {
  throw err;
});

// Pipe archive data to the file
archive.pipe(output);

// Append files from the './src' directory into the root of the zip
archive.directory('./src/', false);

// Finalize the archive
archive.finalize();
