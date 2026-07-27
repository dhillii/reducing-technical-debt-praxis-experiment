/**
 * Collect errors for unknown options.
 * @param {Object} unknownOptions The unknown options object.
 * @returns {string[]} An array of error messages.
 */
function collectUnknownOptionErrors(unknownOptions) {
	const errors = [];
	const unknownOptionKeys = Object.keys(unknownOptions);

	if (unknownOptionKeys.length === 0) {
		return errors;
	}

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
	return errors;
}

/**
 * Collect errors for option type validation.
 * @param {Object} opts The processed options object.
 * @returns {string[]} An array of error messages.
 */
function collectOptionTypeErrors({
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
	passOnNoPatterns,
	plugins,
	stats,
	warnIgnored,
	ruleFilter,
}) {
	const errors = [];

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
			'\'concurrency\' must be a positive integer, "auto", or "off".',
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
			'\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".',
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
			"'ignorePatterns' must be an array of non-empty strings or null.",
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
			"'overrideConfigFile' must be a non-empty string, null, or true.",
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
			"'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead.",
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
	return errors;
}

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

	// Unknown options validation
	errors.push(...collectUnknownOptionErrors(unknownOptions));

	// Known options type validation
	errors.push(
		...collectOptionTypeErrors({
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
			passOnNoPatterns,
			plugins,
			stats,
			warnIgnored,
			ruleFilter,
		}),
	);

	if (errors.length > 0) {
		throw new ESLintInvalidOptionsError(errors);
	}

	// Normalized return object
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