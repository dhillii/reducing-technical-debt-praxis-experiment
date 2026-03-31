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
		3: globals.es3,
		5: globals.es5,
	};

	if (versionMap[ecmaVersion]) {
		return versionMap[ecmaVersion];
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
		false: "readonly",
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
	Object.keys(variables).forEach(name => {
		const variable = globalScope.set.get(name);

		if (variable) {
			variable.eslintUsed = true;
			variable.eslintExported = true;
		}
	});
}

/**
 * Initializes line information from source text.
 * @param {string} text The source code text.
 * @returns {{lines: string[], lineStartIndices: number[]}} Line information.
 * @private
 */
function initializeLines(text) {
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
 * Detects and marks shebang comments in the AST.
 * @param {string} text The source code text.
 * @param {ASTNode} ast The AST node.
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
 * Checks if a comment is a valid inline configuration node.
 * @param {ASTNode} comment The comment node to check.
 * @returns {boolean} True if the comment is a valid config node.
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
 * Processes a single inline config comment and extracts directives.
 * @param {ASTNode} comment The comment node.
 * @param {Array} directives Array to accumulate directives.
 * @param {Array} problems Array to accumulate problems.
 * @returns {void}
 * @private
 */
function processConfigComment(comment, directives, problems) {
	const {
		label,
		value,
		justification: justificationPart,
	} = commentParser.parseDirective(comment.value);

	const lineCommentSupported =
		/^eslint-disable-(?:next-)?line$/u.test(label);

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

	const validLabels = [
		"eslint-disable",
		"eslint-enable",
		"eslint-disable-next-line",
		"eslint-disable-line",
	];

	if (validLabels.includes(label)) {
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
 * Processes inline global configuration from comments.
 * @param {string} value The directive value.
 * @param {ASTNode} comment The comment node.
 * @param {Object} inlineGlobals Accumulator for inline globals.
 * @param {Array} problems Array to accumulate problems.
 * @returns {void}
 * @private
 */
function processGlobalDirective(value, comment, inlineGlobals, problems) {
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
 * Processes inline eslint configuration from comments.
 * @param {string} value The directive value.
 * @param {ASTNode} comment The comment node.
 * @param {Array} configs Array to accumulate configs.
 * @param {Array} problems Array to accumulate problems.
 * @returns {void}
 * @private
 */
function processEslintDirective(value, comment, configs, problems) {
	const parseResult = commentParser.parseJSONLikeConfig(value);

	if (parseResult.ok) {
		configs.push({
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
		let text, hasBOM, ast, parserServices, scop