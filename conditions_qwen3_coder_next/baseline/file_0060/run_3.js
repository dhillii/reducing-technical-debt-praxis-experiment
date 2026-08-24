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
		...unknownOptions
	} = options;

	const errors = [];

	validateUnknownOptions(unknownOptions, errors);
	validateAllowInlineConfig(allowInlineConfig, errors);
	validateBaseConfig(baseConfig, errors);
	validateCache(cache, errors);
	validateCacheLocation(cacheLocation, errors);
	validateCacheStrategy(cacheStrategy, errors);
	validateConcurrency(concurrency, errors);
	validateCwd(cwd, errors);
	validateErrorOnUnmatchedPattern(errorOnUnmatchedPattern, errors);
	validateFix(fix, errors);
	validateFixTypes(fixTypes, errors);
	validateFlags(flags, errors);
	validateGlobInputPaths(globInputPaths, errors);
	validateIgnore(ignore, errors);
	validateIgnorePatterns(ignorePatterns, errors);
	validateOverrideConfig(overrideConfig, errors);
	validateOverrideConfigFile(overrideConfigFile, errors);
	validatePassOnNoPatterns(passOnNoPatterns, errors);
	validatePlugins(plugins, errors);
	validateStats(stats, errors);
	validateWarnIgnored(warnIgnored, errors);
	validateRuleFilter(ruleFilter, errors);

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
	if (unknownOptionKeys.length === 0) return;

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

	unknownOptionKeys.forEach(key => {
		if (deprecatedOptions[key]) {
			errors.push(deprecatedOptions[key]);
		}
	});
}

function validateAllowInlineConfig(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'allowInlineConfig' must be a boolean.");
	}
}

function validateBaseConfig(value, errors) {
	if (typeof value !== "object") {
		errors.push("'baseConfig' must be an object or null.");
	}
}

function validateCache(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'cache' must be a boolean.");
	}
}

function validateCacheLocation(value, errors) {
	if (!isNonEmptyString(value)) {
		errors.push("'cacheLocation' must be a non-empty string.");
	}
}

function validateCacheStrategy(value, errors) {
	if (value !== "metadata" && value !== "content") {
		errors.push('\'cacheStrategy\' must be any of "metadata", "content".');
	}
}

function validateConcurrency(value, errors) {
	if (
		value !== "off" &&
		value !== "auto" &&
		!isPositiveInteger(value)
	) {
		errors.push(
			'\'concurrency\' must be a positive integer, "auto", or "off".',
		);
	}
}

function validateCwd(value, errors) {
	if (!isNonEmptyString(value) || !path.isAbsolute(value)) {
		errors.push("'cwd' must be an absolute path.");
	}
}

function validateErrorOnUnmatchedPattern(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'errorOnUnmatchedPattern' must be a boolean.");
	}
}

function validateFix(value, errors) {
	if (typeof value !== "boolean" && typeof value !== "function") {
		errors.push("'fix' must be a boolean or a function.");
	}
}

function validateFixTypes(value, errors) {
	if (value !== null && !isFixTypeArray(value)) {
		errors.push(
			'\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".',
		);
	}
}

function validateFlags(value, errors) {
	if (!isEmptyArrayOrArrayOfNonEmptyString(value)) {
		errors.push("'flags' must be an array of non-empty strings.");
	}
}

function validateGlobInputPaths(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'globInputPaths' must be a boolean.");
	}
}

function validateIgnore(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'ignore' must be a boolean.");
	}
}

function validateIgnorePatterns(value, errors) {
	if (
		!isEmptyArrayOrArrayOfNonEmptyString(value) &&
		value !== null
	) {
		errors.push(
			"'ignorePatterns' must be an array of non-empty strings or null.",
		);
	}
}

function validateOverrideConfig(value, errors) {
	if (typeof value !== "object") {
		errors.push("'overrideConfig' must be an object or null.");
	}
}

function validateOverrideConfigFile(value, errors) {
	if (
		!isNonEmptyString(value) &&
		value !== null &&
		value !== true
	) {
		errors.push(
			"'overrideConfigFile' must be a non-empty string, null, or true.",
		);
	}
}

function validatePassOnNoPatterns(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'passOnNoPatterns' must be a boolean.");
	}
}

function validatePlugins(value, errors) {
	if (typeof value !== "object") {
		errors.push("'plugins' must be an object or null.");
	} else if (value !== null && Object.keys(value).includes("")) {
		errors.push("'plugins' must not include an empty string.");
	}

	if (Array.isArray(value)) {
		errors.push(
			"'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead.",
		);
	}
}

function validateStats(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'stats' must be a boolean.");
	}
}

function validateWarnIgnored(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'warnIgnored' must be a boolean.");
	}
}

function validateRuleFilter(value, errors) {
	if (typeof value !== "function") {
		errors.push("'ruleFilter' must be a function.");
	}
}