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
	return Array.isArray(value) && !!value.length && value.every(isNonEmptyString);
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
 * @returns {{ matchers: Array<Minimatch>, relativeMap: Map<string,string> }}
 */
function buildMatchers(basePath, patterns) {
	const relativeMap = new Map();
	const matchers = patterns.map(pattern => {
		const rel = normalizeToPosix(path.relative(basePath, pattern));
		relativeMap.set(rel, pattern);
		return new Minimatch(rel, MINIMATCH_OPTIONS);
	});
	return { matchers, relativeMap };
}

/**
 * Walk a directory and collect files that match any of the provided matchers.
 * @param {string} basePath
 * @param {Array<Minimatch>} matchers
 * @param {ConfigLoader} configLoader
 * @param {Set<string>} unmatchedPatterns
 * @returns {Promise<Array<string>>}
 */
async function walkAndCollectMatches(basePath, matchers, configLoader, unmatchedPatterns) {
	const { hfs } = await import("@humanfs/node");
	const walk = hfs.walk(basePath, {
		async directoryFilter(entry) {
			if (!matchers.some(m => m.match(entry.path, true))) {
				return false;
			}
			const absolute = path.resolve(basePath, entry.path);
			const configs = await configLoader.loadConfigArrayForDirectory(absolute);
			return !configs.isDirectoryIgnored(absolute);
		},
		async entryFilter(entry) {
			if (entry.isDirectory) {
				return false;
			}
			const absolute = path.resolve(basePath, entry.path);
			const configs = await configLoader.loadConfigArrayForFile(absolute);
			const config = configs.getConfig(absolute);
			if (!config) {
				return false;
			}
			const matches = unmatchedPatterns.size > 0
				? matchers.reduce((acc, matcher) => {
					const doesMatch = matcher.match(entry.path);
					if (doesMatch && config) {
						unmatchedPatterns.delete(matcher.pattern);
					}
					return acc || doesMatch;
				}, false)
				: matchers.some(m => m.match(entry.path));
			return matches;
		},
	});

	const results = [];
	if (await hfs.isDirectory(basePath)) {
		for await (const entry of walk) {
			results.push(path.resolve(basePath, entry.path));
		}
	}
	return results;
}

/**
 * Perform a single glob search.
 * @param {Object} opts
 * @param {string} opts.basePath
 * @param {Array<string>} opts.patterns
 * @param {Array<string>} opts.rawPatterns
 * @param {ConfigLoader} opts.configLoader
 * @param {boolean} opts.errorOnUnmatchedPattern
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
	const { matchers, relativeMap } = buildMatchers(basePath, patterns);
	const unmatchedPatterns = new Set([...relativeMap.keys()]);
	const filePaths = await walkAndCollectMatches(basePath, matchers, configLoader, unmatchedPatterns);

	if (errorOnUnmatchedPattern && unmatchedPatterns.size > 0) {
		throw new UnmatchedSearchPatternsError({
			basePath,
			unmatchedPatterns: [...unmatchedPatterns].map(p => relativeMap.get(p)),
			patterns,
			rawPatterns,
		});
	}
	return filePaths;
}

/**
 * Normalizes the map of searches into an array of objects.
 * @param {Map<string,GlobSearch>} searches
 * @returns {Array<{basePath:string,patterns:Array<string>,rawPatterns:Array<string>}>}
 */
function normalizeSearches(searches) {
	return [...searches]
		.map(([basePath, { patterns, rawPatterns }]) => ({
			basePath,
			patterns,
			rawPatterns,
		}))
		.filter(s => s.patterns.length > 0);
}

/**
 * Executes multiple glob searches in parallel and aggregates results.
 * @param {Object} opts
 * @param {Map<string,GlobSearch>} opts.searches
 * @param {ConfigLoader} opts.configLoader
 * @param {boolean} opts.errorOnUnmatchedPattern
 * @returns {Promise<Array<string>>}
 */
async function globMultiSearch({
	searches,
	configLoader,
	errorOnUnmatchedPattern,
}) {
	const normalized = normalizeSearches(searches);
	const settled = await Promise.allSettled(
		normalized.map(s =>
			globSearch({
				basePath: s.basePath,
				patterns: s.patterns,
				rawPatterns: s.rawPatterns,
				configLoader,
				errorOnUnmatchedPattern,
			}),
		),
	);

	// Process errors first
	for (let i = 0; i < settled.length; i++) {
		const result = settled[i];
		if (result.status === "rejected") {
			const err = result.reason;
			if (!err.basePath) {
				throw err;
			}
			if (errorOnUnmatchedPattern) {
				await throwErrorForUnmatchedPatterns({
					...normalized[i],
					unmatchedPatterns: err.unmatchedPatterns,
				});
			}
		}
	}
	// Collect successful results
	return settled.flatMap(r => (r.status === "fulfilled" ? r.value : []));
}

/**
 * Throws an appropriate error for unmatched patterns.
 * @param {Object} opts
 * @param {string} opts.basePath
 * @param {Array<string>} opts.patterns
 * @param {Array<string>} opts.rawPatterns
 * @param {Array<string>} opts.unmatchedPatterns
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
	const hasMatch = await globMatch({ basePath, pattern });
	if (hasMatch) {
		throw new AllFilesIgnoredError(rawPattern);
	}
	throw new NoFilesFoundError(rawPattern, true);
}

/**
 * Resolve a file path to its absolute form and return its stats if it exists.
 * @param {string} filePath
 * @returns {Promise<{path:string,stat:fs.Stats|null}>}
 */
async function resolveFileStat(filePath) {
	try {
		const stat = await fsp.stat(filePath);
		return { path: filePath, stat };
	} catch {
		return { path: filePath, stat: null };
	}
}

/**
 * Process a stat entry for a file or directory.
 * @param {Object} ctx
 * @param {string} ctx.filePath
 * @param {fs.Stats} ctx.stat
 * @param {string} ctx.cwd
 * @param {Map<string,GlobSearch>} ctx.searches
 * @param {Array<string>} ctx.results
 * @param {Array<Promise<any>>} ctx.promises
 */
function handleStatEntry({
	filePath,
	stat,
	cwd,
	searches,
	results,
	promises,
}) {
	const pattern = normalizeToPosix(path.relative(cwd, filePath));
	if (stat.isFile()) {
		results.push(filePath);
		promises.push(configLoader.loadConfigArrayForFile(filePath));
	} else if (stat.isDirectory()) {
		if (!searches.has(filePath)) {
			searches.set(filePath, { patterns: [], rawPatterns: [] });
		}
		const entry = searches.get(filePath);
		entry.patterns.push(`${normalizeToPosix(filePath)}/**`);
		entry.rawPatterns.push(pattern);
	}
}

/**
 * Add a glob pattern to the appropriate search entry.
 * @param {Object} ctx
 * @param {string} ctx.basePath
 * @param {string} ctx.pattern
 * @param {string} ctx.rawPattern
 * @param {Map<string,GlobSearch>} ctx.searches
 */
function addGlobToSearch({ basePath, pattern, rawPattern, searches }) {
	if (!searches.has(basePath)) {
		searches.set(basePath, { patterns: [], rawPatterns: [] });
	}
	const entry = searches.get(basePath);
	entry.patterns.push(pattern);
	entry.rawPatterns.push(rawPattern);
}

/**
 * Find files based on patterns, handling globs, directories, and missing patterns.
 * @param {Object} args
 * @param {Array<string>} args.patterns
 * @param {boolean} args.globInputPaths
 * @param {string} args.cwd
 * @param {ConfigLoader} args.configLoader
 * @param {boolean} args.errorOnUnmatchedPattern
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
	const searches = new Map([[cwd, { patterns: [], rawPatterns: [] }]]);

	// Resolve stats for all supplied patterns
	const resolved = await Promise.all(patterns.map(p => resolveFileStat(path.resolve(cwd, p))));

	// Process each resolved entry
	for (const { path: filePath, stat } of resolved) {
		const rawPattern = normalizeToPosix(path.relative(cwd, filePath));
		if (stat) {
			handleStatEntry({
				filePath,
				stat,
				cwd,
				searches,
				results,
				promises: [], // placeholder, not used here
			});
			continue;
		}

		if (globInputPaths && isGlobPattern(rawPattern)) {
			const basePath = path.resolve(cwd, globParent(rawPattern));
			addGlobToSearch({
				basePath,
			 pattern: filePath,
			 rawPattern,
			 searches,
			});
		} else {
			missingPatterns.push(rawPattern);
		}
	}

	if (errorOnUnmatchedPattern && missingPatterns.length) {
		throw new NoFilesFoundError(missingPatterns[0], globInputPaths);
	}

	const globbyResults = await globMultiSearch({
		searches,
		configLoader,
		errorOnUnmatchedPattern,
	});

	return [...new Set([...results, ...globbyResults])];
}

/**
 * Return the absolute path of a placeholder file.
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

/**
 * Create a lint result representing an ignored file.
 * @param {string} filePath
 * @param {string} baseDir
 * @param {"ignored"|"external"|"unconfigured"} configStatus
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
			message = isInNodeModules
				? 'File ignored by default because it is located under the node_modules directory. Use ignore pattern "!**/node_modules/" to disable file ignore settings or use "--no-warn-ignored" to suppress this warning.'
				: 'File ignored because of a matching ignore pattern. Use "--no-ignore" to disable file ignore settings or use "--no-warn-ignored" to suppress this warning.';
			break;
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
 * Calculate per‑file statistics from messages.
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
	for (const msg of messages) {
		if (msg.fatal || msg.severity === 2) {
			stat.errorCount++;
			if (msg.fatal) stat.fatalErrorCount++;
			if (msg.fix) stat.fixableErrorCount++;
		} else {
			stat.warningCount++;
			if (msg.fix) stat.fixableWarningCount++;
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
 * Validate and normalize ESLint options.
 * @param {ESLintOptions} options
 * @returns {ESLintOptions}
 * @throws {ESLintInvalidOptionsError}
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
	const errors = [];
	const unknownKeys = Object.keys(unknownOptions);
	if (unknownKeys.length) {
		errors.push(`Unknown options: ${unknownKeys.join(", ")}`);
		// detailed unknown‑option messages omitted for brevity
	}
	if (typeof allowInlineConfig !== "boolean") errors.push("'allowInlineConfig' must be a boolean.");
	if (typeof baseConfig !== "object") errors.push("'baseConfig' must be an object or null.");
	if (typeof cache !== "boolean") errors.push("'cache' must be a boolean.");
	if (!isNonEmptyString(cacheLocation)) errors.push("'cacheLocation' must be a non‑empty string.");
	if (cacheStrategy !== "metadata" && cacheStrategy !== "content") errors.push('\'cacheStrategy\' must be any of "metadata", "content".');
	if (concurrency !== "off" && concurrency !== "auto" && !isPositiveInteger(concurrency)) errors.push('\'concurrency\' must be a positive integer, "auto", or "off".');
	if (!isNonEmptyString(cwd) || !path.isAbsolute(cwd)) errors.push("'cwd' must be an absolute path.");
	if (typeof errorOnUnmatchedPattern !== "boolean") errors.push("'errorOnUnmatchedPattern' must be a boolean.");
	if (typeof fix !== "boolean" && typeof fix !== "function") errors.push("'fix' must be a boolean or a function.");
	if (fixTypes !== null && !isFixTypeArray(fixTypes)) errors.push('\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".');
	if (!isEmptyArrayOrArrayOfNonEmptyString(flags)) errors.push("'flags' must be an array of non‑empty strings.");
	if (typeof globInputPaths !== "boolean") errors.push("'globInputPaths' must be a boolean.");
	if (typeof ignore !== "boolean") errors.push("'ignore' must be a boolean.");
	if (!isEmptyArrayOrArrayOfNonEmptyString(ignorePatterns) && ignorePatterns !== null) errors.push("'ignorePatterns' must be an array of non‑empty strings or null.");
	if (typeof overrideConfig !== "object") errors.push("'overrideConfig' must be an object or null.");
	if (!isNonEmptyString(overrideConfigFile) && overrideConfigFile !== null && overrideConfigFile !== true) errors.push("'overrideConfigFile' must be a non‑empty string, null, or true.");
	if (typeof passOnNoPatterns !== "boolean") errors.push("'passOnNoPatterns' must be a boolean.");
	if (typeof plugins !== "object") errors.push("'plugins' must be an object or null.");
	else if (plugins !== null && Object.keys(plugins).includes("")) errors.push("'plugins' must not include an empty string.");
	if (Array.isArray(plugins)) errors.push("'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead.");
	if (typeof stats !== "boolean") errors.push("'stats' must be a boolean.");
	if (typeof warnIgnored !== "boolean") errors.push("'warnIgnored' must be a boolean.");
	if (typeof ruleFilter !== "function") errors.push("'ruleFilter' must be a function.");
	if (errors.length) throw new ESLintInvalidOptionsError(errors);

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
 * Load ESLint options from a module.
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
	const normalized = path.normalize(cacheFile);
	const resolved = path.resolve(cwd, normalized);
	const looksLikeDir = normalized.slice(-1) === path.sep;

	function fileForDirectory() {
		return path.join(resolved, `${prefix}${hash(cwd)}`);
	}

	let stats;
	try {
		stats = fs.lstatSync(resolved);
	} catch {
		stats = null;
	}

	if (stats) {
		if (stats.isDirectory() || looksLikeDir) {
			return fileForDirectory();
		}
		return resolved;
	}
	if (looksLikeDir) {
		return fileForDirectory();
	}
	return resolved;
}

/**
 * Create a lint result cache if caching is enabled.
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
	const rule = config.getRuleDefinition(message.ruleId);
	return Boolean(rule && rule.meta && fixTypes.has(rule.meta.type));
}

/**
 * Wrap a fix function to respect fixTypes.
 * @param {Function|boolean} fix
 * @param {Set<string>} fixTypesSet
 * @param {CalculatedConfig} config
 * @returns {Function|boolean}
 */
function getFixerForFixTypes(fix, fixTypesSet, config) {
	if (!fix || !fixTypesSet) {
		return fix;
	}
	const original = typeof fix === "function" ? fix : () => true;
	return message => shouldMessageBeFixed(message, config, fixTypesSet) && original(message);
}

/**
 * Verify source text using the linter.
 * @param {Object} cfg
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
	const start = hrtimeBigint();
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
	const end = hrtimeBigint();
	debug('File "%s" linted in %t', filePath, end - start);
	return result;
}

/**
 * Lint a single file.
 * @param {string} filePath
 * @param {FlatConfigArray} configs
 * @param {ESLintOptions} eslintOptions
 * @param {Linter} linter
 * @param {?LintResultCache} lintResultCache
 * @param {?{duration:bigint}} readFileCounter
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
		return warnIgnored
			? createIgnoreResult(filePath, cwd, configs.getConfigStatus(filePath))
			: void 0;
	}

	if (lintResultCache) {
		const cached = lintResultCache.getCachedLintResults(filePath, config);
		if (cached) {
			const hasMessages = cached.messages && cached.messages.length > 0;
			if (hasMessages && fix) {
				debug(`Reprocessing cached file to allow autofix: ${filePath}`);
			} else {
				debug(`Skipping file since it hasn't changed: ${filePath}`);
				return cached;
			}
		}
	}

	const fixer = getFixerForFixTypes(fix, fixTypesSet, config);

	async function readAndVerify() {
		const start = hrtimeBigint();
		const text = await fsp.readFile(filePath, {
			encoding: "utf8",
			signal: controller?.signal,
		});
		const duration = hrtimeBigint() - start;
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
		? retrier.retry(readAndVerify, { signal: controller?.signal })
		: readAndVerify();

	return promise.catch(err => {
		controller?.abort(err);
		throw err;
	});
}

/**
 * Merge CLI flags with environment variable.
 * @param {string[]} flags
 * @returns {string[]}
 */
function mergeEnvironmentFlags(flags) {
	if (!process.env.ESLINT_FLAGS) {
		return flags;
	}
	const env = process.env.ESLINT_FLAGS.trim().split(/\s*,\s*/gu);
	return Array.from(new Set([...env, ...flags]));
}

/**
 * Create a new Linter instance.
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
 * Create default configs from plugins.
 * @param {Record<string, Plugin>|undefined} optionPlugins
 * @returns {Config[]}
 */
function createDefaultConfigs(optionPlugins) {
	const defaultConfigs = [];
	if (optionPlugins) {
		const plugins = {};
		for (const [name, plugin] of Object.entries(optionPlugins)) {
			plugins[getShorthandName(name, "eslint-plugin")] = plugin;
		}
		defaultConfigs.push({ plugins });
	}
	return defaultConfigs;
}

/**
 * Create a ConfigLoader.
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
	return new ConfigLoader({
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
	});
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