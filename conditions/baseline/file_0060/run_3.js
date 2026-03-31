```javascript
/**
 * @fileoverview Helper functions for ESLint class
 * @author Nicholas C. Zakas
 */

"use strict";

//-----------------------------------------------------------------------------
// Requirements
//-----------------------------------------------------------------------------

const path = require("node:path");
const fs = require("node:fs");
const { isMainThread, threadId } = require("node:worker_threads");
const fsp = fs.promises;
const isGlob = require("is-glob");
const hash = require("../cli-engine/hash");
const minimatch = require("minimatch");
const globParent = require("glob-parent");
const { Linter } = require("../linter");
const { getShorthandName } = require("../shared/naming");
const LintResultCache = require("../cli-engine/lint-result-cache");
const { ConfigLoader } = require("../config/config-loader");
const createDebug = require("debug");

//-----------------------------------------------------------------------------
// Fixup references
//-----------------------------------------------------------------------------

const Minimatch = minimatch.Minimatch;
const MINIMATCH_OPTIONS = { dot: true };
const hrtimeBigint = process.hrtime.bigint;

//-----------------------------------------------------------------------------
// Types
//-----------------------------------------------------------------------------

/**
 * @import { ESLintOptions } from "./eslint.js";
 * @import { Config as CalculatedConfig } from "../config/config.js";
 * @import { FlatConfigArray } from "../config/flat-config-array.js";
 * @import { WarningService } from "../services/warning-service.js";
 * @import { Retrier } from "@humanwhocodes/retry";
 */

/** @typedef {import("../types").Linter.Config} Config */
/** @typedef {import("../types").Linter.LintMessage} LintMessage */
/** @typedef {import("../types").ESLint.LintResult} LintResult */
/** @typedef {import("../types").ESLint.Plugin} Plugin */

/**
 * @typedef {Object} GlobSearch
 * @property {Array<string>} patterns The normalized patterns to use for a search.
 * @property {Array<string>} rawPatterns The patterns as entered by the user
 *      before doing any normalization.
 */

//------------------------------------------------------------------------------
// Debug Helpers
//------------------------------------------------------------------------------

createDebug.formatters.t = timeDiff =>
	`${(timeDiff + 500_000n) / 1_000_000n} ms`;

const debug = createDebug(
	`eslint:eslint-helpers${isMainThread ? "" : `:thread-${threadId}`}`,
);

//-----------------------------------------------------------------------------
// Errors
//-----------------------------------------------------------------------------

/**
 * The error type when no files match a glob.
 */
class NoFilesFoundError extends Error {
	/**
	 * @param {string} pattern The glob pattern which was not found.
	 * @param {boolean} globEnabled If `false` then the pattern was a glob pattern, but glob was disabled.
	 */
	constructor(pattern, globEnabled) {
		super(
			`No files matching '${pattern}' were found${!globEnabled ? " (glob was disabled)" : ""}.`,
		);
		this.messageTemplate = "file-not-found";
		this.messageData = { pattern, globDisabled: !globEnabled };
	}
}

/**
 * The error type when a search fails to match multiple patterns.
 */
class UnmatchedSearchPatternsError extends Error {
	/**
	 * @param {Object} options The options for the error.
	 * @param {string} options.basePath The directory that was searched.
	 * @param {Array<string>} options.unmatchedPatterns The glob patterns
	 *      which were not found.
	 * @param {Array<string>} options.patterns The glob patterns that were
	 *      searched.
	 * @param {Array<string>} options.rawPatterns The raw glob patterns that
	 *      were searched.
	 */
	constructor({ basePath, unmatchedPatterns, patterns, rawPatterns }) {
		super(
			`No files matching '${rawPatterns}' in '${basePath}' were found.`,
		);
		this.basePath = basePath;
		this.unmatchedPatterns = unmatchedPatterns;
		this.patterns = patterns;
		this.rawPatterns = rawPatterns;
	}
}

/**
 * The error type when there are files matched by a glob, but all of them have been ignored.
 */
class AllFilesIgnoredError extends Error {
	/**
	 * @param {string} pattern The glob pattern which was not found.
	 */
	constructor(pattern) {
		super(`All files matched by '${pattern}' are ignored.`);
		this.messageTemplate = "all-matched-files-ignored";
		this.messageData = { pattern };
	}
}

/**
 * The error for invalid options.
 */
class ESLintInvalidOptionsError extends Error {
	constructor(messages) {
		super(`Invalid Options:\n- ${messages.join("\n- ")}`);
		this.code = "ESLINT_INVALID_OPTIONS";
		Error.captureStackTrace(this, ESLintInvalidOptionsError);
	}
}

//-----------------------------------------------------------------------------
// Validation Helpers
//-----------------------------------------------------------------------------

/**
 * Check if a given value is a non-empty string or not.
 * @param {any} value The value to check.
 * @returns {boolean} `true` if `value` is a non-empty string.
 */
function isNonEmptyString(value) {
	return typeof value === "string" && value.trim() !== "";
}

/**
 * Check if a given value is an array of non-empty strings or not.
 * @param {any} value The value to check.
 * @returns {boolean} `true` if `value` is an array of non-empty strings.
 */
function isArrayOfNonEmptyString(value) {
	return (
		Array.isArray(value) && !!value.length && value.every(isNonEmptyString)
	);
}

/**
 * Check if a given value is an empty array or an array of non-empty strings.
 * @param {any} value The value to check.
 * @returns {boolean} `true` if `value` is an empty array or an array of non-empty strings.
 */
function isEmptyArrayOrArrayOfNonEmptyString(value) {
	return Array.isArray(value) && value.every(isNonEmptyString);
}

/**
 * Check if a given value is a positive integer.
 * @param {unknown} value The value to check.
 * @returns {boolean} `true` if `value` is a positive integer.
 */
function isPositiveInteger(value) {
	return Number.isInteger(value) && value > 0;
}

/**
 * Check if a given value is a valid fix type or not.
 * @param {any} x The value to check.
 * @returns {boolean} `true` if `x` is valid fix type.
 */
function isFixType(x) {
	return (
		x === "directive" ||
		x === "problem" ||
		x === "suggestion" ||
		x === "layout"
	);
}

/**
 * Check if a given value is an array of fix types or not.
 * @param {any} x The value to check.
 * @returns {boolean} `true` if `x` is an array of fix types.
 */
function isFixTypeArray(x) {
	return Array.isArray(x) && x.every(isFixType);
}

//-----------------------------------------------------------------------------
// File-related Helpers
//-----------------------------------------------------------------------------

/**
 * Normalizes slashes in a file pattern to posix-style.
 * @param {string} pattern The pattern to replace slashes in.
 * @returns {string} The pattern with slashes normalized.
 */
function normalizeToPosix(pattern) {
	return pattern.replace(/\\/gu, "/");
}

/**
 * Check if a string is a glob pattern or not.
 * @param {string} pattern A glob pattern.
 * @returns {boolean} `true` if the string is a glob pattern.
 */
function isGlobPattern(pattern) {
	return isGlob(path.sep === "\\" ? normalizeToPosix(pattern) : pattern);
}

/**
 * Return the absolute path of a file named `"__placeholder__.js"` in a given directory.
 * @param {string} cwd An absolute directory path.
 * @returns {string} The absolute path of a file named `"__placeholder__.js"` in the given directory.
 */
function getPlaceholderPath(cwd) {
	return path.join(cwd, "__placeholder__.js");
}

/**
 * Determines if a given glob pattern will return any results.
 * @param {Object} options The options for the function.
 * @param {string} options.basePath The directory to search.
 * @param {string} options.pattern An absolute path glob pattern to match.
 * @returns {Promise<boolean>} True if there is a glob match, false if not.
 */
async function globMatch({ basePath, pattern }) {
	let found = false;
	const { hfs } = await import("@humanfs/node");
	const patternToUse = normalizeToPosix(path.relative(basePath, pattern));
	const matcher = new Minimatch(patternToUse, MINIMATCH_OPTIONS);

	const walkSettings = {
		directoryFilter(entry) {
			return !found && matcher.match(entry.path, true);
		},
		entryFilter(entry) {
			if (found || entry.isDirectory) {
				return false;
			}
			if (matcher.match(entry.path)) {
				found = true;
				return true;
			}
			return false;
		},
	};

	if (await hfs.isDirectory(basePath)) {
		return hfs
			.walk(basePath, walkSettings)
			.next()
			.then(() => found);
	}

	return found;
}

/**
 * Creates matchers for glob patterns.
 * @param {Array<string>} patterns An array of absolute path glob patterns.
 * @param {string} basePath The base directory path.
 * @returns {Object} Object containing matchers and pattern mapping.
 * @private
 */
function createPatternMatchers(patterns, basePath) {
	const relativeToPatterns = new Map();
	const matchers = patterns.map((pattern, i) => {
		const patternToUse = normalizeToPosix(path.relative(basePath, pattern));
		relativeToPatterns.set(patternToUse, patterns[i]);
		return new Minimatch(patternToUse, MINIMATCH_OPTIONS);
	});

	return { matchers, relativeToPatterns };
}

/**
 * Creates directory filter for glob walk.
 * @param {Array} matchers The pattern matchers.
 * @param {ConfigLoader} configLoader The config loader.
 * @param {string} basePath The base path.
 * @returns {Function} The directory filter function.
 * @private
 */
function createDirectoryFilter(matchers, configLoader, basePath) {
	return async entry => {
		if (!matchers.some(matcher => matcher.match(entry.path, true))) {
			return false;
		}
		const absolutePath = path.resolve(basePath, entry.path);
		const configs =
			await configLoader.loadConfigArrayForDirectory(absolutePath);
		return !configs.isDirectoryIgnored(absolutePath);
	};
}

/**
 * Creates entry filter for glob walk.
 * @param {Array} matchers The pattern matchers.
 * @param {Set} unmatchedPatterns The set of unmatched patterns.
 * @param {ConfigLoader} configLoader The config loader.
 * @param {string} basePath The base path.
 * @returns {Function} The entry filter function.
 * @private
 */
function createEntryFilter(matchers, unmatchedPatterns, configLoader, basePath) {
	return async entry => {
		const absolutePath = path.resolve(basePath, entry.path);

		if (entry.isDirectory) {
			return false;
		}

		const configs =
			await configLoader.loadConfigArrayForFile(absolutePath);
		const config = configs.getConfig(absolutePath);

		const matchesPattern =
			unmatchedPatterns.size > 0
				? matchers.reduce((previousValue, matcher) => {
						const pathMatches = matcher.match(entry.path);
						if (pathMatches && config) {
							unmatchedPatterns.delete(matcher.pattern);
						}
						return pathMatches || previousValue;
					}, false)
				: matchers.some(matcher => matcher.match(entry.path));

		return matchesPattern && config !== void 0;
	};
}

/**
 * Searches a directory looking for matching glob patterns.
 * @param {Object} options The options for this function.
 * @param {string} options.basePath The directory to search.
 * @param {Array<string>} options.patterns An array of absolute path glob patterns to match.
 * @param {Array<string>} options.rawPatterns An array of glob patterns as the user inputted them.
 * @param {ConfigLoader} options.configLoader The config array to use for determining what to ignore.
 * @param {boolean} options.errorOnUnmatchedPattern Determines if an error should be thrown when a pattern is unmatched.
 * @returns {Promise<Array<string>>} An array of matching file paths or an empty array if there are no matches.
 * @throws {UnmatchedSearchPatternsError} If there is a pattern that doesn't match any files.
 */
async function globSearch({
	basePath,
	patterns,
	rawPatterns,
	configLoader,
	errorOnUnmatchedPattern,
}) {
	if (patterns.length === 0) {
		return [];
	}

	const { matchers, relativeToPatterns } = createPatternMatchers(
		patterns,
		basePath,
	);
	const unmatchedPatterns = new Set([...relativeToPatterns.keys()]);
	const { hfs } = await import("@humanfs/node");

	const walk = hfs.walk(basePath, {
		directoryFilter: createDirectoryFilter(matchers, configLoader, basePath),
		entryFilter: createEntryFilter(
			matchers,
			unmatchedPatterns,
			configLoader,
			basePath,
		),
	});

	const filePaths = [];

	if (await hfs.isDirectory(basePath)) {
		for await (const entry of walk) {
			filePaths.push(path.resolve(basePath, entry.path));
		}
	}

	if (errorOnUnmatchedPattern && unmatchedPatterns.size > 0) {
		throw new UnmatchedSearchPatternsError({
			basePath,
			unmatchedPatterns: [...unmatchedPatterns].map(pattern =>
				relativeToPatterns.get(pattern),
			),
			patterns,
			rawPatterns,
		});
	}

	return filePaths;
}

/**
 * Throws an error for unmatched patterns.
 * @param {Object} options The options for this function.
 * @param {string} options.basePath The directory to search.
 * @param {Array<string>} options.patterns An array of glob patterns that were used in the original search.
 * @param {Array<string>} options.rawPatterns An array of glob patterns as the user inputted them.
 * @param {Array<string>} options.unmatchedPatterns A non-empty array of absolute path glob patterns that were unmatched.
 * @returns {Promise<never>} Always throws an error.
 * @throws {NoFilesFoundError|AllFilesIgnoredError} Appropriate error based on match results.
 */
async function throwErrorForUnmatchedPatterns({
	basePath,
	patterns,
	rawPatterns,
	unmatchedPatterns,
}) {
	const pattern = unmatchedPatterns[0];
	const rawPattern = rawPatterns[patterns.indexOf(pattern)];
	const patternHasMatch = await globMatch({ basePath, pattern });

	if (patternHasMatch) {
		throw new AllFilesIgnoredError(rawPattern);
	}