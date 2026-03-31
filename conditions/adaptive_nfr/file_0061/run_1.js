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

const GlobalNormalizer = {
	normalize(configuredValue) {
		const normalizationMap = {
			"off": "off",
			"true": "writable",
			"writeable": "writable",
			"writable": "writable",
			"false": "readonly",
			"readable": "readonly",
			"readonly": "readonly",
		};

		if (configuredValue === true) return "writable";
		if (configuredValue === false || configuredValue === null) return "readonly";

		if (normalizationMap[configuredValue]) {
			return normalizationMap[configuredValue];
		}

		throw new Error(
			`'${configuredValue}' is not a valid configuration for a global (use 'readonly', 'writable', or 'off')`,
		);
	},
};

const TokenMerger = {
	sortedMerge(tokens, comments) {
		const result = [];
		let tokenIndex = 0;
		let commentIndex = 0;

		while (tokenIndex < tokens.length || commentIndex < comments.length) {
			if (
				commentIndex >= comments.length ||
				(tokenIndex < tokens.length &&
					tokens[tokenIndex].range[0] < comments[commentIndex].range[0])
			) {
				result.push(tokens[tokenIndex++]);
			} else {
				result.push(comments[commentIndex++]);
			}
		}

		return result;
	},
};

const RangeUtils = {
	overlap(first, second) {
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

class SourceCode extends TokenStore {
	#steps;

	constructor(textOrConfig, astIfNoConfig) {
		const config = this._parseConstructorArgs(textOrConfig, astIfNoConfig);
		const { text, ast, hasBOM, parserServices, scopeManager, visitorKeys } = config;

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

		this._processShebang();
		this.tokensAndComments = TokenMerger.sortedMerge(ast.tokens, ast.comments);
		this._initializeLines();

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

	_initializeLines() {
		this.lines = [];
		this.lineStartIndices = [0];

		const lineEndingPattern = astUtils.createGlobalLinebreakMatcher();
		let match;

		while ((match = lineEndingPattern.exec(this.text))) {
			this.lines.push(this.text.slice(this.lineStartIndices.at(-1), match.index));
			this.lineStartIndices.push(match.index + match[0].length);
		}
		this.lines.push(this.text.slice(this.lineStartIndices.at(-1)));
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
		if (RangeUtils.overlap(first, second)) {
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
				: RangeUtils.findLineNumberBinarySearch(this.lineStartIndices, index);

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
			throw new RangeError(`Invalid column number (column ${loc.column} requested).`);
		}

		const lineStartIndex = this.lineStartIndices[loc.line - 1];
		const lineEndIndex =
			loc.line === this.lineStartIndices.length
				? this.text.length
				: this.lineStartIndices[loc.line];
		const positionIndex = lineStartIndex + loc.column;

		if (
			(loc.line === this.lineStartIndices.length && positionIndex > lineEndIndex) ||
			(loc.line < this.lineStartIndices.length && positionIndex >= lineEndIndex)
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

		const cache = this[caches].get("scopes");
		const cachedScope = cache.get(currentNode);

		if (cachedScope) {
			return cachedScope;
		}

		const inner = currentNode.type !== "Program";

		for (let node = currentNode; node; node = node.parent) {
			const scope = this.scopeManager.acquire(node, inner);

			if (scope) {
				const resultScope =
					scope.type === "function-expression-name" ? scope.childScopes[0] : scope;
				cache.set(currentNode, resultScope);
				return resultScope;
			}
		}

		const globalScope = this.scopeManager.scopes[0];
		cache.set(currentNode, globalScope);
		return globalScope;
	}

	getDeclaredVariables(node) {
		return this.scopeManager.getDeclaredVariables(node);
	}

	getAncestors(node) {
		if (!node) {
			throw new TypeError("Missing required argument: node.");
		}

		const ancestorsStartingAtParent = [];

		for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
			ancestorsStartingAtParent.push(ancestor);
		}

		return ancestorsStartingAtParent.reverse();
	}

	isGlobalReference(node) {
		if (!node) {
			throw new TypeError("Missing required argument: node.");
		}

		const cache = this[caches].get("isGlobalReference");

		if (cache.has(node)) {
			return cache.get(node);
		}

		if (node.type !== "Identifier") {
			cache.set(node, false);
			return false;
		}

		const variable = this.scopeManager.scopes[0].set.get(node.name);

		if (!variable || variable.defs.length > 0) {
			cache.set(node, false);
			return false;
		}

		const result = variable.references.some(({ identifier }) => identifier === node);
		cache.set(node, result);
		return result;
	}

	getLoc(nodeOrToken) {