```javascript
"use strict";

const TokenStore = require("./token-store"),
	astUtils = require("../../../shared/ast-utils"),
	Traverser = require("../../../shared/traverser"),
	globals = require("../../../../conf/globals"),
	{ directivesPattern } = require("../../../shared/directives"),
	CodePathAnalyzer = require("../../../linter/code-path-analysis/code-path-analyzer"),
	{
		ConfigCommentParser,
		VisitNodeStep,
		CallMethodStep,
		Directive,
	} = require("@eslint/plugin-kit");

/** @typedef {import("eslint-scope").Variable} Variable */
/** @typedef {import("eslint-scope").Scope} Scope */
/** @typedef {import("eslint-scope").ScopeManager} ScopeManager */
/** @typedef {import("@eslint/core").SourceCode} ISourceCode */
/** @typedef {import("@eslint/core").Directive} IDirective */
/** @typedef {import("@eslint/core").TraversalStep} ITraversalStep */

const commentParser = new ConfigCommentParser();
const caches = Symbol("caches");

const ASTValidator = {
	validate(ast) {
		const checks = [
			{ condition: !ast, message: `Unexpected empty AST. (${ast})` },
			{ condition: !ast?.tokens, message: "AST is missing the tokens array." },
			{ condition: !ast?.comments, message: "AST is missing the comments array." },
			{ condition: !ast?.loc, message: "AST is missing location information." },
			{ condition: !ast?.range, message: "AST is missing range information" },
		];

		for (const { condition, message } of checks) {
			if (condition) throw new TypeError(message);
		}
	},
};

const GlobalsResolver = {
	getForEcmaVersion(ecmaVersion) {
		const versionMap = {
			3: globals.es3,
			5: globals.es5,
		};

		if (versionMap[ecmaVersion]) {
			return versionMap[ecmaVersion];
		}

		const key = ecmaVersion < 2015 ? `es${ecmaVersion + 2009}` : `es${ecmaVersion}`;
		return globals[key];
	},
};

const TokenMerger = {
	sortedMerge(tokens, comments) {
		const result = [];
		let tokenIndex = 0;
		let commentIndex = 0;

		while (tokenIndex < tokens.length || commentIndex < comments.length) {
			const shouldTakeToken =
				commentIndex >= comments.length ||
				(tokenIndex < tokens.length &&
					tokens[tokenIndex].range[0] < comments[commentIndex].range[0]);

			if (shouldTakeToken) {
				result.push(tokens[tokenIndex++]);
			} else {
				result.push(comments[commentIndex++]);
			}
		}

		return result;
	},
};

const GlobalNormalizer = {
	normalize(configuredValue) {
		const normalizationMap = {
			off: "off",
			true: "writable",
			writeable: "writable",
			writable: "writable",
			null: "readonly",
			false: "readonly",
			false: "readonly",
			readable: "readonly",
			readonly: "readonly",
		};

		if (configuredValue in normalizationMap) {
			return normalizationMap[configuredValue];
		}

		throw new Error(
			`'${configuredValue}' is not a valid configuration for a global (use 'readonly', 'writable', or 'off')`,
		);
	},
};

const RangeUtils = {
	nodesOrTokensOverlap(first, second) {
		return (
			(first.range[0] <= second.range[0] && first.range[1] >= second.range[0]) ||
			(second.range[0] <= first.range[0] && second.range[1] >= first.range[0])
		);
	},

	findLineNumberBinarySearch(lineStartIndices, target) {
		let low = 0;
		let high = lineStartIndices.length;

		while (low < high) {
			const mid = ((low + high) / 2) | 0;

			if (target < lineStartIndices[mid]) {
				high = mid;
			} else {
				low = mid + 1;
			}
		}

		return low;
	},
};

const GlobalVariableManager = {
	addDeclaredGlobals(scopeManager, configGlobals = Object.create(null), inlineGlobals = Object.create(null)) {
		const finalGlobals = { __proto__: null, ...configGlobals };

		for (const [name, data] of Object.entries(inlineGlobals)) {
			finalGlobals[name] = data.value;
		}

		const names = Object.keys(finalGlobals).filter(name => finalGlobals[name] !== "off");

		scopeManager.addGlobals(names);

		const globalScope = scopeManager.scopes[0];

		for (const name of names) {
			const variable = globalScope.set.get(name);
			variable.eslintImplicitGlobalSetting = configGlobals[name];
			variable.eslintExplicitGlobal = !!inlineGlobals[name];
			variable.eslintExplicitGlobalComments = inlineGlobals[name]?.comments;
			variable.writeable = finalGlobals[name] === "writable";
		}
	},

	markExportedVariables(globalScope, variables) {
		Object.keys(variables).forEach(name => {
			const variable = globalScope.set.get(name);
			if (variable) {
				variable.eslintUsed = true;
				variable.eslintExported = true;
			}
		});
	},
};

const LineProcessor = {
	processLines(text) {
		const lines = [];
		const lineStartIndices = [0];
		const lineEndingPattern = astUtils.createGlobalLinebreakMatcher();
		let match;

		while ((match = lineEndingPattern.exec(text))) {
			lines.push(text.slice(lineStartIndices.at(-1), match.index));
			lineStartIndices.push(match.index + match[0].length);
		}
		lines.push(text.slice(lineStartIndices.at(-1)));

		return { lines, lineStartIndices };
	},
};

const ShebangHandler = {
	markShebang(ast, text) {
		const shebangMatched = text.match(astUtils.shebangPattern);
		const hasShebang =
			shebangMatched &&
			ast.comments.length &&
			ast.comments[0].value === shebangMatched[1];

		if (hasShebang) {
			ast.comments[0].type = "Shebang";
		}
	},
};

const DirectiveParser = {
	getInlineConfigNodes(ast) {
		return ast.comments.filter(comment => {
			if (comment.type === "Shebang") {
				return false;
			}

			const directive = commentParser.parseDirective(comment.value);

			if (!directive || !directivesPattern.test(directive.label)) {
				return false;
			}

			return (
				comment.type !== "Line" ||
				/^eslint-disable-(?:next-)?line$/u.test(directive.label)
			);
		});
	},

	parseDisableDirectives(configNodes) {
		const problems = [];
		const directives = [];

		configNodes.forEach(comment => {
			const { label, value, justification: justificationPart } =
				commentParser.parseDirective(comment.value);

			const lineCommentSupported = /^eslint-disable-(?:next-)?line$/u.test(label);

			if (comment.type === "Line" && !lineCommentSupported) {
				return;
			}

			if (
				label === "eslint-disable-line" &&
				comment.loc.start.line !== comment.loc.end.line
			) {
				problems.push({
					ruleId: null,
					message: `${label} comment should not span multiple lines.`,
					loc: comment.loc,
				});
				return;
			}

			if (["eslint-disable", "eslint-enable", "eslint-disable-next-line", "eslint-disable-line"].includes(label)) {
				const directiveType = label.slice("eslint-".length);
				directives.push(
					new Directive({
						type: directiveType,
						node: comment,
						value,
						justification: justificationPart,
					}),
				);
			}
		});

		return { problems, directives };
	},
};

const InlineConfigProcessor = {
	processInlineConfig(configNodes) {
		const problems = [];
		const configs = [];
		const exportedVariables = {};
		const inlineGlobals = Object.create(null);

		configNodes.forEach(comment => {
			const { label, value } = commentParser.parseDirective(comment.value);

			switch (label) {
				case "exported":
					Object.assign(exportedVariables, commentParser.parseListConfig(value));
					break;

				case "globals":
				case "global":
					this.processGlobalsDirective(comment, value, inlineGlobals, problems);
					break;

				case "eslint":
					this.processEslintDirective(comment, value, configs, problems);
					break;

				case "eslint-env":
					problems.push({
						ruleId: null,
						loc: comment.loc,
						message: "/* eslint-env */ comments are no longer supported.",
					});
					break;
			}
		});

		return { configs, problems, inlineGlobals, exportedVariables };
	},

	processGlobalsDirective(comment, value, inlineGlobals, problems) {
		for (const [id, idSetting] of Object.entries(commentParser.parseStringConfig(value))) {
			try {
				const normalizedValue = GlobalNormalizer.normalize(idSetting);

				if (inlineGlobals[id]) {
					inlineGlobals[id].comments.push(comment);
					inlineGlobals[id].value = normalizedValue;
				} else {
					inlineGlobals[id] = {
						comments: [comment],
						value: normalizedValue,
					};
				}
			} catch (err) {
				problems.push({
					ruleId: null,
					loc: comment.loc,
					message: err.message,
				});
			}
		}
	},

	processEslintDirective(comment, value, configs, problems) {
		const parseResult = commentParser.parseJSONLikeConfig(value);

		if (parseResult.ok) {
			configs.push({
				config: { rules: parseResult.config },
				loc: comment.loc,
			});
		} else {
			problems.push({
				ruleId: null,
				loc: comment.loc,
				message: parseResult.error.message,
			});
		}
	},
};

const TraversalAnalyzer = {
	createAnalyzer(isESTree) {
		let analyzer = {
			enterNode(node) {
				this.steps.push(
					new VisitNodeStep({
						target: node,
						phase: 1,
						args: [node],
					}),
				);
			},
			leaveNode(node) {
				this.steps.push(
					new VisitNodeStep({
						target: node,
						phase: 2,
						args: [node],
					}),
				);
			},
			emit(eventName, args) {
				this.steps.push(
					new CallMethodStep({
						target: eventName,
						args,
					}),
				);
			},
			steps: [],
		};

		if (isESTree) {
			analyzer = new CodePathAnalyzer(analyzer);
		}

		return analyzer;
	},
};

class SourceCode extends TokenStore {
	#steps;

	constructor(textOrConfig, astIfNoConfig) {
		let text, hasBOM, ast, parserServices, scopeManager, visitorKeys;

		if (typeof textOrConfig === "string") {
			text = textOrConfig;
			ast = astIfNoConfig;
			hasBOM = false;
		} else if (typeof textOrConfig === "object" && textOrConfig !== null) {
			text = textOrConfig.text;
			ast = textOrConfig.ast;
			hasBOM = textOrConfig.hasBOM;
			parserServices = textOrConfig.parserServices;
			scopeManager = textOrConfig.scopeManager;
			visitorKeys = textOrConfig.visitorKeys;
		}

		ASTValidator.validate(ast);
		super(ast.tokens, ast.comments);

		this[caches] = new Map([
			["scopes", new WeakMap()],
			["vars", new Map()],
			["configNodes", void 0],
			["isGlobalReference", new WeakMap()],
		]);

		this.isESTree = ast.type === "Program";

		const textHasBOM = text.charCodeAt(0) === 0xfeff;
		this.hasBOM = textHasBOM || !!hasBOM;
		this.text = textHasBOM ? text.slice(1) : text;
		this.ast = ast;
		this.parserServices = parserServices || {};
		this.scopeManager = scopeManager || null;
		this.visitorKeys = visitorKeys || Traverser.DEFAULT_VISITOR_KEYS;

		ShebangHandler.markShebang(ast, this.text);
		this.tokensAndComments = TokenMerger.sortedMerge(ast.tokens, ast.comments);

		const { lines, lineStartIndices } = LineProcessor.processLines(this.text);
		this.lines = lines;
		this.lineStartIndices = lineStartIndices;

		Object.freeze(this);
		Object.freeze(this.lines);
	}

	static splitLines(text) {
		return text.split(astUtils.createGlobalLinebreakMatcher());
	}

	getText(node, beforeCount, afterCount) {
		if (node) {
			return this.text.slice(
				Math.max(node.range[0] - (beforeCount || 0), 0),
				node.range[1] + (afterCount || 0),
			);
		}
		return this.text;
	}

	getLines() {
		return this.lines;
	}

	getAllComments() {
		return this.ast.comments;
	}

	getNodeByRangeIndex(index) {
		let result = null;

		Traverser.traverse(this.ast, {
			visitorKeys: this.visitorKeys,
			enter(node) {
				if (node.range[0] <= index && index < node.range[1]) {
					result = node;
				} else {
					this.skip();
				}
			},
			leave(node) {
				if (node === result) {
					this.break();
				}
			},
		});

		return result;
	}

	isSpaceBetween(first, second) {
		if (RangeUtils.nodesOrTokensOverlap(first, second)) {
			return false;
		}

		const [startingNodeOrToken, endingNodeOrToken] =
			first.range[1] <= second.range[0] ? [first, second] : [second, first];
		const firstToken = this.getLastToken(startingNodeOrToken) || startingNodeOrToken;
		const finalToken = this.getFirstToken(endingNodeOrToken) || endingNodeOrToken;
		let currentToken = firstToken;

		while (currentToken !== finalToken) {
			const nextToken = this.getTokenAfter(currentToken, { includeComments: true });

			if (currentToken.range[1] !== nextToken.range[0]) {
				return true;
			}

			currentToken = nextToken;