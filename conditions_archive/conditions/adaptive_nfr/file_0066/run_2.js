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

		// ========== Configuration Parsing ==========

		/**
		 * Parses the indent type from context options
		 * @returns {void}
		 */
		function parseIndentType() {
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
		 * Applies variable declarator rules from options
		 * @param {Object} opts The options object
		 * @returns {void}
		 */
		function applyVariableDeclaratorRules(opts) {
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
		 * Applies function and call expression rules from options
		 * @param {Object} opts The options object
		 * @returns {void}
		 */
		function applyFunctionAndCallRules(opts) {
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
		 * Applies array and object expression rules from options
		 * @param {Object} opts The options object
		 * @returns {void}
		 */
		function applyArrayAndObjectRules(opts) {
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
		 * Applies simple numeric option rules from options
		 * @param {Object} opts The options object
		 * @returns {void}
		 */
		function applySimpleNumericRules(opts) {
			options.SwitchCase = opts.SwitchCase || 0;

			if (typeof opts.outerIIFEBody === "number") {
				options.outerIIFEBody = opts.outerIIFEBody;
			}

			if (typeof opts.MemberExpression === "number") {
				options.MemberExpression = opts.MemberExpression;
			}
		}

		/**
		 * Parses all context options and applies them
		 * @returns {void}
		 */
		function parseContextOptions() {
			parseIndentType();

			if (!context.options[1]) {
				return;
			}

			const opts = context.options[1];

			applySimpleNumericRules(opts);
			applyVariableDeclaratorRules(opts);
			applyFunctionAndCallRules(opts);
			applyArrayAndObjectRules(opts);
		}

		parseContextOptions();

		const caseIndentStore = {};

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
		 * Checks if mixed spaces and tabs are present
		 * @param {number} gottenSpaces Indentation space count
		 * @param {number} gottenTabs Indentation tab count
		 * @returns {boolean} True if both spaces and tabs are present
		 */
		function hasMixedIndentation(gottenSpaces, gottenTabs) {
			return gottenSpaces > 0 && gottenTabs > 0;
		}

		/**
		 * Calculates the text range for indentation fix
		 * @param {ASTNode} node The node being checked
		 * @param {number} gottenSpaces Indentation space count
		 * @param {number} gottenTabs Indentation tab count
		 * @param {boolean} isLastNodeCheck Whether this is a last node check
		 * @returns {Array} The text range [start, end]
		 */
		function calculateTextRange(
			node,
			gottenSpaces,
			gottenTabs,
			isLastNodeCheck,
		) {
			if (isLastNodeCheck) {
				return [
					node.range[1] - node.loc.end.column,
					node.range[1] -
						node.loc.end.column +
						gottenSpaces +
						gottenTabs,
				];
			}
			return [
				node.range[0] - node.loc.start.column,
				node.range[0] -
					node.loc.start.column +
					gottenSpaces +
					gottenTabs,
			];
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
			if (hasMixedIndentation(gottenSpaces, gottenTabs)) {
				return;
			}

			const desiredIndent = (indentType === "space" ? " " : "\t").repeat(
				needed,
			);

			const textRange = calculateTextRange(
				node,
				gottenSpaces,
				gottenTabs,
				isLastNodeCheck,
			);

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
		 * @returns {Object} The node's indent with space, tab, goodChar, badChar properties
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

		// ========== Node Relationship Utilities ==========

		/**
		 * Returns a parent node of given node based on a specified type
		 * if not present then return null
		 * @param {ASTNode} node node to examine
		 * @param {string} type type that is being looked for
		 * @param {string} stopAtList end points for the evaluating code
		 * @returns {ASTNode|void} if found then node otherwise null
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
		 * Returns the VariableDeclarator based on the current node
		 * if not present then return null
		 * @param {ASTNode} node node to examine
		 * @returns {ASTNode|void} if found then node otherwise null
		 */
		function getVariableDeclaratorNode(node) {
			return getParentNodeByType(node, "VariableDeclarator");
		}

		/**
		 * Check to see if the node is part of the multi-line variable declaration.
		 * Also if its on the same line as the varNode
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
		 * Check to see if the argument before the callee node is multi-line and
		 * there should only be 1 argument before the callee node
		 * @param {ASTNode} node node to check
		 * @returns {boolean} True if arguments are multi-line
		 */
		function isArgBeforeCalleeNodeMultiline(node) {
			const parent = node.parent;

			if (parent.arguments.length < 2 || parent.arguments[1] !== node) {
				return false;
			}

			return (
				parent.arguments[0].loc.end.line >
				parent.arguments[0].loc.start.line
			);
		}

		/**
		 * Check to see if the node is a file level IIFE
		 * @param {ASTNode} node The function node to check.
		 * @returns {boolean} True if the node is the outer IIFE
		 */
		function isOuterIIFE(node) {
			const parent = node.parent;
			let stmt = parent.parent;

			if (parent.type !== "CallExpression" || parent.callee !== node) {
				return false;
			}

			while (
				(stmt.type === "UnaryExpression" &&
					(stmt.operator === "!" ||
						stmt.operator === "~" ||
						stmt.operator === "+" ||
						stmt.operator === "-")) ||
				stmt.type === "AssignmentExpression" ||
				stmt.type === "LogicalExpression" ||
				stmt.type === "SequenceExpression" ||
				stmt.type === "VariableDeclarator"
			) {
				stmt = stmt.parent;
			}

			return (
				(stmt.type === "ExpressionStatement" ||
					stmt.type === "VariableDeclaration") &&
				stmt.parent &&
				stmt.parent.type === "Program"
			);
		}

		/**
		 * Check if the node or node body is a BlockStatement or not
		 * @param {ASTNode} node node to test
		 * @returns {boolean} True if it or its body is a block statement
		 */
		function isNodeBodyBlock(node) {
			return (
				node.type === "BlockStatement" ||
				node.type === "ClassBody" ||
				(node.body && node.body.type === "BlockStatement") ||
				(node.consequent && node.consequent.type === "BlockStatement")
			);
		}

		/**
		 * Checks whether a return statement is wrapped in ()
		 * @param {ASTNode} node node to examine
		 * @returns {boolean} the result
		 */
		function isWrappedInParenthesis(node) {
			const regex = /^return\s*\(\s*\)/u;

			const statementWithoutArgument = sourceCode
				.getText(node)
				.replace(sourceCode.getText(node.argument), "");

			return regex.test(statementWithoutArgument);
		}

		// ========== Indent Checking Helpers ==========

		/**
		 * Check indent for node
		 * @param {ASTNode} node Node to check
		 * @param {number} neededIndent needed indent
		 * @returns {void}
		 */
		function checkNodeIndent(node, neededIndent) {
			const actualIndent = getNodeIndent(node, false);

			if (
				node.type !== "ArrayExpression" &&
				node.type !== "ObjectExpression" &&
				(actualIndent.goodChar !== neededIndent ||
					actualIndent.badChar !== 0) &&
				isNodeFirstInLine(node)
			) {
				report(
					node,
					neededIndent,
					actualIndent.space,
					actualIndent.tab,
				);
			}

			checkIfStatementIndent(node, neededIndent);
			checkTryStatementIndent(node, neededIndent);
			checkDoWhileStatementIndent(node, neededIndent);
		}

		/**
		 * Checks indent for if/else statements
		 * @param {ASTNode} node Node to check
		 * @param {number} neededIndent needed indent
		 * @returns {void}
		 */
		function checkIfStatementIndent(node, neededIndent) {
			if (node.type !== "IfStatement" || !node.alternate) {
				return;
			}

			const elseToken = sourceCode.getTokenBefore(node.alternate);
			checkNodeIndent(elseToken, neededIndent);

			if (!isNodeFirstInLine(node.alternate)) {
				checkNodeIndent(node.alternate, neededIndent);
			}
		}

		/**
		 * Checks indent for try/catch/finally statements
		 * @param {ASTNode} node Node to check
		 * @param {number} neededIndent needed indent
		 * @returns {void}
		 */
		function checkTryStatementIndent(node, neededIndent) {
			if (node.type !== "TryStatement") {
				return;
			}

			if (node.handler) {
				const catchToken = sourceCode.getFirstToken(node.handler);
				checkNodeIndent(catchToken, neededIndent);
			}

			if (node.finalizer) {
				const finallyToken = sourceCode.getTokenBefore(node.finalizer);
				checkNodeIndent(finallyToken, neededIndent);
			}
		}

		/**
		 * Checks indent for do-while statements
		 * @param {ASTNode} node Node to check
		 * @param {number} neededIndent needed indent
		 * @returns {void}
		 */
		function checkDoWhileStatementIndent(node, neededIndent) {
			if (node.type !== "DoWhileStatement") {
				return;
			}

			const whileToken = sourceCode.getTokenAfter(node.body);
			checkNodeIndent(whileToken, neededIndent);
		}

		/**
		 * Check indent for nodes list
		 * @param {ASTNode[]} nodes list of node objects
		 * @param {number} indent needed indent
		 * @returns {void}
		 */
		function checkNodesIndent(nodes, indent) {
			nodes.forEach(node => checkNodeIndent(node, indent));
		}

		/**
		 * Check last node line indent this detects, that block closed correctly
		 * @param {ASTNode} node Node to examine
		 * @param {number} lastLineIndent needed indent
		 * @returns {void}
		 */
		function checkLastNodeLineIndent(node, lastLineIndent) {
			const lastToken = sourceCode.getLastToken(node);
			const endIndent = getNodeIndent(lastToken, true);

			if (
				(endIndent.goodChar !== lastLineIndent ||
					endIndent.badChar !== 0) &&
				isNodeFirstInLine(node, true)
			) {
				report(
					node,
					lastLineIndent,
					endIndent.space,
					endIndent.tab,
					{
						line: lastToken.loc.start.line,
						column: lastToken.loc.start.column,
					},
					true,
				);
			}
		}

		/**
		 * Check last node line indent for return statements
		 * @param {ASTNode} node Node to examine
		 * @param {number} firstLineIndent first line needed indent
		 * @returns {void}
		 */
		function checkLastReturnStatementLineIndent(node, firstLineIndent) {
			const lastToken = sourceCode.getLastToken(
				node,
				astUtils.isClosingParenToken,
			);
			const textBeforeClosingParenthesis = sourceCode
				.getText(lastToken, lastToken.loc.start.column)
				.slice(0, -1);

			if (textBeforeClosingParenthesis.trim()) {
				return;
			}

			const endIndent = getNodeIndent(lastToken, true);

			if (endIndent.goodChar !== firstLineIndent) {
				report(
					node,
					firstLineIndent,
					endIndent.space,
					endIndent.tab,
					{
						line: lastToken.loc.start.line,
						column: lastToken.loc.start.column,
					},
					true,
				);
			}
		}

		/**
		 * Check first node line indent is correct
		 * @param {ASTNode} node Node to examine
		 * @param {number} firstLineIndent needed indent
		 * @returns {void}
		 */
		function checkFirstNodeLineIndent(node, firstLineIndent) {
			const startIndent = getNodeIndent(node, false);

			if (
				(startIndent.goodChar !== firstLineIndent ||
					startIndent.badChar !== 0) &&
				isNodeFirstInLine(node)
			) {
				report(
					node,
					firstLineIndent,
					startIndent.space,
					startIndent.tab,
					{
						line: node.loc.start.line,
						column: node.loc.start.column,
					},
				);
			}
		}

		// ========== Function Block Indent Checking ==========

		/**
		 * Determines the base indent for a function block
		 * @param {ASTNode} calleeNode The function node
		 * @returns {number} The base indent
		 */
		function getBaseFunctionIndent(calleeNode) {
			if (
				calleeNode.parent &&
				(calleeNode.parent.type === "Property" ||
					calleeNode.parent.type === "ArrayExpression")
			) {
				return getNodeIndent(calleeNode, false).goodChar;
			}
			return getNodeIndent(calleeNode).goodChar;
		}

		/**
		 * Adjusts indent for call expression context
		 * @param {ASTNode} calleeNode The function node
		 * @param {ASTNode} blockNode The block statement node
		 * @param {number} indent Current indent value
		 * @returns {number} Adjusted indent
		 */
		function adjustIndentForCallExpression(
			calleeNode,
			blockNode,
			indent,
		) {
			if (calleeNode.parent.type !== "CallExpression") {
				return indent;
			}

			const calleeParent = calleeNode.parent;

			if (
				calleeNode.type === "FunctionExpression" ||
				calleeNode.type === "ArrowFunctionExpression"
			) {
				if (
					isArgBeforeCalleeNodeMultiline(calleeNode) &&
					calleeParent.callee.loc.start.line ===
						calleeParent.callee.loc.end.line &&
					!isNodeFirstInLine(calleeNode)
				) {
					return getNodeIndent(calleeParent).goodChar;
				}
				return indent;
			}

			if (
				calleeParent &&
				calleeParent.loc.start.line < blockNode.loc.start.line
			) {
				return getNodeIndent(calleeParent).goodChar;
			}

			return indent;
		}

		/**
		 * Calculates the function body offset
		 * @param {ASTNode} calleeNode The function node
		 * @returns {number} The offset to apply
		 */
		function calculateFunctionBodyOffset(calleeNode) {
			if (options.outerIIFEBody !== null && isOuterIIFE(calleeNode)) {
				return options.outerIIFEBody * indentSize;
			}

			if (calleeNode.type === "FunctionExpression") {
				return options.FunctionExpression.body * indentSize;
			}

			if (calleeNode.type === "FunctionDeclaration") {
				return options.FunctionDeclaration.body * indentSize;
			}

			return indentSize;
		}

		/**
		 * Check indent for function block content
		 * @param {ASTNode} node A BlockStatement node that is inside of a function.
		 * @returns {void}
		 */
		function checkIndentInFunctionBlock(node) {
			const calleeNode = node.parent;
			let indent = getBaseFunctionIndent(calleeNode);

			indent = adjustIndentForCallExpression(calleeNode, node, indent);

			const functionOffset = calculateFunctionBodyOffset(calleeNode);
			indent += functionOffset;

			const parentVarNode = getVariableDeclaratorNode(node);

			if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
				indent +=
					indentSize *
					options.VariableDeclarator[parentVarNode.parent.kind];
			}

			if (node.body.length > 0) {
				checkNodesIndent(node.body, indent);
			}

			checkLastNodeLineIndent(node, indent - functionOffset);
		}

		// ========== Array/Object Block Indent Checking ==========

		/**
		 * Determines the node indent for array/object blocks
		 * @param {ASTNode} node The array or object node
		 * @param {ASTNode} parentVarNode The parent variable declarator node
		 * @returns {number} The calculated node indent
		 */
		function determineArrayObjectNodeIndent(node, parentVarNode) {
			if (!isNodeFirstInLine(node)) {
				return getNodeIndent(node).goodChar;
			}

			const parent = node.parent;
			let nodeIndent = getNodeIndent(parent).goodChar;

			if (
				parentVarNode &&
				parentVarNode.loc.start.line === node.loc.start.line
			) {
				return nodeIndent;
			}

			if (
				parent.type === "VariableDeclarator" &&
				parentVarNode !== parentVarNode.parent.declarations[0]
			) {
				return nodeIndent;
			}

			return applyArrayObjectIndentRules(
				node,
				parent,
				parentVarNode,
				nodeIndent,
			);
		}

		/**
		 * Applies indent rules for array/object based on parent type
		 * @param {ASTNode} node The array or object node
		 * @param {ASTNode} parent The parent node
		 * @param {ASTNode} parentVarNode The parent variable declarator
		 * @param {number} nodeIndent Current node indent
		 * @returns {number} The adjusted indent
		 */
		function applyArrayObjectIndentRules(
			node,
			parent,
			parentVarNode,
			nodeIndent,
		) {
			if (
				parent.type === "VariableDeclarator" &&
				parentVarNode.loc.start.line === parent.loc.start.line
			) {
				return (
					nodeIndent +
					indentSize *
						options.VariableDeclarator[parentVarNode.parent.kind]
				);
			}

			if (
				parent.type === "ObjectExpression" ||
				parent.type === "ArrayExpression"
			) {
				return applyNestedArrayObjectRules(node, parent, nodeIndent);
			}

			if (
				parent.type === "CallExpression" ||
				parent.type === "NewExpression"
			) {
				return applyCallExpressionIndentRules(node, parent, nodeIndent);
			}

			if (
				parent.type === "LogicalExpression" ||
				parent.type === "ArrowFunctionExpression"
			) {
				return nodeIndent + indentSize;
			}

			return nodeIndent;
		}

		/**
		 * Applies indent rules for nested array/object expressions
		 * @param {ASTNode} node The array or object node
		 * @param {ASTNode} parent The parent node
		 * @param {number} nodeIndent Current node indent
		 * @returns {number} The adjusted indent
		 */
		function applyNestedArrayObjectRules(node, parent, nodeIndent) {
			const parentElements =
				parent.type === "ObjectExpression"
					? parent.properties
					: parent.elements;

			if (!parentElements[0]) {
				return nodeIndent;
			}

			const firstElemStartLine = parentElements[0].loc.start.line;
			const firstElemEndLine = parentElements[0].loc.end.line;
			const parentStartLine = parent.loc.start.line;

			if (
				firstElemStartLine === parentStartLine &&
				firstElemEndLine !== parentStartLine
			) {
				return nodeIndent;
			}

			if (typeof options[parent.type] === "number") {
				return nodeIndent + options[parent.type] * indentSize;
			}

			return parentElements[0].loc.start.column;
		}

		/**
		 * Applies indent rules for call expressions
		 * @param {ASTNode} node The array or object node
		 * @param {ASTNode} parent The parent call expression
		 * @param {number} nodeIndent Current node indent
		 * @returns {number} The adjusted indent
		 */
		function applyCallExpressionIndentRules(node, parent, nodeIndent) {
			if (typeof options.CallExpression.arguments === "number") {
				return (
					nodeIndent +
					options.CallExpression.arguments * indentSize
				);
			}

			if (options.CallExpression.arguments === "first") {
				if (parent.arguments.includes(node)) {
					return parent.arguments[0].loc.start.column;
				}
				return nodeIndent;
			}

			return nodeIndent + indentSize;
		}

		/**
		 * Check indent for array block content or object block content
		 * @param {ASTNode} node node to examine
		 * @returns {void}
		 */
		function checkIndentInArrayOrObjectBlock(node) {
			if (isSingleLineNode(node)) {
				return;
			}

			let elements =
				node.type === "ArrayExpression"
					? node.elements
					: node.properties;

			elements = elements.filter(elem => elem !== null);

			const parentVarNode = getVariableDeclaratorNode(node);
			const nodeIndent = determineArrayObjectNodeIndent(node, parentVarNode);

			if (isNodeFirstInLine(node)) {
				checkFirstNodeLineIndent(node, nodeIndent);
			}

			let elementsIndent;
			if (options[node.type] === "first") {
				elementsIndent = elements.length
					? elements[0].loc.start.column
					: 0;
			} else {
				elementsIndent = nodeIndent + indentSize * options[node.type];
			}

			if (isNodeInVarOnTop(node, parentVarNode)) {
				elementsIndent +=
					indentSize *
					options.VariableDeclarator[parentVarNode.parent.kind];
			}

			checkNodesIndent(elements, elementsIndent);

			if (elements.length > 0) {
				if (elements.at(-1).loc.end.line === node.loc.end.line) {
					return;
				}
			}

			const lastLineIndent = nodeIndent +
				(isNodeInVarOnTop(node, parentVarNode)
					? options.VariableDeclarator[
							parentVarNode.parent.kind
						] * indentSize
					: 0);

			checkLastNodeLineIndent(node, lastLineIndent);
		}

		// ========== Block Indent Checking ==========

		/**
		 * Determines the indent for a block statement
		 * @param {ASTNode} node The block statement node
		 * @returns {number} The calculated indent
		 */
		function determineBlockIndent(node) {
			const statementsWithProperties = [
				"IfStatement",
				"WhileStatement",
				"ForStatement",
				"ForInStatement",
				"ForOfStatement",
				"DoWhileStatement",
				"ClassDeclaration",
				"TryStatement",
			];

			if (
				node.parent &&
				statementsWithProperties.includes(node.parent.type) &&
				isNodeBodyBlock(node)
			) {
				return getNodeIndent(node.parent).goodChar;
			}

			if (node.parent && node.parent.type === "CatchClause") {
				return getNodeIndent(node.parent.parent).goodChar;
			}

			return getNodeIndent(node).goodChar;
		}

		/**
		 * Gets the nodes to check for a block statement
		 * @param {ASTNode} node The block statement node
		 * @returns {ASTNode[]} The nodes to check
		 */
		function getBlockNodesToCheck(node) {
			if (
				node.type === "IfStatement" &&
				node.consequent.type !== "BlockStatement"
			) {
				return [node.consequent];
			}

			if (Array.isArray(node.body)) {
				return node.body;
			}

			return [node.body];
		}

		/**
		 * Check indentation for blocks
		 * @param {ASTNode} node node to check
		 * @returns {void}
		 */
		function blockIndentationCheck(node) {
			if (isSingleLineNode(node)) {
				return;
			}

			if (
				node.parent &&
				(node.parent.type === "FunctionExpression" ||
					node.parent.type === "FunctionDeclaration" ||
					node.parent.type === "ArrowFunctionExpression")
			) {
				checkIndentInFunctionBlock(node);
				return;
			}

			const indent = determineBlockIndent(node);
			const nodesToCheck = getBlockNodesToCheck(node);

			if (nodesToCheck.length > 0) {
				checkNodesIndent(nodesToCheck, indent + indentSize);
			}

			if (node.type === "BlockStatement") {
				checkLastNodeLineIndent(node, indent);
			}
		}

		// ========== Variable Declaration Indent Checking ==========

		/**
		 * Filter out the elements which are on the same line of each other or the node.
		 * @param {ASTNode} node Variable declaration node
		 * @returns {ASTNode[]} Filtered elements
		 */
		function filterOutSameLineVars(node) {
			return node.declarations.reduce((finalCollection, elem) => {
				const lastElem = finalCollection.at(-1);

				if (
					(elem.loc.start.line !== node.loc.start.line &&
						!lastElem) ||
					(lastElem &&
						lastElem.loc.start.line !== elem.loc.start.line)
				) {
					finalCollection.push(elem);
				}

				return finalCollection;
			}, []);
		}

		/**
		 * Checks the last line indent for variable declarations
		 * @param {ASTNode} node The variable declaration node
		 * @param {ASTNode} lastElement The last element in the declaration
		 * @param {number} elementsIndent The elements indent
		 * @returns {void}
		 */
		function checkVariableDeclarationLastLine(
			node,
			lastElement,
			elementsIndent,
		) {
			if (
				sourceCode.getLastToken(node).loc.end.line <=
				lastElement.loc.end.line
			) {
				return;
			}

			const tokenBeforeLastElement =
				sourceCode.getTokenBefore(lastElement);

			if (tokenBeforeLastElement.value === ",") {
				checkLastNodeLineIndent(
					node,
					getNodeIndent(tokenBeforeLastElement).goodChar,
				);
			} else {
				checkLastNodeLineIndent(node, elementsIndent - indentSize);
			}
		}

		/**
		 * Check indentation for variable declarations
		 * @param {ASTNode} node node to examine
		 * @returns {void}
		 */
		function checkIndentInVariableDeclarations(node) {
			const elements = filterOutSameLineVars(node);
			const nodeIndent = getNodeIndent(node).goodChar;
			const lastElement = elements.at(-1);

			const elementsIndent =
				nodeIndent + indentSize * options.VariableDeclarator[node.kind];

			checkNodesIndent(elements, elementsIndent);
			checkVariableDeclarationLastLine(node, lastElement, elementsIndent);
		}

		// ========== Blockless Nodes ==========

		/**
		 * Check and decide whether to check for indentation for blockless nodes
		 * Scenarios are for or while statements without braces around them
		 * @param {ASTNode} node node to examine
		 * @returns {void}
		 */
		function blockLessNodes(node) {
			if (node.body.type !== "BlockStatement") {
				blockIndentationCheck(node);
			}
		}

		// ========== Switch Case Indent Checking ==========

		/**
		 * Returns the expected indentation for the case statement
		 * @param {ASTNode} node node to examine
		 * @param {number} [providedSwitchIndent] indent for switch statement
		 * @returns {number} indent size
		 */
		function expectedCaseIndent(node, providedSwitchIndent) {
			const switchNode =
				node.type === "SwitchStatement" ? node : node.parent;
			const switchIndent =
				typeof providedSwitchIndent === "undefined"
					? getNodeIndent(switchNode).goodChar
					: providedSwitchIndent;

			if (caseIndentStore[switchNode.loc.start.line]) {
				return caseIndentStore[switchNode.loc.start.line];
			}

			const caseIndent =
				switchNode.cases.length > 0 && options.SwitchCase === 0
					? switchIndent
					: switchIndent + indentSize * options.SwitchCase;

			caseIndentStore[switchNode.loc.start.line] = caseIndent;
			return caseIndent;
		}

		// ========== Function Parameter Indent Checking ==========

		/**
		 * Checks function parameters indentation
		 * @param {ASTNode} node The function node
		 * @param {Object} paramOptions The parameter options
		 * @returns {void}
		 */
		function checkFunctionParametersIndent(node, paramOptions) {
			if (isSingleLineNode(node)) {
				return;
			}

			if (paramOptions.parameters === "first" && node.params.length) {
				checkNodesIndent(
					node.params.slice(1),
					node.params[0].loc.start.column,
				);
			} else if (paramOptions.parameters !== null) {
				checkNodesIndent(
					node.params,
					getNodeIndent(node).goodChar +
						indentSize * paramOptions.parameters,
				);
			}
		}

		// ========== Return Statement Indent Checking ==========

		/**
		 * Checks return statement indentation
		 * @param {ASTNode} node The return statement node
		 * @returns {void}
		 */
		function checkReturnStatementIndent(node) {
			if (isSingleLineNode(node)) {
				return;
			}

			const firstLineIndent = getNodeIndent(node).goodChar;

			if (isWrappedInParenthesis(node)) {
				checkLastReturnStatementLineIndent(node, firstLineIndent);
			} else {
				checkNodeIndent(node, firstLineIndent);
			}
		}

		// ========== Call Expression Indent Checking ==========

		/**
		 * Checks call expression arguments indentation
		 * @param {ASTNode} node The call expression node
		 * @returns {void}
		 */
		function checkCallExpressionIndent(node) {
			if (isSingleLineNode(node)) {
				return;
			}

			if (
				options.CallExpression.arguments === "first" &&
				node.arguments.length
			) {
				checkNodesIndent(
					node.arguments.slice(1),
					node.arguments[0].loc.start.column,
				);
			} else if (options.CallExpression.arguments !== null) {
				checkNodesIndent(
					node.arguments,
					getNodeIndent(node).goodChar +
						indentSize * options.CallExpression.arguments,
				);
			}
		}

		// ========== Member Expression Indent Checking ==========

		/**
		 * Checks member expression indentation
		 * @param {ASTNode} node The member expression node
		 * @returns {void}
		 */
		function checkMemberExpressionIndent(node) {
			if (typeof options.MemberExpression === "undefined") {
				return;
			}

			if (isSingleLineNode(node)) {
				return;
			}

			if (
				getParentNodeByType(node, "VariableDeclarator", [
					"FunctionExpression",
					"ArrowFunctionExpression",
				])
			) {
				return;
			}

			if (
				getParentNodeByType(node, "AssignmentExpression", [
					"FunctionExpression",
				])
			) {
				return;
			}

			const propertyIndent =
				getNodeIndent(node).goodChar +
				indentSize * options.MemberExpression;

			const checkNodes = [node.property];
			const dot = sourceCode.getTokenBefore(node.property);

			if (dot.type === "Punctuator" && dot.value === ".") {
				checkNodes.push(dot);
			}

			checkNodesIndent(checkNodes, propertyIndent);
		}

		return {
			Program(node) {
				if (node.body.length > 0) {
					checkNodesIndent(node.body, getNodeIndent(node).goodChar);
				}
			},

			ClassBody: blockIndentationCheck,

			BlockStatement: blockIndentationCheck,

			WhileStatement: blockLessNodes,

			ForStatement: blockLessNodes,

			ForInStatement: blockLessNodes,

			ForOfStatement: blockLessNodes,

			DoWhileStatement: blockLessNodes,

			IfStatement(node) {
				if (
					node.consequent.type !== "BlockStatement" &&
					node.consequent.loc.start.line > node.loc.start.line
				) {
					blockIndentationCheck(node);
				}
			},

			VariableDeclaration(node) {
				if (
					node.declarations.at(-1).loc.start.line >
					node.declarations[0].loc.start.line
				) {
					checkIndentInVariableDeclarations(node);
				}
			},

			ObjectExpression(node) {
				checkIndentInArrayOrObjectBlock(node);
			},

			ArrayExpression(node) {
				checkIndentInArrayOrObjectBlock(node);
			},

			MemberExpression: checkMemberExpressionIndent,

			SwitchStatement(node) {
				const switchIndent = getNodeIndent(node).goodChar;
				const caseIndent = expectedCaseIndent(node, switchIndent);

				checkNodesIndent(node.cases, caseIndent);
				checkLastNodeLineIndent(node, switchIndent);
			},

			SwitchCase(node) {
				if (isSingleLineNode(node)) {
					return;
				}
				const caseIndent = expectedCaseIndent(node);

				checkNodesIndent(node.consequent, caseIndent + indentSize);
			},

			FunctionDeclaration(node) {
				checkFunctionParametersIndent(
					node,
					options.FunctionDeclaration,
				);
			},

			FunctionExpression(node) {
				checkFunctionParametersIndent(
					node,
					options.FunctionExpression,
				);
			},

			ReturnStatement: checkReturnStatementIndent,

			CallExpression: checkCallExpressionIndent,
		};
	},
};
```