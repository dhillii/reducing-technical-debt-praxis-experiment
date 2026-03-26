# Refactored ESLint Helpers

## Key Refactoring Decisions

1. **Extract deprecated option messages** into a lookup table to eliminate repetitive `if` chains
2. **Extract option validators** into a declarative array to replace the long sequential validation block
3. **Simplify `createIgnoreResult`** by extracting message logic into a lookup + helper
4. **Simplify `globMultiSearch`** error handling loop
5. **Extract `readFile` timing logic** into a helper
6. **Reduce nesting** in `findFiles` stats loop

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

// Add %t formatter to print bigint nanosecond times in milliseconds.
createDebug.formatters.t = timeDiff =>
    `${(timeDiff + 500_000n) / 1_000_000n} ms`;

const debug = createDebug(
    `eslint:eslint-helpers${isMainThread ? "" : `:thread-${threadId}`}`,
);

//-----------------------------------------------------------------------------
// Errors
//-----------------------------------------------------------------------------

/**
 * The error type when no files match a glob.
 */
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

/**
 * The error type when a search fails to match multiple patterns.
 */
class UnmatchedSearchPatternsError extends Error {
    /**
     * @param {Object} options The options for the error.
     * @param {string} options.basePath The directory that was searched.
     * @param {Array<string>} options.unmatchedPatterns The glob patterns which were not found.
     * @param {Array<string>} options.patterns The glob patterns that were searched.
     * @param {Array<string>} options.rawPatterns The raw glob patterns that were searched.
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

/**
 * The error type when there are files matched by a glob, but all of them have been ignored.
 */
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

/**
 * The error for invalid options.
 */
class ESLintInvalidOptionsError extends Error {
    constructor(messages) {
        super(`Invalid Options:\n- ${messages.join("\n- ")}`);
        this.code = "ESLINT_INVALID_OPTIONS";
        Error.captureStackTrace(this, ESLintInvalidOptionsError);
    }
}

//-----------------------------------------------------------------------------
// General Helpers
//-----------------------------------------------------------------------------

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
 * @returns {boolean} `true` if `value` is an empty array or an array of non-empty strings.
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

//-----------------------------------------------------------------------------
// File-related Helpers
//-----------------------------------------------------------------------------

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
 * Used primarily to help with useful error messages.
 * @param {Object} options The options for the function.
 * @param {string} options.basePath The directory to search.
 * @param {string} options.pattern An absolute path glob pattern to match.
 * @returns {Promise<boolean>} True if there is a glob match, false if not.
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
        await hfs.walk(basePath, walkSettings).next();
    }

    return found;
}

/**
 * Builds Minimatch instances and a reverse-lookup map from absolute patterns.
 * @param {Array<string>} patterns Absolute path glob patterns.
 * @param {string} basePath The base directory.
 * @returns {{ matchers: Minimatch[], relativeToPatterns: Map<string, string> }}
 */
function buildMatchers(patterns, basePath) {
    const relativeToPatterns = new Map();
    const matchers = patterns.map((pattern, i) => {
        const patternToUse = normalizeToPosix(
            path.relative(basePath, pattern),
        );
        relativeToPatterns.set(patternToUse, patterns[i]);
        return new Minimatch(patternToUse, MINIMATCH_OPTIONS);
    });
    return { matchers, relativeToPatterns };
}

/**
 * Determines whether an entry matches any of the given matchers, updating
 * the unmatched-patterns set as a side effect when tracking is still needed.
 * @param {Object} entry The walk entry.
 * @param {Minimatch[]} matchers The compiled matchers.
 * @param {Set<string>} unmatchedPatterns Patterns not yet matched.
 * @param {Object|undefined} config The resolved config for the file.
 * @returns {boolean} Whether the entry matches at least one pattern.
 */
function entryMatchesPatterns(entry, matchers, unmatchedPatterns, config) {
    // Fast path: all patterns already matched, just find the first hit.
    if (unmatchedPatterns.size === 0) {
        return matchers.some(matcher => matcher.match(entry.path));
    }

    // Slow path: must test every matcher to track unmatched patterns.
    return matchers.reduce((matched, matcher) => {
        const pathMatches = matcher.match(entry.path);
        if (pathMatches && config) {
            unmatchedPatterns.delete(matcher.pattern);
        }
        return pathMatches || matched;
    }, false);
}

/**
 * Searches a directory looking for matching glob patterns. This uses
 * the config array's logic to determine if a directory or file should
 * be ignored, so it is consistent with how ignoring works throughout ESLint.
 * @param {Object} options The options for this function.
 * @param {string} options.basePath The directory to search.
 * @param {Array<string>} options.patterns An array of absolute path glob patterns to match.
 * @param {Array<string>} options.rawPatterns An array of glob patterns as the user inputted them.
 * @param {ConfigLoader} options.configLoader The config loader.
 * @param {boolean} options.errorOnUnmatchedPattern Determines if an error should be thrown.
 * @returns {Promise<Array<string>>} An array of matching file paths.
 * @throws {UnmatchedSearchPatternsError} If a pattern doesn't match any files.
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

    const { matchers, relativeToPatterns } = buildMatchers(patterns, basePath);
    const unmatchedPatterns = new Set(relativeToPatterns.keys());
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
            if (entry.isDirectory) {
                return false;
            }
            const absolutePath = path.resolve(basePath, entry.path);
            const configs =
                await configLoader.loadConfigArrayForFile(absolutePath);
            const config = configs.getConfig(absolutePath);
            const matchesPattern = entryMatchesPatterns(
                entry,
                matchers,
                unmatchedPatterns,
                config,
            );
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
            unmatchedPatterns: [...unmatchedPatterns].map(p =>
                relativeToPatterns.get(p),
            ),
            patterns,
            rawPatterns,
        });
    }

    return filePaths;
}

/**
 * Throws an error for unmatched patterns. The error will only contain
 * information about the first one.
 * @param {Object} options The options for this function.
 * @param {string} options.basePath The directory to search.
 * @param {Array<string>} options.patterns An array of glob patterns used in the original search.
 * @param {Array<string>} options.rawPatterns An array of glob patterns as the user inputted them.
 * @param {Array<string>} options.unmatchedPatterns A non-empty array of unmatched patterns.
 * @returns {Promise<never>} Always throws an error.
 * @throws {NoFilesFoundError} If the first unmatched pattern doesn't match any files.
 * @throws {AllFilesIgnoredError} If the first unmatched pattern matches some files.
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
 * @param {Object} options The options for this function.
 * @param {Map<string,GlobSearch>} options.searches A map of base paths to glob searches.
 * @param {ConfigLoader} options.configLoader The config loader.
 * @param {boolean} options.errorOnUnmatchedPattern Determines if an unmatched pattern throws.
 * @returns {Promise<Array<string>>} An array of matching file paths.
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
        normalizedSearches.map(search =>
            globSearch({ ...search, configLoader, errorOnUnmatchedPattern }),
        ),
    );

    // Handle errors from each search before collecting results.
    for (let i = 0; i < results.length; i++) {
        const result = results[i];

        if (result.status === "fulfilled") {
            continue;
        }

        const error = result.reason;

        // Re-throw unexpected errors (those without a basePath).
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

    return results.flatMap(result => result.value);
}

/**
 * Registers a file path into the appropriate search bucket.
 * @param {string} filePath The absolute file path.
 * @param {string} pattern The normalized posix pattern.
 * @param {Map<string, GlobSearch>} searches The searches map to update.
 * @param {string} basePath The base path for this search bucket.
 */
function addToSearch(filePath, pattern, searches, basePath) {
    if (!searches.has(basePath)) {
        searches.set(basePath, { patterns: [], rawPatterns: [] });
    }
    const bucket = searches.get(basePath);
    bucket.patterns.push(filePath);
    bucket.rawPatterns.push(pattern);
}

/**
 * Finds all files matching the options specified.
 * @param {Object} args The arguments objects.
 * @param {Array<string>} args.patterns An array of glob patterns.
 * @param {boolean} args.globInputPaths true to interpret glob patterns.
 * @param {string} args.cwd The current working directory to find from.
 * @param {ConfigLoader} args.configLoader The config loader for the current run.
 * @param {boolean} args.errorOnUnmatchedPattern Determines if an unmatched pattern throws.
 * @returns {Promise<Array<string>>} The fully resolved file paths.
 * @throws {AllFilesIgnoredError} If there are no results due to an ignore pattern.
 * @throws {NoFilesFoundError} If no files matched the given patterns.
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
    const promises = [];
    const searches = new Map([[cwd, { patterns: [], rawPatterns: [] }]]);

    const filePaths = patterns.map(p => path.resolve(cwd, p));
    const stats = await Promise.all(
        filePaths.map(fp => fsp.stat(fp).catch(() => {})),
    );

    stats.forEach((stat, index) => {
        const filePath = filePaths[index];
        const pattern = normalizeToPosix(patterns[index]);

        if (stat?.isFile()) {
            results.push(filePath);
            promises.push(configLoader.loadConfigArrayForFile(filePath));
            return;
        }

        if (stat?.isDirectory()) {
            addToSearch(
                `${normalizeToPosix(filePath)}/**`,
                pattern,
                searches,
                filePath,
            );
            return;
        }

        if (globInputPaths && isGlobPattern(pattern)) {
            const basePath = path.resolve(cwd, globParent(pattern));
            addToSearch(filePath, pattern, searches, basePath);
        } else {
            missingPatterns.push(pattern);
        }
    });

    if (errorOnUnmatchedPattern && missingPatterns.length) {
        throw new NoFilesFoundError(missingPatterns[0], globInputPaths);
    }

    promises.push(
        globMultiSearch({ searches, configLoader, errorOnUnmatchedPattern }),
    );

    const globbyResults = (await Promise.all(promises)).at(-1);

    return [...new Set([...results, ...globbyResults])];
}

/**
 * Return the absolute path of a file named `"__placeholder__.js"` in a given directory.
 * @param {string} cwd An absolute directory path.
 * @returns {string} The absolute path of the placeholder file.
 */
function getPlaceholderPath(cwd) {
    return path.join(cwd, "__placeholder__.js");
}

//-----------------------------------------------------------------------------
// Results-related Helpers
//-----------------------------------------------------------------------------

/**
 * Checks if the given message is an error message.
 * @param {LintMessage} message The message to check.
 * @returns {boolean} Whether or not the message is an error message.
 */
function isErrorMessage(message) {
    return message.severity === 2;
}

/** @type {Record<string, string>} */
const IGNORE_RESULT_MESSAGES = {
    external: "File ignored because outside of base path.",
    unconfigured:
        "File ignored because no matching configuration was supplied.",
};

/**
 * Builds the ignore message for the default case (pattern-based ignore).
 * @param {string} filePath The file path being ignored.
 * @param {string} baseDir The base directory.
 * @returns {string} The appropriate ignore message.
 */
function buildDefaultIgnoreMessage(filePath, baseDir) {
    const isInNodeModules =
        baseDir &&
        path
            .dirname(path.relative(baseDir, filePath))
            .split(path.sep)
            .includes("node_modules");

    return isInNodeModules
        ? 'File ignored by default because it is located under the node_modules directory. Use ignore pattern "!**/node_modules/" to disable file ignore settings or use "--no-warn-ignored" to suppress this warning.'
        : 'File ignored because of a matching ignore pattern. Use "--no-ignore" to disable file ignore settings or use "--no-warn-ignored" to suppress this warning.';
}

/**
 * Returns result with warning by ignore settings.
 * @param {string} filePath Absolute file path of checked code.
 * @param {string} baseDir Absolute path of base directory.
 * @param {"ignored"|"external"|"unconfigured"} configStatus Why the file is ignored.
 * @returns {LintResult} Result with single warning.
 */
function createIgnoreResult(filePath, baseDir, configStatus) {
    const message =
        IGNORE_RESULT_MESSAGES[configStatus] ??
        buildDefaultIgnoreMessage(filePath, baseDir);

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
 * Calculates the error and warning count for a collection of messages.
 * @param {LintMessage[]} messages Collection of messages.
 * @returns {Object} Contains the stats.
 */
function calculateStatsPerFile(messages) {
    const stat = {
        errorCount: 0,
        fatalErrorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
    };

    for (const message of messages) {
        if (message.fatal || message.severity === 2) {
            stat.errorCount++;
            if (message.fatal) stat.fatalErrorCount++;
            if (message.fix) stat.fixableErrorCount++;
        } else {
            stat.warningCount++;
            if (message.fix) stat.fixableWarningCount++;
        }
    }

    return stat;
}

//-----------------------------------------------------------------------------
// Options-related Helpers
//-----------------------------------------------------------------------------

/**
 * Check if a given value is a valid fix type or not.
 * @param {any} x The value to check.
 * @returns {boolean} `true` if `x` is valid fix type.
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
 * @param {any} x The value to check.
 * @returns {boolean} `true` if `x` is an array of fix types.
 */
function isFixTypeArray(x) {
    return Array.isArray(x) && x.every(isFixType);
}

/**
 * Messages for deprecated/removed options. Each entry maps an option key to
 * the error message that should be appended when that key is encountered.
 * @type {Record<string, string>}
 */
const DEPRECATED_OPTION_MESSAGES = {
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
    parser: "'parser' has been removed. Please use the 'overrideConfig.languageOptions.parser' option instead.",
    parserOptions:
        "'parserOptions' has been removed. Please use the 'overrideConfig.languageOptions.parserOptions' option instead.",
    rules: "'rules' has been removed. Please use the 'overrideConfig.rules' option instead.",
    rulePaths:
        "'rulePaths' has been removed. Please define your rules using plugins.",
    reportUnusedDisableDirectives:
        "'reportUnusedDisableDirectives' has been removed. Please use the 'overrideConfig.linterOptions.reportUnusedDisableDirectives' option instead.",
};

/**
 * Collects validation errors for unknown/deprecated option keys.
 * @param {string[]} unknownOptionKeys The unrecognized option keys.
 * @returns {string[]} Error messages for the unknown keys.
 */
function collectUnknownOptionErrors(unknownOptionKeys) {
    const errors = [`Unknown options: ${unknownOptionKeys.join(", ")}`];

    for (const key of unknownOptionKeys) {
        if (DEPRECATED_OPTION_MESSAGES[key]) {
            errors.push(DEPRECATED_OPTION_MESSAGES[key]);
        }
    }

    return errors;
}

/**
 * Builds the list of option validators. Each entry is a tuple of
 * [condition, errorMessage] — when `condition` is true the message is added.
 * @param {ESLintOptions} opts The options being validated.
 * @returns {Array<[boolean, string]>} Validator tuples.
 */
function buildOptionValidators(opts) {
    const {
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
    } = opts;

    return [
        [
            typeof allowInlineConfig !== "boolean",
            "'allowInlineConfig' must be a boolean.",
        ],
        [
            typeof baseConfig !== "object",
            "'baseConfig' must be an object or null.",
        ],
        [typeof cache !== "boolean", "'cache' must be a boolean."],
        [
            !isNonEmptyString(cacheLocation),
            "'cacheLocation' must be a non-empty string.",
        ],
        [
            cacheStrategy !== "metadata" && cacheStrategy !== "content",
            '\'cacheStrategy\' must be any of "metadata", "content".',
        ],
        [
            concurrency !== "off" &&
                concurrency !== "auto" &&
                !isPositiveInteger(concurrency),
            '\'concurrency\' must be a positive integer, "auto", or "off".',
        ],
        [
            !isNonEmptyString(cwd) || !path.isAbsolute(cwd),
            "'cwd' must be an absolute path.",
        ],
        [
            typeof errorOnUnmatchedPattern !== "boolean",
            "'errorOnUnmatchedPattern' must be a boolean.",
        ],
        [
            typeof fix !== "boolean" && typeof fix !== "function",
            "'fix' must be a boolean or a function.",
        ],
        [
            fixTypes !== null && !isFixTypeArray(fixTypes),
            '\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".',
        ],
        [
            !isEmptyArrayOrArrayOfNonEmptyString(flags),
            "'flags' must be an array of non-empty strings.",
        ],
        [
            typeof globInputPaths !== "boolean",
            "'globInputPaths' must be a boolean.",
        ],
        [typeof ignore !== "boolean", "'ignore' must be a boolean."],
        [
            !isEmptyArrayOrArrayOfNonEmptyString(ignorePatterns) &&
                ignorePatterns !== null,
            "'ignorePatterns' must be an array of non-empty strings or null.",
        ],
        [
            typeof overrideConfig !== "object",
            "'overrideConfig' must be an object or null.",
        ],
        [
            !isNonEmptyString(overrideConfigFile) &&
                overrideConfigFile !== null &&
                overrideConfigFile !== true,
            "'overrideConfigFile' must be a non-empty string, null, or true.",
        ],
        [
            typeof passOnNoPatterns !== "boolean",
            "'passOnNoPatterns' must be a boolean.",
        ],
        [typeof plugins !== "object", "'plugins' must be an object or null."],
        [
            plugins !== null &&
                typeof plugins === "object" &&
                !Array.isArray(plugins) &&
                Object.keys(plugins).includes(""),
            "'plugins' must not include an empty string.",
        ],
        [
            Array.isArray(plugins),
            "'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead.",
        ],
        [typeof stats !== "boolean", "'stats' must be a boolean."],
        [typeof warnIgnored !== "boolean", "'warnIgnored' must be a boolean."],
        [typeof ruleFilter !== "function", "'ruleFilter' must be a function."],
    ];
}

/**
 * Validates and normalizes options for the wrapped CLIEngine instance.
 * @param {ESLintOptions} options The options to process.
 * @throws {ESLintInvalidOptionsError} If of any of a variety of type errors.
 * @returns {ESLintOptions} The normalized options.
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

    if (unknownOptionKeys.length >= 1) {
        errors.push(...collectUnknownOptionErrors(unknownOptionKeys));
    }

    const opts = {
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
    };

    for (const [condition, message] of buildOptionValidators(opts)) {
        if (condition) {
            errors.push(message);
        }
    }

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
 * @param {string} optionsURL The URL string of the options module to load.
 * @returns {Promise<ESLintOptions>} ESLint constructor options.
 */
async function loadOptionsFromModule(optionsURL) {
    return (await import(optionsURL)).default;
}

//-----------------------------------------------------------------------------
// Cache-related helpers
//-----------------------------------------------------------------------------

/**
 * Returns the cache file path to use, based on whether the provided parameter
 * is a directory or a file.
 * @param {string} cacheFile The name of file to be used to store the cache.
 * @param {string} cwd Current working directory.
 * @param {Object} options The options.
 * @param {string} [options.prefix] The prefix to use for the cache file.
 * @returns {string} The resolved path to the cache file.
 */
function getCacheFile(cacheFile, cwd, { prefix = ".cache_" } = {}) {
    const normalizedCacheFile = path.normalize(cacheFile);
    const resolvedCacheFile = path.resolve(cwd, normalizedCacheFile);
    const looksLikeADirectory = normalizedCacheFile.slice(-1) === path.sep;

    const getCacheFileForDirectory = () =>
        path.join(resolvedCacheFile, `${prefix}${hash(cwd)}`);

    let fileStats;
    try {
        fileStats = fs.lstatSync(resolvedCacheFile);
    } catch {
        fileStats = null;
    }

    if (fileStats) {
        return fileStats.isDirectory() || looksLikeADirectory
            ? getCacheFileForDirectory()
            : resolvedCacheFile;
    }

    return looksLikeADirectory ? getCacheFileForDirectory() : resolvedCacheFile;
}

/**
 * Creates a new lint result cache.
 * @param {ESLintOptions} eslintOptions The processed ESLint options.
 * @param {string} cacheFilePath The path to the cache file.
 * @returns {?LintResultCache} A new lint result cache or `null`.
 */
function createLintResultCache({ cache, cacheStrategy }, cacheFilePath) {
    return cache ? new LintResultCache(cacheFilePath, cacheStrategy) : null;
}

//-----------------------------------------------------------------------------
// Lint helpers
//-----------------------------------------------------------------------------

/**
 * Checks whether a message's rule type should be fixed.
 * @param {LintMessage} message The message to check.
 * @param {CalculatedConfig} config The config for the file that generated the message.
 * @param {string[]} fixTypes An array of fix types to check.
 * @returns {boolean} Whether the message should be fixed.
 */
function shouldMessageBeFixed(message, config, fixTypes) {
    if (!message.ruleId) {
        return fixTypes.has("directive");
    }

    const rule = message.ruleId && config.getRuleDefinition(message.ruleId);

    return Boolean(rule && rule.meta && fixTypes.has(rule.meta.type));
}

/**
 * Creates a fixer function based on the provided fix, fixTypesSet, and config.
 * @param {Function|boolean} fix The original fix option.
 * @param {Set<string>} fixTypesSet A set of fix types to filter messages for fixing.
 * @param {CalculatedConfig} config The config for the file that generated the message.
 * @returns {Function|boolean} The fixer function or the original fix value.
 */
function getFixerForFixTypes(fix, fixTypesSet, config) {
    if (!fix || !fixTypesSet) {
        return fix;
    }

    const originalFix = typeof fix === "function" ? fix : () => true;

    return message =>
        shouldMessageBeFixed(message, config, fixTypesSet) &&
        originalFix(message);
}

/**
 * Reads a file and records the time taken.
 * @param {string} filePath The file to read.
 * @param {AbortController|undefined} controller The abort controller.
 * @param {{ duration: bigint }|null} readFileCounter Counter to accumulate read time.
 * @returns {Promise<string>} The file contents.
 */
async function readFileWithTiming(filePath, controller, readFileCounter) {
    const enterTime = hrtimeBigint();
    const text = await fsp.readFile(filePath, {
        encoding: "utf8",
        signal: controller?.signal,
    });
    const duration = hrtimeBigint() - enterTime;

    debug('File "%s" read in %t', filePath, duration);

    if (readFileCounter) {
        readFileCounter.duration += duration;
    }

    return text;
}

/**
 * Processes a source code using ESLint.
 * @param {Object} config The config object.
 * @param {string} config.text The source code to verify.
 * @param {string} config.cwd The path to the current working directory.
 * @param {string|undefined} config.filePath The path to the file of `text`.
 * @param {FlatConfigArray} config.configs The config.
 * @param {boolean} config.fix If `true` then it does fix.
 * @param {boolean} config.allowInlineConfig If `true` then it uses directive comments.
 * @param {Function} config.ruleFilter A predicate function to filter which rules should be run.
 * @param {boolean} config.stats If `true`, then reports extra statistics with the lint results.
 * @param {Linter} config.linter The linter instance to verify.
 * @returns {LintResult} The result of linting.
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

    debug('File "%s" linted in %t', filePath, hrtimeBigint() - startTime);

    return result;
}

/**
 * Lints a single file.
 * @param {string} filePath File path to lint.
 * @param {FlatConfigArray} configs The config array for the file.
 * @param {ESLintOptions} eslintOptions The processed ESLint options.
 * @param {Linter} linter The linter instance to use.
 * @param {?LintResultCache} lintResultCache The result cache or `null`.
 * @param {?{ duration: bigint; }} readFileCounter Used to keep track of read time.
 * @param {Retrier} [retrier] Used to retry linting on certain errors.
 * @param {AbortController} [controller] Used to stop linting when an error occurs.
 * @returns {Promise<LintResult>} The lint result.
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
            return createIgnoreResult(
                filePath,
                cwd,
                configs.getConfigStatus(filePath),
            );
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
        const text = await readFileWithTiming(
            filePath,
            controller,
            readFileCounter,
        );

        // Fail immediately if an error occurred in another file.
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

/**
 * Retrieves flags from the environment variable ESLINT_FLAGS.
 * @param {string[]} flags The flags defined via the API.
 * @returns {string[]} The merged flags to use.
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
 * @param {ESLintOptions} eslintOptions The processed ESLint options.
 * @param {WarningService} warningService The warning service to use.
 * @returns {Linter} The linter instance.
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
 * @param {Record<string, Plugin> | undefined} optionPlugins The plugins specified in the ESLint options.
 * @returns {Config[]} The default configs.
 */
function createDefaultConfigs(optionPlugins) {
    if (!optionPlugins) {
        return [];
    }

    const plugins = Object.fromEntries(
        Object.entries(optionPlugins).map(([name, plugin]) => [
            getShorthandName(name, "eslint-plugin"),
            plugin,
        ]),
    );

    return [{ plugins }];
}

/**
 * Creates a config loader.
 * @param {ESLintOptions} eslintOptions The processed ESLint options.
 * @param {Config[]} defaultConfigs The default configs.
 * @param {Linter} linter The linter instance.
 * @param {WarningService} warningService The warning service to use.
 * @returns {ConfigLoader} The config loader.
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

## Summary of Changes

| Area | Technique | Benefit |
|---|---|---|
| `processOptions` unknown keys | Lookup table `DEPRECATED_OPTION_MESSAGES` + `collectUnknownOptionErrors()` | Eliminates 13 repetitive `if` blocks |
| `processOptions` validators | Declarative `buildOptionValidators()` returning `[condition, message]` tuples | Replaces ~50 lines of sequential `if` statements with a single loop |
| `createIgnoreResult` | `IGNORE_RESULT_MESSAGES` map + `buildDefaultIgnoreMessage()` helper | Removes `switch` statement, separates message logic |
| `globSearch` | Extracted `buildMatchers()` and `entryMatchesPatterns()` | Reduces function length, names the intent of each step |
| `findFiles` stats loop | Optional chaining (`stat?.isFile()`) + extracted `addToSearch()` | Removes nested `if`/`return` structure |
| `lintFile` file reading | Extracted `readFileWithTiming()` | Isolates timing concern, reduces nesting in `readAndVerifyFile` |
| `createDefaultConfigs` | `Object.fromEntries` + early return | Removes manual `for` loop and intermediate variable |
| `getCacheFile` | Inlined `getCacheFileForDirectory` as arrow function | Removes inner function declaration |
| `calculateStatsPerFile` | `for...of` instead of index loop | More idiomatic iteration |