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
// Constants
//------------------------------------------------------------------------------

const commentParser = new ConfigCommentParser();
const caches = Symbol("caches");
const ECMA_VERSION_MAPPING = {
	3: "es3",
	5: "es5",
};
const DIRECTIVE_LABELS = {
	DISABLE: "eslint-disable",
	ENABLE: "eslint-enable",
	DISABLE_NEXT_LINE: "eslint-disable-next-line",
	DISABLE_LINE: "eslint-disable-line",
};
const DIRECTIVE_LABEL_PATTERN = /^eslint-disable-(?:next-)?line$/u;
const DIRECTIVE_TYPE_PATTERN = /^eslint-/;
const SHEBANG_PATTERN = /^eslint-disable-(?:next-)?line$/u;

//------------------------------------------------------------------------------
// Validation Utilities
//------------------------------------------------------------------------------

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

//------------------------------------------------------------------------------
// Global and Configuration Utilities
//------------------------------------------------------------------------------

/**
 * Retrieves globals for the given ecmaVersion.
 * @param {number} ecmaVersion The version to retrieve globals for.
 * @returns {Object} The globals for the given ecmaVersion.
 */
function getGlobalsForEcmaVersion(ecmaVersion) {
	if (ECMA_VERSION_MAPPING[ecmaVersion]) {
		return globals[ECMA_VERSION_MAPPING[ecmaVersion]];
	}

	if (ecmaVersion < 2015) {
		return globals[`es${ecmaVersion + 2009}`];
	}

	return globals[`es${ecmaVersion}`];
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

	const key = String(configuredValue).toLowerCase();

	if (key in normalizationMap) {
		return normalizationMap[key];
	}

	throw new Error(
		`'${configuredValue}' is not a valid configuration for a global (use 'readonly', 'writable', or 'off')`,
	);
}

//------------------------------------------------------------------------------
// Token and Node Utilities
//------------------------------------------------------------------------------

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

		if (shouldTakeToken) {
			result.push(tokens[tokenIndex++]);
		} else {
			result.push(comments[commentIndex++]);
		}
	}

	return result;
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

//------------------------------------------------------------------------------
// Scope and Variable Utilities
//------------------------------------------------------------------------------

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

//------------------------------------------------------------------------------
// Directive Parsing Utilities
//------------------------------------------------------------------------------

/**
 * Checks if a directive label is a line comment directive.
 * @param {string} label The directive label.
 * @returns {boolean} True if the label is a line comment directive.
 * @private
 */
function isLineCommentDirective(label) {
	return DIRECTIVE_LABEL_PATTERN.test(label);
}

/**
 * Validates a disable-line directive.
 * @param {string} label The directive label.
 * @param {Object} comment The comment node.
 * @returns {Object|null} Problem object if validation fails, null otherwise.
 * @private
 */
function validateDisableLineDirective(label, comment) {
	if (
		label === DIRECTIVE_LABELS.DISABLE_LINE &&
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
 * Creates a Directive object from parsed comment data.
 * @param {string} label The directive label.
 * @param {string} value The directive value.
 * @param {string} justification The justification text.
 * @param {Object} comment The comment node.
 * @returns {Directive|null} The Directive object or null if not applicable.
 * @private
 */
function createDirective(label, value, justification, comment) {
	const directiveLabels = Object.values(DIRECTIVE_LABELS);

	if (!directiveLabels.includes(label)) {
		return null;
	}

	const directiveType = label.replace(DIRECTIVE_TYPE_PATTERN, "");

	return new Directive({
		type: directiveType,
		node: comment,
		value,
		justification,
	});
}

/**
 * Checks if a comment is a valid inline config node.
 * @param {Object} comment The comment node.
 * @returns {boolean} True if the comment is a valid inline config node.
 * @private
 */
function isValidConfigNode(comment) {
	if (comment.type === "Shebang") {
		return false;
	}

	const directive = commentParser.parseDirective(comment.value);

	if (!directive || !directivesPattern.test(directive.label)) {
		return false;
	}

	return (
		comment.type !== "Line" || isLineCommentDirective(directive.label)
	);
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Represents parsed source code.
 * @implements {ISourceCode}
 */
class SourceCode extends TokenStore {
	/**
	 * The cache of steps that were taken while traversing the source code.
	 * @type {Array<ITraversalStep>}
	 */
	#steps;

	/**
	 * Creates a new instance.
	 * @param {string|Object} textOrConfig The source code text or config object.
	 * @param {string} textOrConfig.text The source code text.
	 * @param {ASTNode} textOrConfig.ast The Program node of the AST representing the code. This AST should be created from the text that BOM was stripped.
	 * @param {boolean} textOrConfig.hasBOM Indicates if the text has a Unicode BOM.
	 * @param {Object|null} textOrConfig.parserServices The parser services.
	 * @param {ScopeManager|null} textOrConfig.scopeManager The scope of this source code.
	 * @param {Object|null} textOrConfig.visitorKeys The visitor keys to traverse AST.
	 * @param {ASTNode} [astIfNoConfig] The Program node of the AST representing the code. This AST should be created from the text that BOM was stripped.
	 */
	constructor(textOrConfig, astIfNoConfig) {
		const config = this.#parseConstructorArgs(textOrConfig, astIfNoConfig);

		validate(config.ast);
		super(config.ast.tokens, config.ast.comments);

		this.#initializeCaches();
		this.#initializeProperties(config);
		this.#processShebang(config.ast);
		this.#initializeLines();

		Object.freeze(this);
		Object.freeze(this.lines);
	}

	/**
	 * Parses constructor arguments to extract configuration.
	 * @param {string|Object} textOrConfig The source code text or config object.
	 * @param {ASTNode} astIfNoConfig The AST if textOrConfig is a string.
	 * @returns {Object} Parsed configuration object.
	 * @private
	 */
	#parseConstructorArgs(textOrConfig, astIfNoConfig) {
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
	 * Initializes the cache structures.
	 * @private
	 */
	#initializeCaches() {
		this[caches] = new Map([
			["scopes", new WeakMap()],
			["vars", new Map()],
			["configNodes", void 0],
			["isGlobalReference", new WeakMap()],
		]);
	}

	/**
	 * Initializes source code properties.
	 * @param {Object} config Configuration object.
	 * @private
	 */
	#initializeProperties(config) {
		this.isESTree = config.ast.type === "Program";

		const textHasBOM = config.text.charCodeAt(0) === 0xfeff;

		this.hasBOM = textHasBOM || !!config.hasBOM;
		this.text = textHasBOM ? config.text.slice(1) : config.text;
		this.ast = config.ast;
		this.parserServices = config.