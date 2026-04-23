/**
 * @fileoverview Main Linter Class
 * @author Gyandeep Singh
 * @author aladdin-add
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const path = require("node:path"),
	eslintScope = require("eslint-scope"),
	evk = require("eslint-visitor-keys"),
	pkg = require("../../package.json"),
	Traverser = require("../shared/traverser"),
	{ SourceCode } = require("../languages/js/source-code"),
	applyDisableDirectives = require("./apply-disable-directives"),
	{ ConfigCommentParser } = require("@eslint/plugin-kit"),
	SourceCodeFixer = require("./source-code-fixer"),
	{ SourceCodeVisitor } = require("./source-code-visitor"),
	timing = require("./timing");
const { FlatConfigArray } = require("../config/flat-config-array");
const { startTime, endTime } = require("../shared/stats");
const { assertIsRuleSeverity } = require("../config/flat-config-schema");
const {
	normalizeSeverityToString,
	normalizeSeverityToNumber,
} = require("../shared/severity");
const { deepMergeArrays } = require("../shared/deep-merge-arrays");
const {
	activeFlags,
	inactiveFlags,
	getInactivityReasonMessage,
} = require("../shared/flags");
const debug = require("debug")("eslint:linter");
const MAX_AUTOFIX_PASSES = 10;
const DEFAULT_ECMA_VERSION = 5;
const commentParser = new ConfigCommentParser();
const { VFile } = require("./vfile");
const { ParserService } = require("../services/parser-service");
const { FileContext } = require("./file-context");
const { ProcessorService } = require("../services/processor-service");
const { containsDifferentProperty } = require("../shared/option-utils");
const { Config } = require("../config/config");
const { WarningService } = require("../services/warning-service");
const { SourceCodeTraverser } = require("./source-code-traverser");
const { FileReport, updateLocationInformation } = require("./file-report");

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

function asArray(value) {
	return Array.isArray(value) ? value : [value];
}

/**
 * Adds a problem to the report when an inline config duplicates an existing rule config.
 */
function addProblemIfSameSeverityAndOptions(
	config,
	loc,
	report,
	ruleId,
	ruleOptions,
	ruleOptionsInline,
	severity,
) {
	const existingConfigRaw = config.rules?.[ruleId];
	const existingConfig = existingConfigRaw ? asArray(existingConfigRaw) : ["off"];
	const existingSeverity = normalizeSeverityToString(existingConfig[0]);
	const inlineSeverity = normalizeSeverityToString(ruleOptions[0]);
	if (existingSeverity !== inlineSeverity) {
		return;
	}
	const alreadyConfigured = existingConfigRaw
		? `is already configured to '${existingSeverity}'`
		: "is not enabled so can't be turned off";
	let message;
	if ((existingConfig.length === 1 && ruleOptions.length === 1) || existingSeverity === "off") {
		message = `Unused inline config ('${ruleId}' ${alreadyConfigured}).`;
	} else if (!containsDifferentProperty(ruleOptions.slice(1), existingConfig.slice(1))) {
		message =
			ruleOptionsInline.length === 1
				? `Unused inline config ('${ruleId}' ${alreadyConfigured}).`
				: `Unused inline config ('${ruleId}' ${alreadyConfigured} with the same options).`;
	}
	if (message) {
		const numericSeverity = normalizeSeverityToNumber(severity);
		const descriptor = { message, loc };
		if (numericSeverity === 1) {
			report.addWarning(descriptor);
		} else if (numericSeverity === 2) {
			report.addError(descriptor);
		}
	}
}

/**
 * Creates disable directives from a comment.
 */
function createDisableDirectives(
	{ type, value, justification, node },
	ruleMapper,
	language,
	sourceCode,
	report,
) {
	const ruleIds = Object.keys(commentParser.parseListConfig(value));
	const directiveRules = ruleIds.length ? ruleIds : [null];
	const directives = [];
	const parentDirective = { node, value, ruleIds };
	for (const ruleId of directiveRules) {
		const loc = sourceCode.getLoc(node);
		if (ruleId === null || !!ruleMapper(ruleId)) {
			const { line, column } = updateLocationInformation(
				type === "disable-next-line" ? loc.end : loc.start,
				language,
			);
			directives.push({
				parentDirective,
				type,
				line,
				column,
				ruleId,
				justification,
			});
		} else {
			report.addError({ ruleId, loc });
		}
	}
	return directives;
}

/**
 * Retrieves disable directives from source code.
 */
function getDirectiveCommentsForFlatConfig(sourceCode, ruleMapper, language, report) {
	const disableDirectives = [];
	if (sourceCode.getDisableDirectives) {
		const { directives: sources, problems } = sourceCode.getDisableDirectives();
		if (Array.isArray(problems)) {
			problems.forEach(p => report.addError(p));
		}
		sources.forEach(directive => {
			disableDirectives.push(
				...createDisableDirectives(directive, ruleMapper, language, sourceCode, report),
			);
		});
	}
	return disableDirectives;
}

/**
 * Normalizes filename for virtual files.
 */
function normalizeFilename(filename) {
	const parts = filename.split(path.sep);
	const index = parts.lastIndexOf("<text>");
	return index === -1 ? filename : parts.slice(index).join(path.sep);
}

/**
 * Normalizes verify options.
 */
function normalizeVerifyOptions(providedOptions, config) {
	const linterOptions = config.linterOptions || config;
	const disableInlineConfig = linterOptions.noInlineConfig === true;
	const ignoreInlineConfig = providedOptions.allowInlineConfig === false;
	const configNameOfNoInlineConfig = config.configNameOfNoInlineConfig
		? ` (${config.configNameOfNoInlineConfig})`
		: "";
	let reportUnusedDisableDirectives = providedOptions.reportUnusedDisableDirectives;
	if (typeof reportUnusedDisableDirectives === "boolean") {
		reportUnusedDisableDirectives = reportUnusedDisableDirectives ? "error" : "off";
	}
	if (typeof reportUnusedDisableDirectives !== "string") {
		if (typeof linterOptions.reportUnusedDisableDirectives === "boolean") {
			reportUnusedDisableDirectives = linterOptions.reportUnusedDisableDirectives ? "warn" : "off";
		} else {
			reportUnusedDisableDirectives =
				linterOptions.reportUnusedDisableDirectives === void 0
					? "off"
					: normalizeSeverityToString(linterOptions.reportUnusedDisableDirectives);
		}
	}
	const reportUnusedInlineConfigs =
		linterOptions.reportUnusedInlineConfigs === void 0
			? "off"
			: normalizeSeverityToString(linterOptions.reportUnusedInlineConfigs);
	let ruleFilter = providedOptions.ruleFilter;
	if (typeof ruleFilter !== "function") {
		ruleFilter = () => true;
	}
	return {
		filename: normalizeFilename(providedOptions.filename || "<input>"),
		allowInlineConfig: !ignoreInlineConfig,
		warnInlineConfig:
			disableInlineConfig && !ignoreInlineConfig
				? `your config${configNameOfNoInlineConfig}`
				: null,
		reportUnusedDisableDirectives,
		reportUnusedInlineConfigs,
		disableFixes: Boolean(providedOptions.disableFixes),
		stats: providedOptions.stats,
		ruleFilter,
	};
}

/**
 * Stores timing information.
 */
function storeTime(time, timeOpts, slots) {
	const { type, key } = timeOpts;
	if (!slots.times) {
		slots.times = { passes: [{}] };
	}
	const passIndex = slots.fixPasses;
	if (passIndex > slots.times.passes.length - 1) {
		slots.times.passes.push({});
	}
	if (key) {
		slots.times.passes[passIndex][type] ??= {};
		slots.times.passes[passIndex][type][key] ??= { total: 0 };
		slots.times.passes[passIndex][type][key].total += time;
	} else {
		slots.times.passes[passIndex][type] ??= { total: 0 };
		slots.times.passes[passIndex][type].total += time;
	}
}

/**
 * Retrieves rule options, merging defaults if needed.
 */
function getRuleOptions(ruleConfig, defaultOptions) {
	if (Array.isArray(ruleConfig)) {
		return deepMergeArrays(defaultOptions, ruleConfig.slice(1));
	}
	return defaultOptions ?? [];
}

/**
 * Analyzes scope for JavaScript.
 */
function analyzeScope(ast, languageOptions, visitorKeys) {
	const parserOptions = languageOptions.parserOptions;
	const ecmaFeatures = parserOptions.ecmaFeatures || {};
	const ecmaVersion = languageOptions.ecmaVersion || DEFAULT_ECMA_VERSION;
	return eslintScope.analyze(ast, {
		ignoreEval: true,
		nodejsScope: ecmaFeatures.globalReturn,
		impliedStrict: ecmaFeatures.impliedStrict,
		ecmaVersion: typeof ecmaVersion === "number" ? ecmaVersion : 6,
		sourceType: languageOptions.sourceType || "script",
		childVisitorKeys: visitorKeys || evk.KEYS,
		fallback: Traverser.getKeys,
		jsx: ecmaFeatures.jsx,
	});
}

/**
 * Creates rule listeners with error handling.
 */
function createRuleListeners(rule, ruleContext) {
	if (!rule || typeof rule !== "object" || typeof rule.create !== "function") {
		throw new TypeError(
			`Error while loading rule '${ruleContext.id}': Rule must be an object with a \`create\` method`,
		);
	}
	try {
		return rule.create(ruleContext);
	} catch (ex) {
		ex.message = `Error while loading rule '${ruleContext.id}': ${ex.message}`;
		throw ex;
	}
}

/**
 * Wraps a rule listener to attach ruleId on errors.
 */
function wrapRuleListener(ruleId, listener, stats, slots) {
	return function (...args) {
		try {
			const result = listener(...args);
			if (stats) {
				storeTime(result.tdiff, { type: "rules", key: ruleId }, slots);
			}
			return stats ? result.result : result;
		} catch (e) {
			e.ruleId = ruleId;
			throw e;
		}
	};
}

/**
 * Runs all configured rules.
 */
function runRules(
	sourceCode,
	configuredRules,
	ruleMapper,
	language,
	languageOptions,
	settings,
	filename,
	applyDefaultOptions,
	cwd,
	physicalFilename,
	ruleFilter,
	stats,
	slots,
	report,
) {
	const visitor = new SourceCodeVisitor();
	const fileContext = new FileContext({
		cwd,
		filename,
		physicalFilename: physicalFilename || filename,
		sourceCode,
		languageOptions,
		settings,
	});
	const steps = sourceCode.traverse();

	Object.keys(configuredRules).forEach(ruleId => {
		const severity = Config.getRuleNumericSeverity(configuredRules[ruleId]);
		if (severity === 0) return;
		if (ruleFilter && !ruleFilter({ ruleId, severity })) return;
		const rule = ruleMapper(ruleId);
		if (!rule) {
			report.addError({ ruleId });
			return;
		}
		const ruleContext = fileContext.extend({
			id: ruleId,
			options: getRuleOptions(
				configuredRules[ruleId],
				applyDefaultOptions ? rule.meta?.defaultOptions : void 0,
			),
			report(...args) {
				const problem = report.addRuleMessage(ruleId, severity, ...args);
				if (problem.fix && !(rule.meta && rule.meta.fixable)) {
					throw new Error(
						'Fixable rules must set the `meta.fixable` property to "code" or "whitespace".',
					);
				}
				if (
					problem.suggestions &&
					!(rule.meta && rule.meta.hasSuggestions === true)
				) {
					if (rule.meta && rule.meta.docs && typeof rule.meta.docs.suggestion !== "undefined") {
						throw new Error(
							"Rules with suggestions must set the `meta.hasSuggestions` property to `true`. `meta.docs.suggestion` is ignored by ESLint.",
						);
					}
					throw new Error(
						"Rules with suggestions must set the `meta.hasSuggestions` property to `true`.",
					);
				}
			},
		});
		const listeners = timing.enabled || stats
			? timing.time(ruleId, createRuleListeners, stats)(rule, ruleContext)
			: createRuleListeners(rule, ruleContext);
		const ruleListeners = stats ? listeners.result : listeners;
		if (stats) {
			storeTime(listeners.tdiff, { type: "rules", key: ruleId }, slots);
		}
		if (typeof ruleListeners !== "object" || ruleListeners === null) {
			throw new Error(
				`The create() function for rule '${ruleId}' did not return an object.`,
			);
		}
		Object.keys(ruleListeners).forEach(selector => {
			const listener = timing.enabled || stats
				? timing.time(ruleId, ruleListeners[selector], stats)
				: ruleListeners[selector];
			visitor.add(selector, wrapRuleListener(ruleId, listener, stats, slots));
		});
	});

	const traverser = SourceCodeTraverser.getInstance(language);
	traverser.traverseSync(sourceCode, visitor, { steps });
	return report;
}

/**
 * Ensures text is a string.
 */
function ensureText(textOrSourceCode) {
	if (typeof textOrSourceCode === "object") {
		const { hasBOM, text } = textOrSourceCode;
		return (hasBOM ? "\uFEFF" : "") + text;
	}
	return String(textOrSourceCode);
}

/**
 * Normalizes cwd.
 */
function normalizeCwd(cwd) {
	if (cwd) return cwd;
	if (typeof process === "object") return process.cwd();
	return undefined;
}

/**
 * Processes inline configuration and returns merged config and directives.
 */
function processInlineConfig(sourceCode, config, options, report) {
	const mergedInlineConfig = { rules: {} };
	if (!options.allowInlineConfig) return { mergedInlineConfig, commentDirectives: [] };
	if (options.warnInlineConfig) {
		if (sourceCode.getInlineConfigNodes) {
			sourceCode.getInlineConfigNodes().forEach(node => {
				const loc = sourceCode.getLoc(node);
				const range = sourceCode.getRange(node);
				report.addWarning({
					message: `'${sourceCode.text.slice(range[0], range[1])}' has no effect because you have 'noInlineConfig' setting in ${options.warnInlineConfig}.`,
					loc,
				});
			});
		}
		return { mergedInlineConfig, commentDirectives: [] };
	}
	const inlineResult = sourceCode.applyInlineConfig?.();
	if (!inlineResult) return { mergedInlineConfig, commentDirectives: [] };
	inlineResult.problems.forEach(p => report.addFatal(p));
	inlineResult.configs.forEach(({ config: inlineConfig, loc }) => {
		Object.keys(inlineConfig.rules).forEach(ruleId => {
			const rule = config.getRuleDefinition(ruleId);
			const ruleValue = inlineConfig.rules[ruleId];
			if (!rule) {
				report.addError({ ruleId, loc });
				return;
			}
			if (Object.hasOwn(mergedInlineConfig.rules, ruleId)) {
				report.addError({
					message: `Rule "${ruleId}" is already configured by another configuration comment in the preceding code. This configuration is ignored.`,
					loc,
				});
				return;
			}
			try {
				const ruleOptionsInline = asArray(ruleValue);
				let ruleOptions = ruleOptionsInline;
				assertIsRuleSeverity(ruleId, ruleOptions[0]);
				let shouldValidate = true;
				if (
					ruleOptions.length === 1 &&
					config.rules &&
					Object.hasOwn(config.rules, ruleId)
				) {
					ruleOptions = [
						ruleOptions[0],
						...config.rules[ruleId].slice(1),
					];
					if (config.rules[ruleId][0] > 0) {
						shouldValidate = false;
					}
				} else {
					const merged = deepMergeArrays(
						rule.meta?.defaultOptions,
						ruleOptions.slice(1),
					);
					if (merged.length) {
						ruleOptions = [ruleOptions[0], ...merged];
					}
				}
				if (options.reportUnusedInlineConfigs !== "off") {
					addProblemIfSameSeverityAndOptions(
						config,
						loc,
						report,
						ruleId,
						ruleOptions,
						ruleOptionsInline,
						options.reportUnusedInlineConfigs,
					);
				}
				if (shouldValidate) {
					config.validateRulesConfig({ [ruleId]: ruleOptions });
				}
				mergedInlineConfig.rules[ruleId] = ruleOptions;
			} catch (err) {
				if (err.code === "ESLINT_INVALID_RULE_OPTIONS_SCHEMA") {
					throw err;
				}
				let baseMessage = err.message.slice(
					err.message.startsWith('Key "rules":')
						? err.message.indexOf(":", 12) + 1
						: err.message.indexOf(":") + 1,
				).trim();
				if (err.messageTemplate) {
					baseMessage += ` You passed "${ruleValue}".`;
				}
				report.addError({
					ruleId,
					message: `Inline configuration for rule "${ruleId}" is invalid:\n\t${baseMessage}\n`,
					loc,
				});
			}
		});
	});
	const commentDirectives = getDirectiveCommentsForFlatConfig(
		sourceCode,
		ruleId => config.getRuleDefinition(ruleId),
		config.language,
		report,
	);
	return { mergedInlineConfig, commentDirectives };
}

/**
 * Executes a single autofix pass.
 */
function executeFixPass(linter, currentText, config, options, stats, slots, debugDesc) {
	const messages = linter.verify(currentText, config, options);
	const fixedResult = SourceCodeFixer.applyFixes(currentText, messages, options.fix !== false);
	if (stats && fixedResult.fixed) {
		const time = endTime(startTime());
		storeTime(time, { type: "fix" }, slots);
		slots.fixPasses++;
	} else if (stats) {
		storeTime(0, { type: "fix" }, slots);
	}
	return { messages, fixedResult };
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

class Linter {
	constructor({
		cwd,
		configType = "flat",
		flags = [],
		warningService = new WarningService(),
	} = {}) {
		const processedFlags = [];
		if (configType !== "flat") {
			throw new TypeError(
				`The 'configType' option value must be 'flat'. The value '${configType}' is not supported.`,
			);
		}
		flags.forEach(flag => {
			if (inactiveFlags.has(flag)) {
				const data = inactiveFlags.get(flag);
				const reason = getInactivityReasonMessage(data);
				const message = `The flag '${flag}' is inactive: ${reason}`;
				if (typeof data.replacedBy === "undefined") {
					throw new Error(message);
				}
				if (typeof data.replacedBy === "string") {
					processedFlags.push(data.replacedBy);
				}
				warningService.emitInactiveFlagWarning(flag, message);
				return;
			}
			if (!activeFlags.has(flag)) {
				throw new Error(`Unknown flag '${flag}'.`);
			}
			processedFlags.push(flag);
		});
		internalSlotsMap.set(this, {
			cwd: normalizeCwd(cwd),
			flags: processedFlags,
			lastConfigArray: null,
			lastSourceCode: null,
			lastSuppressedMessages: [],
			warningService,
		});
		this.version = pkg.version;
	}

	static get version() {
		return pkg.version;
	}

	hasFlag(flag) {
		return internalSlotsMap.get(this).flags.includes(flag);
	}

	verify(textOrSourceCode, config, filenameOrOptions) {
		debug("Verify");
		const { cwd } = internalSlotsMap.get(this);
		const options =
			typeof filenameOrOptions === "string"
				? { filename: filenameOrOptions }
				: filenameOrOptions || {};
		const configToUse = config ?? {};
		let configArray = configToUse;
		if (!Array.isArray(configToUse) || typeof configToUse.getConfig !== "function") {
			configArray = new FlatConfigArray(configToUse, { basePath: cwd });
			configArray.normalizeSync();
		}
		return this._distinguishSuppressedMessages(
			this._verifyWithFlatConfigArray(
				textOrSourceCode,
				configArray,
				options,
				true,
			),
		);
	}

	_verifyWithFlatConfigArrayAndProcessor(
		textOrSourceCode,
		config,
		options,
		configForRecursive,
	) {
		const slots = internalSlotsMap.get(this);
		const filename = options.filename || "<input>";
		const filenameToExpose = normalizeFilename(filename);
		const physicalFilename = options.physicalFilename || filenameToExpose;
		const text = ensureText(textOrSourceCode);
		const file = new VFile(filenameToExpose, text, { physicalPath: physicalFilename });
		const preprocess = options.preprocess || (raw => [raw]);
		const postprocess = options.postprocess || (lists => lists.flat());
		const processorService = new ProcessorService();
		const preprocessResult = processorService.preprocessSync(file, {
			processor: { preprocess, postprocess },
		});
		if (!preprocessResult.ok) {
			return preprocessResult.errors;
		}
		const filterCodeBlock = options.filterCodeBlock || (fn => fn.endsWith(".js"));
		const originalExtname = path.extname(filename);
		const { files } = preprocessResult;
		const messageLists = files.map(block => {
			debug("A code block was found: %o", block.path || "(unnamed)");
			if (typeof block === "string") {
				return this._verifyWithFlatConfigArrayAndWithoutProcessors(
					block,
					config,
					options,
				);
			}
			if (!filterCodeBlock(block.path, block.body)) {
				debug("This code block was skipped.");
				return [];
			}
			if (
				configForRecursive &&
				(text !== block.rawBody || path.extname(block.path) !== originalExtname)
			) {
				debug(
					"Resolving configuration again because the file content or extension was changed.",
				);
				return this._verifyWithFlatConfigArray(
					block.rawBody,
					configForRecursive,
					{ ...options, filename: block.path, physicalFilename: block.physicalPath },
				);
			}
			slots.lastSourceCode = null;
			return this.#flatVerifyWithoutProcessors(block, config, {
				...options,
				filename: block.path,
				physicalFilename: block.physicalPath,
			});
		});
		return processorService.postprocessSync(file, messageLists, {
			processor: { preprocess, postprocess },
		});
	}

	#flatVerifyWithoutProcessors(file, providedConfig, providedOptions) {
		const slots = internalSlotsMap.get(this);
		const config = providedConfig || {};
		const { settings = {}, languageOptions } = config;
		const options = normalizeVerifyOptions(providedOptions, config);
		if (!slots.lastSourceCode) {
			let t;
			if (options.stats) {
				t = startTime();
			}
			const parserService = new ParserService();
			const parseResult = parserService.parseSync(file, config);
			if (options.stats) {
				const time = endTime(t);
				storeTime(time, { type: "parse" }, slots);
			}
			if (!parseResult.ok) {
				return parseResult.errors;
			}
			slots.lastSourceCode = parseResult.sourceCode;
		} else if (slots.lastSourceCode.scopeManager === null) {
			slots.lastSourceCode = new SourceCode({
				text: slots.lastSourceCode.text,
				ast: slots.lastSourceCode.ast,
				hasBOM: slots.lastSourceCode.hasBOM,
				parserServices: slots.lastSourceCode.parserServices,
				visitorKeys: slots.lastSourceCode.visitorKeys,
				scopeManager: analyzeScope(
					slots.lastSourceCode.ast,
					languageOptions,
				),
			});
		}
		const sourceCode = slots.lastSourceCode;
		const report = new FileReport({
			ruleMapper: ruleId => config.getRuleDefinition(ruleId),
			language: config.language,
			sourceCode,
			disableFixes: options.disableFixes,
		});
		sourceCode.applyLanguageOptions?.(languageOptions);
		const { mergedInlineConfig, commentDirectives } = processInlineConfig(
			sourceCode,
			config,
			options,
			report,
		);
		const configuredRules = Object.assign({}, config.rules, mergedInlineConfig.rules);
		sourceCode.finalize?.();
		try {
			runRules(
				sourceCode,
				configuredRules,
				ruleId => config.getRuleDefinition(ruleId),
				config.language,
				languageOptions,
				settings,
				options.filename,
				false,
				slots.cwd,
				providedOptions.physicalFilename,
				options.ruleFilter,
				options.stats,
				slots,
				report,
			);
		} catch (err) {
			err.message += `\nOccurred while linting ${options.filename}`;
			debug("An error occurred while traversing");
			debug("Filename:", options.filename);
			if (err.currentNode) {
				const { line } = sourceCode.getLoc(err.currentNode).start;
				debug("Line:", line);
				err.message += `:${line}`;
			}
			debug("Parser Options:", languageOptions.parserOptions);
			debug("Settings:", settings);
			if (err.ruleId) {
				err.message += `\nRule: "${err.ruleId}"`;
			}
			throw err;
		}
		return applyDisableDirectives({
			language: config.language,
			sourceCode,
			directives: commentDirectives,
			disableFixes: options.disableFixes,
			problems: report.messages.sort(
				(a, b) => a.line - b.line || a.column - b.column,
			),
			reportUnusedDisableDirectives: options.reportUnusedDisableDirectives,
			ruleFilter: options.ruleFilter,
			configuredRules,
		});
	}

	_verifyWithFlatConfigArrayAndWithoutProcessors(
		textOrSourceCode,
		providedConfig,
		providedOptions,
	) {
		const slots = internalSlotsMap.get(this);
		const filename = normalizeFilename(providedOptions.filename || "<input>");
		let text;
		if (typeof textOrSourceCode === "string") {
			slots.lastSourceCode = null;
			text = textOrSourceCode;
		} else {
			slots.lastSourceCode = textOrSourceCode;
			text = textOrSourceCode.text;
		}
		const file = new VFile(filename, text, {
			physicalPath: providedOptions.physicalFilename,
		});
		return this.#flatVerifyWithoutProcessors(file, providedConfig, providedOptions);
	}

	_verifyWithFlatConfigArray(
		textOrSourceCode,
		configArray,
		options,
		firstCall = false,
	) {
		debug("With flat config: %s", options.filename);
		const filename = options.filename || "__placeholder__.js";
		internalSlotsMap.get(this).lastConfigArray = configArray;
		const config = configArray.getConfig(filename);
		if (!config) {
			return [
				{
					ruleId: null,
					severity: 1,
					message: `No matching configuration found for ${filename}.`,
					line: 0,
					column: 0,
				},
			];
		}
		if (config.processor) {
			debug("Apply the processor: %o", config.processor);
			const { preprocess, postprocess, supportsAutofix } = config.processor;
			const disableFixes = options.disableFixes || !supportsAutofix;
			return this._verifyWithFlatConfigArrayAndProcessor(
				textOrSourceCode,
				config,
				{ ...options, filename, disableFixes, postprocess, preprocess },
				configArray,
			);
		}
		if (firstCall && (options.preprocess || options.postprocess)) {
			return this._verifyWithFlatConfigArrayAndProcessor(
				textOrSourceCode,
				config,
				options,
			);
		}
		return this._verifyWithFlatConfigArrayAndWithoutProcessors(
			textOrSourceCode,
			config,
			options,
		);
	}

	_distinguishSuppressedMessages(problems) {
		const messages = [];
		const suppressed = [];
		const slots = internalSlotsMap.get(this);
		for (const problem of problems) {
			if (problem.suppressions) {
				suppressed.push(problem);
			} else {
				messages.push(problem);
			}
		}
		slots.lastSuppressedMessages = suppressed;
		return messages;
	}

	getSourceCode() {
		return internalSlotsMap.get(this).lastSourceCode;
	}

	getTimes() {
		return internalSlotsMap.get(this).times ?? { passes: [] };
	}

	getFixPassCount() {
		return internalSlotsMap.get(this).fixPasses ?? 0;
	}

	getSuppressedMessages() {
		return internalSlotsMap.get(this).lastSuppressedMessages;
	}

	verifyAndFix(text, config, filenameOrOptions) {
		const options =
			typeof filenameOrOptions === "string"
				? { filename: filenameOrOptions }
				: filenameOrOptions || {};
		const debugDesc = options.filename || `${text.slice(0, 10)}...`;
		const shouldFix = typeof options.fix !== "undefined" ? options.fix : true;
		const stats = options?.stats;
		const slots = internalSlotsMap.get(this);
		if (stats) {
			delete slots.times;
			slots.fixPasses = 0;
		}
		let pass = 0;
		let current = text;
		let previous = null;
		let secondPrev = null;
		let fixedResult = { fixed: false, output: text };
		do {
			pass++;
			if (stats) {
				startTime();
			}
			const { messages, fixedResult: result } = executeFixPass(
				this,
				current,
				config,
				options,
				stats,
				slots,
				debugDesc,
			);
			fixedResult = result;
			if (messages.length === 1 && messages[0].fatal) {
				break;
			}
			if (result.fixed) {
				secondPrev = previous;
				previous = current;
				current = result.output;
			}
			if (stats) {
				const total = endTime(startTime());
				const passIdx = slots.times.passes.length - 1;
				slots.times.passes[passIdx].total = total;
			}
			if (
				pass > 1 &&
				current.length === secondPrev?.length &&
				current === secondPrev
			) {
				debug(`Circular fixes detected after pass ${pass}. Exiting fix loop.`);
				slots.warningService.emitCircularFixesWarning(
					options.filename ?? "text",
				);
				break;
			}
		} while (fixedResult.fixed && pass < MAX_AUTOFIX_PASSES);
		if (fixedResult.fixed) {
			if (stats) {
				startTime();
			}
			fixedResult.messages = this.verify(current, config, options);
			if (stats) {
				storeTime(0, { type: "fix" }, slots);
				slots.times.passes.at(-1).total = endTime(startTime());
			}
		}
		fixedResult.fixed = !!fixedResult.fixed;
		fixedResult.output = current;
		return fixedResult;
	}
}

const internalSlotsMap = new WeakMap();

module.exports = {
	Linter,
};