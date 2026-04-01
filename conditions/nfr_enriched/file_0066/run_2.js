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

const astUtils = require("./utils/ast-utils");

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

		// Initialize configuration from context options
		initializeOptions();

		/**
		 * Initializes indent type and size from context options
		 */
		function initializeOptions() {
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

			if (context.options[1]) {
				applyUserOptions(context.options[1]);
			}
		}

		/**
		 * Applies user-provided options to the configuration
		 * @param {Object} opts User options
		 */
		function applyUserOptions(opts) {
			options.SwitchCase = opts.SwitchCase || 0;

			applyVariableDeclaratorOptions(opts.VariableDeclarator);
			applyNumericOption("outerIIFEBody", opts.outerIIFEBody);
			applyNumericOption("MemberExpression", opts.MemberExpression);
			applyObjectOption("FunctionDeclaration", opts.FunctionDeclaration);
			applyObjectOption("FunctionExpression", opts.FunctionExpression);
			applyObjectOption("CallExpression", opts.CallExpression);
			applyArrayOrStringOption("ArrayExpression", opts.ArrayExpression);
			applyArrayOrStringOption("ObjectExpression", opts.ObjectExpression);
		}

		/**
		 * Applies variable declarator options
		 * @param {number|Object} rules Variable declarator rules
		 */
		function applyVariableDeclaratorOptions(rules) {
			if (typeof rules === "number") {
				options.VariableDeclarator = {
					var: rules,
					let: rules,
					const: rules,
				};
			} else if (typeof rules === "object") {
				Object.assign(options.VariableDeclarator, rules);
			}
		}

		/**
		 * Applies numeric option to configuration
		 * @param {string} key Option key
		 * @param {number} value Option value
		 */
		function applyNumericOption(key, value) {
			if (typeof value === "number") {
				options[key] = value;
			}
		}

		/**
		 * Applies object option to configuration
		 * @param {string} key Option key
		 * @param {Object} value Option value
		 */
		function applyObjectOption(key, value) {
			if (typeof value === "object") {
				Object.assign(options[key], value);
			}
		}

		/**
		 * Applies array or string option to configuration
		 * @param {string} key Option key
		 * @param {number|string} value Option value
		 */
		function applyArrayOrStringOption(key, value) {
			if (typeof value === "number" || typeof value === "string") {
				options[key] = value;
			}
		}

		/**
		 * Creates an error message for a line with expected/actual indentation
		 * @param {number} expectedAmount Expected indentation characters
		 * @param {number} actualSpaces Actual indentation spaces
		 * @param {number} actualTabs Actual indentation tabs
		 * @returns {Object} Error message data
		 */
		function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
			const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
			const foundStatement = buildFoundStatement(actualSpaces, actualTabs);

			return {
				expected: expectedStatement,
				actual: foundStatement,
			};
		}

		/**
		 * Builds the "found" statement for error messages
		 * @param {number} actualSpaces Actual spaces
		 * @param {number} actualTabs Actual tabs
		 * @returns {string} Found statement
		 */
		function buildFoundStatement(actualSpaces, actualTabs) {
			const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
			const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`;

			if (actualSpaces > 0 && actualTabs > 0) {
				return `${actualSpaces} ${foundSpacesWord} and ${actualTabs} ${foundTabsWord}`;
			}
			if (actualSpaces > 0) {
				return indentType === "space" ? actualSpaces : `${actualSpaces} ${foundSpacesWord}`;
			}
			if (actualTabs > 0) {
				return indentType === "tab" ? actualTabs : `${actualTabs} ${foundTabsWord}`;
			}
			return "0";
		}

		/**
		 * Reports an indent violation
		 * @param {ASTNode} node Node violating the rule
		 * @param {number} needed Expected indentation
		 * @param {number} gottenSpaces Actual spaces
		 * @param {number} gottenTabs Actual tabs
		 * @param {Object} [loc] Error location
		 * @param {boolean} isLastNodeCheck Is last node check
		 */
		function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
			if (gottenSpaces && gottenTabs) {
				return;
			}

			const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);
			const textRange = calculateTextRange(node, gottenSpaces, gottenTabs, isLastNodeCheck);

			context.report({
				node,
				loc,
				messageId: "expected",
				data: createErrorMessageData(needed, gottenSpaces, gottenTabs),
				fix: fixer => fixer.replaceTextRange(textRange, desiredIndent),
			});
		}

		/**
		 * Calculates the text range for indentation fix
		 * @param {ASTNode} node Node to fix
		 * @param {number} gottenSpaces Actual spaces
		 * @param {number} gottenTabs Actual tabs
		 * @param {boolean} isLastNodeCheck Is last node check
		 * @returns {Array} Text range [start, end]
		 */
		function calculateTextRange(node, gottenSpaces, gottenTabs, isLastNodeCheck) {
			const indentLength = gottenSpaces + gottenTabs;

			if (isLastNodeCheck) {
				return [
					node.range[1] - node.loc.end.column,
					node.range[1] - node.loc.end.column + indentLength,
				];
			}
			return [
				node.range[0] - node.loc.start.column,
				node.range[0] - node.loc.start.column + indentLength,
			];
		}

		/**
		 * Gets the actual indent of a node
		 * @param {ASTNode|Token} node Node to examine
		 * @param {boolean} [byLastLine=false] Get indent of last line
		 * @returns {Object} Indent info with space, tab, goodChar, badChar
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
				srcCharsBeforeNode.findIndex(char => char !== " " && char !== "\t"),
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
		 * Checks if node is first in its line
		 * @param {ASTNode} node Node to check
		 * @param {boolean} [byEndLocation=false] Check by end position
		 * @returns {boolean} True if first in line
		 */
		function isNodeFirstInLine(node, byEndLocation) {
			const firstToken = byEndLocation === true
				? sourceCode.getLastToken(node, 1)
				: sourceCode.getTokenBefore(node);
			const startLine = byEndLocation === true
				? node.loc.end.line
				: node.loc.start.line;
			const endLine = firstToken ? firstToken.loc.end.line : -1;

			return startLine !== endLine;
		}

		/**
		 * Checks if node starts and ends on same line
		 * @param {ASTNode} node Node to check
		 * @returns {boolean} True if single line
		 */
		function isSingleLineNode(node) {
			const lastToken = sourceCode.getLastToken(node);
			return node.loc.start.line === lastToken.loc.end.line;
		}

		/**
		 * Gets parent node by type
		 * @param {ASTNode} node Node to examine
		 * @param {string} type Type to find
		 * @param {string[]} stopAtList Stop points
		 * @returns {ASTNode|null} Parent node or null
		 */
		function getParentNodeByType(node, type, stopAtList) {
			let parent = node.parent;
			const stopAtSet = new Set(stopAtList || ["Program"]);

			while (
				parent.type !== type &&
				!stopAtSet.has(parent.type) &&
				parent.type !== "Program"
			) {
				parent = parent.parent;
			}

			return parent.type === type ? parent : null;
		}

		/**
		 * Gets the VariableDeclarator node
		 * @param {ASTNode} node Node to examine
		 * @returns {ASTNode|null} VariableDeclarator or null
		 */
		function getVariableDeclaratorNode(node) {
			return getParentNodeByType(node, "VariableDeclarator");
		}

		/**
		 * Checks if node is in variable declaration on top
		 * @param {ASTNode} node Node to check
		 * @param {ASTNode} varNode Variable node
		 * @returns {boolean} True if in var on top
		 */
		function isNodeInVarOnTop(node, varNode) {