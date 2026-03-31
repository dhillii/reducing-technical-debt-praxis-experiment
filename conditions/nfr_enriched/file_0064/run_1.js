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
	return typeof process === "object" ? process.cwd() : undefined;
}

function ensureText(textOrSourceCode) {
	if (typeof textOrSourceCode === "object") {
		const { hasBOM, text } = textOrSourceCode;
		const bom = hasBOM ? "\uFEFF" : "";
		return bom + text;
	}
	return String(textOrSourceCode);
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

//------------------------------------------------------------------------------
// Inline Config Validation
//------------------------------------------------------------------------------

class InlineConfigValidator {
	constructor(config, report) {
		this.config = config;
		this.report = report;
	}

	validateRuleOptions(ruleId, ruleValue, loc) {
		try {
			const ruleOptionsInline = asArray(ruleValue);
			let ruleOptions = ruleOptionsInline;

			assertIsRuleSeverity(ruleId, ruleOptions[0]);

			let shouldValidateOptions = true;

			if (
				ruleOptions.length === 1 &&
				this.config.rules &&
				Object.hasOwn(this.config.rules, ruleId)
			) {
				ruleOptions = [
					ruleOptions[0],
					...this.config.rules[ruleId].slice(1),
				];

				if (this.config.rules[ruleId][0] > 0) {
					shouldValidateOptions = false;
				}
			} else {
				const slicedOptions = ruleOptions.slice(1);
				const rule = this.config.getRuleDefinition(ruleId);
				const mergedOptions = deepMergeArrays(
					rule?.meta?.defaultOptions,
					slicedOptions,
				);

				if (mergedOptions.length) {
					ruleOptions = [ruleOptions[0], ...mergedOptions];
				}
			}

			if (shouldValidateOptions) {
				this.config.validateRulesConfig({
					[ruleId]: ruleOptions,
				});
			}

			return ruleOptions;
		} catch (err) {
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

			this.report.addError({
				ruleId,
				message: `Inline configuration for rule "${ruleId}" is invalid:\n\t${baseMessage}\n`,
				loc,
			});

			return null;
		}
	}
}

//------------------------------------------------------------------------------
// Disable Directives
//------------------------------------------------------------------------------

class DisableDirectiveProcessor {
	constructor(ruleMapper, language, sourceCode, report) {
		this.ruleMapper = ruleMapper;
		this.language = language;
		this.sourceCode = sourceCode;
		this.report = report;
	}

	createDisableDirectives({ type, value, justification, node }) {
		const ruleIds = Object.keys(commentParser.parseListConfig(value));
		const directiveRules = ruleIds.length ? ruleIds : [null];
		const directives = [];
		const parentDirective = { node, value, ruleIds };

		for (const ruleId of directiveRules) {
			const loc = this.sourceCode.getLoc(node);

			if (ruleId === null || !!this.ruleMapper(ruleId)) {
				const isDisableNextLine = type === "disable-next-line";
				const { line, column } = updateLocationInformation(
					isDisableNextLine ? loc.end : loc.start,
					this.language,
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
				this.report.addError({ ruleId, loc });
			}
		}

		return directives;
	}

	getDirectiveComments() {
		const disableDirectives = [];

		if (this.sourceCode.getDisableDirectives) {
			const { directives: directivesSources, problems: directivesProblems } =
				this.sourceCode.getDisableDirectives();

			if (Array.isArray(directivesProblems)) {
				directivesProblems.forEach(problem => this.report.addError(problem));
			}

			directivesSources.forEach(directive => {
				const directives = this.createDisableDirectives(directive);
				disableDirectives.push(...directives);
			});
		}

		return disableDirectives;
	}
}

//------------------------------------------------------------------------------
// Rule Execution
//------------------------------------------------------------------------------

class RuleExecutor {
	constructor(sourceCode, configuredRules, ruleMapper, language, languageOptions, settings, filename, cwd, physicalFilename, ruleFilter, stats, slots, report) {
		this.sourceCode = sourceCode;
		this.configuredRules = configuredRules;
		this.ruleMapper = ruleMapper;
		this.language = language;
		this.languageOptions = languageOptions;
		this.settings = settings;
		this.filename = filename;
		this.cwd = cwd;
		this.physicalFilename = physicalFilename;
		this.ruleFilter = ruleFilter;
		this.stats = stats;
		this.slots = slots;
		this.report = report;
		this.visitor = new SourceCodeVisitor();
	}

	execute() {
		const fileContext = new FileContext({
			cwd: this.cwd,
			filename: this.filename,
			physicalFilename: this.physicalFilename || this.filename,
			sourceCode: this.sourceCode,
			languageOptions: this.languageOptions,
			settings: this.settings,
		});

		Object.keys(this.configuredRules).forEach(ruleId => {
			this.executeRule(ruleId, fileContext);
		});

		const traverser = SourceCodeTraverser.getInstance(this.language);
		const steps = this.sourceCode.traverse();
		traverser.traverseSync(this.sourceCode, this.visitor, { steps });

		return this.report;
	}

	executeRule(ruleId, fileContext) {
		const severity = Config.getRuleNumericSeverity(this.configuredRules[ruleId]);

		if (severity === 0) {
			return;
		}

		if (this.ruleFilter && !this.ruleFilter({ ruleId, severity })) {
			return;
		}

		const rule = this.ruleMapper(ruleId);

		if (!rule) {
			this.report.addError({ ruleId });
			return;
		}

		const ruleContext = fileContext.extend({
			id: ruleId,
			options: getRuleOptions(
				this.configuredRules[ruleId],
				rule.meta?.defaultOptions,
			),
			report: (...args) => this.createReportFunction(ruleId, severity, rule)(...args),
		});

		const ruleListenersReturn =
			timing.enabled || this.stats
				? timing.time(
						ruleId,
						createRuleListeners,
						this.stats,
					)(rule, ruleContext)
				: createRuleListeners(rule, ruleContext);

		const ruleListeners = this.stats
			? ruleListenersReturn.result
			: ruleListenersReturn;

		if (this.stats) {
			storeTime(
				ruleListenersReturn.tdiff,
				{ type: "rules", key: ruleId },
				this.slots,
			);
		}

		if (typeof ruleListeners === "undefined" || ruleListeners === null) {
			throw new Error(
				`The create() function for rule '${ruleId}' did not return an object.`,
			);
		}

		Object.keys(ruleListeners).forEach(selector => {
			const ruleListener =
				timing.enabled || this.stats
					? timing.time(ruleId, ruleListeners[selector], this.stats)
					: ruleListeners[selector];

			this.visitor.add(selector, this.createErrorHandler(ruleId, ruleListener));
		});
	}

	createReportFunction(ruleId, severity, rule) {
		return (...args) => {
			const problem = this.report.addRuleMessage(ruleId, severity, ...args);

			if (problem.fix && !(rule.meta && rule.meta.fixable)) {
				throw new Error(
					'Fixable rules must set the `meta.fixable` property to "code" or "whitespace".',
				);
			}

			if (problem.suggestions && !(rule.meta && rule.meta.hasSuggestions === true)) {
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
		};
	}

	createErrorHandler(ruleId, ruleListener) {
		return (...listenerArgs) => {
			try {
				const ruleListenerReturn = ruleListener(...listenerArgs);
				const ruleListenerResult = this.stats
					? ruleListenerReturn.result
					: ruleListenerReturn;

				if (this.stats) {
					storeTime(
						ruleListenerReturn.tdiff,
						{ type: "rules", key: ruleId },
						this.slots,
					);
				}

				return ruleListenerResult;
			} catch (e) {
				e.ruleId = ruleId;
				throw e;
			}
		};
	}
}

//------------------------------------------------------------------------------
// Verify Options
//------------------------------------------------------------------------------

function normalizeVerifyOptions(providedOptions, config) {
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
		if (typeof