```javascript
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
const caches = Symbol("caches");

/**
 * Validates that the given AST has the required information.
 * @param {ASTNode} ast The Program node of the AST to check.
 * @throws {TypeError} If the AST doesn't contain the correct information.
 * @returns {void}
 * @private
 */
function validate(ast) {
	const requiredProperties = [
		{ prop: "tokens", message: "AST is missing the tokens array." },
		{ prop: "comments", message: "AST is missing the comments array." },
		{ prop: "loc", message: "AST is missing location information." },
		{ prop: "range", message: "AST is missing range information" },
	];

	if (!ast) {
		throw new TypeError(`Unexpected empty AST. (${ast})`);
	}

	for (const { prop, message } of requiredProperties) {
		if (!ast[prop]) {
			throw new TypeError(message);
		}
	}
}

/**
 * Retrieves globals for the given ecmaVersion.
 * @param {number} ecmaVersion The version to retrieve globals for.
 * @returns {Object} The globals for the given ecmaVersion.
 */
function getGlobalsForEcmaVersion(ecmaVersion) {
	const versionMap = {
		3: "es3",
		5: "es5",
	};

	if (versionMap[ecmaVersion]) {
		return globals[versionMap[ecmaVersion]];
	}

	const key = ecmaVersion < 2015 ? `es${ecmaVersion + 2009}` : `es${ecmaVersion}`;
	return globals[key];
}

/**
 * Merges two sorted lists into a larger sorted list in O(n) time.
 * @param {Token[]} tokens The list of tokens.
 * @param {Token[]} comments The list of comments.
 * @returns {Token[]} A sorted list of tokens and comments.
 * @private
 */
function sortedMerge(tokens, comments) {
	const result = [];
	let tokenIndex = 0;
	let commentIndex = 0;

	while (tokenIndex < tokens.length || commentIndex < comments.length) {
		const shouldAddToken =
			commentIndex >= comments.length ||
			(tokenIndex < tokens.length &&
				tokens[tokenIndex].range[0] < comments[commentIndex].range[0]);

		result.push(
			shouldAddToken ? tokens[tokenIndex++] : comments[commentIndex++],
		);
	}

	return result;
}

/**
 * Normalizes a value for a global in a config
 * @param {(boolean|string|null)} configuredValue The value given for a global in configuration or in
 * a global directive comment
 * @returns {("readonly"|"writable"|"off")} The value normalized as a string
 * @throws {Error} if global value is invalid
 */
function normalizeConfigGlobal(configuredValue) {
	const normalizationMap = {
		off: "off",
		true: "writable",
		writeable: "writable",
		writable: "writable",
		null: "readonly",
		false: "readonly",
		"false": "readonly",
		readable: "readonly",
		readonly: "readonly",
	};

	if (configuredValue in normalizationMap) {
		return normalizationMap[configuredValue];
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
		(first.range[0] <= second.range[0] &&
			first.range[1] >= second.range[0]) ||
		(second.range[0] <= first.range[0] && second.range[1] >= first.range[0])
	);
}

/**
 * Performs binary search to find the line number containing a given character index.
 * Returns the lower bound - the index of the first element greater than the target.
 * **Please note that the `lineStartIndices` should be sorted in ascending order**.
 * - Time Complexity: O(log n) - Significantly faster than linear search for large files.
 * @param {number[]} lineStartIndices Sorted array of line start indices.
 * @param {number} target The character index to find the line number for.
 * @returns {number} The 1-based line number for the target index.
 * @private
 */
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

/**
 * Ensures that variables representing built-in properties of the Global Object,
 * and any globals declared by special block comments, are present in the global
 * scope.
 * @param {ScopeManager} scopeManager Scope manager.
 * @param {Object|undefined} configGlobals The globals declared in configuration
 * @param {Object|undefined} inlineGlobals The globals declared in the source code
 * @returns {void}
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
 * Sets the given variable names as exported so they won't be triggered by
 * the `no-unused-vars` rule.
 * @param {eslint.Scope} globalScope The global scope to define exports in.
 * @param {Record<string,string>} variables An object whose keys are the variable
 *      names to export.
 * @returns {void}
 */
function markExportedVariables(globalScope, variables) {
	for (const name of Object.keys(variables)) {
		const variable = globalScope.set.get(name);

		if (variable) {
			variable.eslintUsed = true;
			variable.eslintExported = true;
		}
	}
}

/**
 * Initializes cache structure for SourceCode instance.
 * @returns {Map} Cache map with required entries.
 * @private
 */
function initializeCaches() {
	return new Map([
		["scopes", new WeakMap()],
		["vars", new Map()],
		["configNodes", void 0],
		["isGlobalReference", new WeakMap()],
	]);
}

/**
 * Processes constructor arguments to extract configuration.
 * @param {string|Object} textOrConfig The source code text or config object.
 * @param {string} astIfNoConfig The AST if textOrConfig is a string.
 * @returns {Object} Normalized configuration object.
 * @private
 */
function normalizeConstructorArgs(textOrConfig, astIfNoConfig) {
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

/**
 * Processes text for BOM and initializes line information.
 * @param {string} text The source text.
 * @param {boolean} hasBOM Whether BOM was indicated.
 * @returns {Object} Processed text and line information.
 * @private
 */
function processTextAndLines(text, hasBOM) {
	const textHasBOM = text.charCodeAt(0) === 0xfeff;
	const processedText = textHasBOM ? text.slice(1) : text;
	const lines = [];
	const lineStartIndices = [0];
	const lineEndingPattern = astUtils.createGlobalLinebreakMatcher();
	let match;

	while ((match = lineEndingPattern.exec(processedText))) {
		lines.push(
			processedText.slice(lineStartIndices.at(-1), match.index),
		);
		lineStartIndices.push(match.index + match[0].length);
	}
	lines.push(processedText.slice(lineStartIndices.at(-1)));

	return {
		text: processedText,
		hasBOM: textHasBOM || !!hasBOM,
		lines,
		lineStartIndices,
	};
}

/**
 * Marks shebang comments in the AST.
 * @param {ASTNode} ast The AST to process.
 * @param {string} text The source text.
 * @returns {void}
 * @private
 */
function markShebangComments(ast, text) {
	const shebangMatched = text.match(astUtils.shebangPattern);
	const hasShebang =
		shebangMatched &&
		ast.comments.length &&
		ast.comments[0].value === shebangMatched[1];

	if (hasShebang) {
		ast.comments[0].type = "Shebang";
	}
}

/**
 * Creates an analyzer for AST traversal.
 * @param {Array<ITraversalStep>} steps The steps array to populate.
 * @param {boolean} isESTree Whether the AST is ESTree compatible.
 * @returns {Object} The analyzer object.
 * @private
 */
function createAnalyzer(steps, isESTree) {
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

	if (isESTree) {
		analyzer = new CodePathAnalyzer(analyzer);
	}

	return analyzer;
}

/**
 * Validates location object structure.
 * @param {Object} loc The location object to validate.
 * @throws {TypeError} If loc is invalid.
 * @private
 */
function validateLocObject(loc) {
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

/**
 * Validates line number.
 * @param {number} line The line number to validate.
 * @param {number} maxLines The maximum number of lines.
 * @throws {RangeError} If line is invalid.
 * @private
 */
function validateLineNumber(line, maxLines) {
	if (line <= 0) {
		throw new RangeError(
			`Line number out of range (line ${line} requested). Line numbers should be 1-based.`,
		);
	}

	if (line > maxLines) {
		throw new RangeError(
			`Line number out of range (line ${line} requested, but only ${maxLines} lines present).`,
		);
	}
}

/**
 * Validates column number.
 * @param {number} column The column number to validate.
 * @throws {RangeError} If column is invalid.
 * @private
 */
function validateColumnNumber(column) {
	if (column < 0) {
		throw new RangeError(
			`Invalid column number (column ${column} requested).`,
		);
	}
}

/**
 * Filters inline config nodes from comments.
 * @param {Array<ASTNode>} comments The comments array.
 * @returns {Array<ASTNode>} Filtered config nodes.
 * @private
 */
function filterConfigNodes(comments) {
	return comments.filter(comment => {
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
}

/**
 * Processes a global directive from inline config.
 * @param {string} id The global identifier.
 * @param {string} idSetting The global setting value.
 * @param {Object} inlineGlobals The inline globals object to update.
 * @param {Array<Object>} problems The problems array to update.
 * @param {ASTNode} comment The comment node.
 * @private
 */
function processGlobalDirective(id, idSetting, inlineGlobals, problems, comment) {
	let normal