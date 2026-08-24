*      node is in a loop.
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

		/**
		 * Verifies the given code with the linter and collects results from a specific node type handler.
		 * @param {string} code The code to verify.
		 * @param {string} nodeType The type of node to observe.
		 * @param {Function} handler The handler function to call for each matching node.
		 * @returns {void}
		 */
		function verifyCodeWithNodeHandler(code, nodeType, handler) {
			linter.verify(code, {
				plugins: {
					test: {
						rules: {
							checker: {
								create: mustCall(() => ({
									[nodeType]: mustCall(handler),
								})),
							},
						},
					},
				},
				rules: { "test/checker": "error" },
			});
		}

		/**
		 * Asserts that the unique node of the given type in the code is either
		 * in a loop or not in a loop.
		 * @param {string} code the code to check.
		 * @param {string} nodeType the type of the node to consider. The code
		 *      must have exactly one node of this type.
		 * @param {boolean} expectedInLoop the expected result for whether the
		 *      node is in a loop.
		 * @returns {void}
		 */
		function assertNodeTypeInLoop(code, nodeType, expectedInLoop) {
			const results = [];

			verifyCodeWithNodeHandler(
				code,
				nodeType,
				node => results.push(astUtils.isInLoop(node)),
			);

			assert.lengthOf(results, 1);
			assert.strictEqual(results[0], expectedInLoop);
		}