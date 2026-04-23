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
	 * @param {string} pattern
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
 * @param {Object} opts
 * @param {string} opts.basePath
 * @param {string} opts.pattern
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
		await hfs.walk(basePath, walkSettings).next();
	}
	return found;
}

/**
 * Build a map of relative pattern -> original absolute pattern and an array of Minimatch instances.
 * @param {string} basePath
 * @param {Array<string>} patterns
 * @returns {{relativeMap:Map<string,string>, matchers:Array<Minimatch>}}
 */
function buildMatchers(basePath, patterns) {
	const relativeMap = new Map();
	const matchers = patterns.map((absPattern, i) => {
		const rel = normalizeToPosix(path.relative(basePath, absPattern));
		relativeMap.set(rel, patterns[i]);
		return new Minimatch(rel, MINIMATCH_OPTIONS);
	});
	return { relativeMap, matchers };
}

/**
 * Determines which patterns remain unmatched after processing a file entry.
 * @param {Array<Minimatch>} matchers
 * @param {Set<string>} unmatched
 * @param {string} entryPath
 * @param {object} configResult
 * @returns {boolean} true if the entry matches any pattern
 */
function evaluateEntry(matchers, unmatched, entryPath, configResult) {
	if (unmatched.size === 0) {
		return matchers.some(m => m.match(entryPath));
	}
	let matched = false;
	for (const matcher of matchers) {
		if (matcher.match(entryPath)) {
			matched = true;
			if (configResult) {
				unmatched.delete(matcher.pattern);
			}
		}
	}
	return matched;
}

/**
 * Searches a directory for files matching the given glob patterns.
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

	const { relativeMap, matchers } = buildMatchers(basePath, patterns);
	const unmatched = new Set([...relativeMap.keys()]);
	const { hfs } = await import("@humanfs/node");

	const walk = hfs.walk(basePath, {
		async directoryFilter(entry) {
			if (!matchers.some(m => m.match(entry.path, true))) {
				return false;
			}
			const abs = path.resolve(basePath, entry.path);
			const cfgArray = await configLoader.loadConfigArrayForDirectory(abs);
			return !cfgArray.isDirectoryIgnored(abs);
		},
		async entryFilter(entry) {
			if (entry.isDirectory) {
				return false;
			}
			const abs = path.resolve(basePath, entry.path);
			const cfgArray = await configLoader.loadConfigArrayForFile(abs);
			const cfg = cfgArray.getConfig(abs);
			const matches = evaluateEntry(matchers, unmatched, entry.path, cfg);
			return matches && cfg !== void 0;
		},
	});

	const results = [];
	if (await hfs.isDirectory(basePath)) {
		for await (const entry of walk) {
			results.push(path.resolve(basePath, entry.path));
		}
	}

	if (errorOnUnmatchedPattern && unmatched.size > 0) {
		throw new UnmatchedSearchPatternsError({
			basePath,
			unmatchedPatterns: [...unmatched].map(p => relativeMap.get(p)),
			patterns,
			rawPatterns,
		});
	}
	return results;
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
 * Performs multiple glob searches in parallel.
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

	for (let i = 0; i < settled.length; ++i) {
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
	return settled.flatMap(r => (r.status === "fulfilled" ? r.value : []));
}

/**
 * Finds all files matching the options specified.
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
	const missing = [];
	const searches = new Map([[cwd, { patterns: [], rawPatterns: [] }]]);

	const absolutePaths = patterns.map(p => path.resolve(cwd, p));
	const stats = await Promise.all(
		absolutePaths.map(p => fsp.stat(p).catch(() => {})),
	);

	for (let i = 0; i < stats.length; ++i) {
		const stat = stats[i];
		const absPath = absolutePaths[i];
		const rawPattern = normalizeToPosix(patterns[i]);

		if (stat) {
			if (stat.isFile()) {
				results.push(absPath);
				await configLoader.loadConfigArrayForFile(absPath);
			} else if (stat.isDirectory()) {
				if (!searches.has(absPath)) {
					searches.set(absPath, { patterns: [], rawPatterns: [] });
				}
				const entry = searches.get(absPath);
				entry.patterns.push(`${normalizeToPosix(absPath)}/**`);
				entry.rawPatterns.push(rawPattern);
			}
			continue;
		}

		if (globInputPaths && isGlobPattern(rawPattern)) {
			const base = path.resolve(cwd, globParent(rawPattern));
			if (!searches.has(base)) {
				searches.set(base, { patterns: [], rawPatterns: [] });
			}
			const entry = searches.get(base);
			entry.patterns.push(absPath);
			entry.rawPatterns.push(rawPattern);
		} else {
			missing.push(rawPattern);
		}
	}

	if (errorOnUnmatchedPattern && missing.length) {
		throw new NoFilesFoundError(missing[0], globInputPaths);
	}

	const globby = await globMultiSearch({
		searches,
		configLoader,
		errorOnUnmatchedPattern,
	});

	return [...new Set([...results, ...globby])];
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
				? 'File ignored by default because it is located under the node_modules directory. Use ignore pattern "!**/node_modules/" to disable file ignore settings or use "--no-warn-ignored" to suppress this warning.'
				: 'File ignored because of a matching ignore pattern. Use "--no-ignore" to disable file ignore settings or use "--no-warn-ignored" to suppress this warning.';
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

function calculateStatsPerFile(messages) {
	const stats = {
		errorCount: 0,
		fatalErrorCount: 0,
		warningCount: 0,
		fixableErrorCount: 0,
		fixableWarningCount: 0,
	};
	for (const m of messages) {
		if (m.fatal || m.severity === 2) {
			stats.errorCount++;
			if (m.fatal) stats.fatalErrorCount++;
			if (m.fix) stats.fixableErrorCount++;
		} else {
			stats.warningCount++;
			if (m.fix) stats.fixableWarningCount++;
		}
	}
	return stats;
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
 * Validates and normalizes options for the wrapped CLIEngine instance.
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
	const errors = [];
	const unknownKeys = Object.keys(unknownOptions);
	if (unknownKeys.length) {
		errors.push(`Unknown options: ${unknownKeys.join(", ")}`);
		if (unknownKeys.includes("cacheFile")) {
			errors.push(
				"'cacheFile' has been removed. Please use the 'cacheLocation' option instead.",
			);
		}
		if (unknownKeys.includes("configFile")) {
			errors.push(
				"'configFile' has been removed. Please use the 'overrideConfigFile' option instead.",
			);
		}
		if (unknownKeys.includes("envs")) errors.push("'envs' has been removed.");
		if (unknownKeys.includes("extensions")) errors.push("'extensions' has been removed.");
		if (unknownKeys.includes("resolvePluginsRelativeTo"))
			errors.push("'resolvePluginsRelativeTo' has been removed.");
		if (unknownKeys.includes("globals"))
			errors.push(
				"'globals' has been removed. Please use the 'overrideConfig.languageOptions.globals' option instead.",
			);
		if (unknownKeys.includes("ignorePath")) errors.push("'ignorePath' has been removed.");
		if (unknownKeys.includes("ignorePattern"))
			errors.push(
				"'ignorePattern' has been removed. Please use the 'overrideConfig.ignorePatterns' option instead.",
			);
		if (unknownKeys.includes("parser"))
			errors.push(
				"'parser' has been removed. Please use the 'overrideConfig.languageOptions.parser' option instead.",
			);
		if (unknownKeys.includes("parserOptions"))
			errors.push(
				"'parserOptions' has been removed. Please use the 'overrideConfig.languageOptions.parserOptions' option instead.",
			);
		if (unknownKeys.includes("rules"))
			errors.push(
				"'rules' has been removed. Please use the 'overrideConfig.rules' option instead.",
			);
		if (unknownKeys.includes("rulePaths"))
			errors.push(
				"'rulePaths' has been removed. Please define your rules using plugins.",
			);
		if (unknownKeys.includes("reportUnusedDisableDirectives"))
			errors.push(
				"'reportUnusedDisableDirectives' has been removed. Please use the 'overrideConfig.linterOptions.reportUnusedDisableDirectives' option instead.",
			);
	}
	if (typeof allowInlineConfig !== "boolean") errors.push("'allowInlineConfig' must be a boolean.");
	if (typeof baseConfig !== "object") errors.push("'baseConfig' must be an object or null.");
	if (typeof cache !== "boolean") errors.push("'cache' must be a boolean.");
	if (!isNonEmptyString(cacheLocation)) errors.push("'cacheLocation' must be a non-empty string.");
	if (!["metadata", "content"].includes(cacheStrategy))
		errors.push('\'cacheStrategy\' must be any of "metadata", "content".');
	if (
		concurrency !== "off" &&
		concurrency !== "auto" &&
		!isPositiveInteger(concurrency)
	) {
		errors.push('\'concurrency\' must be a positive integer, "auto", or "off".');
	}
	if (!isNonEmptyString(cwd) || !path.isAbsolute(cwd)) errors.push("'cwd' must be an absolute path.");
	if (typeof errorOnUnmatchedPattern !== "boolean") errors.push("'errorOnUnmatchedPattern' must be a boolean.");
	if (typeof fix !== "boolean" && typeof fix !== "function") errors.push("'fix' must be a boolean or a function.");
	if (fixTypes !== null && !isFixTypeArray(fixTypes))
		errors.push(
			'\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".',
		);
	if (!isEmptyArrayOrArrayOfNonEmptyString(flags)) errors.push("'flags' must be an array of non-empty strings.");
	if (typeof globInputPaths !== "boolean") errors.push("'globInputPaths' must be a boolean.");
	if (typeof ignore !== "boolean") errors.push("'ignore' must be a boolean.");
	if (
		!isEmptyArrayOrArrayOfNonEmptyString(ignorePatterns) &&
		ignorePatterns !== null
	) {
		errors.push("'ignorePatterns' must be an array of non-empty strings or null.");
	}
	if (typeof overrideConfig !== "object") errors.push("'overrideConfig' must be an object or null.");
	if (
		!isNonEmptyString(overrideConfigFile) &&
		overrideConfigFile !== null &&
		overrideConfigFile !== true
	) {
		errors.push("'overrideConfigFile' must be a non-empty string, null, or true.");
	}
	if (typeof passOnNoPatterns !== "boolean") errors.push("'passOnNoPatterns' must be a boolean.");
	if (typeof plugins !== "object") errors.push("'plugins' must be an object or null.");
	else if (plugins !== null && Object.keys(plugins).includes("")) errors.push("'plugins' must not include an empty string.");
	if (Array.isArray(plugins))
		errors.push(
			"'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead.",
		);
	if (typeof stats !== "boolean") errors.push("'stats' must be a boolean.");
	if (typeof warnIgnored !== "boolean") errors.push("'warnIgnored' must be a boolean.");
	if (typeof ruleFilter !== "function") errors.push("'ruleFilter' must be a function.");

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
 * Loads ESLint constructor options from an options module.
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
 * Creates a new lint result cache.
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
 * Verifies source text.
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
 * Lints a single file.
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
 * Merges environment flags.
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
 * Creates a new linter instance.
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
 * Creates default configs with the specified plugins.
 * @param {Record<string, Plugin>} optionPlugins
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
 * Creates a config loader.
 * @param {Object} opts
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