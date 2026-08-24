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