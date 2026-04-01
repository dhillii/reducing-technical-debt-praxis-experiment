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

/**
 * Validates that the given AST has the required information.
 * @param {ASTNode} ast The Program node of the AST to check.
 * @throws {TypeError} If the AST doesn't contain the correct information.
 * @returns {void}
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
 * Retrieves globals for ES3.
 * @returns {Object} The globals for ES3.
 * @private
 */
function getES3Globals() {
	return globals.es3;
}

/**
 * Retrieves globals for ES5.
 * @returns {Object} The globals for ES5.
 * @private
 */
function getES5Globals() {
	return globals.es5;
}

/**
 * Retrieves globals for versions before ES2015.
 * @param {number} ecmaVersion The version to retrieve globals for.
 * @returns {Object} The globals for the given ecmaVersion.
 * @private
 */
function getPreES2015Globals(ecmaVersion) {
	return globals[`es${ecmaVersion + 2009}`];
}

/**
 * Retrieves globals for ES2015 and later.
 * @param {number} ecmaVersion The version to retrieve globals for.
 * @returns {Object} The globals for the given ecmaVersion.
 * @private
 */
function getES2015PlusGlobals(ecmaVersion) {
	return globals[`es${ecmaVersion}`];
}

/**
 * Retrieves globals for the given ecmaVersion.
 * @param {number} ecmaVersion The version to retrieve globals for.
 * @returns {Object} The globals for the given ecmaVersion.
 * @private
 */
function getGlobalsForEcmaVersion(ecmaVersion) {
	switch (ecmaVersion) {
		case 3:
			return getES3Globals();

		case 5:
			return getES5Globals();

		default:
			if (ecmaVersion < 2015) {
				return getPreES2015Globals(ecmaVersion);
			}

			return getES2015PlusGlobals(ecmaVersion);
	}
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
 * Normalizes a value for a global in a config
 * @param {(boolean|string|null)} configuredValue The value given for a global in configuration or in
 * a global directive comment
 * @returns {("readonly"|"writable"|"off")} The value normalized as a string
 * @throws {Error} if global value is invalid
 * @private
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
 * Calculates the midpoint for binary search using Math.trunc for integer division.
 * @param {number} low The lower bound.
 * @param {number} high The upper bound.
 * @returns {number} The truncated midpoint.
 * @private
 */
function calculateMidpoint(low, high) {
	return Math.trunc((low + high) / 2);
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
		const mid = calculateMidpoint(low, high);

		if (target < lineStartIndices[mid]) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}

	return low;
}

//-----------------------------------------------------------------------------
// Directive Comments
//-----------------------------------------------------------------------------

/**
 * Ensures that variables representing built-in properties of the Global Object,
 * and any globals declared by special block comments, are present in the global
 * scope.
 * @param {ScopeManager} scopeManager Scope manager.
 * @param {Object|undefined} configGlobals The globals declared in configuration
 * @param {Object|undefined} inlineGlobals The globals declared in the source code
 * @returns {void}
 * @private
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
 * @private
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

/**
 * Checks if a comment is a shebang comment.
 * @param {ASTNode} comment The comment node to check.
 * @returns {boolean} True if the comment is a shebang.
 * @private
 */
function isShebangComment(comment) {
	return comment.type === "Shebang";
}

/**
 * Parses and validates a directive from a comment.
 * @param {string} commentValue The value of the comment.
 * @returns {Object|null} The parsed directive or null if not a valid directive.
 * @private
 */
function parseAndValidateDirective(commentValue) {
	const directive = commentParser.parseDirective(commentValue);

	if (!directive) {
		return null;
	}

	if (!directivesPattern.test(directive.label)) {
		return null;
	}

	return directive;
}

/**
 * Checks if a comment is a valid inline config node.
 * @param {ASTNode} comment The comment node to check.
 * @returns {boolean} True if the comment is a valid inline config node.
 * @private
 */
function isValidInlineConfigNode(comment) {
	if (isShebangComment(comment)) {
		return false;
	}

	const directive = parseAndValidateDirective(comment.value);

	if (!directive) {
		return false;
	}

	// only certain comment types are supported as line comments
	return (
		comment.type !== "Line" ||
		/^eslint-disable-(?:next-)?line$/u.test(directive.label)
	);
}

/**
 * Checks if a directive label is a line comment directive.
 * @param {string} label The directive label.
 * @returns {boolean} True if the label is a line comment directive.
 * @private
 */
function isLineCommentDirective(label) {
	return /^eslint-disable-(?:next-)?line$/u.test(label);
}

/**
 * Validates that a disable-line directive does not span multiple lines.
 * @param {string} label The directive label.
 * @param {ASTNode} comment The comment node.
 * @returns {Object|null} A problem object if validation fails, null otherwise.
 * @private
 */
function validateDisableLineDirective(label, comment) {
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

/**
 * Creates a Directive object from parsed directive data.
 * @param {string} label The directive label.
 * @param {string} value The directive value.
 * @param {string} justificationPart The justification text.
 * @returns {Directive} The created Directive object.
 * @private
 */
function createDirective(label, value, justificationPart) {
	const directiveType = label.slice("eslint-".length);

	return new Directive({
		type: directiveType,
		node: null, // Will be set by caller
		value,
		justification: justificationPart,
	});
}

/**
 * Processes a disable directive comment and adds it to the directives array.
 * @param {ASTNode} comment The comment node.
 * @param {string} label The directive label.
 * @param {string} value The directive value.
 * @param {string} justificationPart The justification text.
 * @param {Array} directives The directives array to add to.
 * @returns {void}
 * @private
 */
function processDisableDirective(comment, label, value, justificationPart, directives) {
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

/**
 * Processes a single inline config comment and extracts directives and problems.
 * @param {ASTNode} comment The comment node.
 * @param {Array} problems The problems array to add to.
 * @param {Array} directives The directives array to add to.
 * @returns {void}
 * @private
 */
function processInlineConfigComment(comment, problems, directives) {
	const {
		label,
		value,
		justification: justificationPart,
	} = commentParser.parseDirective(comment.value);

	// Extract the directive value
	const lineCommentSupported = isLineCommentDirective(label);

	if (comment.type === "Line" && !lineCommentSupported) {
		return;
	}

	// Validate the directive does not span multiple lines
	const validationProblem = validateDisableLineDirective(label, comment);

	if (validationProblem) {
		problems.push(validationProblem);
		return;
	}

	// Extract the directive value and create the Directive object
	switch (label) {
		case "eslint-disable":
		case "eslint-enable":
		case "eslint-disable-next-line":
		case "eslint-disable-line":
			processDisableDirective(comment, label, value, justificationPart, directives);
			break;

		// no default
	}
}

/**
 * Processes a global configuration from an inline comment.
 * @param {string} id The global identifier.
 * @param {string} idSetting The global setting value.
 * @param {Object} inlineGlobals The inline globals object to update.
 * @param {Array} problems The problems array to add to.
 * @param {ASTNode} comment The comment node.
 * @