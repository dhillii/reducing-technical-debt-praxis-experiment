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

	if (unknownOptionKeys.length) {
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

	const validators = [
		{
			name: "allowInlineConfig",
			value: allowInlineConfig,
			validator: v => typeof v === "boolean",
			msg: "'allowInlineConfig' must be a boolean.",
		},
		{
			name: "baseConfig",
			value: baseConfig,
			validator: v => typeof v === "object" || v === null,
			msg: "'baseConfig' must be an object or null.",
		},
		{
			name: "cache",
			value: cache,
			validator: v => typeof v === "boolean",
			msg: "'cache' must be a boolean.",
		},
		{
			name: "cacheLocation",
			value: cacheLocation,
			validator: v => isNonEmptyString(v),
			msg: "'cacheLocation' must be a non-empty string.",
		},
		{
			name: "cacheStrategy",
			value: cacheStrategy,
			validator: v => v === "metadata" || v === "content",
			msg: "'cacheStrategy' must be any of \"metadata\", \"content\".",
		},
		{
			name: "concurrency",
			value: concurrency,
			validator: v =>
				v === "off" || v === "auto" || isPositiveInteger(v),
			msg:
				"'concurrency' must be a positive integer, \"auto\", or \"off\".",
		},
		{
			name: "cwd",
			value: cwd,
			validator: v => isNonEmptyString(v) && path.isAbsolute(v),
			msg: "'cwd' must be an absolute path.",
		},
		{
			name: "errorOnUnmatchedPattern",
			value: errorOnUnmatchedPattern,
			validator: v => typeof v === "boolean",
			msg: "'errorOnUnmatchedPattern' must be a boolean.",
		},
		{
			name: "fix",
			value: fix,
			validator: v => typeof v === "boolean" || typeof v === "function",
			msg: "'fix' must be a boolean or a function.",
		},
		{
			name: "fixTypes",
			value: fixTypes,
			validator: v => v === null || isFixTypeArray(v),
			msg:
				"'fixTypes' must be an array of any of \"directive\", \"problem\", \"suggestion\", and \"layout\".",
		},
		{
			name: "flags",
			value: flags,
			validator: v => isEmptyArrayOrArrayOfNonEmptyString(v),
			msg: "'flags' must be an array of non-empty strings.",
		},
		{
			name: "globInputPaths",
			value: globInputPaths,
			validator: v => typeof v === "boolean",
			msg: "'globInputPaths' must be a boolean.",
		},
		{
			name: "ignore",
			value: ignore,
			validator: v => typeof v === "boolean",
			msg: "'ignore' must be a boolean.",
		},
		{
			name: "ignorePatterns",
			value: ignorePatterns,
			validator: v =>
				(v === null && true) ||
				isEmptyArrayOrArrayOfNonEmptyString(v),
			msg:
				"'ignorePatterns' must be an array of non-empty strings or null.",
		},
		{
			name: "overrideConfig",
			value: overrideConfig,
			validator: v => typeof v === "object" || v === null,
			msg: "'overrideConfig' must be an object or null.",
		},
		{
			name: "overrideConfigFile",
			value: overrideConfigFile,
			validator: v =>
				typeof v === "string" ||
				v === null ||
				v === true,
			msg:
				"'overrideConfigFile' must be a non-empty string, null, or true.",
		},
		{
			name: "passOnNoPatterns",
			value: passOnNoPatterns,
			validator: v => typeof v === "boolean",
			msg: "'passOnNoPatterns' must be a boolean.",
		},
		{
			name: "plugins",
			value: plugins,
			validator: v => typeof v === "object" && v !== null,
			msg: "'plugins' must be an object or null.",
		},
		{
			name: "pluginsEmptyString",
			value: plugins,
			validator: v => !(Array.isArray(v) || Object.keys(v).includes("")),
			msg: "'plugins' must not include an empty string.",
		},
		{
			name: "pluginsArray",
			value: plugins,
			validator: v => !Array.isArray(v),
			msg:
				"'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead.",
		},
		{
			name: "stats",
			value: stats,
			validator: v => typeof v === "boolean",
			msg: "'stats' must be a boolean.",
		},
		{
			name: "warnIgnored",
			value: warnIgnored,
			validator: v => typeof v === "boolean",
			msg: "'warnIgnored' must be a boolean.",
		},
		{
			name: "ruleFilter",
			value: ruleFilter,
			validator: v => typeof v === "function",
			msg: "'ruleFilter' must be a function.",
		},
	];

	for (const { validator, msg } of validators) {
		if (!validator) continue;
		if (!validator(validator.value)) {
			errors.push(msg);
		}
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