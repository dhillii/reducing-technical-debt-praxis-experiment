```javascript
"use strict";

const path = require("node:path");
const eslintScope = require("eslint-scope");
const evk = require("eslint-visitor-keys");
const pkg = require("../../package.json");
const Traverser = require("../shared/traverser");
const { SourceCode } = require("../languages/js/source-code");
const applyDisableDirectives = require("./apply-disable-directives");
const { ConfigCommentParser } = require("@eslint/plugin-kit");
const SourceCodeFixer = require("./source-code-fixer");
const { SourceCodeVisitor } = require("./source-code-visitor");
const timing = require("./timing");
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
const { VFile } = require("./vfile");
const { ParserService } = require("../services/parser-service");
const { FileContext } = require("./file-context");
const { ProcessorService } = require("../services/processor-service");
const { containsDifferentProperty } = require("../shared/option-utils");
const { Config } = require("../config/config");
const { WarningService } = require("../services/warning-service");
const { SourceCodeTraverser } = require("./source-code-traverser");
const { FileReport, updateLocationInformation } = require("./file-report");

const MAX_AUTOFIX_PASSES = 10;
const DEFAULT_ECMA_VERSION = 5;
const commentParser = new ConfigCommentParser();
const internalSlotsMap = new WeakMap();

//------------------------------------------------------------------------------
// Helper Functions
//------------------------------------------------------------------------------

function asArray(value) {
	return Array.isArray(value) ? value : [value];
}

function normalizeFilename(filename) {
	const parts = filename.split(path.sep);
	const index = parts.lastIndexOf("<text>");
	return index === -1 ? filename : parts.slice(index).join(path.sep);
}

function normalizeCwd(cwd) {
	if (cwd) {
		return cwd;
	}
	if (typeof process === "object") {
		return process.cwd();
	}
	return undefined;
}

function ensureText(textOrSourceCode) {
	if (typeof textOrSourceCode === "object") {
		const { hasBOM, text } = textOrSourceCode;
		const bom = hasBOM ? "\uFEFF" : "";
		return bom + text;
	}
	return String(textOrSourceCode);
}

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

function getRuleOptions(ruleConfig, defaultOptions) {
	if (Array.isArray(ruleConfig)) {
		return deepMergeArrays(defaultOptions, ruleConfig.slice(1));
	}
	return defaultOptions ?? [];
}

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

//------------------------------------------------------------------------------
// Directive Processing
//------------------------------------------------------------------------------

class DirectiveProcessor {
	static createDisableDirectives(
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

	static getDirectiveComments(sourceCode, ruleMapper, language, report) {
		const disableDirectives = [];

		if (sourceCode.getDisableDirectives) {
			const { directives: directivesSources, problems: directivesProblems } =
				sourceCode.getDisableDirectives();

			if (Array.isArray(directivesProblems)) {
				directivesProblems.forEach(problem => report.addError(problem));
			}

			directivesSources.forEach(directive => {
				const directives = this.createDisableDirectives(
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
}

//------------------------------------------------------------------------------
// Inline Config Processing
//------------------------------------------------------------------------------

class InlineConfigProcessor {
	static addProblemIfRedundant(
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

		if (existingSeverity !== inlineSeverity) {
			return;
		}

		const alreadyConfigured = existingConfigRaw
			? `is already configured to '${existingSeverity}'`
			: "is not enabled so can't be turned off";

		let message;

		if (
			(existingConfig.length === 1 && ruleOptions.length === 1) ||
			existingSeverity === "off"
		) {
			message = `Unused inline config ('${ruleId}' ${alreadyConfigured}).`;
		} else if (
			!containsDifferentProperty(
				ruleOptions.slice(1),
				existingConfig.slice(1),
			)
		) {
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

	static mergeInlineRuleConfig(
		ruleId,
		ruleValue,
		config,
		rule,
		report,
		loc,
		reportUnusedInlineConfigs,
	) {
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
			const slicedOptions = ruleOptions.slice(1);
			const mergedOptions = deepMergeArrays(
				rule.meta?.defaultOptions,
				slicedOptions,
			);

			if (mergedOptions.length) {
				ruleOptions = [ruleOptions[0], ...mergedOptions];
			}
		}

		if (reportUnusedInlineConfigs !== "off") {
			this.addProblemIfRedundant(
				config,
				loc,
				report,
				ruleId,
				ruleOptions,
				ruleOptionsInline,
				reportUnusedInlineConfigs,
			);
		}

		if (shouldValidateOptions) {
			config.validateRulesConfig({ [ruleId]: ruleOptions });
		}

		return ruleOptions;
	}
}

//------------------------------------------------------------------------------
// Options Normalization
//------------------------------------------------------------------------------

class OptionsNormalizer {
	static normalizeVerifyOptions(providedOptions, config) {
		const linterOptions = config.linterOptions || config;
		const disableInlineConfig = linterOptions.noInlineConfig === true;
		const ignoreInlineConfig = providedOptions.allowInlineConfig === false;
		const configNameOfNoInlineConfig = config.configNameOfNoInlineConfig
			? ` (${config.configNameOfNoInlineConfig})`
			: "";

		let reportUnusedDisableDirectives =
			providedOptions.reportUnusedDisableDirectives;

		if (typeof reportUnusedDisableDirectives === "boolean") {
			reportUnusedDisableDirectives = reportUnusedDisableDirectives
				? "error"
				: "off";
		}
		if (typeof reportUnusedDisableDirectives !== "string") {
			if (typeof linterOptions.reportUnusedDisableDirectives === "boolean") {
				reportUnusedDisableDirectives =
					linterOptions.reportUnusedDisableDirectives ? "warn" : "off";
			} else {
				reportUnusedDisableDirectives =
					linterOptions.reportUnusedDisableDirectives === void 0
						? "off"
						: normalizeSeverityToString(
								linterOptions.reportUnusedDisableDirectives,
							);
			}
		}

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
}

//------------------------------------------------------------------------------
// Rule Execution
//------------------------------------------------------------------------------

class RuleExecutor {
	static createRuleContext(
		fileContext,
		ruleId,
		configuredRules,
		rule,
		report,
	) {
		return fileContext.extend({
			id: ruleId,
			options: getRuleOptions(
				configuredRules[ruleId],
				rule.meta?.defaultOptions,
			),
			report(...args) {
				const problem = report.addRuleMessage(ruleId, 0, ...args);

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
	}

	static addRuleErrorHandler(ruleListener, ruleId, stats, slots) {
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

	static runRules(
		sourceCode,
		configuredRules,
		ruleMapper,
		language,
		languageOptions,
		settings,
		filename,
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