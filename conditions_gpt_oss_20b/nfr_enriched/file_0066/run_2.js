"use strict";

const astUtils = require("./utils/ast-utils");

class IndentHelper {
	constructor(context, sourceCode, options, indentSize, indentType) {
		this.context = context;
		this.sourceCode = sourceCode;
		this.options = options;
		this.indentSize = indentSize;
		this.indentType = indentType;
		this.caseIndentStore = {};
	}

	createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
		const expectedStatement = `${expectedAmount} ${this.indentType}${expectedAmount === 1 ? "" : "s"}`;
		const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
		const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`;
		let foundStatement;

		if (actualSpaces > 0 && actualTabs > 0) {
			foundStatement = `${actualSpaces} ${foundSpacesWord} and ${actualTabs} ${foundTabsWord}`;
		} else if (actualSpaces > 0) {
			foundStatement =
				this.indentType === "space"
					? actualSpaces
					: `${actualSpaces} ${foundSpacesWord}`;
		} else if (actualTabs > 0) {
			foundStatement =
				this.indentType === "tab"
					? actualTabs
					: `${actualTabs} ${foundTabsWord}`;
		} else {
			foundStatement = "0";
		}
		return { expected: expectedStatement, actual: foundStatement };
	}

	report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
		if (gottenSpaces && gottenTabs) {
			return;
		}
		const desiredIndent =
			(this.indentType === "space" ? " " : "\t").repeat(needed);
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
		this.context.report({
			node,
			loc,
			messageId: "expected",
			data: this.createErrorMessageData(needed, gottenSpaces, gottenTabs),
			fix: fixer => fixer.replaceTextRange(textRange, desiredIndent),
		});
	}

	getNodeIndent(node, byLastLine = false) {
		const token = byLastLine
			? this.sourceCode.getLastToken(node)
			: this.sourceCode.getFirstToken(node);
		const srcCharsBeforeNode = this.sourceCode
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
			goodChar: this.indentType === "space" ? spaces : tabs,
			badChar: this.indentType === "space" ? tabs : spaces,
		};
	}

	isNodeFirstInLine(node, byEndLocation = false) {
		const firstToken =
			byEndLocation === true
				? this.sourceCode.getLastToken(node, 1)
				: this.sourceCode.getTokenBefore(node);
		const startLine =
			byEndLocation === true
				? node.loc.end.line
				: node.loc.start.line;
		const endLine = firstToken ? firstToken.loc.end.line : -1;
		return startLine !== endLine;
	}

	checkNodeIndent(node, neededIndent) {
		const actualIndent = this.getNodeIndent(node, false);
		if (
			node.type !== "ArrayExpression" &&
			node.type !== "ObjectExpression" &&
			(actualIndent.goodChar !== neededIndent ||
				actualIndent.badChar !== 0) &&
			this.isNodeFirstInLine(node)
		) {
			this.report(
				node,
				neededIndent,
				actualIndent.space,
				actualIndent.tab,
			);
		}
		if (node.type === "IfStatement" && node.alternate) {
			const elseToken = this.sourceCode.getTokenBefore(node.alternate);
			this.checkNodeIndent(elseToken, neededIndent);
			if (!this.isNodeFirstInLine(node.alternate)) {
				this.checkNodeIndent(node.alternate, neededIndent);
			}
		}
		if (node.type === "TryStatement" && node.handler) {
			const catchToken = this.sourceCode.getFirstToken(node.handler);
			this.checkNodeIndent(catchToken, neededIndent);
		}
		if (node.type === "TryStatement" && node.finalizer) {
			const finallyToken = this.sourceCode.getTokenBefore(node.finalizer);
			this.checkNodeIndent(finallyToken, neededIndent);
		}
		if (node.type === "DoWhileStatement") {
			const whileToken = this.sourceCode.getTokenAfter(node.body);
			this.checkNodeIndent(whileToken, neededIndent);
		}
	}

	checkNodesIndent(nodes, indent) {
		nodes.forEach(node => this.checkNodeIndent(node, indent));
	}

	checkLastNodeLineIndent(node, lastLineIndent) {
		const lastToken = this.sourceCode.getLastToken(node);
		const endIndent = this.getNodeIndent(lastToken, true);
		if (
			(endIndent.goodChar !== lastLineIndent ||
				endIndent.badChar !== 0) &&
			this.isNodeFirstInLine(node, true)
		) {
			this.report(
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

	checkLastReturnStatementLineIndent(node, firstLineIndent) {
		const lastToken = this.sourceCode.getLastToken(
			node,
			astUtils.isClosingParenToken,
		);
		const textBeforeClosingParenthesis = this.sourceCode
			.getText(lastToken, lastToken.loc.start.column)
			.slice(0, -1);
		if (textBeforeClosingParenthesis.trim()) {
			return;
		}
		const endIndent = this.getNodeIndent(lastToken, true);
		if (endIndent.goodChar !== firstLineIndent) {
			this.report(
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

	checkFirstNodeLineIndent(node, firstLineIndent) {
		const startIndent = this.getNodeIndent(node, false);
		if (
			(startIndent.goodChar !== firstLineIndent ||
				startIndent.badChar !== 0) &&
			this.isNodeFirstInLine(node)
		) {
			this.report(
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

	getParentNodeByType(node, type, stopAtList) {
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

	getVariableDeclaratorNode(node) {
		return this.getParentNodeByType(node, "VariableDeclarator");
	}

	isNodeInVarOnTop(node, varNode) {
		return (
			varNode &&
			varNode.parent.loc.start.line === node.loc.start.line &&
			varNode.parent.declarations.length > 1
		);
	}

	isArgBeforeCalleeNodeMultiline(node) {
		const parent = node.parent;
		if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
			return (
				parent.arguments[0].loc.end.line >
				parent.arguments[0].loc.start.line
			);
		}
		return false;
	}

	isOuterIIFE(node) {
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

	checkIndentInFunctionBlock(node) {
		const calleeNode = node.parent;
		let indent;
		if (
			calleeNode.parent &&
			(calleeNode.parent.type === "Property" ||
				calleeNode.parent.type === "ArrayExpression")
		) {
			indent = this.getNodeIndent(calleeNode, false).goodChar;
		} else {
			indent = this.getNodeIndent(calleeNode).goodChar;
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
					indent = this.getNodeIndent(calleeParent).goodChar;
				}
			} else {
				if (
					this.isArgBeforeCalleeNodeMultiline(calleeNode) &&
					calleeParent.callee.loc.start.line ===
						calleeParent.callee.loc.end.line &&
					!this.isNodeFirstInLine(calleeNode)
				) {
					indent = this.getNodeIndent(calleeParent).goodChar;
				}
			}
		}
		let functionOffset = this.indentSize;
		if (this.options.outerIIFEBody !== null && this.isOuterIIFE(calleeNode)) {
			functionOffset = this.options.outerIIFEBody * this.indentSize;
		} else if (calleeNode.type === "FunctionExpression") {
			functionOffset = this.options.FunctionExpression.body * this.indentSize;
		} else if (calleeNode.type === "FunctionDeclaration") {
			functionOffset = this.options.FunctionDeclaration.body * this.indentSize;
		}
		indent += functionOffset;
		const parentVarNode = this.getVariableDeclaratorNode(node);
		if (parentVarNode && this.isNodeInVarOnTop(node, parentVarNode)) {
			indent +=
				this.indentSize *
				this.options.VariableDeclarator[parentVarNode.parent.kind];
		}
		if (node.body.length > 0) {
			this.checkNodesIndent(node.body, indent);
		}
		this.checkLastNodeLineIndent(node, indent - functionOffset);
	}

	isSingleLineNode(node) {
		const lastToken = this.sourceCode.getLastToken(node);
		const startLine = node.loc.start.line;
		const endLine = lastToken.loc.end.line;
		return startLine === endLine;
	}

	checkIndentInArrayOrObjectBlock(node) {
		if (this.isSingleLineNode(node)) {
			return;
		}
		let elements =
			node.type === "ArrayExpression"
				? node.elements
				: node.properties;
		elements = elements.filter(elem => elem !== null);
		let nodeIndent;
		let elementsIndent;
		const parentVarNode = this.getVariableDeclaratorNode(node);
		if (this.isNodeFirstInLine(node)) {
			const parent = node.parent;
			nodeIndent = this.getNodeIndent(parent).goodChar;
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
							this.indentSize *
							this.options.VariableDeclarator[
								parentVarNode.parent.kind
							];
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
							parentElements[0].loc.start.line ===
								parent.loc.start.line &&
							parentElements[0].loc.end.line !==
								parent.loc.start.line
						) {
							// no change
						} else if (
							typeof this.options[parent.type] === "number"
						) {
							nodeIndent +=
								this.options[parent.type] * this.indentSize;
						} else {
							nodeIndent = parentElements[0].loc.start.column;
						}
					} else if (
						parent.type === "CallExpression" ||
						parent.type === "NewExpression"
					) {
						if (
							typeof this.options.CallExpression.arguments ===
							"number"
						) {
							nodeIndent +=
								this.options.CallExpression.arguments *
								this.indentSize;
						} else if (
							this.options.CallExpression.arguments === "first"
						) {
							if (parent.arguments.includes(node)) {
								nodeIndent =
									parent.arguments[0].loc.start.column;
							}
						} else {
							nodeIndent += this.indentSize;
						}
					} else if (
						parent.type === "LogicalExpression" ||
						parent.type === "ArrowFunctionExpression"
					) {
						nodeIndent += this.indentSize;
					}
				}
			}
			this.checkFirstNodeLineIndent(node, nodeIndent);
		} else {
			nodeIndent = this.getNodeIndent(node).goodChar;
		}
		if (this.options[node.type] === "first") {
			elementsIndent = elements.length
				? elements[0].loc.start.column
				: 0;
		} else {
			elementsIndent = nodeIndent + this.indentSize * this.options[node.type];
		}
		if (this.isNodeInVarOnTop(node, parentVarNode)) {
			elementsIndent +=
				this.indentSize *
				this.options.VariableDeclarator[parentVarNode.parent.kind];
		}
		this.checkNodesIndent(elements, elementsIndent);
		if (elements.length > 0) {
			if (elements.at(-1).loc.end.line === node.loc.end.line) {
				return;
			}
		}
		this.checkLastNodeLineIndent(
			node,
			nodeIndent +
				(this.isNodeInVarOnTop(node, parentVarNode)
					? this.options.VariableDeclarator[
							parentVarNode.parent.kind
						] * this.indentSize
					: 0),
		);
	}

	isNodeBodyBlock(node) {
		return (
			node.type === "BlockStatement" ||
			node.type === "ClassBody" ||
			(node.body && node.body.type === "BlockStatement") ||
			(node.consequent && node.consequent.type === "BlockStatement")
		);
	}

	blockIndentationCheck(node) {
		if (this.isSingleLineNode(node)) {
			return;
		}
		if (
			node.parent &&
			(node.parent.type === "FunctionExpression" ||
				node.parent.type === "FunctionDeclaration" ||
				node.parent.type === "ArrowFunctionExpression")
		) {
			this.checkIndentInFunctionBlock(node);
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
			this.isNodeBodyBlock(node)
		) {
			indent = this.getNodeIndent(node.parent).goodChar;
		} else if (node.parent && node.parent.type === "CatchClause") {
			indent = this.getNodeIndent(node.parent.parent).goodChar;
		} else {
			indent = this.getNodeIndent(node).goodChar;
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
			this.checkNodesIndent(nodesToCheck, indent + this.indentSize);
		}
		if (node.type === "BlockStatement") {
			this.checkLastNodeLineIndent(node, indent);
		}
	}

	filterOutSameLineVars(node) {
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

	checkIndentInVariableDeclarations(node) {
		const elements = this.filterOutSameLineVars(node);
		const nodeIndent = this.getNodeIndent(node).goodChar;
		const lastElement = elements.at(-1);
		const elementsIndent =
			nodeIndent + this.indentSize * this.options.VariableDeclarator[node.kind];
		this.checkNodesIndent(elements, elementsIndent);
		if (
			this.sourceCode.getLastToken(node).loc.end.line <=
			lastElement.loc.end.line
		) {
			return;
		}
		const tokenBeforeLastElement = this.sourceCode.getTokenBefore(lastElement);
		if (tokenBeforeLastElement.value === ",") {
			this.checkLastNodeLineIndent(
				node,
				this.getNodeIndent(tokenBeforeLastElement).goodChar,
			);
		} else {
			this.checkLastNodeLineIndent(node, elementsIndent - this.indentSize);
		}
	}

	blockLessNodes(node) {
		if (node.body.type !== "BlockStatement") {
			this.blockIndentationCheck(node);
		}
	}

	expectedCaseIndent(node, providedSwitchIndent) {
		const switchNode =
			node.type === "SwitchStatement" ? node : node.parent;
		const switchIndent =
			typeof providedSwitchIndent === "undefined"
				? this.getNodeIndent(switchNode).goodChar
				: providedSwitchIndent;
		let caseIndent;
		if (this.caseIndentStore[switchNode.loc.start.line]) {
			return this.caseIndentStore[switchNode.loc.start.line];
		}
		if (switchNode.cases.length > 0 && this.options.SwitchCase === 0) {
			caseIndent = switchIndent;
		} else {
			caseIndent = switchIndent + this.indentSize * this.options.SwitchCase;
		}
		this.caseIndentStore[switchNode.loc.start.line] = caseIndent;
		return caseIndent;
	}

	isWrappedInParenthesis(node) {
		const regex = /^return\s*\(\s*\)/u;
		const statementWithoutArgument = this.sourceCode
			.getText(node)
			.replace(this.sourceCode.getText(node.argument), "");
		return regex.test(statementWithoutArgument);
	}
}

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
					Object.assign(
						options.VariableDeclarator,
						variableDeclaratorRules,
					);
				}
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
		const helper = new IndentHelper(
			context,
			sourceCode,
			options,
			indentSize,
		indentType,
		);
		return {
			Program(node) {
				if (node.body.length > 0) {
					helper.checkNodesIndent(
						node.body,
						helper.getNodeIndent(node).goodChar,
					);
				}
			},
			ClassBody: helper.blockIndentationCheck.bind(helper),
			BlockStatement: helper.blockIndentationCheck.bind(helper),
			WhileStatement: helper.blockLessNodes.bind(helper),
			ForStatement: helper.blockLessNodes.bind(helper),
			ForInStatement: helper.blockLessNodes.bind(helper),
			ForOfStatement: helper.blockLessNodes.bind(helper),
			DoWhileStatement: helper.blockLessNodes.bind(helper),
			IfStatement(node) {
				if (
					node.consequent.type !== "BlockStatement" &&
					node.consequent.loc.start.line > node.loc.start.line
				) {
					helper.blockIndentationCheck(node);
				}
			},
			VariableDeclaration(node) {
				if (
					node.declarations.at(-1).loc.start.line >
					node.declarations[0].loc.start.line
				) {
					helper.checkIndentInVariableDeclarations(node);
				}
			},
			ObjectExpression: helper.checkIndentInArrayOrObjectBlock.bind(helper),
			ArrayExpression: helper.checkIndentInArrayOrObjectBlock.bind(helper),
			MemberExpression(node) {
				if (typeof options.MemberExpression === "undefined") {
					return;
				}
				if (helper.isSingleLineNode(node)) {
					return;
				}
				if (
					helper.getParentNodeByType(node, "VariableDeclarator", [
						"FunctionExpression",
						"ArrowFunctionExpression",
					])
				) {
					return;
				}
				if (
					helper.getParentNodeByType(node, "AssignmentExpression", [
						"FunctionExpression",
					])
				) {
					return;
				}
				const propertyIndent =
					helper.getNodeIndent(node).goodChar +
					indentSize * options.MemberExpression;
				const checkNodes = [node.property];
				const dot = sourceCode.getTokenBefore(node.property);
				if (dot.type === "Punctuator" && dot.value === ".") {
					checkNodes.push(dot);
				}
				helper.checkNodesIndent(checkNodes, propertyIndent);
			},
			SwitchStatement(node) {
				const switchIndent = helper.getNodeIndent(node).goodChar;
				const caseIndent = helper.expectedCaseIndent(node, switchIndent);
				helper.checkNodesIndent(node.cases, caseIndent);
				helper.checkLastNodeLineIndent(node, switchIndent);
			},
			SwitchCase(node) {
				if (helper.isSingleLineNode(node)) {
					return;
				}
				const caseIndent = helper.expectedCaseIndent(node);
				helper.checkNodesIndent(node.consequent, caseIndent + indentSize);
			},
			FunctionDeclaration(node) {
				if (helper.isSingleLineNode(node)) {
					return;
				}
				if (
					options.FunctionDeclaration.parameters === "first" &&
					node.params.length
				) {
					helper.checkNodesIndent(
						node.params.slice(1),
						node.params[0].loc.start.column,
					);
				} else if (options.FunctionDeclaration.parameters !== null) {
					helper.checkNodesIndent(
						node.params,
						helper.getNodeIndent(node).goodChar +
							indentSize *
							options.FunctionDeclaration.parameters,
					);
				}
			},
			FunctionExpression(node) {
				if (helper.isSingleLineNode(node)) {
					return;
				}
				if (
					options.FunctionExpression.parameters === "first" &&
					node.params.length
				) {
					helper.checkNodesIndent(
						node.params.slice(1),
						node.params[0].loc.start.column,
					);
				} else if (options.FunctionExpression.parameters !== null) {
					helper.checkNodesIndent(
						node.params,
						helper.getNodeIndent(node).goodChar +
							indentSize *
							options.FunctionExpression.parameters,
					);
				}
			},
			ReturnStatement(node) {
				if (helper.isSingleLineNode(node)) {
					return;
				}
				const firstLineIndent = helper.getNodeIndent(node).goodChar;
				if (helper.isWrappedInParenthesis(node)) {
					helper.checkLastReturnStatementLineIndent(
						node,
						firstLineIndent,
					);
				} else {
					helper.checkNodeIndent(node, firstLineIndent);
				}
			},
			CallExpression(node) {
				if (helper.isSingleLineNode(node)) {
					return;
				}
				if (
					options.CallExpression.arguments === "first" &&
					node.arguments.length
				) {
					helper.checkNodesIndent(
						node.arguments.slice(1),
						node.arguments[0].loc.start.column,
					);
				} else if (options.CallExpression.arguments !== null) {
					helper.checkNodesIndent(
						node.arguments,
						helper.getNodeIndent(node).goodChar +
							indentSize *
							options.CallExpression.arguments,
					);
				}
			},
		};
	},
};