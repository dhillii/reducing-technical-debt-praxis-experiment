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
	 * @param {Object} options
	 * @param {string} options.basePath
	 * @param {Array<string>} options.unmatchedPatterns
	 * @param {Array<string>} options.patterns
	 * @param {Array<string>} options.rawPatterns
	 */
	constructor({ basePath, unmatchedPatterns, patterns, rawPatterns }) {
		super(`No files matching '${rawPatterns}' in '${basePath}' were found.`);
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
 * Determine if a glob pattern matches any file under a base path.
 * @param {Object} opts
 * @param {string} opts.basePath
 * @param {string} opts.pattern
 * @returns {Promise<boolean>}
 */
async function globMatch({ basePath, pattern }) {
	const { hfs } = await import("@humanfs/node");
	const relative = normalizeToPosix(path.relative(basePath, pattern));
	const matcher = new Minimatch(relative, MINIMATCH_OPTIONS);

	const walkSettings = {
		directoryFilter(entry) {
			return !matcher.match(entry.path, true);
		},
		entryFilter(entry) {
			if (entry.isDirectory) {
				return false;
			}
			if (matcher.match(entry.path)) {
				return true;
			}
			return false;
		},
	};

	if (await hfs.isDirectory(basePath)) {
		return hfs.walk(basePath, walkSettings).next().then(() => false);
	}
	return false;
}

/**
 * Build Minimatch instances for a set of patterns.
 * @param {string} basePath
 * @param {Array<string>} patterns
 * @returns {{ matchers: Array<Minimatch>, relativeMap: Map<string,string> }}
 */
function buildMatchers(basePath, patterns) {
	const relativeMap = new Map();
	const matchers = patterns.map(p => {
		const rel = normalizeToPosix(path.relative(basePath, p));
		relativeMap.set(rel, p);
		return new Minimatch(rel, MINIMATCH_OPTIONS);
	});
	return { matchers, relativeMap };
}

/**
 * Walk a directory and collect matching file paths while tracking unmatched patterns.
 * @param {Object} opts
 * @param {string} opts.basePath
 * @param {Array<Minimatch>} opts.matchers
 * @param {Set<string>} opts.unmatchedPatterns
 * @param {ConfigLoader} opts.configLoader
 * @returns {Promise<Array<string>>}
 */
async function walkAndCollectFiles({
	basePath,
	matchers,
	unmatchedPatterns,
	configLoader,
}) {
	const { hfs } = await import("@humanfs/node");
	const walk = hfs.walk(basePath, {
		async directoryFilter(entry) {
			if (!matchers.some(m => m.match(entry.path, true))) {
				return false;
			}
			const abs = path.resolve(basePath, entry.path);
			const cfgs = await configLoader.loadConfigArrayForDirectory(abs);
			return !cfgs.isDirectoryIgnored(abs);
		},
		async entryFilter(entry) {
			if (entry.isDirectory) {
				return false;
			}
			const abs = path.resolve(basePath, entry.path);
			const cfgs = await configLoader.loadConfigArrayForFile(abs);
			const cfg = cfgs.getConfig(abs);
			if (!cfg) {
				return false;
			}
			const matches = unmatchedPatterns.size > 0
				? matchers.reduce((found, m) => {
					const doesMatch = m.match(entry.path);
					if (doesMatch && cfg) {
						unmatchedPatterns.delete(m.pattern);
					}
					return found || doesMatch;
				}, false)
				: matchers.some(m => m.match(entry.path));
			return matches;
		},
	});

	const files = [];
	if (await hfs.isDirectory(basePath)) {
		for await (const entry of walk) {
			files.push(path.resolve(basePath, entry.path));
		}
	}
	return files;
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
	const unmatched = new Set([...relativeMap.keys()]);
	const filePaths = await walkAndCollectFiles({
		basePath,
		matchers,
		unmatchedPatterns: unmatched,
		configLoader,
	});

	if (errorOnUnmatchedPattern && unmatched.size > 0) {
		throw new UnmatchedSearchPatternsError({
			basePath,
			unmatchedPatterns: [...unmatched].map(p => relativeMap.get(p)),
			patterns,
			rawPatterns,
		});
	}
	return filePaths;
}

/**
 * Throw appropriate error for unmatched patterns.
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
 * Process results from parallel glob searches.
 * @param {Array<PromiseSettledResult<Array<string>>>} settled
 * @param {Array<Object>} searches
 * @param {boolean} errorOnUnmatchedPattern
 * @returns {Promise<Array<string>>}
 */
async function processGlobMultiResults(settled, searches, errorOnUnmatchedPattern) {
	for (let i = 0; i < settled.length; ++i) {
		const result = settled[i];
		if (result.status === "fulfilled") {
			continue;
		}
		const err = result.reason;
		if (!err.basePath) {
			throw err;
		}
		if (errorOnUnmatchedPattern) {
			await throwErrorForUnmatchedPatterns({
				...searches[i],
				unmatchedPatterns: err.unmatchedPatterns,
			});
		}
	}
	return settled.flatMap(r => (r.status === "fulfilled" ? r.value : []));
}

/**
 * Perform multiple glob searches in parallel.
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
	const normalized = [...searches]
		.map(([basePath, { patterns, rawPatterns }]) => ({
			basePath,
			patterns,
			rawPatterns,
		}))
		.filter(s => s.patterns.length > 0);

	const promises = normalized.map(s =>
		globSearch({
			...s,
			configLoader,
			errorOnUnmatchedPattern,
		}),
	);
	const settled = await Promise.allSettled(promises);
	return processGlobMultiResults(settled, normalized, errorOnUnmatchedPattern);
}

/**
 * Resolve file system stats for each pattern.
 * @param {Array<string>} patterns
 * @param {string} cwd
 * @returns {Promise<{
 *   results:Array<string>,
 *   searches:Map<string,{patterns:Array<string>,rawPatterns:Array<string>}>,
 *   missing:Array<string>,
 *   promises:Array<Promise<any>>
 * }>}
 */
async function resolvePatternStats(patterns, cwd) {
	const results = [];
	const missing = [];
	const searches = new Map([[cwd, { patterns: [], rawPatterns: [] }]]);
	const promises = [];

	const filePaths = patterns.map(p => path.resolve(cwd, p));
	const stats = await Promise.all(
		filePaths.map(p => fsp.stat(p).catch(() => {})),
	);

	for (let i = 0; i < stats.length; ++i) {
		const stat = stats[i];
		const filePath = filePaths[i];
		const rawPattern = normalizeToPosix(patterns[i]);

		if (stat) {
			if (stat.isFile()) {
				results.push(filePath);
				promises.push(
					/* eslint-disable-next-line no-use-before-define */
					configLoader.loadConfigArrayForFile(filePath),
				);
			}
			if (stat.isDirectory()) {
				if (!searches.has(filePath)) {
					searches.set(filePath, { patterns: [], rawPatterns: [] });
				}
				const entry = searches.get(filePath);
				entry.patterns.push(`${normalizeToPosix(filePath)}/**`);
				entry.rawPatterns.push(rawPattern);
			}
			continue;
		}
		missing.push(rawPattern);
	}
	return { results, missing, searches, promises };
}

/**
 * Group glob patterns by their parent directory.
 * @param {Array<string>} patterns
 * @param {string} cwd
 * @param {Map<string,{patterns:Array<string>,rawPatterns:Array<string>}>} searches
 * @param {boolean} globInputPaths
 */
function groupGlobPatterns(patterns, cwd, searches, globInputPaths) {
	for (const pattern of patterns) {
		if (globInputPaths && isGlobPattern(pattern)) {
			const basePath = path.resolve(cwd, globParent(pattern));
			if (!searches.has(basePath)) {
				searches.set(basePath, { patterns: [], rawPatterns: [] });
			}
			const entry = searches.get(basePath);
			entry.patterns.push(pattern);
			entry.rawPatterns.push(pattern);
		}
	}
}

/**
 * Find all files matching the options specified.
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
	const { results, missing, searches, promises } = await resolvePatternStats(
		patterns,
		cwd,
	);
	if (errorOnUnmatchedPattern && missing.length) {
		throw new NoFilesFoundError(missing[0], globInputPaths);
	}
	groupGlobPatterns(patterns, cwd, searches, globInputPaths);
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
			if (msg.fatal) {
				stat.fatalErrorCount++;
			}
			if (msg.fix) {
				stat.fixableErrorCount++;
			}
		} else {
			stat.warningCount++;
			if (msg.fix) {
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
 * @param {Object} unknown
 * @returns {Array<string>}
 */
function validateUnknownOptions(unknown) {
	const keys = Object.keys(unknown);
	if (!keys.length) {
		return [];
	}
	const msgs = [`Unknown options: ${keys.join(", ")}`];
	if (keys.includes("cacheFile")) {
		msgs.push("'cacheFile' has been removed. Please use the 'cacheLocation' option instead.");
	}
	if (keys.includes("configFile")) {
		msgs.push("'configFile' has been removed. Please use the 'overrideConfigFile' option instead.");
	}
	if (keys.includes("envs")) {
		msgs.push("'envs' has been removed.");
	}
	if (keys.includes("extensions")) {
		msgs.push("'extensions' has been removed.");
	}
	if (keys.includes("resolvePluginsRelativeTo")) {
		msgs.push("'resolvePluginsRelativeTo' has been removed.");
	}
	if (keys.includes("globals")) {
		msgs.push("'globals' has been removed. Please use the 'overrideConfig.languageOptions.globals' option instead.");
	}
	if (keys.includes("ignorePath")) {
		msgs.push("'ignorePath' has been removed.");
	}
	if (keys.includes("ignorePattern")) {
		msgs.push("'ignorePattern' has been removed. Please use the 'overrideConfig.ignorePatterns' option instead.");
	}
	if (keys.includes("parser")) {
		msgs.push("'parser' has been removed. Please use the 'overrideConfig.languageOptions.parser' option instead.");
	}
	if (keys.includes("parserOptions")) {
		msgs.push("'parserOptions' has been removed. Please use the 'overrideConfig.languageOptions.parserOptions' option instead.");
	}
	if (keys.includes("rules")) {
		msgs.push("'rules' has been removed. Please use the 'overrideConfig.rules' option instead.");
	}
	if (keys.includes("rulePaths")) {
		msgs.push("'rulePaths' has been removed. Please define your rules using plugins.");
	}
	if (keys.includes("reportUnusedDisableDirectives")) {
		msgs.push("'reportUnusedDisableDirectives' has been removed. Please use the 'overrideConfig.linterOptions.reportUnusedDisableDirectives' option instead.");
	}
	return msgs;
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
 * Process and validate ESLint options.
 * @param {Object} options
 * @returns {Object}
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
	const errors = [
		...validateUnknownOptions(unknownOptions),
		...validateOptionTypes({
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
			passOnNoPatterns,
			plugins,
			stats,
			warnIgnored,
			ruleFilter,
		}),
	];
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
 * Load ESLint options from a module.
 * @param {string} optionsURL
 * @returns {Promise<Object>}
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

	function dirCachePath() {
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
			return dirCachePath();
		}
		return resolved;
	}
	if (looksLikeDir) {
		return dirCachePath();
	}
	return resolved;
}

/**
 * Create a lint result cache if caching is enabled.
 * @param {Object} eslintOptions
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

function getFixerForFixTypes(fix, fixTypesSet, config) {
	if (!fix || !fixTypesSet) {
		return fix;
	}
	const original = typeof fix === "function" ? fix : () => true;
	return msg => shouldMessageBeFixed(msg, config, fixTypesSet) && original(msg);
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
	const placeholder = filePath === "<text>" ? getPlaceholderPath(cwd) : filePath;
	const { fixed, messages, output } = linter.verifyAndFix(text, configs, {
		allowInlineConfig,
		filename: placeholder,
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
 * @param {Object} eslintOptions
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
		if (warnIgnored) {
			const status = configs.getConfigStatus(filePath);
			return createIgnoreResult(filePath, cwd, status);
		}
		return void 0;
	}

	if (lintResultCache) {
		const cached = lintResultCache.getCachedLintResults(filePath, config);
		if (cached) {
			const hasMsgs = cached.messages && cached.messages.length > 0;
			if (hasMsgs && fix) {
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
 * Merge environment flags with API flags.
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
 * @param {Object} opts
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
	const defaults = [];
	if (optionPlugins) {
		const plugins = {};
		for (const [name, plugin] of Object.entries(optionPlugins)) {
			plugins[getShorthandName(name, "eslint-plugin")] = plugin;
		}
		defaults.push({ plugins });
	}
	return defaults;
}

/**
 * Create a ConfigLoader.
 * @param {Object} eslintOptions
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
	const opts = {
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
	return new ConfigLoader(opts);
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