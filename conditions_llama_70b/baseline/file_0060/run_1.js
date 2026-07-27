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
  const validateOptions = validateUnknownOptions(unknownOptions);
  const validateBooleans = validateBooleanOptions({
    allowInlineConfig,
    cache,
    errorOnUnmatchedPattern,
    fix,
    globInputPaths,
    ignore,
    stats,
    warnIgnored,
    passOnNoPatterns,
  });
  const validateStrings = validateStringOptions({
    cacheLocation,
    cwd,
    overrideConfigFile,
  });
  const validateObjects = validateObjectOptions({
    baseConfig,
    overrideConfig,
    plugins,
  });
  const validateArrays = validateArrayOptions({
    flags,
    ignorePatterns,
  });
  const validateFunctions = validateFunctionOptions({
    ruleFilter,
  });
  const validateFixTypes = validateFixTypesOption(fixTypes);
  const validateConcurrency = validateConcurrencyOption(concurrency);
  const validateCacheStrategy = validateCacheStrategyOption(cacheStrategy);

  const errors = [
    ...validateOptions,
    ...validateBooleans,
    ...validateStrings,
    ...validateObjects,
    ...validateArrays,
    ...validateFunctions,
    ...validateFixTypes,
    ...validateConcurrency,
    ...validateCacheStrategy,
  ];

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

function validateBooleanOptions(options) {
  const errors = [];

  Object.keys(options).forEach(key => {
    if (typeof options[key] !== "boolean") {
      errors.push(`'${key}' must be a boolean.`);
    }
  });

  return errors;
}

function validateStringOptions(options) {
  const errors = [];

  Object.keys(options).forEach(key => {
    if (!isNonEmptyString(options[key])) {
      errors.push(`'${key}' must be a non-empty string.`);
    }
  });

  return errors;
}

function validateObjectOptions(options) {
  const errors = [];

  Object.keys(options).forEach(key => {
    if (typeof options[key] !== "object") {
      errors.push(`'${key}' must be an object or null.`);
    }
  });

  return errors;
}

function validateArrayOptions(options) {
  const errors = [];

  Object.keys(options).forEach(key => {
    if (!isEmptyArrayOrArrayOfNonEmptyString(options[key])) {
      errors.push(`'${key}' must be an array of non-empty strings or null.`);
    }
  });

  return errors;
}

function validateFunctionOptions(options) {
  const errors = [];

  Object.keys(options).forEach(key => {
    if (typeof options[key] !== "function") {
      errors.push(`'${key}' must be a function.`);
    }
  });

  return errors;
}

function validateFixTypesOption(fixTypes) {
  const errors = [];

  if (fixTypes !== null && !isFixTypeArray(fixTypes)) {
    errors.push(
      "'fixTypes' must be an array of any of 'directive', 'problem', 'suggestion', and 'layout'.",
    );
  }

  return errors;
}

function validateConcurrencyOption(concurrency) {
  const errors = [];

  if (
    concurrency !== "off" &&
    concurrency !== "auto" &&
    !isPositiveInteger(concurrency)
  ) {
    errors.push(
      "'concurrency' must be a positive integer, 'auto', or 'off'.",
    );
  }

  return errors;
}

function validateCacheStrategyOption(cacheStrategy) {
  const errors = [];

  if (cacheStrategy !== "metadata" && cacheStrategy !== "content") {
    errors.push("'cacheStrategy' must be any of 'metadata', 'content'.");
  }

  return errors;
}