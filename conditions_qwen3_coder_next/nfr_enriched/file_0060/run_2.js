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
	const errors = [
		...validateUnknownOptions(unknownOptions),
		...validateAllowInlineConfig(allowInlineConfig),
		...validateBaseConfig(baseConfig),
		...validateCache(cache),
		...validateCacheLocation(cacheLocation),
		...validateCacheStrategy(cacheStrategy),
		...validateConcurrency(concurrency),
		...validateCwd(cwd),
		...validateErrorOnUnmatchedPattern(errorOnUnmatchedPattern),
		...validateFix(fix),
		...validateFixTypes(fixTypes),
		...validateFlags(flags),
		...validateGlobInputPaths(globInputPaths),
		...validateIgnore(ignore),
		...validateIgnorePatterns(ignorePatterns),
		...validateOverrideConfig(overrideConfig),
		...validateOverrideConfigFile(overrideConfigFile),
		...validatePassOnNoPatterns(passOnNoPatterns),
		...validatePlugins(plugins),
		...validateStats(stats),
		...validateWarnIgnored(warnIgnored),
		...validateRuleFilter(ruleFilter),
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
	const errorMessages = [];
	const unknownOptionKeys = Object.keys(unknownOptions);

	if (unknownOptionKeys.length === 0) {
		return errorMessages;
	}

	errorMessages.push(`Unknown options: ${unknownOptionKeys.join(", ")}`);

	const mapping = {
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
		const message = mapping[key];
		if (message) {
			errorMessages.push(message);
		}
	}

	return errorMessages;
}

function validateAllowInlineConfig(value) {
	return typeof value !== "boolean" ? ["'allowInlineConfig' must be a boolean."] : [];
}

function validateBaseConfig(value) {
	return typeof value !== "object" ? ["'baseConfig' must be an object or null."] : [];
}

function validateCache(value) {
	return typeof value !== "boolean" ? ["'cache' must be a boolean."] : [];
}

function validateCacheLocation(value) {
	return isNonEmptyString(value) ? [] : ["'cacheLocation' must be a non-empty string."]
}

function validateCacheStrategy(value) {
	return (value === "metadata" || value === "content")
		? []
		: ['\'cacheStrategy\' must be any of "metadata", "content".'];
}

function validateConcurrency(value) {
	if (value === "off" || value === "auto") {
		return [];
	}
	return isPositiveInteger(value)
		? []
		: ['\'concurrency\' must be a positive integer, "auto", or "off".'];
}

function validateCwd(value) {
	return isNonEmptyString(value) && path.isAbsolute(value)
		? []
		: ["'cwd' must be an absolute path."]
}

function validateErrorOnUnmatchedPattern(value) {
	return typeof value !== "boolean" ? ["'errorOnUnmatchedPattern' must be a boolean."] : [];
}

function validateFix(value) {
	return (typeof value === "boolean" || typeof value === "function")
		? []
		: ["'fix' must be a boolean or a function."]
}

function validateFixTypes(value) {
	return value === null || isFixTypeArray(value)
		? []
		: ['\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".'];
}

function validateFlags(value) {
	return isEmptyArrayOrArrayOfNonEmptyString(value)
		? []
		: ["'flags' must be an array of non-empty strings."]
}

function validateGlobInputPaths(value) {
	return typeof value !== "boolean" ? ["'globInputPaths' must be a boolean."] : [];
}

function validateIgnore(value) {
	return typeof value !== "boolean" ? ["'ignore' must be a boolean."] : [];
}

function validateIgnorePatterns(value) {
	return (value === null || isEmptyArrayOrArrayOfNonEmptyString(value))
		? []
		: ["'ignorePatterns' must be an array of non-empty strings or null."]
}

function validateOverrideConfig(value) {
	return typeof value !== "object" ? ["'overrideConfig' must be an object or null."] : [];
}

function validateOverrideConfigFile(value) {
	return isNonEmptyString(value) || value === null || value === true
		? []
		: ["'overrideConfigFile' must be a non-empty string, null, or true."]
}

function validatePassOnNoPatterns(value) {
	return typeof value !== "boolean" ? ["'passOnNoPatterns' must be a boolean."] : [];
}

function validatePlugins(value) {
	if (typeof value !== "object") {
		return ["'plugins' must be an object or null."]
	}
	if (value !== null && Object.keys(value).includes("")) {
		return ["'plugins' must not include an empty string."]
	}
	if (Array.isArray(value)) {
		return ["'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead."]
	}
	return []
}

function validateStats(value) {
	return typeof value !== "boolean" ? ["'stats' must be a boolean."] : [];
}

function validateWarnIgnored(value) {
	return typeof value !== "boolean" ? ["'warnIgnored' must be a boolean."] : [];
}

function validateRuleFilter(value) {
	return typeof value !== "function" ? ["'ruleFilter' must be a function."] : [];
}

function isFixType(value) {
	return (
		value === "directive" ||
		value === "problem" ||
		value === "suggestion" ||
		value === "layout"
	);
}

function isFixTypeArray(value) {
	return Array.isArray(value) && value.every(isFixType);
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