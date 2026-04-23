/**
 * Assert `sourceCode.getDeclaredVariables(node)` is valid.
 * @param {string} code A code to check.
 * @param {string} type A type string of ASTNode. This method checks variables on the node of the type.
 * @param {Array<Array<string>>} expectedNamesList An array of expected variable names. The expected variable names is an array of string.
 * @returns {void}
 */
function verify(code, type, expectedNamesList) {
	const nodeTypes = [
		"Program",
		"EmptyStatement",
		"BlockStatement",
		"ExpressionStatement",
		"LabeledStatement",
		"BreakStatement",
		"ContinueStatement",
		"WithStatement",
		"SwitchStatement",
		"ReturnStatement",
		"ThrowStatement",
		"TryStatement",
		"WhileStatement",
		"DoWhileStatement",
		"ForStatement",
		"ForInStatement",
		"DebuggerStatement",
		"ThisExpression",
		"ArrayExpression",
		"ObjectExpression",
		"Property",
		"SequenceExpression",
		"UnaryExpression",
		"BinaryExpression",
		"AssignmentExpression",
		"UpdateExpression",
		"LogicalExpression",
		"ConditionalExpression",
		"CallExpression",
		"NewExpression",
		"MemberExpression",
		"SwitchCase",
		"Identifier",
		"Literal",
		"ForOfStatement",
		"ArrowFunctionExpression",
		"YieldExpression",
		"TemplateLiteral",
		"TaggedTemplateExpression",
		"TemplateElement",
		"ObjectPattern",
		"ArrayPattern",
		"RestElement",
		"AssignmentPattern",
		"ClassBody",
		"MethodDefinition",
		"MetaProperty",
	];

	linter.verify(code, {
		plugins: {
			test: {
				rules: {
					checker: {
						create(context) {
							const sourceCode = context.sourceCode;

							/** Assert `sourceCode.getDeclaredVariables(node)` is empty. */
							function checkEmpty(node) {
								assert.strictEqual(
									0,
									sourceCode.getDeclaredVariables(node).length,
								);
							}

							// Build a rule object that applies `checkEmpty` to all node types.
							const rule = {};
							nodeTypes.forEach(name => {
								rule[name] = checkEmpty;
							});

							// Specific handler for the node type under test.
							rule[type] = function (node) {
								const expectedNames = expectedNamesList.shift();
								const variables = sourceCode.getDeclaredVariables(node);

								assert(Array.isArray(expectedNames));
								assert(Array.isArray(variables));
								assert.strictEqual(expectedNames.length, variables.length);

								variables.forEach((v, i) => {
									assert.strictEqual(expectedNames[i], v.name);
								});
							};

							return rule;
						},
					},
				},
			},
		},
		rules: { "test/checker": 2 },
	});
	// Ensure all expected names were asserted.
	assert.strictEqual(0, expectedNamesList.length);
}