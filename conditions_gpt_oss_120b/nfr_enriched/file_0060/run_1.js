"use strict";

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

const Minimatch = minimatch.Minimatch;
const MINIMATCH_OPTIONS = { dot: true };
const hrtimeBigint = process.hrtime.bigint;

createDebug.formatters.t = timeDiff =>
	`${(timeDiff + 500_000n) / 1_000_000n} ms`;

const debug = createDebug(
	`eslint:eslint-helpers${isMainThread ? "" : `:thread-${threadId}`}`,
);

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

/* ---------- General Helpers ---------- */

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

/* ---------- File Helpers ---------- */

function normalizeToPosix(pattern) {
	return pattern.replace(/\\/gu, "/");
}

function isGlobPattern(pattern) {
	return isGlob(path.sep === "\\" ? normalizeToPosix(pattern) : pattern);
}

/**
 * Determines if a glob pattern matches any file under basePath.
 */
async function globMatch({ basePath, pattern }) {
	const { hfs } = await import("@humanfs/node");
	const relative = normalizeToPosix(path.relative(basePath, pattern));
	const matcher = new Minimatch(relative, MINIMATCH_OPTIONS);
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
		return hfs.walk(basePath, walkSettings).next().then(() => found);
	}
	return found;
}

/**
 * Build Minimatch instances and related lookup maps.
 */
function buildMatcherData(basePath, patterns) {
	const relativeToPatterns = new Map();
	const matchers = patterns.map((pattern, i) => {
		const rel = normalizeToPosix(path.relative(basePath, pattern));
		relativeToPatterns.set(rel, patterns[i]);
		return new Minimatch(rel, MINIMATCH_OPTIONS);
	});
	const unmatched = new Set([...relativeToPatterns.keys()]);
	return { matchers, relativeToPatterns, unmatched };
}

/**
 * Walk the filesystem and collect files that match any of the provided matchers.
 */
async function walkAndCollectFiles(basePath, matchers, unmatched, configLoader) {
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
			const matches = unmatched.size > 0
				? matchers.reduce((found, matcher) => {
					const doesMatch = matcher.match(entry.path);
					if (doesMatch && cfg) {
						unmatched.delete(matcher.pattern);
					}
					return found || doesMatch;
				}, false)
				: matchers.some(m => m.match(entry.path));
			return matches && cfg !== void 0;
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
 * Search a directory for files matching the given glob patterns.
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
	const { matchers, relativeToPatterns, unmatched } = buildMatcherData(basePath, patterns);
	const filePaths = await walkAndCollectFiles(basePath, matchers, unmatched, configLoader);

	if (errorOnUnmatchedPattern && unmatched.size > 0) {
		throw new UnmatchedSearchPatternsError({
			basePath,
			unmatchedPatterns: [...unmatched].map(p => relativeToPatterns.get(p)),
			patterns,
			rawPatterns,
		});
	}
	return filePaths;
}

/**
 * Throw appropriate error for unmatched patterns.
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
 * Perform multiple glob searches in parallel and aggregate results.
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
 * Resolve explicit file paths and prepare glob searches.
 */
async function prepareSearches({
	patterns,
	globInputPaths,
	cwd,
	configLoader,
}) {
	const results = [];
	const missing = [];
	const searches = new Map([[cwd, { patterns: [], rawPatterns: [] }]]);
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

		if (globInputPaths && isGlobPattern(rawPattern)) {
			const base = path.resolve(cwd, globParent(rawPattern));
			if (!searches.has(base)) {
				searches.set(base, { patterns: [], rawPatterns: [] });
			}
			const entry = searches.get(base);
			entry.patterns.push(filePath);
			entry.rawPatterns.push(rawPattern);
		} else {
			missing.push(rawPattern);
		}
	}
	return { results, missing, searches };
}

/**
 * Find all files matching the provided patterns.
 */
async function findFiles({
	patterns,
	globInputPaths,
	cwd,
	configLoader,
	errorOnUnmatchedPattern,
}) {
	const { results, missing, searches } = await prepareSearches({
		patterns,
		globInputPaths,
		cwd,
		configLoader,
	});

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
 * Return placeholder file path.
 */
function getPlaceholderPath(cwd) {
	return path.join(cwd, "__placeholder__.js");
}

/* ---------- Results Helpers ---------- */

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
	const stat = {
		errorCount: 0,
		fatalErrorCount: 0,
		warningCount: 0,
		fixableErrorCount: 0,
		fixableWarningCount: 0,
	};
	for (let i = 0; i < messages.length; ++i) {
		const m = messages[i];
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

/* ---------- Options Helpers ---------- */

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
 * Validate unknown options and collect related messages.
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
	if (keys.includes("envs")) msgs.push("'envs' has been removed.");
	if (keys.includes("extensions")) msgs.push("'extensions' has been removed.");
	if (keys.includes("resolvePluginsRelativeTo")) msgs.push("'resolvePluginsRelativeTo' has been removed.");
	if (keys.includes("globals")) msgs.push("'globals' has been removed. Please use the 'overrideConfig.languageOptions.globals' option instead.");
	if (keys.includes("ignorePath")) msgs.push("'ignorePath' has been removed.");
	if (keys.includes("ignorePattern")) msgs.push("'ignorePattern' has been removed. Please use the 'overrideConfig.ignorePatterns' option instead.");
	if (keys.includes("parser")) msgs.push("'parser' has been removed. Please use the 'overrideConfig.languageOptions.parser' option instead.");
	if (keys.includes("parserOptions")) msgs.push("'parserOptions' has been removed. Please use the 'overrideConfig.languageOptions.parserOptions' option instead.");
	if (keys.includes("rules")) msgs.push("'rules' has been removed. Please use the 'overrideConfig.rules' option instead.");
	if (keys.includes("rulePaths")) msgs.push("'rulePaths' has been removed. Please define your rules using plugins.");
	if (keys.includes("reportUnusedDisableDirectives")) msgs.push("'reportUnusedDisableDirectives' has been removed. Please use the 'overrideConfig.linterOptions.reportUnusedDisableDirectives' option instead.");
	return msgs;
}

/**
 * Validate each known option and collect error messages.
 */
function validateOptionTypes(opts) {
	const msgs = [];

	if (typeof opts.allowInlineConfig !== "boolean") msgs.push("'allowInlineConfig' must be a boolean.");
	if (typeof opts.baseConfig !== "object") msgs.push("'baseConfig' must be an object or null.");
	if (typeof opts.cache !== "boolean") msgs.push("'cache' must be a boolean.");
	if (!isNonEmptyString(opts.cacheLocation)) msgs.push("'cacheLocation' must be a non-empty string.");
	if (!["metadata", "content"].includes(opts.cacheStrategy)) msgs.push('\'cacheStrategy\' must be any of "metadata", "content".');
	if (opts.concurrency !== "off" && opts.concurrency !== "auto" && !isPositiveInteger(opts.concurrency)) {
		msgs.push('\'concurrency\' must be a positive integer, "auto", or "off".');
	}
	if (!isNonEmptyString(opts.cwd) || !path.isAbsolute(opts.cwd)) msgs.push("'cwd' must be an absolute path.");
	if (typeof opts.errorOnUnmatchedPattern !== "boolean") msgs.push("'errorOnUnmatchedPattern' must be a boolean.");
	if (typeof opts.fix !== "boolean" && typeof opts.fix !== "function") msgs.push("'fix' must be a boolean or a function.");
	if (opts.fixTypes !== null && !isFixTypeArray(opts.fixTypes)) {
		msgs.push('\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".');
	}
	if (!isEmptyArrayOrArrayOfNonEmptyString(opts.flags)) msgs.push("'flags' must be an array of non-empty strings.");
	if (typeof opts.globInputPaths !== "boolean") msgs.push("'globInputPaths' must be a boolean.");
	if (typeof opts.ignore !== "boolean") msgs.push("'ignore' must be a boolean.");
	if (!isEmptyArrayOrArrayOfNonEmptyString(opts.ignorePatterns) && opts.ignorePatterns !== null) {
		msgs.push("'ignorePatterns' must be an array of non-empty strings or null.");
	}
	if (typeof opts.overrideConfig !== "object") msgs.push("'overrideConfig' must be an object or null.");
	if (!isNonEmptyString(opts.overrideConfigFile) && opts.overrideConfigFile !== null && opts.overrideConfigFile !== true) {
		msgs.push("'overrideConfigFile' must be a non-empty string, null, or true.");
	}
	if (typeof opts.passOnNoPatterns !== "boolean") msgs.push("'passOnNoPatterns' must be a boolean.");
	if (typeof opts.plugins !== "object") msgs.push("'plugins' must be an object or null.");
	else if (opts.plugins !== null && Object.keys(opts.plugins).includes("")) msgs.push("'plugins' must not include an empty string.");
	if (Array.isArray(opts.plugins)) msgs.push("'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead.");
	if (typeof opts.stats !== "boolean") msgs.push("'stats' must be a boolean.");
	if (typeof opts.warnIgnored !== "boolean") msgs.push("'warnIgnored' must be a boolean.");
	if (typeof opts.ruleFilter !== "function") msgs.push("'ruleFilter' must be a function.");

	return msgs;
}

/**
 * Process and validate ESLint options.
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
	const unknownMsgs = validateUnknownOptions(unknownOptions);
	const typeMsgs = validateOptionTypes({
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

	const errors = [...unknownMsgs, ...typeMsgs];
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
 * Load options from a module URL.
 */
async function loadOptionsFromModule(optionsURL) {
	return (await import(optionsURL)).default;
}

/* ---------- Cache Helpers ---------- */

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

function createLintResultCache({ cache, cacheStrategy }, cacheFilePath) {
	return cache ? new LintResultCache(cacheFilePath, cacheStrategy) : null;
}

/* ---------- Lint Helpers ---------- */

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
 * Lint a single file, using cache and optional retrier.
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
		const end = hrtimeBigint();
		const duration = end - start;
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
 * Create default configs from provided plugins.
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
 * Instantiate a ConfigLoader.
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
	const options = {
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
	return new ConfigLoader(options);
}

/* ---------- Exports ---------- */

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