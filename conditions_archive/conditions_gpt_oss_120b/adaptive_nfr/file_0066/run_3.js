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
						oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
					},
					ObjectExpression: {
						oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
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
			CallExpression: { arguments: DEFAULT_PARAMETER_INDENT },
			ArrayExpression: 1,
			ObjectExpression: 1,
		};

		const sourceCode = context.sourceCode;

		/* eslint-disable-next-line sonarjs/no-collapsible-if */
		if (context.options.length) {
			if (context.options[0] === "tab") {
				indentSize = 1;
				indentType = "tab";
			} else if (typeof context.options[0] === "number") {
				indentSize = context.options[0];
				indentType = "space";
			}

			if (context.options[1]) {
				const opts = context.options[1];
				options.SwitchCase = opts.SwitchCase || 0;
				applyVariableDeclaratorRules(opts);
				applyOptionalNumericOption(opts, "outerIIFEBody");
				applyOptionalNumericOption(opts, "MemberExpression");
				applyOptionalObjectOption(opts, "FunctionDeclaration");
				applyOptionalObjectOption(opts, "FunctionExpression");
				applyOptionalObjectOption(opts, "CallExpression");
				applyArrayOrObjectOption(opts, "ArrayExpression");
				applyArrayOrObjectOption(opts, "ObjectExpression");
			}
		}

		const caseIndentStore = {};

		/** @type {Record<string, number>} */
		function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
			const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
			const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
			const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`;
			let foundStatement;

			if (actualSpaces > 0 && actualTabs > 0) {
				foundStatement = `${actualSpaces} ${foundSpacesWord} and ${actualTabs} ${foundTabsWord}`;
			} else if (actualSpaces > 0) {
				foundStatement =
					indentType === "space" ? actualSpaces : `${actualSpaces} ${foundSpacesWord}`;
			} else if (actualTabs > 0) {
				foundStatement =
					indentType === "tab" ? actualTabs : `${actualTabs} ${foundTabsWord}`;
			} else {
				foundStatement = "0";
			}
			return { expected: expectedStatement, actual: foundStatement };
		}

		/**
		 * @param {ASTNode} node
		 * @param {number} needed
		 * @param {number} gottenSpaces
		 * @param {number} gottenTabs
		 * @param {Object} [loc]
		 * @param {boolean} isLastNodeCheck
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
		 * @param {ASTNode|Token} node
		 * @param {boolean} [byLastLine=false]
		 */
		function getNodeIndent(node, byLastLine = false) {
			const token = byLastLine ? sourceCode.getLastToken(node) : sourceCode.getFirstToken(node);
			const srcCharsBeforeNode = sourceCode.getText(token, token.loc.start.column).split("");
			const indentChars = srcCharsBeforeNode.slice(
				0,
				srcCharsBeforeNode.findIndex(ch => ch !== " " && ch !== "\t")
			);
			const spaces = indentChars.filter(ch => ch === " ").length;
			const tabs = indentChars.filter(ch => ch === "\t").length;
			return {
				space: spaces,
				tab: tabs,
				goodChar: indentType === "space" ? spaces : tabs,
				badChar: indentType === "space" ? tabs : spaces,
			};
		}

		/**
		 * @param {ASTNode} node
		 * @param {boolean} [byEndLocation=false]
		 */
		function isNodeFirstInLine(node, byEndLocation = false) {
			const firstToken = byEndLocation
				? sourceCode.getLastToken(node, 1)
				: sourceCode.getTokenBefore(node);
			const startLine = byEndLocation ? node.loc.end.line : node.loc.start.line;
			const endLine = firstToken ? firstToken.loc.end.line : -1;
			return startLine !== endLine;
		}

		/**
		 * @param {ASTNode} node
		 * @param {number} neededIndent
		 */
		function checkNodeIndent(node, neededIndent) {
			const actualIndent = getNodeIndent(node);
			if (isIndentMismatch(node, neededIndent, actualIndent)) {
				report(node, neededIndent, actualIndent.space, actualIndent.tab);
			}
			handleSpecialNodeIndent(node, neededIndent);
		}

		/** @private */
		function isIndentMismatch(node, neededIndent, actualIndent) {
			const notArrayOrObject =
				node.type !== "ArrayExpression" && node.type !== "ObjectExpression";
			const badIndent = actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0;
			return notArrayOrObject && badIndent && isNodeFirstInLine(node);
		}

		/** @private */
		function handleSpecialNodeIndent(node, neededIndent) {
			if (node.type === "IfStatement" && node.alternate) {
				const elseToken = sourceCode.getTokenBefore(node.alternate);
				checkNodeIndent(elseToken, neededIndent);
				if (!isNodeFirstInLine(node.alternate)) {
					checkNodeIndent(node.alternate, neededIndent);
				}
			}
			if (node.type === "TryStatement") {
				if (node.handler) {
					const catchToken = sourceCode.getFirstToken(node.handler);
					checkNodeIndent(catchToken, neededIndent);
				}
				if (node.finalizer) {
					const finallyToken = sourceCode.getTokenBefore(node.finalizer);
					checkNodeIndent(finallyToken, neededIndent);
				}
			}
			if (node.type === "DoWhileStatement") {
				const whileToken = sourceCode.getTokenAfter(node.body);
				checkNodeIndent(whileToken, neededIndent);
			}
		}

		/**
		 * @param {ASTNode[]} nodes
		 * @param {number} indent
		 */
		function checkNodesIndent(nodes, indent) {
			nodes.forEach(node => checkNodeIndent(node, indent));
		}

		/**
		 * @param {ASTNode} node
		 * @param {number} lastLineIndent
		 */
		function checkLastNodeLineIndent(node, lastLineIndent) {
			const lastToken = sourceCode.getLastToken(node);
			const endIndent = getNodeIndent(lastToken, true);
			if (isLastLineIndentMismatch(endIndent, lastLineIndent) && isNodeFirstInLine(node, true)) {
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

		/** @private */
		function isLastLineIndentMismatch(endIndent, lastLineIndent) {
			return endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0;
		}

		/**
		 * @param {ASTNode} node
		 * @param {number} firstLineIndent
		 */
		function checkFirstNodeLineIndent(node, firstLineIndent) {
			const startIndent = getNodeIndent(node);
			if (isFirstLineIndentMismatch(startIndent, firstLineIndent) && isNodeFirstInLine(node)) {
				report(
					node,
					firstLineIndent,
					startIndent.space,
					startIndent.tab,
					{ line: node.loc.start.line, column: node.loc.start.column }
				);
			}
		}

		/** @private */
		function isFirstLineIndentMismatch(startIndent, firstLineIndent) {
			return startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0;
		}

		/**
		 * @param {ASTNode} node
		 * @param {string} type
		 * @param {string[]} [stopAtList]
		 */
		function getParentNodeByType(node, type, stopAtList = []) {
			let parent = node.parent;
			const stopAtSet = new Set(stopAtList.length ? stopAtList : ["Program"]);
			while (parent.type !== type && !stopAtSet.has(parent.type) && parent.type !== "Program") {
				parent = parent.parent;
			}
			return parent.type === type ? parent : null;
		}

		function getVariableDeclaratorNode(node) {
			return getParentNodeByType(node, "VariableDeclarator");
		}

		function isNodeInVarOnTop(node, varNode) {
			return (
				varNode &&
				varNode.parent.loc.start.line === node.loc.start.line &&
				varNode.parent.declarations.length > 1
			);
		}

		function isArgBeforeCalleeNodeMultiline(node) {
			const parent = node.parent;
			if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
				return parent.arguments[0].loc.end.line > parent.arguments[0].loc.start.line;
			}
			return false;
		}

		function isOuterIIFE(node) {
			const parent = node.parent;
			const stmt = parent.parent;
			if (parent.type !== "CallExpression" || parent.callee !== node) {
				return false;
			}
			let current = stmt;
			while (
				(current.type === "UnaryExpression" &&
					["!", "~", "+", "-"].includes(current.operator)) ||
				["AssignmentExpression", "LogicalExpression", "SequenceExpression", "VariableDeclarator"].includes(
					current.type
				)
			) {
				current = current.parent;
			}
			return (
				["ExpressionStatement", "VariableDeclaration"].includes(current.type) &&
				current.parent &&
				current.parent.type === "Program"
			);
		}

		/**
		 * @param {ASTNode} node
		 */
		function checkIndentInFunctionBlock(node) {
			const calleeNode = node.parent;
			const indent = calculateFunctionIndent(calleeNode, node);
			const parentVarNode = getVariableDeclaratorNode(node);
			const finalIndent = adjustIndentForVariable(parentVarNode, node, indent);
			if (node.body.length) {
				checkNodesIndent(node.body, finalIndent);
			}
			checkLastNodeLineIndent(node, finalIndent - indentSize);
		}

		/** @private */
		function calculateFunctionIndent(calleeNode, blockNode) {
			let baseIndent;
			if (calleeNode.parent && ["Property", "ArrayExpression"].includes(calleeNode.parent.type)) {
				baseIndent = getNodeIndent(calleeNode, false).goodChar;
			} else {
				baseIndent = getNodeIndent(calleeNode).goodChar;
			}
			if (calleeNode.parent.type === "CallExpression") {
				const parentCall = calleeNode.parent;
				if (!["FunctionExpression", "ArrowFunctionExpression"].includes(calleeNode.type)) {
					if (parentCall.loc.start.line < blockNode.loc.start.line) {
						baseIndent = getNodeIndent(parentCall).goodChar;
					}
				} else if (
					isArgBeforeCalleeNodeMultiline(calleeNode) &&
					parentCall.callee.loc.start.line === parentCall.callee.loc.end.line &&
					!isNodeFirstInLine(calleeNode)
				) {
					baseIndent = getNodeIndent(parentCall).goodChar;
				}
			}
			const offset = calculateFunctionOffset(calleeNode);
			return baseIndent + offset;
		}

		/** @private */
		function calculateFunctionOffset(calleeNode) {
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

		/** @private */
		function adjustIndentForVariable(parentVarNode, blockNode, currentIndent) {
			if (parentVarNode && isNodeInVarOnTop(blockNode, parentVarNode)) {
				return (
					currentIndent +
					indentSize * options.VariableDeclarator[parentVarNode.parent.kind]
				);
			}
			return currentIndent;
		}

		function isSingleLineNode(node) {
			const lastToken = sourceCode.getLastToken(node);
			return node.loc.start.line === lastToken.loc.end.line;
		}

		/**
		 * @param {ASTNode} node
		 */
		function checkIndentInArrayOrObjectBlock(node) {
			if (isSingleLineNode(node)) {
				return;
			}
			const { nodeIndent, elementsIndent } = computeArrayObjectIndent(node);
			checkFirstOrSubsequentIndent(node, nodeIndent);
			checkNodesIndent(node.elements || node.properties, elementsIndent);
			checkClosingIndent(node, nodeIndent);
		}

		/** @private */
		function computeArrayObjectIndent(node) {
			const isArray = node.type === "ArrayExpression";
			const elements = (isArray ? node.elements : node.properties).filter(e => e !== null);
			const parentVarNode = getVariableDeclaratorNode(node);
			let nodeIndent = 0;
			if (isNodeFirstInLine(node)) {
				const parent = node.parent;
				nodeIndent = getNodeIndent(parent).goodChar;
				if (!parentVarNode || parentVarNode.loc.start.line !== node.loc.start.line) {
					nodeIndent = adjustIndentForParent(node, parent, nodeIndent);
				}
			} else {
				nodeIndent = getNodeIndent(node).goodChar;
			}
			const elementsIndent = computeElementsIndent(node, nodeIndent, elements);
			return { nodeIndent, elementsIndent, elements };
		}

		/** @private */
		function adjustIndentForParent(node, parent, currentIndent) {
			if (parent.type === "VariableDeclarator") {
				if (parentVarNode && parentVarNode.loc.start.line === parent.loc.start.line) {
					return (
						currentIndent +
						indentSize * options.VariableDeclarator[parentVarNode.parent.kind]
					);
				}
			} else if (["ObjectExpression", "ArrayExpression"].includes(parent.type)) {
				const parentElements = parent.type === "ObjectExpression" ? parent.properties : parent.elements;
				if (
					parentElements[0] &&
					parentElements[0].loc.start.line === parent.loc.start.line &&
					parentElements[0].loc.end.line !== parent.loc.start.line
				) {
					// keep currentIndent
				} else if (typeof options[parent.type] === "number") {
					return currentIndent + options[parent.type] * indentSize;
				} else {
					return parentElements[0].loc.start.column;
				}
			} else if (["CallExpression", "NewExpression"].includes(parent.type)) {
				if (typeof options.CallExpression.arguments === "number") {
					return currentIndent + options.CallExpression.arguments * indentSize;
				}
				if (options.CallExpression.arguments === "first" && parent.arguments.includes(node)) {
					return parent.arguments[0].loc.start.column;
				}
				return currentIndent + indentSize;
			} else if (["LogicalExpression", "ArrowFunctionExpression"].includes(parent.type)) {
				return currentIndent + indentSize;
			}
			return currentIndent;
		}

		/** @private */
		function computeElementsIndent(node, nodeIndent, elements) {
			if (options[node.type] === "first") {
				return elements.length ? elements[0].loc.start.column : 0;
			}
			const base = nodeIndent + indentSize * options[node.type];
			const parentVarNode = getVariableDeclaratorNode(node);
			if (isNodeInVarOnTop(node, parentVarNode)) {
				return base + indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
			}
			return base;
		}

		/** @private */
		function checkFirstOrSubsequentIndent(node, nodeIndent) {
			if (isNodeFirstInLine(node)) {
				checkFirstNodeLineIndent(node, nodeIndent);
			}
		}

		/** @private */
		function checkClosingIndent(node, nodeIndent) {
			const parentVarNode = getVariableDeclaratorNode(node);
			const closingIndent =
				nodeIndent +
				(isNodeInVarOnTop(node, parentVarNode)
					? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize
					: 0);
			checkLastNodeLineIndent(node, closingIndent);
		}

		/**
		 * @param {ASTNode} node
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
		 * @param {ASTNode} node
		 */
		function blockIndentationCheck(node) {
			if (isSingleLineNode(node)) {
				return;
			}
			if (node.parent && ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(node.parent.type)) {
				checkIndentInFunctionBlock(node);
				return;
			}
			const indent = determineBlockIndent(node);
			const nodesToCheck = collectNodesToCheck(node);
			if (nodesToCheck.length) {
				checkNodesIndent(nodesToCheck, indent + indentSize);
			}
			if (node.type === "BlockStatement") {
				checkLastNodeLineIndent(node, indent);
			}
		}

		/** @private */
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
			if (node.parent && statementsWithProperties.includes(node.parent.type) && isNodeBodyBlock(node)) {
				return getNodeIndent(node.parent).goodChar;
			}
			if (node.parent && node.parent.type === "CatchClause") {
				return getNodeIndent(node.parent.parent).goodChar;
			}
			return getNodeIndent(node).goodChar;
		}

		/** @private */
		function collectNodesToCheck(node) {
			if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
				return [node.consequent];
			}
			if (Array.isArray(node.body)) {
				return node.body;
			}
			if (node.body) {
				return [node.body];
			}
			return [];
		}

		/**
		 * @param {ASTNode} node
		 */
		function filterOutSameLineVars(node) {
			return node.declarations.reduce((acc, elem) => {
				const last = acc.at(-1);
				if (
					(elem.loc.start.line !== node.loc.start.line && !last) ||
					(last && last.loc.start.line !== elem.loc.start.line)
				) {
					acc.push(elem);
				}
				return acc;
			}, []);
		}

		/**
		 * @param {ASTNode} node
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
		 * @param {ASTNode} node
		 */
		function blockLessNodes(node) {
			if (node.body.type !== "BlockStatement") {
				blockIndentationCheck(node);
			}
		}

		/**
		 * @param {ASTNode} node
		 * @param {number} [providedSwitchIndent]
		 */
		function expectedCaseIndent(node, providedSwitchIndent) {
			const switchNode = node.type === "SwitchStatement" ? node : node.parent;
			const switchIndent = providedSwitchIndent === undefined ? getNodeIndent(switchNode).goodChar : providedSwitchIndent;
			if (caseIndentStore[switchNode.loc.start.line]) {
				return caseIndentStore[switchNode.loc.start.line];
			}
			const caseIndent =
				switchNode.cases.length && options.SwitchCase === 0
					? switchIndent
					: switchIndent + indentSize * options.SwitchCase;
			caseIndentStore[switchNode.loc.start.line] = caseIndent;
			return caseIndent;
		}

		/**
		 * @param {ASTNode} node
		 */
		function isWrappedInParenthesis(node) {
			const regex = /^return\s*\(\s*\)/u;
			const source = sourceCode.getText(node).replace(sourceCode.getText(node.argument), "");
			return regex.test(source);
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
			ObjectExpression: checkIndentInArrayOrObjectBlock,
			ArrayExpression: checkIndentInArrayOrObjectBlock,
			MemberExpression(node) {
				if (options.MemberExpression === undefined) {
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

		/** @private */
		function applyVariableDeclaratorRules(opts) {
			const variableDeclaratorRules = opts.VariableDeclarator;
			if (typeof variableDeclaratorRules === "number") {
				options.VariableDeclarator = {
					var: variableDeclaratorRules,
					let: variableDeclaratorRules,
					const: variableDeclaratorRules,
				};
			} else if (typeof variableDeclaratorRules === "object") {
				Object.assign(options.VariableDeclarator, variableDeclaratorRules);
			}
		}

		/** @private */
		function applyOptionalNumericOption(opts, key) {
			if (typeof opts[key] === "number") {
				options[key] = opts[key];
			}
		}

		/** @private */
		function applyOptionalObjectOption(opts, key) {
			if (typeof opts[key] === "object") {
				Object.assign(options[key], opts[key]);
			}
		}

		/** @private */
		function applyArrayOrObjectOption(opts, key) {
			if (typeof opts[key] === "number" || typeof opts[key] === "string") {
				options[key] = opts[key];
			}
		}
	},
};