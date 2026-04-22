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
// Private Helpers
//------------------------------------------------------------------------------

const commentParser = new ConfigCommentParser();

/**
 * Validates that the given AST has the required information.
 * @param {ASTNode} ast The Program node of the AST to check.
 * @throws {TypeError} If the AST doesn't contain the correct information.
 * @private
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
 * Retrieves globals for the given ecmaVersion using a lookup strategy.
 * @param {number} ecmaVersion The version to retrieve globals for.
 * @returns {Object} The globals for the given ecmaVersion.
 */
function getGlobalsForEcmaVersion(ecmaVersion) {
	const staticMap = {
		3: globals.es3,
		5: globals.es5,
	};

	if (staticMap[ecmaVersion]) {
		return staticMap[ecmaVersion];
	}
	if (ecmaVersion < 2015) {
		return globals[`es${ecmaVersion + 2009}`];
	}
	return globals[`es${ecmaVersion}`];
}

/**
 * Normalizes a value for a global in a config.
 * @param {(boolean|string|null)} configuredValue The value given for a global in configuration or in
 * a global directive comment
 * @returns {("readonly"|"writable"|"off")} The value normalized as a string
 * @throws {Error} if global value is invalid
 */
function normalizeConfigGlobal(configuredValue) {
	if (configuredValue === "off") {
		return "off";
	}
	if (
		configuredValue === true ||
		configuredValue === "true" ||
		configuredValue === "writeable" ||
		configuredValue === "writable"
	) {
		return "writable";
	}
	if (
		configuredValue === null ||
		configuredValue === false ||
		configuredValue === "false" ||
		configuredValue === "readable" ||
		configuredValue === "readonly"
	) {
		return "readonly";
	}
	throw new Error(
		`'${configuredValue}' is not a valid configuration for a global (use 'readonly', 'writable', or 'off')`,
	);
}

/**
 * Determines if two nodes or tokens overlap.
 * @param {ASTNode|Token} first The first node or token to check.
 * @param {ASTNode|Token} second The second node or token to check.
 * @returns {boolean} True if the two nodes or tokens overlap.
 * @private
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
 * @param {number} target The character index to find the line number for.
 * @returns {number} The 1-based line number for the target index.
 * @private
 */
function findLineNumberBinarySearch(lineStartIndices, target) {
	let low = 0;
	let high = lineStartIndices.length;

	while (low < high) {
		const mid = Math.trunc((low + high) / 2); // Use Math.trunc instead of bitwise OR

		if (target < lineStartIndices[mid]) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}

	return low;
}

/**
 * Checks whether a directive label should be processed.
 * @param {string} label The directive label.
 * @returns {boolean} True if the label is one of the supported directives.
 */
function isSupportedDirective(label) {
	return new Set([
		"eslint-disable",
		"eslint-enable",
		"eslint-disable-next-line",
		"eslint-disable-line",
	]).has(label);
}

/**
 * Handles inline configuration directives.
 * @param {Object} comment The comment node.
 * @param {Object} state The mutable state object for inline config processing.
 */
function handleInlineConfigDirective(comment, state) {
	const { label, value } = commentParser.parseDirective(comment.value);
	switch (label) {
		case "exported":
			Object.assign(state.exportedVariables, commentParser.parseListConfig(value));
			break;
		case "globals":
		case "global":
			for (const [id, idSetting] of Object.entries(commentParser.parseStringConfig(value))) {
				let normalizedValue;
				try {
					normalizedValue = normalizeConfigGlobal(idSetting);
				} catch (err) {
					state.problems.push({
						ruleId: null,
						loc: comment.loc,
						message: err.message,
					});
					continue;
				}
				if (state.inlineGlobals[id]) {
					state.inlineGlobals[id].comments.push(comment);
					state.inlineGlobals[id].value = normalizedValue;
				} else {
					state.inlineGlobals[id] = { comments: [comment], value: normalizedValue };
				}
			}
			break;
		case "eslint":
			const parseResult = commentParser.parseJSONLikeConfig(value);
			if (parseResult.ok) {
				state.configs.push({
					config: { rules: parseResult.config },
					loc: comment.loc,
				});
			} else {
				state.problems.push({
					ruleId: null,
					loc: comment.loc,
					message: parseResult.error.message,
				});
			}
			break;
		case "eslint-env":
			state.problems.push({
				ruleId: null,
				loc: comment.loc,
				message: "/* eslint-env */ comments are no longer supported.",
			});
			break;
		// no default
	}
}

/**
 * Extracts disable/enable directives from inline comments.
 * @param {Array} comments Array of comment nodes.
 * @returns {{problems:Array, directives:Array}} Parsed directives and any problems.
 */
function extractDisableDirectives(comments) {
	const problems = [];
	const directives = [];

	comments.forEach(comment => {
		const { label, value, justification: justificationPart } = commentParser.parseDirective(comment.value);
		if (comment.type === "Line" && !/^eslint-disable-(?:next-)?line$/u.test(label)) {
			return;
		}
		if (label === "eslint-disable-line" && comment.loc.start.line !== comment.loc.end.line) {
			problems.push({
				ruleId: null,
				message: `${label} comment should not span multiple lines.`,
				loc: comment.loc,
			});
			return;
		}
		if (isSupportedDirective(label)) {
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
}

//------------------------------------------------------------------------------
// Directive Comments
//------------------------------------------------------------------------------

/**
 * Ensures that variables representing built-in properties of the Global Object,
 * and any globals declared by special block comments, are present in the global
 * scope.
 * @param {ScopeManager} scopeManager Scope manager.
 * @param {Object|undefined} configGlobals The globals declared in configuration
 * @param {Object|undefined} inlineGlobals The globals declared in the source code
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
}

/**
 * Sets the given variable names as exported so they won't be triggered by
 * the `no-unused-vars` rule.
 * @param {eslint.Scope} globalScope The global scope to define exports in.
 * @param {Record<string,string>} variables An object whose keys are the variable
 *      names to export.
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

		validate(ast);
		super(ast.tokens, ast.comments);

		this[caches] = new Map([
			["scopes", new WeakMap()],
			["vars", new Map()],
			["configNodes", void 0],
			["isGlobalReference", new WeakMap()],
			["disableDirectives", void 0],
		]);

		this.isESTree = ast.type === "Program";

		const textHasBOM = text.charCodeAt(0) === 0xfeff;
		this.hasBOM = textHasBOM || !!hasBOM;
		this.text = textHasBOM ? text.slice(1) : text;
		this.ast = ast;
		this.parserServices = parserServices || {};
		this.scopeManager = scopeManager || null;
		this.visitorKeys = visitorKeys || Traverser.DEFAULT_VISITOR_KEYS;

		const shebangMatched = this.text.match(astUtils.shebangPattern);
		const hasShebang =
			shebangMatched && ast.comments.length && ast.comments[0].value === shebangMatched[1];
		if (hasShebang) {
			ast.comments[0].type = "Shebang";
		}

		this.tokensAndComments = sortedMerge(ast.tokens, ast.comments);
		this.lines = [];
		this.lineStartIndices = [0];

		const lineEndingPattern = astUtils.createGlobalLinebreakMatcher();
		let match;
		while ((match = lineEndingPattern.exec(this.text))) {
			this.lines.push(this.text.slice(this.lineStartIndices.at(-1), match.index));
			this.lineStartIndices.push(match.index + match[0].length);
		}
		this.lines.push(this.text.slice(this.lineStartIndices.at(-1)));

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
		if (nodesOrTokensOverlap(first, second)) {
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
			throw new RangeError(`Invalid column number (column ${loc.column} requested).`);
		}
		const lineStartIndex = this.lineStartIndices[loc.line - 1];
		const lineEndIndex =
			loc.line === this.lineStartIndices.length ? this.text.length : this.lineStartIndices[loc.line];
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

	getDeclaredVariables(node) {
		return this.scopeManager.getDeclaredVariables(node);
	}

	/* eslint-disable class-methods-use-this */
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
		return nodeOrToken.loc;
	}

	getRange(nodeOrToken) {
		return nodeOrToken.range;
	}

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
			const variable = scope.variables.find(scopeVar => scopeVar.name === name);
			if (variable) {
				variable.eslintUsed = true;
				return true;
			}
		}
		return false;
	}

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
			return comment.type !== "Line" || !!/^eslint-disable-(?:next-)?line$/u.test(directive.label);
		});
		this[caches].set("configNodes", configNodes);
		return configNodes;
	}

	getDisableDirectives() {
		const cachedDirectives = this[caches].get("disableDirectives");
		if (cachedDirectives) {
			return cachedDirectives;
		}
		const result = extractDisableDirectives(this.getInlineConfigNodes());
		this[caches].set("disableDirectives", result);
		return result;
	}

	applyLanguageOptions(languageOptions) {
		const configGlobals = Object.assign(
			Object.create(null),
			getGlobalsForEcmaVersion(languageOptions.ecmaVersion),
			languageOptions.sourceType === "commonjs" ? globals.commonjs : void 0,
			languageOptions.globals,
		);
		for (const [name, value] of Object.entries(configGlobals)) {
			configGlobals[name] = normalizeConfigGlobal(value);
		}
		const varsCache = this[caches].get("vars");
		varsCache.set("configGlobals", configGlobals);
	}

	applyInlineConfig() {
		const state = {
			problems: [],
			configs: [],
			exportedVariables: Object.create(null),
			inlineGlobals: Object.create(null),
		};
		this.getInlineConfigNodes().forEach(comment => {
			handleInlineConfigDirective(comment, state);
		});
		const varsCache = this[caches].get("vars");
		varsCache.set("inlineGlobals", state.inlineGlobals);
		varsCache.set("exportedVariables", state.exportedVariables);
		return {
			configs: state.configs,
			problems: state.problems,
		};
	}

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

	traverse() {
		if (this.#steps) {
			return this.#steps;
		}
		const steps = (this.#steps = []);
		let analyzer = {
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
			analyzer = new CodePathAnalyzer(analyzer);
		}
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
}

module.exports = SourceCode;