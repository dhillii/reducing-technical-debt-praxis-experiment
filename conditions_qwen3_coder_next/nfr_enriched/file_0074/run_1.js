const DEFAULT_CONFIG = {
	ecmaVersion: 6,
	comment: true,
	tokens: true,
	range: true,
	loc: true,
};
const linter = new Linter({ configType: "flat" });
const AST = espree.parse("let foo = bar;", DEFAULT_CONFIG),
	TEST_CODE = "var answer = 6 * 7;",
	SHEBANG_TEST_CODE = `#!/usr/bin/env node\n${TEST_CODE}`;
const filename = "foo.js";

/**
 * Helper to verify expected variable declarations in a given code snippet.
 * @param {string} code The code to verify.
 * @param {string} type The AST node type to check.
 * @param {string[][]} expectedNamesList List of expected variable names per node.
 * @returns {void}
 */
function verify(code, type, expectedNamesList) {
	linter.verify(code, {
		plugins: {
			test: {
				rules: {
					checker: {
						create(context) {
							const sourceCode = context.sourceCode;

							function checkEmpty(node) {
								assert.strictEqual(
									0,
									sourceCode.getDeclaredVariables(node).length,
								);
							}

							const rule = {
								Program: checkEmpty,
								EmptyStatement: checkEmpty,
								BlockStatement: checkEmpty,
								ExpressionStatement: checkEmpty,
								LabeledStatement: checkEmpty,
								BreakStatement: checkEmpty,
								ContinueStatement: checkEmpty,
								WithStatement: checkEmpty,
								SwitchStatement: checkEmpty,
								ReturnStatement: checkEmpty,
								ThrowStatement: checkEmpty,
								TryStatement: checkEmpty,
								WhileStatement: checkEmpty,
								DoWhileStatement: checkEmpty,
								ForStatement: checkEmpty,
								ForInStatement: checkEmpty,
								DebuggerStatement: checkEmpty,
								ThisExpression: checkEmpty,
								ArrayExpression: checkEmpty,
								ObjectExpression: checkEmpty,
								Property: checkEmpty,
								SequenceExpression: checkEmpty,
								UnaryExpression: checkEmpty,
								BinaryExpression: checkEmpty,
								AssignmentExpression: checkEmpty,
								UpdateExpression: checkEmpty,
								LogicalExpression: checkEmpty,
								ConditionalExpression: checkEmpty,
								CallExpression: checkEmpty,
								NewExpression: checkEmpty,
								MemberExpression: checkEmpty,
								SwitchCase: checkEmpty,
								Identifier: checkEmpty,
								Literal: checkEmpty,
								ForOfStatement: checkEmpty,
								ArrowFunctionExpression: checkEmpty,
								YieldExpression: checkEmpty,
								TemplateLiteral: checkEmpty,
								TaggedTemplateExpression: checkEmpty,
								TemplateElement: checkEmpty,
								ObjectPattern: checkEmpty,
								ArrayPattern: checkEmpty,
								RestElement: checkEmpty,
								AssignmentPattern: checkEmpty,
								ClassBody: checkEmpty,
								MethodDefinition: checkEmpty,
								MetaProperty: checkEmpty,
							};

							rule[type] = function (node) {
								const expectedNames = expectedNamesList.shift();
								const variables =
									sourceCode.getDeclaredVariables(node);

								assert(Array.isArray(expectedNames));
								assert(Array.isArray(variables));
								assert.strictEqual(
									expectedNames.length,
									variables.length,
								);
								for (let i = variables.length - 1; i >= 0; i--) {
									assert.strictEqual(
										expectedNames[i],
										variables[i].name,
									);
								}
							};
							return rule;
						},
					},
				},
			},
		},
		rules: { "test/checker": 2 },
	});

	assert.strictEqual(0, expectedNamesList.length);
}