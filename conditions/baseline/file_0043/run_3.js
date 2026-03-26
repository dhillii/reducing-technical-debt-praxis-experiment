# Refactored ESLint Helper Functions

Here's the refactored code with reduced complexity through several strategies:
1. Extracted repeated logic into helper functions
2. Simplified complex conditionals
3. Reduced nesting in `processOptions` using a validation table
4. Simplified loops and data transformations

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
     * @param {string} pattern
     * @param {boolean} globEnabled
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
    /** @param {string} pattern */
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
// General Helpers
//-----------------------------------------------------------------------------

/**
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
    return typeof value === "string" && value.trim() !== "";
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function isArrayOfNonEmptyString(value) {
    return Array.isArray(value) && !!value.length && value.every(isNonEmptyString);
}

/**
 * @param {any} value
 * @returns {boolean}
 */
function isEmptyArrayOrArrayOfNonEmptyString(value) {
    return Array.isArray(value) && value.every(isNonEmptyString);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isPositiveInteger(value) {
    return Number.isInteger(value) && /** @type {number} */ (value) > 0;
}

//-----------------------------------------------------------------------------
// File-related Helpers
//-----------------------------------------------------------------------------

/**
 * @param {string} pattern
 * @returns {string}
 */
function normalizeToPosix(pattern) {
    return pattern.replace(/\\/gu, "/");
}

/**
 * @param {string} pattern
 * @returns {boolean}
 */
function isGlobPattern(pattern) {
    return isGlob(path.sep === "\\" ? normalizeToPosix(pattern) : pattern);
}

/**
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
        directoryFilter: entry => !found && matcher.match(entry.path, true),
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
 * Builds a map of relative patterns to their original absolute patterns,
 * and returns compiled Minimatch instances.
 * @param {string} basePath
 * @param {Array<string>} patterns
 * @returns {{ matchers: InstanceType<typeof Minimatch>[], relativeToPatterns: Map<string, string> }}
 */
function buildMatchers(basePath, patterns) {
    const relativeToPatterns = new Map();
    const matchers = patterns.map((pattern, i) => {
        const patternToUse = normalizeToPosix(path.relative(basePath, pattern));
        relativeToPatterns.set(patternToUse, patterns[i]);
        return new Minimatch(patternToUse, MINIMATCH_OPTIONS);
    });
    return { matchers, relativeToPatterns };
}

/**
 * Determines if an entry matches any of the given matchers, updating
 * the unmatched patterns set as matches are found.
 * @param {object} entry
 * @param {InstanceType<typeof Minimatch>[]} matchers
 * @param {Set<string>} unmatchedPatterns
 * @param {object|undefined} config
 * @returns {boolean}
 */
function entryMatchesPatterns(entry, matchers, unmatchedPatterns, config) {
    if (unmatchedPatterns.size === 0) {
        return matchers.some(matcher => matcher.match(entry.path));
    }

    return matchers.reduce((matched, matcher) => {
        const pathMatches = matcher.match(entry.path);
        if (pathMatches && config) {
            unmatchedPatterns.delete(matcher.pattern);
        }
        return pathMatches || matched;
    }, false);
}

/**
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

    const { matchers, relativeToPatterns } = buildMatchers(basePath, patterns);
    const unmatchedPatterns = new Set(relativeToPatterns.keys());
    const { hfs } = await import("@humanfs/node");

    const walk = hfs.walk(basePath, {
        async directoryFilter(entry) {
            if (!matchers.some(matcher => matcher.match(entry.path, true))) {
                return false;
            }
            const absolutePath = path.resolve(basePath, entry.path);
            const configs = await configLoader.loadConfigArrayForDirectory(absolutePath);
            return !configs.isDirectoryIgnored(absolutePath);
        },
        async entryFilter(entry) {
            if (entry.isDirectory) {
                return false;
            }
            const absolutePath = path.resolve(basePath, entry.path);
            const configs = await configLoader.loadConfigArrayForFile(absolutePath);
            const config = configs.getConfig(absolutePath);
            const matchesPattern = entryMatchesPatterns(entry, matchers, unmatchedPatterns, config);
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
            unmatchedPatterns: [...unmatchedPatterns].map(p => relativeToPatterns.get(p)),
            patterns,
            rawPatterns,
        });
    }

    return filePaths;
}

/**
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
 * @param {Object} options
 * @param {Map<string,GlobSearch>} options.searches
 * @param {ConfigLoader} options.configLoader
 * @param {boolean} options.errorOnUnmatchedPattern
 * @returns {Promise<Array<string>>}
 */
async function globMultiSearch({ searches, configLoader, errorOnUnmatchedPattern }) {
    const normalizedSearches = [...searches]
        .map(([basePath, { patterns, rawPatterns }]) => ({ basePath, patterns, rawPatterns }))
        .filter(({ patterns }) => patterns.length > 0);

    const results = await Promise.allSettled(
        normalizedSearches.map(search =>
            globSearch({ ...search, configLoader, errorOnUnmatchedPattern }),
        ),
    );

    for (let i = 0; i < results.length; i++) {
        const result = results[i];

        if (result.status === "fulfilled") {
            continue;
        }

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

    return results.flatMap(result => result.value);
}

/**
 * Processes a single file path stat result, updating results/searches accordingly.
 * @param {object} params
 * @param {fs.Stats|undefined} params.stat
 * @param {string} params.filePath
 * @param {string} params.pattern
 * @param {boolean} params.globInputPaths
 * @param {string} params.cwd
 * @param {Array<string>} params.results
 * @param {Array<string>} params.missingPatterns
 * @param {Map<string, GlobSearch>} params.searches
 * @param {ConfigLoader} params.configLoader
 * @returns {Promise<void>|void}
 */
function processFileStat({
    stat,
    filePath,
    pattern,
    globInputPaths,
    cwd,
    results,
    missingPatterns,
    searches,
    configLoader,
}) {
    if (stat?.isFile()) {
        results.push(filePath);
        configLoader.loadConfigArrayForFile(filePath);
        return;
    }

    if (stat?.isDirectory()) {
        if (!searches.has(filePath)) {
            searches.set(filePath, { patterns: [], rawPatterns: [] });
        }
        const entry = searches.get(filePath);
        entry.patterns.push(`${normalizeToPosix(filePath)}/**`);
        entry.rawPatterns.push(pattern);
        return;
    }

    if (globInputPaths && isGlobPattern(pattern)) {
        const basePath = path.resolve(cwd, globParent(pattern));
        if (!searches.has(basePath)) {
            searches.set(basePath, { patterns: [], rawPatterns: [] });
        }
        const entry = searches.get(basePath);
        entry.patterns.push(filePath);
        entry.rawPatterns.push(pattern);
        return;
    }

    missingPatterns.push(pattern);
}

/**
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

    const filePaths = patterns.map(p => path.resolve(cwd, p));
    const stats = await Promise.all(
        filePaths.map(fp => fsp.stat(fp).catch(() => {})),
    );

    stats.forEach((stat, index) => {
        processFileStat({
            stat,
            filePath: filePaths[index],
            pattern: normalizeToPosix(patterns[index]),
            globInputPaths,
            cwd,
            results,
            missingPatterns,
            searches,
            configLoader,
        });
    });

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
 * @param {string} cwd
 * @returns {string}
 */
function getPlaceholderPath(cwd) {
    return path.join(cwd, "__placeholder__.js");
}

//-----------------------------------------------------------------------------
// Results-related Helpers
//-----------------------------------------------------------------------------

/**
 * @param {LintMessage} message
 * @returns {boolean}
 */
function isErrorMessage(message) {
    return message.severity === 2;
}

/**
 * Determines the ignore message for a file in the default (non-external, non-unconfigured) case.
 * @param {string} filePath
 * @param {string} baseDir
 * @returns {string}
 */
function getDefaultIgnoreMessage(filePath, baseDir) {
    const isInNodeModules =
        baseDir &&
        path.dirname(path.relative(baseDir, filePath))
            .split(path.sep)
            .includes("node_modules");

    return isInNodeModules
        ? 'File ignored by default because it is located under the node_modules directory. Use ignore pattern "!**/node_modules/" to disable file ignore settings or use "--no-warn-ignored" to suppress this warning.'
        : 'File ignored because of a matching ignore pattern. Use "--no-ignore" to disable file ignore settings or use "--no-warn-ignored" to suppress this warning.';
}

/** @type {Record<string, string>} */
const IGNORE_MESSAGES = {
    external: "File ignored because outside of base path.",
    unconfigured: "File ignored because no matching configuration was supplied.",
};

/**
 * @param {string} filePath
 * @param {string} baseDir
 * @param {"ignored"|"external"|"unconfigured"} configStatus
 * @returns {LintResult}
 */
function createIgnoreResult(filePath, baseDir, configStatus) {
    const message =
        IGNORE_MESSAGES[configStatus] ?? getDefaultIgnoreMessage(filePath, baseDir);

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

const VALID_FIX_TYPES = new Set(["directive", "problem", "suggestion", "layout"]);

/** @param {any} x */
function isFixType(x) {
    return VALID_FIX_TYPES.has(x);
}

/** @param {any} x */
function isFixTypeArray(x) {
    return Array.isArray(x) && x.every(isFixType);
}

/** @type {Record<string, string>} */
const REMOVED_OPTIONS = {
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

/**
 * Validates unknown option keys and appends errors for removed options.
 * @param {string[]} unknownOptionKeys
 * @param {string[]} errors
 */
function validateUnknownOptions(unknownOptionKeys, errors) {
    if (unknownOptionKeys.length === 0) {
        return;
    }

    errors.push(`Unknown options: ${unknownOptionKeys.join(", ")}`);

    for (const key of unknownOptionKeys) {
        if (REMOVED_OPTIONS[key]) {
            errors.push(REMOVED_OPTIONS[key]);
        }
    }
}

/**
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

    validateUnknownOptions(Object.keys(unknownOptions), errors);

    /** @type {Array<[boolean, string]>} */
    const validations = [
        [typeof allowInlineConfig !== "boolean", "'allowInlineConfig' must be a boolean."],
        [typeof baseConfig !== "object", "'baseConfig' must be an object or null."],
        [typeof cache !== "boolean", "'cache' must be a boolean."],
        [!isNonEmptyString(cacheLocation), "'cacheLocation' must be a non-empty string."],
        [
            cacheStrategy !== "metadata" && cacheStrategy !== "content",
            '\'cacheStrategy\' must be any of "metadata", "content".',
        ],
        [
            concurrency !== "off" && concurrency !== "auto" && !isPositiveInteger(concurrency),
            '\'concurrency\' must be a positive integer, "auto", or "off".',
        ],
        [
            !isNonEmptyString(cwd) || !path.isAbsolute(cwd),
            "'cwd' must be an absolute path.",
        ],
        [typeof errorOnUnmatchedPattern !== "boolean", "'errorOnUnmatchedPattern' must be a boolean."],
        [
            typeof fix !== "boolean" && typeof fix !== "function",
            "'fix' must be a boolean or a function.",
        ],
        [
            fixTypes !== null && !isFixTypeArray(fixTypes),
            '\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".',
        ],
        [!isEmptyArrayOrArrayOfNonEmptyString(flags), "'flags' must be an array of non-empty strings."],
        [typeof globInputPaths !== "boolean", "'globInputPaths' must be a boolean."],
        [typeof ignore !== "boolean", "'ignore' must be a boolean."],
        [
            !isEmptyArrayOrArrayOfNonEmptyString(ignorePatterns) && ignorePatterns !== null,
            "'ignorePatterns' must be an array of non-empty strings or null.",
        ],
        [typeof overrideConfig !== "object", "'overrideConfig' must be an object or null."],
        [
            !isNonEmptyString(overrideConfigFile) &&
                overrideConfigFile !== null &&
                overrideConfigFile !== true,
            "'overrideConfigFile' must be a non-empty string, null, or true.",
        ],
        [typeof passOnNoPatterns !== "boolean", "'passOnNoPatterns' must be a boolean."],
        [typeof plugins !== "object", "'plugins' must be an object or null."],
        [
            plugins !== null && !Array.isArray(plugins) && Object.keys(plugins).includes(""),
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

    for (const [condition, message] of validations) {
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
 * @param {string} optionsURL
 * @returns {Promise<ESLintOptions>}
 */
async function loadOptionsFromModule(optionsURL) {
    return (await import(optionsURL)).default;
}

//-----------------------------------------------------------------------------
// Cache-related helpers
//-----------------------------------------------------------------------------

/**
 * @param {string} cacheFile
 * @param {string} cwd
 * @param {Object} [options]
 * @param {string} [options.prefix]
 * @returns {string}
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

/**
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
    return Boolean(rule?.meta && fixTypes.has(rule.meta.type));
}

/**
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
 * @param {Object} config
 * @param {string} config.text
 * @param {string} config.cwd
 * @param {string|undefined} config.filePath
 * @param {FlatConfigArray} config.configs
 * @param {boolean} config.fix
 * @param {boolean} config.allowInlineConfig
 * @param {Function} config.ruleFilter
 * @param {boolean} config.stats
 * @param {Linter} config.linter
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
        filterCodeBlock: blockFilename => configs.getConfig(blockFilename) !== void 0,
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

    debug('File "%s" linted in %t', filePath, hrtimeBigint() - startTime);

    return result;
}

/**
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
    const { allowInlineConfig, cwd, fix, fixTypes, ruleFilter, stats, warnIgnored } = eslintOptions;
    const fixTypesSet = fixTypes ? new Set(fixTypes) : null;

    if (!config) {
        if (warnIgnored) {
            return createIgnoreResult(filePath, cwd, configs.getConfigStatus(filePath));
        }
        return void 0;
    }

    if (lintResultCache) {
        const cachedResult = lintResultCache.getCachedLintResults(filePath, config);
        if (cachedResult) {
            const shouldReprocess = cachedResult.messages?.length > 0 && fix;
            if (shouldReprocess) {
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
        const readFileDuration = hrtimeBigint() - readFileEnterTime;

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

/**
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
 * @param {Record<string, Plugin> | undefined} optionPlugins
 * @returns {Config[]}
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
 * @param {ESLintOptions} eslintOptions
 * @param {Config[]} defaultConfigs
 * @param {Linter} linter
 * @param {WarningService} warningService
 * @returns {ConfigLoader}
 */
function createConfigLoader(
    { cwd, baseConfig, overrideConfig, configFile, ignore: ignoreEnabled, ignorePatterns },
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
        hasUnstableNativeNodeJsTSConfigFlag: linter.hasFlag("unstable_native_nodejs_ts_config"),
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

## Key Refactoring Changes

### Complexity Reductions

| Area | Before | After |
|------|--------|-------|
| `processOptions` validations | 20+ individual `if` blocks | Declarative `validations` array with a single loop |
| `processOptions` unknown options | 13 individual `if` checks | `REMOVED_OPTIONS` lookup table + `validateUnknownOptions()` |
| `createIgnoreResult` | `switch` with nested block | `IGNORE_MESSAGES` lookup table + extracted `getDefaultIgnoreMessage()` |
| `globSearch` | Inline complex `reduce` logic | Extracted `entryMatchesPatterns()` helper |
| `globSearch` | Inline matcher building | Extracted `buildMatchers()` helper |
| `findFiles` | Large `forEach` with nested conditionals | Extracted `processFileStat()` helper |
| `createDefaultConfigs` | `for...of` loop with manual assignment | `Object.fromEntries` + `map` |
| `getCacheFile` | Duplicated `getCacheFileForDirectory()` calls | Simplified to two `return` branches |
| `calculateStatsPerFile` | `for` loop with index | `for...of` loop |
| `verifyText` | Stored `endTime` variable | Inline `hrtimeBigint()` call |
| `shouldMessageBeFixed` | `Boolean(rule && rule.meta && ...)` | Optional chaining `rule?.meta` |