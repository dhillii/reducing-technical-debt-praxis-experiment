```javascript
/**
 * @fileoverview This option sets a specific tab width for your code
 *
 * This rule has been ported and modified from nodeca.
 * @author Vitaly Puzrin
 * @author Gyandeep Singh
 * @deprecated in ESLint v4.0.0
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------
// this rule has known coverage issues, but it's deprecated and shouldn't be updated in the future anyway.
/* c8 ignore next */
/** @type {import('../types').Rule.RuleModule} */
module.exports = {
	meta: {
		type: "layout",

		docs: {
			description: "Enforce consistent indentation",
			recommended: false,
			url: "https://eslint.org/docs/latest/rules/indent-legacy",
		},

		deprecated: {
			message: "Formatting rules are being moved out of ESLint core.",
			url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
			deprecatedSince: "4.0.0",
			availableUntil: "11.0.0",
			replacedBy: [
				{
					message:
						"ESLint Stylistic now maintains deprecated stylistic core rules.",
					url: "https://eslint.style/guide/migration",
					plugin: {
						name: "@stylistic/eslint-plugin",
						url: "https://eslint.style",
					},
					rule: {
						name: "indent",
						url: "https://eslint.style/rules/indent",
					},
				},
			],
		},

		fixable: "whitespace",

		schema: [
			{
				oneOf: [
					{
						enum: ["tab"],
					},
					{
						type: "integer",
						minimum: 0,
					},
				],
			},
			{
				type: "object",
				properties: {
					SwitchCase: {
						type: "integer",
						minimum: 0,
					},
					VariableDeclarator: {
						oneOf: [
							{
								type: "integer",
								minimum: 0,
							},
							{
								type: "object",
								properties: {
									var: {
										type: "integer",
										minimum: 0,
									},
									let: {
										type: "integer",
										minimum: 0,
									},
									const: {
										type: "integer",
										minimum: 0,
									},
								},
							},
						],
					},
					outerIIFEBody: {
						type: "integer",
						minimum: 0,
					},
					MemberExpression: {
						type: "integer",
						minimum: 0,
					},
					FunctionDeclaration: {
						type: "object",
						properties: {
							parameters: {
								oneOf: [
									{
										type: "integer",
										minimum: 0,
									},
									{
										enum: ["first"],
									},
								],
							},
							body: {
								type: "integer",
								minimum: 0,
							},
						},
					},
					FunctionExpression: {
						type: "object",
						properties: {
							parameters: {
								oneOf: [
									{
										type: "integer",
										minimum: 0,
									},
									{
										enum: ["first"],
									},
								],
							},
							body: {
								type: "integer",
								minimum: 0,
							},
						},
					},
					CallExpression: {
						type: "object",
						properties: {
							parameters: {
								oneOf: [
									{
										type: "integer",
										minimum: 0,
									},
									{
										enum: ["first"],
									},
								],
							},
						},
					},
					ArrayExpression: {
						oneOf: [
							{
								type: "integer",
								minimum: 0,
							},
							{
								enum: ["first"],
							},
						],
					},
					ObjectExpression: {
						oneOf: [
							{
								type: "integer",
								minimum: 0,
							},
							{
								enum: ["first"],
							},
						],
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			expected:
				"Expected indentation of {{expected}} but found {{actual}}.",
		},
	},

	create(context) {
		const DEFAULT_VARIABLE_INDENT = 1;
		const DEFAULT_PARAMETER_INDENT = null;
		const DEFAULT_FUNCTION_BODY_INDENT = 1;

		let indentType = "space";
		let indentSize = 4;
		const options = {
			SwitchCase: 0,
			VariableDeclarator: {
				var: DEFAULT_VARIABLE_INDENT,
				let: DEFAULT_VARIABLE_INDENT,
				const: DEFAULT_VARIABLE_INDENT,
			},
			outerIIFEBody: null,
			FunctionDeclaration: {
				parameters: DEFAULT_PARAMETER_INDENT,
				body: DEFAULT_FUNCTION_BODY_INDENT,
			},
			FunctionExpression: {
				parameters: DEFAULT_PARAMETER_INDENT,
				body: DEFAULT_FUNCTION_BODY_INDENT,
			},
			CallExpression: {
				arguments: DEFAULT_PARAMETER_INDENT,
			},
			ArrayExpression: 1,
			ObjectExpression: 1,
		};

		const sourceCode = context.sourceCode;
		const caseIndentStore = {};

		// ========== Configuration Processing ==========

		/**
		 * Processes the indent type from context options
		 * @returns {void}
		 */
		function processIndentType() {
			if (!context.options.length) {
				return;
			}

			if (context.options[0] === "tab") {
				indentSize = 1;
				indentType = "tab";
			} else if (typeof context.options[0] === "number") {
				indentSize = context.options[0];
				indentType = "space";
			}
		}

		/**
		 * Processes variable declarator options
		 * @param {Object} opts - The options object
		 * @returns {void}
		 */
		function processVariableDeclaratorOptions(opts) {
			const variableDeclaratorRules = opts.VariableDeclarator;

			if (typeof variableDeclaratorRules === "number") {
				options.VariableDeclarator = {
					var: variableDeclaratorRules,
					let: variableDeclaratorRules,
					const: variableDeclaratorRules,
				};
			} else if (typeof variableDeclaratorRules === "object") {
				Object.assign(
					options.VariableDeclarator,
					variableDeclaratorRules,
				);
			}
		}

		/**
		 * Processes function and call expression options
		 * @param {Object} opts - The options object
		 * @returns {void}
		 */
		function processFunctionAndCallOptions(opts) {
			if (typeof opts.outerIIFEBody === "number") {
				options.outerIIFEBody = opts.outerIIFEBody;
			}

			if (typeof opts.MemberExpression === "number") {
				options.MemberExpression = opts.MemberExpression;
			}

			if (typeof opts.FunctionDeclaration === "object") {
				Object.assign(
					options.FunctionDeclaration,
					opts.FunctionDeclaration,
				);
			}

			if (typeof opts.FunctionExpression === "object") {
				Object.assign(
					options.FunctionExpression,
					opts.FunctionExpression,
				);
			}

			if (typeof opts.CallExpression === "object") {
				Object.assign(options.CallExpression, opts.CallExpression);
			}
		}

		/**
		 * Processes array and object expression options
		 * @param {Object} opts - The options object
		 * @returns {void}
		 */
		function processArrayAndObjectOptions(opts) {
			if (
				typeof opts.ArrayExpression === "number" ||
				typeof opts.ArrayExpression === "string"
			) {
				options.ArrayExpression = opts.ArrayExpression;
			}

			if (
				typeof opts.ObjectExpression === "number" ||
				typeof opts.ObjectExpression === "string"
			) {
				options.ObjectExpression = opts.ObjectExpression;
			}
		}

		/**
		 * Processes all configuration options
		 * @returns {void}
		 */
		function processOptions() {
			processIndentType();

			if (!context.options[1]) {
				return;
			}

			const opts = context.options[1];
			options.SwitchCase = opts.SwitchCase || 0;

			processVariableDeclaratorOptions(opts);
			processFunctionAndCallOptions(opts);
			processArrayAndObjectOptions(opts);
		}

		processOptions();

		// ========== Error Reporting ==========

		/**
		 * Creates an error message for a line, given the expected/actual indentation.
		 * @param {number} expectedAmount The expected amount of indentation characters for this line
		 * @param {number} actualSpaces The actual number of indentation spaces that were found on this line
		 * @param {number} actualTabs The actual number of indentation tabs that were found on this line
		 * @returns {string} An error message for this line
		 */
		function createErrorMessageData(
			expectedAmount,
			actualSpaces,
			actualTabs,
		) {
			const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
			const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
			const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`;
			let foundStatement;

			if (actualSpaces > 0 && actualTabs > 0) {
				foundStatement = `${actualSpaces} ${foundSpacesWord} and ${actualTabs} ${foundTabsWord}`;
			} else if (actualSpaces > 0) {
				foundStatement =
					indentType === "space"
						? actualSpaces
						: `${actualSpaces} ${foundSpacesWord}`;
			} else if (actualTabs > 0) {
				foundStatement =
					indentType === "tab"
						? actualTabs
						: `${actualTabs} ${foundTabsWord}`;
			} else {
				foundStatement = "0";
			}
			return {
				expected: expectedStatement,
				actual: foundStatement,
			};
		}

		/**
		 * Reports a given indent violation
		 * @param {ASTNode} node Node violating the indent rule
		 * @param {number} needed Expected indentation character count
		 * @param {number} gottenSpaces Indentation space count in the actual node/code
		 * @param {number} gottenTabs Indentation tab count in the actual node/code
		 * @param {Object} [loc] Error line and column location
		 * @param {boolean} isLastNodeCheck Is the error for last node check
		 * @returns {void}
		 */
		function report(
			node,
			needed,
			gottenSpaces,
			gottenTabs,
			loc,
			isLastNodeCheck,
		) {
			if (gottenSpaces && gottenTabs) {
				return;
			}

			const desiredIndent = (indentType === "space" ? " " : "\t").repeat(
				needed,
			);

			const textRange = isLastNodeCheck
				? [
						node.range[1] - node.loc.end.column,
						node.range[1] -
							node.loc.end.column +
							gottenSpaces +
							gottenTabs,
					]
				: [
						node.range[0] - node.loc.start.column,
						node.range[0] -
							node.loc.start.column +
							gottenSpaces +
							gottenTabs,
					];

			context.report({
				node,
				loc,
				messageId: "expected",
				data: createErrorMessageData(needed, gottenSpaces, gottenTabs),
				fix: fixer => fixer.replaceTextRange(textRange, desiredIndent),
			});
		}

		// ========== Node Indent Utilities ==========

		/**
		 * Get the actual indent of node
		 * @param {ASTNode|Token} node Node to examine
		 * @param {boolean} [byLastLine=false] get indent of node's last line
		 * @returns {Object} The node's indent with space, tab, goodChar, and badChar properties
		 */
		function getNodeIndent(node, byLastLine) {
			const token = byLastLine
				? sourceCode.getLastToken(node)
				: sourceCode.getFirstToken(node);
			const srcCharsBeforeNode = sourceCode
				.getText(token, token.loc.start.column)
				.split("");
			const indentChars = srcCharsBeforeNode.slice(
				0,
				srcCharsBeforeNode.findIndex(
					char => char !== " " && char !== "\t",
				),
			);
			const spaces = indentChars.filter(char => char === " ").length;
			const tabs = indentChars.filter(char => char === "\t").length;

			return {
				space: spaces,
				tab: tabs,
				goodChar: indentType === "space" ? spaces : tabs,
				badChar: indentType === "space" ? tabs : spaces,
			};
		}

		/**
		 * Checks node is the first in its own start line. By default it looks by start line.
		 * @param {ASTNode} node The node to check
		 * @param {boolean} [byEndLocation=false] Lookup based on start position or end
		 * @returns {boolean} true if its the first in the its start line
		 */
		function isNodeFirstInLine(node, byEndLocation) {
			const firstToken =
					byEndLocation === true
						? sourceCode.getLastToken(node, 1)
						: sourceCode.getTokenBefore(node),
				startLine =
					byEndLocation === true
						? node.loc.end.line
						: node.loc.start.line,
				endLine = firstToken ? firstToken.loc.end.line : -1;

			return startLine !== endLine;
		}

		/**
		 * Checks if the given node starts and ends on the same line
		 * @param {ASTNode} node The node to check
		 * @returns {boolean} Whether or not the block starts and ends on the same line.
		 */
		function isSingleLineNode(node) {
			const lastToken = sourceCode.getLastToken(node),
				startLine = node.loc.start.line,
				endLine = lastToken.loc.end.line;

			return startLine === endLine;
		}

		// ========== Node Type Predicates ==========

		/**
		 * Check if the node is part of the multi-line variable declaration.
		 * @param {ASTNode} node node to check
		 * @param {ASTNode} varNode variable declaration node to check against
		 * @returns {boolean} True if all the above condition satisfy
		 */
		function isNodeInVarOnTop(node, varNode) {
			return (
				varNode &&
				varNode.parent.loc.start.line === node.loc.start.line &&
				varNode.parent.declarations.length > 1
			);
		}

		/**
		 * Check to see if the argument before the callee node is multi-line
		 * @param {ASTNode} node node to check
		 * @returns {boolean} True if arguments are multi-line
		 */
		function isArgBeforeCalleeNodeMultiline(node) {
			const parent = node.parent;

			if (parent.