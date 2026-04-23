"use strict";

const astUtils = require("./utils/ast-utils");

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
			url: "https://eslint.style/guide/migration",
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
			CallExpression: { arguments: DEFAULT_PARAMETER_INDENT },
			ArrayExpression: 1,
			ObjectExpression: 1,
		};

		const sourceCode = context.sourceCode;

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
		}

		const caseIndentStore = {};

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

		function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
			if (gottenSpaces && gottenTabs) return;
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

		function getNodeIndent(node, byLastLine) {
			const token = byLastLine
				? sourceCode.getLastToken(node)
				: sourceCode.getFirstToken(node);
			const srcCharsBeforeNode = sourceCode.getText(token, token.loc.start.column).split("");
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

		function isNodeFirstInLine(node, byEndLocation) {
			const firstToken =
				byEndLocation === true
					? sourceCode.getLastToken(node, 1)
					: sourceCode.getTokenBefore(node);
			const startLine = byEndLocation === true ? node.loc.end.line : node.loc.start.line;
			const endLine = firstToken ? firstToken.loc.end.line : -1;
			return startLine !== endLine;
		}

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

		function checkNodesIndent(nodes, indent) {
			nodes.forEach(node => checkNodeIndent(node, indent));
		}

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

		function checkLastReturnStatementLineIndent(node, firstLineIndent) {
			const lastToken = sourceCode.getLastToken(
				node,
				astUtils.isClosingParenToken,
			);
			const textBeforeClosingParenthesis = sourceCode
				.getText(lastToken, lastToken.loc.start.column)
				.slice(0, -1);
			if (textBeforeClosingParenthesis.trim()) return;
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
				return (
					parent.arguments[0].loc.end.line > parent.arguments[0].loc.start.line
				);
			}
			return false;
		}

		function isOuterIIFE(node) {
			const parent = node.parent;
			let stmt = parent.parent;
			if (parent.type !== "CallExpression" || parent.callee !== node) return false;
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

		function checkIndentInFunctionBlock(node) {
			const calleeNode = node.parent;
			let indent = getNodeIndent(calleeNode, false).goodChar;
			if (
				calleeNode.parent &&
				(calleeNode.parent.type === "Property" ||
					calleeNode.parent.type === "ArrayExpression")
			) {
				indent = getNodeIndent(calleeNode, false).goodChar;
			}
			if (calleeNode.parent.type === "CallExpression") {
				const calleeParent = calleeNode.parent;
				if (
					calleeNode.type !== "FunctionExpression" &&
					calleeNode.type !== "ArrowFunctionExpression"
				) {
					if (
						calleeParent &&
						calleeParent.loc.start.line < node.loc.start.line
					) {
						indent = getNodeIndent(calleeParent, false).goodChar;
					}
				} else if (
					isArgBeforeCalleeNodeMultiline(calleeNode) &&
					calleeParent.callee.loc.start.line === calleeParent.callee.loc.end.line &&
					!isNodeFirstInLine(calleeNode)
				) {
					indent = getNodeIndent(calleeParent, false).goodChar;
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
				indent +=
					indentSize *
					options.VariableDeclarator[parentVarNode.parent.kind];
			}
			if (node.body.length > 0) {
				checkNodesIndent(node.body, indent);
			}
			checkLastNodeLineIndent(node, indent - functionOffset);
		}

		function isSingleLineNode(node) {
			const lastToken = sourceCode.getLastToken(node);
			return node.loc.start.line === lastToken.loc.end.line;
		}

		function getParentIndentForArrayOrObject(node) {
			const parent = node.parent;
			if (parent.type === "VariableDeclarator") {
				return getNodeIndent(parent, false).goodChar;
			}
			if (parent.type === "Property" || parent.type === "ArrayExpression") {
				return getNodeIndent(parent, false).goodChar;
			}
			return getNodeIndent(parent, false).goodChar;
		}

		function computeNodeIndent(node, parentVarNode) {
			if (isNodeFirstInLine(node)) {
				const parent = node.parent;
				let nodeIndent = getParentIndentForArrayOrObject(node);
				if (!parentVarNode || parentVarNode.loc.start.line !== node.loc.start.line) {
					if (
						parent.type !== "VariableDeclarator" ||
						parentVarNode === parentVarNode.parent.declarations[0]
					) {
						if (
							parent.type === "VariableDeclarator" &&
							parentVarNode.loc.start.line === parent.loc.start.line
						) {
							nodeIndent +=
								indentSize *
								options.VariableDeclarator[parentVarNode.parent.kind];
						} else if (
							parent.type === "ObjectExpression" ||
							parent.type === "ArrayExpression"
						) {
							const parentElements =
								node.parent.type === "ObjectExpression"
									? node.parent.properties
									: node.parent.elements;
							if (
								parentElements[0] &&
								parentElements[0].loc.start.line === parent.loc.start.line &&
								parentElements[0].loc.end.line !== parent.loc.start.line
							) {
								// first element spans multiple lines, no extra indent
							} else if (typeof options[parent.type] === "number") {
								nodeIndent += options[parent.type] * indentSize;
							} else {
								nodeIndent = parentElements[0].loc.start.column;
							}
						} else if (
							parent.type === "CallExpression" ||
							parent.type === "NewExpression"
						) {
							if (typeof options.CallExpression.arguments === "number") {
								nodeIndent +=
									options.CallExpression.arguments * indentSize;
							} else if (options.CallExpression.arguments === "first") {
								if (parent.arguments.includes(node)) {
									nodeIndent = parent.arguments[0].loc.start.column;
								}
							} else {
								nodeIndent += indentSize;
							}
						} else if (
							parent.type === "LogicalExpression" ||
							parent.type === "ArrowFunctionExpression"
						) {
							nodeIndent += indentSize;
						}
					}
				}
				return nodeIndent;
			}
			return getNodeIndent(node, false).goodChar;
		}

		function computeElementsIndent(node, nodeIndent, parentVarNode) {
			if (options[node.type] === "first") {
				return node.elements.length
					? node.elements[0].loc.start.column
					: 0;
			}
			let elementsIndent = nodeIndent + indentSize * options[node.type];
			if (isNodeInVarOnTop(node, parentVarNode)) {
				elementsIndent +=
					indentSize *
					options.VariableDeclarator[parentVarNode.parent.kind];
			}
			return elementsIndent;
		}

		function checkIndentInArrayOrObjectBlock(node) {
			if (isSingleLineNode(node)) return;
			const elements = node.type === "ArrayExpression" ? node.elements : node.properties;
			const filteredElements = elements.filter(elem => elem !== null);
			const parentVarNode = getVariableDeclaratorNode(node);
			const nodeIndent = computeNodeIndent(node, parentVarNode);
			const elementsIndent = computeElementsIndent(node, nodeIndent, parentVarNode);
			checkNodesIndent(filteredElements, elementsIndent);
			if (filteredElements.length > 0 && filteredElements.at(-1).loc.end.line === node.loc.end.line) {
				return;
			}
			checkLastNodeLineIndent(
				node,
				nodeIndent +
					(isNodeInVarOnTop(node, parentVarNode)
						? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize
						: 0),
			);
		}

		function isNodeBodyBlock(node) {
			return (
				node.type === "BlockStatement" ||
				node.type === "ClassBody" ||
				(node.body && node.body.type === "BlockStatement") ||
				(node.consequent && node.consequent.type === "BlockStatement")
			);
		}

		function blockIndentationCheck(node) {
			if (isSingleLineNode(node)) return;
			if (
				node.parent &&
				["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(node.parent.type)
			) {
				checkIndentInFunctionBlock(node);
				return;
			}
			let indent;
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
				indent = getNodeIndent(node.parent, false).goodChar;
			} else if (node.parent && node.parent.type === "CatchClause") {
				indent = getNodeIndent(node.parent.parent, false).goodChar;
			} else {
				indent = getNodeIndent(node, false).goodChar;
			}
			let nodesToCheck;
			if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
				nodesToCheck = [node.consequent];
			} else if (Array.isArray(node.body)) {
				nodesToCheck = node.body;
			} else {
				nodesToCheck = [node.body];
			}
			if (nodesToCheck.length > 0) {
				checkNodesIndent(nodesToCheck, indent + indentSize);
			}
			if (node.type === "BlockStatement") {
				checkLastNodeLineIndent(node, indent);
			}
		}

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

		function checkIndentInVariableDeclarations(node) {
			const elements = filterOutSameLineVars(node);
			const nodeIndent = getNodeIndent(node, false).goodChar;
			const lastElement = elements.at(-1);
			const elementsIndent = nodeIndent + indentSize * options.VariableDeclarator[node.kind];
			checkNodesIndent(elements, elementsIndent);
			if (sourceCode.getLastToken(node).loc.end.line <= lastElement.loc.end.line) {
				return;
			}
			const tokenBeforeLastElement = sourceCode.getTokenBefore(lastElement);
			if (tokenBeforeLastElement.value === ",") {
				checkLastNodeLineIndent(
					node,
					getNodeIndent(tokenBeforeLastElement, false).goodChar,
				);
			} else {
				checkLastNodeLineIndent(node, elementsIndent - indentSize);
			}
		}

		function blockLessNodes(node) {
			if (node.body.type !== "BlockStatement") {
				blockIndentationCheck(node);
			}
		}

		function expectedCaseIndent(node, providedSwitchIndent) {
			const switchNode = node.type === "SwitchStatement" ? node : node.parent;
			const switchIndent =
				typeof providedSwitchIndent === "undefined"
					? getNodeIndent(switchNode, false).goodChar
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

		function isWrappedInParenthesis(node) {
			const regex = /^return\s*\(\s*\)/u;
			const statementWithoutArgument = sourceCode
				.getText(node)
				.replace(sourceCode.getText(node.argument), "");
			return regex.test(statementWithoutArgument);
		}

		return {
			Program(node) {
				if (node.body.length > 0) {
					checkNodesIndent(node.body, getNodeIndent(node, false).goodChar);
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
				if (typeof options.MemberExpression === "undefined") return;
				if (isSingleLineNode(node)) return;
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
					getNodeIndent(node, false).goodChar +
					indentSize * options.MemberExpression;
				const checkNodes = [node.property];
				const dot = sourceCode.getTokenBefore(node.property);
				if (dot.type === "Punctuator" && dot.value === ".") {
					checkNodes.push(dot);
				}
				checkNodesIndent(checkNodes, propertyIndent);
			},
			SwitchStatement(node) {
				const switchIndent = getNodeIndent(node, false).goodChar;
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
				if (
					options.FunctionDeclaration.parameters === "first" &&
					node.params.length
				) {
					checkNodesIndent(
						node.params.slice(1),
						node.params[0].loc.start.column,
					);
				} else if (options.FunctionDeclaration.parameters !== null) {
					checkNodesIndent(
						node.params,
						getNodeIndent(node, false).goodChar +
							indentSize * options.FunctionDeclaration.parameters,
					);
				}
			},
			FunctionExpression(node) {
				if (isSingleLineNode(node)) return;
				if (
					options.FunctionExpression.parameters === "first" &&
					node.params.length
				) {
					checkNodesIndent(
						node.params.slice(1),
						node.params[0].loc.start.column,
					);
				} else if (options.FunctionExpression.parameters !== null) {
					checkNodesIndent(
						node.params,
						getNodeIndent(node, false).goodChar +
							indentSize * options.FunctionExpression.parameters,
					);
				}
			},
			ReturnStatement(node) {
				if (isSingleLineNode(node)) return;
				const firstLineIndent = getNodeIndent(node, false).goodChar;
				if (isWrappedInParenthesis(node)) {
					checkLastReturnStatementLineIndent(node, firstLineIndent);
				} else {
					checkNodeIndent(node, firstLineIndent);
				}
			},
			CallExpression(node) {
				if (isSingleLineNode(node)) return;
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
						getNodeIndent(node, false).goodChar +
							indentSize * options.CallExpression.arguments,
					);
				}
			},
		};
	},
};