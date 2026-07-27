/**
 * Retrieves the configuration for a file or returns an ignore result.
 * @param {string} filePath
 * @param {FlatConfigArray} configs
 * @param {ESLintOptions} eslintOptions
 * @returns {LintResult|undefined}
 */
function getConfigOrIgnoreResult(filePath, configs, eslintOptions) {
	const config = configs.getConfig(filePath);
	if (!config) {
		if (eslintOptions.warnIgnored) {
			const configStatus = configs.getConfigStatus(filePath);
			return createIgnoreResult(filePath, eslintOptions.cwd, configStatus);
		}
		return undefined;
	}
	return config;
}

/**
 * Returns a cached lint result if available and valid.
 * @param {string} filePath
 * @param {any} config
 * @param {?LintResultCache} lintResultCache
 * @param {boolean|Function} fix
 * @returns {LintResult|undefined}
 */
function getCachedResult(filePath, config, lintResultCache, fix) {
	if (!lintResultCache) {
		return undefined;
	}
	const cachedResult = lintResultCache.getCachedLintResults(filePath, config);
	if (!cachedResult) {
		return undefined;
	}
	const hadMessages = cachedResult.messages && cachedResult.messages.length > 0;
	if (hadMessages && fix) {
		debug(`Reprocessing cached file to allow autofix: ${filePath}`);
		return undefined;
	}
	debug(`Skipping file since it hasn't changed: ${filePath}`);
	return cachedResult;
}

/**
 * Reads a file, measures read time, and verifies its content.
 * @param {Object} opts
 * @param {string} opts.filePath
 * @param {FlatConfigArray} opts.configs
 * @param {string} opts.cwd
 * @param {Function|boolean} opts.fix
 * @param {boolean} opts.allowInlineConfig
 * @param {Function} opts.ruleFilter
 * @param {boolean} opts.stats
 * @param {Linter} opts.linter
 * @param {Object} [opts.readFileCounter]
 * @param {AbortController} [opts.controller]
 * @returns {Promise<LintResult>}
 */
async function readAndVerifyFile({
	filePath,
	configs,
	cwd,
	fix,
	allowInlineConfig,
	ruleFilter,
	stats,
	linter,
	readFileCounter,
	controller,
}) {
	const readEnter = hrtimeBigint();
	const text = await fsp.readFile(filePath, {
		encoding: "utf8",
		signal: controller?.signal,
	});
	const readExit = hrtimeBigint();
	const duration = readExit - readEnter;
	debug('File "%s" read in %t', filePath, duration);
	if (readFileCounter) {
		readFileCounter.duration += duration;
	}
	controller?.signal.throwIfAborted();
	return verifyText({
		text,
		filePath,
		configs,
		cwd,
		fix,
		allowInlineConfig,
		ruleFilter,
		stats,
		linter,
	});
}

/**
 * Lints a single file using a parameter object.
 * @param {Object} options
 * @param {string} options.filePath
 * @param {FlatConfigArray} options.configs
 * @param {ESLintOptions} options.eslintOptions
 * @param {Linter} options.linter
 * @param {?LintResultCache} options.lintResultCache
 * @param {?{ duration: bigint; }} [options.readFileCounter]
 * @param {Retrier} [options.retrier]
 * @param {AbortController} [options.controller]
 * @returns {Promise<LintResult|undefined>}
 */
async function lintFileWithOptions({
	filePath,
	configs,
	eslintOptions,
	linter,
	lintResultCache,
	readFileCounter,
	retrier,
	controller,
}) {
	const configOrResult = getConfigOrIgnoreResult(
		filePath,
		configs,
		eslintOptions,
	);
	if (configOrResult && typeof configOrResult.filePath === "string") {
		// It's an ignore result.
		return configOrResult;
	}
	if (!configOrResult) {
		// No config and not warned.
		return undefined;
	}
	const config = configOrResult;

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
	const fixer = getFixerForFixTypes(fix, fixTypesSet, config);

	const cached = getCachedResult(filePath, config, lintResultCache, fix);
	if (cached) {
		return cached;
	}

	const readAndVerify = () =>
		readAndVerifyFile({
			filePath,
			configs,
			cwd,
			fix: fixer,
			allowInlineConfig,
			ruleFilter,
			stats,
			linter,
			readFileCounter,
			controller,
		});

	const promise = retrier
		? retrier.retry(readAndVerify, { signal: controller?.signal })
		: readAndVerify();

	return promise.catch(error => {
		controller?.abort(error);
		throw error;
	});
}

/**
 * Backward‑compatible wrapper for lintFile.
 * @param {string} filePath
 * @param {FlatConfigArray} configs
 * @param {ESLintOptions} eslintOptions
 * @param {Linter} linter
 * @param {?LintResultCache} lintResultCache
 * @param {?{ duration: bigint; }} readFileCounter
 * @param {Retrier} [retrier]
 * @param {AbortController} [controller]
 * @returns {Promise<LintResult|undefined>}
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
	return lintFileWithOptions({
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
	lintFileWithOptions,
	createLinter,
	createDefaultConfigs,
	createConfigLoader,
};