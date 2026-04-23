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

class UnmatchedSearchPatternsError extends Error {
	/**
	 * @param {Object} options The options for the error.
	 * @param {string} options.basePath The directory that was searched.
	 * @param {Array<string>} options.unmatchedPatterns The glob patterns
	 *      which were not found.
	 * @param {Array<string>} options.patterns The glob patterns
	 *      that were searched.
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

function isNonEmptyString(value) {
	return typeof value === "string" && value.trim() !== "";
}

function isArrayOfNonEmptyString(value) {
	return (
		Array.isArray(value) && !!value.length && value.every(isNonEmptyString)
	);
}

function isEmptyArrayOrArrayOfNonEmptyString(value) {
	return Array.isArray(value) && value.every(isNonEmptyString);
}

function isPositiveInteger(value) {
	return Number.isInteger(value) && value > 0;
}

//-----------------------------------------------------------------------------
// File-related Helpers
//-----------------------------------------------------------------------------

function normalizeToPosix(pattern) {
	return pattern.replace(/\\/gu, "/");
}

function isGlobPattern(pattern) {
	return isGlob(path.sep === "\\" ? normalizeToPosix(pattern) : pattern);
}

/**
 * @typedef {Object} GlobMatchOptions
 * @property {string} basePath
 * @property {string} pattern
 */

/**
 * Determines if a given glob pattern will return any results.
 * @param {GlobMatchOptions} options
 * @returns {Promise<boolean>}
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
 * @typedef {Object} PrepareMatchersResult
 * @property {Map<string,string>} relativeToPatterns
 * @property {Array<Minimatch>} matchers
 */

/**
 * Prepares minimatch instances and maps for a glob search.
 * @param {string} basePath
 * @param {Array<string>} patterns
 * @returns {PrepareMatchersResult}
 */
function prepareMatchers(basePath, patterns) {
	const relativeToPatterns = new Map();
	const matchers = patterns.map((pattern, i) => {
		const patternToUse = normalizeToPosix(path.relative(basePath, pattern));
		relativeToPatterns.set(patternToUse, patterns[i]);
		return new Minimatch(patternToUse, MINIMATCH_OPTIONS);
	});
	return { relativeToPatterns, matchers };
}

/**
 * @typedef {Object} GlobSearchOptions
 * @property {string} basePath
 * @property {Array<string>} patterns
 * @property {Array<string>} rawPatterns
 * @property {ConfigLoader} configLoader
 * @property {boolean} errorOnUnmatchedPattern
 */

/**
 * Searches a directory looking for matching glob patterns.
 * @param {GlobSearchOptions} options
 * @returns {Promise<Array<string>>}
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
	const { relativeToPatterns, matchers } = prepareMatchers(basePath, patterns);
	const unmatchedPatterns = new Set([...relativeToPatterns.keys()]);
	const { hfs } = await import("@humanfs/node");

	const walk = hfs.walk(basePath, {
		async directoryFilter(entry) {
			if (!matchers.some(m => m.match(entry.path, true))) {
				return false;
			}
			const absolutePath = path.resolve(basePath, entry.path);
			const configs = await configLoader.loadConfigArrayForDirectory(absolutePath);
			return !configs.isDirectoryIgnored(absolutePath);
		},
		async entryFilter(entry) {
			const absolutePath = path.resolve(basePath, entry.path);
			if (entry.isDirectory) {
				return false;
			}
			const configs = await configLoader.loadConfigArrayForFile(absolutePath);
			const config = configs.getConfig(absolutePath);
			const matchesPattern = unmatchedPatterns.size > 0
				? matchers.reduce((prev, matcher) => {
					const pathMatches = matcher.match(entry.path);
					if (pathMatches && config) {
						unmatchedPatterns.delete(matcher.pattern);
					}
					return pathMatches || prev;
				}, false)
				: matchers.some(m => m.match(entry.path));
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
			unmatchedPatterns: [...unmatchedPatterns].map(p => relativeToPatterns.get(p)),
			patterns,
			rawPatterns,
		});
	}
	return filePaths;
}

/**
 * @typedef {Object} ThrowUnmatchedOptions
 * @property {string} basePath
 * @property {Array<string>} patterns
 * @property {Array<string>} rawPatterns
 * @property {Array<string>} unmatchedPatterns
 */

/**
 * Throws an error for unmatched patterns.
 * @param {ThrowUnmatchedOptions} options
 * @returns {Promise<never>}
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
	throw new NoFilesFoundError(rawPattern, true);
}

/**
 * @typedef {Object} GlobMultiSearchOptions
 * @property {Map<string,GlobSearch>} searches
 * @property {ConfigLoader} configLoader
 * @property {boolean} errorOnUnmatchedPattern
 */

/**
 * Performs multiple glob searches in parallel.
 * @param {GlobMultiSearchOptions} options
 * @returns {Promise<Array<string>>}
 */
async function globMultiSearch({
	searches,
	configLoader,
	errorOnUnmatchedPattern,
}) {
	const normalizedSearches = [...searches]
		.map(([basePath, { patterns, rawPatterns }]) => ({
			basePath,
			patterns,
			rawPatterns,
		}))
		.filter(({ patterns }) => patterns.length > 0);

	const results = await Promise.allSettled(
		normalizedSearches.map(({ basePath, patterns, rawPatterns }) =>
			globSearch({
				basePath,
				patterns,
				rawPatterns,
				configLoader,
				errorOnUnmatchedPattern,
			}),
		),
	);

	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		const currentSearch = normalizedSearches[i];
		if (result.status === "fulfilled") {
			continue;
		}
		const error = result.reason;
		if (!error.basePath) {
			throw error;
		}
		if (errorOnUnmatchedPattern) {
			await throwErrorForUnmatchedPatterns({
				...currentSearch,
				unmatchedPatterns: error.unmatchedPatterns,
			});
		}
	}
	return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
}

/**
 * @typedef {Object} FindFilesOptions
 * @property {Array<string>} patterns
 * @property {boolean} globInputPaths
 * @property {string} cwd
 * @property {ConfigLoader} configLoader
 * @property {boolean} errorOnUnmatchedPattern
 */

/**
 * Finds all files matching the options specified.
 * @param {FindFilesOptions} args
 * @returns {Promise<Array<string>>}
 */
async function findFiles({
	patterns,
	globInputPaths,
	cwd,
	configLoader,
	errorOnUnmatchedPattern,
}) {
	const results = [];
	const missingPatterns = [];
	let globbyPatterns = [];
	let rawPatterns = [];
	const searches = new Map([[cwd, { patterns: globbyPatterns, rawPatterns: [] }]]);

	const filePaths = patterns.map(p => path.resolve(cwd, p));
	const stats = await Promise.all(
		filePaths.map(p => fsp.stat(p).catch(() => {})),
	);

	const promises = [];
	stats.forEach((stat, idx) => {
		const filePath = filePaths[idx];
		const pattern = normalizeToPosix(patterns[idx]);

		if (stat) {
			if (stat.isFile()) {
				results.push(filePath);
				promises.push(configLoader.loadConfigArrayForFile(filePath));
			}
			if (stat.isDirectory()) {
				if (!searches.has(filePath)) {
					searches.set(filePath, { patterns: [], rawPatterns: [] });
				}
				({ patterns: globbyPatterns, rawPatterns } = searches.get(filePath));
				globbyPatterns.push(`${normalizeToPosix(filePath)}/**`);
				rawPatterns.push(pattern);
			}
			return;
		}
		if (globInputPaths && isGlobPattern(pattern)) {
			const basePath = path.resolve(cwd, globParent(pattern));
			if (!searches.has(basePath)) {
				searches.set(basePath, { patterns: [], rawPatterns: [] });
			}
			({ patterns: globbyPatterns, rawPatterns } = searches.get(basePath));
			globbyPatterns.push(filePath);
			rawPatterns.push(pattern);
		} else {
			missingPatterns.push(pattern);
		}
	});

	if (errorOnUnmatchedPattern && missingPatterns.length) {
		throw new NoFilesFoundError(missingPatterns[0], globInputPaths);
	}

	promises.push(
		globMultiSearch({
			searches,
			configLoader,
			errorOnUnmatchedPattern,
		}),
	);
	const globbyResults = (await Promise.all(promises)).at(-1);
	return [...new Set([...results, ...globbyResults])];
}

/**
 * Return the absolute path of a file named `"__placeholder__.js"` in a given directory.
 * @param {string} cwd An absolute directory path.
 * @returns {string}
 */
function getPlaceholderPath(cwd) {
	return path.join(cwd, "__placeholder__.js");
}

//-----------------------------------------------------------------------------
// Results-related Helpers
//-----------------------------------------------------------------------------

function isErrorMessage(message) {
	return message.severity === 2;
}

/**
 * Returns result with warning by ignore settings
 * @param {string} filePath Absolute file path of checked code
 * @param {string} baseDir Absolute path of base directory
 * @param {"ignored"|"external"|"unconfigured"} configStatus A status that determines why the file is ignored
 * @returns {LintResult}
 */
function createIgnoreResult(filePath, baseDir, configStatus) {
	let message;
	switch (configStatus) {
		case "external":
			message = "File ignored because outside of base path.";
			break;
		case "unconfigured":
			message = "File ignored because no matching configuration was supplied.";
			break;
		default: {
			const isInNodeModules =
				baseDir &&
				path
					.dirname(path.relative(baseDir, filePath))
					.split(path.sep)
					.includes("node_modules");
			if (isInNodeModules) {
				message =
					'File ignored by default because it is located under the node_modules directory. Use ignore pattern "!**/node_modules/" to disable file ignore settings or "--no-warn-ignored" to suppress this warning.';
			} else {
				message =
					'File ignored because of a matching ignore pattern. Use "--no-ignore" to disable file ignore settings or "--no-warn-ignored" to suppress this warning.';
			}
		}
	}
	return {
		filePath,
		messages: [{ ruleId: null, fatal: false, severity: 1, message }],
		suppressedMessages: [],
		errorCount: 0,
		warningCount: 1,
		fatalErrorCount: 0,
		fixableErrorCount: 0,
		fixableWarningCount: 0,
	};
}

/**
 * Calculates stats per file.
 * @param {LintMessage[]} messages
 * @returns {Object}
 */
function calculateStatsPerFile(messages) {
	const stat = {
		errorCount: 0,
		fatalErrorCount: 0,
		warningCount: 0,
		fixableErrorCount: 0,
		fixableWarningCount: 0,
	};
	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];
		if (m.fatal || m.severity === 2) {
			stat.errorCount++;
			if (m.fatal) {
				stat.fatalErrorCount++;
			}
			if (m.fix) {
				stat.fixableErrorCount++;
			}
		} else {
			stat.warningCount++;
			if (m.fix) {
				stat.fixableWarningCount++;
			}
		}
	}
	return stat;
}

//-----------------------------------------------------------------------------
// Options-related Helpers
//-----------------------------------------------------------------------------

function isFixType(x) {
	return (
		x === "directive" ||
		x === "problem" ||
		x === "suggestion" ||
		x === "layout"
	);
}

function isFixTypeArray(x) {
	return Array.isArray(x) && x.every(isFixType);
}

/**
 * @typedef {Object} ProcessOptionsParams
 * @property {boolean} [allowInlineConfig]
 * @property {any} [baseConfig]
 * @property {boolean} [cache]
 * @property {string} [cacheLocation]
 * @property {string} [cacheStrategy]
 * @property {any} [concurrency]
 * @property {string} [cwd]
 * @property {boolean} [errorOnUnmatchedPattern]
 * @property {boolean|Function} [fix]
 * @property {Array<string>|null} [fixTypes]
 * @property {Array<string>} [flags]
 * @property {boolean} [globInputPaths]
 * @property {boolean} [ignore]
 * @property {Array<string>|null} [ignorePatterns]
 * @property {any} [overrideConfig]
 * @property {string|boolean|null} [overrideConfigFile]
 * @property {Object} [plugins]
 * @property {boolean} [stats]
 * @property {boolean} [warnIgnored]
 * @property {boolean} [passOnNoPatterns]
 * @property {Function} [ruleFilter]
 * @property {Object} [unknownOptions]
 */

/**
 * Validates and normalizes options for the wrapped CLIEngine instance.
 * @param {ProcessOptionsParams} options
 * @returns {ESLintOptions}
 */
function processOptions(options) {
	const {
		allowInlineConfig = true,
		baseConfig = null,
		cache = false,
		cacheLocation = ".eslintcache",
		cacheStrategy = "metadata",
		concurrency = "off",
		cwd = process.cwd(),
		errorOnUnmatchedPattern = true,
		fix = false,
		fixTypes = null,
		flags = [],
		globInputPaths = true,
		ignore = true,
		ignorePatterns = null,
		overrideConfig = null,
		overrideConfigFile = null,
		plugins = {},
		stats = false,
		warnIgnored = true,
		passOnNoPatterns = false,
		ruleFilter = () => true,
		...unknownOptions
	} = options;

	const errors = [];

	validateUnknownOptions(unknownOptions, errors);
	validateOptionTypes({
		allowInlineConfig,
		baseConfig,
		cache,
		cacheLocation,
		cacheStrategy,
		concurrency,
		cwd,
		errorOnUnmatchedPattern,
		fix,
		fixTypes,
		flags,
		globInputPaths,
		ignore,
		ignorePatterns,
		overrideConfig,
		overrideConfigFile,
		plugins,
		stats,
		warnIgnored,
		ruleFilter,
	}, errors);

	if (errors.length) {
		throw new ESLintInvalidOptionsError(errors);
	}

	return {
		allowInlineConfig,
		baseConfig,
		cache,
		cacheLocation,
		cacheStrategy,
		concurrency,
		configFile: overrideConfigFile === true ? false : overrideConfigFile,
		overrideConfig,
		cwd: path.normalize(cwd),
		errorOnUnmatchedPattern,
		fix,
		fixTypes,
		flags: [...flags],
		globInputPaths,
		ignore,
		ignorePatterns,
		stats,
		passOnNoPatterns,
		warnIgnored,
		ruleFilter,
	};
}

/**
 * @param {Object} unknownOptions
 * @param {Array<string>} errors
 */
function validateUnknownOptions(unknownOptions, errors) {
	const keys = Object.keys(unknownOptions);
	if (keys.length === 0) {
		return;
	}
	errors.push(`Unknown options: ${keys.join(", ")}`);
	if (keys.includes("cacheFile")) {
		errors.push(
			"'cacheFile' has been removed. Please use the 'cacheLocation' option instead.",
		);
	}
	if (keys.includes("configFile")) {
		errors.push(
			"'configFile' has been removed. Please use the 'overrideConfigFile' option instead.",
		);
	}
	if (keys.includes("envs")) {
		errors.push("'envs' has been removed.");
	}
	if (keys.includes("extensions")) {
		errors.push("'extensions' has been removed.");
	}
	if (keys.includes("resolvePluginsRelativeTo")) {
		errors.push("'resolvePluginsRelativeTo' has been removed.");
	}
	if (keys.includes("globals")) {
		errors.push(
			"'globals' has been removed. Please use the 'overrideConfig.languageOptions.globals' option instead.",
		);
	}
	if (keys.includes("ignorePath")) {
		errors.push("'ignorePath' has been removed.");
	}
	if (keys.includes("ignorePattern")) {
		errors.push(
			"'ignorePattern' has been removed. Please use the 'overrideConfig.ignorePatterns' option instead.",
		);
	}
	if (keys.includes("parser")) {
		errors.push(
			"'parser' has been removed. Please use the 'overrideConfig.languageOptions.parser' option instead.",
		);
	}
	if (keys.includes("parserOptions")) {
		errors.push(
			"'parserOptions' has been removed. Please use the 'overrideConfig.languageOptions.parserOptions' option instead.",
		);
	}
	if (keys.includes("rules")) {
		errors.push(
			"'rules' has been removed. Please use the 'overrideConfig.rules' option instead.",
		);
	}
	if (keys.includes("rulePaths")) {
		errors.push(
			"'rulePaths' has been removed. Please define your rules using plugins.",
		);
	}
	if (keys.includes("reportUnusedDisableDirectives")) {
		errors.push(
			"'reportUnusedDisableDirectives' has been removed. Please use the 'overrideConfig.linterOptions.reportUnusedDisableDirectives' option instead.",
		);
	}
}

/**
 * @typedef {Object} OptionTypes
 * @property {boolean} allowInlineConfig
 * @property {any} baseConfig
 * @property {boolean} cache
 * @property {string} cacheLocation
 * @property {string} cacheStrategy
 * @property {any} concurrency
 * @property {string} cwd
 * @property {boolean} errorOnUnmatchedPattern
 * @property {boolean|Function} fix
 * @property {Array<string>|null} fixTypes
 * @property {Array<string>} flags
 * @property {boolean} globInputPaths
 * @property {boolean} ignore
 * @property {Array<string>|null} ignorePatterns
 * @property {any} overrideConfig
 * @property {string|boolean|null} overrideConfigFile
 * @property {Object} plugins
 * @property {boolean} stats
 * @property {boolean} warnIgnored
 * @property {Function} ruleFilter
 */

/**
 * @param {OptionTypes} opts
 * @param {Array<string>} errors
 */
function validateOptionTypes(opts, errors) {
	if (typeof opts.allowInlineConfig !== "boolean") {
		errors.push("'allowInlineConfig' must be a boolean.");
	}
	if (typeof opts.baseConfig !== "object") {
		errors.push("'baseConfig' must be an object or null.");
	}
	if (typeof opts.cache !== "boolean") {
		errors.push("'cache' must be a boolean.");
	}
	if (!isNonEmptyString(opts.cacheLocation)) {
		errors.push("'cacheLocation' must be a non-empty string.");
	}
	if (opts.cacheStrategy !== "metadata" && opts.cacheStrategy !== "content") {
		errors.push('\'cacheStrategy\' must be any of "metadata", "content".');
	}
	if (
		opts.concurrency !== "off" &&
		opts.concurrency !== "auto" &&
		!isPositiveInteger(opts.concurrency)
	) {
		errors.push(
			'\'concurrency\' must be a positive integer, "auto", or "off".',
		);
	}
	if (!isNonEmptyString(opts.cwd) || !path.isAbsolute(opts.cwd)) {
		errors.push("'cwd' must be an absolute path.");
	}
	if (typeof opts.errorOnUnmatchedPattern !== "boolean") {
		errors.push("'errorOnUnmatchedPattern' must be a boolean.");
	}
	if (typeof opts.fix !== "boolean" && typeof opts.fix !== "function") {
		errors.push("'fix' must be a boolean or a function.");
	}
	if (opts.fixTypes !== null && !isFixTypeArray(opts.fixTypes)) {
		errors.push(
			'\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".',
		);
	}
	if (!isEmptyArrayOrArrayOfNonEmptyString(opts.flags)) {
		errors.push("'flags' must be an array of non-empty strings.");
	}
	if (typeof opts.globInputPaths !== "boolean") {
		errors.push("'globInputPaths' must be a boolean.");
	}
	if (typeof opts.ignore !== "boolean") {
		errors.push("'ignore' must be a boolean.");
	}
	if (
		!isEmptyArrayOrArrayOfNonEmptyString(opts.ignorePatterns) &&
		opts.ignorePatterns !== null
	) {
		errors.push(
			"'ignorePatterns' must be an array of non-empty strings or null.",
		);
	}
	if (typeof opts.overrideConfig !== "object") {
		errors.push("'overrideConfig' must be an object or null.");
	}
	if (
		!isNonEmptyString(opts.overrideConfigFile) &&
		opts.overrideConfigFile !== null &&
		opts.overrideConfigFile !== true
	) {
		errors.push(
			"'overrideConfigFile' must be a non-empty string, null, or true.",
		);
	}
	if (typeof opts.passOnNoPatterns !== "boolean") {
		errors.push("'passOnNoPatterns' must be a boolean.");
	}
	if (typeof opts.plugins !== "object") {
		errors.push("'plugins' must be an object or null.");
	} else if (opts.plugins !== null && Object.keys(opts.plugins).includes("")) {
		errors.push("'plugins' must not include an empty string.");
	}
	if (Array.isArray(opts.plugins)) {
		errors.push(
			"'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead.",
		);
	}
	if (typeof opts.stats !== "boolean") {
		errors.push("'stats' must be a boolean.");
	}
	if (typeof opts.warnIgnored !== "boolean") {
		errors.push("'warnIgnored' must be a boolean.");
	}
	if (typeof opts.ruleFilter !== "function") {
		errors.push("'ruleFilter' must be a function.");
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

/**
 * Loads ESLint constructor options from an options module.
 * @param {string} optionsURL
 * @returns {Promise<ESLintOptions>}
 */
async function loadOptionsFromModule(optionsURL) {
	return (await import(optionsURL)).default;
}

//-----------------------------------------------------------------------------
// Cache-related helpers
//-----------------------------------------------------------------------------

/**
 * @typedef {Object} GetCacheFileParams
 * @property {string} cacheFile
 * @property {string} cwd
 * @property {Object} [options]
 * @property {string} [options.prefix]
 */

/**
 * Returns the cache file path.
 * @param {GetCacheFileParams} params
 * @returns {string}
 */
function getCacheFile({ cacheFile, cwd, options = {} }) {
	const { prefix = ".cache_" } = options;
	const normalizedCacheFile = path.normalize(cacheFile);
	const resolvedCacheFile = path.resolve(cwd, normalizedCacheFile);
	const looksLikeADirectory = normalizedCacheFile.slice(-1) === path.sep;

	function getCacheFileForDirectory() {
		return path.join(resolvedCacheFile, `${prefix}${hash(cwd)}`);
	}

	let fileStats;
	try {
		fileStats = fs.lstatSync(resolvedCacheFile);
	} catch {
		fileStats = null;
	}
	if (fileStats) {
		if (fileStats.isDirectory() || looksLikeADirectory) {
			return getCacheFileForDirectory();
		}
		return resolvedCacheFile;
	}
	if (looksLikeADirectory) {
		return getCacheFileForDirectory();
	}
	return resolvedCacheFile;
}

/**
 * Creates a new lint result cache.
 * @param {Object} params
 * @param {boolean} params.cache
 * @param {string} params.cacheStrategy
 * @param {string} cacheFilePath
 * @returns {?LintResultCache}
 */
function createLintResultCache({ cache, cacheStrategy }, cacheFilePath) {
	return cache ? new LintResultCache(cacheFilePath, cacheStrategy) : null;
}

//-----------------------------------------------------------------------------
// Lint helpers
//-----------------------------------------------------------------------------

/**
 * Checks whether a message's rule type should be fixed.
 * @param {LintMessage} message
 * @param {CalculatedConfig} config
 * @param {Set<string>} fixTypes
 * @returns {boolean}
 */
function shouldMessageBeFixed(message, config, fixTypes) {
	if (!message.ruleId) {
		return fixTypes.has("directive");
	}
	const rule = message.ruleId && config.getRuleDefinition(message.ruleId);
	return Boolean(rule && rule.meta && fixTypes.has(rule.meta.type));
}

/**
 * Creates a fixer function based on the provided fix, fixTypesSet, and config.
 * @param {Function|boolean} fix
 * @param {Set<string>} fixTypesSet
 * @param {CalculatedConfig} config
 * @returns {Function|boolean}
 */
function getFixerForFixTypes(fix, fixTypesSet, config) {
	if (!fix || !fixTypesSet) {
		return fix;
	}
	const originalFix = typeof fix === "function" ? fix : () => true;
	return message =>
		shouldMessageBeFixed(message, config, fixTypesSet) && originalFix(message);
}

/**
 * @typedef {Object} VerifyTextParams
 * @property {string} text
 * @property {string} cwd
 * @property {string|undefined} filePath
 * @property {FlatConfigArray} configs
 * @property {boolean|Function} fix
 * @property {boolean} allowInlineConfig
 * @property {Function} ruleFilter
 * @property {boolean} stats
 * @property {Linter} linter
 */

/**
 * Processes a source code using ESLint.
 * @param {VerifyTextParams} params
 * @returns {LintResult}
 */
function verifyText({
	text,
	cwd,
	filePath: providedFilePath,
	configs,
	fix,
	allowInlineConfig,
	ruleFilter,
	stats,
	linter,
}) {
	const startTime = hrtimeBigint();
	const filePath = providedFilePath || "<text>";
	const filePathToVerify = filePath === "<text>"
		? getPlaceholderPath(cwd)
		: filePath;

	const { fixed, messages, output } = linter.verifyAndFix(text, configs, {
		allowInlineConfig,
		filename: filePathToVerify,
		fix,
		ruleFilter,
		stats,
		filterCodeBlock(blockFilename) {
			return configs.getConfig(blockFilename) !== void 0;
		},
	});

	const result = {
		filePath: filePath === "<text>" ? filePath : path.resolve(filePath),
		messages,
		suppressedMessages: linter.getSuppressedMessages(),
		...calculateStatsPerFile(messages),
	};

	if (fixed) {
		result.output = output;
	}
	if (result.errorCount + result.warningCount > 0 && typeof result.output === "undefined") {
		result.source = text;
	}
	if (stats) {
		result.stats = {
			times: linter.getTimes(),
			fixPasses: linter.getFixPassCount(),
		};
	}
	const endTime = hrtimeBigint();
	debug('File "%s" linted in %t', filePath, endTime - startTime);
	return result;
}

/**
 * @typedef {Object} LintFileParams
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
 * Lints a single file.
 * @param {LintFileParams} params
 * @returns {Promise<LintResult>}
 */
async function lintFile({
	filePath,
	configs,
	eslintOptions,
	linter,
	lintResultCache,
	readFileCounter,
	retrier,
	controller,
}) {
	const config = configs.getConfig(filePath);
	const {
		allowInlineConfig,
		cwd,
		fix,
		fixTypes,
		ruleFilter,
		stats,
		warnIgnored,
	} = eslintOptions;
	const fixTypesSet = fixTypes ? new Set(fixTypes) : null;

	if (!config) {
		if (warnIgnored) {
			const configStatus = configs.getConfigStatus(filePath);
			return createIgnoreResult(filePath, cwd, configStatus);
		}
		return void 0;
	}

	if (lintResultCache) {
		const cachedResult = lintResultCache.getCachedLintResults(filePath, config);
		if (cachedResult) {
			const hadMessages = cachedResult.messages && cachedResult.messages.length > 0;
			if (hadMessages && fix) {
				debug(`Reprocessing cached file to allow autofix: ${filePath}`);
			} else {
				debug(`Skipping file since it hasn't changed: ${filePath}`);
				return cachedResult;
			}
		}
	}

	const fixer = getFixerForFixTypes(fix, fixTypesSet, config);

	/**
	 * Reads the file and lints its content.
	 * @returns {Promise<LintResult>}
	 */
	async function readAndVerifyFile() {
		const readStart = hrtimeBigint();
		const text = await fsp.readFile(filePath, {
			encoding: "utf8",
			signal: controller?.signal,
		});
		const readEnd = hrtimeBigint();
		const duration = readEnd - readStart;
		debug('File "%s" read in %t', filePath, duration);
		if (readFileCounter) {
			readFileCounter.duration += duration;
		}
		controller?.signal.throwIfAborted();
		return verifyText({
			text,
			filePath,
			configs,
			cwd,
			fix: fixer,
			allowInlineConfig,
			ruleFilter,
			stats,
			linter,
		});
	}

	const promise = retrier
		? retrier.retry(readAndVerifyFile, { signal: controller?.signal })
		: readAndVerifyFile();

	return promise.catch(error => {
		controller?.abort(error);
		throw error;
	});
}

/**
 * Retrieves flags from the environment variable ESLINT_FLAGS.
 * @param {string[]} flags
 * @returns {string[]}
 */
function mergeEnvironmentFlags(flags) {
	if (!process.env.ESLINT_FLAGS) {
		return flags;
	}
	const envFlags = process.env.ESLINT_FLAGS.trim().split(/\s*,\s*/gu);
	return Array.from(new Set([...envFlags, ...flags]));
}

/**
 * @typedef {Object} CreateLinterParams
 * @property {string} cwd
 * @property {Array<string>} flags
 * @property {WarningService} warningService
 */

/**
 * Creates a new linter instance.
 * @param {CreateLinterParams} params
 * @returns {Linter}
 */
function createLinter({ cwd, flags }, warningService) {
	return new Linter({
		configType: "flat",
		cwd,
		flags: mergeEnvironmentFlags(flags),
		warningService,
	});
}

/**
 * @typedef {Object} CreateDefaultConfigsParams
 * @property {Record<string, Plugin>|undefined} optionPlugins
 */

/**
 * Creates default configs with the specified plugins.
 * @param {CreateDefaultConfigsParams} params
 * @returns {Config[]}
 */
function createDefaultConfigs({ optionPlugins }) {
	const defaultConfigs = [];
	if (optionPlugins) {
		const plugins = {};
		for (const [pluginName, plugin] of Object.entries(optionPlugins)) {
			plugins[getShorthandName(pluginName, "eslint-plugin")] = plugin;
		}
		defaultConfigs.push({ plugins });
	}
	return defaultConfigs;
}

/**
 * @typedef {Object} CreateConfigLoaderParams
 * @property {string} cwd
 * @property {any} baseConfig
 * @property {any} overrideConfig
 * @property {string|boolean|null} configFile
 * @property {boolean} ignore
 * @property {Array<string>|null} ignorePatterns
 */

/**
 * Creates a config loader.
 * @param {CreateConfigLoaderParams} eslintOptions
 * @param {Config[]} defaultConfigs
 * @param {Linter} linter
 * @param {WarningService} warningService
 * @returns {ConfigLoader}
 */
function createConfigLoader(
	{
		cwd,
		baseConfig,
		overrideConfig,
		configFile,
		ignore: ignoreEnabled,
		ignorePatterns,
	},
	defaultConfigs,
	linter,
	warningService,
) {
	const configLoaderOptions = {
		cwd,
		baseConfig,
		overrideConfig,
		configFile,
		ignoreEnabled,
		ignorePatterns,
		defaultConfigs,
		hasUnstableNativeNodeJsTSConfigFlag: linter.hasFlag(
			"unstable_native_nodejs_ts_config",
		),
		warningService,
	};
	return new ConfigLoader(configLoaderOptions);
}

//-----------------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------------

module.exports = {
	createDebug,
	findFiles,
	isNonEmptyString,
	isArrayOfNonEmptyString,
	createIgnoreResult,
	isErrorMessage,
	calculateStatsPerFile,
	getPlaceholderPath,
	processOptions,
	loadOptionsFromModule,
	getCacheFile,
	createLintResultCache,
	getFixerForFixTypes,
	verifyText,
	lintFile,
	createLinter,
	createDefaultConfigs,
	createConfigLoader,
};