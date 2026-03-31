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
 * Validation error messages
 */
const VALIDATION_ERRORS = {
	EMPTY_AST: "Unexpected empty AST.",
	MISSING_TOKENS: "AST is missing the tokens array.",
	MISSING_COMMENTS: "AST is missing the comments array.",
	MISSING_LOC: "AST is missing location information.",
	MISSING_RANGE: "AST is missing range information",
};

/**
 * Validates that the given AST has the required information.
 * @param {ASTNode} ast The Program node of the AST to check.
 * @throws {TypeError} If the AST doesn't contain the correct information.
 * @returns {void}
 * @private
 */
function validate(ast) {
	if (!ast) {
		throw new TypeError(VALIDATION_ERRORS.EMPTY_AST);
	}

	const checks = [
		[!ast.tokens, VALIDATION_ERRORS.MISSING_TOKENS],
		[!ast.comments, VALIDATION_ERRORS.MISSING_COMMENTS],
		[!ast.loc, VALIDATION_ERRORS.MISSING_LOC],
		[!ast.range, VALIDATION_ERRORS.MISSING_RANGE],
	];

	for (const [condition, message] of checks) {
		if (condition) {
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
	if (ecmaVersion === 3) return globals.es3;
	if (ecmaVersion === 5) return globals.es5;
	if (ecmaVersion < 2015) return globals[`es${ecmaVersion + 2009}`];
	return globals[`es${ecmaVersion}`];
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
		const shouldTakeToken =
			commentIndex >= comments.length ||
			(tokenIndex < tokens.length &&
				tokens[tokenIndex].range[0] < comments[commentIndex].range[0]);

		result.push(
			shouldTakeToken ? tokens[tokenIndex++] : comments[commentIndex++],
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
		readable: "readonly",
		readonly: "readonly",
	};

	const normalized = normalizationMap[configuredValue];

	if (normalized !== undefined) {
		return normalized;
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
 * Initializes cache structure for SourceCode instance
 * @returns {Map} Cache map with required entries
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
 * Processes constructor arguments and returns normalized config
 * @param {string|Object} textOrConfig The source code text or config object.
 * @param {ASTNode} [astIfNoConfig] The Program node of the AST.
 * @returns {Object} Normalized configuration object
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
 * Processes text for BOM and returns cleaned text with BOM flag
 * @param {string} text The source text
 * @param {boolean} hasBOM Indicates if text has BOM
 * @returns {Object} Object with text and hasBOM properties
 * @private
 */
function processBOM(text, hasBOM) {
	const textHasBOM = text.charCodeAt(0) === 0xfeff;
	return {
		text: textHasBOM ? text.slice(1) : text,
		hasBOM: textHasBOM || !!hasBOM,
	};
}

/**
 * Detects and marks shebang comments in AST
 * @param {string} text The source text
 * @param {ASTNode} ast The AST
 * @returns {void}
 * @private
 */
function markShebangComment(text, ast) {
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
 * Splits text into lines and builds line start indices
 * @param {string} text The source text
 * @returns {Object} Object with lines and lineStartIndices arrays
 * @private
 */
function splitTextIntoLines(text) {
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
 * Checks if a comment is a valid inline config node
 * @param {ASTNode} comment The comment node
 * @returns {boolean} True if comment is a valid config node
 * @private
 */
function isValidConfigComment(comment) {
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
}

/**
 * Processes a single inline config comment and extracts directives
 * @param {ASTNode} comment The comment node
 * @param {Array} problems Array to collect problems
 * @param {Array} directives Array to collect directives
 * @returns {void}
 * @private
 */
function processInlineConfigComment(comment, problems, directives) {
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

	if (
		label === "eslint-disable" ||
		label === "eslint-enable" ||
		label === "eslint-disable-next-line" ||
		label === "eslint-disable-line"
	) {
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

/**
 * Processes inline global configuration from comments
 * @param {string} value The directive value
 * @param {ASTNode} comment The comment node
 * @param {Object} inlineGlobals The inline globals object
 * @param {Array} problems Array to collect problems
 * @returns {void}
 * @private
 */
function processInlineGlobalConfig(value, comment, inlineGlobals, problems) {
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
 * Creates an analyzer object for AST traversal
 * @param {Array} steps Array to collect traversal steps
 * @returns {Object} Analyzer object