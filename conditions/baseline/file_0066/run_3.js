```javascript
"use strict";

const astUtils = require("./utils/ast-utils");

const DEFAULT_VARIABLE_INDENT = 1;
const DEFAULT_PARAMETER_INDENT = null;
const DEFAULT_FUNCTION_BODY_INDENT = 1;

const DEFAULT_OPTIONS = {
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

const STATEMENTS_WITH_PROPERTIES = [
	"IfStatement",
	"WhileStatement",
	"ForStatement",
	"ForInStatement",
	"ForOfStatement",
	"DoWhileStatement",
	"ClassDeclaration",
	"TryStatement",
];

const UNARY_OPERATORS = new Set(["!", "~", "+", "-"]);

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
		let indentType = "space";
		let indentSize = 4;
		const options = { ...DEFAULT_OPTIONS };
		const sourceCode = context.sourceCode;
		const caseIndentStore = {};

		const parseOptions = () => {
			if (!context.options.length) return;

			if (context.options[0] === "tab") {
				indentSize = 1;
				indentType = "tab";
			} else if (typeof context.options[0] === "number") {
				indentSize = context.options[0];
				indentType = "space";
			}

			if (context.options[1]) {
				mergeUserOptions(context.options[1]);
			}
		};

		const mergeUserOptions = (userOptions) => {
			options.SwitchCase = userOptions.SwitchCase || 0;

			if (userOptions.VariableDeclarator) {
				mergeVariableDeclaratorOptions(userOptions.VariableDeclarator);
			}

			if (typeof userOptions.outerIIFEBody === "number") {
				options.outerIIFEBody = userOptions.outerIIFEBody;
			}

			if (typeof userOptions.MemberExpression === "number") {
				options.MemberExpression = userOptions.MemberExpression;
			}

			["FunctionDeclaration", "FunctionExpression", "CallExpression"].forEach(
				(key) => {
					if (typeof userOptions[key] === "object") {
						Object.assign(options[key], userOptions[key]);
					}
				},
			);

			if (
				typeof userOptions.ArrayExpression === "number" ||
				typeof userOptions.ArrayExpression === "string"
			) {
				options.ArrayExpression = userOptions.ArrayExpression;
			}

			if (
				typeof userOptions.ObjectExpression === "number" ||
				typeof userOptions.ObjectExpression === "string"
			) {
				options.ObjectExpression = userOptions.ObjectExpression;
			}
		};

		const mergeVariableDeclaratorOptions = (varDeclOptions) => {
			if (typeof varDeclOptions === "number") {
				options.VariableDeclarator = {
					var: varDeclOptions,
					let: varDeclOptions,
					const: varDeclOptions,
				};
			} else if (typeof varDeclOptions === "object") {
				Object.assign(options.VariableDeclarator, varDeclOptions);
			}
		};

		const pluralize = (count, word) =>
			`${count} ${word}${count === 1 ? "" : "s"}`;

		const createErrorMessageData = (expectedAmount, actualSpaces, actualTabs) => {
			const expectedStatement = pluralize(expectedAmount, indentType);
			const foundSpacesWord = pluralize(actualSpaces, "space");
			const foundTabsWord = pluralize(actualTabs, "tab");

			let foundStatement;
			if (actualSpaces > 0 && actualTabs > 0) {
				foundStatement = `${foundSpacesWord} and ${foundTabsWord}`;
			} else if (actualSpaces > 0) {
				foundStatement =
					indentType === "space" ? actualSpaces : foundSpacesWord;
			} else if (actualTabs > 0) {
				foundStatement =
					indentType === "tab" ? actualTabs : foundTabsWord;
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
				fix: (fixer) => fixer.replaceTextRange(textRange, desiredIndent),
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
				srcCharsBeforeNode.findIndex(
					(char) => char !== " " && char !== "\t",
				),
			);
			const spaces = indentChars.filter((char) => char === " ").length;
			const tabs = indentChars.filter((char) => char === "\t").length;

			return {
				space: spaces,
				tab: tabs,
				goodChar: indentType === "space" ? spaces : tabs,
				badChar: indentType === "space" ? tabs : spaces,
			};
		};

		const isNodeFirstInLine = (node, byEndLocation) => {
			const firstToken = byEndLocation
				? sourceCode.getLastToken(node, 1)
				: sourceCode.getTokenBefore(node);
			const startLine = byEndLocation ? node.loc.end.line : node.loc.start.line;
			const endLine = firstToken ? firstToken.loc.end.line : -1;

			return startLine !== endLine;
		};

		const checkNodeIndent = (node, neededIndent) => {
			const actualIndent = getNodeIndent(node, false);

			if (
				!["ArrayExpression", "ObjectExpression"].includes(node.type) &&
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
		};

		const checkNodesIndent = (nodes, indent) => {
			nodes.forEach((node) => checkNodeIndent(node, indent));
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

		const getVariableDeclaratorNode = (node) =>
			getParentNodeByType(node, "VariableDeclarator");

		const isNodeInVarOnTop = (node, varNode) =>
			varNode &&
			varNode.parent.loc.start.line === node.loc.start.line &&
			varNode.parent.declarations.length > 1;

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
			if (parent.type !== "CallExpression" || parent.callee !== node) {
				return false;
			}

			let stmt = parent.parent;
			while (
				(stmt.type === "UnaryExpression" &&
					UNARY_OPERATORS.has(stmt.operator)) ||
				["Ass