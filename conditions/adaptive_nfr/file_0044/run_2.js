# Refactoring Analysis

The code has several complexity issues:
1. **`#flatVerifyWithoutProcessors`** - massive method (~200 lines) with deeply nested logic
2. **`runRules`** - complex function with mixed concerns
3. **`addProblemIfSameSeverityAndOptions`** - convoluted conditional logic
4. **`normalizeVerifyOptions`** - nested conditionals for severity normalization
5. **`verifyAndFix`** - stats tracking mixed with business logic
6. **Inline config processing** - deeply nested try/catch with complex rule option merging

Let me refactor these systematically:

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
// Typedefs
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

/* eslint-disable jsdoc/valid-types -- https://github.com/jsdoc-type-pratt-parser/jsdoc-type-pratt-parser/issues/4#issuecomment-778805577 */
/**
 * @template T
 * @typedef {{ [P in keyof T]-?: T[P] }} Required
 */
/* eslint-enable jsdoc/valid-types -- https://github.com/jsdoc-type-pratt-parser/jsdoc-type-pratt-parser/issues/4#issuecomment-778805577 */

/**
 * @typedef {Object} DisableDirective
 * @property {("disable"|"enable"|"disable-line"|"disable-next-line")} type Type of directive
 * @property {number} line The line number
 * @property {number} column The column number
 * @property {(string|null)} ruleId The rule ID
 * @property {string} justification The justification of directive
 */

/**
 * The private data for `Linter` instance.
 * @typedef {Object} LinterInternalSlots
 * @property {FlatConfigArray|null} lastConfigArray The `ConfigArray` instance that the last `verify()` call used.
 * @property {SourceCode|null} lastSourceCode The `SourceCode` instance that the last `verify()` call used.
 * @property {SuppressedLintMessage[]} lastSuppressedMessages The `SuppressedLintMessage[]` instance that the last `verify()` call produced.
 * @property {{ passes: TimePass[]; }} times The times spent on applying a rule to a file (see `stats` option).
 * @property {WarningService} warningService The warning service.
 */

/**
 * @typedef {Object} VerifyOptions
 * @property {boolean} [allowInlineConfig] Allow/disallow inline comments' ability
 *      to change config once it is set. Defaults to true if not supplied.
 *      Useful if you want to validate JS without comments overriding rules.
 * @property {boolean} [disableFixes] if `true` then the linter doesn't make `fix`
 *      properties into the lint result.
 * @property {string} [filename] the filename of the source code.
 * @property {boolean | "off" | "warn" | "error"} [reportUnusedDisableDirectives] Adds reported errors for
 *      unused `eslint-disable` directives.
 * @property {Function} [ruleFilter] A predicate function that determines whether a given rule should run.
 */

/**
 * @typedef {Object} ProcessorOptions
 * @property {(filename:string, text:string) => boolean} [filterCodeBlock] the
 *      predicate function that selects adopt code blocks.
 * @property {Processor.postprocess} [postprocess] postprocessor for report
 *      messages. If provided, this should accept an array of the message lists
 *      for each code block returned from the preprocessor, apply a mapping to
 *      the messages as appropriate, and return a one-dimensional array of
 *      messages.
 * @property {Processor.preprocess} [preprocess] preprocessor for source text.
 *      If provided, this should accept a string of source text, and return an
 *      array of code blocks to lint.
 */

/**
 * @typedef {Object} FixOptions
 * @property {boolean | ((message: LintMessage) => boolean)} [fix] Determines
 *      whether fixes should be applied.
 */

/**
 * @typedef {Object} InternalOptions
 * @property {string | null} warnInlineConfig The config name what `noInlineConfig` setting came from. If `noInlineConfig` setting didn't exist, this is null. If this is a config name, then the linter warns directive comments.
 * @property {StringSeverity} reportUnusedDisableDirectives Severity to report unused disable directives, if not "off" (boolean values were normalized).
 * @property {StringSeverity} reportUnusedInlineConfigs Severity to report unused inline configs, if not "off".
 */

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Wraps the value in an Array if it isn't already one.
 * @template T
 * @param {T|T[]} value Value to be wrapped.
 * @returns {Array} The value as an array.
 */
function asArray(value) {
	return Array.isArray(value) ? value : [value];
}

/**
 * Determines the message for a redundant inline config, if any.
 * @param {Array} existingConfig The existing config array (normalized).
 * @param {Array} ruleOptions The merged rule options.
 * @param {Array} ruleOptionsInline The rule options from the comment.
 * @param {string} ruleId The rule ID.
 * @param {string} alreadyConfigured Human-readable description of existing config state.
 * @param {string} existingSeverity The existing severity string.
 * @returns {string|undefined} The message, or undefined if no problem.
 */
function getRedundantInlineConfigMessage(
	existingConfig,
	ruleOptions,
	ruleOptionsInline,
	ruleId,
	alreadyConfigured,
	existingSeverity,
) {
	const noOptions =
		(existingConfig.length === 1 && ruleOptions.length === 1) ||
		existingSeverity === "off";

	if (noOptions) {
		return `Unused inline config ('${ruleId}' ${alreadyConfigured}).`;
	}

	if (containsDifferentProperty(ruleOptions.slice(1), existingConfig.slice(1))) {
		return undefined;
	}

	return ruleOptionsInline.length === 1
		? `Unused inline config ('${ruleId}' ${alreadyConfigured}).`
		: `Unused inline config ('${ruleId}' ${alreadyConfigured} with the same options).`;
}

/**
 * Pushes a problem to inlineConfigProblems if ruleOptions are redundant.
 * @param {Config} config Provided config.
 * @param {Object} loc A line/column location
 * @param {FileReport} report Report that may be added to.
 * @param {string} ruleId The rule ID.
 * @param {Array} ruleOptions The rule options, merged with the config's.
 * @param {Array} ruleOptionsInline The rule options from the comment.
 * @param {"error"|"warn"} severity The severity to report.
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

	const message = getRedundantInlineConfigMessage(
		existingConfig,
		ruleOptions,
		ruleOptionsInline,
		ruleId,
		alreadyConfigured,
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
 * Builds a single disable directive entry from a source directive.
 * @param {Object} params
 * @param {string} params.type The directive type.
 * @param {Object} params.loc The location object from the source code.
 * @param {Object} params.parentDirective The parent directive reference.
 * @param {string|null} params.ruleId The rule ID.
 * @param {string} params.justification The justification text.
 * @param {Language} params.language The language for location adjustment.
 * @returns {Object} The directive entry.
 */
function buildDirectiveEntry({ type, loc, parentDirective, ruleId, justification, language }) {
	const locPoint = type === "disable-next-line" ? loc.end : loc.start;
	const { line, column } = updateLocationInformation(locPoint, language);

	return { parentDirective, type, line, column, ruleId, justification };
}

/**
 * Creates a collection of disable directives from a comment
 * @param {Object} options to create disable directives
 * @param {("disable"|"enable"|"disable-line"|"disable-next-line")} options.type The type of directive comment
 * @param {string} options.value The value after the directive in the comment
 * @param {string} options.justification The justification of the directive
 * @param {ASTNode|token} options.node The Comment node/token.
 * @param {function(string): {create: Function}} ruleMapper A map from rule IDs to defined rules
 * @param {Language} language The language to use to adjust the location information.
 * @param {SourceCode} sourceCode The SourceCode object to get comments from.
 * @param {FileReport} report The report to add problems to.
 * @returns {Object[]} Directives from the comment
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
		if (ruleId === null || !!ruleMapper(ruleId)) {
			directives.push(
				buildDirectiveEntry({ type, loc, parentDirective, ruleId, justification, language }),
			);
		} else {
			report.addError({ ruleId, loc });
		}
	}

	return directives;
}

/**
 * Parses comments in file to extract disable directives.
 * @param {SourceCode} sourceCode The SourceCode object to get comments from.
 * @param {function(string): {create: Function}} ruleMapper A map from rule IDs to defined rules
 * @param {Language} language The language to use to adjust the location information
 * @param {FileReport} report The report to add problems to.
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
 * @param {string} filename The filename to normalize.
 * @returns {string} The normalized filename.
 */
function normalizeFilename(filename) {
	const parts = filename.split(path.sep);
	const index = parts.lastIndexOf("<text>");

	return index === -1 ? filename : parts.slice(index).join(path.sep);
}

/**
 * Normalizes the reportUnusedDisableDirectives option from provided and config sources.
 * @param {VerifyOptions} providedOptions Options
 * @param {Object} linterOptions Linter options from config.
 * @returns {StringSeverity} Normalized severity string.
 */
function normalizeReportUnusedDisableDirectives(providedOptions, linterOptions) {
	let value = providedOptions.reportUnusedDisableDirectives;

	if (typeof value === "boolean") {
		return value ? "error" : "off";
	}

	if (typeof value === "string") {
		return value;
	}

	// Fall back to config-level setting
	const configValue = linterOptions.reportUnusedDisableDirectives;

	if (typeof configValue === "boolean") {
		return configValue ? "warn" : "off";
	}

	return configValue === void 0 ? "off" : normalizeSeverityToString(configValue);
}

/**
 * Normalizes the possible options for `linter.verify` and `linter.verifyAndFix` to a
 * consistent shape.
 * @param {VerifyOptions} providedOptions Options
 * @param {Config} config Config.
 * @returns {Required<VerifyOptions> & InternalOptions} Normalized options
 */
function normalizeVerifyOptions(providedOptions, config) {
	const linterOptions = config.linterOptions || config;
	const disableInlineConfig = linterOptions.noInlineConfig === true;
	const ignoreInlineConfig = providedOptions.allowInlineConfig === false;
	const configNameSuffix = config.configNameOfNoInlineConfig
		? ` (${config.configNameOfNoInlineConfig})`
		: "";

	const reportUnusedDisableDirectives = normalizeReportUnusedDisableDirectives(
		providedOptions,
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
 * Store time measurements in map
 * @param {number} time Time measurement
 * @param {Object} timeOpts Options relating which time was measured
 * @param {WeakMap<Linter, LinterInternalSlots>} slots Linter internal slots map
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
 * Get the options for a rule (not including severity), if any
 * @param {RuleConfig} ruleConfig rule configuration
 * @param {Object|undefined} defaultOptions rule.meta.defaultOptions
 * @returns {Array} of rule options, empty Array if none
 */
function getRuleOptions(ruleConfig, defaultOptions) {
	if (Array.isArray(ruleConfig)) {
		return deepMergeArrays(defaultOptions, ruleConfig.slice(1));
	}
	return defaultOptions ?? [];
}

/**
 * Analyze scope of the given AST.
 * @param {ASTNode} ast The `Program` node to analyze.
 * @param {JSLanguageOptions} languageOptions The language options.
 * @param {Record<string, string[]>} visitorKeys The visitor keys.
 * @returns {ScopeManager} The analysis result.
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
 * Runs a rule, and gets its listeners
 * @param {RuleDefinition} rule A rule object
 * @param {Context} ruleContext The context that should be passed to the rule
 * @throws {TypeError} If `rule` is not an object with a `create` method
 * @throws {any} Any error during the rule's `create`
 * @returns {Object} A map of selector listeners provided by the rule
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
 * Validates that a rule's report is consistent with its metadata.
 * @param {Object} problem The reported problem.
 * @param {RuleDefinition} rule The rule definition.
 * @param {string} ruleId The rule ID (for error messages).
 * @returns {void}
 * @throws {Error} If the rule metadata is inconsistent with the report.
 */
function validateRuleReport(problem, rule, ruleId) {
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
 * Creates a timed or direct call to createRuleListeners and extracts the result.
 * @param {string} ruleId The rule ID.
 * @param {RuleDefinition} rule The rule definition.
 * @param {Object} ruleContext The rule context.
 * @param {boolean} useStats Whether stats are being collected.
 * @param {WeakMap<Linter, LinterInternalSlots>} slots Linter internal slots.
 * @returns {Object} The rule listeners map.
 */
function invokeCreateRuleListeners(ruleId, rule, ruleContext, useStats, slots) {
	const useTiming = timing.enabled || useStats;

	if (!useTiming) {
		return createRuleListeners(rule, ruleContext);
	}

	const timedResult = timing.time(ruleId, createRuleListeners, useStats)(rule, ruleContext);
	const listeners = useStats ? timedResult.result : timedResult;

	if (useStats) {
		storeTime(timedResult.tdiff, { type: "rules", key: ruleId }, slots);
	}

	return listeners;
}

/**
 * Wraps a rule listener to include error handling and optional stats tracking.
 * @param {Function} ruleListener The original rule listener.
 * @param {string} ruleId The rule ID.
 * @param {boolean} useStats Whether stats are being collected.
 * @param {WeakMap<Linter, LinterInternalSlots>} slots Linter internal slots.
 * @returns {Function} The wrapped listener.
 */
function wrapRuleListener(ruleListener, ruleId, useStats, slots) {
	return function ruleErrorHandler(...listenerArgs) {
		try {
			const returnValue = ruleListener(...listenerArgs);
			const result = useStats ? returnValue.result : returnValue;

			if (useStats) {
				storeTime(returnValue.tdiff, { type: "rules", key: ruleId }, slots);
			}

			return result;
		} catch (e) {
			e.ruleId = ruleId;
			throw e;
		}
	};
}

/**
 * Runs the given rules on the given SourceCode object
 * @param {SourceCode} sourceCode A SourceCode object for the given text
 * @param {Object} configuredRules The rules configuration
 * @param {function(string): RuleDefinition} ruleMapper A mapper function from rule names to rules
 * @param {Language} language The language object used for parsing.
 * @param {LanguageOptions} languageOptions The options for parsing the code.
 * @param {Object} settings The settings that were enabled in the config
 * @param {string} filename The reported filename of the code
 * @param {boolean} applyDefaultOptions If true, apply rules' meta.defaultOptions in computing their config options.
 * @param {string | undefined} cwd cwd of the cli
 * @param {string} physicalFilename The full path of the file on disk without any code block information
 * @param {Function} ruleFilter A predicate function to filter which rules should be executed.
 * @param {boolean} stats If true, stats are collected appended to the result
 * @param {WeakMap<Linter, LinterInternalSlots>} slots InternalSlotsMap of linter
 * @param {FileReport} report The report to add problems to
 * @returns {FileReport} report The report with added problems
 * @throws {Error} If traversal into a node fails.
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

				validateRuleReport(problem, rule, ruleId);
			},
		});

		const ruleListeners = invokeCreateRuleListeners(ruleId, rule, ruleContext, stats, slots);

		if (ruleListeners == null) {
			throw new Error(
				`The create() function for rule '${ruleId}' did not return an object.`,
			);
		}

		const useTiming = timing.enabled || stats;

		for (const selector of Object.keys(ruleListeners)) {
			const rawListener = useTiming
				? timing.time(ruleId, ruleListeners[selector], stats)
				: ruleListeners[selector];

			visitor.add(selector, wrapRuleListener(rawListener, ruleId, stats, slots));
		}
	}

	const traverser = SourceCodeTraverser.getInstance(language);

	traverser.traverseSync(sourceCode, visitor, { steps });

	return report;
}

/**
 * Ensure the source code to be a string.
 * @param {string|SourceCode} textOrSourceCode The text or source code object.
 * @returns {string} The source code text.
 */
function ensureText(textOrSourceCode) {
	if (typeof textOrSourceCode === "object") {
		const { hasBOM, text } = textOrSourceCode;
		const bom = hasBOM ? "\uFEFF" : "";

		return bom + text;
	}

	return String(textOrSourceCode);
}

/**
 * Normalize the value of the cwd
 * @param {string | undefined} cwd raw value of the cwd, path to a directory that should be considered as the current working directory, can be undefined.
 * @returns {string | undefined} normalized cwd
 */
function normalizeCwd(cwd) {
	if (cwd) {
		return cwd;
	}
	if (typeof process === "object") {
		return process.cwd();
	}

	// eslint-disable-next-line no-undefined -- Consistently returning a value
	return undefined;
}

/**
 * Merges inline rule options with the existing config, handling the case where
 * only severity is provided inline (inheriting options from the base config).
 * @param {Array} ruleOptionsInline The raw inline rule options array.
 * @param {string} ruleId The rule ID.
 * @param {Config} config The base config.
 * @param {RuleDefinition} rule The rule definition.
 * @returns {{ ruleOptions: Array, shouldValidateOptions: boolean }}
 */
function mergeInlineRuleOptions(ruleOptionsInline, ruleId, config, rule) {
	const onlySeverityProvided =
		ruleOptionsInline.length === 1 && config.rules && Object.hasOwn(config.rules, ruleId);

	if (onlySeverityProvided) {
		const ruleOptions = [
			ruleOptionsInline[0],
			...config.rules[ruleId].slice(1),
		];
		// If the rule was already enabled, options were already validated
		const shouldValidateOptions = config.rules[ruleId][0] <= 0;

		return { ruleOptions, shouldValidateOptions };
	}

	// User provided options — apply defaults on top
	const slicedOptions = ruleOptionsInline.slice(1);
	const mergedOptions = deepMergeArrays(rule.meta?.defaultOptions, slicedOptions);
	const ruleOptions = mergedOptions.length
		? [ruleOptionsInline[0], ...mergedOptions]
		: ruleOptionsInline;

	return { ruleOptions, shouldValidateOptions: true };
}

/**
 * Formats an inline config validation error message.
 * @param {Error} err The caught error.
 * @param {*} ruleValue The raw rule value from the comment.
 * @returns {string} The formatted message.
 */
function formatInlineConfigError(err, ruleValue) {
	const startIndex = err.message.startsWith('Key "rules":')
		? err.message.indexOf(":", 12) + 1
		: err.message.indexOf(":") + 1;

	let baseMessage = err.message.slice(startIndex).trim();

	if (err.messageTemplate) {
		baseMessage += ` You passed "${ruleValue}".`;
	}

	return baseMessage;
}

/**
 * Processes a single inline rule config entry, validating and merging it.
 * @param {Object} params
 * @param {string} params.ruleId The rule ID.
 * @param {*} params.ruleValue The raw rule value from the comment.
 * @param {Object} params.loc The location of the comment.
 * @param {Config} params.config The base config.
 * @param {Object} params.mergedInlineConfig The accumulated inline config (mutated).
 * @param {Object} params.options The normalized verify options.
 * @param {FileReport} params.report The report to add problems to.
 * @returns {void}
 */
function processInlineRuleConfig({
	ruleId,
	ruleValue,
	loc,
	config,
	mergedInlineConfig,
	options,
	report,
}) {
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
			ruleId,
			config,
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

		report.addError({
			ruleId,
			message: `Inline configuration for rule "${ruleId}" is invalid:\n\t${formatInlineConfigError(err, ruleValue)}\n`,
			loc,
		});
	}
}

/**
 * Applies inline config from source code comments, mutating mergedInlineConfig.
 * @param {SourceCode} sourceCode The source code object.
 * @param {Config} config The base config.
 * @param {Object} options The normalized verify options.
 * @param {FileReport} report The report to add problems to.
 * @param {Object} mergedInlineConfig The accumulated inline config (mutated).
 * @returns {void}
 */
function applyInlineConfig(sourceCode, config, options, report, mergedInlineConfig) {
	const inlineConfigResult = sourceCode.applyInlineConfig?.();

	if (!inlineConfigResult) {
		return;
	}

	inlineConfigResult.problems.forEach(problem => report.addFatal(problem));

	for (const { config: inlineConfig, loc } of inlineConfigResult.configs) {
		for (const ruleId of Object.keys(inlineConfig.rules)) {
			processInlineRuleConfig({
				ruleId,
				ruleValue: inlineConfig.rules[ruleId],
				loc,
				config,
				mergedInlineConfig,
				options,
				report,
			});
		}
	}
}

/**
 * Handles inline config warnings when noInlineConfig is set.
 * @param {SourceCode} sourceCode The source code object.
 * @param {string} warnInlineConfig The config name for the warning message.
 * @param {FileReport} report The report to add problems to.
 * @returns {void}
 */
function warnAboutInlineConfigs(sourceCode, warnInlineConfig, report) {
	if (!sourceCode.getInlineConfigNodes) {
		return;
	}

	sourceCode.getInlineConfigNodes().forEach(node => {
		const loc = sourceCode.getLoc(node);
		const range = sourceCode.getRange(node);

		report.addWarning({
			message: `'${sourceCode.text.slice(range[0], range[1])}' has no effect because you have 'noInlineConfig' setting in ${warnInlineConfig}.`,
			loc,
		});
	});
}

/**
 * Processes inline config directives and returns the merged inline config.
 * @param {SourceCode} sourceCode The source code object.
 * @param {Config} config The base config.
 * @param {Object} options The normalized verify options.
 * @param {FileReport} report The report to add problems to.
 * @returns {{ rules: Object }} The merged inline config.
 */
function processInlineConfigs(sourceCode, config, options, report) {
	const mergedInlineConfig = { rules: {} };

	if (!options.allowInlineConfig) {
		return mergedInlineConfig;
	}

	if (options.warnInlineConfig) {
		warnAboutInlineConfigs(sourceCode, options.warnInlineConfig, report);
	} else {
		applyInlineConfig(sourceCode, config, options, report, mergedInlineConfig);
	}

	return mergedInlineConfig;
}

/**
 * Augments the error from a rule traversal with contextual information.
 * @param {Error} err The error to augment.
 * @param {SourceCode} sourceCode The source code object.
 * @param {Object} options The normalized verify options.
 * @param {Object} languageOptions The language options.
 * @param {Object} settings The settings.
 * @returns {never} Always throws.
 */
function rethrowTraversalError(err, sourceCode, options, languageOptions, settings) {
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
 * Object that is responsible for verifying JavaScript text
 * @name Linter
 */
class Linter {
	/**
	 * Initialize the Linter.
	 * @param {Object} [config] the config object
	 * @param {string} [config.cwd] path to a directory that should be considered as the current working directory, can be undefined.
	 * @param {Array<string>} [config.flags] the feature flags to enable.
	 * @param {"flat"} [config.configType="flat"] the type of config used. Retrained for backwards compatibility, will be removed in future.
	 * @param {WarningService} [config.warningService] The warning service to use.
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

		const processedFlags = this.#processFlags(flags, warningService);

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
	 * Processes and validates feature flags, returning the resolved flag list.
	 * @param {string[]} flags The raw flags array.
	 * @param {WarningService} warningService The warning service.
	 * @returns {string[]} The processed flags.
	 */
	#processFlags(flags, warningService) {
		const processedFlags = [];

		for (const flag of flags) {
			if (inactiveFlags.has(flag)) {
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
	 * Getter for package version.
	 * @static
	 * @returns {string} The version from package.json.
	 */
	static get version() {
		return pkg.version;
	}

	/**
	 * Indicates if the given feature flag is enabled for this instance.
	 * @param {string} flag The feature flag to check.
	 * @returns {boolean} `true` if the feature flag is enabled, `false` if not.
	 */
	hasFlag(flag) {
		return internalSlotsMap.get(this).flags.includes(flag);
	}

	/**
	 * Verifies the text against the rules specified by the second argument.
	 * @param {string|SourceCode} textOrSourceCode The text to parse or a SourceCode object.
	 * @param {ConfigObject|ConfigObject[]} config The ESLint config object or array to use.
	 * @param {(string|(VerifyOptions&ProcessorOptions))} [filenameOrOptions] The optional filename of the file being checked.
	 * @returns {LintMessage[]} The results as an array of messages or an empty array if no messages.
	 */
	verify(textOrSourceCode, config, filenameOrOptions) {
		debug("Verify");

		const { cwd } = internalSlotsMap.get(this);
		const options =
			typeof filenameOrOptions === "string"
				? { filename: filenameOrOptions }
				: filenameOrOptions || {};
		const configToUse = config ?? {};

		/*
		 * Because of how Webpack packages up the files, we can't
		 * compare directly to `FlatConfigArray` using `instanceof`
		 * because it's not the same `FlatConfigArray` as in the tests.
		 * So, we work around it by assuming an array is, in fact, a
		 * `FlatConfigArray` if it has a `getConfig()` method.
		 */
		let configArray = configToUse;

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
	 * @param {string|SourceCode} textOrSourceCode The source code.
	 * @param {Config} config The config array.
	 * @param {VerifyOptions&ProcessorOptions} options The options.
	 * @param {FlatConfigArray} [configForRecursive] The `ConfigArray` object to apply multiple processors recursively.
	 * @returns {(LintMessage|SuppressedLintMessage)[]} The found problems.
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
			this.#processCodeBlock(
				block,
				config,
				options,
				configForRecursive,
				text,
				originalExtname,
				slots,
				preprocess,
				postprocess,
				filterCodeBlock,
			),
		);

		return processorService.postprocessSync(file, messageLists, {
			processor: { preprocess, postprocess },
		});
	}

	/**
	 * Processes a single code block from a preprocessed file.
	 * @param {string|VFile} block The code block.
	 * @param {Config} config The config.
	 * @param {Object} options The verify options.
	 * @param {FlatConfigArray|undefined} configForRecursive Config for recursive processing.
	 * @param {string} originalText The original file text.
	 * @param {string} originalExtname The original file extension.
	 * @param {LinterInternalSlots} slots The linter internal slots.
	 * @param {Function} preprocess The preprocess function.
	 * @param {Function} postprocess The postprocess function.
	 * @param {Function} filterCodeBlock The code block filter.
	 * @returns {(LintMessage|SuppressedLintMessage)[]} The messages for this block.
	 */
	#processCodeBlock(
		block,
		config,
		options,
		configForRecursive,
		originalText,
		originalExtname,
		slots,
		preprocess,
		postprocess,
		filterCodeBlock,
	) {
		debug("A code block was found: %o", block.path || "(unnamed)");

		// Keep the legacy behavior.
		if (typeof block === "string") {
			return this._verifyWithFlatConfigArrayAndWithoutProcessors(block, config, options);
		}

		if (!filterCodeBlock(block.path, block.body)) {
			debug("This code block was skipped.");
			return [];
		}

		const contentOrExtensionChanged =
			originalText !== block.rawBody || path.extname(block.path) !== originalExtname;

		if (configForRecursive && contentOrExtensionChanged) {
			debug(
				"Resolving configuration again because the file content or extension was changed.",
			);
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
	 * Parses the file and returns the source code, or returns the cached source code.
	 * Handles the legacy scopeManager=null case for JS.
	 * @param {VFile} file The file to parse.
	 * @param {Config} config The config.
	 * @param {Object} options The normalized verify options.
	 * @param {LinterInternalSlots} slots The linter internal slots.
	 * @returns {{ ok: true, sourceCode: SourceCode } | { ok: false, errors: LintMessage[] }}
	 */
	#getOrParseSourceCode(file, config, options, slots) {
		if (!slots.lastSourceCode) {
			const parserService = new ParserService();
			let t;

			if (options.stats) {
				t = startTime();
			}

			const parseResult = parserService.parseSync(file, config);

			if (options.stats) {
				storeTime(endTime(t), { type: "parse" }, slots);
			}

			if (!parseResult.ok) {
				return { ok: false, errors: parseResult.errors };
			}

			slots.lastSourceCode = parseResult.sourceCode;
		} else if (slots.lastSourceCode.scopeManager === null) {
			/*
			 * If the given source code object as the first argument does not have scopeManager, analyze the scope.
			 * This is for backward compatibility (SourceCode is frozen so it cannot rebind).
			 *
			 * We check explicitly for `null` to ensure that this is a JS-flavored language.
			 * For non-JS languages we don't want to do this.
			 *
			 * TODO: Remove this check when we stop exporting the `SourceCode` object.
			 */
			const { languageOptions } = config;

			slots.lastSourceCode = new SourceCode({
				text: slots.lastSourceCode.text,
				ast: slots.lastSourceCode.ast,
				hasBOM: slots.lastSourceCode.hasBOM,
				parserServices: slots.lastSourceCode.parserServices,
				visitorKeys: slots.lastSourceCode.visitorKeys,
				scopeManager: analyzeScope(slots.lastSourceCode.ast, languageOptions),
			});
		}

		return { ok: true, sourceCode: slots.lastSourceCode };
	}

	/**
	 * Verify using flat config and without any processors.
	 * @param {VFile} file The file to lint.
	 * @param {Config} providedConfig An ESLintConfig instance to configure everything.
	 * @param {VerifyOptions} [providedOptions] The optional filename of the file being checked.
	 * @throws {Error} If during rule execution.
	 * @returns {(LintMessage|SuppressedLintMessage)[]} The results as an array of messages or an empty array if no messages.
	 */
	#flatVerifyWithoutProcessors(file, providedConfig, providedOptions) {
		const slots = internalSlotsMap.get(this);
		const config = providedConfig || {};
		const { settings = {}, languageOptions } = config;
		const options = normalizeVerifyOptions(providedOptions, config);

		const sourceCodeResult = this.#getOrParseSourceCode(file, config, options, slots);

		if (!sourceCodeResult.ok) {
			return sourceCodeResult.errors;
		}

		const sourceCode = sourceCodeResult.sourceCode;
		const report = new FileReport({
			ruleMapper: ruleId => config.getRuleDefinition(ruleId),
			language: config.language,
			sourceCode,
			disableFixes: options.disableFixes,
		});

		sourceCode.applyLanguageOptions?.(languageOptions);

		const mergedInlineConfig = processInlineConfigs(sourceCode, config, options, report);

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
			rethrowTraversalError(err, sourceCode, options, languageOptions, settings);
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
	 * @param {string|SourceCode} textOrSourceCode The text to parse or a SourceCode object.
	 * @param {Config} providedConfig An ESLintConfig instance to configure everything.
	 * @param {VerifyOptions} [providedOptions] The optional filename of the file being checked.
	 * @throws {Error} If during rule execution.
	 * @returns {(LintMessage|SuppressedLintMessage)[]} The results as an array of messages or an empty array if no messages.
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
	 * @param {string|SourceCode} textOrSourceCode The source code.
	 * @param {FlatConfigArray} configArray The config array.
	 * @param {VerifyOptions&ProcessorOptions} options The options.
	 * @param {boolean} firstCall Indicates if this is the first call in `verify()`
	 *   to determine processor behavior.
	 * @returns {(LintMessage|SuppressedLintMessage)[]} The found problems.
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
	 * Given a list of reported problems, distinguish problems between normal messages and suppressed messages.
	 * @param {Array<LintMessage|SuppressedLintMessage>} problems A list of reported problems.
	 * @returns {LintMessage[]} A list of LintMessage.
	 */
	_distinguishSuppressedMessages(problems) {
		const messages = [];
		const suppressedMessages = [];
		const slots = internalSlotsMap.get(this);

		for (const problem of problems) {
			if (problem.suppressions) {
				suppressedMessages.push(problem);
			} else {
				messages.push(problem);
			}
		}

		slots.lastSuppressedMessages = suppressedMessages;

		return messages;
	}

	/**
	 * Gets the SourceCode object representing the parsed source.
	 * @returns {SourceCode} The SourceCode object.
	 */
	getSourceCode() {
		return internalSlotsMap.get(this).lastSourceCode;
	}

	/**
	 * Gets the times spent on (parsing, fixing, linting) a file.
	 * @returns {{ passes: TimePass[]; }} The times.
	 */
	getTimes() {
		return internalSlotsMap.get(this).times ?? { passes: [] };
	}

	/**
	 * Gets the number of autofix passes that were made in the last run.
	 * @returns {number} The number of autofix passes.
	 */
	getFixPassCount() {
		return internalSlotsMap.get(this).fixPasses ?? 0;
	}

	/**
	 * Gets the list of SuppressedLintMessage produced in the last running.
	 * @returns {SuppressedLintMessage[]} The list of SuppressedLintMessage
	 */
	getSuppressedMessages() {
		return internalSlotsMap.get(this).lastSuppressedMessages;
	}

	/**
	 * Performs a single autofix pass and records timing stats.
	 * @param {string} currentText The current source text.
	 * @param {LintMessage[]} messages The lint messages from the current pass.
	 * @param {boolean|Function} shouldFix Whether/how to apply fixes.
	 * @param {boolean} stats Whether stats are being collected.
	 * @param {LinterInternalSlots} slots The linter internal slots.
	 * @returns {{ fixedResult: Object }} The fix result.
	 */
	#applyFixPass(currentText, messages, shouldFix, stats, slots) {
		let t;

		if (stats) {
			t = startTime();
		}

		const fixedResult = SourceCodeFixer.applyFixes(currentText, messages, shouldFix);

		if (stats) {
			if (fixedResult.fixed) {
				storeTime(endTime(t), { type: "fix" }, slots);
				slots.fixPasses++;
			} else {
				storeTime(0, { type: "fix" }, slots);
			}
		}

		return fixedResult;
	}

	/**
	 * Performs multiple autofix passes over the text until as many fixes as possible
	 * have been applied.
	 * @param {string} text The source text to apply fixes to.
	 * @param {ConfigObject|ConfigObject[]} config The ESLint config object or array to use.
	 * @param {string|(VerifyOptions&ProcessorOptions&FixOptions)} [filenameOrOptions] The filename or ESLint options object to use.
	 * @returns {{fixed:boolean,messages:LintMessage[],output:string}} The result of the fix operation as returned from the
	 *      SourceCodeFixer.
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

		let fixed = false;
		let passNumber = 0;
		let currentText = text;
		let previousText;
		let secondPreviousText;
		let messages;
		let fixedResult;

		/**
		 * This loop continues until one of the following is true:
		 *
		 * 1. No more fixes have been applied.
		 * 2. Ten passes have been made.
		 *
		 * That means anytime a fix is successfully applied, there will be another pass.
		 * Essentially, guaranteeing a minimum of two passes.
		 */
		do {
			passNumber++;
			let tTotal;

			if (stats) {
				tTotal = startTime();
			}

			debug(`Linting code for ${debugTextDescription} (pass ${passNumber})`);
			messages = this.verify(currentText, config, options);

			debug(`Generating fixed text for ${debugTextDescription} (pass ${passNumber})`);
			fixedResult = this.#applyFixPass(currentText, messages, shouldFix, stats, slots);

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

			if (
				passNumber > 1 &&
				currentText.length === secondPreviousText.length &&
				currentText === secondPreviousText
			) {
				debug(`Circular fixes detected after pass ${passNumber}. Exiting fix loop.`);
				slots.warningService.emitCircularFixesWarning(options.filename ?? "text");
				break;
			}
		} while (fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES);

		/*
		 * If the last result had fixes, we need to lint again to be sure we have
		 * the most up-to-date information.
		 */
		if (fixedResult.fixed) {
			let tTotal;

			if (stats) {
				tTotal = startTime();
			}

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
}

module.exports = {
	Linter,
};
```

## Summary of Changes

### Extracted Helper Functions
| New Function | Extracted From | Purpose |
|---|---|---|
| `getRedundantInlineConfigMessage()` | `addProblemIfSameSeverityAndOptions()` | Isolates message-building logic from side-effect logic |
| `buildDirectiveEntry()` | `createDisableDirectives()` | Eliminates duplicated if/else branches for `disable-next-line` |
| `normalizeReportUnusedDisableDirectives()` | `normalizeVerifyOptions()` | Flattens 3-level nested conditionals into a single function |
| `validateRuleReport()` | `runRules()` inline closure | Separates metadata validation from rule execution |
| `invokeCreateRuleListeners()` | `runRules()` | Encapsulates timed/untimed listener creation |
| `wrapRuleListener()` | `runRules()` inner `addRuleErrorHandler()` | Named, reusable wrapper replacing anonymous inner function |
| `mergeInlineRuleOptions()` | `#flatVerifyWithoutProcessors()` | Extracts complex option-merging logic |
| `formatInlineConfigError()` | `#flatVerifyWithoutProcessors()` | Isolates error message formatting |
| `processInlineRuleConfig()` | `#flatVerifyWithoutProcessors()` | Single rule inline config processing |
| `applyInlineConfig()` | `#flatVerifyWithoutProcessors()` | Iterates inline config results |
| `warnAboutInlineConfigs()` | `#flatVerifyWithoutProcessors()` | Handles the `warnInlineConfig` branch |
| `processInlineConfigs()` | `#flatVerifyWithoutProcessors()` | Top-level inline config orchestration |
| `rethrowTraversalError()` | `#flatVerifyWithoutProcessors()` | Centralizes error augmentation logic |

### Promoted to Private Class Methods
- **`#processFlags()`** — extracted from constructor, converts `forEach` to `for...of` with `continue`
- **`#getOrParseSourceCode()`** — extracted from `#flatVerifyWithoutProcessors()`, handles parse/cache/scopeManager logic
- **`#processCodeBlock()`** — extracted from `_verifyWithFlatConfigArrayAndProcessor()`, handles single block processing
- **`#applyFixPass()`** — extracted from `verifyAndFix()`, handles fix application with stats

### Other Improvements
- `forEach` → `for...of` with `continue` in `runRules()` for clearer early-exit flow
- `getDirectiveCommentsForFlatConfig` uses `flatMap` instead of push-spread pattern
- Removed redundant comment block in `runRules()` about shared context (self-evident from `FileContext`)
- `verifyAndFix` variable declarations separated for clarity