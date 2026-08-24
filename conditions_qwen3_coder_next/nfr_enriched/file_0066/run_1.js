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

		// --- Configuration Processing ---
		/** Extracts indentation configuration from user-provided options. */
		function buildConfig() {
			const config = {
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

			if (!context.options.length) return config;

			if (context.options[0] === "tab") {
				config.indentSize = 1;
				config.indentType = "tab";
			} else if (typeof context.options[0] === "number") {
				config.indentSize = context.options[0];
				config.indentType = "space";
			} else {
				config.indentSize = 4;
				config.indentType = "space";
			}

			if (!context.options[1]) return config;

			const opts = context.options[1];

			config.SwitchCase = opts.SwitchCase || 0;

			if (typeof opts.VariableDeclarator === "number") {
				config.VariableDeclarator = {
					var: opts.VariableDeclarator,
					let: opts.VariableDeclarator,
					const: opts.VariableDeclarator,
				};
			} else if (typeof opts.VariableDeclarator === "object") {
				Object.assign(config.VariableDeclarator, opts.VariableDeclarator);
			}

			if (typeof opts.outerIIFEBody === "number") {
				config.outerIIFEBody = opts.outerIIFEBody;
			}

			if (typeof opts.MemberExpression === "number") {
				config.MemberExpression = opts.MemberExpression;
			}

			if (typeof opts.FunctionDeclaration === "object") {
				Object.assign(config.FunctionDeclaration, opts.FunctionDeclaration);
			}

			if (typeof opts.FunctionExpression === "object") {
				Object.assign(config.FunctionExpression, opts.FunctionExpression);
			}

			if (typeof opts.CallExpression === "object") {
				Object.assign(config.CallExpression, opts.CallExpression);
			}

			if (
				typeof opts.ArrayExpression === "number" ||
				typeof opts.ArrayExpression === "string"
			) {
				config.ArrayExpression = opts.ArrayExpression;
			}

			if (
				typeof opts.ObjectExpression === "number" ||
				typeof opts.ObjectExpression === "string"
			) {
				config.ObjectExpression = opts.ObjectExpression;
			}

			return config;
		}

		const sourceCode = context.sourceCode;
		const config = buildConfig();
		const caseIndentStore = {};

		/**
		 * Creates an error message for a line, given the expected/actual indentation.
		 * @param {number} expectedAmount The expected amount of indentation characters for this line
		 * @param {number} actualSpaces The actual number of indentation spaces that were found on this line
		 * @param {number} actualTabs The actual number of indentation tabs that were found on this line
		 * @returns {Object} An object containing formatted error strings.
		 */
		function createErrorMessageData(
			expectedAmount,
			actualSpaces,
			actualTabs,
		) {
			const expectedStatement = `${expectedAmount} ${config.indentType}${expectedAmount === 1 ? "" : "s"}`;
			const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
			const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`;
			let foundStatement;

			if (actualSpaces > 0 && actualTabs > 0) {
				foundStatement = `${actualSpaces} ${foundSpacesWord} and ${actualTabs} ${foundTabsWord}`;
			} else if (actualSpaces > 0) {
				foundStatement = config.indentType === "space" ? actualSpaces : `${actualSpaces} ${foundSpacesWord}`;
			} else if (actualTabs > 0) {
				foundStatement = config.indentType === "tab" ? actualTabs : `${actualTabs} ${foundTabsWord}`;
			} else {
				foundStatement = "0";
			}

			return {
				expected: expectedStatement,
				actual: foundStatement,
			};
		}

		/**
		 * Reports a given indent violation.
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

			const desiredIndent = (config.indentType === "space" ? " " : "\t").repeat(needed);

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

		/**
		 * Get the actual indent of a node.
		 * @param {ASTNode|Token} node Node to examine
		 * @param {boolean} [byLastLine=false] get indent of node's last line
		 * @returns {Object} The node's indent. Contains keys `space` and `tab`, representing the indent of each character.
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
				goodChar: config.indentType === "space" ? spaces : tabs,
				badChar: config.indentType === "space" ? tabs : spaces,
			};
		}

		/**
		 * Checks whether a node is the first token on its line.
		 * @param {ASTNode} node The node to check
		 * @param {boolean} [byEndLocation=false] Lookup based on start position or end
		 * @returns {boolean} True if the node is the first on its line.
		 */
		function isNodeFirstInLine(node, byEndLocation) {
			const firstToken =
					byEndLocation === true
						? sourceCode.getLastToken(node, 1)
						: sourceCode.getTokenBefore(node);
			const startLine =
					byEndLocation === true
						? node.loc.end.line
						: node.loc.start.line;
			const endLine = firstToken ? firstToken.loc.end.line : -1;

			return startLine !== endLine;
		}

		/**
		 * Check indent for a single node.
		 * @param {ASTNode} node Node to check
		 * @param {number} neededIndent Needed indentation
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
		 * Check indentation for a list of nodes.
		 * @param {ASTNode[]} nodes List of nodes
		 * @param {number} indent Indentation level
		 * @returns {void}
		 */
		function checkNodesIndent(nodes, indent) {
			nodes.forEach(node => checkNodeIndent(node, indent));
		}

		/**
		 * Check indentation of the last line of a node.
		 * @param {ASTNode} node Node to examine
		 * @param {number} lastLineIndent Needed indentation for the last line
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
		 * Check indentation of the last line for a return statement.
		 * @param {ASTNode} node Return statement node
		 * @param {number} firstLineIndent Needed indentation for the first line
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
		 * Check indentation of the first line of a node.
		 * @param {ASTNode} node Node to check
		 * @param {number} firstLineIndent Needed indentation
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
		 * Get the parent node of a specific type.
		 * @param {ASTNode} node Node
		 * @param {string} type Expected parent type
		 * @param {string[]} stopAtList Types where to stop traversal
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
		 * Get the VariableDeclarator node if present.
		 * @param {ASTNode} node Node
		 * @returns {ASTNode|null} VariableDeclarator or null
		 */
		function getVariableDeclaratorNode(node) {
			return getParentNodeByType(node, "VariableDeclarator");
		}

		/**
		 * Check if a node is part of a multi-line variable declaration.
		 * @param {ASTNode} node Node
		 * @param {ASTNode|null} varNode VariableDeclarator node
		 * @returns {boolean} Whether the node is in a multi-line var declaration
		 */
		function isNodeInVarOnTop(node, varNode) {
			return (
				!!varNode &&
				varNode.parent.loc.start.line === node.loc.start.line &&
				varNode.parent.declarations.length > 1
			);
		}

		/**
		 * Check if the argument before the callee node is multiline.
		 * @param {ASTNode} node Node
		 * @returns {boolean} Whether the argument before callee is multiline
		 */
		function isArgBeforeCalleeNodeMultiline(node) {
			const parent = node.parent;

			if (
				parent.arguments.length < 2 ||
				parent.arguments[1] !== node
			) {
				return false;
			}

			return (
				parent.arguments[0].loc.end.line >
				parent.arguments[0].loc.start.line
			);
		}

		/**
		 * Check if a function is an outer IIFE.
		 * @param {ASTNode} node Function node
		 * @returns {boolean} Whether it is an outer IIFE
		 */
		function isOuterIIFE(node) {
			const parent = node.parent;

			if (
				parent.type !== "CallExpression" ||
				parent.callee !== node
			) {
				return false;
			}

			let stmt = parent.parent;

			while (
				stmt &&
				(stmt.type === "UnaryExpression" &&
					["!", "~", "+", "-"].includes(stmt.operator)) ||
				stmt.type === "AssignmentExpression" ||
				stmt.type === "LogicalExpression" ||
				stmt.type === "SequenceExpression" ||
				stmt.type === "VariableDeclarator"
			) {
				stmt = stmt.parent;
			}

			return (
				stmt &&
				(stmt.type === "ExpressionStatement" ||
					stmt.type === "VariableDeclaration") &&
				stmt.parent &&
				stmt.parent.type === "Program"
			);
		}

		/**
		 * Check indentation for a block inside a function.
		 * @param {ASTNode} node BlockStatement node
		 * @returns {void}
		 */
		function checkIndentInFunctionBlock(node) {
			const calleeNode = node.parent;

			let indent = getNodeIndent(calleeNode, false).goodChar;

			if (
				calleeNode.parent &&
				(calleeNode.parent.type === "Property" ||
					calleeNode.parent.type === "ArrayExpression")
			) {
				indent = getNodeIndent(calleeNode, false).goodChar;
			} else if (calleeNode.parent.type === "CallExpression") {
				const calleeParent = calleeNode.parent;

				if (
					calleeNode.type !== "FunctionExpression" &&
					calleeNode.type !== "ArrowFunctionExpression"
				) {
					if (
						calleeParent &&
						calleeParent.loc.start.line < node.loc.start.line
					) {
						indent = getNodeIndent(calleeParent).goodChar;
					}
				} else if (
					isArgBeforeCalleeNodeMultiline(calleeNode) &&
					calleeParent.callee.loc.start.line ===
						calleeParent.callee.loc.end.line &&
					!isNodeFirstInLine(calleeNode)
				) {
					indent = getNodeIndent(calleeParent).goodChar;
				}
			}

			let functionOffset = config.indentSize;

			if (config.outerIIFEBody !== null && isOuterIIFE(calleeNode)) {
				functionOffset = config.outerIIFEBody * config.indentSize;
			} else if (calleeNode.type === "FunctionExpression") {
				functionOffset =
					config.FunctionExpression.body * config.indentSize;
			} else if (calleeNode.type === "FunctionDeclaration") {
				functionOffset =
					config.FunctionDeclaration.body * config.indentSize;
			}

			indent += functionOffset;

			const parentVarNode = getVariableDeclaratorNode(node);

			if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
				indent +=
					config.indentSize *
					config.VariableDeclarator[parentVarNode.parent.kind];
			}

			if (node.body.length > 0) {
				checkNodesIndent(node.body, indent);
			}

			checkLastNodeLineIndent(node, indent - functionOffset);
		}

		/**
		 * Determines if a node starts and ends on the same line.
		 * @param {ASTNode} node Node
		 * @returns {boolean} True if node is single-line
		 */
		function isSingleLineNode(node) {
			const lastToken = sourceCode.getLastToken(node);
			const startLine = node.loc.start.line;
			const endLine = lastToken.loc.end.line;

			return startLine === endLine;
		}

		/**
		 * Check indentation for array or object blocks.
		 * @param {ASTNode} node ArrayExpression or ObjectExpression node
		 * @returns {void}
		 */
		function checkIndentInArrayOrObjectBlock(node) {
			if (isSingleLineNode(node)) {
				return;
			}

			const elements =
				node.type === "ArrayExpression"
					? node.elements
					: node.properties;
			const filteredElements = elements.filter(elem => elem !== null);

			let nodeIndent;
			let elementsIndent;

			const parentVarNode = getVariableDeclaratorNode(node);

			if (isNodeFirstInLine(node)) {
				nodeIndent = calculateIndentForFirstInLine(
					node,
					parentVarNode,
				);
				checkFirstNodeLineIndent(node, nodeIndent);
			} else {
				nodeIndent = getNodeIndent(node).goodChar;
			}

			if (config[node.type] === "first") {
				elementsIndent =
					filteredElements.length > 0
						? filteredElements[0].loc.start.column
						: 0;
			} else {
				elementsIndent =
					nodeIndent +
					config.indentSize * config[node.type];
			}

			if (isNodeInVarOnTop(node, parentVarNode)) {
				elementsIndent +=
					config.indentSize *
					config.VariableDeclarator[parentVarNode.parent.kind];
			}

			checkNodesIndent(filteredElements, elementsIndent);

			if (
				filteredElements.length > 0 &&
				filteredElements.at(-1).loc.end.line === node.loc.end.line
			) {
				return;
			}

			checkLastNodeLineIndent(
				node,
				nodeIndent +
					(isNodeInVarOnTop(node, parentVarNode)
						? config.VariableDeclarator[
								parentVarNode.parent.kind
							] * config.indentSize
						: 0),
			);
		}

		/**
		 * Calculates the expected indentation for a node that is first on its line.
		 * @param {ASTNode} node Node
		 * @param {ASTNode|null} parentVarNode VariableDeclarator node if present
		 * @returns {number} Calculated indent
		 */
		function calculateIndentForFirstInLine(node, parentVarNode) {
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
					if (
						parent.type === "VariableDeclarator" &&
						parentVarNode.loc.start.line ===
							parent.loc.start.line
					) {
						nodeIndent +=
							config.indentSize *
							config.VariableDeclarator[
								parentVarNode.parent.kind
							];
					} else if (
						parent.type === "ObjectExpression" ||
						parent.type === "ArrayExpression"
					) {
						const parentElements =
							parent.type === "ObjectExpression"
								? parent.properties
								: parent.elements;

						if (
							parentElements[0] &&
							parentElements[0].loc.start.line ===
								parent.loc.start.line &&
							parentElements[0].loc.end.line !==
								parent.loc.start.line
						) {
							// no indent change needed
						} else if (
							typeof config[parent.type] === "number"
						) {
							nodeIndent +=
								config[parent.type] * config.indentSize;
						} else {
							nodeIndent = parentElements[0].loc.start.column;
						}
					} else if (
						parent.type === "CallExpression" ||
						parent.type === "NewExpression"
					) {
						if (
							typeof config.CallExpression.arguments ===
							"number"
						) {
							nodeIndent +=
								config.CallExpression.arguments *
								config.indentSize;
						} else if (
							config.CallExpression.arguments === "first"
						) {
							if (parent.arguments.includes(node)) {
								nodeIndent =
									parent.arguments[0].loc.start.column;
							}
						} else {
							nodeIndent += config.indentSize;
						}
					} else if (
						parent.type === "LogicalExpression" ||
						parent.type === "ArrowFunctionExpression"
					) {
						nodeIndent += config.indentSize;
					}
				}
			}

			return nodeIndent;
		}

		/**
		 * Check whether a node is a BlockStatement or contains one.
		 * @param {ASTNode} node Node
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
		 * General block indentation check.
		 * @param {ASTNode} node BlockStatement node
		 * @returns {void}
		 */
		function blockIndentationCheck(node) {
			if (isSingleLineNode(node)) {
				return;
			}

			if (
				node.parent &&
				["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(
					node.parent.type,
				)
			) {
				checkIndentInFunctionBlock(node);
				return;
			}

			let indent;
			let nodesToCheck;

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
				indent = getNodeIndent(node.parent).goodChar;
			} else if (node.parent && node.parent.type === "CatchClause") {
				indent = getNodeIndent(node.parent.parent).goodChar;
			} else {
				indent = getNodeIndent(node).goodChar;
			}

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

			if (nodesToCheck.length > 0) {
				checkNodesIndent(nodesToCheck, indent + config.indentSize);
			}

			if (node.type === "BlockStatement") {
				checkLastNodeLineIndent(node, indent);
			}
		}

		/**
		 * Filter out elements on the same line, keeping only one per line (except the first).
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
		 * Check indentation for variable declarations.
		 * @param {ASTNode} node VariableDeclaration node
		 * @returns {void}
		 */
		function checkIndentInVariableDeclarations(node) {
			const elements = filterOutSameLineVars(node);
			const nodeIndent = getNodeIndent(node).goodChar;

			const elementsIndent =
				nodeIndent +
				config.indentSize * config.VariableDeclarator[node.kind];

			checkNodesIndent(elements, elementsIndent);

			if (
				sourceCode.getLastToken(node).loc.end.line <=
				elements.at(-1).loc.end.line
			) {
				return;
			}

			const tokenBeforeLastElement =
				sourceCode.getTokenBefore(elements.at(-1));

			if (
				tokenBeforeLastElement.value === ","
			) {
				checkLastNodeLineIndent(
					node,
					getNodeIndent(tokenBeforeLastElement).goodChar,
				);
			} else {
				checkLastNodeLineIndent(
					node,
					elementsIndent - config.indentSize,
				);
			}
		}

		/**
		 * Block-less statement indentation check.
		 * @param {ASTNode} node Statement node
		 * @returns {void}
		 */
		function blockLessNodes(node) {
			if (node.body.type !== "BlockStatement") {
				blockIndentationCheck(node);
			}
		}

		/**
		 * Get expected indentation for case statements.
		 * @param {ASTNode} node Case or switch node
		 * @param {number} [providedSwitchIndent] Provided switch indent
		 * @returns {number} Expected case indent
		 */
		function expectedCaseIndent(node, providedSwitchIndent) {
			const switchNode =
				node.type === "SwitchStatement" ? node : node.parent;
			const switchIndent =
				typeof providedSwitchIndent === "undefined"
					? getNodeIndent(switchNode).goodChar
					: providedSwitchIndent;
			let caseIndent;

			if (
				caseIndentStore[switchNode.loc.start.line]
			) {
				return caseIndentStore[switchNode.loc.start.line];
			}

			if (switchNode.cases.length > 0 && config.SwitchCase === 0) {
				caseIndent = switchIndent;
			} else {
				caseIndent =
					switchIndent +
					config.indentSize * config.SwitchCase;
			}

			caseIndentStore[switchNode.loc.start.line] = caseIndent;
			return caseIndent;
		}

		/**
		 * Checks whether a return statement is wrapped in parentheses.
		 * @param {ASTNode} node Return statement node
		 * @returns {boolean} Whether the return is wrapped
		 */
		function isWrappedInParenthesis(node) {
			const statementWithoutArgument = sourceCode
				.getText(node)
				.replace(sourceCode.getText(node.argument), "");

			return /^return\s*\(\s*\)$/.test(statementWithoutArgument);
		}

		return {
			Program: node => {
				if (node.body.length > 0) {
					checkNodesIndent(
						node.body,
						getNodeIndent(node).goodChar,
					);
				}
			},

			ClassBody: blockIndentationCheck,

			BlockStatement: blockIndentationCheck,

			WhileStatement: blockLessNodes,

			ForStatement: blockLessNodes,

			ForInStatement: blockLessNodes,

			ForOfStatement: blockLessNodes,

			DoWhileStatement: blockLessNodes,

			IfStatement: node => {
				if (
					node.consequent.type !== "BlockStatement" &&
					node.consequent.loc.start.line > node.loc.start.line
				) {
					blockIndentationCheck(node);
				}
			},

			VariableDeclaration: node => {
				if (
					node.declarations.at(-1).loc.start.line >
					node.declarations[0].loc.start.line
				) {
					checkIndentInVariableDeclarations(node);
				}
			},

			ObjectExpression: node => {
				checkIndentInArrayOrObjectBlock(node);
			},

			ArrayExpression: node => {
				checkIndentInArrayOrObjectBlock(node);
			},

			MemberExpression: node => {
				if (typeof config.MemberExpression === "undefined") {
					return;
				}

				if (isSingleLineNode(node)) {
					return;
				}

				if (
					getParentNodeByType(node, "VariableDeclarator", [
						"FunctionExpression",
						"ArrowFunctionExpression",
					]) ||
					getParentNodeByType(node, "AssignmentExpression", [
						"FunctionExpression",
					])
				) {
					return;
				}

				const propertyIndent =
					getNodeIndent(node).goodChar +
					config.indentSize * config.MemberExpression;

				const checkNodes = [node.property];
				const dot = sourceCode.getTokenBefore(node.property);

				if (
					dot.type === "Punctuator" &&
					dot.value === "."
				) {
					checkNodes.push(dot);
				}

				checkNodesIndent(checkNodes, propertyIndent);
			},

			SwitchStatement: node => {
				const switchIndent = getNodeIndent(node).goodChar;
				const caseIndent = expectedCaseIndent(node, switchIndent);

				checkNodesIndent(node.cases, caseIndent);
				checkLastNodeLineIndent(node, switchIndent);
			},

			SwitchCase: node => {
				if (isSingleLineNode(node)) {
					return;
				}
				const caseIndent = expectedCaseIndent(node);

				checkNodesIndent(
					node.consequent,
					caseIndent + config.indentSize,
				);
			},

			FunctionDeclaration: node => {
				if (isSingleLineNode(node)) {
					return;
				}
				if (
					config.FunctionDeclaration.parameters === "first" &&
					node.params.length
				) {
					checkNodesIndent(
						node.params.slice(1),
						node.params[0].loc.start.column,
					);
				} else if (
					config.FunctionDeclaration.parameters !== null
				) {
					checkNodesIndent(
						node.params,
						getNodeIndent(node).goodChar +
							config.indentSize *
								config.FunctionDeclaration.parameters,
					);
				}
			},

			FunctionExpression: node => {
				if (isSingleLineNode(node)) {
					return;
				}
				if (
					config.FunctionExpression.parameters === "first" &&
					node.params.length
				) {
					checkNodesIndent(
						node.params.slice(1),
						node.params[0].loc.start.column,
					);
				} else if (
					config.FunctionExpression.parameters !== null
				) {
					checkNodesIndent(
						node.params,
						getNodeIndent(node).goodChar +
							config.indentSize *
								config.FunctionExpression.parameters,
					);
				}
			},

			ReturnStatement: node => {
				if (isSingleLineNode(node)) {
					return;
				}

				const firstLineIndent = getNodeIndent(node).goodChar;

				if (isWrappedInParenthesis(node)) {
					checkLastReturnStatementLineIndent(
						node,
						firstLineIndent,
					);
				} else {
					checkNodeIndent(node, firstLineIndent);
				}
			},

			CallExpression: node => {
				if (isSingleLineNode(node)) {
					return;
				}
				if (
					config.CallExpression.arguments === "first" &&
					node.arguments.length
				) {
					checkNodesIndent(
						node.arguments.slice(1),
						node.arguments[0].loc.start.column,
					);
				} else if (
					config.CallExpression.arguments !== null
				) {
					checkNodesIndent(
						node.arguments,
						getNodeIndent(node).goodChar +
							config.indentSize *
								config.CallExpression.arguments,
					);
				}
			},
		};
	},
};