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
			key: "allowInlineConfig",
			check: v => typeof v === "boolean",
			error: "'allowInlineConfig' must be a boolean.",
		},
		{
			key: "baseConfig",
			check: v => typeof v === "object",
			error: "'baseConfig' must be an object or null.",
		},
		{
			key: "cache",
			check: v => typeof v === "boolean",
			error: "'cache' must be a boolean.",
		},
		{
			key: "cacheLocation",
			check: v => isNonEmptyString(v),
			error: "'cacheLocation' must be a non-empty string.",
		},
		{
			key: "cacheStrategy",
			check: v => v === "metadata" || v === "content",
			error: "'cacheStrategy' must be any of \"metadata\", \"content\".",
		},
		{
			key: "concurrency",
			check: v =>
				v === "off" ||
				v === "auto" ||
				(isPositiveInteger(v) && true),
			error:
				"'concurrency' must be a positive integer, \"auto\", or \"off\".",
		},
		{
			key: "cwd",
			check: v => isNonEmptyString(v) && path.isAbsolute(v),
			error: "'cwd' must be an absolute path.",
		},
		{
			key: "errorOnUnmatchedPattern",
			check: v => typeof v === "boolean",
			error: "'errorOnUnmatchedPattern' must be a boolean.",
		},
		{
			key: "fix",
			check: v => typeof v === "boolean" || typeof v === "function",
			error: "'fix' must be a boolean or a function.",
		},
		{
			key: "fixTypes",
			check: v => v === null || isFixTypeArray(v),
			error:
				"'fixTypes' must be an array of any of \"directive\", \"problem\", \"suggestion\", and \"layout\".",
		},
		{
			key: "flags",
			check: v => isEmptyArrayOrArrayOfNonEmptyString(v),
			error: "'flags' must be an array of non-empty strings.",
		},
		{
			key: "globInputPaths",
			check: v => typeof v === "boolean",
			error: "'globInputPaths' must be a boolean.",
		},
		{
			key: "ignore",
			check: v => typeof v === "boolean",
			error: "'ignore' must be a boolean.",
		},
		{
			key: "ignorePatterns",
			check: v =>
				v === null || isEmptyArrayOrArrayOfNonEmptyString(v),
			error:
				"'ignorePatterns' must be an array of non-empty strings or null.",
		},
		{
			key: "overrideConfig",
			check: v => typeof v === "object",
			error: "'overrideConfig' must be an object or null.",
		},
		{
			key: "overrideConfigFile",
			check: v =>
				(typeof v === "string" && v.trim() !== "") ||
				v === null ||
				v === true,
			error:
				"'overrideConfigFile' must be a non-empty string, null, or true.",
		},
		{
			key: "passOnNoPatterns",
			check: v => typeof v === "boolean",
			error: "'passOnNoPatterns' must be a boolean.",
		},
		{
			key: "plugins",
			check: v => typeof v === "object" && v !== null && !Array.isArray(v),
			error: "'plugins' must be an object or null.",
		},
		{
			key: "pluginsEmptyString",
			check: v => !Object.keys(v || {}).includes(""),
			error: "'plugins' must not include an empty string.",
		},
		{
			key: "pluginsArray",
			check: v => !Array.isArray(v),
			error:
				"'plugins' doesn't add plugins to configuration to load. Please use the 'overrideConfig.plugins' option instead.",
		},
		{
			key: "stats",
			check: v => typeof v === "boolean",
			error: "'stats' must be a boolean.",
		},
		{
			key: "warnIgnored",
			check: v => typeof v === "boolean",
			error: "'warnIgnored' must be a boolean.",
		},
		{
			key: "ruleFilter",
			check: v => typeof v === "function",
			error: "'ruleFilter' must be a function.",
		},
	];

	for (const { key, check, error } of validators) {
		if (!check(eval(key))) {
			errors.push(error);
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