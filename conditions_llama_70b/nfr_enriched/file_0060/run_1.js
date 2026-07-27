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
  const errors = validateUnknownOptions(unknownOptions);
  const validatedOptions = validateOptions({
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

  if (errors.length > 0) {
    throw new ESLintInvalidOptionsError(errors);
  }

  return validatedOptions;
}

/**
 * Validates unknown options.
 * @param {Object} unknownOptions The unknown options to validate.
 * @returns {string[]} An array of error messages.
 */
function validateUnknownOptions(unknownOptions) {
  const errors = [];
  const unknownOptionKeys = Object.keys(unknownOptions);

  if (unknownOptionKeys.length >= 1) {
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
        "'globals' has been removed. Please use the 'overrideConfig.languageOptions.globals' option instead.",
      );
    }
    if (unknownOptionKeys.includes("ignorePath")) {
      errors.push("'ignorePath' has been removed.");
    }
    if (unknownOptionKeys.includes("ignorePattern")) {
      errors.push(
        "'ignorePattern' has been removed. Please use the 'overrideConfig.ignorePatterns' option instead.",
      );
    }
    if (unknownOptionKeys.includes("parser")) {
      errors.push(
        "'parser' has been removed. Please use the 'overrideConfig.languageOptions.parser' option instead.",
      );
    }
    if (unknownOptionKeys.includes("parserOptions")) {
      errors.push(
        "'parserOptions' has been removed. Please use the 'overrideConfig.languageOptions.parserOptions' option instead.",
      );
    }
    if (unknownOptionKeys.includes("rules")) {
      errors.push(
        "'rules' has been removed. Please use the 'overrideConfig.rules' option instead.",
      );
    }
    if (unknownOptionKeys.includes("rulePaths")) {
      errors.push(
        "'rulePaths' has been removed. Please define your rules using plugins.",
      );
    }
    if (unknownOptionKeys.includes("reportUnusedDisableDirectives")) {
      errors.push(
        "'reportUnusedDisableDirectives' has been removed. Please use the 'overrideConfig.linterOptions.reportUnusedDisableDirectives' option instead.",
      );
    }
  }

  return errors;
}

/**
 * Validates options.
 * @param {Object} options The options to validate.
 * @returns {Object} The validated options.
 */
function validateOptions({
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
}) {
  const validatedOptions = {};

  if (typeof allowInlineConfig !== "boolean") {
    throw new Error("'allowInlineConfig' must be a boolean.");
  }
  validatedOptions.allowInlineConfig = allowInlineConfig;

  if (typeof baseConfig !== "object") {
    throw new Error("'baseConfig' must be an object or null.");
  }
  validatedOptions.baseConfig = baseConfig;

  if (typeof cache !== "boolean") {
    throw new Error("'cache' must be a boolean.");
  }
  validatedOptions.cache = cache;

  if (!isNonEmptyString(cacheLocation)) {
    throw new Error("'cacheLocation' must be a non-empty string.");
  }
  validatedOptions.cacheLocation = cacheLocation;

  if (cacheStrategy !== "metadata" && cacheStrategy !== "content") {
    throw new Error('\'cacheStrategy\' must be any of "metadata", "content".');
  }
  validatedOptions.cacheStrategy = cacheStrategy;

  if (
    concurrency !== "off" &&
    concurrency !== "auto" &&
    !isPositiveInteger(concurrency)
  ) {
    throw new Error(
      '\'concurrency\' must be a positive integer, "auto", or "off".',
    );
  }
  validatedOptions.concurrency = concurrency;

  if (!isNonEmptyString(cwd) || !path.isAbsolute(cwd)) {
    throw new Error("'cwd' must be an absolute path.");
  }
  validatedOptions.cwd = path.normalize(cwd);

  if (typeof errorOnUnmatchedPattern !== "boolean") {
    throw new Error("'errorOnUnmatchedPattern' must be a boolean.");
  }
  validatedOptions.errorOnUnmatchedPattern = errorOnUnmatchedPattern;

  if (typeof fix !== "boolean" && typeof fix !== "function") {
    throw new Error("'fix' must be a boolean or a function.");
  }
  validatedOptions.fix = fix;

  if (fixTypes !== null && !isFixTypeArray(fixTypes)) {
    throw new Error(
      '\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".',
    );
  }
  validatedOptions.fixTypes = fixTypes;

  if (!isEmptyArrayOrArrayOfNonEmptyString(flags)) {
    throw new Error("'flags' must be an array of non-empty strings.");
  }
  validatedOptions.flags = [...flags];

  if (typeof globInputPaths !== "boolean") {
    throw new Error("'globInputPaths' must be a boolean.");
  }
  validatedOptions.globInputPaths = globInputPaths;

  if (typeof ignore !== "boolean") {
    throw new Error("'ignore' must be a boolean.");
  }
  validatedOptions.ignore = ignore;

  if (
    !isEmptyArrayOrArrayOfNonEmptyString(ignorePatterns) &&
    ignorePatterns !== null
  ) {
    throw new Error(
      "'ignorePatterns' must be an array of non-empty strings or null.",
    );
  }
  validatedOptions.ignorePatterns = ignorePatterns;

  if (typeof overrideConfig !== "object") {
    throw new Error("'overrideConfig' must be an object or null.");
  }
  validatedOptions.overrideConfig = overrideConfig;

  if (
    !isNonEmptyString(overrideConfigFile) &&
    overrideConfigFile !== null &&
    overrideConfigFile !== true
  ) {
    throw new Error(
      "'overrideConfigFile' must be a non-empty string, null, or true.",
    );
  }
  validatedOptions.overrideConfigFile = overrideConfigFile;

  if (typeof passOnNoPatterns !== "boolean") {
    throw new Error("'passOnNoPatterns' must be a boolean.");
  }
  validatedOptions.passOnNoPatterns = passOnNoPatterns;

  if (typeof plugins !== "object") {
    throw new Error("'plugins' must be an object or null.");
  } else if (plugins !== null && Object.keys(plugins).includes("")) {
    throw new Error("'plugins' must not include an empty string.");
  }
  validatedOptions.plugins = plugins;

  if (Array.isArray(plugins)) {
    throw new Error(
      "'plugins' doesn\'t add plugins to configuration to load. Please use the \'overrideConfig.plugins\' option instead.',
    );
  }

  if (typeof stats !== "boolean") {
    throw new Error("'stats' must be a boolean.");
  }
  validatedOptions.stats = stats;

  if (typeof warnIgnored !== "boolean") {
    throw new Error("'warnIgnored' must be a boolean.");
  }
  validatedOptions.warnIgnored = warnIgnored;

  if (typeof ruleFilter !== "function") {
    throw new Error("'ruleFilter' must be a function.");
  }
  validatedOptions.ruleFilter = ruleFilter;

  return validatedOptions;
}