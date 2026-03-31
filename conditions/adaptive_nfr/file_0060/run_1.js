```javascript
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

createDebug.formatters.t = timeDiff =>
	`${(timeDiff + 500_000n) / 1_000_000n} ms`;

const debug = createDebug(
	`eslint:eslint-helpers${isMainThread ? "" : `:thread-${threadId}`}`,
);

//-----------------------------------------------------------------------------
// Error Classes
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

class ESLintInvalidOptionsError extends Error {
	constructor(messages) {
		super(`Invalid Options:\n- ${messages.join("\n- ")}`);
		this.code = "ESLINT_INVALID_OPTIONS";
		Error.captureStackTrace(this, ESLintInvalidOptionsError);
	}
}

//-----------------------------------------------------------------------------
// Validation Helpers
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

//-----------------------------------------------------------------------------
// Path Helpers
//-----------------------------------------------------------------------------

function normalizeToPosix(pattern) {
	return pattern.replace(/\\/gu, "/");
}

function isGlobPattern(pattern) {
	return isGlob(path.sep === "\\" ? normalizeToPosix(pattern) : pattern);
}

function getPlaceholderPath(cwd) {
	return path.join(cwd, "__placeholder__.js");
}

//-----------------------------------------------------------------------------
// Glob Matching Helpers
//-----------------------------------------------------------------------------

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

			const matchesPattern =
				unmatchedPatterns.size > 0
					? matchers.reduce((previousValue, matcher) => {
							const pathMatches = matcher.match(entry.path);
							if (pathMatches && config) {
								unmatchedPatterns.delete(matcher.pattern);
							}
							return pathMatches || previousValue;
						}, false)
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
			if (stat.isFile()) {
				results.push(filePath);
				promises.push(configLoader.loadConfigArrayForFile(filePath));
			}

			if (stat.isDirectory()) {
				if (!searches.has(filePath)) {
					searches.set(filePath, { patterns: [], rawPatterns: [] });
				}
				({ patterns: globbyPatterns, rawPatterns } =
					searches.get(filePath));

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
			({ patterns: globbyPatterns, rawPatterns } =
				searches.get(basePath));

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

//-----------------------------------------------------------------------------
// Result Helpers
//-----------------------------------------------------------------------------

function isErrorMessage(message) {
	return message.severity === 2;
}

function createIgnoreResult(filePath, baseDir, configStatus) {
	const messageMap = {
		external: "File ignored because outside of base path.",
		unconfigured:
			"File ignored because no matching configuration was supplied.",
	};

	let message = messageMap[configStatus];

	if (!message) {
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

	for (const message of messages) {
		const isError = message.fatal || message.severity === 2;

		if (isError) {
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

//-----------------------------------------------------------------------------
// Options Validation
//-----------------------------------------------------------------------------

const DEPRECATED_OPTIONS = {
	cacheFile:
		"'cacheFile' has been removed. Please use the 'cacheLocation' option instead.",
	configFile:
		"'configFile' has been removed. Please use the 'overrideConfigFile' option instead.",
	envs: "'envs' has been removed.",
	extensions: "'extensions' has been removed.",
	resolvePluginsRelativeTo: "'resolvePluginsRelativeTo' has been removed.",
	globals:
		"'globals' has been removed. Please use the 'overrideConfig.languageOptions.globals' option instead.",
	ignorePath: "'ignorePath' has been removed.",
	ignorePattern:
		"'ignorePattern' has been removed. Please use the 'overrideConfig.ignorePatterns' option instead.",
	parser:
		"'parser' has been removed. Please use the 'overrideConfig.languageOptions.parser' option instead.",
	parserOptions:
		"'parserOptions' has been removed. Please use the 'overrideConfig.languageOptions.parserOptions' option instead.",
	rules:
		"'rules' has been removed. Please use the 'overrideConfig.rules' option instead.",
	rulePaths:
		"'rulePaths' has been removed. Please define your rules