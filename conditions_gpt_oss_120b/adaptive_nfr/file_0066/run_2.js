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

		// ----------------------------------------------------------------------
		// Configuration parsing
		// ----------------------------------------------------------------------
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

				if (typeof opts.VariableDeclarator === "number") {
					options.VariableDeclarator = {
						var: opts.VariableDeclarator,
						let: opts.VariableDeclarator,
						const: opts.VariableDeclarator,
					};
				} else if (typeof opts.VariableDeclarator === "object") {
					Object.assign(options.VariableDeclarator, opts.VariableDeclarator);
				}

				if (typeof opts.outerIIFEBody === "number") {
					options.outerIIFEBody = opts.outerIIFEBody;
				}
				if (typeof opts.MemberExpression === "number") {
					options.MemberExpression = opts.MemberExpression;
				}
				if (typeof opts.FunctionDeclaration === "object") {
					Object.assign(options.FunctionDeclaration, opts.FunctionDeclaration);
				}
				if (typeof opts.FunctionExpression === "object") {
					Object.assign(options.FunctionExpression, opts.FunctionExpression);
				}
				if (typeof opts.CallExpression === "object") {
					Object.assign(options.CallExpression, opts.CallExpression);
				}
				if (typeof opts.ArrayExpression === "number" || typeof opts.ArrayExpression === "string") {
					options.ArrayExpression = opts.ArrayExpression;
				}
				if (typeof opts.ObjectExpression === "number" || typeof opts.ObjectExpression === "string") {
					options.ObjectExpression = opts.ObjectExpression;
				}
			}
		}

		const caseIndentStore = {};

		// ----------------------------------------------------------------------
		// Helper utilities
		// ----------------------------------------------------------------------
		/**
		 * @param {number} expectedAmount
		 * @param {number} actualSpaces
		 * @param {number} actualTabs
		 * @returns {{expected:string,actual:string}}
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
		 * @returns {{space:number,tab:number,goodChar:number,badChar:number}}
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
		 * @returns {boolean}
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
		function shouldReportNodeIndent(node, neededIndent, actualIndent) {
			return (
				node.type !== "ArrayExpression" &&
				node.type !== "ObjectExpression" &&
				(actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
				isNodeFirstInLine(node)
			);
		}

		/**
		 * Handles the alternate part of an IfStatement.
		 * @param {ASTNode} node
		 * @param {number} neededIndent
		 */
		function handleIfStatementAlternate(node, neededIndent) {
			const elseToken = sourceCode.getTokenBefore(node.alternate);
			checkNodeIndent(elseToken, neededIndent);
			if (!isNodeFirstInLine(node.alternate)) {
				checkNodeIndent(node.alternate, neededIndent);
			}
		}

		/**
		 * Handles a TryStatement handler block.
		 * @param {ASTNode} handler
		 * @param {number} neededIndent
		 */
		function handleTryHandler(handler, neededIndent) {
			const catchToken = sourceCode.getFirstToken(handler);
			checkNodeIndent(catchToken, neededIndent);
		}

		/**
		 * Handles a TryStatement finalizer block.
		 * @param {ASTNode} finalizer
		 * @param {number} neededIndent
		 */
		function handleTryFinalizer(finalizer, neededIndent) {
			const finallyToken = sourceCode.getTokenBefore(finalizer);
			checkNodeIndent(finallyToken, neededIndent);
		}

		/**
		 * Handles a DoWhileStatement's while token.
		 * @param {ASTNode} body
		 * @param {number} neededIndent
		 */
		function handleDoWhile(body, neededIndent) {
			const whileToken = sourceCode.getTokenAfter(body);
			checkNodeIndent(whileToken, neededIndent);
		}

		/**
		 * @param {ASTNode} node
		 * @param {number} neededIndent
		 */
		function checkNodeIndent(node, neededIndent) {
			const actualIndent = getNodeIndent(node, false);
			if (shouldReportNodeIndent(node, neededIndent, actualIndent)) {
				report(node, neededIndent, actualIndent.space, actualIndent.tab);
			}
			if (node.type === "IfStatement" && node.alternate) {
				handleIfStatementAlternate(node, neededIndent);
			}
			if (node.type === "TryStatement") {
				if (node.handler) handleTryHandler(node.handler, neededIndent);
				if (node.finalizer) handleTryFinalizer(node.finalizer, neededIndent);
			}
			if (node.type === "DoWhileStatement") {
				handleDoWhile(node.body, neededIndent);
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
			if ((endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0) && isNodeFirstInLine(node, true)) {
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
		 * @param {ASTNode} node
		 * @param {number} firstLineIndent
		 */
		function checkFirstNodeLineIndent(node, firstLineIndent) {
			const startIndent = getNodeIndent(node, false);
			if ((startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0) && isNodeFirstInLine(node)) {
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
		 * @param {ASTNode} node
		 * @param {string} type
		 * @param {string[]} [stopAtList]
		 * @returns {ASTNode|null}
		 */
		function getParentNodeByType(node, type, stopAtList) {
			let parent = node.parent;
			const stopSet = new Set(stopAtList || ["Program"]);
			while (parent.type !== type && !stopSet.has(parent.type) && parent.type !== "Program") {
				parent = parent.parent;
			}
			return parent.type === type ? parent : null;
		}

		/**
		 * @param {ASTNode} node
		 * @returns {ASTNode|null}
		 */
		function getVariableDeclaratorNode(node) {
			return getParentNodeByType(node, "VariableDeclarator");
		}

		/**
		 * @param {ASTNode} node
		 * @param {ASTNode} varNode
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
		 * @param {ASTNode} node
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
		 * @param {ASTNode} node
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
		 * @param {ASTNode} node
		 * @returns {number}
		 */
		function computeFunctionIndent(node) {
			const calleeNode = node.parent; // FunctionExpression or FunctionDeclaration
			if (calleeNode.parent && ["Property", "ArrayExpression"].includes(calleeNode.parent.type)) {
				return getNodeIndent(calleeNode, false).goodChar;
			}
			return getNodeIndent(calleeNode).goodChar;
		}

		/**
		 * @param {ASTNode} node
		 * @returns {number}
		 */
		function computeFunctionOffset(node) {
			const calleeNode = node.parent;
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
		 * @param {ASTNode} node
		 */
		function checkIndentInFunctionBlock(node) {
			const baseIndent = computeFunctionIndent(node);
			const offset = computeFunctionOffset(node);
			let indent = baseIndent + offset;

			const parentVarNode = getVariableDeclaratorNode(node);
			if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
				indent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
			}
			if (node.body.length > 0) {
				checkNodesIndent(node.body, indent);
			}
			checkLastNodeLineIndent(node, indent - offset);
		}

		/**
		 * @param {ASTNode} node
		 * @returns {boolean}
		 */
		function isSingleLineNode(node) {
			const lastToken = sourceCode.getLastToken(node);
			return node.loc.start.line === lastToken.loc.end.line;
		}

		/**
		 * @param {ASTNode} node
		 * @returns {void}
		 */
		function checkIndentInArrayOrObjectBlock(node) {
			if (isSingleLineNode(node)) {
				return;
			}
			const elements = (node.type === "ArrayExpression" ? node.elements : node.properties).filter(e => e !== null);
			const parentVarNode = getVariableDeclaratorNode(node);
			let nodeIndent;

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
				nodeIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
			}
			checkNodesIndent(elements, elementsIndent);

			if (elements.length && elements.at(-1).loc.end.line === node.loc.end.line) {
				return;
			}
			const extra = isNodeInVarOnTop(node, parentVarNode) ? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize : 0;
			checkLastNodeLineIndent(node, nodeIndent + extra);
		}

		/**
		 * @param {ASTNode} node
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
			if (node.parent && statementsWithProperties.includes(node.parent.type) && isNodeBodyBlock(node)) {
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
		 * @param {ASTNode} node
		 * @returns {ASTNode[]}
		 */
		function filterOutSameLineVars(node) {
			return node.declarations.reduce((acc, elem) => {
				const last = acc.at(-1);
				if ((elem.loc.start.line !== node.loc.start.line && !last) ||
					(last && last.loc.start.line !== elem.loc.start.line)) {
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
		 * @param {ASTNode} node
		 * @returns {boolean}
		 */
		function isWrappedInParenthesis(node) {
			const regex = /^return\s*\(\s*\)/u;
			const statementWithoutArgument = sourceCode
				.getText(node)
				.replace(sourceCode.getText(node.argument), "");
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
				if (typeof options.MemberExpression === "undefined" || isSingleLineNode(node)) {
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