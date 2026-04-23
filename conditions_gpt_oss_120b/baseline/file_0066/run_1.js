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
								oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
							},
							body: { type: "integer", minimum: 0 },
						},
					},
					FunctionExpression: {
						type: "object",
						properties: {
							parameters: {
								oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
							},
							body: { type: "integer", minimum: 0 },
						},
					},
					CallExpression: {
						type: "object",
						properties: {
							parameters: {
								oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
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
			expected: "Expected indentation of {{expected}} but found {{actual}}.",
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
		// Option parsing
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

		function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
			if (gottenSpaces && gottenTabs) return;

			const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);
			const range = isLastNodeCheck
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
				fix: fixer => fixer.replaceTextRange(range, desiredIndent),
			});
		}

		function getNodeIndent(node, byLastLine) {
			const token = byLastLine ? sourceCode.getLastToken(node) : sourceCode.getFirstToken(node);
			const src = sourceCode.getText(token, token.loc.start.column).split("");
			const indentChars = src.slice(0, src.findIndex(ch => ch !== " " && ch !== "\t"));
			const spaces = indentChars.filter(ch => ch === " ").length;
			const tabs = indentChars.filter(ch => ch === "\t").length;
			return {
				space: spaces,
				tab: tabs,
				goodChar: indentType === "space" ? spaces : tabs,
				badChar: indentType === "space" ? tabs : spaces,
			};
		}

		function isNodeFirstInLine(node, byEndLocation) {
			const token = byEndLocation ? sourceCode.getLastToken(node, 1) : sourceCode.getTokenBefore(node);
			const line = byEndLocation ? node.loc.end.line : node.loc.start.line;
			const tokenLine = token ? token.loc.end.line : -1;
			return line !== tokenLine;
		}

		function checkNodeIndent(node, neededIndent) {
			const actual = getNodeIndent(node);
			if (
				node.type !== "ArrayExpression" &&
				node.type !== "ObjectExpression" &&
				(actual.goodChar !== neededIndent || actual.badChar !== 0) &&
				isNodeFirstInLine(node)
			) {
				report(node, neededIndent, actual.space, actual.tab);
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
				const finallyToken = sourceCode.getTokenBefore(node.finalizer);
				checkNodeIndent(finallyToken, neededIndent);
			}
			if (node.type === "DoWhileStatement") {
				const whileToken = sourceCode.getTokenAfter(node.body);
				checkNodeIndent(whileToken, neededIndent);
			}
		}

		function checkNodesIndent(nodes, indent) {
			nodes.forEach(n => checkNodeIndent(n, indent));
		}

		function checkLastNodeLineIndent(node, expected) {
			const lastToken = sourceCode.getLastToken(node);
			const actual = getNodeIndent(lastToken, true);
			if ((actual.goodChar !== expected || actual.badChar !== 0) && isNodeFirstInLine(node, true)) {
				report(
					node,
					expected,
					actual.space,
					actual.tab,
					{ line: lastToken.loc.start.line, column: lastToken.loc.start.column },
					true,
				);
			}
		}

		function checkFirstNodeLineIndent(node, expected) {
			const actual = getNodeIndent(node);
			if ((actual.goodChar !== expected || actual.badChar !== 0) && isNodeFirstInLine(node)) {
				report(
					node,
					expected,
					actual.space,
					actual.tab,
					{ line: node.loc.start.line, column: node.loc.start.column },
				);
			}
		}

		function getParentNodeByType(node, type, stopAtList) {
			let parent = node.parent;
			const stopSet = new Set(stopAtList || ["Program"]);
			while (parent.type !== type && !stopSet.has(parent.type) && parent.type !== "Program") {
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
			if (parent.type !== "CallExpression" || parent.callee !== node) return false;
			let stmt = parent.parent;
			while (
				(stmt.type === "UnaryExpression" && ["!", "~", "+", "-"].includes(stmt.operator)) ||
				["AssignmentExpression", "LogicalExpression", "SequenceExpression", "VariableDeclarator"].includes(stmt.type)
			) {
				stmt = stmt.parent;
			}
			return (stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
				stmt.parent && stmt.parent.type === "Program";
		}

		function computeFunctionIndent(calleeNode, node) {
			const parent = calleeNode.parent;
			if (parent && (parent.type === "Property" || parent.type === "ArrayExpression")) {
				return getNodeIndent(calleeNode, false).goodChar;
			}
			return getNodeIndent(calleeNode).goodChar;
		}

		function computeFunctionOffset(calleeNode) {
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

		function checkIndentInFunctionBlock(node) {
			const calleeNode = node.parent;
			let baseIndent = computeFunctionIndent(calleeNode, node);
			const offset = computeFunctionOffset(calleeNode);
			baseIndent += offset;

			const varNode = getVariableDeclaratorNode(node);
			if (varNode && isNodeInVarOnTop(node, varNode)) {
				baseIndent += indentSize * options.VariableDeclarator[varNode.parent.kind];
			}

			if (node.body.length) checkNodesIndent(node.body, baseIndent);
			checkLastNodeLineIndent(node, baseIndent - offset);
		}

		function isSingleLineNode(node) {
			const last = sourceCode.getLastToken(node);
			return node.loc.start.line === last.loc.end.line;
		}

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

		function expectedCaseIndent(node, providedSwitchIndent) {
			const switchNode = node.type === "SwitchStatement" ? node : node.parent;
			const switchIndent = providedSwitchIndent ?? getNodeIndent(switchNode).goodChar;
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

		function isWrappedInParenthesis(node) {
			const regex = /^return\s*\(\s*\)/u;
			const text = context.sourceCode.getText(node).replace(context.sourceCode.getText(node.argument), "");
			return regex.test(text);
		}

		// ----------------------------------------------------------------------
		// Block indentation logic (split for readability)
		// ----------------------------------------------------------------------
		function getIndentForBlock(node) {
			if (node.parent && ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(node.parent.type)) {
				return getNodeIndent(node.parent).goodChar;
			}
			if (node.parent && node.parent.type === "CatchClause") {
				return getNodeIndent(node.parent.parent).goodChar;
			}
			return getNodeIndent(node).goodChar;
		}

		function getNodesToCheckForBlock(node) {
			if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
				return [node.consequent];
			}
			if (Array.isArray(node.body)) return node.body;
			return [node.body];
		}

		function blockIndentationCheck(node) {
			if (isSingleLineNode(node)) return;

			if (node.parent && ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(node.parent.type)) {
				checkIndentInFunctionBlock(node);
				return;
			}

			const indent = getIndentForBlock(node);
			const nodes = getNodesToCheckForBlock(node);
			if (nodes.length) checkNodesIndent(nodes, indent + indentSize);
			if (node.type === "BlockStatement") checkLastNodeLineIndent(node, indent);
		}

		// ----------------------------------------------------------------------
		// Array/Object block handling (extracted for clarity)
		// ----------------------------------------------------------------------
		function computeArrayObjectBaseIndent(node) {
			if (!isNodeFirstInLine(node)) return getNodeIndent(node).goodChar;

			const parent = node.parent;
			let base = getNodeIndent(parent).goodChar;

			if (!getVariableDeclaratorNode(node) || getVariableDeclaratorNode(node).loc.start.line !== node.loc.start.line) {
				if (parent.type === "VariableDeclarator") {
					if (parent.parent.declarations[0] === getVariableDeclaratorNode(node)) {
						// no extra indent
					} else if (parent.parent.kind && parent.parent.kind in options.VariableDeclarator) {
						base += indentSize * options.VariableDeclarator[parent.parent.kind];
					}
				} else if (["ObjectExpression", "ArrayExpression"].includes(parent.type)) {
					const elems = parent.type === "ObjectExpression" ? parent.properties : parent.elements;
					if (elems[0] && elems[0].loc.start.line === parent.loc.start.line && elems[0].loc.end.line !== parent.loc.start.line) {
						// keep base
					} else if (typeof options[parent.type] === "number") {
						base += options[parent.type] * indentSize;
					} else {
						base = elems[0].loc.start.column;
					}
				} else if (["CallExpression", "NewExpression"].includes(parent.type)) {
					if (typeof options.CallExpression.arguments === "number") {
						base += options.CallExpression.arguments * indentSize;
					} else if (options.CallExpression.arguments === "first") {
						if (parent.arguments.includes(node)) base = parent.arguments[0].loc.start.column;
					} else {
						base += indentSize;
					}
				} else if (["LogicalExpression", "ArrowFunctionExpression"].includes(parent.type)) {
					base += indentSize;
				}
			}
			return base;
		}

		function checkIndentInArrayOrObjectBlock(node) {
			if (isSingleLineNode(node)) return;

			const elements = (node.type === "ArrayExpression" ? node.elements : node.properties).filter(e => e !== null);
			const parentVarNode = getVariableDeclaratorNode(node);
			const baseIndent = computeArrayObjectBaseIndent(node);
			checkFirstNodeLineIndent(node, baseIndent);

			const elementsIndent = options[node.type] === "first"
				? (elements[0] ? elements[0].loc.start.column : 0)
				: baseIndent + indentSize * options[node.type];

			const finalElementsIndent = parentVarNode && isNodeInVarOnTop(node, parentVarNode)
				? elementsIndent + indentSize * options.VariableDeclarator[parentVarNode.parent.kind]
				: elementsIndent;

			checkNodesIndent(elements, finalElementsIndent);

			if (elements.length && elements.at(-1).loc.end.line === node.loc.end.line) return;

			const closingIndent = baseIndent + (parentVarNode && isNodeInVarOnTop(node, parentVarNode) ? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize : 0);
			checkLastNodeLineIndent(node, closingIndent);
		}

		// ----------------------------------------------------------------------
		// Visitor definitions
		// ----------------------------------------------------------------------
		return {
			Program(node) {
				if (node.body.length) checkNodesIndent(node.body, getNodeIndent(node).goodChar);
			},
			ClassBody: blockIndentationCheck,
			BlockStatement: blockIndentationCheck,
			WhileStatement(node) { blockLessNodes(node); },
			ForStatement(node) { blockLessNodes(node); },
			ForInStatement(node) { blockLessNodes(node); },
			ForOfStatement(node) { blockLessNodes(node); },
			DoWhileStatement(node) { blockLessNodes(node); },
			IfStatement(node) {
				if (node.consequent.type !== "BlockStatement" && node.consequent.loc.start.line > node.loc.start.line) {
					blockIndentationCheck(node);
				}
			},
			VariableDeclaration(node) {
				if (node.declarations.at(-1).loc.start.line > node.declarations[0].loc.start.line) {
					const elements = filterOutSameLineVars(node);
					const base = getNodeIndent(node).goodChar;
					const elemIndent = base + indentSize * options.VariableDeclarator[node.kind];
					checkNodesIndent(elements, elemIndent);
					const last = elements.at(-1);
					if (sourceCode.getLastToken(node).loc.end.line > last.loc.end.line) {
						const beforeLast = sourceCode.getTokenBefore(last);
						if (beforeLast.value === ",") {
							checkLastNodeLineIndent(node, getNodeIndent(beforeLast).goodChar);
						} else {
							checkLastNodeLineIndent(node, elemIndent - indentSize);
						}
					}
				}
			},
			ObjectExpression(node) { checkIndentInArrayOrObjectBlock(node); },
			ArrayExpression(node) { checkIndentInArrayOrObjectBlock(node); },
			MemberExpression(node) {
				if (typeof options.MemberExpression === "undefined" || isSingleLineNode(node)) return;
				if (getParentNodeByType(node, "VariableDeclarator", ["FunctionExpression", "ArrowFunctionExpression"])) return;
				if (getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])) return;

				const propIndent = getNodeIndent(node).goodChar + indentSize * options.MemberExpression;
				const checkNodes = [node.property];
				const dot = sourceCode.getTokenBefore(node.property);
				if (dot.type === "Punctuator" && dot.value === ".") checkNodes.push(dot);
				checkNodesIndent(checkNodes, propIndent);
			},
			SwitchStatement(node) {
				const switchIndent = getNodeIndent(node).goodChar;
				const caseIndent = expectedCaseIndent(node, switchIndent);
				checkNodesIndent(node.cases, caseIndent);
				checkLastNodeLineIndent(node, switchIndent);
			},
			SwitchCase(node) {
				if (isSingleLineNode(node)) return;
				const caseIndent = expectedCaseIndent(node);
				checkNodesIndent(node.consequent, caseIndent + indentSize);
			},
			FunctionDeclaration(node) {
				if (isSingleLineNode(node)) return;
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
				if (isSingleLineNode(node)) return;
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
				if (isSingleLineNode(node)) return;
				const firstIndent = getNodeIndent(node).goodChar;
				if (isWrappedInParenthesis(node)) {
					checkLastReturnStatementLineIndent(node, firstIndent);
				} else {
					checkNodeIndent(node, firstIndent);
				}
			},
			CallExpression(node) {
				if (isSingleLineNode(node)) return;
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

		// ----------------------------------------------------------------------
		// Additional small helpers used above
		// ----------------------------------------------------------------------
		function blockLessNodes(node) {
			if (node.body.type !== "BlockStatement") blockIndentationCheck(node);
		}

		function checkLastReturnStatementLineIndent(node, firstLineIndent) {
			const lastToken = sourceCode.getLastToken(node, astUtils.isClosingParenToken);
			const before = sourceCode.getText(lastToken, lastToken.loc.start.column).slice(0, -1);
			if (before.trim()) return;
			const actual = getNodeIndent(lastToken, true);
			if (actual.goodChar !== firstLineIndent) {
				report(
					node,
					firstLineIndent,
					actual.space,
					actual.tab,
					{ line: lastToken.loc.start.line, column: lastToken.loc.start.column },
					true,
				);
			}
		}
	},
};