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

	const validationErrors = [
		typeof allowInlineConfig !== "boolean" &&
			"'allowInlineConfig' must be a boolean.",
		typeof baseConfig !== "object" &&
			"'baseConfig' must be an object or null.",
		typeof cache !== "boolean" && "'cache' must be a boolean.",
		!isNonEmptyString(cacheLocation) &&
			"'cacheLocation' must be a non-empty string.",
		cacheStrategy !== "metadata" && cacheStrategy !== "content" &&
			'\'cacheStrategy\' must be any of "metadata", "content".',
		(concurrency !== "off" && concurrency !== "auto" && !isPositiveInteger(concurrency)) &&
			'\'concurrency\' must be a positive integer, "auto", or "off".',
		(!isNonEmptyString(cwd) || !path.isAbsolute(cwd)) &&
			"'cwd' must be an absolute path.",
		typeof errorOnUnmatchedPattern !== "boolean" &&
			"'errorOnUnmatchedPattern' must be a boolean.",
		(typeof fix !== "boolean" && typeof fix !== "function") &&
			"'fix' must be a boolean or a function.",
		(fixTypes !== null && !isFixTypeArray(fixTypes)) &&
			'\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".',
		(!isEmptyArrayOrArrayOfNonEmptyString(flags)) &&
			"'flags' must be an array of non-empty strings.",
		typeof globInputPaths !== "boolean" &&
			"'globInputPaths' must be a boolean.",
		typeof ignore !== "boolean" && "'ignore' must be a boolean.",
		(!isEmptyArrayOrArrayOfNonEmptyString(ignorePatterns) && ignorePatterns !== null) &&
			"'ignorePatterns' must be an array of non-empty strings or null.",
		typeof overrideConfig !== "object" &&
			"'overrideConfig' must be an object or null.",
		(!isNonEmptyString(overrideConfigFile) &&
			overrideConfigFile !== null &&
			overrideConfigFile !== true) &&
			"'overrideConfigFile' must be a non-empty string, null, or true.",
		typeof passOnNoPatterns !== "boolean" &&
			"'passOnNoPatterns' must be a boolean.",
		typeof plugins !== "object" &&
			"'plugins' must be an object or null.",
		(plugins !== null && Object.keys(plugins).includes("")) &&
			"'plugins' must not include an empty string.",
		Array.isArray(plugins) &&
			"'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead.",
		typeof stats !== "boolean" && "'stats' must be a boolean.",
		typeof warnIgnored !== "boolean" && "'warnIgnored' must be a boolean.",
		typeof ruleFilter !== "function" && "'ruleFilter' must be a function.",
	];

	if (validationErrors.some(Boolean)) {
		throw new ESLintInvalidOptionsError(errors.concat(validationErrors.filter(Boolean)));
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