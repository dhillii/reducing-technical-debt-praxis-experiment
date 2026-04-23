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
		function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
			const expected = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
			const spaceWord = `space${actualSpaces === 1 ? "" : "s"}`;
			const tabWord = `tab${actualTabs === 1 ? "" : "s"}`;
			let actual;

			if (actualSpaces && actualTabs) {
				actual = `${actualSpaces} ${spaceWord} and ${actualTabs} ${tabWord}`;
			} else if (actualSpaces) {
				actual = indentType === "space" ? actualSpaces : `${actualSpaces} ${spaceWord}`;
			} else if (actualTabs) {
				actual = indentType === "tab" ? actualTabs : `${actualTabs} ${tabWord}`;
			} else {
				actual = "0";
			}
			return { expected, actual };
		}

		function report(node, needed, spaces, tabs, loc, isLastNodeCheck) {
			if (spaces && tabs) return;

			const desired = (indentType === "space" ? " " : "\t").repeat(needed);
			const range = isLastNodeCheck
				? [
						node.range[1] - node.loc.end.column,
						node.range[1] - node.loc.end.column + spaces + tabs,
				  ]
				: [
						node.range[0] - node.loc.start.column,
						node.range[0] - node.loc.start.column + spaces + tabs,
				  ];

			context.report({
				node,
				loc,
				messageId: "expected",
				data: createErrorMessageData(needed, spaces, tabs),
				fix: fixer => fixer.replaceTextRange(range, desired),
			});
		}

		function getNodeIndent(node, byLastLine = false) {
			const token = byLastLine ? sourceCode.getLastToken(node) : sourceCode.getFirstToken(node);
			const text = sourceCode.getText(token, token.loc.start.column);
			const chars = text.split("").filter(c => c === " " || c === "\t");
			const spaces = chars.filter(c => c === " ").length;
			const tabs = chars.filter(c => c === "\t").length;
			return {
				space: spaces,
				tab: tabs,
				goodChar: indentType === "space" ? spaces : tabs,
				badChar: indentType === "space" ? tabs : spaces,
			};
		}

		function isNodeFirstInLine(node, byEndLocation = false) {
			const token = byEndLocation
				? sourceCode.getLastToken(node, 1)
				: sourceCode.getTokenBefore(node);
			const line = byEndLocation ? node.loc.end.line : node.loc.start.line;
			const tokenLine = token ? token.loc.end.line : -1;
			return line !== tokenLine;
		}

		function isSingleLineNode(node) {
			const last = sourceCode.getLastToken(node);
			return node.loc.start.line === last.loc.end.line;
		}

		function getParentNodeByType(node, type, stopAt = ["Program"]) {
			const stopSet = new Set(stopAt);
			let parent = node.parent;
			while (parent && parent.type !== type && !stopSet.has(parent.type) && parent.type !== "Program") {
				parent = parent.parent;
			}
			return parent && parent.type === type ? parent : null;
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
				const first = parent.arguments[0];
				return first.loc.end.line > first.loc.start.line;
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
			return (
				(stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
				stmt.parent &&
				stmt.parent.type === "Program"
			);
		}

		// ----------------------------------------------------------------------
		// Core checking functions (single responsibility)
		// ----------------------------------------------------------------------
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
				const elseTok = sourceCode.getTokenBefore(node.alternate);
				checkNodeIndent(elseTok, neededIndent);
				if (!isNodeFirstInLine(node.alternate)) {
					checkNodeIndent(node.alternate, neededIndent);
				}
			}
			if (node.type === "TryStatement") {
				if (node.handler) {
					const catchTok = sourceCode.getFirstToken(node.handler);
					checkNodeIndent(catchTok, neededIndent);
				}
				if (node.finalizer) {
					const finTok = sourceCode.getTokenBefore(node.finalizer);
					checkNodeIndent(finTok, neededIndent);
				}
			}
			if (node.type === "DoWhileStatement") {
				const whileTok = sourceCode.getTokenAfter(node.body);
				checkNodeIndent(whileTok, neededIndent);
			}
		}

		function checkNodesIndent(nodes, indent) {
			nodes.forEach(n => checkNodeIndent(n, indent));
		}

		function checkFirstNodeLineIndent(node, expected) {
			const actual = getNodeIndent(node);
			if ((actual.goodChar !== expected || actual.badChar !== 0) && isNodeFirstInLine(node)) {
				report(node, expected, actual.space, actual.tab, {
					line: node.loc.start.line,
					column: node.loc.start.column,
				});
			}
		}

		function checkLastNodeLineIndent(node, expected) {
			const last = sourceCode.getLastToken(node);
			const actual = getNodeIndent(last, true);
			if ((actual.goodChar !== expected || actual.badChar !== 0) && isNodeFirstInLine(node, true)) {
				report(
					node,
					expected,
					actual.space,
					actual.tab,
					{ line: last.loc.start.line, column: last.loc.start.column },
					true,
				);
			}
		}

		function checkLastReturnStatementLineIndent(node, expected) {
			const closing = sourceCode.getLastToken(node, astUtils.isClosingParenToken);
			const before = sourceCode.getText(closing, closing.loc.start.column).slice(0, -1);
			if (before.trim()) return;
			const actual = getNodeIndent(closing, true);
			if (actual.goodChar !== expected) {
				report(
					node,
					expected,
					actual.space,
					actual.tab,
					{ line: closing.loc.start.line, column: closing.loc.start.column },
					true,
				);
			}
		}

		function isWrappedInParenthesis(node) {
			const regex = /^return\s*\(\s*\)/u;
			const text = sourceCode.getText(node).replace(sourceCode.getText(node.argument), "");
			return regex.test(text);
		}

		// ----------------------------------------------------------------------
		// Specific block checks
		// ----------------------------------------------------------------------
		function computeFunctionIndent(calleeNode) {
			if (
				calleeNode.parent &&
				(calleeNode.parent.type === "Property" || calleeNode.parent.type === "ArrayExpression")
			) {
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
			const calleeNode = node.parent; // FunctionExpression or FunctionDeclaration
			let baseIndent = computeFunctionIndent(calleeNode);
			const offset = computeFunctionOffset(calleeNode);
			baseIndent += offset;

			const varNode = getVariableDeclaratorNode(node);
			if (varNode && isNodeInVarOnTop(node, varNode)) {
				baseIndent += indentSize * options.VariableDeclarator[varNode.parent.kind];
			}

			if (node.body.length) {
				checkNodesIndent(node.body, baseIndent);
			}
			checkLastNodeLineIndent(node, baseIndent - offset);
		}

		function computeArrayOrObjectIndent(node) {
			if (isNodeFirstInLine(node)) {
				const parent = node.parent;
				let indent = getNodeIndent(parent).goodChar;

				if (parent.type === "VariableDeclarator") {
					const varNode = getVariableDeclaratorNode(node);
					if (varNode && varNode.loc.start.line === parent.loc.start.line) {
						indent += indentSize * options.VariableDeclarator[varNode.parent.kind];
					}
				} else if (["ObjectExpression", "ArrayExpression"].includes(parent.type)) {
					const siblings = parent.type === "ObjectExpression" ? parent.properties : parent.elements;
					if (siblings[0] && siblings[0].loc.start.line === parent.loc.start.line && siblings[0].loc.end.line !== parent.loc.start.line) {
						// keep indent as is
					} else if (typeof options[parent.type] === "number") {
						indent += options[parent.type] * indentSize;
					} else {
						indent = siblings[0].loc.start.column;
					}
				} else if (["CallExpression", "NewExpression"].includes(parent.type)) {
					if (typeof options.CallExpression.arguments === "number") {
						indent += options.CallExpression.arguments * indentSize;
					} else if (options.CallExpression.arguments === "first") {
						if (parent.arguments.includes(node)) {
							indent = parent.arguments[0].loc.start.column;
						}
					} else {
						indent += indentSize;
					}
				} else if (["LogicalExpression", "ArrowFunctionExpression"].includes(parent.type)) {
					indent += indentSize;
				}
				checkFirstNodeLineIndent(node, indent);
				return indent;
			}
			return getNodeIndent(node).goodChar;
		}

		function checkIndentInArrayOrObjectBlock(node) {
			if (isSingleLineNode(node)) return;

			const elements = (node.type === "ArrayExpression" ? node.elements : node.properties).filter(e => e !== null);
			const baseIndent = computeArrayOrObjectIndent(node);
			const varNode = getVariableDeclaratorNode(node);
			const elementIndent = options[node.type] === "first"
				? (elements[0] ? elements[0].loc.start.column : 0)
				: baseIndent + indentSize * options[node.type];

			const finalElementIndent = isNodeInVarOnTop(node, varNode)
				? elementIndent + indentSize * options.VariableDeclarator[varNode.parent.kind]
				: elementIndent;

			checkNodesIndent(elements, finalElementIndent);

			if (elements.length && elements.at(-1).loc.end.line === node.loc.end.line) return;

			const closingIndent = baseIndent + (isNodeInVarOnTop(node, varNode) ? options.VariableDeclarator[varNode.parent.kind] * indentSize : 0);
			checkLastNodeLineIndent(node, closingIndent);
		}

		function expectedCaseIndent(node, providedSwitchIndent) {
			const switchNode = node.type === "SwitchStatement" ? node : node.parent;
			const switchIndent = providedSwitchIndent ?? getNodeIndent(switchNode).goodChar;

			if (caseIndentStore[switchNode.loc.start.line]) {
				return caseIndentStore[switchNode.loc.start.line];
			}
			const caseIndent = switchNode.cases.length && options.SwitchCase === 0
				? switchIndent
				: switchIndent + indentSize * options.SwitchCase;

			caseIndentStore[switchNode.loc.start.line] = caseIndent;
			return caseIndent;
		}

		function filterOutSameLineVars(node) {
			return node.declarations.reduce((acc, decl) => {
				const last = acc.at(-1);
				if (
					(decl.loc.start.line !== node.loc.start.line && !last) ||
					(last && last.loc.start.line !== decl.loc.start.line)
				) {
					acc.push(decl);
				}
				return acc;
			}, []);
		}

		function checkIndentInVariableDeclarations(node) {
			const elements = filterOutSameLineVars(node);
			const baseIndent = getNodeIndent(node).goodChar;
			const elemIndent = baseIndent + indentSize * options.VariableDeclarator[node.kind];

			checkNodesIndent(elements, elemIndent);

			const last = elements.at(-1);
			if (sourceCode.getLastToken(node).loc.end.line <= last.loc.end.line) return;

			const tokenBefore = sourceCode.getTokenBefore(last);
			if (tokenBefore.value === ",") {
				checkLastNodeLineIndent(node, getNodeIndent(tokenBefore).goodChar);
			} else {
				checkLastNodeLineIndent(node, elemIndent - indentSize);
			}
		}

		function blockIndentationCheck(node) {
			if (isSingleLineNode(node)) return;

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

			let baseIndent;
			if (node.parent && statementsWithProperties.includes(node.parent.type) && isNodeBodyBlock(node)) {
				baseIndent = getNodeIndent(node.parent).goodChar;
			} else if (node.parent && node.parent.type === "CatchClause") {
				baseIndent = getNodeIndent(node.parent.parent).goodChar;
			} else {
				baseIndent = getNodeIndent(node).goodChar;
			}

			const nodesToCheck = node.type === "IfStatement" && node.consequent.type !== "BlockStatement"
				? [node.consequent]
				: Array.isArray(node.body) ? node.body : [node.body];

			if (nodesToCheck.length) {
				checkNodesIndent(nodesToCheck, baseIndent + indentSize);
			}
			if (node.type === "BlockStatement") {
				checkLastNodeLineIndent(node, baseIndent);
			}
		}

		function isNodeBodyBlock(node) {
			return (
				node.type === "BlockStatement" ||
				node.type === "ClassBody" ||
				(node.body && node.body.type === "BlockStatement") ||
				(node.consequent && node.consequent.type === "BlockStatement")
			);
		}

		function blockLessNodes(node) {
			if (node.body.type !== "BlockStatement") {
				blockIndentationCheck(node);
			}
		}

		// ----------------------------------------------------------------------
		// Visitor definitions
		// ----------------------------------------------------------------------
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
				if (typeof options.MemberExpression === "undefined") return;
				if (isSingleLineNode(node)) return;
				if (getParentNodeByType(node, "VariableDeclarator", ["FunctionExpression", "ArrowFunctionExpression"])) return;
				if (getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])) return;

				const propIndent = getNodeIndent(node).goodChar + indentSize * options.MemberExpression;
				const checkNodes = [node.property];
				const dot = sourceCode.getTokenBefore(node.property);
				if (dot.type === "Punctuator" && dot.value === ".") {
					checkNodes.push(dot);
				}
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
					const base = getNodeIndent(node).goodChar + indentSize * options.FunctionDeclaration.parameters;
					checkNodesIndent(node.params, base);
				}
			},
			FunctionExpression(node) {
				if (isSingleLineNode(node)) return;
				if (options.FunctionExpression.parameters === "first" && node.params.length) {
					checkNodesIndent(node.params.slice(1), node.params[0].loc.start.column);
				} else if (options.FunctionExpression.parameters !== null) {
					const base = getNodeIndent(node).goodChar + indentSize * options.FunctionExpression.parameters;
					checkNodesIndent(node.params, base);
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
					const base = getNodeIndent(node).goodChar + indentSize * options.CallExpression.arguments;
					checkNodesIndent(node.arguments, base);
				}
			},
		};
	},
};