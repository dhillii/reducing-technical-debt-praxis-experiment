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
 * Determines if severity values match between existing and inline config.
 * @param {string} existingSeverity The existing severity level.
 * @param {string} inlineSeverity The inline severity level.
 * @returns {boolean} True if severities match.
 */
function severitiesMatch(existingSeverity, inlineSeverity) {
	return existingSeverity === inlineSeverity;
}

/**
 * Builds the message for redundant inline config.
 * @param {string} ruleId The rule ID.
 * @param {string} alreadyConfigured Description of existing config.
 * @param {Array} existingConfig The existing config array.
 * @param {Array} ruleOptions The merged rule options.
 * @param {Array} ruleOptionsInline The inline rule options.
 * @returns {string|null} The message or null if not redundant.
 */
function buildRedundantConfigMessage(
	ruleId,
	alreadyConfigured,
	existingConfig,
	ruleOptions,
	ruleOptionsInline,
) {
	if (
		(existingConfig.length === 1 && ruleOptions.length === 1) ||
		alreadyConfigured.includes("off")
	) {
		return `Unused inline config ('${ruleId}' ${alreadyConfigured}).`;
	}

	if (
		!containsDifferentProperty(
			ruleOptions.slice(1),
			existingConfig.slice(1),
		)
	) {
		return ruleOptionsInline.length === 1
			? `Unused inline config ('${ruleId}' ${alreadyConfigured}).`
			: `Unused inline config ('${ruleId}' ${alreadyConfigured} with the same options).`;
	}

	return null;
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
	const existingConfig = existingConfigRaw
		? asArray(existingConfigRaw)
		: ["off"];
	const existingSeverity = normalizeSeverityToString(existingConfig[0]);
	const inlineSeverity = normalizeSeverityToString(ruleOptions[0]);

	if (!severitiesMatch(existingSeverity, inlineSeverity)) {
		return;
	}

	const alreadyConfigured = existingConfigRaw
		? `is already configured to '${existingSeverity}'`
		: "is not enabled so can't be turned off";

	const message = buildRedundantConfigMessage(
		ruleId,
		alreadyConfigured,
		existingConfig,
		ruleOptions,
		ruleOptionsInline,
	);

	if (message) {
		const numericSeverity = normalizeSeverityToNumber(severity);
		const descriptor = {
			message,
			loc,
		};

		if (numericSeverity === 1) {
			report.addWarning(descriptor);
		} else if (numericSeverity === 2) {
			report.addError(descriptor);
		}
	}
}

/**
 * Calculates the location for a disable directive.
 * @param {Object} loc The location object from the source code.
 * @param {string} type The directive type.
 * @param {Language} language The language object.
 * @returns {Object} The adjusted location with line and column.
 */
function calculateDirectiveLocation(loc, type, language) {
	const targetLoc = type === "disable-next-line" ? loc.end : loc.start;
	return updateLocationInformation(targetLoc, language);
}

/**
 * Creates a single disable directive for a rule.
 * @param {string} ruleId The rule ID or null.
 * @param {string} type The directive type.
 * @param {Object} location The location object.
 * @param {string} justification The justification text.
 * @param {Object} parentDirective The parent directive object.
 * @returns {Object} The directive object.
 */
function createSingleDirective(
	ruleId,
	type,
	location,
	justification,
	parentDirective,
) {
	return {
		parentDirective,
		type,
		line: location.line,
		column: location.column,
		ruleId,
		justification,
	};
}

/**
 * Creates a collection of disable directives from a comment
 * @param {Object} options to create disable directives
 * @param {("disable"|"enable"|"disable-line"|"disable-next-line")} options.type The type of directive comment
 * @param {string} options.value The value after the directive in the comment
 * comment specified no specific rules, so it applies to all rules (e.g. `eslint-disable`)
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
	const loc = sourceCode.getLoc(node);
	const parentDirective = { node, value, ruleIds };

	for (const ruleId of directiveRules) {
		// push to directives, if the rule is defined(including null, e.g. /*eslint enable*/)
		if (ruleId === null || !!ruleMapper(ruleId)) {
			const location = calculateDirectiveLocation(loc, type, language);
			const directive = createSingleDirective(
				ruleId,
				type,
				location,
				justification,
				parentDirective,
			);
			directives.push(directive);
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
 * A collection of the directive comments that were found, along with any problems that occurred when parsing
 */
function getDirectiveCommentsForFlatConfig(
	sourceCode,
	ruleMapper,
	language,
	report,
) {
	const disableDirectives = [];

	if (sourceCode.getDisableDirectives) {
		const { directives: directivesSources, problems: directivesProblems } =
			sourceCode.getDisableDirectives();

		if (Array.isArray(directivesProblems)) {
			directivesProblems.forEach(problem => report.addError(problem));
		}

		directivesSources.forEach(directive => {
			const directives = createDisableDirectives(
				directive,
				ruleMapper,
				language,
				sourceCode,
				report,
			);

			disableDirectives.push(...directives);
		});
	}

	return disableDirectives;
}

/**
 * Convert "/path/to/<text>" to "<text>".
 * `CLIEngine#executeOnText()` method gives "/path/to/<text>" if the filename
 * was omitted because `configArray.extractConfig()` requires an absolute path.
 * But the linter should pass `<text>` to `RuleContext#filename` in that
 * case.
 * Also, code blocks can have their virtual filename. If the parent filename was
 * `<text>`, the virtual filename is `<text>/0_foo.js` or something like (i.e.,
 * it's not an absolute path).
 * @param {string} filename The filename to normalize.
 * @returns {string} The normalized filename.
 */
function normalizeFilename(filename) {
	const parts = filename.split(path.sep);
	const index = parts.lastIndexOf("<text>");

	return index === -1 ? filename : parts.slice(index).join(path.sep);
}

/**
 * Normalizes the reportUnusedDisableDirectives option.
 * @param {boolean|string|undefined} reportUnusedDisableDirectives The raw option value.
 * @param {Object} linterOptions The linter options object.
 * @returns {StringSeverity} The normalized severity string.
 */
function normalizeReportUnusedDisableDirectives(
	reportUnusedDisableDirectives,
	linterOptions,
) {
	if (typeof reportUnusedDisableDirectives === "boolean") {
		return reportUnusedDisableDirectives ? "error" : "off";
	}

	if (typeof reportUnusedDisableDirectives === "string") {
		return reportUnusedDisableDirectives;
	}

	if (typeof linterOptions.reportUnusedDisableDirectives === "boolean") {
		return linterOptions.reportUnusedDisableDirectives ? "warn" : "off";
	}

	return linterOptions.reportUnusedDisableDirectives === void 0
		? "off"
		: normalizeSeverityToString(
				linterOptions.reportUnusedDisableDirectives,
			);
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
	const configNameOfNoInlineConfig = config.configNameOfNoInlineConfig
		? ` (${config.configNameOfNoInlineConfig})`
		: "";

	const reportUnusedDisableDirectives =
		normalizeReportUnusedDisableDirectives(
			providedOptions.reportUnusedDisableDirectives,
			linterOptions,
		);

	const reportUnusedInlineConfigs =
		linterOptions.reportUnusedInlineConfigs === void 0
			? "off"
			: normalizeSeverityToString(
					linterOptions.reportUnusedInlineConfigs,
				);

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
	if (
		!rule ||
		typeof rule !== "object" ||
		typeof rule.create !== "function"
	) {
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
 * Validates that a rule listener returned an object.
 * @param {string} ruleId The rule ID.
 * @param {any} ruleListeners The listeners object.
 * @throws {Error} If listeners is not an object.
 * @returns {void}
 */
function validateRuleListeners(ruleId, ruleListeners) {
	if (typeof ruleListeners === "undefined" || ruleListeners === null) {
		throw new Error(
			`The create() function for rule '${ruleId}' did not return an object.`,
		);
	}
}

/**
 * Creates an error handler wrapper for a rule listener.
 * @param {Function} ruleListener The rule listener function.
 * @param {string} ruleId The rule ID.
 * @param {boolean} stats Whether stats are enabled.
 * @param {WeakMap<Linter, LinterInternalSlots>} slots Internal slots.
 * @returns {Function} The wrapped listener function.
 */
function createRuleListenerErrorHandler(ruleListener, ruleId, stats, slots) {
	return function ruleErrorHandler(...listenerArgs) {
		try {
			const ruleListenerReturn = ruleListener(...listenerArgs);
			const ruleListenerResult = stats
				? ruleListenerReturn.result
				: ruleListenerReturn;

			if (stats) {
				storeTime(
					ruleListenerReturn.tdiff,
					{ type: "rules", key: ruleId },
					slots,
				);
			}

			return ruleListenerResult;
		} catch (e) {
			e.ruleId = ruleId;
			throw e;
		}
	};
}

/**
 * Adds rule listeners to the visitor.
 * @param {SourceCodeVisitor} visitor The visitor object.
 * @param {Object} ruleListeners The rule listeners map.
 * @param {string} ruleId The rule ID.
 * @param {boolean} stats Whether stats are enabled.
 * @param {WeakMap<Linter, LinterInternalSlots>} slots Internal slots.
 * @returns {void}
 */
function addRuleListenersToVisitor(
	visitor,
	ruleListeners,
	ruleId,
	stats,
	slots,
) {
	Object.keys(ruleListeners).forEach(selector => {
		const ruleListener =
			timing.enabled || stats
				? timing.time(ruleId, ruleListeners[selector], stats)
				: ruleListeners[selector];

		const errorHandler = createRuleListenerErrorHandler(
			ruleListener,
			ruleId,
			stats,
			slots,
		);
		visitor.add(selector, errorHandler);
	});
}

/**
 * Processes a single configured rule.
 * @param {string} ruleId The rule ID.
 * @param {RuleConfig} ruleConfig The rule configuration.
 * @param {function(string): RuleDefinition} ruleMapper The rule mapper function.
 * @param {FileContext} fileContext The file context.
 * @param {SourceCodeVisitor} visitor The visitor object.
 * @param {FileReport} report The report object.
 * @param {boolean} stats Whether stats are enabled.
 * @param {WeakMap<Linter, LinterInternalSlots>} slots Internal slots.
 * @param {Function} ruleFilter The rule filter function.
 * @returns {void}
 */
function processConfiguredRule(
	ruleId,
	ruleConfig,
	ruleMapper,
	fileContext,
	visitor,
	report,
	stats,
	slots,
	ruleFilter,
) {
	const severity = Config.getRuleNumericSeverity(ruleConfig);

	// not load disabled rules
	if (severity === 0) {
		return;
	}

	if (ruleFilter && !ruleFilter({ ruleId, severity })) {
		return;
	}

	const rule = ruleMapper(ruleId);

	if (!rule) {
		report.addError({ ruleId });
		return;
	}

	const ruleContext = fileContext.extend({
		id: ruleId,
		options: getRuleOptions(
			ruleConfig,
			rule.meta?.defaultOptions,
		),
		report(...args) {
			const problem = report.addRuleMessage(
				ruleId,
				severity,
				...args,
			);

			if (problem.fix && !(rule.meta && rule.meta.fixable)) {
				throw new Error(
					'Fixable rules must set the `meta.fixable` property to "code" or "whitespace".',
				);
			}

			if (
				problem.suggestions &&
				!(rule.meta && rule.meta.hasSuggestions === true)
			) {
				if (
					rule.meta &&
					rule.meta.docs &&
					typeof rule.meta.docs.suggestion !== "undefined"
				) {
					// Encourage migration from the former property name.
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

	const ruleListenersReturn =
		timing.enabled || stats
			? timing.time(
					ruleId,
					createRuleListeners,
					stats,
				)(rule, ruleContext)
			: createRuleListeners(rule, ruleContext);

	const ruleListeners = stats
		? ruleListenersReturn.result
		: ruleListenersReturn;

	if (stats) {
		storeTime(
			ruleListenersReturn.tdiff,
			{ type: "rules", key: ruleId },
			slots,
		);
	}

	validateRuleListeners(ruleId, ruleListeners);
	addRuleListenersToVisitor(visitor, ruleListeners, ruleId, stats, slots);
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

	/*
	 * Create a frozen object with the ruleContext properties and methods that are shared by all rules.
	 * All rule contexts will inherit from this object. This avoids the performance penalty of copying all the
	 * properties once for each rule.
	 */
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
		processConfiguredRule(
			ruleId,
			configuredRules[ruleId],
			ruleMapper,
			fileContext,
			visitor,
			report,
			stats,
			slots,
			ruleFilter,
		);
	});

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

	// It's more explicit to assign the undefined
	// eslint-disable-next-line no-undefined -- Consistently returning a value
	return undefined;
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
		const processedFlags = [];

		if (configType !== "flat") {
			throw new TypeError(
				`The 'configType' option value must be 'flat'. The value '${configType}' is not supported.`,
			);
		}

		flags.forEach(flag => {
			if (inactiveFlags.has(flag)) {
				const inactiveFlagData = inactiveFlags.get(flag);
				const inactivityReason =
					getInactivityReasonMessage(inactiveFlagData);
				const message = `The flag '${flag}' is inactive: ${inactivityReason}`;

				if (typeof inactiveFlagData.replacedBy === "undefined") {
					throw new Error(message);
				}

				// if there's a replacement, enable it instead of original
				if (typeof inactiveFlagData.replacedBy === "string") {
					processedFlags.push(inactiveFlagData.replacedBy);
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
	 *      If this is not set, the filename will default to '<input>' in the rule context. If
	 *      an object, then it has "filename", "allowInlineConfig", and some properties.
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

		if (
			!Array.isArray(configToUse) ||
			typeof configToUse.getConfig !== "function"
		) {
			configArray = new FlatConfigArray(configToUse, {
				basePath: cwd,
			});
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
		const file = new VFile(filenameToExpose, text, {
			physicalPath: physicalFilename,
		});

		const preprocess = options.preprocess || (rawText => [rawText]);
		const postprocess =
			options.postprocess || (messagesList => messagesList.flat());

		const processorService = new ProcessorService();
		const preprocessResult = processorService.preprocessSync(file, {
			processor: {
				preprocess,
				postprocess,
			},
		});

		if (!preprocessResult.ok) {
			return preprocessResult.errors;
		}

		const filterCodeBlock =
			options.filterCodeBlock ||
			(blockFilename => blockFilename.endsWith(".js"));
		const originalExtname = path.extname(filename);
		const { files } = preprocessResult;

		const messageLists = files.map(block => {
			debug("A code block was found: %o", block.path || "(unnamed)");

			// Keep the legacy behavior.
			if (typeof block === "string") {
				return this._verifyWithFlatConfigArrayAndWithoutProcessors(
					block,
					config,
					options,
				);
			}

			// Skip this block if filtered.
			if (!filterCodeBlock(block.path, block.body)) {
				debug("This code block was skipped.");
				return [];
			}

			// Resolve configuration again if the file content or extension was changed.
			if (
				configForRecursive &&
				(text !== block.rawBody ||
					path.extname(block.path) !== originalExtname)
			) {
				debug(
					"Resolving configuration again because the file content or extension was changed.",
				);
				return this._verifyWithFlatConfigArray(
					block.rawBody,
					configForRecursive,
					{
						...options,
						filename: block.path,
						physicalFilename: block.physicalPath,
					},
				);
			}

			slots.lastSourceCode = null;

			// Does lint.
			return this.#flatVerifyWithoutProcessors(block, config, {
				...options,
				filename: block.path,
				physicalFilename: block.physicalPath,
			});
		});

		return processorService.postprocessSync(file, messageLists, {
			processor: {
				preprocess,
				postprocess,
			},
		});
	}

	/**
	 * Parses the source code and returns the SourceCode object.
	 * @param {VFile} file The file to parse.
	 * @param {Config} config The config object.
	 * @param {VerifyOptions} options The verify options.
	 * @returns {Object} Object with ok flag and either sourceCode or errors.
	 */
	#parseSourceCode(file, config, options) {
		let t;

		if (options.stats) {
			t = startTime();
		}

		const parserService = new ParserService();
		const parseResult = parserService.parseSync(file, config);

		if (options.stats) {
			const time = endTime(t);
			storeTime(time, { type: "parse" }, internalSlotsMap.get(this));
		}

		return parseResult;
	}

	/**
	 * Ensures the SourceCode has a scope manager.
	 * @param {SourceCode} sourceCode The source code object.
	 * @param {LanguageOptions} languageOptions The language options.
	 * @returns {SourceCode} The source code with scope manager.
	 */
	#ensureSourceCodeHasScopeManager(sourceCode, languageOptions) {
		if (sourceCode.scopeManager === null) {
			return new SourceCode({
				text: sourceCode.text,
				ast: sourceCode.ast,
				hasBOM: sourceCode.hasBOM,
				parserServices: sourceCode.parserServices,
				visitorKeys: sourceCode.visitorKeys,
				scopeManager: analyzeScope(
					sourceCode.ast,
					languageOptions,
				),
			});
		}
		return sourceCode;
	}

	/**
	 * Processes inline configuration from the source code.
	 * @param {SourceCode} sourceCode The source code object.
	 * @param {Config} config The config object.
	 * @param {VerifyOptions} options The verify options.
	 * @param {FileReport} report The report object.
	 * @returns {Object} Object with merged inline config and any problems.
	 */
	#processInlineConfig(sourceCode, config, options, report) {
		const mergedInlineConfig = { rules: {} };

		if (!options.allowInlineConfig) {
			return mergedInlineConfig;
		}

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
			return mergedInlineConfig;
		}

		const inlineConfigResult = sourceCode.applyInlineConfig?.();

		if (!inlineConfigResult) {
			return mergedInlineConfig;
		}

		inlineConfigResult.problems.forEach(problem => {
			report.addFatal(problem);
		});

		for (const { config: inlineConfig, loc } of inlineConfigResult.configs) {
			this.#processInlineConfigRules(
				inlineConfig,
				config,
				loc,
				report,
				mergedInlineConfig,
				options,
			);
		}

		return mergedInlineConfig;
	}

	/**
	 * Processes rules from inline configuration.
	 * @param {Object} inlineConfig The inline config object.
	 * @param {Config} config The base config object.
	 * @param {Object} loc The location object.
	 * @param {FileReport} report The report object.
	 * @param {Object} mergedInlineConfig The merged inline config accumulator.
	 * @param {VerifyOptions} options The verify options.
	 * @returns {void}
	 */
	#processInlineConfigRules(
		inlineConfig,
		config,
		loc,
		report,
		mergedInlineConfig,
		options,
	) {
		Object.keys(inlineConfig.rules).forEach(ruleId => {
			const rule = config.getRuleDefinition(ruleId);
			const ruleValue = inlineConfig.rules[ruleId];

			if (!rule) {
				report.addError({
					ruleId,
					loc,
				});
				return;
			}

			if (Object.hasOwn(mergedInlineConfig.rules, ruleId)) {
				report.addError({
					message: `Rule "${ruleId}" is already configured by another configuration comment in the preceding code. This configuration is ignored.`,
					loc,
				});
				return;
			}

			this.#validateAndMergeInlineRule(
				ruleId,
				ruleValue,
				config,
				loc,
				report,
				mergedInlineConfig,
				options,
			);
		});
	}

	/**
	 * Validates and merges an inline rule configuration.
	 * @param {string} ruleId The rule ID.
	 * @param {any} ruleValue The rule value from inline config.
	 * @param {Config} config The base config object.
	 * @param {Object} loc The location object.
	 * @param {FileReport} report The report object.
	 * @param {Object} mergedInlineConfig The merged inline config accumulator.
	 * @param {VerifyOptions} options The verify options.
	 * @returns {void}
	 */
	#validateAndMergeInlineRule(
		ruleId,
		ruleValue,
		config,
		loc,
		report,
		mergedInlineConfig,
		options,
	) {
		try {
			const ruleOptionsInline = asArray(ruleValue);
			let ruleOptions = ruleOptionsInline;

			assertIsRuleSeverity(ruleId, ruleOptions[0]);

			let shouldValidateOptions = true;

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
					shouldValidateOptions = false;
				}
			} else {
				const rule = config.getRuleDefinition(ruleId);
				const slicedOptions = ruleOptions.slice(1);
				const mergedOptions = deepMergeArrays(
					rule.meta?.defaultOptions,
					slicedOptions,
				);

				if (mergedOptions.length) {
					ruleOptions = [ruleOptions[0], ...mergedOptions];
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

			if (shouldValidateOptions) {
				config.validateRulesConfig({
					[ruleId]: ruleOptions,
				});
			}

			mergedInlineConfig.rules[ruleId] = ruleOptions;
		} catch (err) {
			this.#handleInlineRuleValidationError(
				err,
				ruleId,
				ruleValue,
				loc,
				report,
			);
		}
	}

	/**
	 * Handles validation errors for inline rules.
	 * @param {Error} err The error object.
	 * @param {string} ruleId The rule ID.
	 * @param {any} ruleValue The rule value.
	 * @param {Object} loc The location object.
	 * @param {FileReport} report The report object.
	 * @returns {void}
	 */
	#handleInlineRuleValidationError(err, ruleId, ruleValue, loc, report) {
		if (err.code === "ESLINT_INVALID_RULE_OPTIONS_SCHEMA") {
			throw err;
		}

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

		report.addError({
			ruleId,
			message: `Inline configuration for rule "${ruleId}" is invalid:\n\t${baseMessage}\n`,
			loc,
		});
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

		if (!slots.lastSourceCode) {
			const parseResult = this.#parseSourceCode(file, config, options);

			if (!parseResult.ok) {
				return parseResult.errors;
			}

			slots.lastSourceCode = parseResult.sourceCode;
		} else {
			if (slots.lastSourceCode.scopeManager === null) {
				slots.lastSourceCode =
					this.#ensureSourceCodeHasScopeManager(
						slots.lastSourceCode,
						languageOptions,
					);
			}
		}

		const sourceCode = slots.lastSourceCode;
		const report = new FileReport({
			ruleMapper: ruleId => config.getRuleDefinition(ruleId),
			language: config.language,
			sourceCode,
			disableFixes: options.disableFixes,
		});

		sourceCode.applyLanguageOptions?.(languageOptions);

		const mergedInlineConfig = this.#processInlineConfig(
			sourceCode,
			config,
			options,
			report,
		);

		const commentDirectives =
			options.allowInlineConfig && !options.warnInlineConfig
				? getDirectiveCommentsForFlatConfig(
						sourceCode,
						ruleId => config.getRuleDefinition(ruleId),
						config.language,
						report,
					)
				: [];

		const configuredRules = Object.assign(
			{},
			config.rules,
			mergedInlineConfig.rules,
		);

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
				(problemA, problemB) =>
					problemA.line - problemB.line ||
					problemA.column - problemB.column,
			),
			reportUnusedDisableDirectives:
				options.reportUnusedDisableDirectives,
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
		const filename = normalizeFilename(
			providedOptions.filename || "<input>",
		);
		let text;

		// evaluate arguments
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

		return this.#flatVerifyWithoutProcessors(
			file,
			providedConfig,
			providedOptions,
		);
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

		// we need a filename to match configs against
		const filename = options.filename || "__placeholder__.js";

		// Store the config array in order to get plugin envs and rules later.
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

		// Verify.
		if (config.processor) {
			debug("Apply the processor: %o", config.processor);
			const { preprocess, postprocess, supportsAutofix } =
				config.processor;
			const disableFixes = options.disableFixes || !supportsAutofix;

			return this._verifyWithFlatConfigArrayAndProcessor(
				textOrSourceCode,
				config,
				{ ...options, filename, disableFixes, postprocess, preprocess },
				configArray,
			);
		}

		// check for options-based processing
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
	 * The normal messages will be returned and the suppressed messages will be stored as lastSuppressedMessages.
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
	 * Performs a single autofix pass.
	 * @param {string} currentText The current text.
	 * @param {ConfigObject|ConfigObject[]} config The config.
	 * @param {Object} options The options.
	 * @param {boolean} shouldFix Whether to apply fixes.
	 * @param {WeakMap<Linter, LinterInternalSlots>} slots The internal slots.
	 * @returns {Object} The fixed result.
	 */
	#performFixPass(currentText, config, options, shouldFix, slots) {
		const messages = this.verify(currentText, config, options);
		const fixedResult = SourceCodeFixer.applyFixes(
			currentText,
			messages,
			shouldFix,
		);

		return { messages, fixedResult };
	}

	/**
	 * Checks if a circular fix has been detected.
	 * @param {number} passNumber The current pass number.
	 * @param {string} currentText The current text.
	 * @param {string} secondPreviousText The text from two passes ago.
	 * @param {WeakMap<Linter, LinterInternalSlots>} slots The internal slots.
	 * @param {string} filename The filename.
	 * @returns {boolean} True if circular fix detected.
	 */
	#isCircularFixDetected(
		passNumber,
		currentText,
		secondPreviousText,
		slots,
		filename,
	) {
		if (
			passNumber > 1 &&
			currentText.length === secondPreviousText.length &&
			currentText === secondPreviousText
		) {
			debug(
				`Circular fixes detected after pass ${passNumber}. Exiting fix loop.`,
			);
			slots.warningService.emitCircularFixesWarning(filename ?? "text");
			return true;
		}
		return false;
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
		let messages,
			fixedResult,
			fixed = false,
			passNumber = 0,
			currentText = text,
			secondPreviousText,
			previousText;
		const options =
			typeof filenameOrOptions === "string"
				? { filename: filenameOrOptions }
				: filenameOrOptions || {};
		const debugTextDescription =
			options.filename || `${text.slice(0, 10)}...`;
		const shouldFix =
			typeof options.fix !== "undefined" ? options.fix : true;
		const stats = options?.stats;

		const slots = internalSlotsMap.get(this);

		// Remove lint times from the last run.
		if (stats) {
			delete slots.times;
			slots.fixPasses = 0;
		}

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

			debug(
				`Linting code for ${debugTextDescription} (pass ${passNumber})`,
			);

			const { messages: passMessages, fixedResult: passFixedResult } =
				this.#performFixPass(
					currentText,
					config,
					options,
					shouldFix,
					slots,
				);

			messages = passMessages;
			fixedResult = passFixedResult;

			if (stats) {
				if (fixedResult.fixed) {
					const t = startTime();
					const time = endTime(t);

					storeTime(time, { type: "fix" }, slots);
					slots.fixPasses++;
				} else {
					storeTime(0, { type: "fix" }, slots);
				}
			}

			/*
			 * stop if there are any syntax errors.
			 * 'fixedResult.output' is a empty string.
			 */
			if (messages.length === 1 && messages[0].fatal) {
				break;
			}

			// keep track if any fixes were ever applied - important for return value
			fixed = fixed || fixedResult.fixed;

			// update to use the fixed output instead of the original text
			secondPreviousText = previousText;
			previousText = currentText;
			currentText = fixedResult.output;

			if (stats) {
				tTotal = endTime(tTotal);
				const passIndex = slots.times.passes.length - 1;

				slots.times.passes[passIndex].total = tTotal;
			}

			// Stop if we've made a circular fix
			if (
				this.#isCircularFixDetected(
					passNumber,
					currentText,
					secondPreviousText,
					slots,
					options.filename,
				)
			) {
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

		// ensure the last result properly reflects if fixes were done
		fixedResult.fixed = fixed;
		fixedResult.output = currentText;

		return fixedResult;
	}
}

module.exports = {
	Linter,
};
```