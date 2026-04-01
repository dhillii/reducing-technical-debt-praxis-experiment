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
 * Retrieves globals for pre-2015 ECMAScript versions.
 * @param {number} ecmaVersion The version to retrieve globals for.
 * @returns {Object} The globals for the given ecmaVersion.
 * @private
 */
function getPreES2015Globals(ecmaVersion) {
	return globals[`es${ecmaVersion + 2009}`];
}

/**
 * Retrieves globals for ES2015 and later versions.
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
 * Calculates the midpoint index for binary search.
 * @param {number} low The lower bound index.
 * @param {number} high The upper bound index.
 * @returns {number} The floored midpoint index.
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
// Public Interface
//------------------------------------------------------------------------------

const caches = Symbol("caches");

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
		let text, hasBOM, ast, parserServices, scopeManager, visitorKeys;

		// Process overloading of arguments
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

		/**
		 * General purpose caching for the class.
		 */
		this[caches] = new Map([
			["scopes", new WeakMap()],
			["vars", new Map()],
			["configNodes", void 0],
			["isGlobalReference", new WeakMap()],
		]);

		/**
		 * Indicates if the AST is ESTree compatible.
		 * @type {boolean}
		 */
		this.isESTree = ast.type === "Program";

		/*
		 * Backwards compatibility for BOM handling.
		 *
		 * The `hasBOM` property has been available on the `SourceCode` object
		 * for a long time and is used to indicate if the source contains a BOM.
		 * The linter strips the BOM and just passes the `hasBOM` property to the
		 * `SourceCode` constructor to make it easier for languages to not deal with
		 * the BOM.
		 *
		 * However, the text passed in to the `SourceCode` constructor might still
		 * have a BOM if the constructor is called outside of the linter, so we still
		 * need to check for the BOM in the text.
		 */
		const textHasBOM = text.charCodeAt(0) === 0xfeff;

		/**
		 * The flag to indicate that the source code has Unicode BOM.
		 * @type {boolean}
		 */
		this.hasBOM = textHasBOM || !!hasBOM;

		/**
		 * The original text source code.
		 * BOM was stripped from this text.
		 * @type {string}
		 */
		this.text = textHasBOM ? text.slice(1) : text;

		/**
		 * The parsed AST for the source code.
		 * @type {ASTNode}
		 */
		this.ast = ast;

		/**
		 * The parser services of this source code.
		 * @type {Object}
		 */
		this.parserServices = parserServices || {};

		/**
		 * The scope of this source code.
		 * @type {ScopeManager|null}
		 */
		this.scopeManager = scopeManager || null;

		/**
		 * The visitor keys to traverse AST.
		 * @type {Object}
		 */
		this.visitorKeys = visitorKeys || Traverser.DEFAULT_VISITOR_KEYS;

		// Check the source text for the presence of a shebang since it is parsed as a standard line comment.
		const shebangMatched = this.text.match(astUtils.shebangPattern);
		const hasShebang =
			shebangMatched &&
			ast.comments.length &&
			ast.comments[0].value === shebangMatched[1];

		if (hasShebang) {
			ast.comments[0].type = "Shebang";
		}

		this.tokensAndComments = sortedMerge(ast.tokens, ast.comments);

		/**
		 * The source code split into lines according to ECMA-262 specification.
		 * This is done to avoid each rule needing to do so separately.
		 * @type {string[]}
		 */
		this.lines = [];

		/**
		 * @type {number[]}
		 */
		this.lineStartIndices = [0];

		const lineEndingPattern = astUtils.createGlobalLinebreakMatcher();
		let match;

		/*
		 * Previously, this was implemented using a regex that
		 * matched a sequence of non-linebreak characters followed by a
		 * linebreak, then adding the lengths of the matches. However,
		 * this caused a catastrophic backtracking issue when the end
		 * of a file contained a large number