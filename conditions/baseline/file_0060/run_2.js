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

function normalizeToPosix(pattern) {
	return pattern.replace(/\\/gu, "/");
}

function isGlobPattern(pattern) {
	return isGlob(path.sep === "\\" ? normalizeToPosix(pattern) : pattern);
}

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

	const relativeToPatterns = new Map();
	const matchers = patterns.map((pattern, i) => {
		const patternToUse = normalizeToPosix(path.relative(basePath, pattern));

		relativeToPatterns.set(patternToUse, patterns[i]);

		return new Minimatch(patternToUse, MINIMATCH_OPTIONS);
	});

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

			const matchesPattern = unmatchedPatterns.size > 0
				? checkPatternMatchWithTracking(matchers, entry.path, config, unmatchedPatterns)
				: matchers.some(matcher => matcher.match(entry.path));

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
			unmatchedPatterns: [...unmatchedPatterns].map(pattern =>
				relativeToPatterns.get(pattern),
			),
			patterns,
			rawPatterns,
		});
	}

	return filePaths;
}

function checkPatternMatchWithTracking(matchers, entryPath, config, unmatchedPatterns) {
	return matchers.reduce((previousValue, matcher) => {
		const pathMatches = matcher.match(entryPath);

		if (pathMatches && config) {
			unmatchedPatterns.delete(matcher.pattern);
		}

		return pathMatches || previousValue;
	}, false);
}

async function throwErrorForUnmatchedPatterns({
	basePath,
	patterns,
	rawPatterns,
	unmatchedPatterns,
}) {
	const pattern = unmatchedPatterns[0];
	const rawPattern = rawPatterns[patterns.indexOf(pattern)];

	const patternHasMatch = await globMatch({
		basePath,
		pattern,
	});

	if (patternHasMatch) {
		throw new AllFilesIgnoredError(rawPattern);
	}

	throw new NoFilesFoundError(rawPattern, true);
}

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

	return results.flatMap(result => result.value);
}

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

	const filePaths = patterns.map(filePath => path.resolve(cwd, filePath));
	const stats = await Promise.all(
		filePaths.map(filePath => fsp.stat(filePath).catch(() => {})),
	);

	const promises = [];
	stats.forEach((stat, index) => {
		const filePath = filePaths[index];
		const pattern = normalizeToPosix(patterns[index]);

		if (stat) {
			handleExistingPath(stat, filePath, pattern, results, searches, promises, configLoader);
			return;
		}

		handleMissingPath(pattern, globInputPaths, cwd, searches, missingPatterns);
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

function handleExistingPath(stat, filePath, pattern, results, searches, promises, configLoader) {
	if (stat.isFile()) {
		results.push(filePath);
		promises.push(configLoader.loadConfigArrayForFile(filePath));
	}

	if (stat.isDirectory()) {
		if (!searches.has(filePath)) {
			searches.set(filePath, { patterns: [], rawPatterns: [] });
		}
		const { patterns: globbyPatterns, rawPatterns } = searches.get(filePath);

		globbyPatterns.push(`${normalizeToPosix(filePath)}/**`);
		rawPatterns.push(pattern);
	}
}

function handleMissingPath(pattern, globInputPaths, cwd, searches, missingPatterns) {
	if (globInputPaths && isGlobPattern(pattern)) {
		const basePath = path.resolve(cwd, globParent(pattern));

		if (!searches.has(basePath)) {
			searches.set(basePath, { patterns: [], rawPatterns: [] });
		}
		const { patterns: globbyPatterns, rawPatterns } = searches.get(basePath);
		const filePath = path.resolve(cwd, pattern);

		globbyPatterns.push(filePath);
		rawPatterns.push(pattern);
	} else {
		missingPatterns.push(pattern);
	}
}

function getPlaceholderPath(cwd) {
	return path.join(cwd, "__placeholder__.js");
}

function isErrorMessage(message) {
	return message.severity === 2;
}

function createIgnoreResult(filePath, baseDir, configStatus) {
	const message = getIgnoreMessage(configStatus, baseDir, filePath);

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

function getIgnoreMessage(configStatus, baseDir, filePath) {
	switch (configStatus) {
		case "external":
			return "File ignored because outside of base path.";
		case "unconfigured":
			return "File ignored because no matching configuration was supplied.";
		default:
			return getDefaultIgnoreMessage(baseDir, filePath);
	}
}

function getDefaultIgnoreMessage(baseDir, filePath) {
	const isInNodeModules =
		baseDir &&
		path
			.dirname(path.relative(baseDir, filePath))
			.split(path.sep)
			.includes("node_modules");

	if (isInNodeModules) {
		return 'File ignored by default because it is located under the node_modules directory. Use ignore pattern "!**/node_modules/" to disable file ignore settings or use "--no-warn-ignored" to suppress this warning.';
	}

	return 'File ignored because of a matching ignore pattern. Use "--no-ignore" to disable file ignore settings or use "--no-warn-ignored" to suppress this warning.';
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
		const message = messages[i];

		if (message.fatal || message.severity === 2) {
			stat.errorCount++;
			if (message.fatal) {
				stat.fatalErrorCount++;
			}
			if (message.fix) {
				stat.fixableErrorCount++;
			}
		} else {
			stat.warningCount++;
			if (message.fix) {
				stat.fixableWarningCount++;
			}
		}
	}
	return stat;
}

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
	validateUnknownOptions(unknownOptions, errors);
	validateKnownOptions({
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
	}, errors);

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

function validateUnknownOptions(unknownOptions, errors) {
	const unknownOptionKeys = Object.keys(unknownOptions);

	if (unknownOptionKeys.length === 0) {
		return;
	}

	errors.push(`Unknown options: ${unknownOptionKeys.join(", ")}`);

	const deprecatedOptions = {
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

	for (const key of unknownOptionKeys) {
		if (deprecatedOptions[key]) {
			errors.push(deprecatedOptions[key]);
		}
	}
}

function validateKnownOptions(options, errors) {
	const validators = [
		{ key: "allowInlineConfig", check: v => typeof v === "boolean", msg: "'allowInlineConfig' must be a boolean." },
		{ key: "baseConfig", check: v => typeof v === "object", msg: "'baseConfig' must be an object or null." },
		{ key: "cache", check: v => typeof v === "boolean", msg: "'cache' must be a boolean." },
		{ key: "cacheLocation", check: v => isNonEmptyString(v), msg: "'cacheLocation' must be a non-empty string." },
		{ key: "cacheStrategy", check: v => v === "metadata" || v === "content", msg: "'cacheStrategy' must be any of \"metadata\", \"content\"." },
		{ key: "concurrency", check: v => v === "off" || v === "auto" || isPositiveInteger(v), msg: "'concurrency' must be a positive integer, \"auto\", or \"off\"." },
		{ key: "cwd", check: v => isNonEmptyString(v) && path.isAbsolute(v), msg: "'cwd' must be an absolute path." },
		{ key: "errorOnUnmatchedPattern", check: v => typeof v === "boolean", msg: "'errorOnUnmatchedPattern' must be a boolean." },
		{ key: "fix", check: v => typeof v === "boolean" || typeof v === "function", msg: "'fix' must be a boolean or a function." },
		{ key: "fixTypes", check: v => v === null || isFixTypeArray(v), msg: "'fixTypes' must be an array of any of \"directive\", \"problem\", \"suggestion\", and \"layout\"." },
		{ key: "flags", check: v => isEmptyArrayOrArrayOfNonEmptyString(v), msg: "'flags' must be an array of non-empty strings." },
		{ key: "globInputPaths", check: v => typeof v === "boolean", msg: "'globInputPaths' must be a boolean." },
		{ key: "ignore", check: v => typeof v === "boolean", msg: "'ignore' must be a boolean." },
		{ key: "ignorePatterns", check: v => isEmptyArrayOrArrayOfNonEmptyString(v) || v === null, msg: "'ignorePatterns' must be an array of non-empty strings or null." },
		{ key: "overrideConfig", check: v => typeof v === "object", msg: "'overrideConfig' must be an object or null." },
		{ key: "overrideConfigFile", check: v => isNonEmptyString(v) || v === null || v === true, msg: "'overrideConfigFile' must be a non-empty string, null, or true." },
		{ key: "passOnNoPatterns", check: v => typeof v === "boolean", msg: "'passOnNoPatterns' must be a boolean." },
		{ key: "plugins", check: v => validatePlugins(v), msg: null },
		{ key: "stats", check: v => typeof v === "boolean", msg: "'stats' must be a boolean." },
		{ key: "warnIgnored", check: v => typeof v === "boolean", msg: "'warnIgnored' must be a boolean." },
		{ key: "ruleFilter", check: v => typeof v === "function", msg: "'ruleFilter' must be a function." },
	];

	for (const validator of validators) {
		if (!validator.check(options[validator.key])) {
			if (validator.msg) {
				errors.push(validator.msg);
			}
		}
	}
}

function validatePlugins(plugins) {
	if (typeof plugins !== "object") {
		return false;
	}

	if (Array.isArray(plugins)) {
		return false;
	}

	if (plugins !== null && Object.keys(plugins).includes("")) {
		return false;
	}

	return true;
}

async function loadOptionsFromModule(optionsURL) {
	return (await import(optionsURL)).default;
}

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

function createLintResultCache({ cache, cacheStrategy }, cacheFilePath) {
	return cache ? new LintResultCache(cacheFilePath, cacheStrategy) : null;
}

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
		shouldMessageBeFixed(message, config, fixTypesSet) &&
		originalFix(message);
}

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

	if (
		result.errorCount + result.warningCount > 0 &&
		typeof result.output === "undefined"
	) {
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
		const cachedResult = lintResultCache.getCachedLintResults(
			filePath,
			config,
		);

		if (cachedResult) {
			const hadMessages =
				cachedResult.messages && cachedResult.messages.length > 0;

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

	const readAndVerifyFilePromise = retrier
		? retrier.retry(readAndVerifyFile, { signal: controller?.signal })
		: readAndVerifyFile();

	return readAndVerifyFilePromise.catch(error => {
		controller?.abort(error);
		throw error;
	});
}

function mergeEnvironmentFlags(flags) {
	if (!process.env.ESLINT_FLAGS) {
		return flags;
	}

	const envFlags = process.env.ESLINT_FLAGS.trim().split(/\s*,\s*/gu);
	return Array.from(new Set([...envFlags, ...flags]));
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