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
					{ enum: ["tab"] },
					{ type: "integer", minimum: 0 },
				],
			},
			{
				type: "object",
				properties: {
					SwitchCase: { type: "integer", minimum: 0 },
					VariableDeclarator: {
						oneOf: [
							{ type: "integer", minimum: 0 },
							{
								type: "object",
								properties: {
									var: { type: "integer", minimum: 0 },
									let: { type: "integer", minimum: 0 },
									const: { type: "integer", minimum: 0 },
								},
							},
						],
					},
					outerIIFEBody: { type: "integer", minimum: 0 },
					MemberExpression: { type: "integer", minimum: 0 },
					FunctionDeclaration: {
						type: "object",
						properties: {
							parameters: {
								oneOf: [
									{ type: "integer", minimum: 0 },
									{ enum: ["first"] },
								],
							},
							body: { type: "integer", minimum: 0 },
						},
					},
					FunctionExpression: {
						type: "object",
						properties: {
							parameters: {
								oneOf: [
									{ type: "integer", minimum: 0 },
									{ enum: ["first"] },
								],
							},
							body: { type: "integer", minimum: 0 },
						},
					},
					CallExpression: {
						type: "object",
						properties: {
							parameters: {
								oneOf: [
									{ type: "integer", minimum: 0 },
									{ enum: ["first"] },
								],
							},
						},
					},
					ArrayExpression: {
						oneOf: [
							{ type: "integer", minimum: 0 },
							{ enum: ["first"] },
						],
					},
					ObjectExpression: {
						oneOf: [
							{ type: "integer", minimum: 0 },
							{ enum: ["first"] },
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

		// ============================================================================
		// Configuration Processing
		// ============================================================================

		/**
		 * Processes the indent type and size from context options
		 */
		function processIndentTypeAndSize() {
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
		 * Processes all context options
		 */
		function processContextOptions() {
			processIndentTypeAndSize();

			if (!context.options[1]) {
				return;
			}

			const opts = context.options[1];
			options.SwitchCase = opts.SwitchCase || 0;

			if (opts.VariableDeclarator) {
				processVariableDeclaratorOptions(opts);
			}

			processFunctionAndCallOptions(opts);
			processArrayAndObjectOptions(opts);
		}

		processContextOptions();

		// ============================================================================
		// Error Reporting
		// ============================================================================

		/**
		 * Creates an error message for a line with expected/actual indentation
		 */
		function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
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
		 */
		function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
			if (gottenSpaces && gottenTabs) {
				return;
			}

			const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);
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

		// ============================================================================
		// Node Indent Utilities
		// ============================================================================

		/**
		 * Get the actual indent of node
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
		 * Checks if node is the first in its own start line
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
		 */
		function isSingleLineNode(node) {
			const lastToken = sourceCode.getLastToken(node);
			return node.loc.start.line === lastToken.loc.end.line;
		}

		/**
		 * Returns a parent node of given node based on a specified type
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
		 */
		function getVariableDeclaratorNode(node) {
			return getParentNodeByType(node, "VariableDeclarator");
		}

		/**
		 * Check to see if the node is part of the multi-line variable declaration
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
		 * Check to see if the node is a file level IIFE
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
		 */
		function isWrappedInParenthesis(node) {
			const regex = /^return\s*\(\s*\)/u;
			const statementWithoutArgument = sourceCode
				.getText(node)
				.replace(sourceCode.getText(node.argument), "");

			return regex.test(statementWithoutArgument);
		}

		// ============================================================================
		// Indent Checking Functions
		// ============================================================================

		/**
		 * Check indent for node
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

			checkNodeSpecialCases(node, neededIndent);
		}

		/**
		 * Check special cases for node indentation (if/else, try/catch, etc.)
		 */
		function checkNodeSpecialCases(node, neededIndent) {
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
		 * Check indent for nodes list
		 */
		function checkNodesIndent(nodes, indent) {
			nodes.forEach(node => checkNodeIndent(node, indent));
		}

		/**
		 * Check last node line indent
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
		 * Check last return statement line indent
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
		 * Check first node line indent
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

		// ============================================================================
		// Block Indentation Checking
		// ============================================================================

		/**
		 * Calculate function body indent
		 */
		function calculateFunctionBodyIndent(calleeNode) {
			let functionOffset = indentSize;

			if (options.outerIIFEBody !== null && isOuterIIFE(calleeNode)) {
				functionOffset = options.outerIIFEBody * indentSize;
			} else if (calleeNode.type === "FunctionExpression") {
				functionOffset = options.FunctionExpression.body * indentSize;
			} else if (calleeNode.type === "FunctionDeclaration") {
				functionOffset = options.FunctionDeclaration.body * indentSize;
			}

			return functionOffset;
		}

		/**
		 * Calculate base indent for function block
		 */
		function calculateFunctionBaseIndent(calleeNode) {
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
		 */
		function adjustIndentForCallExpression(calleeNode, baseIndent) {
			let indent = baseIndent;
			const calleeParent = calleeNode.parent;

			if (calleeParent.type !== "CallExpression") {
				return indent;
			}

			if (
				calleeNode.type !== "FunctionExpression" &&
				calleeNode.type !== "ArrowFunctionExpression"
			) {
				if (
					calleeParent &&
					calleeParent.loc.start.line < calleeNode.parent.loc.start.line
				) {
					indent = getNodeIndent(calleeParent).goodChar;
				}
			} else {
				if (
					isArgBeforeCalleeNodeMultiline(calleeNode) &&
					calleeParent.callee.loc.start.line ===
						calleeParent.callee.loc.end.line &&
					!isNodeFirstInLine(calleeNode)
				) {
					indent = getNodeIndent(calleeParent).goodChar;
				}
			}

			return indent;
		}

		/**
		 * Check indent in function block
		 */
		function checkIndentInFunctionBlock(node) {
			const calleeNode = node.parent;
			let indent = calculateFunctionBaseIndent(calleeNode);
			indent = adjustIndentForCallExpression(calleeNode, indent);

			const functionOffset = calculateFunctionBodyIndent(calleeNode);
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
		 * Filter out the elements which are on the same line of each other or the node
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
		 * Calculate node indent for array/object block
		 */
		function calculateArrayObjectNodeIndent(node, parentVarNode) {
			const parent = node.parent;
			let nodeIndent = getNodeIndent(parent).goodChar;

			if (
				!parentVarNode ||
				parentVarNode.loc.start.line !== node.loc.start.line
			) {
				if (
					parent.type !== "VariableDeclarator" ||
					parentVarNode === parentVarNode.parent.declarations[0]
				) {
					nodeIndent = applyParentTypeIndent(
						node,
						parent,
						nodeIndent,
						parentVarNode,
					);
				}
			}

			return nodeIndent;
		}

		/**
		 * Apply indentation based on parent type
		 */
		function applyParentTypeIndent(node, parent, nodeIndent, parentVarNode) {
			let indent = nodeIndent;

			if (
				parent.type === "VariableDeclarator" &&
				parentVarNode.loc.start.line === parent.loc.start.line
			) {
				indent +=
					indentSize *
					options.VariableDeclarator[parentVarNode.parent.kind];
			} else if (
				parent.type === "ObjectExpression" ||
				parent.type === "ArrayExpression"
			) {
				indent = applyNestedArrayObjectIndent(node, parent, indent);
			} else if (
				parent.type === "CallExpression" ||
				parent.type === "NewExpression"
			) {
				indent = applyCallExpressionIndent(node, parent, indent);
			} else if (
				parent.type === "LogicalExpression" ||
				parent.type === "ArrowFunctionExpression"
			) {
				indent += indentSize;
			}

			return indent;
		}

		/**
		 * Apply indentation for nested array/object expressions
		 */
		function applyNestedArrayObjectIndent(node, parent, nodeIndent) {
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
		 * Apply indentation for call expressions
		 */
		function applyCallExpressionIndent(node, parent, nodeIndent) {
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
			} else {
				return nodeIndent + indentSize;
			}

			return nodeIndent;
		}

		/**
		 * Check indent in array or object block
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

			let nodeIndent;
			let elementsIndent;
			const parentVarNode = getVariableDeclaratorNode(node);

			if (isNodeFirstInLine(node)) {
				nodeIndent = calculateArrayObjectNodeIndent(
					node,
					parentVarNode,
				);
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
		 * Check indentation for blocks
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

			const indent = calculateBlockIndent(node);
			const nodesToCheck = getBlockNodesToCheck(node);

			if (nodesToCheck.length > 0) {
				checkNodesIndent(nodesToCheck, indent + indentSize);
			}

			if (node.type === "BlockStatement") {
				checkLastNodeLineIndent(node, indent);
			}
		}

		/**
		 * Calculate indent for block statement
		 */
		function calculateBlockIndent(node) {
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
		 * Get nodes to check in block statement
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
		 * Check and decide whether to check for indentation for blockless nodes
		 */
		function blockLessNodes(node) {
			if (node.body.type !== "BlockStatement") {
				blockIndentationCheck(node);
			}
		}

		/**
		 * Returns the expected indentation for the case statement
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

		// ============================================================================
		// Function Parameter Checking
		// ============================================================================

		/**
		 * Check function parameters indentation
		 */
		function checkFunctionParameters(node, options) {
			if (isSingleLineNode(node)) {
				return;
			}

			if (options.parameters === "first" && node.params.length) {
				checkNodesIndent(
					node.params.slice(1),
					node.params[0].loc.start.column,
				);
			} else if (options.parameters !== null) {
				checkNodesIndent(
					node.params,
					getNodeIndent(node).goodChar +
						indentSize * options.parameters,
				);
			}
		}

		/**
		 * Check call expression arguments indentation
		 */
		function checkCallExpressionArguments(node) {
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

		// ============================================================================
		// Member Expression Checking
		// ============================================================================

		/**
		 * Check member expression indentation
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

		// ============================================================================
		// Return Statement Checking
		// ============================================================================

		/**
		 * Check return statement indentation
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

		// ============================================================================
		// Rule Handlers
		// ============================================================================

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

			ObjectExpression: checkIndentInArrayOrObjectBlock,
			ArrayExpression: checkIndentInArrayOrObjectBlock,

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
				checkFunctionParameters(node, options.FunctionDeclaration);
			},

			FunctionExpression(node) {
				checkFunctionParameters(node, options.FunctionExpression);
			},

			ReturnStatement: checkReturnStatementIndent,
			CallExpression: checkCallExpressionArguments,
		};
	},
};
```