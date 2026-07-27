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

/**
 * Parses indentation options from the rule context.
 * @param {RuleContext} context The ESLint rule context.
 * @returns {{indentType:string, indentSize:number, options:Object}} Parsed settings.
 */
function parseIndentOptions(context) {
	const DEFAULT_VARIABLE_INDENT = 1;
	const DEFAULT_PARAMETER_INDENT = null; // For backwards compatibility
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

	if (!context.options.length) {
		return { indentType, indentSize, options };
	}

	const firstOption = context.options[0];
	if (firstOption === "tab") {
		indentSize = 1;
		indentType = "tab";
	} else if (typeof firstOption === "number") {
		indentSize = firstOption;
		indentType = "space";
	}

	const secondOption = context.options[1];
	if (!secondOption) {
		return { indentType, indentSize, options };
	}

	options.SwitchCase = secondOption.SwitchCase || 0;

	const variableDeclaratorRules = secondOption.VariableDeclarator;
	if (typeof variableDeclaratorRules === "number") {
		options.VariableDeclarator = {
			var: variableDeclaratorRules,
			let: variableDeclaratorRules,
			const: variableDeclaratorRules,
		};
	} else if (typeof variableDeclaratorRules === "object") {
		Object.assign(options.VariableDeclarator, variableDeclaratorRules);
	}

	if (typeof secondOption.outerIIFEBody === "number") {
		options.outerIIFEBody = secondOption.outerIIFEBody;
	}
	if (typeof secondOption.MemberExpression === "number") {
		options.MemberExpression = secondOption.MemberExpression;
	}
	if (typeof secondOption.FunctionDeclaration === "object") {
		Object.assign(options.FunctionDeclaration, secondOption.FunctionDeclaration);
	}
	if (typeof secondOption.FunctionExpression === "object") {
		Object.assign(options.FunctionExpression, secondOption.FunctionExpression);
	}
	if (typeof secondOption.CallExpression === "object") {
		Object.assign(options.CallExpression, secondOption.CallExpression);
	}
	if (typeof secondOption.ArrayExpression === "number" ||
		typeof secondOption.ArrayExpression === "string") {
		options.ArrayExpression = secondOption.ArrayExpression;
	}
	if (typeof secondOption.ObjectExpression === "number" ||
		typeof secondOption.ObjectExpression === "string") {
		options.ObjectExpression = secondOption.ObjectExpression;
	}

	return { indentType, indentSize, options };
}

/**
 * @type {import('../types').Rule.RuleModule}
 */
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
		const { indentType, indentSize, options } = parseIndentOptions(context);
		const sourceCode = context.sourceCode;
		const caseIndentStore = {};

		/**
		 * Creates an error message for a line, given the expected/actual indentation.
		 * @param {number} expectedAmount The expected amount of indentation characters for this line
		 * @param {number} actualSpaces The actual number of indentation spaces that were found on this line
		 * @param {number} actualTabs The actual number of indentation tabs that were found on this line
		 * @returns {Object} Message data
		 */
		function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
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
		 * Reports an indentation violation.
		 * @param {ASTNode} node Node violating the indent rule
		 * @param {number} needed Expected indentation character count
		 * @param {number} gottenSpaces Indentation space count in the actual node/code
		 * @param {number} gottenTabs Indentation tab count in the actual node/code
		 * @param {Object} [loc] Error line and column location
		 * @param {boolean} isLastNodeCheck Is the error for last node check
		 */
		function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
			if (gottenSpaces && gottenTabs) {
				return;
			}
			const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);
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
		 * Retrieves the actual indent of a node or token.
		 * @param {ASTNode|Token} node Node to examine
		 * @param {boolean} [byLastLine=false] Get indent of node's last line
		 * @returns {Object} Indent information
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
				srcCharsBeforeNode.findIndex(char => char !== " " && char !== "\t")
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
		 * Determines if a node is the first token on its line.
		 * @param {ASTNode} node The node to check
		 * @param {boolean} [byEndLocation=false] Lookup based on start position or end
		 * @returns {boolean} True if first on line
		 */
		function isNodeFirstInLine(node, byEndLocation) {
			const firstToken = byEndLocation
				? sourceCode.getLastToken(node, 1)
				: sourceCode.getTokenBefore(node);
			const startLine = byEndLocation ? node.loc.end.line : node.loc.start.line;
			const endLine = firstToken ? firstToken.loc.end.line : -1;
			return startLine !== endLine;
		}

		/**
		 * Checks indentation for a single node.
		 * @param {ASTNode} node Node to check
		 * @param {number} neededIndent Expected indent
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
		 * Checks indentation for an array of nodes.
		 * @param {ASTNode[]} nodes List of nodes
		 * @param {number} indent Expected indent
		 */
		function checkNodesIndent(nodes, indent) {
			nodes.forEach(node => checkNodeIndent(node, indent));
		}

		/**
		 * Checks the closing line indent of a block.
		 * @param {ASTNode} node Node to examine
		 * @param {number} lastLineIndent Expected indent
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
					{ line: lastToken.loc.start.line, column: lastToken.loc.start.column },
					true
				);
			}
		}

		/**
		 * Checks the first line indent of a node.
		 * @param {ASTNode} node Node to examine
		 * @param {number} firstLineIndent Expected indent
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
					{ line: node.loc.start.line, column: node.loc.start.column }
				);
			}
		}

		/**
		 * Retrieves a parent node of a given type.
		 * @param {ASTNode} node Starting node
		 * @param {string} type Desired parent type
		 * @param {string[]} [stopAtList] Types at which to stop searching
		 * @returns {ASTNode|null} Matching parent or null
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
		 * Retrieves the VariableDeclarator ancestor of a node.
		 * @param {ASTNode} node Node to examine
		 * @returns {ASTNode|null}
		 */
		function getVariableDeclaratorNode(node) {
			return getParentNodeByType(node, "VariableDeclarator");
		}

		/**
		 * Determines if a node belongs to a multi‑line variable declaration on the same line as its declarator.
		 * @param {ASTNode} node Node to check
		 * @param {ASTNode} varNode VariableDeclarator node
		 * @returns {boolean}
		 */
		function isNodeInVarOnTop(node, varNode) {
			return (
				varNode &&
				varNode.parent.loc.start.line === node.loc.start.line &&
				varNode.parent.declarations.length > 1
			);
		}

		/**
		 * Checks whether the argument before a callee node spans multiple lines.
		 * @param {ASTNode} node Node to check
		 * @returns {boolean}
		 */
		function isArgBeforeCalleeNodeMultiline(node) {
			const parent = node.parent;
			if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
				return parent.arguments[0].loc.end.line > parent.arguments[0].loc.start.line;
			}
			return false;
		}

		/**
		 * Determines if a function node is an outer IIFE.
		 * @param {ASTNode} node Function node
		 * @returns {boolean}
		 */
		function isOuterIIFE(node) {
			const parent = node.parent;
			let stmt = parent.parent;
			if (parent.type !== "CallExpression" || parent.callee !== node) {
				return false;
			}
			while (
				(stmt.type === "UnaryExpression" &&
					["!", "~", "+", "-"].includes(stmt.operator)) ||
				["AssignmentExpression", "LogicalExpression", "SequenceExpression", "VariableDeclarator"].includes(stmt.type)
			) {
				stmt = stmt.parent;
			}
			return (
				["ExpressionStatement", "VariableDeclaration"].includes(stmt.type) &&
				stmt.parent &&
				stmt.parent.type === "Program"
			);
		}

		/**
		 * Checks indentation inside a function block.
		 * @param {ASTNode} node BlockStatement node inside a function
		 */
		function checkIndentInFunctionBlock(node) {
			const calleeNode = node.parent; // FunctionExpression or similar
			let indent;
			if (
				calleeNode.parent &&
				["Property", "ArrayExpression"].includes(calleeNode.parent.type)
			) {
				indent = getNodeIndent(calleeNode, false).goodChar;
			} else {
				indent = getNodeIndent(calleeNode).goodChar;
			}
			if (calleeNode.parent.type === "CallExpression") {
				const calleeParent = calleeNode.parent;
				if (calleeNode.type !== "FunctionExpression" && calleeNode.type !== "ArrowFunctionExpression") {
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
		 * Determines if a node starts and ends on the same line.
		 * @param {ASTNode} node Node to check
		 * @returns {boolean}
		 */
		function isSingleLineNode(node) {
			const lastToken = sourceCode.getLastToken(node);
			return node.loc.start.line === lastToken.loc.end.line;
		}

		/**
		 * Checks indentation for array or object literals.
		 * @param {ASTNode} node Node to examine
		 */
		function checkIndentInArrayOrObjectBlock(node) {
			if (isSingleLineNode(node)) {
				return;
			}
			const elements = (node.type === "ArrayExpression" ? node.elements : node.properties).filter(e => e !== null);
			let nodeIndent;
			const parentVarNode = getVariableDeclaratorNode(node);
			if (isNodeFirstInLine(node)) {
				const parent = node.parent;
				nodeIndent = getNodeIndent(parent).goodChar;
				if (!parentVarNode || parentVarNode.loc.start.line !== node.loc.start.line) {
					if (parent.type !== "VariableDeclarator" || parentVarNode === parentVarNode.parent.declarations[0]) {
						if (parent.type === "VariableDeclarator" && parentVarNode.loc.start.line === parent.loc.start.line) {
							nodeIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
						} else if (["ObjectExpression", "ArrayExpression"].includes(parent.type)) {
							const parentElements = parent.type === "ObjectExpression" ? parent.properties : parent.elements;
							if (
								parentElements[0] &&
								parentElements[0].loc.start.line === parent.loc.start.line &&
								parentElements[0].loc.end.line !== parent.loc.start.line
							) {
								// keep nodeIndent unchanged
							} else if (typeof options[parent.type] === "number") {
								nodeIndent += options[parent.type] * indentSize;
							} else {
								nodeIndent = parentElements[0].loc.start.column;
							}
						} else if (["CallExpression", "NewExpression"].includes(parent.type)) {
							if (typeof options.CallExpression.arguments === "number") {
								nodeIndent += options.CallExpression.arguments * indentSize;
							} else if (options.CallExpression.arguments === "first") {
								if (parent.arguments.includes(node)) {
									nodeIndent = parent.arguments[0].loc.start.column;
								}
							} else {
								nodeIndent += indentSize;
							}
						} else if (["LogicalExpression", "ArrowFunctionExpression"].includes(parent.type)) {
							nodeIndent += indentSize;
						}
					}
				}
				checkFirstNodeLineIndent(node, nodeIndent);
			} else {
				nodeIndent = getNodeIndent(node).goodChar;
			}
			const elementsIndent = options[node.type] === "first"
				? (elements[0] ? elements[0].loc.start.column : 0)
				: nodeIndent + indentSize * options[node.type];
			if (isNodeInVarOnTop(node, parentVarNode)) {
				elementsIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
			}
			checkNodesIndent(elements, elementsIndent);
			if (elements.length && elements.at(-1).loc.end.line === node.loc.end.line) {
				return;
			}
			const extraIndent = isNodeInVarOnTop(node, parentVarNode)
				? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize
				: 0;
			checkLastNodeLineIndent(node, nodeIndent + extraIndent);
		}

		/**
		 * Determines if a node or its body is a block statement.
		 * @param {ASTNode} node Node to test
		 * @returns {boolean}
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
		 * Checks indentation for generic blocks.
		 * @param {ASTNode} node Block node
		 */
		function blockIndentationCheck(node) {
			if (isSingleLineNode(node)) {
				return;
			}
			if (node.parent && ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(node.parent.type)) {
				checkIndentInFunctionBlock(node);
				return;
			}
			let indent;
			if (
				node.parent &&
				["IfStatement", "WhileStatement", "ForStatement", "ForInStatement", "ForOfStatement", "DoWhileStatement", "ClassDeclaration", "TryStatement"].includes(node.parent.type) &&
				isNodeBodyBlock(node)
			) {
				indent = getNodeIndent(node.parent).goodChar;
			} else if (node.parent && node.parent.type === "CatchClause") {
				indent = getNodeIndent(node.parent.parent).goodChar;
			} else {
				indent = getNodeIndent(node).goodChar;
			}
			const nodesToCheck = node.type === "IfStatement" && node.consequent.type !== "BlockStatement"
				? [node.consequent]
				: Array.isArray(node.body) ? node.body : [node.body];
			if (nodesToCheck.length) {
				checkNodesIndent(nodesToCheck, indent + indentSize);
			}
			if (node.type === "BlockStatement") {
				checkLastNodeLineIndent(node, indent);
			}
		}

		/**
		 * Filters variable declarations to those not on the same line.
		 * @param {ASTNode} node VariableDeclaration node
		 * @returns {ASTNode[]}
		 */
		function filterOutSameLineVars(node) {
			return node.declarations.reduce((col, elem) => {
				const last = col.at(-1);
				if (
					(elem.loc.start.line !== node.loc.start.line && !last) ||
					(last && last.loc.start.line !== elem.loc.start.line)
				) {
					col.push(elem);
				}
				return col;
			}, []);
		}

		/**
		 * Checks indentation for variable declarations.
		 * @param {ASTNode} node VariableDeclaration node
		 */
		function checkIndentInVariableDeclarations(node) {
			const elements = filterOutSameLineVars(node);
			const nodeIndent = getNodeIndent(node).goodChar;
			const elementsIndent = nodeIndent + indentSize * options.VariableDeclarator[node.kind];
			checkNodesIndent(elements, elementsIndent);
			const lastElement = elements.at(-1);
			if (sourceCode.getLastToken(node).loc.end.line <= lastElement.loc.end.line) {
				return;
			}
			const tokenBeforeLast = sourceCode.getTokenBefore(lastElement);
			if (tokenBeforeLast.value === ",") {
				checkLastNodeLineIndent(node, getNodeIndent(tokenBeforeLast).goodChar);
			} else {
				checkLastNodeLineIndent(node, elementsIndent - indentSize);
			}
		}

		/**
		 * Handles block‑less statements (e.g., loops without braces).
		 * @param {ASTNode} node Node to examine
		 */
		function blockLessNodes(node) {
			if (node.body.type !== "BlockStatement") {
				blockIndentationCheck(node);
			}
		}

		/**
		 * Returns the expected indentation for a case clause.
		 * @param {ASTNode} node SwitchCase or SwitchStatement node
		 * @param {number} [providedSwitchIndent] Indent for switch statement
		 * @returns {number}
		 */
		function expectedCaseIndent(node, providedSwitchIndent) {
			const switchNode = node.type === "SwitchStatement" ? node : node.parent;
			const switchIndent = providedSwitchIndent === undefined
				? getNodeIndent(switchNode).goodChar
				: providedSwitchIndent;
			if (caseIndentStore[switchNode.loc.start.line]) {
				return caseIndentStore[switchNode.loc.start.line];
			}
			const caseIndent = switchNode.cases.length && options.SwitchCase === 0
				? switchIndent
				: switchIndent + indentSize * options.SwitchCase;
			caseIndentStore[switchNode.loc.start.line] = caseIndent;
			return caseIndent;
		}

		/**
		 * Determines whether a return statement is wrapped in parentheses.
		 * @param {ASTNode} node ReturnStatement node
		 * @returns {boolean}
		 */
		function isWrappedInParenthesis(node) {
			const regex = /^return\s*\(\s*\)/u;
			const statementWithoutArgument = context.sourceCode
				.getText(node)
				.replace(context.sourceCode.getText(node.argument), "");
			return regex.test(statementWithoutArgument);
		}

		return {
			Program(node) {
				if (node.body.length) {
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
				if (node.declarations.at(-1).loc.start.line > node.declarations[0].loc.start.line) {
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
				if (getParentNodeByType(node, "VariableDeclarator", ["FunctionExpression", "ArrowFunctionExpression"])) {
					return;
				}
				if (getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])) {
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
						getNodeIndent(node).goodChar + indentSize * options.FunctionDeclaration.parameters
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
						getNodeIndent(node).goodChar + indentSize * options.FunctionExpression.parameters
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
						getNodeIndent(node).goodChar + indentSize * options.CallExpression.arguments
					);
				}
			},
		};
	},
};