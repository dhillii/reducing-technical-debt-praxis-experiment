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
 * @typedef {Object} ProcessOptionsInput
 * @property {boolean} [allowInlineConfig=true]
 * @property {object} [baseConfig=null]
 * @property {boolean} [cache=false]
 * @property {string} [cacheLocation=".eslintcache"]
 * @property {string} [cacheStrategy="metadata"]
 * @property {string|number} [concurrency="off"]
 * @property {string} [cwd]
 * @property {boolean} [errorOnUnmatchedPattern=true]
 * @property {boolean|Function} [fix=false]
 * @property {Array<string>} [fixTypes=null]
 * @property {Array<string>} [flags=[]]
 * @property {boolean} [globInputPaths=true]
 * @property {boolean} [ignore=true]
 * @property {Array<string>} [ignorePatterns=null]
 * @property {object} [overrideConfig=null]
 * @property {string|boolean} [overrideConfigFile=null]
 * @property {object} [plugins={}]
 * @property {boolean} [stats=false]
 * @property {boolean} [warnIgnored=true]
 * @property {boolean} [passOnNoPatterns=false]
 * @property {Function} [ruleFilter]
 */

/**
 * @typedef {Object} VerifyTextConfig
 * @property {string} text
 * @property {string} cwd
 * @property {string} [filePath]
 * @property {FlatConfigArray} configs
 * @property {boolean|Function} fix
 * @property {boolean} allowInlineConfig
 * @property {Function} ruleFilter
 * @property {boolean} stats
 * @property {Linter} linter
 */

/**
 * @typedef {Object} LintFileOptions
 * @property {string} filePath
 * @property {FlatConfigArray} configs
 * @property {ESLintOptions} eslintOptions
 * @property {Linter} linter
 * @property {?LintResultCache} lintResultCache
 * @property {?{ duration: bigint; }} readFileCounter
 * @property {Retrier} [retrier]
 * @property {AbortController} [controller]
 */

/**
 * @typedef {Object} GlobSearchOptions
 * @property {string} basePath
 * @property {Array<string>} patterns
 * @property {Array<string>} rawPatterns
 * @property {ConfigLoader} configLoader
 * @property {boolean} errorOnUnmatchedPattern
 */

/**
 * @typedef {Object} GlobMultiSearchOptions
 * @property {Map<string,GlobSearch>} searches
 * @property {ConfigLoader} configLoader
 * @property {boolean} errorOnUnmatchedPattern
 */

/**
 * @typedef {Object} FindFilesOptions
 * @property {Array<string>} patterns
 * @property {boolean} globInputPaths
 * @property {string} cwd
 * @property {ConfigLoader} configLoader
 * @property {boolean} errorOnUnmatchedPattern
 */

/**
 * @typedef {Object} CreateConfigLoaderOptions
 * @property {string} cwd
 * @property {object} baseConfig
 * @property {object} overrideConfig
 * @property {string|boolean} configFile
 * @property {boolean} ignoreEnabled
 * @property {Array<string>} ignorePatterns
 */

/**
 * @typedef {Object} CacheFileOptions
 * @property {string} [prefix=".cache_"]
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
 * Checks if a file path matches any pattern.
 * @param {Array<Minimatch>} matchers Array of Minimatch instances.
 * @param {Set<string>} unmatchedPatterns Set of unmatched pattern strings.
 * @param {string} entryPath The entry path to check.
 * @param {CalculatedConfig} config The config for the file.
 * @returns {boolean} True if the path matches any pattern.
 * @private
 */
function checkPathMatchesPattern(matchers, unmatchedPatterns, entryPath, config) {
	if (unmatchedPatterns.size > 0) {
		return matchers.reduce((previousValue, matcher) => {
			const pathMatches = matcher.match(entryPath);
			if (pathMatches && config) {
				unmatchedPatterns.delete(matcher.pattern);
			}
			return pathMatches || previousValue;
		}, false);
	}

	return matchers.some(matcher => matcher.match(entryPath));
}

/**
 * Searches a directory looking for matching glob patterns.
 * @param {GlobSearchOptions} options The options for this function.
 * @returns {Promise<Array<string>>} An array of matching file paths.
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
		async directoryFilter(entry) {
			if (!matchers.some(matcher => matcher.match(entry.path, true))) {
				return false;
			}

			const absolutePath = path.resolve(basePath, entry.path);
			const configs =
				await configLoader.loadConfigArrayForDirectory(absolutePath);

			return !configs.isDirectoryIgnored(absolutePath);
		},
		async entryFilter(entry) {
			const absolutePath = path.resolve(basePath, entry.path);

			if (entry.isDirectory) {
				return false;
			}

			const configs =
				await configLoader.loadConfigArrayForFile(absolutePath);
			const config = configs.getConfig(absolutePath);

			const matchesPattern = checkPathMatchesPattern(
				matchers,
				unmatchedPatterns,
				entry.path,
				config,
			);

			return matchesPattern && config !== void 0;
		},
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
			unmatchedPat