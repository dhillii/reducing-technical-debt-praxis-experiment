/**
 * @typedef {Object} ProcessOptionsParams
 * @property {boolean} [allowInlineConfig=true]
 * @property {Object|null} [baseConfig=null]
 * @property {boolean} [cache=false]
 * @property {string} [cacheLocation=".eslintcache"]
 * @property {string} [cacheStrategy="metadata"]
 * @property {string|number} [concurrency="off"]
 * @property {string} [cwd=process.cwd()]
 * @property {boolean} [errorOnUnmatchedPattern=true]
 * @property {boolean|Function} [fix=false]
 * @property {string[]|null} [fixTypes=null]
 * @property {string[]} [flags=[]]
 * @property {boolean} [globInputPaths=true]
 * @property {boolean} [ignore=true]
 * @property {string[]|null} [ignorePatterns=null]
 * @property {Object|null} [overrideConfig=null]
 * @property {string|boolean|null} [overrideConfigFile=null]
 * @property {Object} [plugins={}]
 * @property {boolean} [stats=false]
 * @property {boolean} [warnIgnored=true]
 * @property {boolean} [passOnNoPatterns=false]
 * @property {Function} [ruleFilter=()=>true]
 */

/**
 * @typedef {Object} ProcessOptionsValidationContext
 * @property {Array<string>} errors
 * @property {Object} options
 */

/**
 * Validates unknown options in processOptions
 * @param {Object} unknownOptions The unknown options object
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateUnknownOptions(unknownOptions, errors) {
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
}

/**
 * Validates allowInlineConfig option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateAllowInlineConfig(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'allowInlineConfig' must be a boolean.");
	}
}

/**
 * Validates baseConfig option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateBaseConfig(value, errors) {
	if (typeof value !== "object") {
		errors.push("'baseConfig' must be an object or null.");
	}
}

/**
 * Validates cache option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateCache(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'cache' must be a boolean.");
	}
}

/**
 * Validates cacheLocation option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateCacheLocation(value, errors) {
	if (!isNonEmptyString(value)) {
		errors.push("'cacheLocation' must be a non-empty string.");
	}
}

/**
 * Validates cacheStrategy option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateCacheStrategy(value, errors) {
	if (value !== "metadata" && value !== "content") {
		errors.push('\'cacheStrategy\' must be any of "metadata", "content".');
	}
}

/**
 * Validates concurrency option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
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

/**
 * Validates cwd option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateCwd(value, errors) {
	if (!isNonEmptyString(value) || !path.isAbsolute(value)) {
		errors.push("'cwd' must be an absolute path.");
	}
}

/**
 * Validates errorOnUnmatchedPattern option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateErrorOnUnmatchedPattern(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'errorOnUnmatchedPattern' must be a boolean.");
	}
}

/**
 * Validates fix option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateFix(value, errors) {
	if (typeof value !== "boolean" && typeof value !== "function") {
		errors.push("'fix' must be a boolean or a function.");
	}
}

/**
 * Validates fixTypes option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateFixTypes(value, errors) {
	if (value !== null && !isFixTypeArray(value)) {
		errors.push(
			'\'fixTypes\' must be an array of any of "directive", "problem", "suggestion", and "layout".',
		);
	}
}

/**
 * Validates flags option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateFlags(value, errors) {
	if (!isEmptyArrayOrArrayOfNonEmptyString(value)) {
		errors.push("'flags' must be an array of non-empty strings.");
	}
}

/**
 * Validates globInputPaths option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateGlobInputPaths(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'globInputPaths' must be a boolean.");
	}
}

/**
 * Validates ignore option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateIgnore(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'ignore' must be a boolean.");
	}
}

/**
 * Validates ignorePatterns option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
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

/**
 * Validates overrideConfig option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateOverrideConfig(value, errors) {
	if (typeof value !== "object") {
		errors.push("'overrideConfig' must be an object or null.");
	}
}

/**
 * Validates overrideConfigFile option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
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

/**
 * Validates passOnNoPatterns option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validatePassOnNoPatterns(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'passOnNoPatterns' must be a boolean.");
	}
}

/**
 * Validates plugins option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
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

/**
 * Validates stats option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateStats(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'stats' must be a boolean.");
	}
}

/**
 * Validates warnIgnored option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateWarnIgnored(value, errors) {
	if (typeof value !== "boolean") {
		errors.push("'warnIgnored' must be a boolean.");
	}
}

/**
 * Validates ruleFilter option
 * @param {any} value The value to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateRuleFilter(value, errors) {
	if (typeof value !== "function") {
		errors.push("'ruleFilter' must be a function.");
	}
}

/**
 * Validates all options in processOptions
 * @param {ProcessOptionsParams} options The options to validate
 * @param {Array<string>} errors The errors array to populate
 * @returns {void}
 */
function validateAllOptions(options, errors) {
	validateUnknownOptions(options, errors);
	validateAllowInlineConfig(options.allowInlineConfig, errors);
	validateBaseConfig(options.baseConfig, errors);
	validateCache(options.cache, errors);
	validateCacheLocation(options.cacheLocation, errors);
	validateCacheStrategy(options.cacheStrategy, errors);
	validateConcurrency(options.concurrency, errors);
	validateCwd(options.cwd, errors);
	validateErrorOnUnmatchedPattern(options.errorOnUnmatchedPattern, errors);
	validateFix(options.fix, errors);
	validateFixTypes(options.fixTypes, errors);
	validateFlags(options.flags, errors);
	validateGlobInputPaths(options.globInputPaths, errors);
	validateIgnore(options.ignore, errors);
	validateIgnorePatterns(options.ignorePatterns, errors);
	validateOverrideConfig(options.overrideConfig, errors);
	validateOverrideConfigFile(options.overrideConfigFile, errors);
	validatePassOnNoPatterns(options.passOnNoPatterns, errors);
	validatePlugins(options.plugins, errors);
	validateStats(options.stats, errors);
	validateWarnIgnored(options.warnIgnored, errors);
	validateRuleFilter(options.ruleFilter, errors);
}

/**
 * Normalizes and processes ESLint options
 * @param {ProcessOptionsParams} options The options to process
 * @returns {ESLintOptions} The normalized options
 */
function processOptions(options = {}) {
	const errors = [];
	validateAllOptions(options, errors);

	if (errors.length > 0) {
		throw new ESLintInvalidOptionsError(errors);
	}

	return {
		allowInlineConfig: options.allowInlineConfig ?? true,
		baseConfig: options.baseConfig ?? null,
		cache: options.cache ?? false,
		cacheLocation: options.cacheLocation ?? ".eslintcache",
		cacheStrategy: options.cacheStrategy ?? "metadata",
		concurrency: options.concurrency ?? "off",
		configFile:
			options.overrideConfigFile === true
				? false
				: options.overrideConfigFile ?? null,
		overrideConfig: options.overrideConfig ?? null,
		cwd: path.normalize(options.cwd ?? process.cwd()),
		errorOnUnmatchedPattern: options.errorOnUnmatchedPattern ?? true,
		fix: options.fix ?? false,
		fixTypes: options.fixTypes ?? null,
		flags: [...(options.flags ?? [])],
		globInputPaths: options.globInputPaths ?? true,
		ignore: options.ignore ?? true,
		ignorePatterns: options.ignorePatterns ?? null,
		stats: options.stats ?? false,
		passOnNoPatterns: options.passOnNoPatterns ?? false,
		warnIgnored: options.warnIgnored ?? true,
		ruleFilter: options.ruleFilter ?? (() => true),
	};
}