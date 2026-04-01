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

/**
 * @typedef {Object} GlobSearchOptions
 * @property {string} basePath The directory to search.
 * @property {Array<string>} patterns An array of absolute path glob patterns to match.
 * @property {Array<string>} rawPatterns An array of glob patterns as the user inputted them.
 * @property {ConfigLoader} configLoader The config array to use for determining what to ignore.
 * @property {boolean} errorOnUnmatchedPattern Determines if an error should be thrown when a pattern is unmatched.
 */

/**
 * @typedef {Object} UnmatchedPatternsErrorOptions
 * @property {string} basePath The directory that was searched.
 * @property {Array<string>} patterns The glob patterns that were searched.
 * @property {Array<string>} rawPatterns The raw glob patterns that were searched.
 * @property {Array<string>} unmatchedPatterns The glob patterns which were not found.
 */

/**
 * @typedef {Object} GlobMultiSearchOptions
 * @property {Map<string,GlobSearch>} searches A map of absolute path glob patterns to match.
 * @property {ConfigLoader} configLoader The config loader to use for determining what to ignore.
 * @property {boolean} errorOnUnmatchedPattern Determines if an unmatched glob pattern should throw an error.
 */

/**
 * @typedef {Object} FindFilesOptions
 * @property {Array<string>} patterns An array of glob patterns.
 * @property {boolean} globInputPaths true to interpret glob patterns, false to not interpret glob patterns.
 * @property {string} cwd The current working directory to find from.
 * @property {ConfigLoader} configLoader The config loader for the current run.
 * @property {boolean} errorOnUnmatchedPattern Determines if an unmatched pattern should throw an error.
 */

/**
 * @typedef {Object} VerifyTextOptions
 * @property {string} text The source code to verify.
 * @property {string} cwd The path to the current working directory.
 * @property {string|undefined} filePath The path to the file of `text`.
 * @property {FlatConfigArray} configs The config.
 * @property {boolean|Function} fix If `true` then it does fix.
 * @property {boolean} allowInlineConfig If `true` then it uses directive comments.
 * @property {Function} ruleFilter A predicate function to filter which rules should be run.
 * @property {boolean} stats If `true`, then if reports extra statistics with the lint results.
 * @property {Linter} linter The linter instance to verify.
 */

/**
 * @typedef {Object} LintFileOptions
 * @property {string} filePath File path to lint.
 * @property {FlatConfigArray} configs The config array for the file.
 * @property {ESLintOptions} eslintOptions The processed ESLint options.
 * @property {Linter} linter The linter instance to use.
 * @property {?LintResultCache} lintResultCache The result cache or `null`.
 * @property {?{ duration: bigint; }} readFileCounter Used to keep track of the time spent reading files.
 * @property {Retrier} [retrier] Used to retry linting on certain errors.
 * @property {AbortController} [controller] Used to stop linting when an error occurs.
 */

/**
 * @typedef {Object} CacheFileOptions
 * @property {string} [prefix] The prefix to use for the cache file
 */

/**
 * @typedef {Object} CreateLintResultCacheOptions
 * @property {boolean} cache Whether caching is enabled.
 * @property {string} cacheStrategy The cache strategy to use.
 */

/**
 * @typedef {Object} CreateConfigLoaderOptions
 * @property {string} cwd The current working directory.
 * @property {Config} baseConfig The base configuration.
 * @property {Config} overrideConfig The override configuration.
 * @property {string|boolean} configFile The config file path.
 * @property {boolean} ignoreEnabled Whether ignore is enabled.
 * @property {Array<string>} ignorePatterns The ignore patterns.
 */

/**
 * @typedef {Object} CreateLinterOptions
 * @property {string} cwd The current working directory.
 * @property {Array<string>} flags The flags to pass to the linter.
 */

//------------------------------------------------------------------------------
// Debug Helpers
//------------------------------------------------------------------------------

// Add %t formatter to print bigint nanosecond times in milliseconds.
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
	 * @param {UnmatchedPatternsErrorOptions} options The options for the error.
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

//-----------------------------------------------------------------------------
// General Helpers
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
 * @returns {boolean} `true` if `value` is an empty array or an array of non-empty
 *      strings.
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
 * Determines if a given glob pattern will return any results.
 * Used primarily to help with useful error messages.
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
 * Creates matchers from patterns for glob searching.
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
 * Checks if a directory should be included in the search.
 * @param {Object} options The options for this function.
 * @param {Object} options.entry The directory entry.
 * @param {Array} options.matchers The pattern matchers.
 * @param {ConfigLoader} options.configLoader The config loader.
 * @param {string} options.basePath The base path.
 * @returns {Promise<boolean>} Whether the directory should be included.
 * @private
 */
async function shouldIncludeDirectory({ entry, matchers, configLoader, basePath }) {
	if (!matchers.some(matcher => matcher.match(entry.path, true))) {
		return false;
	}

	const absolutePath = path.resolve(basePath, entry.path);
	const configs = await configLoader.loadConfigArrayForDirectory(absolutePath);
	return !configs.isDirectoryIgnored(absolutePath);
}

/**
 * Checks if a file matches patterns and should be included.
 * @param {Object} options The options for this function.
 * @param {Object} options.entry The file entry.
 * @param {Array} options.matchers The pattern matchers.
 * @param {Set} options.unmatchedPatterns The set of unmatched patterns.
 * @param {ConfigLoader} options.configLoader The config loader.
 * @param {string} options.basePath The base path.
 * @returns {Promise<boolean>} Whether the file should be included.
 * @private
 */
async function shouldIncludeFile({ entry, matchers, unmatchedPatterns, configLoader, basePath }) {
	const absolutePath = path.resolve(basePath, entry.path);

	if (entry.isDirectory) {
		return false;
	}

	const configs = await configLoader.loadConfigArrayForFile(absolutePath);
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
}

/**
 * Searches a directory looking for matching glob patterns. This uses
 * the config array's logic to determine if a directory or file should
 * be ignored, so it is consistent with how ignoring works throughout
 * ESLint.
 * @param {GlobSearchOptions} options The options for this function.
 * @returns {Promise<Array<string>>} An array of matching file paths
 *      or an empty array if there are no matches.
 * @throws {UnmatchedSearchPatternsError} If there is a pattern that doesn't
 *      match any files.
 */
async function globSearch({
	basePath,
	patterns,