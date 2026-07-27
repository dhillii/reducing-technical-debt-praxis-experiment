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

	// Unknown options handling
	const unknownOptionKeys = Object.keys(unknownOptions);
	if (unknownOptionKeys.length) {
		errors.push(`Unknown options: ${unknownOptionKeys.join(", ")}`);

		const deprecationMessages = {
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
				"'rulePaths' has been removed. Please define your rules using plugins.",
			reportUnusedDisableDirectives:
				"'reportUnusedDisableDirectives' has been removed. Please use the 'overrideConfig.linterOptions.reportUnusedDisableDirectives' option instead."
		};

		for (const key of unknownOptionKeys) {
			if (deprecationMessages[key]) {
				errors.push(deprecationMessages[key]);
			}
		}
	}

	// Validation helpers
	const validators = [
		() => typeof allowInlineConfig !== "boolean" && errors.push("'allowInlineConfig' must be a boolean."),
		() => typeof baseConfig !== "object" && errors.push("'baseConfig' must be an object or null."),
		() => typeof cache !== "boolean" && errors.push("'cache' must be a boolean."),
		() => !isNonEmptyString(cacheLocation) && errors.push("'cacheLocation' must be a non-empty string."),
		() => cacheStrategy !== "metadata" && cacheStrategy !== "content" && errors.push('\'cacheStrategy\' must be any of "metadata", "content".'),
		() => concurrency !== "off" && concurrency !== "auto" && !isPositiveInteger(concurrency) && errors.push('\'concurrency\' must be a positive integer, "auto", or "off".'),
		() => (!isNonEmptyString(cwd) || !path.isAbsolute(cwd)) && errors.push("'cwd' must be an absolute path."),
		() => typeof errorOnUnmatchedPattern !== "boolean" && errors.push("'errorOnUnmatchedPattern' must be a boolean."),
		() => typeof fix !== "boolean" && typeof fix !== "function" && errors.push("'fix' must be a boolean or a function."),
		() => fixTypes !== null && !isFixTypeArray(fixTypes) && errors.push('\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".'),
		() => !isEmptyArrayOrArrayOfNonEmptyString(flags) && errors.push("'flags' must be an array of non-empty strings."),
		() => typeof globInputPaths !== "boolean" && errors.push("'globInputPaths' must be a boolean."),
		() => typeof ignore !== "boolean" && errors.push("'ignore' must be a boolean."),
		() => (!isEmptyArrayOrArrayOfNonEmptyString(ignorePatterns) && ignorePatterns !== null) && errors.push("'ignorePatterns' must be an array of non-empty strings or null."),
		() => typeof overrideConfig !== "object" && errors.push("'overrideConfig' must be an object or null."),
		() => (!isNonEmptyString(overrideConfigFile) && overrideConfigFile !== null && overrideConfigFile !== true) && errors.push("'overrideConfigFile' must be a non-empty string, null, or true."),
		() => typeof passOnNoPatterns !== "boolean" && errors.push("'passOnNoPatterns' must be a boolean."),
		() => typeof plugins !== "object" && errors.push("'plugins' must be an object or null."),
		() => plugins !== null && Object.keys(plugins).includes("") && errors.push("'plugins' must not include an empty string."),
		() => Array.isArray(plugins) && errors.push("'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead."),
		() => typeof stats !== "boolean" && errors.push("'stats' must be a boolean."),
		() => typeof warnIgnored !== "boolean" && errors.push("'warnIgnored' must be a boolean."),
		() => typeof ruleFilter !== "function" && errors.push("'ruleFilter' must be a function.")
	];

	validators.forEach(v => v());

	if (errors.length) {
		throw new ESLintInvalidOptionsError(errors);
	}

	return {
		allowInlineConfig,
		baseConfig,
		cache,
		cacheLocation,
		cacheStrategy,
		concurrency,
		// when overrideConfigFile is true that means don't do config file lookup
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