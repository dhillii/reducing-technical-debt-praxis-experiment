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
 * Maps ecmaVersion to globals lookup strategy.
 * @type {Object<number, string>}
 * @private
 */
const ecmaVersionGlobalsMap = {
	3: "es3",
	5: "es5",
};

/**
 * Retrieves globals for the given ecmaVersion.
 * @param {number} ecmaVersion The version to retrieve globals for.
 * @returns {Object} The globals for the given ecmaVersion.
 */
function getGlobalsForEcmaVersion(ecmaVersion) {
	if (ecmaVersionGlobalsMap[ecmaVersion]) {
		return globals[ecmaVersionGlobalsMap[ecmaVersion]];
	}

	if (ecmaVersion < 2015) {
		return globals[`es${ecmaVersion + 2009}`];
	}

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
 * Maps global configuration values to normalized strings.
 * @type {Object<string|boolean|null, string>}
 * @private
 */
const globalConfigNormalizers = {
	off: "off",
	true: "writable",
	"true": "writable",
	writeable: "writable",
	writable: "writable",
	null: "readonly",
	false: "readonly",
	"false": "readonly",
	readable: "readonly",
	readonly: "readonly",
};

/**
 * Normalizes a value for a global in a config
 * @param {(boolean|string|null)} configuredValue The value given for a global in configuration or in
 * a global directive comment
 * @returns {("readonly"|"writable"|"off")} The value normalized as a string
 * @throws {Error} if global value is invalid
 */
function normalizeConfigGlobal(configuredValue) {
	const normalized = globalConfigNormalizers[configuredValue];

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
		const mid = Math.trunc((low + high) / 2);

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
	Object.keys(variables).forEach(name => {
		const variable = globalScope.set.get(name);

		if (variable) {
			variable.eslintUsed = true;
			variable.eslintExported = true;
		}
	});
}

/**
 * Checks if a comment is a shebang.
 * @param {Object} comment The comment node to check.
 * @returns {boolean} True if the comment is a shebang.
 * @private
 */
function isShebangComment(comment) {
	return comment.type === "Shebang";
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
 * Checks if a comment should be included as an inline config node.
 * @param {Object} comment The comment node to check.
 * @returns {boolean} True if the comment is an inline config node.
 * @private
 */
function isInlineConfigNode(comment) {
	if (isShebangComment(comment)) {
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
		comment.type !== "Line" || isLineCommentDirective(directive.label)
	);
}

/**
 * Directive type strategies for processing different directive labels.
 * @type {Object<string, Function>}
 * @private
 */
const directiveProcessors = {
	"eslint-disable": (label, value, justificationPart) => ({
		type: "disable",
		value,
		justification: justificationPart,
	}),
	"eslint-enable": (label, value, justificationPart) => ({
		type: "enable",
		value,
		justification: justificationPart,
	}),
	"eslint-disable-next-line": (label, value, justificationPart) => ({
		type: "disable-next-line",
		value,
		justification: justificationPart,
	}),
	"eslint-disable-line": (label, value, justificationPart) => ({
		type: "disable-line",
		value,
		justification: justificationPart,
	}),
};

/**
 * Processes a directive comment and returns directive configuration.
 * @param {string} label The directive label.
 * @param {string} value The directive value.
 * @param {string} justificationPart The justification text.
 * @returns {Object|null} The directive configuration or null if not a recognized directive.
 * @private
 */
function processDirectiveLabel(label, value, justificationPart) {
	const processor = directiveProcessors[label];

	if (!processor) {
		return null;
	}

	return processor(label, value, justificationPart);
}

/**
 * Inline config node processors for different directive labels.
 * @type {Object<string, Function>}
 * @private
 */
const inlineConfigProcessors = {
	exported: (commentParser, value, comment, exportedVariables, inlineGlobals, problems) => {
		Object.assign(
			exportedVariables,
			commentParser.parseListConfig(value),
		);
	},
	globals: (commentParser, value, comment, exportedVariables, inlineGlobals, problems) => {
		processGlobalsDirective(commentParser, value, comment, inlineGlobals, problems);
	},
	global: (commentParser, value, comment, exportedVariables, inlineGlobals, problems) => {
		processGlobalsDirective(commentParser, value, comment, inlineGlobals, problems);
	},
	eslint: (commentParser, value, comment, exportedVariables, inlineGlobals, problems) => {
		const parseResult = commentParser.parseJSONLikeConfig(value);

		if (parseResult.ok) {
			// Store in a temporary location for later retrieval
			if (!inlineGlobals.__eslintConfigs) {
				inlineGlobals.__eslintConfigs = [];
			}
			inlineGlobals.__eslintConfigs.push({
				config: {
					rules: parseResult.config,
				},
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
	"eslint-env": (commentParser, value, comment, exportedVariables, inlineGlobals, problems) => {
		problems.push({
			ruleId: null,
			loc: comment.loc,
			message:
				"/* eslint-env */ comments are no longer supported.",
		});
	},
};

/**
 * Processes globals directive and updates inlineGlobals and problems.
 * @param {Object} commentParser The comment parser instance.
 * @param {string} value The directive value.
 * @param {Object} comment The comment node.
 * @param {Object} inlineGlobals The inline globals object.
 * @param {Array} problems The problems array.
 * @private
 */
function processGlobalsDirective(commentParser, value, comment, inlineGlobals, problems) {
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
 * Processes an inline config node using the appropriate processor.
 * @param {Object} commentParser The comment parser instance.
 * @param {string} label The directive label.
 * @param {string} value The directive value.
 * @param {Object} comment The comment node.
 * @param {Object} exportedVariables The exported variables object.
 * @param {Object} inlineGlobals The inline globals object.
 * @param {Array} problems The problems array.
 * @private
 */
function processInlineConfigNode(commentParser, label, value, comment, exportedVariables, inlineGlobals, problems) {
	const processor = inlineConfigProcessors[label];

	if (processor) {
		processor(commentParser, value, comment, exportedVariables, inlineGlobals, problems);
	}
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

const caches = Symbol("caches");

/**