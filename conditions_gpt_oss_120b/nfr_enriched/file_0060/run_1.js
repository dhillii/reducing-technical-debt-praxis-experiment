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
		super(`No files matching '${rawPatterns}' in '${basePath}' were found.`);
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
 * Determine if a glob pattern matches any file under a base directory.
 * @param {Object} opts
 * @param {string} opts.basePath
 * @param {string} opts.pattern absolute glob pattern
 * @returns {Promise<boolean>}
 */
async function globMatch({ basePath, pattern }) {
	const { hfs } = await import("@humanfs/node");
	const relPattern = normalizeToPosix(path.relative(basePath, pattern));
	const matcher = new Minimatch(relPattern, MINIMATCH_OPTIONS);
	let found = false;

	const walkSettings = {
		directoryFilter(entry) {
			return !found && matcher.match(entry.path, true);
		},
		entryFilter(entry) {
			if (found || entry.isDirectory) return false;
			if (matcher.match(entry.path)) {
				found = true;
				return true;
			}
			return false;
		},
	};

	if (await hfs.isDirectory(basePath)) {
		await hfs.walk(basePath, walkSettings).next();
	}
	return found;
}

/**
 * Build Minimatch instances for a set of patterns.
 * @param {string} basePath
 * @param {Array<string>} patterns absolute patterns
 * @returns {{matchers: Array<Minimatch>, map: Map<string,string>}}
 */
function buildMatchers(basePath, patterns) {
	const map = new Map();
	const matchers = patterns.map(p => {
		const rel = normalizeToPosix(path.relative(basePath, p));
		map.set(rel, p);
		return new Minimatch(rel, MINIMATCH_OPTIONS);
	});
	return { matchers, map };
}

/**
 * Walk a directory and collect files that match any of the provided matchers.
 * @param {Object} opts
 * @param {string} opts.basePath
 * @param {Array<Minimatch>} opts.matchers
 * @param {ConfigLoader} opts.configLoader
 * @param {Set<string>} opts.unmatchedPatterns
 * @returns {Promise<Array<string>>}
 */
async function collectMatchingFiles({
	basePath,
	matchers,
	configLoader,
	unmatchedPatterns,
}) {
	const { hfs } = await import("@humanfs/node");
	const walk = hfs.walk(basePath, {
		async directoryFilter(entry) {
			if (!matchers.some(m => m.match(entry.path, true))) return false;
			const abs = path.resolve(basePath, entry.path);
			const cfgs = await configLoader.loadConfigArrayForDirectory(abs);
			return !cfgs.isDirectoryIgnored(abs);
		},
		async entryFilter(entry) {
			if (entry.isDirectory) return false;
			const abs = path.resolve(basePath, entry.path);
			const cfgs = await configLoader.loadConfigArrayForFile(abs);
			const cfg = cfgs.getConfig(abs);
			if (!cfg) return false;

			const matches = unmatchedPatterns.size
				? matchers.reduce((found, m) => {
						const doesMatch = m.match(entry.path);
						if (doesMatch && cfg) unmatchedPatterns.delete(m.pattern);
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
 * @returns {Promise<Array<string>>}
 */
async function globSearch({
	basePath,
	patterns,
	rawPatterns,
	configLoader,
	errorOnUnmatchedPattern,
}) {
	if (!patterns.length) return [];

	const { matchers, map } = buildMatchers(basePath, patterns);
	const unmatched = new Set([...map.keys()]);

	const files = await collectMatchingFiles({
		basePath,
		matchers,
		configLoader,
		unmatchedPatterns: unmatched,
	});

	if (errorOnUnmatchedPattern && unmatched.size) {
		throw new UnmatchedSearchPatternsError({
			basePath,
			unmatchedPatterns: [...unmatched].map(p => map.get(p)),
			patterns,
			rawPatterns,
		});
	}
	return files;
}

/**
 * Throw the appropriate error for a set of unmatched patterns.
 * @param {Object} opts
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
	if (hasMatch) throw new AllFilesIgnoredError(rawPattern);
	throw new NoFilesFoundError(rawPattern, true);
}

/**
 * Execute multiple glob searches in parallel and handle errors.
 * @param {Object} opts
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
		.filter(s => s.patterns.length);

	const settled = await Promise.allSettled(
		normalized.map(s =>
			globSearch({
				...s,
				configLoader,
				errorOnUnmatchedPattern,
			}),
		),
	);

	for (let i = 0; i < settled.length; i++) {
		const result = settled[i];
		if (result.status === "rejected") {
			const err = result.reason;
			if (!err.basePath) throw err;
			if (errorOnUnmatchedPattern) {
				await throwErrorForUnmatchedPatterns({
					...normalized[i],
					unmatchedPatterns: err.unmatchedPatterns,
				});
			}
		}
	}
	return settled.flatMap(r => (r.status === "fulfilled" ? r.value : []));
}

/**
 * Resolve a pattern to either a file list or a glob search.
 * @param {Object} ctx
 * @returns {Promise<void>}
 */
async function processPattern({
	pattern,
	absolutePath,
	normalizedPattern,
	searches,
	globbyPatterns,
	rawPatterns,
	cwd,
	globInputPaths,
	missingPatterns,
}) {
	const stat = await fsp.stat(absolutePath).catch(() => null);
	if (stat) {
		if (stat.isFile()) {
			ctx.results.push(absolutePath);
			ctx.promises.push(ctx.configLoader.loadConfigArrayForFile(absolutePath));
		} else if (stat.isDirectory()) {
			if (!searches.has(absolutePath)) {
				searches.set(absolutePath, { patterns: [], rawPatterns: [] });
			}
			const entry = searches.get(absolutePath);
			entry.patterns.push(`${normalizeToPosix(absolutePath)}/**`);
			entry.rawPatterns.push(normalizedPattern);
		}
		return;
	}

	if (globInputPaths && isGlobPattern(normalizedPattern)) {
		const basePath = path.resolve(cwd, globParent(normalizedPattern));
		if (!searches.has(basePath)) {
			searches.set(basePath, { patterns: [], rawPatterns: [] });
		}
		const entry = searches.get(basePath);
		entry.patterns.push(absolutePath);
		entry.rawPatterns.push(normalizedPattern);
	} else {
		missingPatterns.push(normalizedPattern);
	}
}

/**
 * Find files based on patterns and options.
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
	const searches = new Map([[cwd, { patterns: [], rawPatterns: [] }]]);
	const promises = [];

	const absolutePaths = patterns.map(p => path.resolve(cwd, p));
	const normalizedPatterns = patterns.map(p => normalizeToPosix(p));

	for (let i = 0; i < absolutePaths.length; i++) {
		await processPattern({
			pattern: patterns[i],
			absolutePath: absolutePaths[i],
			normalizedPattern: normalizedPatterns[i],
			searches,
			globbyPatterns: null,
			rawPatterns: null,
			cwd,
			globInputPaths,
			missingPatterns,
			results,
			promises,
			configLoader,
		});
	}

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
 * Return placeholder file path.
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
 * Create a lint result for an ignored file.
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
			const inNodeModules =
				baseDir &&
				path
					.dirname(path.relative(baseDir, filePath))
					.split(path.sep)
					.includes("node_modules");
			message = inNodeModules
				? 'File ignored by default because it is located under the node_modules directory. Use ignore pattern "!**/node_modules/" to disable file ignore settings or "--no-warn-ignored" to suppress this warning.'
				: 'File ignored because of a matching ignore pattern. Use "--no-ignore" to disable file ignore settings or "--no-warn-ignored" to suppress this warning.';
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
 * Compute per‑file statistics.
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

	for (const m of messages) {
		if (m.fatal || m.severity === 2) {
			stat.errorCount++;
			if (m.fatal) stat.fatalErrorCount++;
			if (m.fix) stat.fixableErrorCount++;
		} else {
			stat.warningCount++;
			if (m.fix) stat.fixableWarningCount++;
		}
	}
	return stat;
}

//-----------------------------------------------------------------------------
// Options-related Helpers
//-----------------------------------------------------------------------------

function isFixType(x) {
	return ["directive", "problem", "suggestion", "layout"].includes(x);
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

	// unknown options
	const unknownKeys = Object.keys(unknownOptions);
	if (unknownKeys.length) {
		errors.push(`Unknown options: ${unknownKeys.join(", ")}`);
		const deprecations = {
			cacheFile: "'cacheFile' has been removed. Please use the 'cacheLocation' option instead.",
			configFile: "'configFile' has been removed. Please use the 'overrideConfigFile' option instead.",
			envs: "'envs' has been removed.",
			extensions: "'extensions' has been removed.",
			resolvePluginsRelativeTo: "'resolvePluginsRelativeTo' has been removed.",
			globals: "'globals' has been removed. Please use the 'overrideConfig.languageOptions.globals' option instead.",
			ignorePath: "'ignorePath' has been removed.",
			ignorePattern: "'ignorePattern' has been removed. Please use the 'overrideConfig.ignorePatterns' option instead.",
			parser: "'parser' has been removed. Please use the 'overrideConfig.languageOptions.parser' option instead.",
			parserOptions: "'parserOptions' has been removed. Please use the 'overrideConfig.languageOptions.parserOptions' option instead.",
			rules: "'rules' has been removed. Please use the 'overrideConfig.rules' option instead.",
			rulePaths: "'rulePaths' has been removed. Please define your rules using plugins.",
			reportUnusedDisableDirectives: "'reportUnusedDisableDirectives' has been removed. Please use the 'overrideConfig.linterOptions.reportUnusedDisableDirectives' option instead.",
		};
		for (const key of unknownKeys) {
			if (deprecations[key]) errors.push(deprecations[key]);
		}
	}

	// type checks
	if (typeof allowInlineConfig !== "boolean") errors.push("'allowInlineConfig' must be a boolean.");
	if (typeof baseConfig !== "object") errors.push("'baseConfig' must be an object or null.");
	if (typeof cache !== "boolean") errors.push("'cache' must be a boolean.");
	if (!isNonEmptyString(cacheLocation)) errors.push("'cacheLocation' must be a non-empty string.");
	if (!["metadata", "content"].includes(cacheStrategy)) errors.push('\'cacheStrategy\' must be any of "metadata", "content".');
	if (concurrency !== "off" && concurrency !== "auto" && !isPositiveInteger(concurrency))
		errors.push('\'concurrency\' must be a positive integer, "auto", or "off".');
	if (!isNonEmptyString(cwd) || !path.isAbsolute(cwd)) errors.push("'cwd' must be an absolute path.");
	if (typeof errorOnUnmatchedPattern !== "boolean") errors.push("'errorOnUnmatchedPattern' must be a boolean.");
	if (typeof fix !== "boolean" && typeof fix !== "function") errors.push("'fix' must be a boolean or a function.");
	if (fixTypes !== null && !isFixTypeArray(fixTypes)) errors.push('\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".');
	if (!isEmptyArrayOrArrayOfNonEmptyString(flags)) errors.push("'flags' must be an array of non-empty strings.");
	if (typeof globInputPaths !== "boolean") errors.push("'globInputPaths' must be a boolean.");
	if (typeof ignore !== "boolean") errors.push("'ignore' must be a boolean.");
	if (!isEmptyArrayOrArrayOfNonEmptyString(ignorePatterns) && ignorePatterns !== null)
		errors.push("'ignorePatterns' must be an array of non-empty strings or null.");
	if (typeof overrideConfig !== "object") errors.push("'overrideConfig' must be an object or null.");
	if (!isNonEmptyString(overrideConfigFile) && overrideConfigFile !== null && overrideConfigFile !== true)
		errors.push("'overrideConfigFile' must be a non-empty string, null, or true.");
	if (typeof passOnNoPatterns !== "boolean") errors.push("'passOnNoPatterns' must be a boolean.");
	if (typeof plugins !== "object") errors.push("'plugins' must be an object or null.");
	else if (plugins && Object.keys(plugins).includes("")) errors.push("'plugins' must not include an empty string.");
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
 * @param {string} url
 * @returns {Promise<ESLintOptions>}
 */
async function loadOptionsFromModule(url) {
	return (await import(url)).default;
}

//-----------------------------------------------------------------------------
// Cache-related helpers
//-----------------------------------------------------------------------------

function getCacheFile(cacheFile, cwd, { prefix = ".cache_" } = {}) {
	const normalized = path.normalize(cacheFile);
	const resolved = path.resolve(cwd, normalized);
	const looksLikeDir = normalized.endsWith(path.sep);

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
		if (stats.isDirectory() || looksLikeDir) return dirCachePath();
		return resolved;
	}
	if (looksLikeDir) return dirCachePath();
	return resolved;
}

/**
 * Create a lint result cache if caching is enabled.
 * @param {ESLintOptions} opts
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
	if (!message.ruleId) return fixTypes.has("directive");
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
	if (!fix || !fixTypesSet) return fix;
	const original = typeof fix === "function" ? fix : () => true;
	return msg => shouldMessageBeFixed(msg, config, fixTypesSet) && original(msg);
}

/**
 * Verify source text and return a lint result.
 * @param {Object} opts
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
	const filename = filePath === "<text>" ? getPlaceholderPath(cwd) : filePath;

	const { fixed, messages, output } = linter.verifyAndFix(text, configs, {
		allowInlineConfig,
		filename,
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

	if (fixed) result.output = output;
	if (result.errorCount + result.warningCount > 0 && result.output === void 0) {
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
			const hasMsgs = cached.messages?.length;
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
		const startRead = hrtimeBigint();
		const text = await fsp.readFile(filePath, {
			encoding: "utf8",
			signal: controller?.signal,
		});
		const endRead = hrtimeBigint();
		const duration = endRead - startRead;
		debug('File "%s" read in %t', filePath, duration);
		if (readFileCounter) readFileCounter.duration += duration;
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

	const exec = retrier
		? retrier.retry(readAndVerify, { signal: controller?.signal })
		: readAndVerify();

	return exec.catch(err => {
		controller?.abort(err);
		throw err;
	});
}

/**
 * Merge CLI flags with environment flags.
 * @param {string[]} flags
 * @returns {string[]}
 */
function mergeEnvironmentFlags(flags) {
	if (!process.env.ESLINT_FLAGS) return flags;
	const env = process.env.ESLINT_FLAGS.trim().split(/\s*,\s*/gu);
	return Array.from(new Set([...env, ...flags]));
}

/**
 * Create a new Linter instance.
 * @param {ESLintOptions} opts
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
 * Build a ConfigLoader.
 * @param {ESLintOptions} opts
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
```