/**
 * @typedef {Object} Options
 * @property {boolean} [allowInlineConfig]
 * @property {Object} [baseConfig]
 * @property {boolean} [cache]
 * @property {string} [cacheLocation]
 * @property {string} [cacheStrategy]
 * @property {string|number} [concurrency]
 * @property {string} [cwd]
 * @property {boolean} [errorOnUnmatchedPattern]
 * @property {boolean|Function} [fix]
 * @property {string[]} [fixTypes]
 * @property {string[]} [flags]
 * @property {boolean} [globInputPaths]
 * @property {boolean} [ignore]
 * @property {string[]} [ignorePatterns]
 * @property {Object} [overrideConfig]
 * @property {string|boolean} [overrideConfigFile]
 * @property {boolean} [passOnNoPatterns]
 * @property {Object} [plugins]
 * @property {boolean} [stats]
 * @property {boolean} [warnIgnored]
 * @property {Function} [ruleFilter]
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
    passOnNoPatterns = false,
    plugins = {},
    stats = false,
    warnIgnored = true,
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
        "passOnNoPatterns",
        "plugins",
        "stats",
        "warnIgnored",
        "ruleFilter",
      ].includes(key)
  );

  if (unknownOptionKeys.length >= 1) {
    errors.push(`Unknown options: ${unknownOptionKeys.join(", ")}`);
    if (unknownOptionKeys.includes("cacheFile")) {
      errors.push(
        "'cacheFile' has been removed. Please use the 'cacheLocation' option instead."
      );
    }
    if (unknownOptionKeys.includes("configFile")) {
      errors.push(
        "'configFile' has been removed. Please use the 'overrideConfigFile' option instead."
      );
    }
    if (unknownOptionKeys.includes("envs")) {
      errors.push("'envs' has been removed.");
    }
    if (unknownOptionKeys.includes("extensions")) {
      errors.push("'extensions' has been removed.");
    }
    if (unknownOptionKeys.includes("resolvePluginsRelativeTo")) {
      errors.push("'resolvePluginsRelativeTo' has been removed.");
    }
    if (unknownOptionKeys.includes("globals")) {
      errors.push(
        "'globals' has been removed. Please use the 'overrideConfig.languageOptions.globals' option instead."
      );
    }
    if (unknownOptionKeys.includes("ignorePath")) {
      errors.push("'ignorePath' has been removed.");
    }
    if (unknownOptionKeys.includes("ignorePattern")) {
      errors.push(
        "'ignorePattern' has been removed. Please use the 'overrideConfig.ignorePatterns' option instead."
      );
    }
    if (unknownOptionKeys.includes("parser")) {
      errors.push(
        "'parser' has been removed. Please use the 'overrideConfig.languageOptions.parser' option instead."
      );
    }
    if (unknownOptionKeys.includes("parserOptions")) {
      errors.push(
        "'parserOptions' has been removed. Please use the 'overrideConfig.languageOptions.parserOptions' option instead."
      );
    }
    if (unknownOptionKeys.includes("rules")) {
      errors.push(
        "'rules' has been removed. Please use the 'overrideConfig.rules' option instead."
      );
    }
    if (unknownOptionKeys.includes("rulePaths")) {
      errors.push(
        "'rulePaths' has been removed. Please define your rules using plugins."
      );
    }
    if (unknownOptionKeys.includes("reportUnusedDisableDirectives")) {
      errors.push(
        "'reportUnusedDisableDirectives' has been removed. Please use the 'overrideConfig.linterOptions.reportUnusedDisableDirectives' option instead."
      );
    }
  }

  if (typeof allowInlineConfig !== "boolean") {
    errors.push("'allowInlineConfig' must be a boolean.");
  }
  if (typeof baseConfig !== "object") {
    errors.push("'baseConfig' must be an object or null.");
  }
  if (typeof cache !== "boolean") {
    errors.push("'cache' must be a boolean.");
  }
  if (!isNonEmptyString(cacheLocation)) {
    errors.push("'cacheLocation' must be a non-empty string.");
  }
  if (cacheStrategy !== "metadata" && cacheStrategy !== "content") {
    errors.push('\'cacheStrategy\' must be any of "metadata", "content".');
  }
  if (
    concurrency !== "off" &&
    concurrency !== "auto" &&
    !isPositiveInteger(concurrency)
  ) {
    errors.push(
      '\'concurrency\' must be a positive integer, "auto", or "off".'
    );
  }
  if (!isNonEmptyString(cwd) || !path.isAbsolute(cwd)) {
    errors.push("'cwd' must be an absolute path.");
  }
  if (typeof errorOnUnmatchedPattern !== "boolean") {
    errors.push("'errorOnUnmatchedPattern' must be a boolean.");
  }
  if (typeof fix !== "boolean" && typeof fix !== "function") {
    errors.push("'fix' must be a boolean or a function.");
  }
  if (fixTypes !== null && !isFixTypeArray(fixTypes)) {
    errors.push(
      '\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".'
    );
  }
  if (!isEmptyArrayOrArrayOfNonEmptyString(flags)) {
    errors.push("'flags' must be an array of non-empty strings.");
  }
  if (typeof globInputPaths !== "boolean") {
    errors.push("'globInputPaths' must be a boolean.");
  }
  if (typeof ignore !== "boolean") {
    errors.push("'ignore' must be a boolean.");
  }
  if (
    !isEmptyArrayOrArrayOfNonEmptyString(ignorePatterns) &&
    ignorePatterns !== null
  ) {
    errors.push(
      "'ignorePatterns' must be an array of non-empty strings or null."
    );
  }
  if (typeof overrideConfig !== "object") {
    errors.push("'overrideConfig' must be an object or null.");
  }
  if (
    !isNonEmptyString(overrideConfigFile) &&
    overrideConfigFile !== null &&
    overrideConfigFile !== true
  ) {
    errors.push(
      "'overrideConfigFile' must be a non-empty string, null, or true."
    );
  }
  if (typeof passOnNoPatterns !== "boolean") {
    errors.push("'passOnNoPatterns' must be a boolean.");
  }
  if (typeof plugins !== "object") {
    errors.push("'plugins' must be an object or null.");
  } else if (plugins !== null && Object.keys(plugins).includes("")) {
    errors.push("'plugins' must not include an empty string.");
  }
  if (Array.isArray(plugins)) {
    errors.push(
      "'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead."
    );
  }
  if (typeof stats !== "boolean") {
    errors.push("'stats' must be a boolean.");
  }
  if (typeof warnIgnored !== "boolean") {
    errors.push("'warnIgnored' must be a boolean.");
  }
  if (typeof ruleFilter !== "function") {
    errors.push("'ruleFilter' must be a function.");
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
 * @typedef {Object} GlobSearchOptions
 * @property {string} basePath
 * @property {Array<string>} patterns
 * @property {Array<string>} rawPatterns
 * @property {ConfigLoader} configLoader
 * @property {boolean} errorOnUnmatchedPattern
 */

/**
 * Searches a directory looking for matching glob patterns.
 * @param {GlobSearchOptions} options
 * @returns {Promise<Array<string>>} An array of matching file paths or an empty array if there are no matches.
 * @throws {UnmatchedSearchPatternsError} If there is a pattern that doesn't match any files.
 */
async function globSearch({
  basePath,
  patterns,
  rawPatterns,
  configLoader,
  errorOnUnmatchedPattern,
}) {
  // ...
}

/**
 * @typedef {Object} FindFilesOptions
 * @property {Array<string>} patterns
 * @property {boolean} globInputPaths
 * @property {string} cwd
 * @property {ConfigLoader} configLoader
 * @property {boolean} errorOnUnmatchedPattern
 */

/**
 * Finds all files matching the options specified.
 * @param {FindFilesOptions} options
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
  // ...
}

/**
 * @typedef {Object} VerifyTextOptions
 * @property {string} text
 * @property {string} cwd
 * @property {string|undefined} filePath
 * @property {FlatConfigArray} configs
 * @property {boolean} fix
 * @property {boolean} allowInlineConfig
 * @property {Function} ruleFilter
 * @property {boolean} stats
 * @property {Linter} linter
 */

/**
 * Processes a source code using ESLint.
 * @param {VerifyTextOptions} options
 * @returns {LintResult} The result of linting.
 */
function verifyText({
  text,
  cwd,
  filePath,
  configs,
  fix,
  allowInlineConfig,
  ruleFilter,
  stats,
  linter,
}) {
  // ...
}

/**
 * @typedef {Object} LintFileOptions
 * @property {string} filePath
 * @property {FlatConfigArray} configs
 * @property {ESLintOptions} eslintOptions
 * @property {Linter} linter
 * @property {?LintResultCache} lintResultCache
 * @property {?{ duration: bigint; }} readFileCounter
 * @property {Retrier} [retrier]
 * @property {AbortController} [controller]
 */

/**
 * Lints a single file.
 * @param {LintFileOptions} options
 * @returns {Promise<LintResult>} The lint result.
 */
async function lintFile({
  filePath,
  configs,
  eslintOptions,
  linter,
  lintResultCache,
  readFileCounter,
  retrier,
  controller,
}) {
  // ...
}