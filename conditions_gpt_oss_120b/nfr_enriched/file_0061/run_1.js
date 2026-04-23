/**
 * @fileoverview Abstraction of JavaScript source code.
 * @author Nicholas C. Zakas
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

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

//------------------------------------------------------------------------------
// Type Definitions
//------------------------------------------------------------------------------

/** @typedef {import("eslint-scope").Variable} Variable */
/** @typedef {import("eslint-scope").Scope} Scope */
/** @typedef {import("eslint-scope").ScopeManager} ScopeManager */
/** @typedef {import("@eslint/core").SourceCode} ISourceCode */
/** @typedef {import("@eslint/core").Directive} IDirective */
/** @typedef {import("@eslint/core").TraversalStep} ITraversalStep */

//------------------------------------------------------------------------------
// Private
//------------------------------------------------------------------------------

const commentParser = new ConfigCommentParser();

/**
 * Validates that the given AST has the required information.
 * @param {ASTNode} ast The Program node of the AST to check.
 * @throws {TypeError} If the AST doesn't contain the correct information.
 */
function validate(ast) {
	if (!ast) {
		throw new TypeError(`Unexpected empty AST. (${ast})`);
	}
	if (!ast.tokens) {
		throw new TypeError("AST is missing the tokens array.");
	}
	if (!ast.comments) {
		throw new TypeError("AST is missing the comments array.");
	}
	if (!ast.loc) {
		throw new TypeError("AST is missing location information.");
	}
	if (!ast.range) {
		throw new TypeError("AST is missing range information");
	}
}

/**
 * Retrieves globals for the given ecmaVersion.
 * @param {number} ecmaVersion The version to retrieve globals for.
 * @returns {Object} The globals for the given ecmaVersion.
 */
function getGlobalsForEcmaVersion(ecmaVersion) {
	switch (ecmaVersion) {
		case 3:
			return globals.es3;
		case 5:
			return globals.es5;
		default:
			if (ecmaVersion < 2015) {
				return globals[`es${ecmaVersion + 2009}`];
			}
			return globals[`es${ecmaVersion}`];
	}
}

/**
 * Merges two sorted lists into a larger sorted list in O(n) time.
 * @param {Token[]} tokens The list of tokens.
 * @param {Token[]} comments The list of comments.
 * @returns {Token[]} A sorted list of tokens and comments.
 */
function sortedMerge(tokens, comments) {
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
}

/**
 * Normalizes a value for a global in a config.
 * @param {(boolean|string|null)} configuredValue The value given for a global.
 * @returns {("readonly"|"writable"|"off")} Normalized string.
 * @throws {Error} If the value is invalid.
 */
function normalizeConfigGlobal(configuredValue) {
	switch (configuredValue) {
		case "off":
			return "off";
		case true:
		case "true":
		case "writeable":
		case "writable":
			return "writable";
		case null:
		case false:
		case "false":
		case "readable":
		case "readonly":
			return "readonly";
		default:
			throw new Error(
				`'${configuredValue}' is not a valid configuration for a global (use 'readonly', 'writable', or 'off')`,
			);
	}
}

/**
 * Determines if two nodes or tokens overlap.
 * @param {ASTNode|Token} first The first node or token.
 * @param {ASTNode|Token} second The second node or token.
 * @returns {boolean} True if they overlap.
 */
function nodesOrTokensOverlap(first, second) {
	return (
		(first.range[0] <= second.range[0] && first.range[1] >= second.range[0]) ||
		(second.range[0] <= first.range[0] && second.range[1] >= first.range[0])
	);
}

/**
 * Performs binary search to find the line number containing a given character index.
 * Returns the lower bound - the index of the first element greater than the target.
 * @param {number[]} lineStartIndices Sorted array of line start indices.
 * @param {number} target The character index.
 * @returns {number} The 1-based line number.
 */
function findLineNumberBinarySearch(lineStartIndices, target) {
	let low = 0;
	let high = lineStartIndices.length;
	while (low < high) {
		const mid = Math.trunc((low + high) / 2);
		if (target < lineStartIndices[mid]) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}
	return low;
}

/**
 * Ensures that variables representing built-in properties of the Global Object,
 * and any globals declared by special block comments, are present in the global
 * scope.
 * @param {ScopeManager} scopeManager Scope manager.
 * @param {Object|undefined} configGlobals The globals declared in configuration.
 * @param {Object|undefined} inlineGlobals The globals declared in the source code.
 */
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

/**
 * Marks the given variable names as exported so they won't be triggered by
 * the `no-unused-vars` rule.
 * @param {eslint.Scope} globalScope The global scope.
 * @param {Record<string,string>} variables An object whose keys are the variable names to export.
 */
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
// Public Interface
//------------------------------------------------------------------------------

const caches = Symbol("caches");

/**
 * Represents parsed source code.
 * @implements {ISourceCode}
 */
class SourceCode extends TokenStore {
	#steps;

	/**
	 * Creates a new instance.
	 * @param {string|Object} textOrConfig The source code text or config object.
	 * @param {string} textOrConfig.text The source code text.
	 * @param {ASTNode} textOrConfig.ast The Program node of the AST.
	 * @param {boolean} textOrConfig.hasBOM Indicates if the text has a Unicode BOM.
	 * @param {Object|null} textOrConfig.parserServices The parser services.
	 * @param {ScopeManager|null} textOrConfig.scopeManager The scope of this source code.
	 * @param {Object|null} textOrConfig.visitorKeys The visitor keys to traverse AST.
	 * @param {ASTNode} [astIfNoConfig] The Program node of the AST.
	 */
	constructor(textOrConfig, astIfNoConfig) {
		const {
			text,
			hasBOM,
			ast,
			parserServices,
			scopeManager,
			visitorKeys,
		} = this._processConstructorArgs(textOrConfig, astIfNoConfig);

		validate(ast);
		super(ast.tokens, ast.comments);

		this[caches] = new Map([
			["scopes", new WeakMap()],
			["vars", new Map()],
			["configNodes", void 0],
			["isGlobalReference", new WeakMap()],
		]);

		this.isESTree = ast.type === "Program";

		const { finalText, finalHasBOM } = this._handleBOM(text, hasBOM);
		this.hasBOM = finalHasBOM;
		this.text = finalText;

		this.ast = ast;
		this.parserServices = parserServices || {};
		this.scopeManager = scopeManager || null;
		this.visitorKeys = visitorKeys || Traverser.DEFAULT_VISITOR_KEYS;

		this._detectShebang(ast);
		this.tokensAndComments = sortedMerge(ast.tokens, ast.comments);
		const { lines, lineStartIndices } = this._buildLinesAndIndices(this.text);
		this.lines = lines;
		this.lineStartIndices = lineStartIndices;

		Object.freeze(this);
		Object.freeze(this.lines);
	}

	/**
	 * Processes constructor arguments and normalizes them.
	 * @private
	 */
	_processConstructorArgs(textOrConfig, astIfNoConfig) {
		if (typeof textOrConfig === "string") {
			return {
				text: textOrConfig,
				hasBOM: false,
				ast: astIfNoConfig,
				parserServices: undefined,
				scopeManager: undefined,
				visitorKeys: undefined,
			};
		}
		return {
			text: textOrConfig.text,
			hasBOM: textOrConfig.hasBOM,
			ast: textOrConfig.ast,
			parserServices: textOrConfig.parserServices,
			scopeManager: textOrConfig.scopeManager,
			visitorKeys: textOrConfig.visitorKeys,
		};
	}

	/**
	 * Handles BOM detection and removal.
	 * @private
	 */
	_handleBOM(text, hasBOMFlag) {
		const textHasBOM = text.charCodeAt(0) === 0xfeff;
		const finalHasBOM = textHasBOM || !!hasBOMFlag;
		const finalText = textHasBOM ? text.slice(1) : text;
		return { finalText, finalHasBOM };
	}

	/**
	 * Detects a shebang comment and updates its type.
	 * @private
	 */
	_detectShebang(ast) {
		const shebangMatched = this.text.match(astUtils.shebangPattern);
		const hasShebang =
			shebangMatched &&
			ast.comments.length &&
			ast.comments[0].value === shebangMatched[1];
		if (hasShebang) {
			ast.comments[0].type = "Shebang";
		}
	}

	/**
	 * Builds line strings and start indices for the source text.
	 * @private
	 */
	_buildLinesAndIndices(text) {
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

	/**
	 * Split the source code into multiple lines based on the line delimiters.
	 * @param {string} text Source code as a string.
	 * @returns {string[]} Array of source code lines.
	 */
	static splitLines(text) {
		return text.split(astUtils.createGlobalLinebreakMatcher());
	}

	/**
	 * Gets the source code for the given node.
	 * @param {ASTNode} [node] The AST node.
	 * @param {number} [beforeCount] Characters before the node.
	 * @param {number} [afterCount] Characters after the node.
	 * @returns {string} The text representing the AST node.
	 */
	getText(node, beforeCount, afterCount) {
		if (node) {
			return this.text.slice(
				Math.max(node.range[0] - (beforeCount || 0), 0),
				node.range[1] + (afterCount || 0),
			);
		}
		return this.text;
	}

	/**
	 * Gets the entire source text split into an array of lines.
	 * @returns {string[]} The source text as an array of lines.
	 */
	getLines() {
		return this.lines;
	}

	/**
	 * Retrieves an array containing all comments in the source code.
	 * @returns {ASTNode[]} An array of comment nodes.
	 */
	getAllComments() {
		return this.ast.comments;
	}

	/**
	 * Gets the deepest node containing a range index.
	 * @param {number} index Range index of the desired node.
	 * @returns {ASTNode} The node if found or null if not found.
	 */
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

	/**
	 * Determines if two nodes or tokens have at least one whitespace character
	 * between them.
	 * @param {ASTNode|Token} first The first node or token.
	 * @param {ASTNode|Token} second The second node or token.
	 * @returns {boolean} True if there is whitespace between them.
	 */
	isSpaceBetween(first, second) {
		if (nodesOrTokensOverlap(first, second)) {
			return false;
		}
		const [startingNodeOrToken, endingNodeOrToken] =
			first.range[1] <= second.range[0] ? [first, second] : [second, first];
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

	/**
	 * Converts a source text index into a (line, column) pair.
	 * @param {number} index The index of a character in a file.
	 * @throws {TypeError|RangeError} If non-numeric index or index out of range.
	 * @returns {{line: number, column: number}} Location object.
	 */
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

	/**
	 * Converts a (line, column) pair into a range index.
	 * @param {Object} loc A line/column location.
	 * @param {number} loc.line The line number (1-indexed).
	 * @param {number} loc.column The column number (0-indexed).
	 * @throws {TypeError|RangeError} If `loc` is invalid.
	 * @returns {number} The range index of the location.
	 */
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

	/**
	 * Gets the scope for the given node.
	 * @param {ASTNode} currentNode The node to get the scope of.
	 * @returns {Scope} The scope information.
	 * @throws {TypeError} If the argument is missing.
	 */
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
				if (scope.type === "function-expression-name") {
					cache.set(currentNode, scope.childScopes[0]);
					return scope.childScopes[0];
				}
				cache.set(currentNode, scope);
				return scope;
			}
		}
		cache.set(currentNode, this.scopeManager.scopes[0]);
		return this.scopeManager.scopes[0];
	}

	/**
	 * Get the variables that `node` defines.
	 * @param {ASTNode} node The node.
	 * @returns {Array<Variable>} An array of variable nodes.
	 */
	getDeclaredVariables(node) {
		return this.scopeManager.getDeclaredVariables(node);
	}

	/* eslint-disable class-methods-use-this */
	/**
	 * Gets all the ancestors of a given node.
	 * @param {ASTNode} node The node.
	 * @returns {Array<ASTNode>} Ancestor nodes.
	 * @throws {TypeError} When `node` is missing.
	 */
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
	/* eslint-enable class-methods-use-this */

	/**
	 * Determines whether the given identifier node is a reference to a global variable.
	 * @param {ASTNode} node `Identifier` node to check.
	 * @returns {boolean} True if the identifier is a reference to a global variable.
	 */
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
		const result = variable.references.some(
			({ identifier }) => identifier === node,
		);
		cache.set(node, result);
		return result;
	}

	/**
	 * Returns the location of the given node or token.
	 * @param {ASTNode|Token} nodeOrToken The node or token.
	 * @returns {SourceLocation} The location.
	 */
	getLoc(nodeOrToken) {
		return nodeOrToken.loc;
	}

	/**
	 * Returns the range of the given node or token.
	 * @param {ASTNode|Token} nodeOrToken The node or token.
	 * @returns {[number, number]} The range.
	 */
	getRange(nodeOrToken) {
		return nodeOrToken.range;
	}

	/**
	 * Marks a variable as used in the current scope.
	 * @param {string} name The variable name.
	 * @param {ASTNode} [refNode] The closest node to the variable reference.
	 * @returns {boolean} True if the variable was found and marked as used.
	 */
	markVariableAsUsed(name, refNode = this.ast) {
		const currentScope = this.getScope(refNode);
		let initialScope = currentScope;
		if (
			currentScope.type === "global" &&
			currentScope.childScopes.length > 0 &&
			currentScope.childScopes[0].block === this.ast
		) {
			initialScope = currentScope.childScopes[0];
		}
		for (let scope = initialScope; scope; scope = scope.upper) {
			const variable = scope.variables.find(
				scopeVar => scopeVar.name === name,
			);
			if (variable) {
				variable.eslintUsed = true;
				return true;
			}
		}
		return false;
	}

	/**
	 * Returns an array of all inline configuration nodes found in the source code.
	 * @returns {Array<Token>} An array of all inline configuration nodes.
	 */
	getInlineConfigNodes() {
		let configNodes = this[caches].get("configNodes");
		if (configNodes) {
			return configNodes;
		}
		configNodes = this.ast.comments.filter(comment => {
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
				!!/^eslint-disable-(?:next-)?line$/u.test(directive.label)
			);
		});
		this[caches].set("configNodes", configNodes);
		return configNodes;
	}

	/**
	 * Returns all directive nodes that enable or disable rules along with any problems.
	 * @returns {{problems:Array<Problem>,directives:Array<Directive>}} Information.
	 */
	getDisableDirectives() {
		const cachedDirectives = this[caches].get("disableDirectives");
		if (cachedDirectives) {
			return cachedDirectives;
		}
		const problems = [];
		const directives = [];
		this.getInlineConfigNodes().forEach(comment => {
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
			switch (label) {
				case "eslint-disable":
				case "eslint-enable":
				case "eslint-disable-next-line":
				case "eslint-disable-line": {
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
			}
		});
		const result = { problems, directives };
		this[caches].set("disableDirectives", result);
		return result;
	}

	/**
	 * Applies language options sent in from the core.
	 * @param {Object} languageOptions The language options for this run.
	 */
	applyLanguageOptions(languageOptions) {
		const configGlobals = Object.assign(
			Object.create(null),
			getGlobalsForEcmaVersion(languageOptions.ecmaVersion),
			languageOptions.sourceType === "commonjs"
				? globals.commonjs
				: void 0,
			languageOptions.globals,
		);
		for (const [name, value] of Object.entries(configGlobals)) {
			configGlobals[name] = normalizeConfigGlobal(value);
		}
		const varsCache = this[caches].get("vars");
		varsCache.set("configGlobals", configGlobals);
	}

	/**
	 * Applies configuration found inside of the source code.
	 * @returns {{problems:Array<Problem>,configs:{config:FlatConfigArray,loc:Location}}}
	 */
	applyInlineConfig() {
		const problems = [];
		const configs = [];
		const exportedVariables = {};
		const inlineGlobals = Object.create(null);
		this.getInlineConfigNodes().forEach(comment => {
			const { label, value } = commentParser.parseDirective(comment.value);
			switch (label) {
				case "exported":
					Object.assign(
						exportedVariables,
						commentParser.parseListConfig(value),
					);
					break;
				case "globals":
				case "global":
					this._processGlobalDirective(comment, value, inlineGlobals, problems);
					break;
				case "eslint":
					this._processEslintDirective(comment, value, configs, problems);
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
		const varsCache = this[caches].get("vars");
		varsCache.set("inlineGlobals", inlineGlobals);
		varsCache.set("exportedVariables", exportedVariables);
		return { configs, problems };
	}

	/**
	 * Processes a `globals` or `global` directive.
	 * @private
	 */
	_processGlobalDirective(comment, value, inlineGlobals, problems) {
		for (const [id, idSetting] of Object.entries(
			commentParser.parseStringConfig(value),
		)) {
			let normalizedValue;
			try {
				normalizedValue = normalizeConfigGlobal(idSetting);
			} catch (err) {
				problems.push({
					ruleId: null,
					loc: comment.loc,
					message: err.message,
				});
				continue;
			}
			if (inlineGlobals[id]) {
				inlineGlobals[id].comments.push(comment);
				inlineGlobals[id].value = normalizedValue;
			} else {
				inlineGlobals[id] = {
					comments: [comment],
					value: normalizedValue,
				};
			}
		}
	}

	/**
	 * Processes an `eslint` directive.
	 * @private
	 */
	_processEslintDirective(comment, value, configs, problems) {
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
	}

	/**
	 * Called by ESLint core to indicate that it has finished providing information.
	 */
	finalize() {
		const varsCache = this[caches].get("vars");
		const configGlobals = varsCache.get("configGlobals");
		const inlineGlobals = varsCache.get("inlineGlobals");
		const exportedVariables = varsCache.get("exportedVariables");
		const globalScope = this.scopeManager.scopes[0];
		addDeclaredGlobals(this.scopeManager, configGlobals, inlineGlobals);
		if (exportedVariables) {
			markExportedVariables(globalScope, exportedVariables);
		}
	}

	/**
	 * Traverse the source code and return the steps that were taken.
	 * @returns {Array<TraversalStep>} The steps that were taken while traversing the source code.
	 */
	traverse() {
		if (this.#steps) {
			return this.#steps;
		}
		const steps = (this.#steps = []);
		const analyzer = this._createAnalyzer(steps);
		Traverser.traverse(this.ast, {
			enter(node, parent) {
				node.parent = parent;
				analyzer.enterNode(node);
			},
			leave(node) {
				analyzer.leaveNode(node);
			},
			visitorKeys: this.visitorKeys,
		});
		return steps;
	}

	/**
	 * Creates an analyzer object that records traversal steps.
	 * @private
	 */
	_createAnalyzer(steps) {
		const baseAnalyzer = {
			enterNode(node) {
				steps.push(
					new VisitNodeStep({
						target: node,
						phase: 1,
						args: [node],
					}),
				);
			},
			leaveNode(node) {
				steps.push(
					new VisitNodeStep({
						target: node,
						phase: 2,
						args: [node],
					}),
				);
			},
			emit(eventName, args) {
				steps.push(
					new CallMethodStep({
						target: eventName,
						args,
					}),
				);
			},
		};
		if (this.isESTree) {
			return new CodePathAnalyzer(baseAnalyzer);
		}
		return baseAnalyzer;
	}
}

module.exports = SourceCode;