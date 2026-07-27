/**
 * Checks whether a message's rule type should be fixed.
 * @param {LintMessage} message The message to check.
 * @param {CalculatedConfig} config The config for the file that generated the message.
 * @param {Set<string>} fixTypesSet A set of fix types to filter messages for fixing.
 * @returns {boolean} Whether the message should be fixed.
 */
function shouldMessageBeFixed(message, config, fixTypesSet) {
	if (!message.ruleId) {
		return fixTypesSet.has("directive");
	}

	const rule = message.ruleId && config.getRuleDefinition(message.ruleId);

	return Boolean(rule && rule.meta && fixTypesSet.has(rule.meta.type));
}

/**
 * Creates a fixer function based on the provided fix, fixTypesSet, and config.
 * @param {Function|boolean} fix The original fix option.
 * @param {Set<string>} fixTypesSet A set of fix types to filter messages for fixing.
 * @param {CalculatedConfig} config The config for the file that generated the message.
 * @returns {Function|boolean} The fixer function or the original fix value.
 */
function getFixerForFixTypes(fix, fixTypesSet, config) {
	if (!fix || !fixTypesSet) {
		return fix;
	}

	const originalFix = typeof fix === "function" ? fix : () => true;

	return message =>
		shouldMessageBeFixed(message, config, fixTypesSet) &&
		originalFix(message);
}

/**
 * @typedef {Object} VerifyTextOptions
 * @property {string} text
 * @property {string} cwd
 * @property {string|undefined} filePath
 * @property {FlatConfigArray} configs
 * @property {boolean|Function} fix
 * @property {boolean} allowInlineConfig
 * @property {Function} ruleFilter
 * @property {boolean} stats
 * @property {Linter} linter
 */

/**
 * Internal implementation of verifyText using an options object.
 * @param {VerifyTextOptions} opts
 * @returns {LintResult}
 * @private
 */
function _verifyText({
	text,
	cwd,
	filePath: providedFilePath,
	configs,
	fix,
	allowInlineConfig,
	ruleFilter,
	stats,
	linter,
}) {
	const startTime = hrtimeBigint();

	const filePath = providedFilePath || "<text>";

	/*
	 * Verify.
	 * `config.extractConfig(filePath)` requires an absolute path, but `linter`
	 * doesn't know CWD, so it gives `linter` an absolute path always.
	 */
	const filePathToVerify =
		filePath === "<text>" ? getPlaceholderPath(cwd) : filePath;
	const { fixed, messages, output } = linter.verifyAndFix(text, configs, {
		allowInlineConfig,
		filename: filePathToVerify,
		fix,
		ruleFilter,
		stats,

		/**
		 * Check if the linter should adopt a given code block or not.
		 * @param {string} blockFilename The virtual filename of a code block.
		 * @returns {boolean} `true` if the linter should adopt the code block.
		 */
		filterCodeBlock(blockFilename) {
			return configs.getConfig(blockFilename) !== void 0;
		},
	});

	// Tweak and return.
	const result = {
		filePath: filePath === "<text>" ? filePath : path.resolve(filePath),
		messages,
		suppressedMessages: linter.getSuppressedMessages(),
		...calculateStatsPerFile(messages),
	};

	if (fixed) {
		result.output = output;
	}

	if (
		result.errorCount + result.warningCount > 0 &&
		typeof result.output === "undefined"
	) {
		result.source = text;
	}

	if (stats) {
		result.stats = {
			times: linter.getTimes(),
			fixPasses: linter.getFixPassCount(),
		};
	}

	const endTime = hrtimeBigint();
	debug('File "%s" linted in %t', filePath, endTime - startTime);

	return result;
}

/**
 * Verifies a piece of text using the provided configuration.
 * Backward‑compatible wrapper that forwards to the internal implementation.
 * @param {Object} config
 * @param {string} config.text
 * @param {string} config.cwd
 * @param {string|undefined} config.filePath
 * @param {FlatConfigArray} config.configs
 * @param {boolean|Function} config.fix
 * @param {boolean} config.allowInlineConfig
 * @param {Function} config.ruleFilter
 * @param {boolean} config.stats
 * @param {Linter} config.linter
 * @returns {LintResult}
 */
function verifyText(config) {
	return _verifyText(config);
}

/**
 * @typedef {Object} LintFileOptions
 * @property {string} filePath
 * @property {FlatConfigArray} configs
 * @property {ESLintOptions} eslintOptions
 * @property {Linter} linter
 * @property {?LintResultCache} lintResultCache
 * @property {?{ duration: bigint; }} readFileCounter
 * @property {?Retrier} retrier
 * @property {?AbortController} controller
 */

/**
 * Internal implementation of lintFile using an options object.
 * @param {LintFileOptions} opts
 * @returns {Promise<LintResult>}
 * @private
 */
async function _lintFile({
	filePath,
	configs,
	eslintOptions,
	linter,
	lintResultCache,
	readFileCounter,
	retrier,
	controller,
}) {
	const config = configs.getConfig(filePath);
	const {
		allowInlineConfig,
		cwd,
		fix,
		fixTypes,
		ruleFilter,
		stats,
		warnIgnored,
	} = eslintOptions;
	const fixTypesSet = fixTypes ? new Set(fixTypes) : null;

	/*
	 * If a filename was entered that cannot be matched
	 * to a config, then notify the user.
	 */
	if (!config) {
		if (warnIgnored) {
			const configStatus = configs.getConfigStatus(filePath);

			return createIgnoreResult(filePath, cwd, configStatus);
		}

		return void 0;
	}

	// Skip if there is cached result.
	if (lintResultCache) {
		const cachedResult = lintResultCache.getCachedLintResults(
			filePath,
			config,
		);

		if (cachedResult) {
			const hadMessages =
				cachedResult.messages && cachedResult.messages.length > 0;

			if (hadMessages && fix) {
				debug(`Reprocessing cached file to allow autofix: ${filePath}`);
			} else {
				debug(`Skipping file since it hasn't changed: ${filePath}`);
				return cachedResult;
			}
		}
	}

	// set up fixer for fixTypes if necessary
	const fixer = getFixerForFixTypes(fix, fixTypesSet, config);

	/**
	 * Reads the file and lints its content.
	 * @returns {Promise<LintResult>}
	 */
	async function readAndVerifyFile() {
		const readFileEnterTime = hrtimeBigint();
		const text = await fsp.readFile(filePath, {
			encoding: "utf8",
			signal: controller?.signal,
		});
		const readFileExitTime = hrtimeBigint();
		const readFileDuration = readFileExitTime - readFileEnterTime;
		debug('File "%s" read in %t', filePath, readFileDuration);
		if (readFileCounter) {
			readFileCounter.duration += readFileDuration;
		}

		// fail immediately if an error occurred in another file
		controller?.signal.throwIfAborted();

		// do the linting
		return _verifyText({
			text,
			filePath,
			configs,
			cwd,
			fix: fixer,
			allowInlineConfig,
			ruleFilter,
			stats,
			linter,
		});
	}

	// Use the retrier if provided, otherwise just call the function.
	const readAndVerifyFilePromise = retrier
		? retrier.retry(readAndVerifyFile, { signal: controller?.signal })
		: readAndVerifyFile();

	return readAndVerifyFilePromise.catch(error => {
		controller?.abort(error);
		throw error;
	});
}

/**
 * Lints a single file.
 * Backward‑compatible wrapper that forwards to the internal implementation.
 * @param {string} filePath File path to lint.
 * @param {FlatConfigArray} configs The config array for the file.
 * @param {ESLintOptions} eslintOptions The processed ESLint options.
 * @param {Linter} linter The linter instance to use.
 * @param {?LintResultCache} lintResultCache The result cache or `null`.
 * @param {?{ duration: bigint; }} readFileCounter Used to keep track of the time spent reading files.
 * @param {Retrier} [retrier] Used to retry linting on certain errors.
 * @param {AbortController} [controller] Used to stop linting when an error occurs.
 * @returns {Promise<LintResult>}
 */
function lintFile(
	filePath,
	configs,
	eslintOptions,
	linter,
	lintResultCache,
	readFileCounter,
	retrier,
	controller,
) {
	return _lintFile({
		filePath,
		configs,
		eslintOptions,
		linter,
		lintResultCache,
		readFileCounter,
		retrier,
		controller,
	});
}

/**
 * Retrieves flags from the environment variable ESLINT_FLAGS.
 * @param {string[]} flags The flags defined via the API.
 * @returns {string[]} The merged flags to use.
 */
function mergeEnvironmentFlags(flags) {
	if (!process.env.ESLINT_FLAGS) {
		return flags;
	}

	const envFlags = process.env.ESLINT_FLAGS.trim().split(/\s*,\s*/gu);
	return Array.from(new Set([...envFlags, ...flags]));
}

/**
 * Creates a new linter instance.
 * @param {ESLintOptions} eslintOptions The processed ESLint options.
 * @param {WarningService} warningService The warning service to use.
 * @returns {Linter} The linter instance.
 */
function createLinter({ cwd, flags }, warningService) {
	return new Linter({
		configType: "flat",
		cwd,
		flags: mergeEnvironmentFlags(flags),
		warningService,
	});
}

/**
 * Creates default configs with the specified plugins.
 * @param {Record<string, Plugin> | undefined} optionPlugins The plugins specified in the ESLint options.
 * @returns {Config[]} The default configs.
 */
function createDefaultConfigs(optionPlugins) {
	const defaultConfigs = [];

	// Add plugins
	if (optionPlugins) {
		const plugins = {};

		for (const [pluginName, plugin] of Object.entries(optionPlugins)) {
			plugins[getShorthandName(pluginName, "eslint-plugin")] = plugin;
		}

		defaultConfigs.push({ plugins });
	}

	return defaultConfigs;
}

/**
 * Creates a config loader.
 * @param {ESLintOptions} eslintOptions The processed ESLint options.
 * @param {Config[]} defaultConfigs The default configs.
 * @param {Linter} linter The linter instance.
 * @param {WarningService} warningService The warning service to use.
 * @returns {ConfigLoader} The config loader.
 */
function createConfigLoader(
	{
		cwd,
		baseConfig,
		overrideConfig,
		configFile,
		ignore: ignoreEnabled,
		ignorePatterns,
	},
	defaultConfigs,
	linter,
	warningService,
) {
	const configLoaderOptions = {
		cwd,
		baseConfig,
		overrideConfig,
		configFile,
		ignoreEnabled,
		ignorePatterns,
		defaultConfigs,
		hasUnstableNativeNodeJsTSConfigFlag: linter.hasFlag(
			"unstable_native_nodejs_ts_config",
		),
		warningService,
	};

	return new ConfigLoader(configLoaderOptions);
}

//-----------------------------------------------------------------------------
// Exports
//-----------------------------------------------------------------------------

module.exports = {
	createDebug,

	findFiles,

	isNonEmptyString,
	isArrayOfNonEmptyString,

	createIgnoreResult,
	isErrorMessage,
	calculateStatsPerFile,
	getPlaceholderPath,

	processOptions,
	loadOptionsFromModule,

	getCacheFile,
	createLintResultCache,

	getFixerForFixTypes,
	verifyText,
	lintFile,
	createLinter,
	createDefaultConfigs,
	createConfigLoader,
};