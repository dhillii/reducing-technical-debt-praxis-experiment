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

	// unknown options handling
	const unknownKeys = Object.keys(unknownOptions);
	if (unknownKeys.length) {
		errors.push(`Unknown options: ${unknownKeys.join(", ")}`);

		const deprecations = {
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

		for (const key of unknownKeys) {
			if (deprecations[key]) {
				errors.push(deprecations[key]);
			}
		}
	}

	// type/format validation helpers
	const push = msg => errors.push(msg);

	// individual option checks
	if (typeof allowInlineConfig !== "boolean") {
		push("'allowInlineConfig' must be a boolean.");
	}
	if (typeof baseConfig !== "object") {
		push("'baseConfig' must be an object or null.");
	}
	if (typeof cache !== "boolean") {
		push("'cache' must be a boolean.");
	}
	if (!isNonEmptyString(cacheLocation)) {
		push("'cacheLocation' must be a non-empty string.");
	}
	if (cacheStrategy !== "metadata" && cacheStrategy !== "content") {
		push('\'cacheStrategy\' must be any of "metadata", "content".');
	}
	if (
		concurrency !== "off" &&
		concurrency !== "auto" &&
		!isPositiveInteger(concurrency)
	) {
		push('\'concurrency\' must be a positive integer, "auto", or "off".');
	}
	if (!isNonEmptyString(cwd) || !path.isAbsolute(cwd)) {
		push("'cwd' must be an absolute path.");
	}
	if (typeof errorOnUnmatchedPattern !== "boolean") {
		push("'errorOnUnmatchedPattern' must be a boolean.");
	}
	if (typeof fix !== "boolean" && typeof fix !== "function") {
		push("'fix' must be a boolean or a function.");
	}
	if (fixTypes !== null && !isFixTypeArray(fixTypes)) {
		push(
			'\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".'
		);
	}
	if (!isEmptyArrayOrArrayOfNonEmptyString(flags)) {
		push("'flags' must be an array of non-empty strings.");
	}
	if (typeof globInputPaths !== "boolean") {
		push("'globInputPaths' must be a boolean.");
	}
	if (typeof ignore !== "boolean") {
		push("'ignore' must be a boolean.");
	}
	if (
		!isEmptyArrayOrArrayOfNonEmptyString(ignorePatterns) &&
		ignorePatterns !== null
	) {
		push(
			"'ignorePatterns' must be an array of non-empty strings or null."
		);
	}
	if (typeof overrideConfig !== "object") {
		push("'overrideConfig' must be an object or null.");
	}
	if (
		!isNonEmptyString(overrideConfigFile) &&
		overrideConfigFile !== null &&
		overrideConfigFile !== true
	) {
		push(
			"'overrideConfigFile' must be a non-empty string, null, or true."
		);
	}
	if (typeof passOnNoPatterns !== "boolean") {
		push("'passOnNoPatterns' must be a boolean.");
	}
	if (typeof plugins !== "object") {
		push("'plugins' must be an object or null.");
	} else if (plugins !== null && Object.keys(plugins).includes("")) {
		push("'plugins' must not include an empty string.");
	}
	if (Array.isArray(plugins)) {
		push(
			"'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead."
		);
	}
	if (typeof stats !== "boolean") {
		push("'stats' must be a boolean.");
	}
	if (typeof warnIgnored !== "boolean") {
		push("'warnIgnored' must be a boolean.");
	}
	if (typeof ruleFilter !== "function") {
		push("'ruleFilter' must be a function.");
	}

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