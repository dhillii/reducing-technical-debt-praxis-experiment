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

const VALIDATION_RULES = [
	{ check: ast => !ast, message: ast => `Unexpected empty AST. (${ast})` },
	{ check: ast => !ast.tokens, message: () => "AST is missing the tokens array." },
	{ check: ast => !ast.comments, message: () => "AST is missing the comments array." },
	{ check: ast => !ast.loc, message: () => "AST is missing location information." },
	{ check: ast => !ast.range, message: () => "AST is missing range information" },
];

function validate(ast) {
	for (const rule of VALIDATION_RULES) {
		if (rule.check(ast)) {
			throw new TypeError(rule.message(ast));
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
		(first.range[0] <= second.range[0] && first.range[1] >= second.range[0]) ||
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
// Directive Processing Utilities
//------------------------------------------------------------------------------

const DIRECTIVE_LABEL_PATTERN = /^eslint-disable-(?:next-)?line$/u;
const MULTILINE_DISABLE_PATTERN = /^eslint-disable-line$/u;

function isValidConfigNode(comment) {
	if (comment.type === "Shebang") {
		return false;
	}

	const directive = commentParser.parseDirective(comment.value);

	if (!directive || !directivesPattern.test(directive.label)) {
		return false;
	}

	return (
		comment.type !== "Line" || DIRECTIVE_LABEL_PATTERN.test(directive.label)
	);
}

function createDirectiveFromComment(comment, label, value, justificationPart) {
	const directiveType = label.slice("eslint-".length);

	return new Directive({
		type: directiveType,
		node: comment,
		value,
		justification: justificationPart,
	});
}

function validateDirectiveSpan(comment, label, problems) {
	if (
		MULTILINE_DISABLE_PATTERN.test(label) &&
		comment.loc.start.line !== comment.loc.end.line
	) {
		problems.push({
			ruleId: null,
			message: `${label} comment should not span multiple lines.`,
			loc: comment.loc,
		});
		return false;
	}
	return true;
}

//------------------------------------------------------------------------------
// Cache Management
//------------------------------------------------------------------------------

const caches = Symbol("caches");

function initializeCaches() {
	return new Map([
		["scopes", new WeakMap()],
		["vars", new Map()],
		["configNodes", void 0],
		["isGlobalReference", new WeakMap()],
	]);
}

//------------------------------------------------------------------------------
// Line Processing
//------------------------------------------------------------------------------

function processLines(text) {
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
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Represents parsed source code.
 * @implements {ISourceCode}
 */
class SourceCode extends TokenStore {
	#steps;

	constructor(textOrConfig, astIfNoConfig) {
		const config = this._parseConstructorArgs(textOrConfig, astIfNoConfig);
		const { text, ast, hasBOM, parserServices, scopeManager, visitorKeys } = config;

		validate(ast);
		super(ast.tokens, ast.comments);

		this[caches] = initializeCaches();
		this.isESTree = ast.type === "Program";

		const textHasBOM = text.charCodeAt(0) === 0xfeff;
		this.hasBOM = textHasBOM || !!hasBOM;
		this.text = textHasBOM ? text.slice(1) : text;
		this.ast = ast;
		this.parserServices = parserServices || {};
		this.scopeManager = scopeManager || null;
		this.visitorKeys = visitorKeys || Traverser.DEFAULT_VISITOR_KEYS;

		this._processShebang(ast);
		this.tokensAndComments = sortedMerge(ast.tokens, ast.comments);

		const { lines, lineStartIndices } = processLines(this.text);
		this.lines = lines;
		this.lineStartIndices = lineStartIndices;

		Object.freeze(this);
		Object.freeze(this.lines);
	}

	_parseConstructorArgs(textOrConfig, astIfNoConfig) {
		if (typeof textOrConfig === "string") {
			return {
				text: textOrConfig,
				ast: astIfNoConfig,
				hasBOM: false,
				parserServices: undefined,
				scopeManager: undefined,
				visitorKeys: undefined,
			};
		}

		return {
			text: textOrConfig.text,
			ast: textOrConfig.ast,
			hasBOM: textOrConfig.hasBOM,
			parserServices: textOrConfig.parserServices,
			scopeManager: textOrConfig.scopeManager,
			visitorKeys: textOrConfig.visitorKeys,
		};
	}

	_processShebang(ast) {
		const shebangMatched = this.text.match(astUtils.shebangPattern);
		const hasShebang =
			shebangMatched &&
			ast.comments.length &&
			ast.comments[0].value === shebangMatched[1];

		if (hasShebang) {
			ast.comments[0].type = "Shebang";
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
		this._validateLocObject(loc);

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

		return positionIndex;
	}

	_validateLocObject(loc) {
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
	}

	getScope(currentNode) {
		if (!currentNode) {
			throw new TypeError("Missing required argument: node.");
		}

		const cache = this[caches].