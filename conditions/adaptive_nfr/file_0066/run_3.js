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
			if (context.options[0] === "tab") {
				indentSize = 1;
				indentType = "tab";
			} else if (typeof context.options[0] === "number") {
				indentSize = context.options[0];
				indentType = "space";
			}
		}

		/**
		 * Parses variable declarator options
		 * @param {Object} opts The options object
		 * @returns {void}
		 */
		function parseVariableDeclaratorOptions(opts) {
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
		 * Parses function and call expression options
		 * @param {Object} opts The options object
		 * @returns {void}
		 */
		function parseFunctionAndCallOptions(opts) {
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
		 * Parses array and object expression options
		 * @param {Object} opts The options object
		 * @returns {void}
		 */
		function parseArrayAndObjectOptions(opts) {
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
		 * Parses all context options
		 * @returns {void}
		 */
		function parseContextOptions() {
			if (!context.options.length) {
				return;
			}

			parseIndentType();

			if (!context.options[1]) {
				return;
			}

			const opts = context.options[1];

			options.SwitchCase = opts.SwitchCase || 0;

			if (opts.VariableDeclarator) {
				parseVariableDeclaratorOptions(opts);
			}

			if (typeof opts.outerIIFEBody === "number") {
				options.outerIIFEBody = opts.outerIIFEBody;
			}

			if (typeof opts.MemberExpression === "number") {
				options.MemberExpression = opts.MemberExpression;
			}

			parseFunctionAndCallOptions(opts);
			parseArrayAndObjectOptions(opts);
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
		 * Checks node is the first in its own start line
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
		 * @returns {boolean} Whether or not the block starts and ends on the same line
		 */
		function isSingleLineNode(node) {
			const lastToken = sourceCode.getLastToken(node),
				startLine = node.loc.start.line,
				endLine = lastToken.loc.end.line;

			return startLine === endLine;
		}

		// ========== Node Type Predicates ==========

		/**
		 * Check if node has incorrect indentation
		 * @param {Object} indent The indent object with goodChar and badChar
		 * @param {number} neededIndent The needed indent
		 * @returns {boolean} true if indentation is incorrect
		 */
		function hasIncorrectIndent(indent, neededIndent) {
			return indent.goodChar !== neededIndent || indent.badChar !== 0;
		}

		/**
		 * Check if node is part of multi-line variable declaration on same line as varNode
		 * @param {ASTNode} node node to check
		 * @param {ASTNode} varNode variable declaration node to check against
		 * @returns {boolean} True if all conditions satisfy
		 */
		function isNodeInVarOnTop(node, varNode) {
			return (
				varNode &&
				varNode.parent.loc.start.line === node.loc.start.line &&
				varNode.parent.declarations.length > 1
			);
		}

		/**
		 * Check if argument before callee node is multi-line
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
		 * Check if node is a file level IIFE
		 * @param {ASTNode} node The function node to check
		 * @returns {boolean} True if the node is the outer IIFE
		 */
		function isOuterIIFE(node) {
			const parent = node.parent;

			if (parent.type !== "CallExpression" || parent.callee !== node) {
				return false;
			}

			let stmt = parent.parent;

			while (isUnaryOrLogicalExpression(stmt) || isAssignmentOrSequence(stmt)) {
				stmt = stmt.parent;
			}

			return isTopLevelStatement(stmt);
		}

		/**
		 * Check if statement is unary or logical expression
		 * @param {ASTNode} stmt The statement to check
		 * @returns {boolean} true if unary or logical
		 */
		function isUnaryOrLogicalExpression(stmt) {
			if (stmt.type === "UnaryExpression") {
				return ["!", "~", "+", "-"].includes(stmt.operator);
			}
			return stmt.type === "LogicalExpression";
		}

		/**
		 * Check if statement is assignment or sequence expression
		 * @param {ASTNode} stmt The statement to check
		 * @returns {boolean} true if assignment or sequence
		 */
		function isAssignmentOrSequence(stmt) {
			return (
				stmt.type === "AssignmentExpression" ||
				stmt.type === "SequenceExpression" ||
				stmt.type === "VariableDeclarator"
			);
		}

		/**
		 * Check if statement is top-level
		 * @param {ASTNode} stmt The statement to check
		 * @returns {boolean} true if top-level
		 */
		function isTopLevelStatement(stmt) {
			return (
				(stmt.type === "ExpressionStatement" ||
					stmt.type === "VariableDeclaration") &&
				stmt.parent &&
				stmt.parent.type === "Program"
			);
		}

		/**
		 * Check if node is body block
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
		 * Check if return statement is wrapped in parenthesis
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

		// ========== Parent Node Utilities ==========

		/**
		 * Returns a parent node of given node based on a specified type
		 * @param {ASTNode} node node to examine
		 * @param {string} type type that is being looked for
		 * @param {string} stopAtList end points for the evaluating code
		 * @returns {ASTNode|null} if found then node otherwise null
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
		 * @param {ASTNode} node node to examine
		 * @returns {ASTNode|null} if found then node otherwise null
		 */
		function getVariableDeclaratorNode(node) {
			return getParentNodeByType(node, "VariableDeclarator");
		}

		// ========== Indent Checking ==========

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
				hasIncorrectIndent(actualIndent, neededIndent) &&
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
		 * Check indent for if statement alternate
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
		 * Check indent for try statement handler and finalizer
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
		 * Check indent for do-while statement
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
				hasIncorrectIndent(endIndent, lastLineIndent) &&
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
				hasIncorrectIndent(startIndent, firstLineIndent) &&
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

		// ========== Function Block Indentation ==========

		/**
		 * Get indent for function block based on parent context
		 * @param {ASTNode} calleeNode The function node
		 * @returns {number} The calculated indent
		 */
		function getFunctionBlockBaseIndent(calleeNode) {
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
		 * Adjust indent for call expression context
		 * @param {ASTNode} calleeNode The function node
		 * @param {ASTNode} blockNode The block statement node
		 * @param {number} indent Current indent
		 * @returns {number} Adjusted indent
		 */
		function adjustIndentForCallExpression(calleeNode, blockNode, indent) {
			const calleeParent = calleeNode.parent;

			if (calleeNode.type === "FunctionExpression" || calleeNode.type === "ArrowFunctionExpression") {
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
		 * Get function offset based on function type
		 * @param {ASTNode} calleeNode The function node
		 * @returns {number} The function offset
		 */
		function getFunctionOffset(calleeNode) {
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
		 * @param {ASTNode} node A BlockStatement node that is inside of a function
		 * @returns {void}
		 */
		function checkIndentInFunctionBlock(node) {
			const calleeNode = node.parent;
			let indent = getFunctionBlockBaseIndent(calleeNode);

			if (calleeNode.parent.type === "CallExpression") {
				indent = adjustIndentForCallExpression(calleeNode, node, indent);
			}

			const functionOffset = getFunctionOffset(calleeNode);
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

		// ========== Array and Object Block Indentation ==========

		/**
		 * Get node indent for array or object block
		 * @param {ASTNode} node The array or object node
		 * @param {ASTNode} parentVarNode The parent variable declarator
		 * @returns {number} The calculated node indent
		 */
		function getArrayOrObjectNodeIndent(node, parentVarNode) {
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

			if (
				parent.type === "VariableDeclarator" &&
				parentVarNode.loc.start.line === parent.loc.start.line
			) {
				nodeIndent +=
					indentSize *
					options.VariableDeclarator[parentVarNode.parent.kind];
				return nodeIndent;
			}

			return adjustNodeIndentForParentType(node, parent, nodeIndent);
		}

		/**
		 * Adjust node indent based on parent type
		 * @param {ASTNode} node The array or object node
		 * @param {ASTNode} parent The parent node
		 * @param {number} nodeIndent Current node indent
		 * @returns {number} Adjusted indent
		 */
		function adjustNodeIndentForParentType(node, parent, nodeIndent) {
			if (parent.type === "ObjectExpression" || parent.type === "ArrayExpression") {
				return adjustIndentForNestedArrayOrObject(node, parent, nodeIndent);
			}

			if (parent.type === "CallExpression" || parent.type === "NewExpression") {
				return adjustIndentForCallOrNewExpression(parent, nodeIndent);
			}

			if (parent.type === "LogicalExpression" || parent.type === "ArrowFunctionExpression") {
				return nodeIndent + indentSize;
			}

			return nodeIndent;
		}

		/**
		 * Adjust indent for nested array or object
		 * @param {ASTNode} node The array or object node
		 * @param {ASTNode} parent The parent node
		 * @param {number} nodeIndent Current node indent
		 * @returns {number} Adjusted indent
		 */
		function adjustIndentForNestedArrayOrObject(node, parent, nodeIndent) {
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
		 * Adjust indent for call or new expression
		 * @param {ASTNode} parent The parent node
		 * @param {number} nodeIndent Current node indent
		 * @returns {number} Adjusted indent
		 */
		function adjustIndentForCallOrNewExpression(parent, nodeIndent) {
			if (typeof options.CallExpression.arguments === "number") {
				return nodeIndent + options.CallExpression.arguments * indentSize;
			}

			if (options.CallExpression.arguments === "first") {
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

			let nodeIndent;
			let elementsIndent;

			if (isNodeFirstInLine(node)) {
				nodeIndent = getArrayOrObjectNodeIndent(node, parentVarNode);
				checkFirstNodeLineIndent(node, nodeIndent);
			} else {
				nodeIndent = getNodeIndent(node).goodChar;
			}

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

			if (elements.length > 0 && elements.at(-1).loc.end.line === node.loc.end.line) {
				return;
			}

			checkLastNodeLineIndent(
				node,
				nodeIndent +
					(isNodeInVarOnTop(node, parentVarNode)
						? options.VariableDeclarator[
								parentVarNode.parent.kind
							] * indentSize
						: 0),
			);
		}

		// ========== Block Indentation ==========

		/**
		 * Get indent for block statement
		 * @param {ASTNode} node The block statement node
		 * @returns {number} The calculated indent
		 */
		function getBlockIndent(node) {
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
		 * Get nodes to check for block statement
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

			if (isFunctionBlock(node)) {
				checkIndentInFunctionBlock(node);
				return;
			}

			const indent = getBlockIndent(node);
			const nodesToCheck = getBlockNodesToCheck(node);

			if (nodesToCheck.length > 0) {
				checkNodesIndent(nodesToCheck, indent + indentSize);
			}

			if (node.type === "BlockStatement") {
				checkLastNodeLineIndent(node, indent);
			}
		}

		/**
		 * Check if node is a function block
		 * @param {ASTNode} node The node to check
		 * @returns {boolean} true if node is a function block
		 */
		function isFunctionBlock(node) {
			return (
				node.parent &&
				(node.parent.type === "FunctionExpression" ||
					node.parent.type === "FunctionDeclaration" ||
					node.parent.type === "ArrowFunctionExpression")
			);
		}

		// ========== Variable Declaration Indentation ==========

		/**
		 * Filter out the elements which are on the same line of each other or the node
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

		// ========== Blockless Nodes ==========

		/**
		 * Check and decide whether to check for indentation for blockless nodes
		 * @param {ASTNode} node node to examine
		 * @returns {void}
		 */
		function blockLessNodes(node) {
			if (node.body.type !== "BlockStatement") {
				blockIndentationCheck(node);
			}
		}

		// ========== Switch Case Indentation ==========

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

		// ========== Member Expression Indentation ==========

		/**
		 * Check if member expression should be skipped
		 * @param {ASTNode} node The member expression node
		 * @returns {boolean} true if should skip
		 */
		function shouldSkipMemberExpression(node) {
			if (typeof options.MemberExpression === "undefined") {
				return true;
			}

			if (isSingleLineNode(node)) {
				return true;
			}

			if (
				getParentNodeByType(node, "VariableDeclarator", [
					"FunctionExpression",
					"ArrowFunctionExpression",
				])
			) {
				return true;
			}

			if (
				getParentNodeByType(node, "AssignmentExpression", [
					"FunctionExpression",
				])
			) {
				return true;
			}

			return false;
		}

		/**
		 * Check member expression indentation
		 * @param {ASTNode} node The member expression node
		 * @returns {void}
		 */
		function checkMemberExpressionIndent(node) {
			if (shouldSkipMemberExpression(node)) {
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

		// ========== Function Parameter Indentation ==========

		/**
		 * Check function parameters indentation
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

		// ========== Call Expression Indentation ==========

		/**
		 * Check call expression arguments indentation
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

		// ========== Return Statement Indentation ==========

		/**
		 * Check return statement indentation
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

			MemberExpression(node) {
				checkMemberExpressionIndent(node);
			},

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
				checkFunctionParametersIndent(node, options.FunctionDeclaration);
			},

			FunctionExpression(node) {
				checkFunctionParametersIndent(node, options.FunctionExpression);
			},

			ReturnStatement(node) {
				checkReturnStatementIndent(node);
			},

			CallExpression(node) {
				checkCallExpressionIndent(node);
			},
		};
	},
};
```