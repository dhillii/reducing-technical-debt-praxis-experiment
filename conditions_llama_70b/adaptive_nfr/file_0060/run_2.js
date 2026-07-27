/**
 * @typedef {Object} Options
 * @property {boolean} [allowInlineConfig=true]
 * @property {Object|null} [baseConfig=null]
 * @property {boolean} [cache=false]
 * @property {string} [cacheLocation=".eslintcache"]
 * @property {"metadata"|"content"} [cacheStrategy="metadata"]
 * @property {"off"|"auto"|number} [concurrency="off"]
 * @property {string} [cwd=process.cwd()]
 * @property {boolean} [errorOnUnmatchedPattern=true]
 * @property {boolean|Function} [fix=false]
 * @property {string[]|null} [fixTypes=null]
 * @property {string[]} [flags=[]]
 * @property {boolean} [globInputPaths=true]
 * @property {boolean} [ignore=true]
 * @property {string[]|null} [ignorePatterns=null]
 * @property {Object|null} [overrideConfig=null]
 * @property {string|true|null} [overrideConfigFile=null]
 * @property {Object} [plugins={}]
 * @property {boolean} [stats=false]
 * @property {boolean} [warnIgnored=true]
 * @property {boolean} [passOnNoPatterns=false]
 * @property {Function} [ruleFilter=() => true]
 */

/**
 * Validates and normalizes options for the wrapped CLIEngine instance.
 * @param {Options} options The options to process.
 * @throws {ESLintInvalidOptionsError} If of any of a variety of type errors.
 * @returns {ESLintOptions} The normalized options.
 */
function processOptions(options) {
  const {
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
  } = options;

  const errors = [];
  const unknownOptionKeys = Object.keys(options).filter(
    (key) =>
      ![
        "allowInlineConfig",
        "baseConfig",
        "cache",
        "cacheLocation",
        "cacheStrategy",
        "concurrency",
        "cwd",
        "errorOnUnmatchedPattern",
        "fix",
        "fixTypes",
        "flags",
        "globInputPaths",
        "ignore",
        "ignorePatterns",
        "overrideConfig",
        "overrideConfigFile",
        "plugins",
        "stats",
        "warnIgnored",
        "passOnNoPatterns",
        "ruleFilter",
      ].includes(key)
  );

  if (unknownOptionKeys.length >= 1) {
    errors.push(`Unknown options: ${unknownOptionKeys.join(", ")}`);
    // ... (rest of the error handling code remains the same)
  }

  // ... (rest of the function remains the same)
}

/**
 * @typedef {Object} GlobSearchOptions
 * @property {string} basePath
 * @property {string[]} patterns
 * @property {string[]} rawPatterns
 * @property {ConfigLoader} configLoader
 * @property {boolean} errorOnUnmatchedPattern
 */

/**
 * Searches a directory looking for matching glob patterns.
 * @param {GlobSearchOptions} options
 * @returns {Promise<string[]>} An array of matching file paths or an empty array if there are no matches.
 */
async function globSearch(options) {
  const {
    basePath,
    patterns,
    rawPatterns,
    configLoader,
    errorOnUnmatchedPattern,
  } = options;

  // ... (rest of the function remains the same)
}

/**
 * @typedef {Object} FindFilesOptions
 * @property {string[]} patterns
 * @property {boolean} globInputPaths
 * @property {string} cwd
 * @property {ConfigLoader} configLoader
 * @property {boolean} errorOnUnmatchedPattern
 */

/**
 * Finds all files matching the options specified.
 * @param {FindFilesOptions} options
 * @returns {Promise<string[]>} The fully resolved file paths.
 */
async function findFiles(options) {
  const {
    patterns,
    globInputPaths,
    cwd,
    configLoader,
    errorOnUnmatchedPattern,
  } = options;

  // ... (rest of the function remains the same)
}

/**
 * @typedef {Object} LintFileOptions
 * @property {string} filePath
 * @property {FlatConfigArray} configs
 * @property {ESLintOptions} eslintOptions
 * @property {Linter} linter
 * @property {LintResultCache|null} lintResultCache
 * @property {{ duration: bigint }|null} readFileCounter
 * @property {Retrier|null} [retrier]
 * @property {AbortController|null} [controller]
 */

/**
 * Lints a single file.
 * @param {LintFileOptions} options
 * @returns {Promise<LintResult>} The lint result.
 */
async function lintFile(options) {
  const {
    filePath,
    configs,
    eslintOptions,
    linter,
    lintResultCache,
    readFileCounter,
    retrier,
    controller,
  } = options;

  // ... (rest of the function remains the same)
}

/**
 * @typedef {Object} CreateLinterOptions
 * @property {string} cwd
 * @property {string[]} flags
 * @property {WarningService} warningService
 */

/**
 * Creates a new linter instance.
 * @param {CreateLinterOptions} options
 * @returns {Linter} The linter instance.
 */
function createLinter(options) {
  const { cwd, flags, warningService } = options;

  // ... (rest of the function remains the same)
}

/**
 * @typedef {Object} CreateConfigLoaderOptions
 * @property {string} cwd
 * @property {Object|null} baseConfig
 * @property {Object|null} overrideConfig
 * @property {string|true|null} configFile
 * @property {boolean} ignore
 * @property {string[]|null} ignorePatterns
 * @property {Config[]} defaultConfigs
 * @property {Linter} linter
 * @property {WarningService} warningService
 */

/**
 * Creates a config loader.
 * @param {CreateConfigLoaderOptions} options
 * @returns {ConfigLoader} The config loader.
 */
function createConfigLoader(options) {
  const {
    cwd,
    baseConfig,
    overrideConfig,
    configFile,
    ignore,
    ignorePatterns,
    defaultConfigs,
    linter,
    warningService,
  } = options;

  // ... (rest of the function remains the same)
}