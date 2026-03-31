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

//------------------------------------------------------------------------------
// Validation Utilities
//------------------------------------------------------------------------------

const ASTValidationRules = {
	ast: "Unexpected empty AST",
	tokens: "AST is missing the tokens array",
	comments: "AST is missing the comments array",
	loc: "AST is missing location information",
	range: "AST is missing range information",
};

function validate(ast) {
	if (!ast) {
		throw new TypeError(`${ASTValidationRules.ast}. (${ast})`);
	}

	for (const [property, message] of Object.entries(ASTValidationRules)) {
		if (property === "ast") continue;
		if (!ast[property]) {
			throw new TypeError(message);
		}
	}
}

//------------------------------------------------------------------------------
// Global Configuration Utilities
//------------------------------------------------------------------------------

const ECMA_VERSION_MAP = {
	3: "es3",
	5: "es5",
};

function getGlobalsForEcmaVersion(ecmaVersion) {
	if (ecmaVersion in ECMA_VERSION_MAP) {
		return globals[ECMA_VERSION_MAP[ecmaVersion]];
	}

	if (ecmaVersion < 2015) {
		return globals[`es${ecmaVersion + 2009}`];
	}

	return globals[`es${ecmaVersion}`];
}

const GLOBAL_VALUE_MAP = {
	off: "off",
	true: "writable",
	writable: "writable",
	writeable: "writable",
	false: "readonly",
	readonly: "readonly",
	readable: "readonly",
	null: "readonly",
};

function normalizeConfigGlobal(configuredValue) {
	const normalized = GLOBAL_VALUE_MAP[configuredValue];

	if (normalized !== undefined) {
		return normalized;
	}

	throw new Error(
		`'${configuredValue}' is not a valid configuration for a global (use 'readonly', 'writable', or 'off')`,
	);
}

//------------------------------------------------------------------------------
// Token and Range Utilities
//------------------------------------------------------------------------------

function sortedMerge(tokens, comments) {
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
}

function nodesOrTokensOverlap(first, second) {
	return (
		(first.range[0] <= second.range[0] &&
			first.range[1] >= second.range[0]) ||
		(second.range[0] <= first.range[0] && second.range[1] >= first.range[0])
	);
}

function findLineNumberBinarySearch(lineStartIndices, target) {
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
}

//------------------------------------------------------------------------------
// Scope and Variable Utilities
//------------------------------------------------------------------------------

function addDeclaredGlobals(
	scopeManager,
	configGlobals = Object.create(null),
	inlineGlobals = Object.create(null),
) {
	const finalGlobals = { __proto__: null, ...configGlobals };

	for (const [name, data] of Object.entries(inlineGlobals)) {
		finalGlobals[name] = data.value;
	}

	const names = Object.keys(finalGlobals).filter(
		name => finalGlobals[name] !== "off",
	);

	scopeManager.addGlobals(names);

	const globalScope = scopeManager.scopes[0];

	for (const name of names) {
		const variable = globalScope.set.get(name);

		variable.eslintImplicitGlobalSetting = configGlobals[name];
		variable.eslintExplicitGlobal = !!inlineGlobals[name];
		variable.eslintExplicitGlobalComments = inlineGlobals[name]?.comments;
		variable.writeable = finalGlobals[name] === "writable";
	}
}

function markExportedVariables(globalScope, variables) {
	Object.keys(variables).forEach(name => {
		const variable = globalScope.set.get(name);

		if (variable) {
			variable.eslintUsed = true;
			variable.eslintExported = true;
		}
	});
}

//------------------------------------------------------------------------------
// Line Processing Utilities
//------------------------------------------------------------------------------

class LineProcessor {
	constructor(text) {
		this.text = text;
		this.lines = [];
		this.lineStartIndices = [0];
	}

	process() {
		const lineEndingPattern = astUtils.createGlobalLinebreakMatcher();
		let match;

		while ((match = lineEndingPattern.exec(this.text))) {
			this.lines.push(
				this.text.slice(this.lineStartIndices.at(-1), match.index),
			);
			this.lineStartIndices.push(match.index + match[0].length);
		}
		this.lines.push(this.text.slice(this.lineStartIndices.at(-1)));

		return { lines: this.lines, lineStartIndices: this.lineStartIndices };
	}
}

//------------------------------------------------------------------------------
// Directive Processing Utilities
//------------------------------------------------------------------------------

class DirectiveProcessor {
	static isValidDirectiveComment(comment) {
		if (comment.type === "Shebang") {
			return false;
		}

		const directive = commentParser.parseDirective(comment.value);

		if (!directive) {
			return false;
		}

		if (!directivesPattern.test(directive.label)) {
			return false;
		}

		return (
			comment.type !== "Line" ||
			/^eslint-disable-(?:next-)?line$/u.test(directive.label)
		);
	}

	static createDirectiveFromComment(comment) {
		const { label, value, justification } =
			commentParser.parseDirective(comment.value);

		return { label, value, justification, comment };
	}

	static validateDisableLineDirective(label, comment) {
		if (
			label === "eslint-disable-line" &&
			comment.loc.start.line !== comment.loc.end.line
		) {
			return {
				ruleId: null,
				message: `${label} comment should not span multiple lines.`,
				loc: comment.loc,
			};
		}
		return null;
	}

	static buildDirective(label, value, justification, comment) {
		const directiveType = label.slice("eslint-".length);

		return new Directive({
			type: directiveType,
			node: comment,
			value,
			justification,
		});
	}
}

//------------------------------------------------------------------------------
// Constructor Argument Processing
//------------------------------------------------------------------------------

class SourceCodeConfig {
	constructor(textOrConfig, astIfNoConfig) {
		if (typeof textOrConfig === "string") {
			this.text = textOrConfig;
			this.ast = astIfNoConfig;
			this.hasBOM = false;
			this.parserServices = undefined;
			this.scopeManager = undefined;
			this.visitorKeys = undefined;
		} else if (typeof textOrConfig === "object" && textOrConfig !== null) {
			this.text = textOrConfig.text;
			this.ast = textOrConfig.ast;
			this.hasBOM = textOrConfig.hasBOM;
			this.parserServices = textOrConfig.parserServices;
			this.scopeManager = textOrConfig.scopeManager;
			this.visitorKeys = textOrConfig.visitorKeys;
		}
	}
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

const caches = Symbol("caches");

class SourceCode extends TokenStore {
	#steps;

	constructor(textOrConfig, astIfNoConfig) {
		const config = new SourceCodeConfig(textOrConfig, astIfNoConfig);

		validate(config.ast);
		super(config.ast.tokens, config.ast.comments);

		this[caches] = new Map([
			["scopes", new WeakMap()],
			["vars", new Map()],
			["configNodes", void 0],
			["isGlobalReference", new WeakMap()],
		]);

		this.isESTree = config.ast.type === "Program";

		const textHasBOM = config.text.charCodeAt(0) === 0xfeff;

		this.hasBOM = textHasBOM || !!config.hasBOM;
		this.text = textHasBOM ? config.text.slice(1) : config.text;
		this.ast = config.ast;
		this.parserServices = config.parserServices || {};
		this.scopeManager = config.scopeManager || null;
		this.visitorKeys = config.visitorKeys || Traverser.DEFAULT_VISITOR_KEYS;

		this._processShebang();
		this.tokensAndComments = sortedMerge(config.ast.tokens, config.ast.comments);

		const lineProcessor = new LineProcessor(this.text);
		const { lines, lineStartIndices } = lineProcessor.process();

		this.lines = lines;
		this.lineStartIndices = lineStartIndices;

		Object.freeze(this);
		Object.freeze(this.lines);
	}

	_processShebang() {
		const shebangMatched = this.text.match(astUtils.shebangPattern);
		const hasShebang =
			shebangMatched &&
			this.ast.comments.length &&
			this.ast.comments[0].value === shebangMatched[1];

		if (hasShebang) {
			this.ast.comments[0].type = "Shebang";
		}
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
			enter: (node) => {
				if (node.range[0] <= index && index < node.range[1]) {
					result = node;
				} else {
					this.skip();
				}
			},
			leave: (node) => {
				if (node === result) {
					this.break();
				}
			},
		});

		return result;
	}

	isSpaceBetween(first, second) {
		if (nodesOrTokensOverlap(first, second)) {
			return false;
		}

		const [startingNodeOrToken, endingNodeOrToken] =
			first.range[1] <= second.range[0]
				? [first, second]
				: [second, first];
		const firstToken =
			this.getLastToken(startingNodeOrToken) || startingNodeOrToken;
		const finalToken =
			this.getFirstToken(endingNodeOrToken) || endingNodeOrToken;
		let currentToken = firstToken;

		while (currentToken !== finalToken) {
			const nextToken = this.getTokenAfter(currentToken, {
				includeComments: true,
			});

			if (currentToken.range[1] !== nextToken.range[0]) {
				return true;
			}

			currentToken = nextToken;
		}

		return false;
	}

	getLocFromIndex(index) {
		if (typeof index !== "number") {
			throw new TypeError("Expected `index` to be a number.");
		}

		if (index < 0 || index > this.text.length) {
			throw new RangeError(
				`Index out of range (requested index ${index}, but source text has length ${this.text.length}).`,
			);
		}

		if (index === this.text.length) {
			return {
				line: this.lines.length,
				column: this.lines.at(-1).length,
			};
		}

		const lineNumber =
			index >= this.lineStartIndices.at(-1)
				? this.lineStartIndices.length
				: findLineNumberBinarySearch(this.lineStartIndices, index);

		return {
			line: lineNumber,
			column: index - this.lineStartIndices[lineNumber - 1],
		};
	}

	getIndexFromLoc(loc) {
		if (
			loc === null ||
			typeof loc !== "object" ||
			typeof loc.line !== "number" ||
			typeof loc.column !== "number"
		) {
			throw new TypeError(
				"Expected `loc` to be an object with numeric `line` and `column` properties.",
			);
		}

		if (loc.line <= 0) {
			throw new RangeError(
				`Line number out of range (line ${loc.line} requested). Line numbers should be 1-based.`,
			);
		}

		if (loc.line > this.lineStartIndices.length) {
			throw new RangeError(
				`Line number out of range (line ${loc.line} requested, but only ${this.lineStartIndices.length} lines present).`,
			);
		}

		if (loc.column < 0) {
			throw new RangeError(
				`Invalid column number (column ${loc.column} requested).`,
			);
		}

		const lineStartIndex = this.lineStartIndices[loc.line - 1];
		const lineEndIndex =
			loc.line === this.lineStartIndices.length
				? this.text.length
				: this.lineStartIndices[loc.line];
		const positionIndex = lineStartIndex + loc.column;

		if (
			(loc.line === this.lineStartIndices.length &&
				positionIndex > lineEndIndex) ||
			(loc.line < this.lineStartIndices.length &&
				positionIndex >= lineEndIndex)
		) {
			throw new RangeError(
				`Column number out of range (column ${loc.column} requested, but the length of line ${loc.line} is ${lineEndIndex - lineStartIndex}).`,
			);
		}

		return position