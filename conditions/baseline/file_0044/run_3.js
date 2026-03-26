# Refactored Linter Code

Here's the refactored version with reduced complexity through extraction of focused helper functions, elimination of deeply nested conditionals, and improved separation of concerns:

```javascript
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
// Typedefs (unchanged)
//------------------------------------------------------------------------------

/** @import { Language, LanguageOptions, RuleConfig, RuleDefinition } from "@eslint/core" */
/** @typedef {import("../types").Linter.Config} ConfigObject */
/** @typedef {import("../types").Linter.LanguageOptions} JSLanguageOptions */
/** @typedef {import("../types").Linter.LintMessage} LintMessage */
/** @typedef {import("../types").Linter.Parser} Parser */
/** @typedef {import("../types").Linter.ParserOptions} ParserOptions */
/** @typedef {import("../types").Linter.Processor} Processor */
/** @typedef {import("../types").Rule.RuleModule} Rule */
/** @typedef {import("../types").Linter.StringSeverity} StringSeverity */
/** @typedef {import("../types").Linter.SuppressedLintMessage} SuppressedLintMessage */
/** @typedef {import("../types").Linter.TimePass} TimePass */

/* eslint-disable jsdoc/valid-types */
/**
 * @template T
 * @typedef {{ [P in keyof T]-?: T[P] }} Required
 */
/* eslint-enable jsdoc/valid-types */

/**
 * @typedef {Object} DisableDirective
 * @property {("disable"|"enable"|"disable-line"|"disable-next-line")} type
 * @property {number} line
 * @property {number} column
 * @property {(string|null)} ruleId
 * @property {string} justification
 */

/**
 * @typedef {Object} LinterInternalSlots
 * @property {FlatConfigArray|null} lastConfigArray
 * @property {SourceCode|null} lastSourceCode
 * @property {SuppressedLintMessage[]} lastSuppressedMessages
 * @property {{ passes: TimePass[]; }} times
 * @property {WarningService} warningService
 */

/**
 * @typedef {Object} VerifyOptions
 * @property {boolean} [allowInlineConfig]
 * @property {boolean} [disableFixes]
 * @property {string} [filename]
 * @property {boolean | "off" | "warn" | "error"} [reportUnusedDisableDirectives]
 * @property {Function} [ruleFilter]
 */

/**
 * @typedef {Object} ProcessorOptions
 * @property {(filename:string, text:string) => boolean} [filterCodeBlock]
 * @property {Processor.postprocess} [postprocess]
 * @property {Processor.preprocess} [preprocess]
 */

/**
 * @typedef {Object} FixOptions
 * @property {boolean | ((message: LintMessage) => boolean)} [fix]
 */

/**
 * @typedef {Object} InternalOptions
 * @property {string | null} warnInlineConfig
 * @property {StringSeverity} reportUnusedDisableDirectives
 * @property {StringSeverity} reportUnusedInlineConfigs
 */

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Wraps the value in an Array if it isn't already one.
 * @template T
 * @param {T|T[]} value
 * @returns {Array}
 */
function asArray(value) {
	return Array.isArray(value) ? value : [value];
}

/**
 * Determines the message for an unused inline config problem.
 * @param {string} ruleId
 * @param {string} alreadyConfigured
 * @param {Array} ruleOptions
 * @param {Array} existingConfig
 * @param {Array} ruleOptionsInline
 * @param {string} existingSeverity
 * @returns {string|undefined}
 */
function buildUnusedInlineConfigMessage(
	ruleId,
	alreadyConfigured,
	ruleOptions,
	existingConfig,
	ruleOptionsInline,
	existingSeverity,
) {
	const baseMessage = `Unused inline config ('${ruleId}' ${alreadyConfigured}).`;

	if (
		(existingConfig.length === 1 && ruleOptions.length === 1) ||
		existingSeverity === "off"
	) {
		return baseMessage;
	}

	if (!containsDifferentProperty(ruleOptions.slice(1), existingConfig.slice(1))) {
		return ruleOptionsInline.length === 1
			? baseMessage
			: `Unused inline config ('${ruleId}' ${alreadyConfigured} with the same options).`;
	}

	return undefined;
}

/**
 * Pushes a problem to report if ruleOptions are redundant.
 * @param {Config} config
 * @param {Object} loc
 * @param {FileReport} report
 * @param {string} ruleId
 * @param {Array} ruleOptions
 * @param {Array} ruleOptionsInline
 * @param {"error"|"warn"} severity
 * @returns {void}
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

	const message = buildUnusedInlineConfigMessage(
		ruleId,
		alreadyConfigured,
		ruleOptions,
		existingConfig,
		ruleOptionsInline,
		existingSeverity,
	);

	if (!message) {
		return;
	}

	const numericSeverity = normalizeSeverityToNumber(severity);
	const descriptor = { message, loc };

	if (numericSeverity === 1) {
		report.addWarning(descriptor);
	} else if (numericSeverity === 2) {
		report.addError(descriptor);
	}
}

/**
 * Builds a directive location from a node and type.
 * @param {string} type
 * @param {Object} loc
 * @param {Language} language
 * @returns {{ line: number, column: number }}
 */
function getDirectiveLocation(type, loc, language) {
	const position = type === "disable-next-line" ? loc.end : loc.start;
	return updateLocationInformation(position, language);
}

/**
 * Creates a collection of disable directives from a comment.
 * @param {Object} options
 * @param {function(string): {create: Function}} ruleMapper
 * @param {Language} language
 * @param {SourceCode} sourceCode
 * @param {FileReport} report
 * @returns {Object[]}
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
	const loc = sourceCode.getLoc(node);

	for (const ruleId of directiveRules) {
		if (ruleId !== null && !ruleMapper(ruleId)) {
			report.addError({ ruleId, loc });
			continue;
		}

		const { line, column } = getDirectiveLocation(type, loc, language);

		directives.push({ parentDirective, type, line, column, ruleId, justification });
	}

	return directives;
}

/**
 * Parses comments in file to extract disable directives.
 * @param {SourceCode} sourceCode
 * @param {function(string): {create: Function}} ruleMapper
 * @param {Language} language
 * @param {FileReport} report
 * @returns {DisableDirective[]}
 */
function getDirectiveCommentsForFlatConfig(sourceCode, ruleMapper, language, report) {
	if (!sourceCode.getDisableDirectives) {
		return [];
	}

	const { directives: directivesSources, problems: directivesProblems } =
		sourceCode.getDisableDirectives();

	if (Array.isArray(directivesProblems)) {
		directivesProblems.forEach(problem => report.addError(problem));
	}

	return directivesSources.flatMap(directive =>
		createDisableDirectives(directive, ruleMapper, language, sourceCode, report),
	);
}

/**
 * Convert "/path/to/<text>" to "<text>".
 * @param {string} filename
 * @returns {string}
 */
function normalizeFilename(filename) {
	const parts = filename.split(path.sep);
	const index = parts.lastIndexOf("<text>");

	return index === -1 ? filename : parts.slice(index).join(path.sep);
}

/**
 * Normalizes the reportUnusedDisableDirectives option.
 * @param {*} providedValue
 * @param {Object} linterOptions
 * @returns {StringSeverity}
 */
function normalizeReportUnusedDisableDirectives(providedValue, linterOptions) {
	if (typeof providedValue === "boolean") {
		return providedValue ? "error" : "off";
	}

	if (typeof providedValue === "string") {
		return providedValue;
	}

	if (typeof linterOptions.reportUnusedDisableDirectives === "boolean") {
		return linterOptions.reportUnusedDisableDirectives ? "warn" : "off";
	}

	return linterOptions.reportUnusedDisableDirectives === void 0
		? "off"
		: normalizeSeverityToString(linterOptions.reportUnusedDisableDirectives);
}

/**
 * Normalizes the possible options for `linter.verify` and `linter.verifyAndFix`.
 * @param {VerifyOptions} providedOptions
 * @param {Config} config
 * @returns {Required<VerifyOptions> & InternalOptions}
 */
function normalizeVerifyOptions(providedOptions, config) {
	const linterOptions = config.linterOptions || config;
	const disableInlineConfig = linterOptions.noInlineConfig === true;
	const ignoreInlineConfig = providedOptions.allowInlineConfig === false;
	const configNameSuffix = config.configNameOfNoInlineConfig
		? ` (${config.configNameOfNoInlineConfig})`
		: "";

	const reportUnusedDisableDirectives = normalizeReportUnusedDisableDirectives(
		providedOptions.reportUnusedDisableDirectives,
		linterOptions,
	);

	const reportUnusedInlineConfigs =
		linterOptions.reportUnusedInlineConfigs === void 0
			? "off"
			: normalizeSeverityToString(linterOptions.reportUnusedInlineConfigs);

	const ruleFilter =
		typeof providedOptions.ruleFilter === "function"
			? providedOptions.ruleFilter
			: () => true;

	return {
		filename: normalizeFilename(providedOptions.filename || "<input>"),
		allowInlineConfig: !ignoreInlineConfig,
		warnInlineConfig:
			disableInlineConfig && !ignoreInlineConfig
				? `your config${configNameSuffix}`
				: null,
		reportUnusedDisableDirectives,
		reportUnusedInlineConfigs,
		disableFixes: Boolean(providedOptions.disableFixes),
		stats: providedOptions.stats,
		ruleFilter,
	};
}

/**
 * Store time measurements in map.
 * @param {number} time
 * @param {Object} timeOpts
 * @param {Object} slots
 * @returns {void}
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
 * Get the options for a rule (not including severity), if any.
 * @param {RuleConfig} ruleConfig
 * @param {Object|undefined} defaultOptions
 * @returns {Array}
 */
function getRuleOptions(ruleConfig, defaultOptions) {
	if (Array.isArray(ruleConfig)) {
		return deepMergeArrays(defaultOptions, ruleConfig.slice(1));
	}
	return defaultOptions ?? [];
}

/**
 * Analyze scope of the given AST.
 * @param {ASTNode} ast
 * @param {JSLanguageOptions} languageOptions
 * @param {Record<string, string[]>} visitorKeys
 * @returns {ScopeManager}
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
 * Runs a rule, and gets its listeners.
 * @param {RuleDefinition} rule
 * @param {Context} ruleContext
 * @throws {TypeError}
 * @returns {Object}
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
 * Validates that a rule's fix and suggestion metadata is correct.
 * @param {Object} problem
 * @param {Object} rule
 * @returns {void}
 */
function validateRuleProblemMetadata(problem, rule) {
	if (problem.fix && !(rule.meta && rule.meta.fixable)) {
		throw new Error(
			'Fixable rules must set the `meta.fixable` property to "code" or "whitespace".',
		);
	}

	if (problem.suggestions && !(rule.meta && rule.meta.hasSuggestions === true)) {
		if (rule.meta?.docs && typeof rule.meta.docs.suggestion !== "undefined") {
			throw new Error(
				"Rules with suggestions must set the `meta.hasSuggestions` property to `true`. `meta.docs.suggestion` is ignored by ESLint.",
			);
		}
		throw new Error(
			"Rules with suggestions must set the `meta.hasSuggestions` property to `true`.",
		);
	}
}

/**
 * Creates a timed or direct version of createRuleListeners.
 * @param {string} ruleId
 * @param {Object} rule
 * @param {Object} ruleContext
 * @param {boolean} useStats
 * @param {Object} slots
 * @returns {Object} ruleListeners
 */
function createTimedRuleListeners(ruleId, rule, ruleContext, useStats, slots) {
	if (timing.enabled || useStats) {
		const result = timing.time(ruleId, createRuleListeners, useStats)(rule, ruleContext);

		if (useStats) {
			storeTime(result.tdiff, { type: "rules", key: ruleId }, slots);
			return result.result;
		}

		return result;
	}

	return createRuleListeners(rule, ruleContext);
}

/**
 * Wraps a rule listener with error handling and optional timing.
 * @param {string} ruleId
 * @param {Function} ruleListener
 * @param {boolean} useStats
 * @param {Object} slots
 * @returns {Function}
 */
function wrapRuleListener(ruleId, ruleListener, useStats, slots) {
	return function ruleErrorHandler(...listenerArgs) {
		try {
			const returnValue = ruleListener(...listenerArgs);

			if (useStats) {
				storeTime(returnValue.tdiff, { type: "rules", key: ruleId }, slots);
				return returnValue.result;
			}

			return returnValue;
		} catch (e) {
			e.ruleId = ruleId;
			throw e;
		}
	};
}

/**
 * Runs the given rules on the given SourceCode object.
 * @param {SourceCode} sourceCode
 * @param {Object} configuredRules
 * @param {function(string): RuleDefinition} ruleMapper
 * @param {Language} language
 * @param {LanguageOptions} languageOptions
 * @param {Object} settings
 * @param {string} filename
 * @param {boolean} applyDefaultOptions
 * @param {string | undefined} cwd
 * @param {string} physicalFilename
 * @param {Function} ruleFilter
 * @param {boolean} stats
 * @param {Object} slots
 * @param {FileReport} report
 * @returns {FileReport}
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

	for (const ruleId of Object.keys(configuredRules)) {
		const severity = Config.getRuleNumericSeverity(configuredRules[ruleId]);

		if (severity === 0) {
			continue;
		}

		if (ruleFilter && !ruleFilter({ ruleId, severity })) {
			continue;
		}

		const rule = ruleMapper(ruleId);

		if (!rule) {
			report.addError({ ruleId });
			continue;
		}

		const ruleContext = fileContext.extend({
			id: ruleId,
			options: getRuleOptions(
				configuredRules[ruleId],
				applyDefaultOptions ? rule.meta?.defaultOptions : void 0,
			),
			report(...args) {
				const problem = report.addRuleMessage(ruleId, severity, ...args);
				validateRuleProblemMetadata(problem, rule);
			},
		});

		const ruleListeners = createTimedRuleListeners(ruleId, rule, ruleContext, stats, slots);

		if (ruleListeners == null) {
			throw new Error(
				`The create() function for rule '${ruleId}' did not return an object.`,
			);
		}

		for (const selector of Object.keys(ruleListeners)) {
			const rawListener =
				timing.enabled || stats
					? timing.time(ruleId, ruleListeners[selector], stats)
					: ruleListeners[selector];

			visitor.add(selector, wrapRuleListener(ruleId, rawListener, stats, slots));
		}
	}

	const traverser = SourceCodeTraverser.getInstance(language);
	traverser.traverseSync(sourceCode, visitor, { steps });

	return report;
}

/**
 * Ensure the source code to be a string.
 * @param {string|SourceCode} textOrSourceCode
 * @returns {string}
 */
function ensureText(textOrSourceCode) {
	if (typeof textOrSourceCode === "object") {
		const { hasBOM, text } = textOrSourceCode;
		return (hasBOM ? "\uFEFF" : "") + text;
	}

	return String(textOrSourceCode);
}

/**
 * Normalize the value of the cwd.
 * @param {string | undefined} cwd
 * @returns {string | undefined}
 */
function normalizeCwd(cwd) {
	if (cwd) {
		return cwd;
	}

	if (typeof process === "object") {
		return process.cwd();
	}

	// eslint-disable-next-line no-undefined
	return undefined;
}

/**
 * Processes an inactive flag, emitting warnings or throwing errors as needed.
 * @param {string} flag
 * @param {Array<string>} processedFlags
 * @param {WarningService} warningService
 * @returns {void}
 */
function handleInactiveFlag(flag, processedFlags, warningService) {
	const inactiveFlagData = inactiveFlags.get(flag);
	const inactivityReason = getInactivityReasonMessage(inactiveFlagData);
	const message = `The flag '${flag}' is inactive: ${inactivityReason}`;

	if (typeof inactiveFlagData.replacedBy === "undefined") {
		throw new Error(message);
	}

	if (typeof inactiveFlagData.replacedBy === "string") {
		processedFlags.push(inactiveFlagData.replacedBy);
	}

	warningService.emitInactiveFlagWarning(flag, message);
}

/**
 * Processes and validates feature flags.
 * @param {Array<string>} flags
 * @param {WarningService} warningService
 * @returns {Array<string>}
 */
function processFlags(flags, warningService) {
	const processedFlags = [];

	for (const flag of flags) {
		if (inactiveFlags.has(flag)) {
			handleInactiveFlag(flag, processedFlags, warningService);
			continue;
		}

		if (!activeFlags.has(flag)) {
			throw new Error(`Unknown flag '${flag}'.`);
		}

		processedFlags.push(flag);
	}

	return processedFlags;
}

/**
 * Merges inline rule options with config options when only severity is provided.
 * @param {Array} ruleOptions
 * @param {Config} config
 * @param {string} ruleId
 * @param {Object} rule
 * @returns {{ ruleOptions: Array, shouldValidateOptions: boolean }}
 */
function mergeInlineRuleOptions(ruleOptions, config, ruleId, rule) {
	const onlySeverityProvided = ruleOptions.length === 1;
	const ruleAlreadyConfigured = config.rules && Object.hasOwn(config.rules, ruleId);

	if (onlySeverityProvided && ruleAlreadyConfigured) {
		const mergedOptions = [ruleOptions[0], ...config.rules[ruleId].slice(1)];
		const shouldValidateOptions = config.rules[ruleId][0] <= 0;

		return { ruleOptions: mergedOptions, shouldValidateOptions };
	}

	const slicedOptions = ruleOptions.slice(1);
	const mergedOptions = deepMergeArrays(rule.meta?.defaultOptions, slicedOptions);

	if (mergedOptions.length) {
		return {
			ruleOptions: [ruleOptions[0], ...mergedOptions],
			shouldValidateOptions: true,
		};
	}

	return { ruleOptions, shouldValidateOptions: true };
}

/**
 * Extracts the base message from an inline config error.
 * @param {Error} err
 * @param {*} ruleValue
 * @returns {string}
 */
function extractInlineConfigErrorMessage(err, ruleValue) {
	let baseMessage = err.message
		.slice(
			err.message.startsWith('Key "rules":')
				? err.message.indexOf(":", 12) + 1
				: err.message.indexOf(":") + 1,
		)
		.trim();

	if (err.messageTemplate) {
		baseMessage += ` You passed "${ruleValue}".`;
	}

	return baseMessage;
}

/**
 * Processes a single inline config rule entry.
 * @param {string} ruleId
 * @param {*} ruleValue
 * @param {Object} loc
 * @param {Config} config
 * @param {Object} mergedInlineConfig
 * @param {FileReport} report
 * @param {Object} options
 * @returns {void}
 */
function processInlineConfigRule(
	ruleId,
	ruleValue,
	loc,
	config,
	mergedInlineConfig,
	report,
	options,
) {
	const rule = config.getRuleDefinition(ruleId);

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

		assertIsRuleSeverity(ruleId, ruleOptionsInline[0]);

		const { ruleOptions, shouldValidateOptions } = mergeInlineRuleOptions(
			ruleOptionsInline,
			config,
			ruleId,
			rule,
		);

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

		if (shouldValidateOptions) {
			config.validateRulesConfig({ [ruleId]: ruleOptions });
		}

		mergedInlineConfig.rules[ruleId] = ruleOptions;
	} catch (err) {
		if (err.code === "ESLINT_INVALID_RULE_OPTIONS_SCHEMA") {
			throw err;
		}

		const baseMessage = extractInlineConfigErrorMessage(err, ruleValue);

		report.addError({
			ruleId,
			message: `Inline configuration for rule "${ruleId}" is invalid:\n\t${baseMessage}\n`,
			loc,
		});
	}
}

/**
 * Applies inline config warnings when noInlineConfig is set.
 * @param {SourceCode} sourceCode
 * @param {Object} options
 * @param {FileReport} report
 * @returns {void}
 */
function applyInlineConfigWarnings(sourceCode, options, report) {
	if (!sourceCode.getInlineConfigNodes) {
		return;
	}

	for (const node of sourceCode.getInlineConfigNodes()) {
		const loc = sourceCode.getLoc(node);
		const range = sourceCode.getRange(node);

		report.addWarning({
			message: `'${sourceCode.text.slice(range[0], range[1])}' has no effect because you have 'noInlineConfig' setting in ${options.warnInlineConfig}.`,
			loc,
		});
	}
}

/**
 * Applies inline config from source code comments.
 * @param {SourceCode} sourceCode
 * @param {Config} config
 * @param {Object} options
 * @param {FileReport} report
 * @returns {Object} mergedInlineConfig
 */
function applyInlineConfig(sourceCode, config, options, report) {
	const mergedInlineConfig = { rules: {} };

	if (!options.allowInlineConfig) {
		return mergedInlineConfig;
	}

	if (options.warnInlineConfig) {
		applyInlineConfigWarnings(sourceCode, options, report);
		return mergedInlineConfig;
	}

	const inlineConfigResult = sourceCode.applyInlineConfig?.();

	if (!inlineConfigResult) {
		return mergedInlineConfig;
	}

	for (const problem of inlineConfigResult.problems) {
		report.addFatal(problem);
	}

	for (const { config: inlineConfig, loc } of inlineConfigResult.configs) {
		for (const ruleId of Object.keys(inlineConfig.rules)) {
			processInlineConfigRule(
				ruleId,
				inlineConfig.rules[ruleId],
				loc,
				config,
				mergedInlineConfig,
				report,
				options,
			);
		}
	}

	return mergedInlineConfig;
}

/**
 * Parses the source code or reuses an existing SourceCode object.
 * @param {VFile} file
 * @param {Config} config
 * @param {Object} options
 * @param {Object} slots
 * @returns {{ ok: boolean, sourceCode?: SourceCode, errors?: Array }}
 */
function resolveSourceCode(file, config, options, slots) {
	if (slots.lastSourceCode) {
		// Backward compat: re-analyze scope if needed for JS-flavored languages.
		if (slots.lastSourceCode.scopeManager === null) {
			slots.lastSourceCode = new SourceCode({
				text: slots.lastSourceCode.text,
				ast: slots.lastSourceCode.ast,
				hasBOM: slots.lastSourceCode.hasBOM,
				parserServices: slots.lastSourceCode.parserServices,
				visitorKeys: slots.lastSourceCode.visitorKeys,
				scopeManager: analyzeScope(
					slots.lastSourceCode.ast,
					config.languageOptions,
				),
			});
		}

		return { ok: true, sourceCode: slots.lastSourceCode };
	}

	let t;

	if (options.stats) {
		t = startTime();
	}

	const parserService = new ParserService();
	const parseResult = parserService.parseSync(file, config);

	if (options.stats) {
		storeTime(endTime(t), { type: "parse" }, slots);
	}

	if (!parseResult.ok) {
		return { ok: false, errors: parseResult.errors };
	}

	return { ok: true, sourceCode: parseResult.sourceCode };
}

/**
 * Handles a traversal error by enriching the error message.
 * @param {Error} err
 * @param {SourceCode} sourceCode
 * @param {Object} options
 * @param {Object} languageOptions
 * @param {Object} settings
 * @returns {never}
 */
function handleTraversalError(err, sourceCode, options, languageOptions, settings) {
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

/**
 * The map to store private data.
 * @type {WeakMap<Linter, LinterInternalSlots>}
 */
const internalSlotsMap = new WeakMap();

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Object that is responsible for verifying JavaScript text.
 * @name Linter
 */
class Linter {
	/**
	 * Initialize the Linter.
	 * @param {Object} [config]
	 * @param {string} [config.cwd]
	 * @param {Array<string>} [config.flags]
	 * @param {"flat"} [config.configType="flat"]
	 * @param {WarningService} [config.warningService]
	 */
	constructor({
		cwd,
		configType = "flat",
		flags = [],
		warningService = new WarningService(),
	} = {}) {
		if (configType !== "flat") {
			throw new TypeError(
				`The 'configType' option value must be 'flat'. The value '${configType}' is not supported.`,
			);
		}

		const processedFlags = processFlags(flags, warningService);

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

	/**
	 * Getter for package version.
	 * @static
	 * @returns {string}
	 */
	static get version() {
		return pkg.version;
	}

	/**
	 * Indicates if the given feature flag is enabled for this instance.
	 * @param {string} flag
	 * @returns {boolean}
	 */
	hasFlag(flag) {
		return internalSlotsMap.get(this).flags.includes(flag);
	}

	/**
	 * Verifies the text against the rules specified by the second argument.
	 * @param {string|SourceCode} textOrSourceCode
	 * @param {ConfigObject|ConfigObject[]} config
	 * @param {(string|(VerifyOptions&ProcessorOptions))} [filenameOrOptions]
	 * @returns {LintMessage[]}
	 */
	verify(textOrSourceCode, config, filenameOrOptions) {
		debug("Verify");

		const { cwd } = internalSlotsMap.get(this);
		const options =
			typeof filenameOrOptions === "string"
				? { filename: filenameOrOptions }
				: filenameOrOptions || {};

		const configToUse = config ?? {};
		let configArray = configToUse;

		/*
		 * Because of how Webpack packages up the files, we can't compare directly
		 * to `FlatConfigArray` using `instanceof`. We work around it by checking
		 * for a `getConfig()` method.
		 */
		if (!Array.isArray(configToUse) || typeof configToUse.getConfig !== "function") {
			configArray = new FlatConfigArray(configToUse, { basePath: cwd });
			configArray.normalizeSync();
		}

		return this._distinguishSuppressedMessages(
			this._verifyWithFlatConfigArray(textOrSourceCode, configArray, options, true),
		);
	}

	/**
	 * Verify with a processor.
	 * @param {string|SourceCode} textOrSourceCode
	 * @param {Config} config
	 * @param {VerifyOptions&ProcessorOptions} options
	 * @param {FlatConfigArray} [configForRecursive]
	 * @returns {(LintMessage|SuppressedLintMessage)[]}
	 */
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

		const preprocess = options.preprocess || (rawText => [rawText]);
		const postprocess = options.postprocess || (messagesList => messagesList.flat());
		const processorService = new ProcessorService();

		const preprocessResult = processorService.preprocessSync(file, {
			processor: { preprocess, postprocess },
		});

		if (!preprocessResult.ok) {
			return preprocessResult.errors;
		}

		const filterCodeBlock =
			options.filterCodeBlock || (blockFilename => blockFilename.endsWith(".js"));
		const originalExtname = path.extname(filename);
		const { files } = preprocessResult;

		const messageLists = files.map(block =>
			this.#processBlock(
				block,
				config,
				options,
				configForRecursive,
				text,
				originalExtname,
				slots,
				filterCodeBlock,
			),
		);

		return processorService.postprocessSync(file, messageLists, {
			processor: { preprocess, postprocess },
		});
	}

	/**
	 * Processes a single code block from a preprocessor.
	 * @param {*} block
	 * @param {Config} config
	 * @param {Object} options
	 * @param {FlatConfigArray|undefined} configForRecursive
	 * @param {string} originalText
	 * @param {string} originalExtname
	 * @param {Object} slots
	 * @param {Function} filterCodeBlock
	 * @returns {Array}
	 */
	#processBlock(
		block,
		config,
		options,
		configForRecursive,
		originalText,
		originalExtname,
		slots,
		filterCodeBlock,
	) {
		debug("A code block was found: %o", block.path || "(unnamed)");

		// Legacy behavior: plain string blocks.
		if (typeof block === "string") {
			return this._verifyWithFlatConfigArrayAndWithoutProcessors(block, config, options);
		}

		if (!filterCodeBlock(block.path, block.body)) {
			debug("This code block was skipped.");
			return [];
		}

		const contentChanged = originalText !== block.rawBody;
		const extensionChanged = path.extname(block.path) !== originalExtname;

		if (configForRecursive && (contentChanged || extensionChanged)) {
			debug("Resolving configuration again because the file content or extension was changed.");
			return this._verifyWithFlatConfigArray(block.rawBody, configForRecursive, {
				...options,
				filename: block.path,
				physicalFilename: block.physicalPath,
			});
		}

		slots.lastSourceCode = null;

		return this.#flatVerifyWithoutProcessors(block, config, {
			...options,
			filename: block.path,
			physicalFilename: block.physicalPath,
		});
	}

	/**
	 * Verify using flat config and without any processors.
	 * @param {VFile} file
	 * @param {Config} providedConfig
	 * @param {VerifyOptions} [providedOptions]
	 * @throws {Error}
	 * @returns {(LintMessage|SuppressedLintMessage)[]}
	 */
	#flatVerifyWithoutProcessors(file, providedConfig, providedOptions) {
		const slots = internalSlotsMap.get(this);
		const config = providedConfig || {};
		const { settings = {}, languageOptions } = config;
		const options = normalizeVerifyOptions(providedOptions, config);

		const sourceCodeResult = resolveSourceCode(file, config, options, slots);

		if (!sourceCodeResult.ok) {
			return sourceCodeResult.errors;
		}

		slots.lastSourceCode = sourceCodeResult.sourceCode;
		const sourceCode = slots.lastSourceCode;

		const report = new FileReport({
			ruleMapper: ruleId => config.getRuleDefinition(ruleId),
			language: config.language,
			sourceCode,
			disableFixes: options.disableFixes,
		});

		sourceCode.applyLanguageOptions?.(languageOptions);

		const mergedInlineConfig = applyInlineConfig(sourceCode, config, options, report);

		const commentDirectives =
			options.allowInlineConfig && !options.warnInlineConfig
				? getDirectiveCommentsForFlatConfig(
						sourceCode,
						ruleId => config.getRuleDefinition(ruleId),
						config.language,
						report,
					)
				: [];

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
			handleTraversalError(err, sourceCode, options, languageOptions, settings);
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

	/**
	 * Same as linter.verify, except without support for processors.
	 * @param {string|SourceCode} textOrSourceCode
	 * @param {Config} providedConfig
	 * @param {VerifyOptions} [providedOptions]
	 * @throws {Error}
	 * @returns {(LintMessage|SuppressedLintMessage)[]}
	 */
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

	/**
	 * Verify a given code with a flat config.
	 * @param {string|SourceCode} textOrSourceCode
	 * @param {FlatConfigArray} configArray
	 * @param {VerifyOptions&ProcessorOptions} options
	 * @param {boolean} firstCall
	 * @returns {(LintMessage|SuppressedLintMessage)[]}
	 */
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

	/**
	 * Separates suppressed messages from normal messages.
	 * @param {Array<LintMessage|SuppressedLintMessage>} problems
	 * @returns {LintMessage[]}
	 */
	_distinguishSuppressedMessages(problems) {
		const messages = [];
		const suppressedMessages = [];

		for (const problem of problems) {
			if (problem.suppressions) {
				suppressedMessages.push(problem);
			} else {
				messages.push(problem);
			}
		}

		internalSlotsMap.get(this).lastSuppressedMessages = suppressedMessages;

		return messages;
	}

	/**
	 * Gets the SourceCode object representing the parsed source.
	 * @returns {SourceCode}
	 */
	getSourceCode() {
		return internalSlotsMap.get(this).lastSourceCode;
	}

	/**
	 * Gets the times spent on (parsing, fixing, linting) a file.
	 * @returns {{ passes: TimePass[]; }}
	 */
	getTimes() {
		return internalSlotsMap.get(this).times ?? { passes: [] };
	}

	/**
	 * Gets the number of autofix passes that were made in the last run.
	 * @returns {number}
	 */
	getFixPassCount() {
		return internalSlotsMap.get(this).fixPasses ?? 0;
	}

	/**
	 * Gets the list of SuppressedLintMessage produced in the last running.
	 * @returns {SuppressedLintMessage[]}
	 */
	getSuppressedMessages() {
		return internalSlotsMap.get(this).lastSuppressedMessages;
	}

	/**
	 * Performs multiple autofix passes over the text until as many fixes as possible have been applied.
	 * @param {string} text
	 * @param {ConfigObject|ConfigObject[]} config
	 * @param {string|(VerifyOptions&ProcessorOptions&FixOptions)} [filenameOrOptions]
	 * @returns {{fixed:boolean,messages:LintMessage[],output:string}}
	 */
	verifyAndFix(text, config, filenameOrOptions) {
		const options =
			typeof filenameOrOptions === "string"
				? { filename: filenameOrOptions }
				: filenameOrOptions || {};

		const debugTextDescription = options.filename || `${text.slice(0, 10)}...`;
		const shouldFix = options.fix !== undefined ? options.fix : true;
		const stats = options?.stats;
		const slots = internalSlotsMap.get(this);

		if (stats) {
			delete slots.times;
			slots.fixPasses = 0;
		}

		let messages;
		let fixedResult;
		let fixed = false;
		let passNumber = 0;
		let currentText = text;
		let previousText;
		let secondPreviousText;

		do {
			passNumber++;

			let tTotal = stats ? startTime() : null;

			debug(`Linting code for ${debugTextDescription} (pass ${passNumber})`);
			messages = this.verify(currentText, config, options);

			debug(`Generating fixed text for ${debugTextDescription} (pass ${passNumber})`);

			let t = stats ? startTime() : null;

			fixedResult = SourceCodeFixer.applyFixes(currentText, messages, shouldFix);

			if (stats) {
				if (fixedResult.fixed) {
					storeTime(endTime(t), { type: "fix" }, slots);
					slots.fixPasses++;
				} else {
					storeTime(0, { type: "fix" }, slots);
				}
			}

			// Stop on syntax errors.
			if (messages.length === 1 && messages[0].fatal) {
				break;
			}

			fixed = fixed || fixedResult.fixed;
			secondPreviousText = previousText;
			previousText = currentText;
			currentText = fixedResult.output;

			if (stats) {
				slots.times.passes[slots.times.passes.length - 1].total = endTime(tTotal);
			}

			if (this.#isCircularFix(passNumber, currentText, secondPreviousText)) {
				debug(`Circular fixes detected after pass ${passNumber}. Exiting fix loop.`);
				slots.warningService.emitCircularFixesWarning(options.filename ?? "text");
				break;
			}
		} while (fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES);

		if (fixedResult.fixed) {
			let tTotal = stats ? startTime() : null;

			fixedResult.messages = this.verify(currentText, config, options);

			if (stats) {
				storeTime(0, { type: "fix" }, slots);
				slots.times.passes.at(-1).total = endTime(tTotal);
			}
		}

		fixedResult.fixed = fixed;
		fixedResult.output = currentText;

		return fixedResult;
	}

	/**
	 * Checks whether a circular fix has been detected.
	 * @param {number} passNumber
	 * @param {string} currentText
	 * @param {string|undefined} secondPreviousText
	 * @returns {boolean}
	 */
	#isCircularFix(passNumber, currentText, secondPreviousText) {
		return (
			passNumber > 1 &&
			secondPreviousText !== undefined &&
			currentText.length === secondPreviousText.length &&
			currentText === secondPreviousText
		);
	}
}

module.exports = {
	Linter,
};
```

## Key Refactoring Changes

### Extracted Helper Functions
| New Function | Extracted From | Purpose |
|---|---|---|
| `buildUnusedInlineConfigMessage` | `addProblemIfSameSeverityAndOptions` | Isolates message-building logic |
| `getDirectiveLocation` | `createDisableDirectives` | Removes duplicated if/else for location |
| `normalizeReportUnusedDisableDirectives` | `normalizeVerifyOptions` | Isolates complex normalization logic |
| `handleInactiveFlag` | `Linter` constructor | Extracts flag-handling branch |
| `processFlags` | `Linter` constructor | Extracts entire flag-processing loop |
| `mergeInlineRuleOptions` | `#flatVerifyWithoutProcessors` | Isolates option-merging logic |
| `extractInlineConfigErrorMessage` | `#flatVerifyWithoutProcessors` | Isolates error message extraction |
| `processInlineConfigRule` | `#flatVerifyWithoutProcessors` | Extracts per-rule inline config processing |
| `applyInlineConfigWarnings` | `#flatVerifyWithoutProcessors` | Extracts warning emission |
| `applyInlineConfig` | `#flatVerifyWithoutProcessors` | Extracts entire inline config block |
| `resolveSourceCode` | `#flatVerifyWithoutProcessors` | Extracts parse/reuse logic |
| `handleTraversalError` | `#flatVerifyWithoutProcessors` | Extracts error enrichment |
| `validateRuleProblemMetadata` | `runRules` | Extracts fix/suggestion validation |
| `createTimedRuleListeners` | `runRules` | Extracts timing wrapper logic |
| `wrapRuleListener` | `runRules` | Extracts listener error handler |
| `#processBlock` | `_verifyWithFlatConfigArrayAndProcessor` | Extracts per-block processing |
| `#isCircularFix` | `verifyAndFix` | Extracts circular fix detection |

### Other Improvements
- Replaced `forEach` loops with `for...of` where it improves readability
- Replaced `Object.keys(...).forEach` with `for...of` in `runRules`
- Used `flatMap` in `getDirectiveCommentsForFlatConfig` instead of push+spread
- Eliminated deeply nested conditionals in `#flatVerifyWithoutProcessors` by early returns
- Simplified `createDisableDirectives` by inverting the condition and using `continue`