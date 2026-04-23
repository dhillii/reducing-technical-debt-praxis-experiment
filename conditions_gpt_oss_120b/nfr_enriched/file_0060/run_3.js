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
	constructor(pattern, globEnabled) {
		super(
			`No files matching '${pattern}' were found${!globEnabled ? " (glob was disabled)" : ""}.`,
		);
		this.messageTemplate = "file-not-found";
		this.messageData = { pattern, globDisabled: !globEnabled };
	}
}

class UnmatchedSearchPatternsError extends Error {
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
 * Determines if a given glob pattern will return any results.
 * @param {Object} options
 * @param {string} options.basePath
 * @param {string} options.pattern
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
 * Build Minimatch instances for a set of patterns.
 * @param {string} basePath
 * @param {Array<string>} patterns
 * @returns {{ matchers: Array<Minimatch>, relativeToPatterns: Map<string,string> }}
 */
function buildMatchers(basePath, patterns) {
	const relativeToPatterns = new Map();
	const matchers = patterns.map((pattern, i) => {
		const patternToUse = normalizeToPosix(path.relative(basePath, pattern));
		relativeToPatterns.set(patternToUse, patterns[i]);
		return new Minimatch(patternToUse, MINIMATCH_OPTIONS);
	});
	return { matchers, relativeToPatterns };
}

/**
 * Directory filter used by globSearch.
 * @param {Object} entry
 * @param {string} basePath
 * @param {Array<Minimatch>} matchers
 * @param {ConfigLoader} configLoader
 * @returns {Promise<boolean>}
 */
async function globSearchDirectoryFilter(entry, basePath, matchers, configLoader) {
	if (!matchers.some(matcher => matcher.match(entry.path, true))) {
		return false;
	}
	const absolutePath = path.resolve(basePath, entry.path);
	const configs = await configLoader.loadConfigArrayForDirectory(absolutePath);
	return !configs.isDirectoryIgnored(absolutePath);
}

/**
 * Entry filter used by globSearch.
 * @param {Object} entry
 * @param {string} basePath
 * @param {Array<Minimatch>} matchers
 * @param {Set<string>} unmatchedPatterns
 * @param {ConfigLoader} configLoader
 * @returns {Promise<boolean>}
 */
async function globSearchEntryFilter(entry, basePath, matchers, unmatchedPatterns, configLoader) {
	const absolutePath = path.resolve(basePath, entry.path);
	if (entry.isDirectory) {
		return false;
	}
	const configs = await configLoader.loadConfigArrayForFile(absolutePath);
	const config = configs.getConfig(absolutePath);

	const matchesPattern =
		unmatchedPatterns.size > 0
			? matchers.reduce((prev, matcher) => {
					const pathMatches = matcher.match(entry.path);
					if (pathMatches && config) {
						unmatchedPatterns.delete(matcher.pattern);
					}
					return pathMatches || prev;
			  }, false)
			: matchers.some(matcher => matcher.match(entry.path));

	return matchesPattern && config !== void 0;
}

/**
 * Searches a directory for matching glob patterns.
 * @param {Object} options
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
	const { matchers, relativeToPatterns } = buildMatchers(basePath, patterns);
	const unmatchedPatterns = new Set([...relativeToPatterns.keys()]);
	const { hfs } = await import("@humanfs/node");

	const walk = hfs.walk(basePath, {
		directoryFilter(entry) {
			return globSearchDirectoryFilter(entry, basePath, matchers, configLoader);
		},
		entryFilter(entry) {
			return globSearchEntryFilter(entry, basePath, matchers, unmatchedPatterns, configLoader);
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
 * Throws an appropriate error for unmatched patterns.
 * @param {Object} options
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
 * Handles a single result from globMultiSearch.
 * @param {Object} result
 * @param {Object} currentSearch
 * @param {boolean} errorOnUnmatchedPattern
 */
async function handleGlobSearchResult(result, currentSearch, errorOnUnmatchedPattern) {
	if (result.status === "fulfilled") {
		return;
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

/**
 * Performs multiple glob searches in parallel.
 * @param {Object} options
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
		await handleGlobSearchResult(results[i], normalizedSearches[i], errorOnUnmatchedPattern);
	}
	return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
}

/**
 * Resolves file system stats for an array of paths.
 * @param {Array<string>} filePaths
 * @returns {Promise<Array<fs.Stats|undefined>>}
 */
async function resolveStats(filePaths) {
	return Promise.all(
		filePaths.map(fp => fsp.stat(fp).catch(() => undefined)),
	);
}

/**
 * Processes a single stat entry within findFiles.
 * @param {Object} params
 */
function processStatEntry({
	stat,
	filePath,
	pattern,
	cwd,
	searches,
	results,
	promises,
}) {
	if (!stat) {
		return;
	}
	if (stat.isFile()) {
		results.push(filePath);
		promises.push(searches.configLoader.loadConfigArrayForFile(filePath));
		return;
	}
	if (stat.isDirectory()) {
		if (!searches.map.has(filePath)) {
			searches.map.set(filePath, { patterns: [], rawPatterns: [] });
		}
		const entry = searches.map.get(filePath);
		entry.patterns.push(`${normalizeToPosix(filePath)}/**`);
		entry.rawPatterns.push(pattern);
	}
}

/**
 * Handles missing patterns when errorOnUnmatchedPattern is true.
 * @param {Array<string>} missingPatterns
 * @param {boolean} errorOnUnmatchedPattern
 * @param {boolean} globInputPaths
 */
function handleMissingPatterns(missingPatterns, errorOnUnmatchedPattern, globInputPaths) {
	if (errorOnUnmatchedPattern && missingPatterns.length) {
		throw new NoFilesFoundError(missingPatterns[0], globInputPaths);
	}
}

/**
 * Executes the final glob search step.
 * @param {Map<string,GlobSearch>} searches
 * @param {ConfigLoader} configLoader
 * @param {boolean} errorOnUnmatchedPattern
 * @returns {Promise<Array<string>>}
 */
async function executeGlobMultiSearch(searches, configLoader, errorOnUnmatchedPattern) {
	return globMultiSearch({
		searches,
		configLoader,
		errorOnUnmatchedPattern,
	});
}

/**
 * Finds all files matching the options specified.
 * @param {Object} args
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
	const searches = new Map([
		[cwd, { patterns: globbyPatterns, rawPatterns: [] }],
	]);

	const filePaths = patterns.map(p => path.resolve(cwd, p));
	const stats = await resolveStats(filePaths);

	for (let i = 0; i < stats.length; i++) {
		const stat = stats[i];
		const filePath = filePaths[i];
		const pattern = normalizeToPosix(patterns[i]);

		if (stat) {
			processStatEntry({
				stat,
				filePath,
				pattern,
				cwd,
				searches,
				results,
				promises: [],
			});
			continue;
		}

		if (globInputPaths && isGlobPattern(pattern)) {
			const basePath = path.resolve(cwd, globParent(pattern));
			if (!searches.has(basePath)) {
				searches.set(basePath, { patterns: [], rawPatterns: [] });
			}
			const entry = searches.get(basePath);
			entry.patterns.push(filePath);
			entry.rawPatterns.push(pattern);
		} else {
			missingPatterns.push(pattern);
		}
	}

	handleMissingPatterns(missingPatterns, errorOnUnmatchedPattern, globInputPaths);

	const globbyResults = await executeGlobMultiSearch(searches, configLoader, errorOnUnmatchedPattern);
	return [...new Set([...results, ...globbyResults])];
}

/**
 * Return the absolute path of a file named `"__placeholder__.js"` in a given directory.
 * @param {string} cwd
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
			message = isInNodeModules
				? 'File ignored by default because it is located under the node_modules directory. Use ignore pattern "!**/node_modules/" to disable file ignore settings or "--no-warn-ignored" to suppress this warning.'
				: 'File ignored because of a matching ignore pattern. Use "--no-ignore" to disable file ignore settings or "--no-warn-ignored" to suppress this warning.';
		}
	}
	return {
		filePath,
		messages: [
			{
				ruleId: null,
				fatal: false,
				severity: 1,
				message,
			},
		],
		suppressedMessages: [],
		errorCount: 0,
		warningCount: 1,
		fatalErrorCount: 0,
		fixableErrorCount: 0,
		fixableWarningCount: 0,
	};
}

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

class ESLintInvalidOptionsError extends Error {
	constructor(messages) {
		super(`Invalid Options:\n- ${messages.join("\n- ")}`);
		this.code = "ESLINT_INVALID_OPTIONS";
		Error.captureStackTrace(this, ESLintInvalidOptionsError);
	}
}

/**
 * Validate unknown options.
 * @param {Object} unknownOptions
 * @returns {Array<string>}
 */
function validateUnknownOptions(unknownOptions) {
	const errors = [];
	const keys = Object.keys(unknownOptions);
	if (keys.length === 0) {
		return errors;
	}
	errors.push(`Unknown options: ${keys.join(", ")}`);
	if (keys.includes("cacheFile")) {
		errors.push("'cacheFile' has been removed. Please use the 'cacheLocation' option instead.");
	}
	if (keys.includes("configFile")) {
		errors.push("'configFile' has been removed. Please use the 'overrideConfigFile' option instead.");
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
		errors.push("'globals' has been removed. Please use the 'overrideConfig.languageOptions.globals' option instead.");
	}
	if (keys.includes("ignorePath")) {
		errors.push("'ignorePath' has been removed.");
	}
	if (keys.includes("ignorePattern")) {
		errors.push("'ignorePattern' has been removed. Please use the 'overrideConfig.ignorePatterns' option instead.");
	}
	if (keys.includes("parser")) {
		errors.push("'parser' has been removed. Please use the 'overrideConfig.languageOptions.parser' option instead.");
	}
	if (keys.includes("parserOptions")) {
		errors.push("'parserOptions' has been removed. Please use the 'overrideConfig.languageOptions.parserOptions' option instead.");
	}
	if (keys.includes("rules")) {
		errors.push("'rules' has been removed. Please use the 'overrideConfig.rules' option instead.");
	}
	if (keys.includes("rulePaths")) {
		errors.push("'rulePaths' has been removed. Please define your rules using plugins.");
	}
	if (keys.includes("reportUnusedDisableDirectives")) {
		errors.push("'reportUnusedDisableDirectives' has been removed. Please use the 'overrideConfig.linterOptions.reportUnusedDisableDirectives' option instead.");
	}
	return errors;
}

/**
 * Validate option types.
 * @param {Object} opts
 * @returns {Array<string>}
 */
function validateOptionTypes(opts) {
	const errors = [];
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
		errors.push('\'concurrency\' must be a positive integer, "auto", or "off".');
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
		errors.push('\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".');
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
		errors.push("'ignorePatterns' must be an array of non-empty strings or null.");
	}
	if (typeof opts.overrideConfig !== "object") {
		errors.push("'overrideConfig' must be an object or null.");
	}
	if (
		!isNonEmptyString(opts.overrideConfigFile) &&
		opts.overrideConfigFile !== null &&
		opts.overrideConfigFile !== true
	) {
		errors.push("'overrideConfigFile' must be a non-empty string, null, or true.");
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
		errors.push("'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead.");
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
	return errors;
}

/**
 * Validates and normalizes options for the wrapped CLIEngine instance.
 * @param {ESLintOptions} options
 * @returns {ESLintOptions}
 */
function processOptions({
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
}) {
	const unknownErrors = validateUnknownOptions(unknownOptions);
	const typeErrors = validateOptionTypes({
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
		passOnNoPatterns,
		ruleFilter,
	});
	const errors = [...unknownErrors, ...typeErrors];
	if (errors.length > 0) {
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

function getCacheFile(cacheFile, cwd, { prefix = ".cache_" } = {}) {
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
 * @param {ESLintOptions} eslintOptions
 * @param {string} cacheFilePath
 * @returns {?LintResultCache}
 */
function createLintResultCache({ cache, cacheStrategy }, cacheFilePath) {
	return cache ? new LintResultCache(cacheFilePath, cacheStrategy) : null;
}

//-----------------------------------------------------------------------------
// Lint helpers
//-----------------------------------------------------------------------------

function shouldMessageBeFixed(message, config, fixTypes) {
	if (!message.ruleId) {
		return fixTypes.has("directive");
	}
	const rule = message.ruleId && config.getRuleDefinition(message.ruleId);
	return Boolean(rule && rule.meta && fixTypes.has(rule.meta.type));
}

function getFixerForFixTypes(fix, fixTypesSet, config) {
	if (!fix || !fixTypesSet) {
		return fix;
	}
	const originalFix = typeof fix === "function" ? fix : () => true;
	return message =>
		shouldMessageBeFixed(message, config, fixTypesSet) && originalFix(message);
}

/**
 * Processes a source code using ESLint.
 * @param {Object} config
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
	const filePathToVerify =
		filePath === "<text>" ? getPlaceholderPath(cwd) : filePath;
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
 * Lints a single file.
 * @param {string} filePath
 * @param {FlatConfigArray} configs
 * @param {ESLintOptions} eslintOptions
 * @param {Linter} linter
 * @param {?LintResultCache} lintResultCache
 * @param {?{ duration: bigint; }} readFileCounter
 * @param {Retrier} [retrier]
 * @param {AbortController} [controller]
 * @returns {Promise<LintResult>}
 */
async function lintFile(
	filePath,
	configs,
	eslintOptions,
	linter,
	lintResultCache,
	readFileCounter,
	retrier,
	controller,
) {
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

	async function readAndVerifyFile() {
		const readFileEnterTime = hrtimeBigint();
		const text = await fsp.readFile(filePath, {
			encoding: "utf8",
			signal: controller?.signal,
		});
		const readFileExitTime = hrtimeBigint();
		const readFileDuration = readFileExitTime - readFileEnterTime;
		debug('File "%s" read in %t', filePath, readFileDuration);
		if (readFileCounter) {
			readFileCounter.duration += readFileDuration;
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
 * Creates a new linter instance.
 * @param {ESLintOptions} eslintOptions
 * @param {WarningService} warningService
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
 * Creates default configs with the specified plugins.
 * @param {Record<string, Plugin> | undefined} optionPlugins
 * @returns {Config[]}
 */
function createDefaultConfigs(optionPlugins) {
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
 * Creates a config loader.
 * @param {ESLintOptions} eslintOptions
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