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
		 * @returns {void}
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
		 * Applies user-provided options to the default options object
		 * @param {Object} opts User options
		 * @returns {void}
		 */
		function applyUserOptions(opts) {
			options.SwitchCase = opts.SwitchCase || 0;

			applyVariableDeclaratorOptions(opts.VariableDeclarator);
			applyNumericOption(opts.outerIIFEBody, "outerIIFEBody");
			applyNumericOption(opts.MemberExpression, "MemberExpression");
			applyObjectOption(opts.FunctionDeclaration, "FunctionDeclaration");
			applyObjectOption(opts.FunctionExpression, "FunctionExpression");
			applyObjectOption(opts.CallExpression, "CallExpression");
			applyArrayOrObjectExpressionOption(opts.ArrayExpression, "ArrayExpression");
			applyArrayOrObjectExpressionOption(opts.ObjectExpression, "ObjectExpression");
		}

		/**
		 * Applies variable declarator options
		 * @param {number|Object} varDeclOpts Variable declarator options
		 * @returns {void}
		 */
		function applyVariableDeclaratorOptions(varDeclOpts) {
			if (typeof varDeclOpts === "number") {
				options.VariableDeclarator = {
					var: varDeclOpts,
					let: varDeclOpts,
					const: varDeclOpts,
				};
			} else if (typeof varDeclOpts === "object") {
				Object.assign(options.VariableDeclarator, varDeclOpts);
			}
		}

		/**
		 * Applies numeric option to options object
		 * @param {number} value Option value
		 * @param {string} key Option key
		 * @returns {void}
		 */
		function applyNumericOption(value, key) {
			if (typeof value === "number") {
				options[key] = value;
			}
		}

		/**
		 * Applies object option to options object
		 * @param {Object} value Option value
		 * @param {string} key Option key
		 * @returns {void}
		 */
		function applyObjectOption(value, key) {
			if (typeof value === "object") {
				Object.assign(options[key], value);
			}
		}

		/**
		 * Applies array or object expression option
		 * @param {number|string} value Option value
		 * @param {string} key Option key
		 * @returns {void}
		 */
		function applyArrayOrObjectExpressionOption(value, key) {
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
		 * @param {number} actualSpaces Actual spaces count
		 * @param {number} actualTabs Actual tabs count
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
		 * @param {ASTNode} node Node violating indent rule
		 * @param {number} needed Expected indentation character count
		 * @param {number} gottenSpaces Actual indentation spaces
		 * @param {number} gottenTabs Actual indentation tabs
		 * @param {Object} [loc] Error location
		 * @param {boolean} isLastNodeCheck Is error for last node check
		 * @returns {void}
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
		 * Calculates text range for indent fix
		 * @param {ASTNode} node Node to examine
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
		 * @param {boolean} [byLastLine=false] Get indent of node's last line
		 * @returns {Object} Indent object with space, tab, goodChar, badChar
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
		 * @returns {boolean} True if node is first in line
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
		 * Gets variable declarator node
		 * @param {ASTNode} node Node to examine
		 * @returns {ASTNode|null} Variable declarator or null
		 */
		function getVariableDeclaratorNode(node) {
			return getParentNodeByType(node, "VariableDeclarator");
		}

		/**
		 * Checks if node is in variable declaration on top
		 * @param {ASTNode} node Node to check
		 * @param {ASTNode} varNode Variable node
		 * @returns {boolean} True if conditions met
		 */
		function isNodeInVarOnTop(node, varNode) {
			return (
				varNode &&
				varNode.parent.loc.start.line === node.loc.start.line &&
				varNode.parent.declarations.length > 1
			);
		}

		/**
		 * Checks if argument before callee is multiline
		 * @param {ASTNode} node Node to check
		 * @returns {boolean} True if multiline
		 */
		function isArgBeforeCalleeNodeMultiline(node) {
			const parent = node.parent;

			if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
				return (
					parent.arguments[0].loc.end.line >
					parent.arguments[0].loc.start.line
				);
			}

			return false;
		}

		/**
		 * Checks if node is outer IIFE
		 * @param {ASTNode} node Function node
		 * @returns {boolean} True if outer IIFE
		 */
		function isOuterIIFE(node) {
			const parent = node.parent;
			let stmt = parent.parent;

			if (parent.type !== "CallExpression" || parent.callee !== node) {
				return false;
			}

			while (isUnaryOrLogicalExpression(stmt) || isAssignmentOrSequence(stmt)) {
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
		 * Checks if statement is unary or logical expression
		 * @param {ASTNode} stmt Statement to check
		 * @returns {boolean} True if unary or logical
		 */
		function isUnaryOrLogicalExpression(stmt) {
			return (
				(stmt.type === "UnaryExpression" &&
					["!", "~", "+", "-"].includes(stmt.operator)) ||
				stmt.type === "LogicalExpression"
			);
		}

		/**
		 * Checks if statement is assignment or sequence
		 * @param {ASTNode} stmt Statement to check
		 * @returns {boolean} True if assignment or sequence
		 */
		function isAssignmentOrSequence(stmt) {
			return (
				stmt.type === "AssignmentExpression" ||
				stmt.type === "SequenceExpression" ||
				stmt.type === "VariableDeclarator"
			);
		}

		/**
		 * Checks if node body is block statement
		 * @param {ASTNode} node Node to test
		 * @returns {boolean} True if block statement
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
		 * Checks node indent
		 * @param {ASTNode} node Node to check
		 * @param {number} neededIndent Needed indent
		 * @returns {void}
		 */
		function checkNodeIndent(node, neededIndent) {
			const actualIndent = getNodeIndent(node, false);

			if (shouldReportNodeIndent(node, actualIndent, neededIndent)) {
				report(node, neededIndent, actualIndent.space, actualIndent.tab);
			}

			checkSpecialStatementIndents(node, neededIndent);
		}

		/**
		 * Determines if node indent should be reported
		 * @param {ASTNode} node Node to check
		 * @param {Object} actualIndent Actual indent
		 * @param {number} neededIndent Needed indent
		 * @returns {boolean} True if should report
		 */
		function shouldReportNodeIndent(node, actualIndent, neededIndent) {
			return (
				node.type !== "ArrayExpression" &&
				node.type !== "ObjectExpression" &&
				(actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
				isNodeFirstInLine(node)
			);
		}

		/**
		 * Checks indents for special statements (if, try, do-while)
		 * @param {ASTNode} node Node to check
		 * @param {number} neededIndent Needed indent
		 * @returns {void}
		 */
		function checkSpecialStatementIndents(node, neededIndent) {
			if (node.type === "IfStatement" && node.alternate) {
				const elseToken = sourceCode.getTokenBefore(node.alternate);
				checkNodeIndent(elseToken, neededIndent);
				if (!isNodeFirstInLine(node.alternate)) {
					checkNodeIndent(node.alternate, neededIndent);
				}
			}

			if (node.type === "TryStatement" && node.handler) {
				const catchToken = sourceCode.getFirstToken(node.handler);
				checkNodeIndent(catchToken, neededIndent);
			}

			if (node.type === "TryStatement" && node.finalizer) {
				const finallyToken = sourceCode.getTokenBefore(node.finalizer);
				checkNodeIndent(finallyToken, neededIndent);
			}

			if (node.type === "DoWhileStatement") {
				const whileToken = sourceCode.getTokenAfter(node.body);
				checkNodeIndent(whileToken, neededIndent);
			}
		}

		/**
		 * Checks indent for nodes list
		 * @param {ASTNode[]} nodes Nodes to check
		 * @param {number} indent Needed indent
		 * @returns {void}
		 */
		function checkNodesIndent(nodes, indent) {
			nodes.forEach(node => checkNodeIndent(node, indent));
		}

		/**
		 * Checks last node line indent
		 * @param {ASTNode} node Node to examine
		 * @param {number} lastLineIndent Needed indent
		 * @returns {void}
		 */
		function checkLastNodeLineIndent(node, lastLineIndent) {
			const lastToken = sourceCode.getLastToken(node);
			const endIndent = getNodeIndent(lastToken, true);

			if (
				(endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0) &&
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
		 * Checks last return statement line indent
		 * @param {ASTNode} node Node to examine
		 * @param {number} firstLineIndent First line indent
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
		 * Checks first node line indent
		 * @param {ASTNode} node Node to examine
		 * @param {number} firstLineIndent Needed indent
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

		/**
		 * Calculates function body indent
		 * @param {ASTNode} calleeNode Function node
		 * @returns {number} Function offset
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
		 * Determines base indent for function block
		 * @param {ASTNode} calleeNode Function node
		 * @returns {number} Base indent
		 */
		function determineFunctionBlockBaseIndent(calleeNode) {
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
		 * @param {ASTNode} calleeNode Function node
		 * @param {ASTNode} blockNode Block node
		 * @param {number} indent Current indent
		 * @returns {number} Adjusted indent
		 */
		function adjustIndentForCallExpression(calleeNode, blockNode, indent) {
			if (calleeNode.parent.type !== "CallExpression") {
				return indent;
			}

			const calleeParent = calleeNode.parent;

			if (
				calleeNode.type !== "FunctionExpression" &&
				calleeNode.type !== "ArrowFunctionExpression"
			) {
				if (
					calleeParent &&
					calleeParent.loc.start.line < blockNode.loc.start.line
				) {
					return getNodeIndent(calleeParent).goodChar;
				}
			} else {
				if (
					isArgBeforeCalleeNodeMultiline(calleeNode) &&
					calleeParent.callee.loc.start.line ===
						calleeParent.callee.loc.end.line &&
					!isNodeFirstInLine(calleeNode)
				) {
					return getNodeIndent(calleeParent).goodChar;
				}
			}

			return indent;
		}

		/**
		 * Checks indent in function block
		 * @param {ASTNode} node BlockStatement node
		 * @returns {void}
		 */
		function checkIndentInFunctionBlock(node) {
			const calleeNode = node.parent;
			let indent = determineFunctionBlockBaseIndent(calleeNode);

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

		/**
		 * Gets elements from array or object node
		 * @param {ASTNode} node Array or object node
		 * @returns {ASTNode[]} Filtered elements
		 */
		function getArrayOrObjectElements(node) {
			const elements =
				node.type === "ArrayExpression" ? node.elements : node.properties;
			return elements.filter(elem => elem !== null);
		}

		/**
		 * Calculates node indent for array/object
		 * @param {ASTNode} node Array or object node
		 * @param {ASTNode} parentVarNode Parent variable node
		 * @returns {number} Node indent
		 */
		function calculateArrayOrObjectNodeIndent(node, parentVarNode) {
			if (!isNodeFirstInLine(node)) {
				return getNodeIndent(node).goodChar;
			}

			const parent = node.parent;
			let nodeIndent = getNodeIndent(parent).goodChar;

			if (
				!parentVarNode ||
				parentVarNode.loc.start.line !== node.loc.start.line
			) {
				nodeIndent = adjustNodeIndentForParent(
					node,
					parent,
					parentVarNode,
					nodeIndent,
				);
			}

			checkFirstNodeLineIndent(node, nodeIndent);
			return nodeIndent;
		}

		/**
		 * Adjusts node indent based on parent type
		 * @param {ASTNode} node Current node
		 * @param {ASTNode} parent Parent node
		 * @param {ASTNode} parentVarNode Parent variable node
		 * @param {number} nodeIndent Current indent
		 * @returns {number} Adjusted indent
		 */
		function adjustNodeIndentForParent(node, parent, parentVarNode, nodeIndent) {
			if (
				parent.type === "VariableDeclarator" &&
				parentVarNode === parentVarNode.parent.declarations[0]
			) {
				if (parent.loc.start.line === parentVarNode.loc.start.line) {
					nodeIndent +=
						indentSize *
						options.VariableDeclarator[parentVarNode.parent.kind];
				}
				return nodeIndent;
			}

			if (
				parent.type === "ObjectExpression" ||
				parent.type === "ArrayExpression"
			) {
				return adjustIndentForNestedArrayOrObject(node, parent, nodeIndent);
			}

			if (
				parent.type === "CallExpression" ||
				parent.type === "NewExpression"
			) {
				return adjustIndentForCallOrNewExpression(parent, node, nodeIndent);
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
		 * Adjusts indent for nested array or object
		 * @param {ASTNode} node Current node
		 * @param {ASTNode} parent Parent node
		 * @param {number} nodeIndent Current indent
		 * @returns {number} Adjusted indent
		 */
		function adjustIndentForNestedArrayOrObject(node, parent, nodeIndent) {
			const parentElements =
				parent.type === "ObjectExpression"
					? parent.properties
					: parent.elements;

			if (
				parentElements[0] &&
				parentElements[0].loc.start.line === parent.loc.start.line &&
				parentElements[0].loc.end.line !== parent.loc.start.line
			) {
				return nodeIndent;
			}

			if (typeof options[parent.type] === "number") {
				return nodeIndent + options[parent.type] * indentSize;
			}

			return parentElements[0].loc.start.column;
		}

		/**
		 * Adjusts indent for call or new expression
		 * @param {ASTNode} parent Parent node
		 * @param {ASTNode} node Current node
		 * @param {number} nodeIndent Current indent
		 * @returns {number} Adjusted indent
		 */
		function adjustIndentForCallOrNewExpression(parent, node, nodeIndent) {
			if (typeof options.CallExpression.arguments === "number") {
				return nodeIndent + options.CallExpression.arguments * indentSize;
			}
			if (options.CallExpression.arguments === "first") {
				if (parent.arguments.includes(node)) {
					return parent.arguments[0].loc.start.column;
				}
			} else {
				return nodeIndent + indentSize;
			}
			return nodeIndent;
		}

		/**
		 * Checks indent in array or object block
		 * @param {ASTNode} node Array or object node
		 * @returns {void}
		 */
		function checkIndentInArrayOrObjectBlock(node) {
			if (isSingleLineNode(node)) {
				return;
			}

			const elements = getArrayOrObjectElements(node);
			const parentVarNode = getVariableDeclaratorNode(node);

			const nodeIndent = calculateArrayOrObjectNodeIndent(node, parentVarNode);

			let elementsIndent;
			if (options[node.type] === "first") {
				elementsIndent = elements.length ? elements[0].loc.start.column : 0;
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

		/**
		 * Checks indentation for blocks
		 * @param {ASTNode} node Node to check
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

			const { indent, nodesToCheck } = determineBlockIndentAndNodes(node);

			if (nodesToCheck.length > 0) {
				checkNodesIndent(nodesToCheck, indent + indentSize);
			}

			if (node.type === "BlockStatement") {
				checkLastNodeLineIndent(node, indent);
			}
		}

		/**
		 * Checks if node is a function block
		 * @param {ASTNode} node Node to check
		 * @returns {boolean} True if function block
		 */
		function isFunctionBlock(node) {
			return (
				node.parent &&
				(node.parent.type === "FunctionExpression" ||
					node.parent.type === "FunctionDeclaration" ||
					node.parent.type === "ArrowFunctionExpression")
			);
		}

		/**
		 * Determines block indent and nodes to check
		 * @param {ASTNode} node Block node
		 * @returns {Object} Object with indent and nodesToCheck
		 */
		function determineBlockIndentAndNodes(node) {
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

			let indent;
			if (
				node.parent &&
				statementsWithProperties.includes(node.parent.type) &&
				isNodeBodyBlock(node)
			) {
				indent = getNodeIndent(node.parent).goodChar;
			} else if (node.parent && node.parent.type === "CatchClause") {
				indent = getNodeIndent(node.parent.parent).goodChar;
			} else {
				indent = getNodeIndent(node).goodChar;
			}

			let nodesToCheck;
			if (
				node.type === "IfStatement" &&
				node.consequent.type !== "BlockStatement"
			) {
				nodesToCheck = [node.consequent];
			} else if (Array.isArray(node.body)) {
				nodesToCheck = node.body;
			} else {
				nodesToCheck = [node.body];
			}

			return { indent, nodesToCheck };
		}

		/**
		 * Filters out same line variables
		 * @param {ASTNode} node Variable declaration node
		 * @returns {ASTNode[]} Filtered declarations
		 */
		function filterOutSameLineVars(node) {
			return node.declarations.reduce((finalCollection, elem) => {
				const lastElem = finalCollection.at(-1);

				if (
					(elem.loc.start.line !== node.loc.start.line && !lastElem) ||
					(lastElem &&
						lastElem.loc.start.line !== elem.loc.start.line)
				) {
					finalCollection.push(elem);
				}

				return finalCollection;
			}, []);
		}

		/**
		 * Checks indent in variable declarations
		 * @param {ASTNode} node Variable declaration node
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

		/**
		 * Checks indent for blockless nodes
		 * @param {ASTNode} node Node to examine
		 * @returns {void}
		 */
		function blockLessNodes(node) {
			if (node.body.type !== "BlockStatement") {
				blockIndentationCheck(node);
			}
		}

		/**
		 * Gets expected case indent
		 * @param {ASTNode} node Node to examine
		 * @param {number} [providedSwitchIndent] Switch indent
		 * @returns {number} Case indent
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

		/**
		 * Checks if return statement is wrapped in parenthesis
		 * @param {ASTNode} node Return statement node
		 * @returns {boolean} True if wrapped
		 */
		function isWrappedInParenthesis(node) {
			const regex = /^return\s*\(\s*\)/u;
			const statementWithoutArgument = sourceCode
				.getText(node)
				.replace(sourceCode.getText(node.argument), "");

			return regex.test(statementWithoutArgument);
		}

		/**
		 * Checks function parameters indent
		 * @param {ASTNode} node Function node
		 * @param {Object} funcOptions Function options
		 * @returns {void}
		 */
		function checkFunctionParametersIndent(node, funcOptions) {
			if (isSingleLineNode(node)) {
				return;
			}

			if (funcOptions.parameters === "first" && node.params.length) {
				checkNodesIndent(
					node.params.slice(1),
					node.params[0].loc.start.column,
				);
			} else if (funcOptions.parameters !== null) {
				checkNodesIndent(
					node.params,
					getNodeIndent(node).goodChar +
						indentSize * funcOptions.parameters,
				);
			}
		}

		/**
		 * Checks call expression arguments indent
		 * @param {ASTNode} node Call expression node
		 * @returns {void}
		 */
		function checkCallExpressionArgumentsIndent(node) {
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

		/**
		 * Checks member expression indent
		 * @param {ASTNode} node Member expression node
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
				checkFunctionParametersIndent(node, options.FunctionDeclaration);
			},

			FunctionExpression(node) {
				checkFunctionParametersIndent(node, options.FunctionExpression);
			},

			ReturnStatement(node) {
				if (isSingleLineNode(node)) {
					return;
				}

				const firstLineIndent = getNodeIndent(node).goodChar;

				if (isWrappedInParenthesis(node)) {
					checkLastReturnStatementLineIndent(node, firstLineIndent);
				} else {
					checkNodeIndent(node, firstLineIndent);
				}
			},

			CallExpression: checkCallExpressionArgumentsIndent,
		};
	},
};
```