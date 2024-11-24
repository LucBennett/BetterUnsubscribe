const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');
const { compareSync } = require('dir-compare');

// Utility function to extract zip files
async function extractZip(filePath, outputDir) {
  return extract(filePath, { dir: outputDir });
}

// Utility function to compare directories deeply
function compareDirectories(dir1, dir2) {
  const result = compareSync(dir1, dir2, { compareContent: true });
  return result.same;
}

// Path to the build scripts
const buildScripts = [
  { name: 'compile.ps1', cmd: 'powershell ./compile.ps1' },
  { name: 'compile.js', cmd: 'node ./compile.js' },
  { name: 'compile-z.ps1 (7z)', cmd: 'powershell ./compile-z.ps1 -use7z' },
  { name: 'compile-z.ps1 (zip)', cmd: 'powershell ./compile-z.ps1 -useZip' },
  { name: 'compile.sh (zip)', cmd: 'bash ./compile.sh -useZip' },
  { name: 'compile.sh (7z)', cmd: 'bash ./compile.sh -use7z' },
];

// Directory for build output and extraction
const buildOutputDir = path.join(__dirname, '../build');
const tempDir = path.join(__dirname, 'temp');
// Compare the extracted contents with a baseline (set the first run as the baseline)
const baselineDir = path.join(tempDir, 'baseline');

describe('Build script consistency tests', () => {
  jest.setTimeout(10000);
  beforeAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    fs.mkdirSync(tempDir);

    if (fs.existsSync(baselineDir)) {
      fs.rmSync(baselineDir, { recursive: true });
    }
  });

  beforeEach(() => {
    if (fs.existsSync(buildOutputDir)) {
      fs.rmSync(buildOutputDir, { recursive: true });
    }
    fs.mkdirSync(buildOutputDir);
  });

  afterAll(() => {
    if (fs.existsSync(buildOutputDir)) {
      fs.rmSync(buildOutputDir, { recursive: true });
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    if (fs.existsSync(baselineDir)) {
      fs.rmSync(baselineDir, { recursive: true });
    }
  });

  test.each(buildScripts)(
    'should create consistent build using %s',
    async (script) => {
      // Run the build script
      try {
        execSync(script.cmd, { stdio: 'inherit' });
      } catch (error) {
        throw new Error(`Build script ${script.name} failed: ${error.message}`);
      }

      // Find the output file in the build directory (assuming there is only one .xpi or .zip file)
      const outputFiles = fs
        .readdirSync(buildOutputDir)
        .filter((file) => file.endsWith('.xpi') || file.endsWith('.zip'));
      if (outputFiles.length === 0) {
        throw new Error(`No output archive found in ${buildOutputDir}`);
      }
      const outputFile = outputFiles[0];
      const outputZip = path.join(buildOutputDir, outputFile);
      const outputExtracted = path.join(
        tempDir,
        script.name.replace(/ /g, '_')
      );

      // Extract the build archive
      await extractZip(outputZip, outputExtracted);

      if (!fs.existsSync(baselineDir)) {
        // console.log('Baseline set by', script.name);
        // Set the first successful build as the baseline
        fs.mkdirSync(baselineDir);
        fs.cpSync(outputExtracted, baselineDir, { recursive: true });
      } else {
        // Compare the new build with the baseline
        const areSame = compareDirectories(outputExtracted, baselineDir);
        expect(areSame).toBe(true);
      }
    }
  );
});
