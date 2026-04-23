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
 * @param {Object} options
 * @param {string} options.basePath The directory to search.
 * @param {string} options.pattern An absolute path glob pattern to match.
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
 * Build Minimatch instances and a map from relative pattern to original.
 * @param {string[]} patterns
 * @param {string} basePath
 * @returns {{matchers: Minimatch[], relativeToOriginal: Map<string,string>}}
 */
function buildMatchers(patterns, basePath) {
	const relativeToOriginal = new Map();
	const matchers = patterns.map(pattern => {
		const rel = normalizeToPosix(path.relative(basePath, pattern));
		relativeToOriginal.set(rel, pattern);
		return new Minimatch(rel, MINIMATCH_OPTIONS);
	});
	return { matchers, relativeToOriginal };
}

/**
 * Determine if a directory should be traversed.
 * @param {Object} entry
 * @param {Minimatch[]} matchers
 * @param {string} basePath
 * @param {ConfigLoader} configLoader
 * @returns {Promise<boolean>}
 */
async function shouldTraverseDirectory(entry, matchers, basePath, configLoader) {
	if (!matchers.some(m => m.match(entry.path, true))) {
		return false;
	}
	const absolutePath = path.resolve(basePath, entry.path);
	const configs = await configLoader.loadConfigArrayForDirectory(absolutePath);
	return !configs.isDirectoryIgnored(absolutePath);
}

/**
 * Determine if a file should be included.
 * @param {Object} entry
 * @param {Minimatch[]} matchers
 * @param {Set<string>} unmatchedSet
 * @param {ConfigLoader} configLoader
 * @param {string} basePath
 * @returns {Promise<boolean>}
 */
async function shouldIncludeFile(entry, matchers, unmatchedSet, configLoader, basePath) {
	const absolutePath = path.resolve(basePath, entry.path);
	if (entry.isDirectory) {
		return false;
	}
	const configs = await configLoader.loadConfigArrayForFile(absolutePath);
	const config = configs.getConfig(absolutePath);

	if (!config) {
		return false;
	}

	if (unmatchedSet.size === 0) {
		return matchers.some(m => m.match(entry.path));
	}

	let matched = false;
	for (const matcher of matchers) {
		if (matcher.match(entry.path)) {
			matched = true;
			unmatchedSet.delete(matcher.pattern);
		}
	}
	return matched;
}

/**
 * Searches a directory looking for matching glob patterns.
 * @param {Object} options
 * @param {string} options.basePath
 * @param {Array<string>} options.patterns
 * @param {Array<string>} options.rawPatterns
 * @param {ConfigLoader} options.configLoader
 * @param {boolean} options.errorOnUnmatchedPattern
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

	const { matchers, relativeToOriginal } = buildMatchers(patterns, basePath);
	const unmatchedSet = new Set([...relativeToOriginal.keys()]);
	const { hfs } = await import("@humanfs/node");

	const walk = hfs.walk(basePath, {
		directoryFilter(entry) {
			return shouldTraverseDirectory(entry, matchers, basePath, configLoader);
		},
		entryFilter(entry) {
			return shouldIncludeFile(entry, matchers, unmatchedSet, configLoader, basePath);
		},
	});

	const filePaths = [];
	if (await hfs.isDirectory(basePath)) {
		for await (const entry of walk) {
			filePaths.push(path.resolve(basePath, entry.path));
		}
	}

	if (errorOnUnmatchedPattern && unmatchedSet.size > 0) {
		throw new UnmatchedSearchPatternsError({
			basePath,
			unmatchedPatterns: [...unmatchedSet].map(p => relativeToOriginal.get(p)),
			patterns,
			rawPatterns,
		});
	}
	return filePaths;
}

/**
 * Throws an error for unmatched patterns.
 * @param {Object} options
 * @param {string} options.basePath
 * @param {Array<string>} options.patterns
 * @param {Array<string>} options.rawPatterns
 * @param {Array<string>} options.unmatchedPatterns
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
 * Performs multiple glob searches in parallel.
 * @param {Object} options
 * @param {Map<string,GlobSearch>} options.searches
 * @param {ConfigLoader} options.configLoader
 * @param {boolean} options.errorOnUnmatchedPattern
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
		.filter(s => s.patterns.length > 0);

	const results = await Promise.allSettled(
		normalizedSearches.map(s =>
			globSearch({
				basePath: s.basePath,
				patterns: s.patterns,
				rawPatterns: s.rawPatterns,
				configLoader,
				errorOnUnmatchedPattern,
			}),
		),
	);

	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		if (result.status === "fulfilled") continue;

		const error = result.reason;
		if (!error.basePath) {
			throw error;
		}
		if (errorOnUnmatchedPattern) {
			await throwErrorForUnmatchedPatterns({
				...normalizedSearches[i],
				unmatchedPatterns: error.unmatchedPatterns,
			});
		}
	}
	return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
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

/**
 * Checks if the given message is an error message.
 * @param {LintMessage} message
 * @returns {boolean}
 */
function isErrorMessage(message) {
	return message.severity === 2;
}

/**
 * Returns result with warning by ignore settings
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
			if (m.fatal) stat.fatalErrorCount++;
			if (m.fix) stat.fixableErrorCount++;
		} else {
			stat.warningCount++;
			if (m.fix) stat.fixableWarningCount++;
		}
	}
	return stat;
}

/**
 * Check if a given value is a valid fix type or not.
 * @param {any} x
 * @returns {boolean}
 */
function isFixType(x) {
	return (
		x === "directive" ||
		x === "problem" ||
		x === "suggestion" ||
		x === "layout"
	);
}

/**
 * Check if a given value is an array of fix types or not.
 * @param {any} x
 * @returns {boolean}
 */
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
 * Validates and normalizes options.
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
	const unknownOptionKeys = Object.keys(unknownOptions);
	if (unknownOptionKeys.length) {
		errors.push(`Unknown options: ${unknownOptionKeys.join(", ")}`);
		if (unknownOptionKeys.includes("cacheFile")) {
			errors.push(
				"'cacheFile' has been removed. Please use the 'cacheLocation' option instead.",
			);
		}
		if (unknownOptionKeys.includes("configFile")) {
			errors.push(
				"'configFile' has been removed. Please use the 'overrideConfigFile' option instead.",
			);
		}
		if (unknownOptionKeys.includes("envs")) errors.push("'envs' has been removed.");
		if (unknownOptionKeys.includes("extensions")) errors.push("'extensions' has been removed.");
		if (unknownOptionKeys.includes("resolvePluginsRelativeTo")) errors.push("'resolvePluginsRelativeTo' has been removed.");
		if (unknownOptionKeys.includes("globals"))
			errors.push(
				"'globals' has been removed. Please use the 'overrideConfig.languageOptions.globals' option instead.",
			);
		if (unknownOptionKeys.includes("ignorePath")) errors.push("'ignorePath' has been removed.");
		if (unknownOptionKeys.includes("ignorePattern"))
			errors.push(
				"'ignorePattern' has been removed. Please use the 'overrideConfig.ignorePatterns' option instead.",
			);
		if (unknownOptionKeys.includes("parser"))
			errors.push(
				"'parser' has been removed. Please use the 'overrideConfig.languageOptions.parser' option instead.",
			);
		if (unknownOptionKeys.includes("parserOptions"))
			errors.push(
				"'parserOptions' has been removed. Please use the 'overrideConfig.languageOptions.parserOptions' option instead.",
			);
		if (unknownOptionKeys.includes("rules"))
			errors.push(
				"'rules' has been removed. Please use the 'overrideConfig.rules' option instead.",
			);
		if (unknownOptionKeys.includes("rulePaths"))
			errors.push(
				"'rulePaths' has been removed. Please define your rules using plugins.",
			);
		if (unknownOptionKeys.includes("reportUnusedDisableDirectives"))
			errors.push(
				"'reportUnusedDisableDirectives' has been removed. Please use the 'overrideConfig.linterOptions.reportUnusedDisableDirectives' option instead.",
			);
	}
	if (typeof allowInlineConfig !== "boolean") errors.push("'allowInlineConfig' must be a boolean.");
	if (typeof baseConfig !== "object") errors.push("'baseConfig' must be an object or null.");
	if (typeof cache !== "boolean") errors.push("'cache' must be a boolean.");
	if (!isNonEmptyString(cacheLocation)) errors.push("'cacheLocation' must be a non-empty string.");
	if (cacheStrategy !== "metadata" && cacheStrategy !== "content") errors.push('\'cacheStrategy\' must be any of "metadata", "content".');
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
 * Loads ESLint constructor options from an options module.
 * @param {string} optionsURL
 * @returns {Promise<ESLintOptions>}
 */
async function loadOptionsFromModule(optionsURL) {
	return (await import(optionsURL)).default;
}

/**
 * Resolve cache file path.
 * @param {string} cacheFile
 * @param {string} cwd
 * @param {Object} options
 * @param {string} [options.prefix]
 * @returns {string}
 */
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

/**
 * Checks whether a message's rule type should be fixed.
 * @param {LintMessage} message
 * @param {CalculatedConfig} config
 * @param {string[]} fixTypes
 * @returns {boolean}
 */
function shouldMessageBeFixed(message, config, fixTypes) {
	if (!message.ruleId) {
		return fixTypes.has("directive");
	}
	const rule = config.getRuleDefinition(message.ruleId);
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