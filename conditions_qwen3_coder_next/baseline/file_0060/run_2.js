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

	// Validate unknown options
	const unknownOptionKeys = Object.keys(unknownOptions);
	if (unknownOptionKeys.length > 0) {
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
			reportUnusedDisableDirectives: "'reportUnusedDisableDirectives' has been removed. Please use the 'overrideConfig.linterOptions.reportUnusedDisableDirectives' option instead."
		};
		unknownOptionKeys.forEach(key => {
			if (deprecatedOptions[key]) {
				errors.push(deprecatedOptions[key]);
			}
		});
	}

	// Validate individual options
	validateBoolean(errors, "allowInlineConfig", allowInlineConfig);
	validateObjectOrNull(errors, "baseConfig", baseConfig);
	validateBoolean(errors, "cache", cache);
	validateNonEmptyString(errors, "cacheLocation", cacheLocation);
	validateCacheStrategy(errors, "cacheStrategy", cacheStrategy);
	validateConcurrency(errors, "concurrency", concurrency);
	validateAbsolutePath(errors, "cwd", cwd);
	validateBoolean(errors, "errorOnUnmatchedPattern", errorOnUnmatchedPattern);
	validateFixOption(errors, "fix", fix);
	validateFixTypes(errors, "fixTypes", fixTypes);
	validateStringArray(errors, "flags", flags);
	validateBoolean(errors, "globInputPaths", globInputPaths);
	validateBoolean(errors, "ignore", ignore);
	validateIgnorePatterns(errors, "ignorePatterns", ignorePatterns);
	validateObjectOrNull(errors, "overrideConfig", overrideConfig);
	validateOverrideConfigFile(errors, "overrideConfigFile", overrideConfigFile);
	validateBoolean(errors, "passOnNoPatterns", passOnNoPatterns);
	validatePlugins(errors, "plugins", plugins);
	validateBoolean(errors, "stats", stats);
	validateBoolean(errors, "warnIgnored", warnIgnored);
	validateFunction(errors, "ruleFilter", ruleFilter);

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

function validateBoolean(errors, name, value) {
	if (typeof value !== "boolean") {
		errors.push(`'${name}' must be a boolean.`);
	}
}

function validateNonEmptyString(errors, name, value) {
	if (!isNonEmptyString(value)) {
		errors.push(`'${name}' must be a non-empty string.`);
	}
}

function validateObjectOrNull(errors, name, value) {
	if (value !== null && (typeof value !== "object" || Array.isArray(value))) {
		errors.push(`'${name}' must be an object or null.`);
	}
}

function validateCacheStrategy(errors, name, value) {
	if (value !== "metadata" && value !== "content") {
		errors.push(`'${name}' must be any of "metadata", "content".`);
	}
}

function validateConcurrency(errors, name, value) {
	if (
		value !== "off" &&
		value !== "auto" &&
		!isPositiveInteger(value)
	) {
		errors.push(
			`'${name}' must be a positive integer, "auto", or "off".`,
		);
	}
}

function validateAbsolutePath(errors, name, value) {
	if (!isNonEmptyString(value) || !path.isAbsolute(value)) {
		errors.push(`'${name}' must be an absolute path.`);
	}
}

function validateFixOption(errors, name, value) {
	if (typeof value !== "boolean" && typeof value !== "function") {
		errors.push(`'${name}' must be a boolean or a function.`);
	}
}

function validateFixTypes(errors, name, value) {
	if (value !== null && !isFixTypeArray(value)) {
		errors.push(
			`'${name}' must be an array of any of "directive", "problem", "suggestion", and "layout".`,
		);
	}
}

function validateStringArray(errors, name, value) {
	if (!isEmptyArrayOrArrayOfNonEmptyString(value)) {
		errors.push(`'${name}' must be an array of non-empty strings.`);
	}
}

function validateIgnorePatterns(errors, name, value) {
	if (
		!isEmptyArrayOrArrayOfNonEmptyString(value) &&
		value !== null
	) {
		errors.push(
			`'${name}' must be an array of non-empty strings or null.`,
		);
	}
}

function validateOverrideConfigFile(errors, name, value) {
	if (
		!isNonEmptyString(value) &&
		value !== null &&
		value !== true
	) {
		errors.push(
			`'${name}' must be a non-empty string, null, or true.`,
		);
	}
}

function validatePlugins(errors, name, value) {
	if (typeof value !== "object" || Array.isArray(value)) {
		errors.push(`'${name}' must be an object or null.`);
		return;
	}
	if (value !== null && Object.keys(value).includes("")) {
		errors.push(`'${name}' must not include an empty string.`);
	}
}

function validateFunction(errors, name, value) {
	if (typeof value !== "function") {
		errors.push(`'${name}' must be a function.`);
	}
}