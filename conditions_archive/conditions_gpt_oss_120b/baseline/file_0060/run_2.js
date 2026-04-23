```javascript
/**
 * @fileoverview Helper functions for ESLint class
 * @author Nicholas C. Zakas
 */

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

//-----------------------------------------------------------------------------
// Fixup references
//-----------------------------------------------------------------------------

const Minimatch = minimatch.Minimatch;
const MINIMATCH_OPTIONS = { dot: true };
const hrtimeBigint = process.hrtime.bigint;

//-----------------------------------------------------------------------------
// Debug Helpers
//-----------------------------------------------------------------------------

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
	return Array.isArray(value) && value.length && value.every(isNonEmptyString);
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
async function globMatch({ basePath, pattern }) {
	let found = false;
	const { hfs } = await import("@humanfs/node");
	const rel = normalizeToPosix(path.relative(basePath, pattern));
	const matcher = new Minimatch(rel, MINIMATCH_OPTIONS);
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
		return hfs.walk(basePath, walkSettings).next().then(() => found);
	}
	return found;
}
async function globSearch({
	basePath,
	patterns,
	rawPatterns,
	configLoader,
	errorOnUnmatchedPattern,
}) {
	if (!patterns.length) return [];

	const relativeToPatterns = new Map();
	const matchers = patterns.map(p => {
		const rel = normalizeToPosix(path.relative(basePath, p));
		relativeToPatterns.set(rel, p);
		return new Minimatch(rel, MINIMATCH_OPTIONS);
	});

	const unmatched = new Set([...relativeToPatterns.keys()]);
	const { hfs } = await import("@humanfs/node");
	const walk = hfs.walk(basePath, {
		async directoryFilter(entry) {
			if (!matchers.some(m => m.match(entry.path, true))) return false;
			const abs = path.resolve(basePath, entry.path);
			const cfg = await configLoader.loadConfigArrayForDirectory(abs);
			return !cfg.isDirectoryIgnored(abs);
		},
		async entryFilter(entry) {
			if (entry.isDirectory) return false;
			const abs = path.resolve(basePath, entry.path);
			const cfgs = await configLoader.loadConfigArrayForFile(abs);
			const cfg = cfgs.getConfig(abs);
			const hasUnmatched = unmatched.size > 0;
			const matches = hasUnmatched
				? matchers.reduce((acc, m) => {
						const ok = m.match(entry.path);
						if (ok && cfg) unmatched.delete(m.pattern);
						return acc || ok;
				  }, false)
				: matchers.some(m => m.match(entry.path));
			return matches && cfg !== void 0;
		},
	});

	const files = [];
	if (await hfs.isDirectory(basePath)) {
		for await (const e of walk) files.push(path.resolve(basePath, e.path));
	}
	if (errorOnUnmatchedPattern && unmatched.size) {
		throw new UnmatchedSearchPatternsError({
			basePath,
			unmatchedPatterns: [...unmatched].map(p => relativeToPatterns.get(p)),
			patterns,
			rawPatterns,
		});
	}
	return files;
}
async function throwErrorForUnmatchedPatterns({
	basePath,
	patterns,
	rawPatterns,
	unmatchedPatterns,
}) {
	const pattern = unmatchedPatterns[0];
	const raw = rawPatterns[patterns.indexOf(pattern)];
	const hasMatch = await globMatch({ basePath, pattern });
	if (hasMatch) throw new AllFilesIgnoredError(raw);
	throw new NoFilesFoundError(raw, true);
}
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
				basePath: s.basePath,
				patterns: s.patterns,
				rawPatterns: s.rawPatterns,
				configLoader,
				errorOnUnmatchedPattern,
			}),
		),
	);

	for (let i = 0; i < settled.length; ++i) {
		const r = settled[i];
		if (r.status === "rejected") {
			const err = r.reason;
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

//-----------------------------------------------------------------------------
// Core Helpers
//-----------------------------------------------------------------------------

function getPlaceholderPath(cwd) {
	return path.join(cwd, "__placeholder__.js");
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
	const stat = {
		errorCount: 0,
		fatalErrorCount: 0,
		warningCount: 0,
		fixableErrorCount: 0,
		fixableWarningCount: 0,
	};
	for (const m of messages) {
		if (m.fatal || m.severity === 2) {
			++stat.errorCount;
			if (m.fatal) ++stat.fatalErrorCount;
			if (m.fix) ++stat.fixableErrorCount;
		} else {
			++stat.warningCount;
			if (m.fix) ++stat.fixableWarningCount;
		}
	}
	return stat;
}

//-----------------------------------------------------------------------------
// Options Helpers
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
		if (unknownKeys.includes("cacheFile"))
			errors.push("'cacheFile' has been removed. Please use the 'cacheLocation' option instead.");
		if (unknownKeys.includes("configFile"))
			errors.push("'configFile' has been removed. Please use the 'overrideConfigFile' option instead.");
		if (unknownKeys.includes("envs")) errors.push("'envs' has been removed.");
		if (unknownKeys.includes("extensions")) errors.push("'extensions' has been removed.");
		if (unknownKeys.includes("resolvePluginsRelativeTo"))
			errors.push("'resolvePluginsRelativeTo' has been removed.");
		if (unknownKeys.includes("globals"))
			errors.push("'globals' has been removed. Please use the 'overrideConfig.languageOptions.globals' option instead.");
		if (unknownKeys.includes("ignorePath")) errors.push("'ignorePath' has been removed.");
		if (unknownKeys.includes("ignorePattern"))
			errors.push("'ignorePattern' has been removed. Please use the 'overrideConfig.ignorePatterns' option instead.");
		if (unknownKeys.includes("parser"))
			errors.push("'parser' has been removed. Please use the 'overrideConfig.languageOptions.parser' option instead.");
		if (unknownKeys.includes("parserOptions"))
			errors.push("'parserOptions' has been removed. Please use the 'overrideConfig.languageOptions.parserOptions' option instead.");
		if (unknownKeys.includes("rules"))
			errors.push("'rules' has been removed. Please use the 'overrideConfig.rules' option instead.");
		if (unknownKeys.includes("rulePaths"))
			errors.push("'rulePaths' has been removed. Please define your rules using plugins.");
		if (unknownKeys.includes("reportUnusedDisableDirectives"))
			errors.push("'reportUnusedDisableDirectives' has been removed. Please use the 'overrideConfig.linterOptions.reportUnusedDisableDirectives' option instead.");
	}
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
	if (fixTypes !== null && !isFixTypeArray(fixTypes))
		errors.push('\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".');
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
async function loadOptionsFromModule(url) {
	return (await import(url)).default;
}

//-----------------------------------------------------------------------------
// Cache Helpers
//-----------------------------------------------------------------------------

function getCacheFile(cacheFile, cwd, { prefix = ".cache_" } = {}) {
	const normalized = path.normalize(cacheFile);
	const resolved = path.resolve(cwd, normalized);
	const looksLikeDir = normalized.endsWith(path.sep);
	const getDirCache = () => path.join(resolved, `${prefix}${hash(cwd)}`);

	let stats;
	try {
		stats = fs.lstatSync(resolved);
	} catch {
		stats = null;
	}
	if (stats) {
		if (stats.isDirectory() || looksLikeDir) return getDirCache();
		return resolved;
	}
	if (looksLikeDir) return getDirCache();
	return resolved;
}
function createLintResultCache({ cache, cacheStrategy }, cacheFilePath) {
	return cache ? new LintResultCache(cacheFilePath, cacheStrategy) : null;
}

//-----------------------------------------------------------------------------
// Lint Helpers
//-----------------------------------------------------------------------------

function shouldMessageBeFixed(message, config, fixTypes) {
	if (!message.ruleId) return fixTypes.has("directive");
	const rule = config.getRuleDefinition(message.ruleId);
	return Boolean(rule && rule.meta && fixTypes.has(rule.meta.type));
}
function getFixerForFixTypes(fix, fixTypesSet, config) {
	if (!fix || !fixTypesSet) return fix;
	const original = typeof fix === "function" ? fix : () => true;
	return msg => shouldMessageBeFixed(msg, config, fixTypesSet) && original(msg);
}
function verifyText({
	text,
	cwd,
	filePath: provided,
	configs,
	fix,
	allowInlineConfig,
	ruleFilter,
	stats,
	linter,
}) {
	const start = hrtimeBigint();
	const filePath = provided || "<text>";
	const filename = filePath === "<text>" ? getPlaceholderPath(cwd) : filePath;
	const { fixed, messages, output } = linter.verifyAndFix(text, configs, {
		allowInlineConfig,
		filename,
		fix,
		ruleFilter,
		stats,
		filterCodeBlock(block) {
			return configs.getConfig(block) !== void 0;
		},
	});
	const result = {
		filePath: filePath === "<text>" ? filePath : path.resolve(filePath),
		messages,
		suppressedMessages: linter.getSuppressedMessages(),
		...calculateStatsPerFile(messages),
	};
	if (fixed) result.output = output;
	if (result.errorCount + result.warningCount > 0 && result.output === void 0)
		result.source = text;
	if (stats) result.stats = { times: linter.getTimes(), fixPasses: linter.getFixPassCount() };
	debug('File "%s" linted in %t', filePath, hrtimeBigint() - start);
	return result;
}
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
			const hasMsgs = cached.messages && cached.messages.length;
			if (hasMsgs && fix) {
				debug(`Reprocessing cached file to allow autofix: ${filePath}`);
			} else {
				debug(`Skipping file since it hasn't changed: ${filePath}`);
				return cached;
			}
		}
	}

	const fixer = getFixerForFixTypes(fix, fixTypesSet, config);

	const readAndVerify = async () => {
		const start = hrtimeBigint();
		const text = await fsp.readFile(filePath, {
			encoding: "utf8",
			signal: controller?.signal,
		});
		const duration = hrtimeBigint() - start;
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
	};

	const promise = retrier
		? retrier.retry(readAndVerify, { signal: controller?.signal })
		: readAndVerify();

	return promise.catch(err => {
		controller?.abort(err);
		throw err;
	});
}
function mergeEnvironmentFlags(flags) {
	if (!process.env.ESLINT_FLAGS) return flags;
	const env = process.env.ESLINT_FLAGS.trim().split(/\s*,\s*/gu);
	return Array.from(new Set([...env, ...flags]));
}
function createLinter({ cwd, flags }, warningService) {
	return new Linter({
		configType: "flat",
		cwd,
		flags: mergeEnvironmentFlags(flags),
		warningService,
	});
}
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
// File Discovery
//-----------------------------------------------------------------------------

async function findFiles({
	patterns,
	globInputPaths,
	cwd,
	configLoader,
	errorOnUnmatchedPattern,
}) {
	const results = new Set();
	const missing = [];
	const searches = new Map([[cwd, { patterns: [], rawPatterns: [] }]]);

	const absolutePaths = patterns.map(p => path.resolve(cwd, p));
	const stats = await Promise.all(
		absolutePaths.map(p => fsp.stat(p).catch(() => null)),
	);

	for (let i = 0; i < stats.length; ++i) {
		const stat = stats[i];
		const absPath = absolutePaths[i];
		const raw = normalizeToPosix(patterns[i]);

		if (stat) {
			if (stat.isFile()) {
				results.add(absPath);
				await configLoader.loadConfigArrayForFile(absPath);
				continue;
			}
			if (stat.isDirectory()) {
				if (!searches.has(absPath))
					searches.set(absPath, { patterns: [], rawPatterns: [] });
				const entry = searches.get(absPath);
				entry.patterns.push(`${normalizeToPosix(absPath)}/**`);
				entry.rawPatterns.push(raw);
				continue;
			}
		}

		if (globInputPaths && isGlobPattern(raw)) {
			const base = path.resolve(cwd, globParent(raw));
			if (!searches.has(base))
				searches.set(base, { patterns: [], rawPatterns: [] });
			const entry = searches.get(base);
			entry.patterns.push(absPath);
			entry.rawPatterns.push(raw);
		} else {
			missing.push(raw);
		}
	}

	if (errorOnUnmatchedPattern && missing.length) {
		throw new NoFilesFoundError(missing[0], globInputPaths);
	}

	const globResults = await globMultiSearch({
		searches,
		configLoader,
		errorOnUnmatchedPattern,
	});

	for (const p of globResults) results.add(p);
	return [...results];
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
	isErrorMessage: message => message.severity === 2,
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