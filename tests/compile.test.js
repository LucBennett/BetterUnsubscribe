/**
 * Build Script Consistency Validation Test Suite
 *
 * This test suite validates that all build scripts produce identical output archives.
 * It ensures consistency across different build methods and environments:
 *
 * - PowerShell scripts (Windows)
 * - Bash scripts (Linux/macOS)
 * - Node.js scripts (cross-platform)
 * - Different archive tools (7-Zip, native zip)
 *
 * Test Strategy:
 * 1. Run each build script independently
 * 2. Extract the resulting archive
 * 3. Compare contents with a baseline (first successful build)
 * 4. Ensure all builds produce byte-for-byte identical results
 *
 * Why This Matters:
 * - Ensures reproducible builds across platforms
 * - Validates that all build methods are equivalent
 * - Catches platform-specific build issues
 * - Guarantees consistent extension packaging
 *
 * Prerequisites:
 * - PowerShell (for .ps1 scripts)
 * - Bash (for .sh scripts)
 * - Node.js (for .js scripts)
 * - 7-Zip or native zip utility
 *
 * @see Build scripts in project root (compile.*)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');
const { compareSync } = require('dir-compare');

/**
 * Configuration for build consistency tests
 */
const CONFIG = {
  buildOutputDir: path.join(__dirname, '../build'),
  tempDir: path.join(__dirname, 'temp'),
  baselineDir: path.join(__dirname, 'temp', 'baseline'),

  // Archive extensions to look for
  archiveExtensions: ['.xpi', '.zip'],

  // Test timeout (builds can take time)
  testTimeout: 30000, // 30 seconds

  // Directory comparison options
  compareOptions: {
    compareContent: true,
    compareSize: true,
    compareDate: false, // Timestamps may differ
  },
};

/**
 * Build script configurations
 * Each entry defines a build method to test
 */
const BUILD_SCRIPTS = [
  {
    name: 'compile.ps1',
    cmd: 'powershell -ExecutionPolicy Bypass -File ./compile.ps1',
    platform: 'win32',
    description: 'PowerShell build script',
  },
  {
    name: 'compile.js',
    cmd: 'node ./compile.js',
    platform: 'all',
    description: 'Node.js build script',
  },
  {
    name: 'compile-z.ps1 (7z)',
    cmd: 'powershell -ExecutionPolicy Bypass -File ./compile-z.ps1 -use7z',
    platform: 'win32',
    description: 'PowerShell with 7-Zip compression',
  },
  {
    name: 'compile-z.ps1 (zip)',
    cmd: 'powershell -ExecutionPolicy Bypass -File ./compile-z.ps1 -useZip',
    platform: 'win32',
    description: 'PowerShell with native zip',
  },
  {
    name: 'compile.sh (zip)',
    cmd: 'bash ./compile.sh -useZip',
    platform: 'unix',
    description: 'Bash script with zip utility',
  },
  {
    name: 'compile.sh (7z)',
    cmd: 'bash ./compile.sh -use7z',
    platform: 'unix',
    description: 'Bash script with 7-Zip',
  },
];

/**
 * Extract a zip archive to a directory
 *
 * @param {string} filePath - Path to the archive file
 * @param {string} outputDir - Directory to extract to
 * @returns {Promise<void>}
 * @throws {Error} If extraction fails
 */
async function extractArchive(filePath, outputDir) {
  try {
    await extract(filePath, { dir: path.resolve(outputDir) });
  } catch (error) {
    throw new Error(`Failed to extract ${filePath}: ${error.message}`);
  }
}

/**
 * Compare two directories for identical content
 *
 * Uses deep comparison including file contents, not just names and sizes.
 * Timestamps are ignored as they may differ between builds.
 *
 * @param {string} dir1 - First directory path
 * @param {string} dir2 - Second directory path
 * @returns {Object} Comparison result with details
 * @returns {boolean} result.identical - Whether directories are identical
 * @returns {Array} result.differences - List of differences found
 * @returns {Object} result.statistics - Comparison statistics
 */
function compareDirectories(dir1, dir2) {
  const result = compareSync(dir1, dir2, CONFIG.compareOptions);

  // Extract meaningful difference information
  const differences = [];

  if (result.diffSet) {
    result.diffSet.forEach((diff) => {
      if (diff.state !== 'equal') {
        differences.push({
          state: diff.state,
          path: diff.path1 || diff.path2,
          name: diff.name1 || diff.name2,
          type: diff.type1 || diff.type2,
        });
      }
    });
  }

  return {
    identical: result.same,
    differences,
    statistics: {
      total: result.total || 0,
      equal: result.equal || 0,
      distinct: result.distinct || 0,
      left: result.left || 0,
      right: result.right || 0,
      differences: result.differences || 0,
    },
  };
}

/**
 * Find the build output archive in the build directory
 *
 * @param {string} buildDir - Build output directory
 * @returns {string} Path to the archive file
 * @throws {Error} If no archive is found or multiple archives exist
 */
function findBuildArchive(buildDir) {
  if (!fs.existsSync(buildDir)) {
    throw new Error(`Build directory does not exist: ${buildDir}`);
  }

  const files = fs.readdirSync(buildDir);
  const archives = files.filter((file) =>
    CONFIG.archiveExtensions.some((ext) => file.endsWith(ext))
  );

  if (archives.length === 0) {
    throw new Error(
      `No build archive found in ${buildDir}. ` +
        `Expected files with extensions: ${CONFIG.archiveExtensions.join(', ')}`
    );
  }

  if (archives.length > 1) {
    throw new Error(
      `Multiple archives found in ${buildDir}: ${archives.join(', ')}. ` +
        'Expected only one build output.'
    );
  }

  return path.join(buildDir, archives[0]);
}

/**
 * Clean a directory by removing and recreating it
 *
 * @param {string} dirPath - Directory to clean
 */
function cleanDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Execute a build script and handle errors
 *
 * @param {Object} script - Build script configuration
 * @returns {Object} Execution result
 * @throws {Error} If build fails
 */
function executeBuildScript(script) {
  try {
    const startTime = Date.now();

    // Execute the build command
    const output = execSync(script.cmd, {
      encoding: 'utf8',
      stdio: 'pipe', // Capture output for logging
      cwd: path.join(__dirname, '..'), // Run from project root
    });

    const duration = Date.now() - startTime;

    return {
      success: true,
      output: output.toString(),
      duration,
    };
  } catch (error) {
    throw new Error(
      `Build script "${script.name}" failed:\n` +
        `Command: ${script.cmd}\n` +
        `Exit code: ${error.status}\n` +
        `Error: ${error.message}\n` +
        `Output: ${error.stdout || error.stderr || 'No output'}`
    );
  }
}

/**
 * Check if a build script should run on the current platform
 *
 * @param {Object} script - Build script configuration
 * @returns {boolean} True if script should run on this platform
 */
function shouldRunOnPlatform(script) {
  if (script.platform === 'all') {
    return true;
  }

  const currentPlatform = process.platform;

  if (script.platform === 'unix') {
    return currentPlatform !== 'win32';
  }

  if (script.platform === 'win32') {
    return currentPlatform === 'win32';
  }

  return script.platform === currentPlatform;
}

/**
 * Get build scripts that should run on the current platform
 *
 * @returns {Array} Filtered list of build scripts
 */
function getPlatformBuildScripts() {
  const filtered = BUILD_SCRIPTS.filter(shouldRunOnPlatform);

  if (filtered.length === 0) {
    console.warn(
      `No build scripts configured for platform: ${process.platform}`
    );
  }

  return filtered;
}

/**
 * Format file size in human-readable format
 *
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
function formatFileSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Get statistics about a directory
 *
 * @param {string} dirPath - Directory to analyze
 * @returns {Object} Directory statistics
 */
function getDirectoryStats(dirPath) {
  let fileCount = 0;
  let totalSize = 0;

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    entries.forEach((entry) => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        fileCount++;
        totalSize += fs.statSync(fullPath).size;
      }
    });
  }

  walk(dirPath);

  return {
    fileCount,
    totalSize,
    formattedSize: formatFileSize(totalSize),
  };
}

/**
 * Build Script Consistency Test Suite
 *
 * Tests that all build scripts produce identical output archives.
 * The first successful build establishes the baseline, and all subsequent
 * builds must match it exactly.
 */
describe('Build Script Consistency Validation', () => {
  // Set longer timeout for build operations
  jest.setTimeout(CONFIG.testTimeout);

  const platformScripts = getPlatformBuildScripts();

  beforeAll(() => {
    // Clean up any previous test artifacts
    cleanDirectory(CONFIG.tempDir);

    console.log('\n=== Build Consistency Test Configuration ===');
    console.log(`Platform: ${process.platform}`);
    console.log(`Scripts to test: ${platformScripts.length}`);
    console.log(`Test timeout: ${CONFIG.testTimeout}ms`);
    console.log('============================================\n');
  });

  beforeEach(() => {
    // Clean build directory before each test
    cleanDirectory(CONFIG.buildOutputDir);
  });

  afterAll(() => {
    // Clean up test artifacts
    [CONFIG.buildOutputDir, CONFIG.tempDir, CONFIG.baselineDir].forEach(
      (dir) => {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    );

    console.log('\n=== Build Consistency Test Complete ===');
  });

  // Ensure we have build scripts to test
  test('should have at least one build script for current platform', () => {
    expect(platformScripts.length).toBeGreaterThan(0);

    console.log('\nBuild scripts to test:');
    platformScripts.forEach((script) => {
      console.log(`  - ${script.name}: ${script.description}`);
    });
  });

  // Test each build script
  test.each(platformScripts)(
    'should produce identical build using $name',
    async (script) => {
      console.log(`\nTesting: ${script.name}`);
      console.log(`Description: ${script.description}`);
      console.log(`Command: ${script.cmd}`);

      // Execute the build script
      let buildResult;
      try {
        buildResult = executeBuildScript(script);
        console.log(`Build completed in ${buildResult.duration}ms`);
      } catch (error) {
        throw error; // Re-throw with enhanced error message
      }

      // Find the build output
      const archivePath = findBuildArchive(CONFIG.buildOutputDir);
      console.log(`Archive created: ${path.basename(archivePath)}`);

      // Get archive size
      const archiveSize = fs.statSync(archivePath).size;
      console.log(`Archive size: ${formatFileSize(archiveSize)}`);

      // Extract the archive
      const extractDir = path.join(
        CONFIG.tempDir,
        script.name.replace(/[^a-zA-Z0-9]/g, '_')
      );
      cleanDirectory(extractDir);

      try {
        await extractArchive(archivePath, extractDir);
        console.log(`Extracted to: ${path.basename(extractDir)}`);
      } catch (error) {
        throw error;
      }

      // Get extraction statistics
      const stats = getDirectoryStats(extractDir);
      console.log(
        `Extracted files: ${stats.fileCount} (${stats.formattedSize})`
      );

      // Check if this is the first build (establish baseline)
      if (!fs.existsSync(CONFIG.baselineDir)) {
        fs.mkdirSync(CONFIG.baselineDir, { recursive: true });
        fs.cpSync(extractDir, CONFIG.baselineDir, { recursive: true });

        console.log('✓ Baseline established by this build');

        // Test passes - baseline is now set
        expect(true).toBe(true);
      } else {
        // Compare with baseline
        console.log('Comparing with baseline...');
        const comparison = compareDirectories(extractDir, CONFIG.baselineDir);

        // Log comparison results
        if (comparison.identical) {
          console.log('✓ Build matches baseline perfectly');
          console.log(
            `  Files compared: ${comparison.statistics.equal}/${comparison.statistics.total}`
          );
        } else {
          console.error('✗ Build differs from baseline');
          console.error(
            `  Differences found: ${comparison.statistics.differences}`
          );
          console.error(`  Distinct files: ${comparison.statistics.distinct}`);
          console.error(
            `  Files only in this build: ${comparison.statistics.left}`
          );
          console.error(
            `  Files only in baseline: ${comparison.statistics.right}`
          );

          // Log specific differences
          if (comparison.differences.length > 0) {
            console.error('\n  Specific differences:');
            comparison.differences.slice(0, 10).forEach((diff) => {
              console.error(
                `    - ${diff.state}: ${diff.path}/${diff.name} (${diff.type})`
              );
            });

            if (comparison.differences.length > 10) {
              console.error(
                `    ... and ${comparison.differences.length - 10} more`
              );
            }
          }
        }

        // Assert that builds are identical
        if (!comparison.identical) {
          throw new Error(
            `Build output differs from baseline.\n` +
              `Differences: ${comparison.statistics.differences}\n` +
              `This indicates the build script produces different results than other build methods.\n` +
              `Check the logs above for specific file differences.`
          );
        }

        expect(comparison.identical).toBe(true);
      }
    }
  );

  // Additional validation: Check that baseline was actually set
  test('should have established a baseline from first build', () => {
    expect(fs.existsSync(CONFIG.baselineDir)).toBe(true);

    const stats = getDirectoryStats(CONFIG.baselineDir);
    expect(stats.fileCount).toBeGreaterThan(0);

    console.log('\n=== Baseline Statistics ===');
    console.log(`Files: ${stats.fileCount}`);
    console.log(`Total size: ${stats.formattedSize}`);
    console.log('===========================\n');
  });
});
