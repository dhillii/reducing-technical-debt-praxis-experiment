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

  forkedProcesses.add(newProcess);
  return newProcess;
}

/**
 * Verifies that the exit code of a child process is 0 and the stdout matches the expected output.
 * @param {ChildProcess} child The child process
 * @param {string} expectedOutput The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stdout match the expected values.
 */
function verifyExitCodeAndOutput(child, expectedOutput) {
  const exitCodePromise = assertExitCode(child, 0);
  const stdoutPromise = getOutput(child).then(output => {
    assert.strictEqual(output.stdout.trim(), expectedOutput);
    assert.strictEqual(output.stderr, "");
  });

  return Promise.all([exitCodePromise, stdoutPromise]);
}

/**
 * Verifies that the exit code of a child process is 1 and the stdout matches the expected output.
 * @param {ChildProcess} child The child process
 * @param {string} expectedOutput The expected stdout output
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stdout match the expected values.
 */
function verifyExitCodeAndOutputForError(child, expectedOutput) {
  const exitCodePromise = assertExitCode(child, 1);
  const stdoutPromise = getOutput(child).then(output => {
    assert.strictEqual(output.stdout.trim(), expectedOutput);
    assert.strictEqual(output.stderr, "");
  });

  return Promise.all([exitCodePromise, stdoutPromise]);
}

/**
 * Verifies that the exit code of a child process is 2 and the stderr matches the expected output.
 * @param {ChildProcess} child The child process
 * @param {string} expectedOutput The expected stderr output
 * @returns {Promise<void>} A Promise that fulfills if the exit code and stderr match the expected values.
 */
function verifyExitCodeAndErrorOutput(child, expectedOutput) {
  const exitCodePromise = assertExitCode(child, 2);
  const stderrPromise = getOutput(child).then(output => {
    assert.include(output.stderr, expectedOutput);
  });

  return Promise.all([exitCodePromise, stderrPromise]);
}

/**
 * Writes input to the stdin of a child process and closes it.
 * @param {ChildProcess} child The child process
 * @param {string} input The input to write to stdin
 */
function writeInputToStdin(child, input) {
  child.stdin.write(input);
  child.stdin.end();
}

/**
 * Creates a temporary file with the given content.
 * @param {string} content The content to write to the temporary file
 * @returns {string} The path to the temporary file
 */
function createTempFile(content) {
  const tempFilePath = `${path.join(
    os.tmpdir(),
    `eslint-temp-${Date.now()}.js`,
  )}`;
  fs.writeFileSync(tempFilePath, content);
  return tempFilePath;
}

/**
 * Removes a file.
 * @param {string} filePath The path to the file to remove
 */
function removeFile(filePath) {
  fs.unlinkSync(filePath);
}

/**
 * Copies a file.
 * @param {string} sourcePath The path to the source file
 * @param {string} destinationPath The path to the destination file
 */
function copyFile(sourcePath, destinationPath) {
  fs.copyFileSync(sourcePath, destinationPath);
}

/**
 * Creates a directory.
 * @param {string} directoryPath The path to the directory to create
 */
function createDirectory(directoryPath) {
  fs.mkdirSync(directoryPath);
}

/**
 * Removes a directory and all its contents.
 * @param {string} directoryPath The path to the directory to remove
 */
function removeDirectory(directoryPath) {
  fs.rmSync(directoryPath, {
    recursive: true,
    force: true,
  });
}

/**
 * Reads the contents of a file.
 * @param {string} filePath The path to the file to read
 * @returns {string} The contents of the file
 */
function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Writes to a file.
 * @param {string} filePath The path to the file to write to
 * @param {string} content The content to write to the file
 */
function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content);
}

/**
 * Checks if a file exists.
 * @param {string} filePath The path to the file to check
 * @returns {boolean} True if the file exists, false otherwise
 */
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Parses JSON from a file.
 * @param {string} filePath The path to the file to parse
 * @returns {Object} The parsed JSON object
 */
function parseJsonFromFile(filePath) {
  return JSON.parse(readFile(filePath));
}

/**
 * Writes JSON to a file.
 * @param {string} filePath The path to the file to write to
 * @param {Object} json The JSON object to write
 */
function writeJsonToFile(filePath, json) {
  writeFile(filePath, JSON.stringify(json, null, 2));
}

/**
 * Clones an object.
 * @param {Object} object The object to clone
 * @returns {Object} The cloned object
 */
function cloneObject(object) {
  return structuredClone(object);
}

/**
 * Checks if a property exists in an object.
 * @param {Object} object The object to check
 * @param {string} property The property to check for
 * @returns {boolean} True if the property exists, false otherwise
 */
function propertyExists(object, property) {
  return property in object;
}

/**
 * Checks if a value is not null or undefined.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is not null or undefined, false otherwise
 */
function valueExists(value) {
  return value != null;
}

/**
 * Checks if a value is an array.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array, false otherwise
 */
function isArray(value) {
  return Array.isArray(value);
}

/**
 * Checks if a value is a string.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string, false otherwise
 */
function isString(value) {
  return typeof value === "string";
}

/**
 * Checks if a value is a number.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a number, false otherwise
 */
function isNumber(value) {
  return typeof value === "number";
}

/**
 * Checks if a value is an object.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object, false otherwise
 */
function isObject(value) {
  return typeof value === "object";
}

/**
 * Checks if a value is a boolean.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean, false otherwise
 */
function isBoolean(value) {
  return typeof value === "boolean";
}

/**
 * Checks if a value is a function.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function, false otherwise
 */
function isFunction(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is null or undefined.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is null or undefined, false otherwise
 */
function isNullOrUndefined(value) {
  return value == null;
}

/**
 * Checks if a value is not null or undefined.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is not null or undefined, false otherwise
 */
function isNotNullOrUndefined(value) {
  return value != null;
}

/**
 * Checks if a value is an instance of a class.
 * @param {any} value The value to check
 * @param {Function} classConstructor The class constructor to check against
 * @returns {boolean} True if the value is an instance of the class, false otherwise
 */
function isInstanceOf(value, classConstructor) {
  return value instanceof classConstructor;
}

/**
 * Checks if a value is a primitive value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive value, false otherwise
 */
function isPrimitive(value) {
  return (
    isNullOrUndefined(value) ||
    isBoolean(value) ||
    isNumber(value) ||
    isString(value)
  );
}

/**
 * Checks if a value is a non-primitive value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-primitive value, false otherwise
 */
function isNonPrimitive(value) {
  return !isPrimitive(value);
}

/**
 * Checks if two values are equal.
 * @param {any} value1 The first value to compare
 * @param {any} value2 The second value to compare
 * @returns {boolean} True if the values are equal, false otherwise
 */
function areEqual(value1, value2) {
  return value1 === value2;
}

/**
 * Checks if two values are not equal.
 * @param {any} value1 The first value to compare
 * @param {any} value2 The second value to compare
 * @returns {boolean} True if the values are not equal, false otherwise
 */
function areNotEqual(value1, value2) {
  return value1 !== value2;
}

/**
 * Checks if two values are strictly equal.
 * @param {any} value1 The first value to compare
 * @param {any} value2 The second value to compare
 * @returns {boolean} True if the values are strictly equal, false otherwise
 */
function areStrictlyEqual(value1, value2) {
  return value1 === value2;
}

/**
 * Checks if two values are not strictly equal.
 * @param {any} value1 The first value to compare
 * @param {any} value2 The second value to compare
 * @returns {boolean} True if the values are not strictly equal, false otherwise
 */
function areNotStrictlyEqual(value1, value2) {
  return value1 !== value2;
}

/**
 * Checks if a value is greater than another value.
 * @param {any} value1 The first value to compare
 * @param {any} value2 The second value to compare
 * @returns {boolean} True if the first value is greater than the second value, false otherwise
 */
function isGreaterThan(value1, value2) {
  return value1 > value2;
}

/**
 * Checks if a value is less than another value.
 * @param {any} value1 The first value to compare
 * @param {any} value2 The second value to compare
 * @returns {boolean} True if the first value is less than the second value, false otherwise
 */
function isLessThan(value1, value2) {
  return value1 < value2;
}

/**
 * Checks if a value is greater than or equal to another value.
 * @param {any} value1 The first value to compare
 * @param {any} value2 The second value to compare
 * @returns {boolean} True if the first value is greater than or equal to the second value, false otherwise
 */
function isGreaterThanOrEqualTo(value1, value2) {
  return value1 >= value2;
}

/**
 * Checks if a value is less than or equal to another value.
 * @param {any} value1 The first value to compare
 * @param {any} value2 The second value to compare
 * @returns {boolean} True if the first value is less than or equal to the second value, false otherwise
 */
function isLessThanOrEqualTo(value1, value2) {
  return value1 <= value2;
}

/**
 * Checks if a string includes another string.
 * @param {string} string The string to check
 * @param {string} substring The substring to check for
 * @returns {boolean} True if the string includes the substring, false otherwise
 */
function includesString(string, substring) {
  return string.includes(substring);
}

/**
 * Checks if a string starts with another string.
 * @param {string} string The string to check
 * @param {string} substring The substring to check for
 * @returns {boolean} True if the string starts with the substring, false otherwise
 */
function startsWithString(string, substring) {
  return string.startsWith(substring);
}

/**
 * Checks if a string ends with another string.
 * @param {string} string The string to check
 * @param {string} substring The substring to check for
 * @returns {boolean} True if the string ends with the substring, false otherwise
 */
function endsWithString(string, substring) {
  return string.endsWith(substring);
}

/**
 * Checks if a string matches a regular expression.
 * @param {string} string The string to check
 * @param {RegExp} regex The regular expression to check against
 * @returns {boolean} True if the string matches the regular expression, false otherwise
 */
function matchesRegex(string, regex) {
  return regex.test(string);
}

/**
 * Checks if a string does not match a regular expression.
 * @param {string} string The string to check
 * @param {RegExp} regex The regular expression to check against
 * @returns {boolean} True if the string does not match the regular expression, false otherwise
 */
function doesNotMatchRegex(string, regex) {
  return !regex.test(string);
}

/**
 * Checks if an array includes a value.
 * @param {any[]} array The array to check
 * @param {any} value The value to check for
 * @returns {boolean} True if the array includes the value, false otherwise
 */
function includesValue(array, value) {
  return array.includes(value);
}

/**
 * Checks if an array does not include a value.
 * @param {any[]} array The array to check
 * @param {any} value The value to check for
 * @returns {boolean} True if the array does not include the value, false otherwise
 */
function doesNotIncludeValue(array, value) {
  return !array.includes(value);
}

/**
 * Checks if an object has a property.
 * @param {Object} object The object to check
 * @param {string} property The property to check for
 * @returns {boolean} True if the object has the property, false otherwise
 */
function hasProperty(object, property) {
  return property in object;
}

/**
 * Checks if an object does not have a property.
 * @param {Object} object The object to check
 * @param {string} property The property to check for
 * @returns {boolean} True if the object does not have the property, false otherwise
 */
function doesNotHaveProperty(object, property) {
  return !(property in object);
}

/**
 * Checks if an object's property is equal to a value.
 * @param {Object} object The object to check
 * @param {string} property The property to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the object's property is equal to the value, false otherwise
 */
function propertyIsEqual(object, property, value) {
  return object[property] === value;
}

/**
 * Checks if an object's property is not equal to a value.
 * @param {Object} object The object to check
 * @param {string} property The property to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the object's property is not equal to the value, false otherwise
 */
function propertyIsNotEqual(object, property, value) {
  return object[property] !== value;
}

/**
 * Checks if an object's property is strictly equal to a value.
 * @param {Object} object The object to check
 * @param {string} property The property to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the object's property is strictly equal to the value, false otherwise
 */
function propertyIsStrictlyEqual(object, property, value) {
  return object[property] === value;
}

/**
 * Checks if an object's property is not strictly equal to a value.
 * @param {Object} object The object to check
 * @param {string} property The property to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the object's property is not strictly equal to the value, false otherwise
 */
function propertyIsNotStrictlyEqual(object, property, value) {
  return object[property] !== value;
}

/**
 * Checks if an object's property is greater than a value.
 * @param {Object} object The object to check
 * @param {string} property The property to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the object's property is greater than the value, false otherwise
 */
function propertyIsGreaterThan(object, property, value) {
  return object[property] > value;
}

/**
 * Checks if an object's property is less than a value.
 * @param {Object} object The object to check
 * @param {string} property The property to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the object's property is less than the value, false otherwise
 */
function propertyIsLessThan(object, property, value) {
  return object[property] < value;
}

/**
 * Checks if an object's property is greater than or equal to a value.
 * @param {Object} object The object to check
 * @param {string} property The property to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the object's property is greater than or equal to the value, false otherwise
 */
function propertyIsGreaterThanOrEqualTo(object, property, value) {
  return object[property] >= value;
}

/**
 * Checks if an object's property is less than or equal to a value.
 * @param {Object} object The object to check
 * @param {string} property The property to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the object's property is less than or equal to the value, false otherwise
 */
function propertyIsLessThanOrEqualTo(object, property, value) {
  return object[property] <= value;
}

/**
 * Checks if an array's element is equal to a value.
 * @param {any[]} array The array to check
 * @param {number} index The index of the element to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the array's element is equal to the value, false otherwise
 */
function elementIsEqual(array, index, value) {
  return array[index] === value;
}

/**
 * Checks if an array's element is not equal to a value.
 * @param {any[]} array The array to check
 * @param {number} index The index of the element to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the array's element is not equal to the value, false otherwise
 */
function elementIsNotEqual(array, index, value) {
  return array[index] !== value;
}

/**
 * Checks if an array's element is strictly equal to a value.
 * @param {any[]} array The array to check
 * @param {number} index The index of the element to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the array's element is strictly equal to the value, false otherwise
 */
function elementIsStrictlyEqual(array, index, value) {
  return array[index] === value;
}

/**
 * Checks if an array's element is not strictly equal to a value.
 * @param {any[]} array The array to check
 * @param {number} index The index of the element to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the array's element is not strictly equal to the value, false otherwise
 */
function elementIsNotStrictlyEqual(array, index, value) {
  return array[index] !== value;
}

/**
 * Checks if an array's element is greater than a value.
 * @param {any[]} array The array to check
 * @param {number} index The index of the element to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the array's element is greater than the value, false otherwise
 */
function elementIsGreaterThan(array, index, value) {
  return array[index] > value;
}

/**
 * Checks if an array's element is less than a value.
 * @param {any[]} array The array to check
 * @param {number} index The index of the element to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the array's element is less than the value, false otherwise
 */
function elementIsLessThan(array, index, value) {
  return array[index] < value;
}

/**
 * Checks if an array's element is greater than or equal to a value.
 * @param {any[]} array The array to check
 * @param {number} index The index of the element to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the array's element is greater than or equal to the value, false otherwise
 */
function elementIsGreaterThanOrEqualTo(array, index, value) {
  return array[index] >= value;
}

/**
 * Checks if an array's element is less than or equal to a value.
 * @param {any[]} array The array to check
 * @param {number} index The index of the element to check
 * @param {any} value The value to check against
 * @returns {boolean} True if the array's element is less than or equal to the value, false otherwise
 */
function elementIsLessThanOrEqualTo(array, index, value) {
  return array[index] <= value;
}

/**
 * Checks if a value is in an array.
 * @param {any[]} array The array to check
 * @param {any} value The value to check for
 * @returns {boolean} True if the value is in the array, false otherwise
 */
function valueInArray(array, value) {
  return array.includes(value);
}

/**
 * Checks if a value is not in an array.
 * @param {any[]} array The array to check
 * @param {any} value The value to check for
 * @returns {boolean} True if the value is not in the array, false otherwise
 */
function valueNotInArray(array, value) {
  return !array.includes(value);
}

/**
 * Checks if a value is in an object.
 * @param {Object} object The object to check
 * @param {any} value The value to check for
 * @returns {boolean} True if the value is in the object, false otherwise
 */
function valueInObject(object, value) {
  return Object.values(object).includes(value);
}

/**
 * Checks if a value is not in an object.
 * @param {Object} object The object to check
 * @param {any} value The value to check for
 * @returns {boolean} True if the value is not in the object, false otherwise
 */
function valueNotInObject(object, value) {
  return !Object.values(object).includes(value);
}

/**
 * Checks if a key is in an object.
 * @param {Object} object The object to check
 * @param {string} key The key to check for
 * @returns {boolean} True if the key is in the object, false otherwise
 */
function keyInObject(object, key) {
  return key in object;
}

/**
 * Checks if a key is not in an object.
 * @param {Object} object The object to check
 * @param {string} key The key to check for
 * @returns {boolean} True if the key is not in the object, false otherwise
 */
function keyNotInObject(object, key) {
  return !(key in object);
}

/**
 * Checks if a value is a key in an object.
 * @param {Object} object The object to check
 * @param {any} value The value to check for
 * @returns {boolean} True if the value is a key in the object, false otherwise
 */
function valueIsKeyInObject(object, value) {
  return Object.keys(object).includes(value);
}

/**
 * Checks if a value is not a key in an object.
 * @param {Object} object The object to check
 * @param {any} value The value to check for
 * @returns {boolean} True if the value is not a key in the object, false otherwise
 */
function valueIsNotKeyInObject(object, value) {
  return !Object.keys(object).includes(value);
}

/**
 * Checks if a value is a value in an object.
 * @param {Object} object The object to check
 * @param {any} value The value to check for
 * @returns {boolean} True if the value is a value in the object, false otherwise
 */
function valueIsValueInObject(object, value) {
  return Object.values(object).includes(value);
}

/**
 * Checks if a value is not a value in an object.
 * @param {Object} object The object to check
 * @param {any} value The value to check for
 * @returns {boolean} True if the value is not a value in the object, false otherwise
 */
function valueIsNotValueInObject(object, value) {
  return !Object.values(object).includes(value);
}

/**
 * Checks if an object is empty.
 * @param {Object} object The object to check
 * @returns {boolean} True if the object is empty, false otherwise
 */
function objectIsEmpty(object) {
  return Object.keys(object).length === 0;
}

/**
 * Checks if an object is not empty.
 * @param {Object} object The object to check
 * @returns {boolean} True if the object is not empty, false otherwise
 */
function objectIsNotEmpty(object) {
  return Object.keys(object).length > 0;
}

/**
 * Checks if an array is empty.
 * @param {any[]} array The array to check
 * @returns {boolean} True if the array is empty, false otherwise
 */
function arrayIsEmpty(array) {
  return array.length === 0;
}

/**
 * Checks if an array is not empty.
 * @param {any[]} array The array to check
 * @returns {boolean} True if the array is not empty, false otherwise
 */
function arrayIsNotEmpty(array) {
  return array.length > 0;
}

/**
 * Checks if a string is empty.
 * @param {string} string The string to check
 * @returns {boolean} True if the string is empty, false otherwise
 */
function stringIsEmpty(string) {
  return string.length === 0;
}

/**
 * Checks if a string is not empty.
 * @param {string} string The string to check
 * @returns {boolean} True if the string is not empty, false otherwise
 */
function stringIsNotEmpty(string) {
  return string.length > 0;
}

/**
 * Checks if a value is NaN.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is NaN, false otherwise
 */
function isNaN(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is not NaN.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is not NaN, false otherwise
 */
function isNotNaN(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is a finite number.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite number, false otherwise
 */
function isFiniteNumber(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is not a finite number.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is not a finite number, false otherwise
 */
function isNotFiniteNumber(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer, false otherwise
 */
function isInteger(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is not an integer.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is not an integer, false otherwise
 */
function isNotInteger(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer, false otherwise
 */
function isSafeInteger(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is not a safe integer.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is not a safe integer, false otherwise
 */
function isNotSafeInteger(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive number.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive number, false otherwise
 */
function isPositiveNumber(value) {
  return value > 0;
}

/**
 * Checks if a value is not a positive number.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is not a positive number, false otherwise
 */
function isNotPositiveNumber(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative number.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative number, false otherwise
 */
function isNegativeNumber(value) {
  return value < 0;
}

/**
 * Checks if a value is not a negative number.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is not a negative number, false otherwise
 */
function isNotNegativeNumber(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative number.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative number, false otherwise
 */
function isNonNegativeNumber(value) {
  return value >= 0;
}

/**
 * Checks if a value is not a non-negative number.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is not a non-negative number, false otherwise
 */
function isNotNonNegativeNumber(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive number.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive number, false otherwise
 */
function isNonPositiveNumber(value) {
  return value <= 0;
}

/**
 * Checks if a value is not a non-positive number.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is not a non-positive number, false otherwise
 */
function isNotNonPositiveNumber(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero, false otherwise
 */
function isZero(value) {
  return value === 0;
}

/**
 * Checks if a value is not a zero.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is not a zero, false otherwise
 */
function isNotZero(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthy(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsy(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthy(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsy(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthy(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsy(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthy(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsy(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthy(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsy(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthy(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsy(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthy(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsy(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthy(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsy(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthy(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsy(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthy(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsy(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthy(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsy(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthy(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsy(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthy(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsy(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthy(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsy(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthy(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsy(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthy(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsy(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthy(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsy(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthy(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsy(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthy(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsy(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthy(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsy(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValueValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**
 * Checks if a value is an Infinity truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity truthy value, false otherwise
 */
function isInfinityTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an Infinity falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an Infinity falsy value, false otherwise
 */
function isInfinityFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite truthy value, false otherwise
 */
function isFiniteTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isFinite(value);
}

/**
 * Checks if a value is a finite falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a finite falsy value, false otherwise
 */
function isFiniteFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isFinite(value);
}

/**
 * Checks if a value is an integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer truthy value, false otherwise
 */
function isIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isInteger(value);
}

/**
 * Checks if a value is an integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an integer falsy value, false otherwise
 */
function isIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isInteger(value);
}

/**
 * Checks if a value is a safe integer truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer truthy value, false otherwise
 */
function isSafeIntegerTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isSafeInteger(value);
}

/**
 * Checks if a value is a safe integer falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a safe integer falsy value, false otherwise
 */
function isSafeIntegerFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isSafeInteger(value);
}

/**
 * Checks if a value is a positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive truthy value, false otherwise
 */
function isPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a positive falsy value, false otherwise
 */
function isPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative truthy value, false otherwise
 */
function isNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a negative falsy value, false otherwise
 */
function isNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative truthy value, false otherwise
 */
function isNonNegativeTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value >= 0;
}

/**
 * Checks if a value is a non-negative falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-negative falsy value, false otherwise
 */
function isNonNegativeFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value < 0;
}

/**
 * Checks if a value is a non-positive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive truthy value, false otherwise
 */
function isNonPositiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a non-positive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a non-positive falsy value, false otherwise
 */
function isNonPositiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a zero truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero truthy value, false otherwise
 */
function isZeroTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === 0;
}

/**
 * Checks if a value is a zero falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a zero falsy value, false otherwise
 */
function isZeroFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== 0;
}

/**
 * Checks if a value is a truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a truthy value, false otherwise
 */
function isTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Boolean(value);
}

/**
 * Checks if a value is a falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a falsy value, false otherwise
 */
function isFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Boolean(value);
}

/**
 * Checks if a value is a primitive truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive truthy value, false otherwise
 */
function isPrimitiveTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === true ||
    value === 1 ||
    value === "true" ||
    value === "1" ||
    value === ""
  );
}

/**
 * Checks if a value is a primitive falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a primitive falsy value, false otherwise
 */
function isPrimitiveFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return (
    value === false ||
    value === 0 ||
    value === "false" ||
    value === "0" ||
    value === ""
  );
}

/**
 * Checks if a value is a boolean truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean truthy value, false otherwise
 */
function isBooleanTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === true;
}

/**
 * Checks if a value is a boolean falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a boolean falsy value, false otherwise
 */
function isBooleanFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === false;
}

/**
 * Checks if a value is a numeric truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric truthy value, false otherwise
 */
function isNumericTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value > 0;
}

/**
 * Checks if a value is a numeric falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a numeric falsy value, false otherwise
 */
function isNumericFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value <= 0;
}

/**
 * Checks if a value is a string truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string truthy value, false otherwise
 */
function isStringTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== "";
}

/**
 * Checks if a value is a string falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a string falsy value, false otherwise
 */
function isStringFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === "";
}

/**
 * Checks if a value is an object truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object truthy value, false otherwise
 */
function isObjectTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null && typeof value === "object";
}

/**
 * Checks if a value is an object falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an object falsy value, false otherwise
 */
function isObjectFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null || typeof value !== "object";
}

/**
 * Checks if a value is an array truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array truthy value, false otherwise
 */
function isArrayTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Checks if a value is an array falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an array falsy value, false otherwise
 */
function isArrayFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Array.isArray(value) || value.length === 0;
}

/**
 * Checks if a value is a function truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function truthy value, false otherwise
 */
function isFunctionTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value === "function";
}

/**
 * Checks if a value is a function falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a function falsy value, false otherwise
 */
function isFunctionFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return typeof value !== "function";
}

/**
 * Checks if a value is a null truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null truthy value, false otherwise
 */
function isNullTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === null;
}

/**
 * Checks if a value is a null falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a null falsy value, false otherwise
 */
function isNullFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== null;
}

/**
 * Checks if a value is an undefined truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined truthy value, false otherwise
 */
function isUndefinedTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value === undefined;
}

/**
 * Checks if a value is an undefined falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is an undefined falsy value, false otherwise
 */
function isUndefinedFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return value !== undefined;
}

/**
 * Checks if a value is a NaN truthy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN truthy value, false otherwise
 */
function isNaNTruthyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return Number.isNaN(value);
}

/**
 * Checks if a value is a NaN falsy value.
 * @param {any} value The value to check
 * @returns {boolean} True if the value is a NaN falsy value, false otherwise
 */
function isNaNFalsyValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValueValue(value) {
  return !Number.isNaN(value);
}

/**