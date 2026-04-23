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

		const initializeOptions = () => {
			if (!context.options.length) return;

			if (context.options[0] === "tab") {
				indentSize = 1;
				indentType = "tab";
			} else if (typeof context.options[0] === "number") {
				indentSize = context.options[0];
				indentType = "space";
			}

			if (!context.options[1]) return;

			const opts = context.options[1];
			options.SwitchCase = opts.SwitchCase || 0;

			applyVariableDeclaratorRules(opts.VariableDeclarator);
			applyNumericOption(opts.outerIIFEBody, "outerIIFEBody");
			applyNumericOption(opts.MemberExpression, "MemberExpression");
			applyObjectOption(opts.FunctionDeclaration, "FunctionDeclaration");
			applyObjectOption(opts.FunctionExpression, "FunctionExpression");
			applyObjectOption(opts.CallExpression, "CallExpression");
			applyArrayOrStringOption(opts.ArrayExpression, "ArrayExpression");
			applyArrayOrStringOption(opts.ObjectExpression, "ObjectExpression");
		};

		const applyVariableDeclaratorRules = (rules) => {
			if (!rules) return;
			if (typeof rules === "number") {
				options.VariableDeclarator = {
					var: rules,
					let: rules,
					const: rules,
				};
			} else if (typeof rules === "object") {
				Object.assign(options.VariableDeclarator, rules);
			}
		};

		const applyNumericOption = (value, key) => {
			if (typeof value === "number") {
				options[key] = value;
			}
		};

		const applyObjectOption = (value, key) => {
			if (typeof value === "object") {
				Object.assign(options[key], value);
			}
		};

		const applyArrayOrStringOption = (value, key) => {
			if (typeof value === "number" || typeof value === "string") {
				options[key] = value;
			}
		};

		initializeOptions();

		const createErrorMessageData = (expectedAmount, actualSpaces, actualTabs) => {
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
		};

		const report = (node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) => {
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
		};

		const getNodeIndent = (node, byLastLine) => {
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
		};

		const isNodeFirstInLine = (node, byEndLocation) => {
			const firstToken = byEndLocation === true
				? sourceCode.getLastToken(node, 1)
				: sourceCode.getTokenBefore(node);
			const startLine = byEndLocation === true ? node.loc.end.line : node.loc.start.line;
			const endLine = firstToken ? firstToken.loc.end.line : -1;

			return startLine !== endLine;
		};

		const checkNodeIndent = (node, neededIndent) => {
			const actualIndent = getNodeIndent(node, false);

			if (
				node.type !== "ArrayExpression" &&
				node.type !== "ObjectExpression" &&
				(actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
				isNodeFirstInLine(node)
			) {
				report(node, neededIndent, actualIndent.space, actualIndent.tab);
			}

			checkSpecialStatements(node, neededIndent);
		};

		const checkSpecialStatements = (node, neededIndent) => {
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
		};

		const checkNodesIndent = (nodes, indent) => {
			nodes.forEach(node => checkNodeIndent(node, indent));
		};

		const checkLastNodeLineIndent = (node, lastLineIndent) => {
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
		};

		const checkLastReturnStatementLineIndent = (node, firstLineIndent) => {
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
					{
						line: lastToken.loc.start.line,
						column: lastToken.loc.start.column,
					},
					true,
				);
			}
		};

		const checkFirstNodeLineIndent = (node, firstLineIndent) => {
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
					{
						line: node.loc.start.line,
						column: node.loc.start.column,
					},
				);
			}
		};

		const getParentNodeByType = (node, type, stopAtList) => {
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
		};

		const getVariableDeclaratorNode = (node) => {
			return getParentNodeByType(node, "VariableDeclarator");
		};

		const isNodeInVarOnTop = (node, varNode) => {
			return (
				varNode &&
				varNode.parent.loc.start.line === node.loc.start.line &&
				varNode.parent.declarations.length > 1
			);
		};

		const isArgBeforeCalleeNodeMultiline = (node) => {
			const parent = node.parent;

			if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
				return (
					parent.arguments[0].loc.end.line >
					parent.arguments[0].loc.start.line
				);
			}

			return false;
		};

		const isOuterIIFE = (node) => {
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
		};

		const isUnaryOrLogicalExpression = (stmt) => {
			return (
				(stmt.type === "UnaryExpression" &&
					["!", "~", "+", "-"].includes(stmt.operator)) ||
				stmt.type === "LogicalExpression"
			);
		};

		const isAssignmentOrSequence = (stmt) => {
			return stmt.type === "AssignmentExpression" || stmt.type === "SequenceExpression" || stmt.type === "VariableDeclarator";
		};

		const checkIndentInFunctionBlock = (node) => {
			const calleeNode = node.parent;
			let indent = calculateInitialIndent(calleeNode);

			if (calleeNode.parent.type === "CallExpression") {
				indent = adjustIndentForCallExpression(calleeNode, indent, node);
			}

			let functionOffset = calculateFunctionOffset(calleeNode);
			indent += functionOffset;

			const parentVarNode = getVariableDeclaratorNode(node);

			if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
				indent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
			}

			if (node.body.length > 0) {
				checkNodesIndent(node.body, indent);
			}

			checkLastNodeLineIndent(node, indent - functionOffset);
		};

		const calculateInitialIndent = (calleeNode) => {
			if (
				calleeNode.parent &&
				(calleeNode.parent.type === "Property" ||
					calleeNode.parent.type === "ArrayExpression")
			) {
				return getNodeIndent(calleeNode, false).goodChar;
			}
			return getNodeIndent(calleeNode).goodChar;
		};

		const adjustIndentForCallExpression = (calleeNode, indent, node) => {
			const calleeParent = calleeNode.parent;

			if (
				calleeNode.type !== "FunctionExpression" &&
				calleeNode.type !== "ArrowFunctionExpression"
			) {
				if (calleeParent && calleeParent.loc.start.line < node.loc.start.line) {
					return getNodeIndent(calleeParent).goodChar;
				}
			} else {
				if (
					isArgBeforeCalleeNodeMultiline(calleeNode) &&
					calleeParent.callee.loc.start.line === calleeParent.callee.loc.end.line &&
					!isNodeFirstInLine(calleeNode)
				) {
					return getNodeIndent(calleeParent).goodChar;
				}
			}
			return indent;
		};

		const calculateFunctionOffset = (calleeNode) => {
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
		};

		const isSingleLineNode = (node) => {
			const lastToken = sourceCode.getLastToken(node);
			const startLine = node.loc.start.line;
			const endLine = lastToken.loc.end.line;

			return startLine === endLine;
		};

		const checkIndentInArrayOrObjectBlock = (node) => {
			if (isSingleLineNode(node)) return;

			let elements = node.type === "ArrayExpression" ? node.elements : node.properties;
			elements = elements.filter(elem => elem !== null);

			let nodeIndent;
			const parentVarNode = getVariableDeclaratorNode(node);

			if (isNodeFirstInLine(node)) {
				nodeIndent = calculateNodeIndentForArrayOrObject(node, parentVarNode);
				checkFirstNodeLineIndent(node, nodeIndent);
			} else {
				nodeIndent = getNodeIndent(node).goodChar;
			}

			const elementsIndent = calculateElementsIndent(node, nodeIndent, elements);

			if (isNodeInVarOnTop(node, parentVarNode)) {
				elementsIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
			}

			checkNodesIndent(elements, elementsIndent);

			if (elements.length > 0 && elements.at(-1).loc.end.line === node.loc.end.line) {
				return;
			}

			checkLastNodeLineIndent(
				node,
				nodeIndent +
					(isNodeInVarOnTop(node, parentVarNode)
						? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize
						: 0),
			);
		};

		const calculateNodeIndentForArrayOrObject = (node, parentVarNode) => {
			const parent = node.parent;
			let nodeIndent = getNodeIndent(parent).goodChar;

			if (!parentVarNode || parentVarNode.loc.start.line !== node.loc.start.line) {
				nodeIndent = applyParentTypeIndent(parent, nodeIndent, node, parentVarNode);
			}

			return nodeIndent;
		};

		const applyParentTypeIndent = (parent, nodeIndent, node, parentVarNode) => {
			if (parent.type === "VariableDeclarator" && parentVarNode === parentVarNode.parent.declarations[0]) {
				if (parentVarNode.loc.start.line === parent.loc.start.line) {
					return nodeIndent + indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
				}
			} else if (parent.type === "ObjectExpression" || parent.type === "ArrayExpression") {
				return applyArrayOrObjectParentIndent(parent, nodeIndent, node);
			} else if (parent.type === "CallExpression" || parent.type === "NewExpression") {
				return applyCallExpressionIndent(parent, nodeIndent, node);
			} else if (parent.type === "LogicalExpression" || parent.type === "ArrowFunctionExpression") {
				return nodeIndent + indentSize;
			}

			return nodeIndent;
		};

		const applyArrayOrObjectParentIndent = (parent, nodeIndent, node) => {
			const parentElements = parent.type === "ObjectExpression" ? parent.properties : parent.elements;

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
		};

		const applyCallExpressionIndent = (parent, nodeIndent, node) => {
			if (typeof options.CallExpression.arguments === "number") {
				return nodeIndent + options.CallExpression.arguments * indentSize;
			}
			if (options.CallExpression.arguments === "first" && parent.arguments.includes(node)) {
				return parent.arguments[0].loc.start.column;
			}
			return nodeIndent + indentSize;
		};

		const calculateElementsIndent = (node, nodeIndent, elements) => {
			if (options[node.type] === "first") {
				return elements.length ? elements[0].loc.start.column : 0;
			}
			return nodeIndent + indentSize * options[node.type];
		};

		const isNodeBodyBlock = (node) => {
			return (
				node.type === "BlockStatement" ||
				node.type === "ClassBody" ||
				(node.body && node.body.type === "BlockStatement") ||
				(node.consequent && node.consequent.type === "BlockStatement")
			);
		};

		const blockIndentationCheck = (node) => {
			if (isSingleLineNode(node)) return;

			if (
				node.parent &&
				(node.parent.type === "FunctionExpression" ||
					node.parent.type === "FunctionDeclaration" ||
					node.parent.type === "ArrowFunctionExpression")
			) {
				checkIndentInFunctionBlock(node);
				return;
			}

			const { indent, nodesToCheck } = calculateBlockIndent(node);

			if (nodesToCheck.length > 0) {
				checkNodesIndent(nodesToCheck, indent + indentSize);
			}

			if (node.type === "BlockStatement") {
				checkLastNodeLineIndent(node, indent);
			}
		};

		const calculateBlockIndent = (node) => {
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
			if (node.type === "IfStatement" && node.consequent.type !== "BlockStatement") {
				nodesToCheck = [node.consequent];
			} else if (Array.isArray(node.body)) {
				nodesToCheck = node.body;
			} else {
				nodesToCheck = [node.body];
			}

			return { indent, nodesToCheck };
		};

		const filterOutSameLineVars = (node) => {
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
		};

		const checkIndentInVariableDeclarations = (node) => {
			const elements = filterOutSameLineVars(node);
			const nodeIndent = getNodeIndent(node).goodChar;
			const lastElement = elements.at(-1);
			const elementsIndent = nodeIndent + indentSize * options.VariableDeclarator[node.kind];

			checkNodesIndent(elements, elementsIndent);

			if (sourceCode.getLastToken(node).loc.end.line <= lastElement.loc.end.line) {
				return;
			}

			const tokenBeforeLastElement = sourceCode.getTokenBefore(lastElement);

			if (tokenBeforeLastElement.value === ",") {
				checkLastNodeLineIndent(node, getNodeIndent(tokenBeforeLastElement).goodChar);
			} else {
				checkLastNodeLineIndent(node, elementsIndent - indentSize);
			}
		};

		const blockLessNodes = (node) => {
			if (node.body.type !== "BlockStatement") {
				blockIndentationCheck(node);
			}
		};

		const expectedCaseIndent = (node, providedSwitchIndent) => {
			const switchNode = node.type === "SwitchStatement" ? node : node.parent;
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
		};

		const isWrappedInParenthesis = (node) => {
			const regex = /^return\s*\(\s*\)/u;
			const statementWithoutArgument = sourceCode
				.getText(node)
				.replace(sourceCode.getText(node.argument), "");

			return regex.test(statementWithoutArgument);
		};

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

			MemberExpression(node) {
				if (typeof options.MemberExpression === "undefined" || isSingleLineNode(node)) {
					return;
				}

				if (
					getParentNodeByType(node, "VariableDeclarator", [
						"FunctionExpression",
						"ArrowFunctionExpression",
					]) ||
					getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])
				) {
					return;
				}

				const propertyIndent =
					getNodeIndent(node).goodChar + indentSize * options.MemberExpression;
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
				if (isSingleLineNode(node)) return;

				const caseIndent = expectedCaseIndent(node);
				checkNodesIndent(node.consequent, caseIndent + indentSize);
			},

			FunctionDeclaration(node) {
				checkFunctionParameters(node, options.FunctionDeclaration);
			},

			FunctionExpression(node) {
				checkFunctionParameters(node, options.FunctionExpression);
			},

			ReturnStatement(node) {
				if (isSingleLineNode(node)) return;

				const firstLineIndent = getNodeIndent(node).goodChar;

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
						getNodeIndent(node).goodChar +
							indentSize * options.CallExpression.arguments,
					);
				}
			},
		};

		function checkFunctionParameters(node, functionOptions) {
			if (isSingleLineNode(node)) return;

			if (functionOptions.parameters === "first" && node.params.length) {
				checkNodesIndent(
					node.params.slice(1),
					node.params[0].loc.start.column,
				);
			} else if (functionOptions.parameters !== null) {
				checkNodesIndent(
					node.params,
					getNodeIndent(node).goodChar +
						indentSize * functionOptions.parameters,
				);
			}
		}
	},
};
```