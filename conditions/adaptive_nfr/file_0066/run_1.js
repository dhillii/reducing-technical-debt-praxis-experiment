```javascript
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

		// ========== Configuration Parsing ==========

		const parseIndentConfig = () => {
			if (!context.options.length) return;

			if (context.options[0] === "tab") {
				indentSize = 1;
				indentType = "tab";
			} else if (typeof context.options[0] === "number") {
				indentSize = context.options[0];
				indentType = "space";
			}

			if (context.options[1]) {
				applyOptionsOverrides(context.options[1]);
			}
		};

		const applyOptionsOverrides = (opts) => {
			options.SwitchCase = opts.SwitchCase || 0;

			if (opts.VariableDeclarator) {
				applyVariableDeclaratorOptions(opts.VariableDeclarator);
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
		};

		const applyVariableDeclaratorOptions = (rules) => {
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

		parseIndentConfig();

		// ========== Utility Functions ==========

		const pluralize = (count, word) => `${word}${count === 1 ? "" : "s"}`;

		const createErrorMessageData = (expectedAmount, actualSpaces, actualTabs) => {
			const expectedStatement = `${expectedAmount} ${pluralize(expectedAmount, indentType)}`;
			const foundSpacesWord = pluralize(actualSpaces, "space");
			const foundTabsWord = pluralize(actualTabs, "tab");

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

		const isSingleLineNode = (node) => {
			const lastToken = sourceCode.getLastToken(node);
			return node.loc.start.line === lastToken.loc.end.line;
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

		const getVariableDeclaratorNode = (node) => getParentNodeByType(node, "VariableDeclarator");

		const isNodeInVarOnTop = (node, varNode) =>
			varNode &&
			varNode.parent.loc.start.line === node.loc.start.line &&
			varNode.parent.declarations.length > 1;

		const isArgBeforeCalleeNodeMultiline = (node) => {
			const parent = node.parent;
			if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
				return parent.arguments[0].loc.end.line > parent.arguments[0].loc.start.line;
			}
			return false;
		};

		const isOuterIIFE = (node) => {
			const parent = node.parent;
			let stmt = parent.parent;

			if (parent.type !== "CallExpression" || parent.callee !== node) {
				return false;
			}

			const unaryOperators = new Set(["!", "~", "+", "-"]);
			while (
				(stmt.type === "UnaryExpression" && unaryOperators.has(stmt.operator)) ||
				stmt.type === "AssignmentExpression" ||
				stmt.type === "LogicalExpression" ||
				stmt.type === "SequenceExpression" ||
				stmt.type === "VariableDeclarator"
			) {
				stmt = stmt.parent;
			}

			return (
				(stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
				stmt.parent &&
				stmt.parent.type === "Program"
			);
		};

		const isNodeBodyBlock = (node) =>
			node.type === "BlockStatement" ||
			node.type === "ClassBody" ||
			(node.body && node.body.type === "BlockStatement") ||
			(node.consequent && node.consequent.type === "BlockStatement");

		const isWrappedInParenthesis = (node) => {
			const regex = /^return\s*\(\s*\)/u;
			const statementWithoutArgument = sourceCode
				.getText(node)
				.replace(sourceCode.getText(node.argument), "");
			return regex.test(statementWithoutArgument);
		};

		const filterOutSameLineVars = (node) =>
			node.declarations.reduce((finalCollection, elem) => {
				const lastElem = finalCollection.at(-1);
				if (
					(elem.loc.start.line !== node.loc.start.line && !lastElem) ||
					(lastElem && lastElem.loc.start.line !== elem.loc.start.line)
				) {
					finalCollection.push(elem);
				}
				return finalCollection;
			}, []);

		// ========== Indent Checking Functions ==========

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