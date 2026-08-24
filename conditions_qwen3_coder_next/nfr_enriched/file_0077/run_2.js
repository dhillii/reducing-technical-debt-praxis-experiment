/**
 * Asserts that a given function is called at least once during a test
 * @param {Function} func The function that must be called at least once
 * @returns {Function} A wrapper around the same function
 */
function mustCall(func) {
	callCounts.set(func, 0);
	return function Wrapper(...args) {
		callCounts.set(func, callCounts.get(func) + 1);

		return func.call(this, ...args);
	};
}

/**
 * Verifies that a specific node type in the given code is either inside or outside a loop.
 * @param {string} code JavaScript code containing the target node.
 * @param {string} nodeType The AST node type to locate and inspect.
 * @param {boolean} expectedInLoop Whether the located node is expected to be inside a loop.
 * @returns {void}
 */
function assertNodeTypeInLoop(code, nodeType, expectedInLoop) {
	const results = [];

	linter.verify(code, {
		plugins: {
			test: {
				rules: {
					checker: {
						create: mustCall(() => ({
							[nodeType]: mustCall(node => {
								results.push(astUtils.isInLoop(node));
							}),
						})),
					},
				},
			},
		},
		rules: { "test/checker": "error" },
	});

	assert.lengthOf(results, 1);
	assert.strictEqual(results[0], expectedInLoop);
}