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
					message: "ESLint Stylistic now maintains deprecated stylistic core rules.",
					url: "https://eslint.style/guide/migration",
					plugin: { name: "@stylistic/eslint-plugin", url: "https://eslint.style" },
					rule: { name: "indent", url: "https://eslint.style/rules/indent" },
				},
			],
		},
		fixable: "whitespace",
		schema: [
			{ oneOf: [{ enum: ["tab"] }, { type: "integer", minimum: 0 }] },
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
							arguments: {
								oneOf: [
									{ type: "integer", minimum: 0 },
									{ enum: ["first"] },
								],
							},
						},
					},
					ArrayExpression: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }] },
					ObjectExpression: { oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }] },
				},
				additionalProperties: false,
			},
		],
		messages: {
			expected: "Expected indentation of {{expected}} but found {{actual}}.",
		},
	},

	create(context) {
		const sourceCode = context.sourceCode;
		const options = parseOptions(context.options);
		const caseIndentStore = {};

		/**
		 * Parses configuration options into a normalized structure.
		 * @param {Array} configOptions The configuration options array.
		 * @returns {Object} Normalized options object.
		 */
		function parseOptions(configOptions) {
			const DEFAULT_VARIABLE_INDENT = 1;
			const DEFAULT_PARAMETER_INDENT = null;
			const DEFAULT_FUNCTION_BODY_INDENT = 1;

			const result = {
				SwitchCase: 0,
				VariableDeclarator: { var: DEFAULT_VARIABLE_INDENT, let: DEFAULT_VARIABLE_INDENT, const: DEFAULT_VARIABLE_INDENT },
				outerIIFEBody: null,
				FunctionDeclaration: { parameters: DEFAULT_PARAMETER_INDENT, body: DEFAULT_FUNCTION_BODY_INDENT },
				FunctionExpression: { parameters: DEFAULT_PARAMETER_INDENT, body: DEFAULT_FUNCTION_BODY_INDENT },
				CallExpression: { arguments: DEFAULT_PARAMETER_INDENT },
				ArrayExpression: 1,
				ObjectExpression: 1,
			};

			if (!configOptions.length) {
				return result;
			}

			const [indentConfig, detailedConfig] = configOptions;

			if (indentConfig === "tab") {
				result.indentSize = 1;
				result.indentType = "tab";
			} else if (typeof indentConfig === "number") {
				result.indentSize = indentConfig;
				result.indentType = "space";
			}

			if (!detailedConfig) {
				return result;
			}

			if (typeof detailedConfig.SwitchCase === "number") {
				result.SwitchCase = detailedConfig.SwitchCase;
			}
			if (typeof detailedConfig.VariableDeclarator === "number") {
				result.VariableDeclarator = {
					var: detailedConfig.VariableDeclarator,
					let: detailedConfig.VariableDeclarator,
					const: detailedConfig.VariableDeclarator,
				};
			} else if (typeof detailedConfig.VariableDeclarator === "object") {
				Object.assign(result.VariableDeclarator, detailedConfig.VariableDeclarator);
			}
			if (typeof detailedConfig.outerIIFEBody === "number") {
				result.outerIIFEBody = detailedConfig.outerIIFEBody;
			}
			if (typeof detailedConfig.MemberExpression === "number") {
				result.MemberExpression = detailedConfig.MemberExpression;
			}
			if (typeof detailedConfig.FunctionDeclaration === "object") {
				Object.assign(result.FunctionDeclaration, detailedConfig.FunctionDeclaration);
			}
			if (typeof detailedConfig.FunctionExpression === "object") {
				Object.assign(result.FunctionExpression, detailedConfig.FunctionExpression);
			}
			if (typeof detailedConfig.CallExpression === "object") {
				Object.assign(result.CallExpression, detailedConfig.CallExpression);
			}
			if (typeof detailedConfig.ArrayExpression === "number" || typeof detailedConfig.ArrayExpression === "string") {
				result.ArrayExpression = detailedConfig.ArrayExpression;
			}
			if (typeof detailedConfig.ObjectExpression === "number" || typeof detailedConfig.ObjectExpression === "string") {
				result.ObjectExpression = detailedConfig.ObjectExpression;
			}

			return result;
		}

		/**
		 * Creates an error message for a line, given the expected/actual indentation.
		 * @param {number} expectedAmount The expected amount of indentation characters for this line
		 * @param {number} actualSpaces The actual number of indentation spaces that were found on this line
		 * @param {number} actualTabs The actual number of indentation tabs that were found on this line
		 * @returns {Object} An error message object with expected and actual values.
		 */
		function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
			const indentType = options.indentType;
			const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
			const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
			const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`;
			let foundStatement;

			if (actualSpaces > 0 && actualTabs > 0) {
				foundStatement = `${actualSpaces} ${foundSpacesWord} and ${actualTabs} ${foundTabsWord}`;
			} else if (actualSpaces > 0) {
				foundStatement = indentType === "space" ? actualSpaces : `${actualSpaces} ${foundSpacesWord}`;
			} else if (actualTabs > 0) {
				foundStatement = indentType === "tab" ? actualTabs : `${actualTabs} ${foundTabsWord}`;
			} else {
				foundStatement = "0";
			}

			return { expected: expectedStatement, actual: foundStatement };
		}

		/**
		 * Reports an indentation violation for a given node.
		 * @param {ASTNode} node The node with incorrect indentation.
		 * @param {number} needed The expected indentation amount.
		 * @param {number} gottenSpaces The actual space count.
		 * @param {number} gottenTabs The actual tab count.
		 * @param {Object} [loc] Optional location override.
		 * @param {boolean} [isLastNodeCheck=false] Whether this is a last-node check.
		 * @returns {void}
		 */
		function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck = false) {
			if (gottenSpaces && gottenTabs) {
				return;
			}

			const desiredIndent = (options.indentType === "space" ? " " : "\t").repeat(needed);
			const textRange = isLastNodeCheck
				? [
						node.range[1] - node.loc.end.column,
						node.range[1] - node.loc.end.column + gottenSpaces + gottenTabs,
					]
				: [
						node.range[0] - node.loc.start.column,
						node.range[0] - node.loc.start.column + gottenSpaces + gottenTabs,
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
		 * Gets the indentation of a node or token.
		 * @param {ASTNode|Token} node The node or token to examine.
		 * @param {boolean} [byLastLine=false] Whether to use the last token's line.
		 * @returns {Object} Indentation info with space, tab, goodChar, and badChar counts.
		 */
		function getNodeIndent(node, byLastLine = false) {
			const token = byLastLine ? sourceCode.getLastToken(node) : sourceCode.getFirstToken(node);
			const textBeforeNode = sourceCode.getText(token, token.loc.start.column);
			const firstNonWhitespaceIndex = [...textBeforeNode].findIndex(char => char !== " " && char !== "\t");
			const indentChars = textBeforeNode.slice(0, firstNonWhitespaceIndex === -1 ? textBeforeNode.length : firstNonWhitespaceIndex);
			const spaces = [...indentChars].filter(char => char === " ").length;
			const tabs = [...indentChars].filter(char => char === "\t").length;

			return {
				space: spaces,
				tab: tabs,
				goodChar: options.indentType === "space" ? spaces : tabs,
				badChar: options.indentType === "space" ? tabs : spaces,
			};
		}

		/**
		 * Checks if a node is the first token on its line.
		 * @param {ASTNode} node The node to check.
		 * @param {boolean} [byEndLocation=false] Whether to use the end location for comparison.
		 * @returns {boolean} True if the node starts on a new line.
		 */
		function isNodeFirstInLine(node, byEndLocation = false) {
			const firstToken = byEndLocation ? sourceCode.getLastToken(node, 1) : sourceCode.getTokenBefore(node);
			const startLine = byEndLocation ? node.loc.end.line : node.loc.start.line;
			const endLine = firstToken ? firstToken.loc.end.line : -1;
			return startLine !== endLine;
		}

		/**
		 * Checks indentation for a single node.
		 * @param {ASTNode} node The node to check.
		 * @param {number} neededIndent The expected indentation amount.
		 * @returns {void}
		 */
		function checkNodeIndent(node, neededIndent) {
			const actualIndent = getNodeIndent(node, false);

			if (
				node.type !== "ArrayExpression" &&
				node.type !== "ObjectExpression" &&
				(actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
				isNodeFirstInLine(node)
			) {
				report(node, neededIndent, actualIndent.space, actualIndent.tab);
			}

			if (node.type === "IfStatement" && node.alternate) {
				const elseToken = sourceCode.getTokenBefore(node.alternate);
				checkNodeIndent(elseToken, neededIndent);
				if (!isNodeFirstInLine(node.alternate)) {
					checkNodeIndent(node.alternate, neededIndent);
				}
			}

			if (node.type === "TryStatement" && node.handler) {
				checkNodeIndent(sourceCode.getFirstToken(node.handler), neededIndent);
			}

			if (node.type === "TryStatement" && node.finalizer) {
				checkNodeIndent(sourceCode.getTokenBefore(node.finalizer), neededIndent);
			}

			if (node.type === "DoWhileStatement") {
				checkNodeIndent(sourceCode.getTokenAfter(node.body), neededIndent);
			}
		}

		/**
		 * Checks indentation for a list of nodes.
		 * @param {ASTNode[]} nodes The nodes to check.
		 * @param {number} indent The expected indentation amount.
		 * @returns {void}
		 */
		function checkNodesIndent(nodes, indent) {
			nodes.forEach(node => checkNodeIndent(node, indent));
		}

		/**
		 * Checks indentation of the last line of a node.
		 * @param {ASTNode} node The node to check.
		 * @param {number} lastLineIndent The expected indentation for the last line.
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
					{ line: lastToken.loc.start.line, column: lastToken.loc.start.column },
					true,
				);
			}
		}

		/**
		 * Checks indentation for return statements wrapped in parentheses.
		 * @param {ASTNode} node The return statement node.
		 * @param {number} firstLineIndent The expected indentation for the first line.
		 * @returns {void}
		 */
		function checkLastReturnStatementLineIndent(node, firstLineIndent) {
			const lastToken = sourceCode.getLastToken(node, astUtils.isClosingParenToken);
			const textBeforeClosingParen = sourceCode.getText(lastToken, lastToken.loc.start.column).slice(0, -1);

			if (textBeforeClosingParen.trim()) {
				return;
			}

			const endIndent = getNodeIndent(lastToken, true);

			if (endIndent.goodChar !== firstLineIndent) {
				report(
					node,
					firstLineIndent,
					endIndent.space,
					endIndent.tab,
					{ line: lastToken.loc.start.line, column: lastToken.loc.start.column },
					true,
				);
			}
		}

		/**
		 * Checks indentation for the first line of a node.
		 * @param {ASTNode} node The node to check.
		 * @param {number} firstLineIndent The expected indentation for the first line.
		 * @returns {void}
		 */
		function checkFirstNodeLineIndent(node, firstLineIndent) {
			const startIndent = getNodeIndent(node, false);

			if (
				(startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0) &&
				isNodeFirstInLine(node)
			) {
				report(
					node,
					firstLineIndent,
					startIndent.space,
					startIndent.tab,
					{ line: node.loc.start.line, column: node.loc.start.column },
				);
			}
		}

		/**
		 * Gets the parent node of a given type, stopping at specified types.
		 * @param {ASTNode} node The starting node.
		 * @param {string} type The target parent type.
		 * @param {string[]} stopAtList Types at which to stop searching.
		 * @returns {ASTNode|null} The parent node or null.
		 */
		function getParentNodeByType(node, type, stopAtList = ["Program"]) {
			let parent = node.parent;
			const stopAtSet = new Set(stopAtList);

			while (parent && !stopAtSet.has(parent.type) && parent.type !== "Program" && parent.type !== type) {
				parent = parent.parent;
			}

			return parent && parent.type === type ? parent : null;
		}

		/**
		 * Gets the VariableDeclarator node associated with a given node.
		 * @param {ASTNode} node The node to check.
		 * @returns {ASTNode|null} The VariableDeclarator node or null.
		 */
		function getVariableDeclaratorNode(node) {
			return getParentNodeByType(node, "VariableDeclarator");
		}

		/**
		 * Checks if a node is part of a multi-line variable declaration on the same line as the declaration.
		 * @param {ASTNode} node The node to check.
		 * @param {ASTNode} varNode The variable declaration node.
		 * @returns {boolean} True if the node is in a multi-line variable declaration on the same line.
		 */
		function isNodeInVarOnTop(node, varNode) {
			return (
				varNode &&
				varNode.parent.loc.start.line === node.loc.start.line &&
				varNode.parent.declarations.length > 1
			);
		}

		/**
		 * Checks if the argument before the callee node spans multiple lines.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the argument before the callee spans multiple lines.
		 */
		function isArgBeforeCalleeNodeMultiline(node) {
			const parent = node.parent;
			if (parent.arguments.length < 2 || parent.arguments[1] !== node) {
				return false;
			}
			return parent.arguments[0].loc.end.line > parent.arguments[0].loc.start.line;
		}

		/**
		 * Checks if a function node is an outer IIFE.
		 * @param {ASTNode} node The function node to check.
		 * @returns {boolean} True if the node is an outer IIFE.
		 */
		function isOuterIIFE(node) {
			const parent = node.parent;
			if (parent.type !== "CallExpression" || parent.callee !== node) {
				return false;
			}

			let stmt = parent.parent;
			while (
				stmt &&
				((stmt.type === "UnaryExpression" && ["!", "~", "+", "-"].includes(stmt.operator)) ||
					stmt.type === "AssignmentExpression" ||
					stmt.type === "LogicalExpression" ||
					stmt.type === "SequenceExpression" ||
					stmt.type === "VariableDeclarator")
			) {
				stmt = stmt.parent;
			}

			return (
				stmt &&
				(stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
				stmt.parent &&
				stmt.parent.type === "Program"
			);
		}

		/**
		 * Checks if a node is contained within a single line.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node is on a single line.
		 */
		function isSingleLineNode(node) {
			const lastToken = sourceCode.getLastToken(node);
			return node.loc.start.line === lastToken.loc.end.line;
		}

		/**
		 * Checks indentation for function blocks.
		 * @param {ASTNode} node The block statement node.
		 * @returns {void}
		 */
		function checkIndentInFunctionBlock(node) {
			const calleeNode = node.parent;
			let indent = getNodeIndent(calleeNode, false).goodChar;

			if (
				calleeNode.parent &&
				(calleeNode.parent.type === "Property" || calleeNode.parent.type === "ArrayExpression")
			) {
				indent = getNodeIndent(calleeNode, false).goodChar;
			} else {
				indent = getNodeIndent(calleeNode).goodChar;
			}

			if (calleeNode.parent?.type === "CallExpression") {
				const calleeParent = calleeNode.parent;
				if (
					calleeNode.type !== "FunctionExpression" &&
					calleeNode.type !== "ArrowFunctionExpression"
				) {
					if (calleeParent && calleeParent.loc.start.line < node.loc.start.line) {
						indent = getNodeIndent(calleeParent).goodChar;
					}
				} else if (
					isArgBeforeCalleeNodeMultiline(calleeNode) &&
					calleeParent.callee.loc.start.line === calleeParent.callee.loc.end.line &&
					!isNodeFirstInLine(calleeNode)
				) {
					indent = getNodeIndent(calleeParent).goodChar;
				}
			}

			let functionOffset = indentSize;
			if (options.outerIIFEBody !== null && isOuterIIFE(calleeNode)) {
				functionOffset = options.outerIIFEBody * indentSize;
			} else if (calleeNode.type === "FunctionExpression") {
				functionOffset = options.FunctionExpression.body * indentSize;
			} else if (calleeNode.type === "FunctionDeclaration") {
				functionOffset = options.FunctionDeclaration.body * indentSize;
			}
			indent += functionOffset;

			const parentVarNode = getVariableDeclaratorNode(node);
			if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
				indent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
			}

			if (node.body.length > 0) {
				checkNodesIndent(node.body, indent);
			}

			checkLastNodeLineIndent(node, indent - functionOffset);
		}

		/**
		 * Checks indentation for array or object blocks.
		 * @param {ASTNode} node The array or object node.
		 * @returns {void}
		 */
		function checkIndentInArrayOrObjectBlock(node) {
			if (isSingleLineNode(node)) {
				return;
			}

			const elements = node.type === "ArrayExpression" ? node.elements : node.properties;
			const filteredElements = elements.filter(elem => elem !== null);
			const parentVarNode = getVariableDeclaratorNode(node);
			let nodeIndent;
			let elementsIndent;

			if (isNodeFirstInLine(node)) {
				const parent = node.parent;
				nodeIndent = getNodeIndent(parent).goodChar;

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
							parentVarNode.loc.start.line === parent.loc.start.line
						) {
							nodeIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
						} else if (parent.type === "ObjectExpression" || parent.type === "ArrayExpression") {
							const parentElements = parent.type === "ObjectExpression" ? parent.properties : parent.elements;
							if (
								parentElements[0] &&
								parentElements[0].loc.start.line === parent.loc.start.line &&
								parentElements[0].loc.end.line !== parent.loc.start.line
							) {
								// First element spans multiple lines; do not increase indentation
							} else if (typeof options[parent.type] === "number") {
								nodeIndent += options[parent.type] * indentSize;
							} else {
								nodeIndent = parentElements[0].loc.start.column;
							}
						} else if (parent.type === "CallExpression" || parent.type === "NewExpression") {
							if (typeof options.CallExpression.arguments === "number") {
								nodeIndent += options.CallExpression.arguments * indentSize;
							} else if (options.CallExpression.arguments === "first") {
								if (parent.arguments.includes(node)) {
									nodeIndent = parent.arguments[0].loc.start.column;
								}
							} else {
								nodeIndent += indentSize;
							}
						} else if (parent.type === "LogicalExpression" || parent.type === "ArrowFunctionExpression") {
							nodeIndent += indentSize;
						}
					}
				}

				checkFirstNodeLineIndent(node, nodeIndent);
			} else {
				nodeIndent = getNodeIndent(node).goodChar;
			}

			if (options[node.type] === "first") {
				elementsIndent = filteredElements.length ? filteredElements[0].loc.start.column : 0;
			} else {
				elementsIndent = nodeIndent + indentSize * options[node.type];
			}

			if (isNodeInVarOnTop(node, parentVarNode)) {
				elementsIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
			}

			checkNodesIndent(filteredElements, elementsIndent);

			if (filteredElements.length > 0 && filteredElements.at(-1).loc.end.line === node.loc.end.line) {
				return;
			}

			checkLastNodeLineIndent(
				node,
				nodeIndent + (isNodeInVarOnTop(node, parentVarNode) ? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize : 0),
			);
		}

		/**
		 * Checks if a node or its body is a BlockStatement.
		 * @param {ASTNode} node The node to check.
		 * @returns {boolean} True if the node or its body is a BlockStatement.
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
		 * Checks indentation for blocks.
		 * @param {ASTNode} node The block node.
		 * @returns {void}
		 */
		function blockIndentationCheck(node) {
			if (isSingleLineNode(node)) {
				return;
			}

			if (
				node.parent &&
				["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(node.parent.type)
			) {
				checkIndentInFunctionBlock(node);
				return;
			}

			let indent;
			const statementsWithProperties = [
				"IfStatement", "WhileStatement", "ForStatement", "ForInStatement", "ForOfStatement", "DoWhileStatement", "ClassDeclaration", "TryStatement",
			];

			if (
				node.parent &&
				statementsWithProperties.includes(node.parent.type) &&
				isNodeBodyBlock(node)
			) {
				indent = getNodeIndent(node.parent).goodChar;
			} else if (node.parent?.type === "CatchClause") {
				indent = getNodeIndent(node.parent.parent).goodChar;
			} else {
				indent = getNodeIndent(node).goodChar;
			}

			const nodesToCheck = node.type === "IfStatement" && node.consequent.type !== "BlockStatement"
				? [node.consequent]
				: Array.isArray(node.body) ? node.body : [node.body];

			if (nodesToCheck.length > 0) {
				checkNodesIndent(nodesToCheck, indent + indentSize);
			}

			if (node.type === "BlockStatement") {
				checkLastNodeLineIndent(node, indent);
			}
		}

		/**
		 * Filters variable declaration elements to include only those on different lines.
		 * @param {ASTNode} node The variable declaration node.
		 * @returns {ASTNode[]} Filtered elements.
		 */
		function filterOutSameLineVars(node) {
			return node.declarations.reduce((finalCollection, elem) => {
				const lastElem = finalCollection.at(-1);
				if (
					(elem.loc.start.line !== node.loc.start.line && !lastElem) ||
					(lastElem && lastElem.loc.start.line !== elem.loc.start.line)
				) {
					finalCollection.push(elem);
				}
				return finalCollection;
			}, []);
		}

		/**
		 * Checks indentation for variable declarations.
		 * @param {ASTNode} node The variable declaration node.
		 * @returns {void}
		 */
		function checkIndentInVariableDeclarations(node) {
			const elements = filterOutSameLineVars(node);
			const nodeIndent = getNodeIndent(node).goodChar;
			const lastElement = elements.at(-1);
			const elementsIndent = nodeIndent + indentSize * options.VariableDeclarator[node.kind];

			checkNodesIndent(elements, elementsIndent);

			if (
				sourceCode.getLastToken(node).loc.end.line <= lastElement.loc.end.line
			) {
				return;
			}

			const tokenBeforeLastElement = sourceCode.getTokenBefore(lastElement);
			if (tokenBeforeLastElement.value === ",") {
				checkLastNodeLineIndent(node, getNodeIndent(tokenBeforeLastElement).goodChar);
			} else {
				checkLastNodeLineIndent(node, elementsIndent - indentSize);
			}
		}

		/**
		 * Checks indentation for block-less statements (e.g., if without braces).
		 * @param {ASTNode} node The statement node.
		 * @returns {void}
		 */
		function blockLessNodes(node) {
			if (node.body.type !== "BlockStatement") {
				blockIndentationCheck(node);
			}
		}

		/**
		 * Gets the expected indentation for a case statement.
		 * @param {ASTNode} node The case or switch node.
		 * @param {number} [providedSwitchIndent] Optional switch indentation override.
		 * @returns {number} The expected case indentation.
		 */
		function expectedCaseIndent(node, providedSwitchIndent) {
			const switchNode = node.type === "SwitchStatement" ? node : node.parent;
			const switchIndent = typeof providedSwitchIndent === "undefined"
				? getNodeIndent(switchNode).goodChar
				: providedSwitchIndent;

			if (caseIndentStore[switchNode.loc.start.line]) {
				return caseIndentStore[switchNode.loc.start.line];
			}

			const caseIndent = switchNode.cases.length > 0 && options.SwitchCase === 0
				? switchIndent
				: switchIndent + indentSize * options.SwitchCase;

			caseIndentStore[switchNode.loc.start.line] = caseIndent;
			return caseIndent;
		}

		/**
		 * Checks if a return statement is wrapped in parentheses.
		 * @param {ASTNode} node The return statement node.
		 * @returns {boolean} True if the return statement is wrapped in parentheses.
		 */
		function isWrappedInParenthesis(node) {
			const regex = /^return\s*\(\s*\)$/u;
			const statementWithoutArgument = sourceCode.getText(node).replace(sourceCode.getText(node.argument), "");
			return regex.test(statementWithoutArgument);
		}

		const indentSize = options.indentSize || 4;
		const indentType = options.indentType || "space";

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
				if (node.consequent.type !== "BlockStatement" && node.consequent.loc.start.line > node.loc.start.line) {
					blockIndentationCheck(node);
				}
			},
			VariableDeclaration(node) {
				if (
					node.declarations.at(-1).loc.start.line > node.declarations[0].loc.start.line
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
				if (typeof options.MemberExpression === "undefined") {
					return;
				}
				if (isSingleLineNode(node)) {
					return;
				}
				if (
					getParentNodeByType(node, "VariableDeclarator", ["FunctionExpression", "ArrowFunctionExpression"]) ||
					getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])
				) {
					return;
				}

				const propertyIndent = getNodeIndent(node).goodChar + indentSize * options.MemberExpression;
				const checkNodes = [node.property];
				const dot = sourceCode.getTokenBefore(node.property);
				if (dot.type === "Punctuator" && dot.value === ".") {
					checkNodes.push(dot);
				}
				checkNodesIndent(checkNodes, propertyIndent);
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
				if (isSingleLineNode(node)) {
					return;
				}
				if (options.FunctionDeclaration.parameters === "first" && node.params.length) {
					checkNodesIndent(node.params.slice(1), node.params[0].loc.start.column);
				} else if (options.FunctionDeclaration.parameters !== null) {
					checkNodesIndent(
						node.params,
						getNodeIndent(node).goodChar + indentSize * options.FunctionDeclaration.parameters,
					);
				}
			},
			FunctionExpression(node) {
				if (isSingleLineNode(node)) {
					return;
				}
				if (options.FunctionExpression.parameters === "first" && node.params.length) {
					checkNodesIndent(node.params.slice(1), node.params[0].loc.start.column);
				} else if (options.FunctionExpression.parameters !== null) {
					checkNodesIndent(
						node.params,
						getNodeIndent(node).goodChar + indentSize * options.FunctionExpression.parameters,
					);
				}
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
			CallExpression(node) {
				if (isSingleLineNode(node)) {
					return;
				}
				if (options.CallExpression.arguments === "first" && node.arguments.length) {
					checkNodesIndent(node.arguments.slice(1), node.arguments[0].loc.start.column);
				} else if (options.CallExpression.arguments !== null) {
					checkNodesIndent(
						node.arguments,
						getNodeIndent(node).goodChar + indentSize * options.CallExpression.arguments,
					);
				}
			},
		};
	},
};