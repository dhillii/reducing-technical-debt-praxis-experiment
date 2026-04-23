"use strict";

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

function asArray(value) {
	return Array.isArray(value) ? value : [value];
}

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
	const sameSeverity = existingSeverity === inlineSeverity;

	if (!sameSeverity) {
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
			const isDisableNextLine = type === "disable-next-line";
			const locationInfo = updateLocationInformation(
				isDisableNextLine ? loc.end : loc.start,
				language,
			);

			directives.push({
				parentDirective,
				type,
				line: locationInfo.line,
				column: locationInfo.column,
				ruleId,
				justification,
			});
		} else {
			report.addError({ ruleId, loc });
		}
	}

	return directives;
}

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

function normalizeFilename(filename) {
	const parts = filename.split(path.sep);
	const index = parts.lastIndexOf("<text>");

	return index === -1 ? filename : parts.slice(index).join(path.sep);
}

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

function addRuleErrorHandler(ruleListener, ruleId, slots, stats) {
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

function createRuleContext(
	fileContext,
	ruleId,
	configuredRules,
	rule,
	report,
	applyDefaultOptions,
) {
	return fileContext.extend({
		id: ruleId,
		options: getRuleOptions(
			configuredRules[ruleId],
			applyDefaultOptions ? rule.meta?.defaultOptions : void 0,
		),
		report(...args) {
			const problem = report.addRuleMessage(
				ruleId,
				Config.getRuleNumericSeverity(configuredRules[ruleId]),
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

		const ruleContext = createRuleContext(
			fileContext,
			ruleId,
			configuredRules,
			rule,
			report,
			applyDefaultOptions,
		);

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

		if (typeof ruleListeners === "undefined" || ruleListeners === null) {
			throw new Error(
				`The create() function for rule '${ruleId}' did not return an object.`,
			);
		}

		Object.keys(ruleListeners).forEach(selector => {
			const ruleListener =
				timing.enabled || stats
					? timing.time(ruleId, ruleListeners[selector], stats)
					: ruleListeners[selector];

			visitor.add(
				selector,
				addRuleErrorHandler(ruleListener, ruleId, slots, stats),
			);
		});
	});

	const traverser = SourceCodeTraverser.getInstance(language);

	traverser.traverseSync(sourceCode, visitor, { steps });

	return report;
}

function ensureText(textOrSourceCode) {
	if (typeof textOrSourceCode === "object") {
		const { hasBOM, text } = textOrSourceCode;
		const bom = hasBOM ? "\uFEFF" : "";

		return bom + text;
	}

	return String(textOrSourceCode);
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

const internalSlotsMap = new WeakMap();

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
				const inactiveFlagData = inactiveFlags.get(flag);
				const inactivityReason =
					getInactivityReasonMessage(inactiveFlagData);
				const message = `The flag '${flag}' is inactive: ${inactivityReason}`;

				if (typeof inactiveFlagData.replacedBy === "undefined") {
					throw new Error(message);
				}

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
		} else {
			if (slots.lastSourceCode.scopeManager === null) {
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
		}

		const sourceCode = slots.lastSourceCode;
		const report = new FileReport({
			ruleMapper: ruleId => config.getRuleDefinition(ruleId),
			language: config.language,
			sourceCode,
			disableFixes: options.disableFixes,
		});

		sourceCode.applyLanguageOptions?.(languageOptions);

		const mergedInlineConfig = {
			rules: {},
		};

		if (options.allowInlineConfig) {
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
			} else {
				this.#processInlineConfig(
					sourceCode,
					config,
					options,
					report,
					mergedInlineConfig,
				);
			}
		}

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

	#processInlineConfig(sourceCode, config, options, report, mergedInlineConfig) {
		const inlineConfigResult = sourceCode.applyInlineConfig?.();

		if (!inlineConfigResult) {
			return;
		}

		inlineConfigResult.problems.forEach(problem => {
			report.addFatal(problem);
		});

		for (const { config: inlineConfig, loc } of inlineConfigResult.configs) {
			this.#processInlineConfigRules(
				inlineConfig,
				config,
				options,
				report,
				mergedInlineConfig,
				loc,
			);
		}
	}

	#processInlineConfigRules(
		inlineConfig,
		config,
		options,
		report,
		mergedInlineConfig,
		loc,
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

			try {
				this.#validateAndMergeInlineRule(
					ruleId,
					ruleValue,
					config,
					rule,
					options,
					report,
					mergedInlineConfig,
					loc,
				);
			} catch (err) {
				this.#handleInlineConfigError(
					err,
					ruleId,
					ruleValue,
					report,
					loc,
				);
			}
		});
	}

	#validateAndMergeInlineRule(
		ruleId,
		ruleValue,
		config,
		rule,
		options,
		report,
		mergedInlineConfig,
		loc,
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
				ruleOptions = [
					ruleOptions[0],
					...mergedOptions,
				];
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
	}

	#handleInlineConfigError(err, ruleId, ruleValue, report, loc) {
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

		if (stats) {
			delete slots.times;
			slots.fixPasses = 0;
		}

		do {
			passNumber++;
			let tTotal;

			if (stats) {
				tTotal = startTime();
			}

			debug(
				`Linting code for ${debugTextDescription} (pass ${passNumber})`,
			);
			messages = this.verify(currentText, config, options);

			debug(
				`Generating fixed text for ${debugTextDescription} (pass ${passNumber})`,
			);
			let t;

			if (stats) {
				t = startTime();
			}

			fixedResult = SourceCodeFixer.applyFixes(
				currentText,
				messages,
				shouldFix,
			);

			if (stats) {
				if (fixedResult.fixed) {
					const time = endTime(t);

					storeTime(time, { type: "fix" }, slots);
					slots.fixPasses++;
				} else {
					storeTime(0, { type: "fix" }, slots);
				}
			}

			if (messages.length === 1 && messages[0].fatal) {
				break;
			}

			fixed = fixed || fixedResult.fixed;

			secondPreviousText = previousText;
			previousText = currentText;
			currentText = fixedResult.output;

			if (stats) {
				tTotal = endTime(tTotal);
				const passIndex = slots.times.passes.length - 1;

				slots.times.passes[passIndex].total = tTotal;
			}

			if (
				passNumber > 1 &&
				currentText.length === secondPreviousText.length &&
				currentText === secondPreviousText
			) {
				debug(
					`Circular fixes detected after pass ${passNumber}. Exiting fix loop.`,
				);
				slots.warningService.emitCircularFixesWarning(
					options.filename ?? "text",
				);
				break;
			}
		} while (fixedResult.fixed && passNumber < MAX_AUTOFIX_PASSES);

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