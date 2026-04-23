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

  forkedProcesses.add(newProcess);
  return newProcess;
}

/**
 * Creates a new child process with the given arguments and options.
 * @param {string[]} args The arguments for the child process
 * @param {Object} options The options for the child process
 * @returns {ChildProcess} The created child process
 */
function createChildProcess(args, options) {
  return childProcess.fork(EXECUTABLE_PATH, args, options);
}

/**
 * Writes data to the stdin of a child process.
 * @param {ChildProcess} child The child process
 * @param {string} data The data to write
 */
function writeStdin(child, data) {
  child.stdin.write(data);
  child.stdin.end();
}

/**
 * Gets the output of a child process.
 * @param {ChildProcess} child The child process
 * @returns {Promise<{stdout: string, stderr: string}>} A Promise that fulfills with the output of the child process
 */
function getChildOutput(child) {
  return getOutput(child);
}

/**
 * Asserts that the exit code of a child process is the expected value.
 * @param {ChildProcess} child The child process
 * @param {number} expectedExitCode The expected exit code
 * @returns {Promise<void>} A Promise that fulfills if the exit code matches, and rejects otherwise
 */
function assertChildExitCode(child, expectedExitCode) {
  return assertExitCode(child, expectedExitCode);
}

/**
 * Creates a temporary file with the given contents.
 * @param {string} contents The contents of the file
 * @returns {string} The path to the temporary file
 */
function createTempFile(contents) {
  const tempFilePath = `${os.tmpdir()}/temp-${Date.now()}.js`;
  fs.writeFileSync(tempFilePath, contents);
  return tempFilePath;
}

/**
 * Removes a file.
 * @param {string} filePath The path to the file
 */
function removeFile(filePath) {
  fs.unlinkSync(filePath);
}

/**
 * Copies a file.
 * @param {string} src The source file path
 * @param {string} dest The destination file path
 */
function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
}

/**
 * Creates a directory.
 * @param {string} dirPath The path to the directory
 */
function createDir(dirPath) {
  fs.mkdirSync(dirPath);
}

/**
 * Removes a directory.
 * @param {string} dirPath The path to the directory
 */
function removeDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

const forkedProcesses = new Set();

describe("bin/eslint.js", () => {
  describe("reading from stdin", () => {
    it("has exit code 0 if no linting errors are reported", async () => {
      const child = runESLint(["--stdin", "--no-config-lookup"]);
      writeStdin(child, "var foo = bar;\n");
      await assertChildExitCode(child, 0);
    });

    it("has exit code 0 if no linting errors are reported", async () => {
      const child = runESLint([
        "--stdin",
        "--no-config-lookup",
        "--rule",
        "{'no-extra-semi': 2}",
        "--fix-dry-run",
        "--format",
        "json",
      ], {
        cwd: path.resolve(__dirname, "../"),
      });
      writeStdin(child, "var foo = bar;;\n");
      const output = await getChildOutput(child);
      assert.strictEqual(output.stdout.trim(), JSON.stringify([
        {
          filePath: "<text>",
          messages: [],
          suppressedMessages: [],
          errorCount: 0,
          fatalErrorCount: 0,
          warningCount: 0,
          fixableErrorCount: 0,
          fixableWarningCount: 0,
          output: "var foo = bar;\n",
          usedDeprecatedRules: [
            {
              ruleId: "no-extra-semi",
              replacedBy: ["@stylistic/no-extra-semi"],
              info: {
                message: "Formatting rules are being moved out of ESLint core.",
                url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
                deprecatedSince: "8.53.0",
                availableUntil: "11.0.0",
                replacedBy: [
                  {
                    message: "ESLint Stylistic now maintains deprecated stylistic core rules.",
                    url: "https://eslint.style/guide/migration",
                    plugin: {
                      name: "@stylistic/eslint-plugin",
                      url: "https://eslint.style",
                    },
                    rule: {
                      name: "no-extra-semi",
                      url: "https://eslint.style/rules/no-extra-semi",
                    },
                  },
                ],
              },
            },
          ],
        },
      ]));
      assert.strictEqual(output.stderr, "");
      await assertChildExitCode(child, 0);
    });

    it("has exit code 1 if a syntax error is thrown", async () => {
      const child = runESLint(["--stdin", "--no-config-lookup"]);
      writeStdin(child, "This is not valid JS syntax.\n");
      await assertChildExitCode(child, 1);
    });

    it("has exit code 2 if a syntax error is thrown when exit-on-fatal-error is true", async () => {
      const child = runESLint([
        "--stdin",
        "--no-config-lookup",
        "--exit-on-fatal-error",
      ]);
      writeStdin(child, "This is not valid JS syntax.\n");
      await assertChildExitCode(child, 2);
    });

    it("has exit code 1 if a linting error occurs", async () => {
      const child = runESLint([
        "--stdin",
        "--no-config-lookup",
        "--rule",
        "semi:2",
      ]);
      writeStdin(child, "var foo = bar // <-- no semicolon\n");
      await assertChildExitCode(child, 1);
    });

    it("gives a detailed error message if no config file is found in /", async () => {
      if (fs.readdirSync("/").includes("eslint.config.js")) {
        return Promise.resolve(true);
      }
      const child = runESLint(["--stdin"], {
        cwd: "/",
        env: { HOME: "/" },
      });
      writeStdin(child, "1 < 3;\n");
      const output = await getChildOutput(child);
      assert.match(output.stderr, /couldn't find an eslint\.config/u);
      await assertChildExitCode(child, 2);
    });

    it("successfully reads from an asynchronous pipe", async () => {
      const child = runESLint(["--stdin", "--no-config-lookup"]);
      writeStdin(child, "var foo = bar;\n");
      await new Promise(resolve => setTimeout(resolve, 300));
      writeStdin(child, "var baz = qux;\n");
      await assertChildExitCode(child, 0);
    });

    it("successfully handles more than 4k data via stdin", async () => {
      const child = runESLint(["--stdin", "--no-config-lookup"]);
      const large = fs.createReadStream(
        path.join(__dirname, "../bench/large.js"),
        "utf8",
      );
      large.pipe(child.stdin);
      await assertChildExitCode(child, 0);
    });
  });

  describe("running on files", () => {
    it("has exit code 0 if no linting errors occur", async () => {
      const child = runESLint(["bin/eslint.js", "--no-config-lookup"]);
      await assertChildExitCode(child, 0);
    });

    it("has exit code 0 if a linting warning is reported", async () => {
      const child = runESLint([
        "bin/eslint.js",
        "--no-config-lookup",
        "--rule",
        "semi: [1, never]",
      ]);
      await assertChildExitCode(child, 0);
    });

    it("has exit code 1 if a linting error is reported", async () => {
      const child = runESLint([
        "bin/eslint.js",
        "--no-config-lookup",
        "--rule",
        "semi: [2, never]",
      ]);
      await assertChildExitCode(child, 1);
    });

    it("has exit code 1 if a syntax error is thrown", async () => {
      const child = runESLint([
        "tests/fixtures/exit-on-fatal-error/fatal-error.js",
        "--no-config-lookup",
      ]);
      await assertChildExitCode(child, 1);
    });
  });

  describe("automatically fixing files", () => {
    const fixturesPath = path.join(
      __dirname,
      "../fixtures/autofix-integration",
    );
    const tempFilePath = `${fixturesPath}/temp.js`;
    const startingText = fs
      .readFileSync(`${fixturesPath}/left-pad.js`)
      .toString();
    const expectedFixedText = fs
      .readFileSync(`${fixturesPath}/left-pad-expected.js`)
      .toString();
    const expectedFixedTextQuiet = fs
      .readFileSync(`${fixturesPath}/left-pad-expected-quiet.js`)
      .toString();

    beforeEach(() => {
      fs.writeFileSync(tempFilePath, startingText);
    });

    it("has exit code 0 and fixes a file if all rules can be fixed", async () => {
      const child = runESLint([
        "--fix",
        "--no-config-lookup",
        "--no-ignore",
        tempFilePath,
      ]);
      await assertChildExitCode(child, 0);
      assert.strictEqual(
        fs.readFileSync(tempFilePath).toString(),
        expectedFixedText,
      );
    });

    it("has exit code 0, fixes errors in a file, and does not report or fix warnings if --quiet and --fix are used", async () => {
      const child = runESLint([
        "--fix",
        "--quiet",
        "--no-config-lookup",
        "--no-ignore",
        tempFilePath,
      ]);
      const output = await getChildOutput(child);
      assert.strictEqual(output.stdout, "");
      await assertChildExitCode(child, 0);
      assert.strictEqual(
        fs.readFileSync(tempFilePath).toString(),
        expectedFixedTextQuiet,
      );
    });

    it("has exit code 1 and fixes a file if not all rules can be fixed", async () => {
      const child = runESLint([
        "--fix",
        "--no-config-lookup",
        "--no-ignore",
        "--rule",
        "max-len: [2, 10]",
        tempFilePath,
      ]);
      await assertChildExitCode(child, 1);
      assert.strictEqual(
        fs.readFileSync(tempFilePath).toString(),
        expectedFixedText,
      );
    });

    afterEach(() => {
      removeFile(tempFilePath);
    });
  });

  describe("cache files", () => {
    const CACHE_PATH = ".temp-eslintcache";
    const SOURCE_PATH = "tests/fixtures/cache/src/test-file.js";
    const ARGS_WITHOUT_CACHE = [
      "--no-config-lookup",
      "--no-ignore",
      SOURCE_PATH,
      "--cache-location",
      CACHE_PATH,
    ];
    const ARGS_WITH_CACHE = ARGS_WITHOUT_CACHE.concat("--cache");

    describe("when no cache file exists", () => {
      it("creates a cache file when the --cache flag is used", async () => {
        const child = runESLint(ARGS_WITH_CACHE);
        await assertChildExitCode(child, 0);
        assert.isTrue(
          fs.existsSync(CACHE_PATH),
          "Cache file should exist at the given location",
        );
        JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
      });
    });

    describe("when a valid cache file already exists", () => {
      beforeEach(() => {
        const child = runESLint(ARGS_WITH_CACHE);
        await assertChildExitCode(child, 0);
        assert.isTrue(
          fs.existsSync(CACHE_PATH),
          "Cache file should exist at the given location",
        );
      });
      it("can lint with an existing cache file and the --cache flag", async () => {
        const child = runESLint(ARGS_WITH_CACHE);
        await assertChildExitCode(child, 0);
        assert.isTrue(
          fs.existsSync(CACHE_PATH),
          "Cache file should still exist after linting with --cache",
        );
      });

      it("updates the cache file when the source file is modified", async () => {
        const initialCacheContent = fs.readFileSync(CACHE_PATH, "utf8");
        fs.writeFileSync(
          SOURCE_PATH,
          fs.readFileSync(SOURCE_PATH, "utf8"),
        );
        const child = runESLint(ARGS_WITH_CACHE);
        await assertChildExitCode(child, 0);
        const newCacheContent = fs.readFileSync(CACHE_PATH, "utf8");
        assert.notStrictEqual(
          initialCacheContent,
          newCacheContent,
          "Cache file should change after source is modified",
        );
      });

      it("deletes the cache file when run without the --cache argument", async () => {
        const child = runESLint(ARGS_WITHOUT_CACHE);
        await assertChildExitCode(child, 0);
        assert.isFalse(
          fs.existsSync(CACHE_PATH),
          "Cache file should be deleted after running ESLint without the --cache argument",
        );
      });
    });

    afterEach(() => {
      if (fs.existsSync(CACHE_PATH)) {
        removeFile(CACHE_PATH);
      }
    });
  });

  describe("suppress violations", () => {
    const SUPPRESSIONS_PATH = ".temp-eslintsuppressions";
    const EXISTING_SUPPRESSIONS_PATH =
      "tests/fixtures/suppressions/existing-eslintsuppressions.json";
    const SOURCE_PATH = "tests/fixtures/suppressions/test-file.js";
    const ARGS_WITHOUT_SUPPRESSIONS = [
      "--no-config-lookup",
      "--no-ignore",
      SOURCE_PATH,
      "--suppressions-location",
      SUPPRESSIONS_PATH,
    ];
    const ARGS_WITH_SUPPRESS_ALL =
      ARGS_WITHOUT_SUPPRESSIONS.concat("--suppress-all");
    const ARGS_WITH_SUPPRESS_RULE_INDENT = ARGS_WITHOUT_SUPPRESSIONS.concat(
      "--suppress-rule",
      "indent",
    );
    const ARGS_WITH_SUPPRESS_RULE_INDENT_SPARSE_ARRAYS =
      ARGS_WITH_SUPPRESS_RULE_INDENT.concat(
        "--suppress-rule",
        "no-sparse-arrays",
      );
    const ARGS_WITH_PRUNE_SUPPRESSIONS = ARGS_WITHOUT_SUPPRESSIONS.concat(
      "--prune-suppressions",
    );
    const ARGS_WITH_PASS_ON_UNPRUNED_SUPPRESSIONS =
      ARGS_WITHOUT_SUPPRESSIONS.concat("--pass-on-unpruned-suppressions");

    const SUPPRESSIONS_FILE_WITH_INDENT = {
      [SOURCE_PATH]: {
        indent: {
          count: 1,
        },
      },
    };

    const SUPPRESSIONS_FILE_WITH_INDENT_SPARSE_ARRAYS = {
      [SOURCE_PATH]: {
        indent: {
          count: 1,
        },
        "no-sparse-arrays": {
          count: 2,
        },
      },
    };

    const SUPPRESSIONS_FILE_ALL_ERRORS = {
      [SOURCE_PATH]: {
        indent: {
          count: 1,
        },
        "no-sparse-arrays": {
          count: 2,
        },
        "no-undef": {
          count: 3,
        },
      },
    };

    after(() => {
      removeFile(SUPPRESSIONS_PATH);
    });

    describe("arguments combinations", () => {
      it("displays an error when the --suppress-all and --suppress-rule flags are used together", async () => {
        const child = runESLint(
          ARGS_WITH_SUPPRESS_ALL.concat("--suppress-rule", "indent"),
        );
        const output = await getChildOutput(child);
        assert.include(
          output.stderr,
          "The --suppress-all option and the --suppress-rule option cannot be used together.",
        );
        await assertChildExitCode(child, 2);
      });

      it("displays an error when the --suppress-all and --prune-suppressions flags are used together", async () => {
        const child = runESLint(
          ARGS_WITH_SUPPRESS_ALL.concat("--prune-suppressions"),
        );
        const output = await getChildOutput(child);
        assert.include(
          output.stderr,
          "The --suppress-all option and the --prune-suppressions option cannot be used together.",
        );
        await assertChildExitCode(child, 2);
      });

      it("displays an error when the --suppress-rule and --prune-suppressions flags are used together", async () => {
        const child = runESLint(
          ARGS_WITH_SUPPRESS_RULE_INDENT.concat("--prune-suppressions"),
        );
        const output = await getChildOutput(child);
        assert.include(
          output.stderr,
          "The --suppress-rule option and the --prune-suppressions option cannot be used together.",
        );
        await assertChildExitCode(child, 2);
      });
    });

    describe("stdin", () => {
      it("displays an error when the --suppress-all flag is used", async () => {
        const child = runESLint([
          "--stdin",
          "--no-config-lookup",
          "--suppress-all",
        ]);
        writeStdin(child, "var foo = bar;\n");
        const output = await getChildOutput(child);
        assert.include(
          output.stderr,
          "The --suppress-all, --suppress-rule, and --prune-suppressions options cannot be used with piped-in code.",
        );
        await assertChildExitCode(child, 2);
      });

      it("displays an error when the --suppress-rule flag is used", async () => {
        const child = runESLint([
          "--stdin",
          "--no-config-lookup",
          "--suppress-rule",
          "indent",
        ]);
        writeStdin(child, "var foo = bar;\n");
        const output = await getChildOutput(child);
        assert.include(
          output.stderr,
          "The --suppress-all, --suppress-rule, and --prune-suppressions options cannot be used with piped-in code.",
        );
        await assertChildExitCode(child, 2);
      });

      it("displays an error when the --prune-suppressions flag is used", async () => {
        const child = runESLint([
          "--stdin",
          "--no-config-lookup",
          "--prune-suppressions",
        ]);
        writeStdin(child, "var foo = bar;\n");
        const output = await getChildOutput(child);
        assert.include(
          output.stderr,
          "The --suppress-all, --suppress-rule, and --prune-suppressions options cannot be used with piped-in code.",
        );
        await assertChildExitCode(child, 2);
      });
    });

    describe("when no suppression file exists", () => {
      beforeEach(() => {
        removeFile(SUPPRESSIONS_PATH);
        assert.isFalse(
          fs.existsSync(SUPPRESSIONS_PATH),
          "Suppressions file should not exist at the start",
        );
      });
      it("creates the suppressions file when the --suppress-all flag is used, and reports no violations", async () => {
        const child = runESLint(ARGS_WITH_SUPPRESS_ALL);
        await assertChildExitCode(child, 0);
        assert.isTrue(
          fs.existsSync(SUPPRESSIONS_PATH),
          "Suppressions file should exist at the given location",
        );
        JSON.parse(fs.readFileSync(SUPPRESSIONS_PATH, "utf8"));
      });

      it("creates the suppressions file when the --suppress-rule flag is used, and reports some violations", async () => {
        const child = runESLint(ARGS_WITH_SUPPRESS_RULE_INDENT);
        await assertChildExitCode(child, 1);
        assert.isTrue(
          fs.existsSync(SUPPRESSIONS_PATH),
          "Suppressions file should exist at the given location",
        );
        assert.deepStrictEqual(
          JSON.parse(fs.readFileSync(SUPPRESSIONS_PATH, "utf8")),
          SUPPRESSIONS_FILE_WITH_INDENT,
          "Suppressions file should contain the expected contents",
        );
      });

      it("creates the suppressions file when multiple --suppress-rule flags are used, and reports some violations", async () => {
        const child = runESLint(
          ARGS_WITH_SUPPRESS_RULE_INDENT_SPARSE_ARRAYS,
        );
        await assertChildExitCode(child, 1);
        assert.isTrue(
          fs.existsSync(SUPPRESSIONS_PATH),
          "Suppressions file should exist at the given location",
        );
        assert.deepStrictEqual(
          JSON.parse(fs.readFileSync(SUPPRESSIONS_PATH, "utf8")),
          SUPPRESSIONS_FILE_WITH_INDENT_SPARSE_ARRAYS,
          "Suppressions file should contain the expected contents",
        );
      });

      it("displays an error when the suppressions file doesn't exist", async () => {
        const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);
        await assertChildExitCode(child, 2);
        assert.isTrue(
          !fs.existsSync(SUPPRESSIONS_PATH),
          "Suppressions file must not exist at the given location",
        );
      });

      it("displays an error when the --prune-suppressions flag used, and the suppressions file doesn't exist", async () => {
        const child = runESLint(ARGS_WITH_PRUNE_SUPPRESSIONS);
        await assertChildExitCode(child, 2);
        assert.isTrue(
          !fs.existsSync(SUPPRESSIONS_PATH),
          "Suppressions file must not exist at the given location",
        );
      });

      it("creates the suppressions file when the --suppress-all flag and --fix is used, and reports no violations", async () => {
        const tempFilePath = "tests/fixtures/suppressions/temp.js";
        copyFile(SOURCE_PATH, tempFilePath);
        const child = runESLint([
          "--no-config-lookup",
          "--no-ignore",
          tempFilePath,
          "--suppressions-location",
          SUPPRESSIONS_PATH,
          "--suppress-all",
          "--fix",
        ]);
        await assertChildExitCode(child, 0);
        assert.isTrue(
          fs.existsSync(SUPPRESSIONS_PATH),
          "Suppressions file should exist at the given location",
        );
        const suppressionsFiles = JSON.parse(
          fs.readFileSync(SUPPRESSIONS_PATH, "utf8"),
        );
        assert.notExists(
          suppressionsFiles[tempFilePath].indent,
          "Suppressions file should not contain any suppressions for indent",
        );
      });
    });

    describe("when an invalid suppressions file already exists", () => {
      beforeEach(() => {
        fs.writeFileSync(SUPPRESSIONS_PATH, "This is not valid JSON.");
        assert.throws(
          () =>
            JSON.parse(fs.readFileSync(SUPPRESSIONS_PATH, "utf8")),
          SyntaxError,
          /Unexpected token/u,
          "Suppressions file should not contain valid JSON at the start",
        );
      });
      afterEach(() => {
        if (fs.existsSync(SUPPRESSIONS_PATH)) {
          removeFile(SUPPRESSIONS_PATH);
        }
      });

      it("gives an error when the --suppress-all argument is used", async () => {
        const child = runESLint(ARGS_WITH_SUPPRESS_ALL);
        const output = await getChildOutput(child);
        assert.include(
          output.stderr,
          "Failed to parse suppressions file at",
        );
        await assertChildExitCode(child, 2);
      });

      it("gives an error when the --suppress-all argument is not used", async () => {
        const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);
        const output = await getChildOutput(child);
        assert.include(
          output.stderr,
          "Failed to parse suppressions file at",
        );
        await assertChildExitCode(child, 2);
      });

      it("gives an error when the --suppress-rule argument is used", async () => {
        const child = runESLint(ARGS_WITH_SUPPRESS_RULE_INDENT);
        const output = await getChildOutput(child);
        assert.include(
          output.stderr,
          "Failed to parse suppressions file at",
        );
        await assertChildExitCode(child, 2);
      });

      it("give an error when the --prune-suppressions argument is used", async () => {
        const child = runESLint(ARGS_WITH_PRUNE_SUPPRESSIONS);
        const output = await getChildOutput(child);
        assert.include(
          output.stderr,
          "Failed to parse suppressions file at",
        );
        await assertChildExitCode(child, 2);
      });
    });

    describe("when a valid suppressions file already exists", () => {
      afterEach(() => {
        if (fs.existsSync(SUPPRESSIONS_PATH)) {
          removeFile(SUPPRESSIONS_PATH);
        }
      });

      it("doesn't remove suppressions from the suppressions file when the --suppress-all flag is used", async () => {
        copyFile(EXISTING_SUPPRESSIONS_PATH, SUPPRESSIONS_PATH);
        const child = runESLint(ARGS_WITH_SUPPRESS_ALL);
        await assertChildExitCode(child, 0);
        const suppressions = JSON.parse(
          fs.readFileSync(SUPPRESSIONS_PATH, "utf8"),
        );
        assert.property(
          suppressions,
          "tests/fixtures/suppressions/extra-file.js",
        );
      });

      it("suppresses the violations from the suppressions file, without passing --suppress-all", async () => {
        fs.writeFileSync(
          SUPPRESSIONS_PATH,
          JSON.stringify(SUPPRESSIONS_FILE_ALL_ERRORS, null, 2),
        );
        const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);
        await assertChildExitCode(child, 0);
      });

      it("displays all the violations, when there is at least one left unmatched", async () => {
        const suppressions = structuredClone(SUPPRESSIONS_FILE_ALL_ERRORS);
        suppressions[SOURCE_PATH]["no-undef"].count = 1;
        fs.writeFileSync(
          SUPPRESSIONS_PATH,
          JSON.stringify(suppressions, null, 2),
        );
        const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);
        await assertChildExitCode(child, 1);
      });

      it("exits with code 2, when there are unused suppressions", async () => {
        const suppressions = structuredClone(SUPPRESSIONS_FILE_ALL_ERRORS);
        suppressions[SOURCE_PATH].indent.count = 10;
        fs.writeFileSync(
          SUPPRESSIONS_PATH,
          JSON.stringify(suppressions, null, 2),
        );
        const child = runESLint(ARGS_WITHOUT_SUPPRESSIONS);
        const output = await getChildOutput(child);
        assert.include(
          output.stderr,
          "There are suppressions left that do not occur anymore. To resolve this, re-run the command with `--prune-suppressions` to remove unused suppressions. To ignore unused suppressions, use `--pass-on-unpruned-suppressions`.",
        );
        await assertChildExitCode(child, 2);
      });

      it("exits with code 0, when there are unused suppressions and the --pass-on-unpruned-suppressions flag is used", async () => {
        const suppressions = structuredClone(SUPPRESSIONS_FILE_ALL_ERRORS);
        suppressions[SOURCE_PATH].indent.count = 10;
        fs.writeFileSync(
          SUPPRESSIONS_PATH,
          JSON.stringify(suppressions, null, 2),
        );
        const child = runESLint(ARGS_WITH_PASS_ON_UNPRUNED_SUPPRESSIONS);
        await assertChildExitCode(child, 0);
      });

      it("exits with code 1 if there are unsuppressed lint errors, when there are unused suppressions and the --pass-on-unpruned-suppressions flag is used (1)", async () => {
        const suppressions = structuredClone(SUPPRESSIONS_FILE_ALL_ERRORS);
        suppressions[SOURCE_PATH].indent.count = 10;
        suppressions[SOURCE_PATH]["no-sparse-arrays"].count--;
        fs.writeFileSync(
          SUPPRESSIONS_PATH,
          JSON.stringify(suppressions, null, 2),
        );
        const child = runESLint(ARGS_WITH_PASS_ON_UNPRUNED_SUPPRESSIONS);
        await assertChildExitCode(child, 1);
      });

      it("exits with code 1 if there are unsuppressed lint errors, when there are unused suppressions and the --pass-on-unpruned-suppressions flag is used (2)", async () => {
        const suppressions = structuredClone(SUPPRESSIONS_FILE_ALL_ERRORS);
        suppressions[SOURCE_PATH].indent.count = 10;
        fs.writeFileSync(
          SUPPRESSIONS_PATH,
          JSON.stringify(suppressions, null, 2),
        );
        const child = runESLint(
          ARGS_WITH_PASS_ON_UNPRUNED_SUPPRESSIONS.concat(
            "--rule=no-restricted-syntax:[error, 'IfStatement']",
          ),
        );
        await assertChildExitCode(child, 1);
      });

      it("prunes the suppressions file, when the --prune-suppressions flag is used", async () => {
        const suppressions = structuredClone(SUPPRESSIONS_FILE_ALL_ERRORS);
        suppressions[SOURCE_PATH].indent.count = 10;
        suppressions[SOURCE_PATH].ruleThatDoesntExist = { count: 1 };
        fs.writeFileSync(
          SUPPRESSIONS_PATH,
          JSON.stringify(suppressions, null, 2),
        );
        const child = runESLint(ARGS_WITH_PRUNE_SUPPRESSIONS);
        await assertChildExitCode(child, 0);
        assert.deepStrictEqual(
          JSON.parse(fs.readFileSync(SUPPRESSIONS_PATH, "utf8")),
          SUPPRESSIONS_FILE_ALL_ERRORS,
          "Suppressions file should contain the expected contents",
        );
      });

      it("prunes suppressions for files that don't exist", async () => {
        const suppressions = structuredClone(SUPPRESSIONS_FILE_ALL_ERRORS);
        const nonExistentFile =
          "tests/fixtures/suppressions/non-existent-file.js";
        suppressions[nonExistentFile] = {
          "no-undef": { count: 1 },
        };
        fs.writeFileSync(
          SUPPRESSIONS_PATH,
          JSON.stringify(suppressions, null, 2),
        );
        const child = runESLint(ARGS_WITH_PRUNE_SUPPRESSIONS);
        await assertChildExitCode(child, 0);
        assert.deepStrictEqual(
          JSON.parse(fs.readFileSync(SUPPRESSIONS_PATH, "utf8")),
          SUPPRESSIONS_FILE_ALL_ERRORS,
          "Suppressions for existing files should remain unchanged",
        );
      });
    });
  });

  describe("handling crashes", () => {
    it("prints the error message to stderr in the event of a crash", async () => {
      const child = runESLint([
        "--rule=no-restricted-syntax:[error, 'Invalid Selector [[[']",
        "--no-config-lookup",
        "Makefile.js",
      ]);
      const output = await getChildOutput(child);
      const expectedSubstring = "Syntax error in selector";
      assert.strictEqual(output.stdout, "");
      assert.include(output.stderr, expectedSubstring);
      await assertChildExitCode(child, 2);
    });

    it("prints the error message exactly once to stderr in the event of a crash", async () => {
      const child = runESLint([
        "--rule=no-restricted-syntax:[error, 'Invalid Selector [[[']",
        "--no-config-lookup",
        "Makefile.js",
      ]);
      const output = await getChildOutput(child);
      const expectedSubstring = "Syntax error in selector";
      assert.strictEqual(output.stdout, "");
      assert.include(output.stderr, expectedSubstring);
      assert.strictEqual(
        output.stderr.indexOf(expectedSubstring),
        output.stderr.lastIndexOf(expectedSubstring),
      );
      await assertChildExitCode(child, 2);
    });

    it("does not exit with zero when there is an error in the next tick", async () => {
      const config = path.join(
        __dirname,
        "../fixtures/bin/eslint.config-promise-tick-throws.js",
      );
      const file = path.join(__dirname, "../fixtures/bin/empty.js");
      const child = runESLint(["--config", config, file]);
      const output = await getChildOutput(child);
      assert.include(output.stderr, "test_error_stack");
      assert.notInclude(output.stderr, "empty.js");
      assert.notInclude(output.stdout, "empty.js");
      await assertChildExitCode(child, 2);
    });

    describe("does not print duplicate errors in the event of a crash", () => {
      it("when there is an invalid config read from a config file", async () => {
        const config = path.join(
          __dirname,
          "../fixtures/bin/eslint.config-invalid.js",
        );
        const child = runESLint(["--config", config, "conf", "tools"]);
        const output = await getChildOutput(child);
        assert.strictEqual(
          output.stderr.match(
            /A config object is using the "globals" key/gu,
          ).length,
          1,
        );
        await assertChildExitCode(child, 2);
      });

      it("when there is an error in the next tick", async () => {
        const config = path.join(
          __dirname,
          "../fixtures/bin/eslint.config-tick-throws.js",
        );
        const child = runESLint(["--config", config, "Makefile.js"]);
        const output = await getChildOutput(child);
        assert.strictEqual(
          output.stderr.match(/test_error_stack/gu).length,
          1,
        );
        await assertChildExitCode(child, 2);
      });
    });

    it("should include key information in the error message when there is an invalid config", async () => {
      const config = path.join(
        __dirname,
        "../fixtures/bin/eslint.config-invalid-key.js",
      );
      const child = runESLint(["--config", config, "conf", "tools"]);
      const output = await getChildOutput(child);
      assert.include(
        output.stderr,
        'Key "linterOptions": Key "reportUnusedDisableDirectives"',
      );
      await assertChildExitCode(child, 2);
    });

    it("prints the error message pointing to line of code", async () => {
      const invalidConfig = path.join(
        __dirname,
        "../fixtures/bin/eslint.config.js",
      );
      const child = runESLint(["--no-ignore", "-c", invalidConfig]);
      await assertChildExitCode(child, 2);
    });
  });

  describe("MCP server", () => {
    it("should start the MCP server when the --mcp flag is used", done => {
      const child = runESLint(["--mcp"]);
      let doneCalled = false;

      child.stdout.on("data", data => {
        assert.fail(`Unexpected stdout data: ${data}`);
      });

      child.stderr.on("data", data => {
        if (!doneCalled) {
          assert.match(data.toString(), /@eslint\/mcp/u);
          doneCalled = true;
          done();
        }
      });
    });
  });

  describe("Multithread mode", () => {
    it("should warn exactly once for an empty config file", async () => {
      const cwd = path.join(
        __dirname,
        "../fixtures/empty-config-file/cjs",
      );
      const child = runESLint(["--concurrency=2"], { cwd });
      const output = await getChildOutput(child);
      assert.strictEqual(
        [...output.stderr.matchAll("Running ESLint with an empty config")].length,
        1,
      );
      await assertChildExitCode(child, 0);
    });

    it("should warn exactly once for an inactive flag", async () => {
      const cwd = path.join(__dirname, "../fixtures");
      const child = runESLint(
        [
          "--concurrency=2",
          "--flag=test_only_enabled_by_default",
          "passing.js",
        ],
        { cwd },
      );
      const output = await getChildOutput(child);
      assert.strictEqual(
        [...output.stderr.matchAll("The flag 'test_only_enabled_by_default' is inactive")].length,
        1,
      );
      await assertChildExitCode(child, 0);
    });

    describe("with circular fixes", () => {
      let cwd;

      beforeEach(() => {
        cwd = fs.mkdtempSync(
          path.join(os.tmpdir(), "eslint-circular-fixes-"),
        );
      });

      afterEach(() => {
        if (cwd) {
          removeDir(cwd);
          cwd = void 0;
        }
      });

      it("should warn exactly once for a file with circular fixes", async () => {
        const configSrc = `
          export default {
            plugins: {
              "circular-fixes": {
                rules: {
                  foobar: {
                    meta: {
                      fixable: "code",
                    },
                    create(context) {
                      return {
                        'Identifier[name="foo"]'(node) {
                          context.report({
                            node,
                            message: "bar this foo",
                            fix(fixer) {
                              return fixer.replaceText(
                                node,
                                "bar",
                              );
                            },
                          });
                        },
                      };
                    },
                  },
                  barfoo: {
                    meta: {
                      fixable: "code",
                    },
                    create(context) {
                      return {
                        'Identifier[name="bar"]'(node) {
                          context.report({
                            node,
                            message: "foo this bar",
                            fix(fixer) {
                              return fixer.replaceText(
                                node,
                                "foo",
                              );
                            },
                          });
                        },
                      };
                    },
                  },
                },
              },
            },
            rules: {
              "circular-fixes/foobar": "error",
              "circular-fixes/barfoo": "error",
            },
          };
        `;
        fs.writeFileSync(path.join(cwd, "file.js"), "foo");
        fs.writeFileSync(
          path.join(cwd, "eslint.config.mjs"),
          configSrc,
        );
        const child = runESLint(
          ["--concurrency=2", "--fix", "file.js"],
          {
            cwd,
          },
        );
        const output = await getChildOutput(child);
        assert.strictEqual(
          [...output.stderr.matchAll("Circular fixes detected")].length,
          1,
        );
        await assertChildExitCode(child, 1);
      });
    });
  });

  afterEach(() => {
    forkedProcesses.forEach(child => child.kill());
    forkedProcesses.clear();
  });
});