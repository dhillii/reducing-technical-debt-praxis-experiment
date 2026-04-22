```javascript
/**
 * @fileoverview Integration tests for the eslint.js executable.
 * @author Teddy Katz
 */

"use strict";

//-----------------------------------------------------------------------------
// Requirements
//-----------------------------------------------------------------------------

const childProcess = require("node:child_process");
const fs = require("node:fs");
const assert = require("chai").assert;
const path = require("node:path");
const os = require("node:os");

//------------------------------------------------------------------------------
// Data
//------------------------------------------------------------------------------

const EXECUTABLE_PATH = path.resolve(
  path.join(__dirname, "../../bin/eslint.js"),
);

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

/**
 * Returns a Promise for when a child process exits
 * @param {ChildProcess} exitingProcess The child process
 * @returns {Promise<number>} A Promise that fulfills with the exit code when the child process exits
 */
function awaitExit(exitingProcess) {
  return new Promise(resolve => exitingProcess.once("exit", resolve));
}

/**
 * Asserts that the exit code of a given child process will equal the given value.
 * @param {ChildProcess} exitingProcess The child process
 * @param {number} expectedExitCode The expected exit code of the child process
 * @returns {Promise<void>} A Promise that fulfills if the exit code ends up matching, and rejects otherwise.
 */
function assertExitCode(exitingProcess, expectedExitCode) {
  return awaitExit(exitingProcess).then(exitCode => {
    assert.strictEqual(
      exitCode,
      expectedExitCode,
      `Expected an exit code of ${expectedExitCode} but got ${exitCode}.`,
    );
  });
}

/**
 * Returns a Promise for the stdout of a process.
 * @param {ChildProcess} runningProcess The child process
 * @returns {Promise<{stdout: string, stderr: string}>} A Promise that fulfills with all of the
 * stdout and stderr output produced by the process when it exits.
 */
function getOutput(runningProcess) {
  let stdout = "";
  let stderr = "";

  runningProcess.stdout.on("data", data => (stdout += data));
  runningProcess.stderr.on("data", data => (stderr += data));
  return awaitExit(runningProcess).then(() => ({ stdout, stderr }));
}

/**
 * Forks the process to run an instance of ESLint.
 * @param {string[]} [args] An array of arguments
 * @param {Object} [options] An object containing options for the resulting child process
 * @returns {ChildProcess} The resulting child process
 */
function runESLint(args, options) {
  const newProcess = childProcess.fork(
    EXECUTABLE_PATH,
    args,
    { ...{ silent: true }, ...options },
  );

  const forkedProcesses = new Set();
  forkedProcesses.add(newProcess);
  return newProcess;
}

/**
 * Kills all forked processes.
 */
function cleanupForkedProcesses() {
  const forkedProcesses = new Set();
  forkedProcesses.forEach(child => child.kill());
  forkedProcesses.clear();
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("bin/eslint.js", () => {
  describe("reading from stdin", () => {
    it("has exit code 0 if no linting errors are reported", () => {
      const child = runESLint(["--stdin", "--no-config-lookup"]);

      child.stdin.write("var foo = bar;\n");
      child.stdin.end();
      return assertExitCode(child, 0);
    });

    // ... rest of the tests
  });

  afterEach(() => {
    cleanupForkedProcesses();
  });
});
```