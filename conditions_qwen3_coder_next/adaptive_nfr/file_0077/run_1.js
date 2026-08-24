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
		 * Verifies code using the linter and collects isInLoop results for a specific node type.
		 * @param {string} code The source code to verify.
		 * @param {string} nodeType The type of node to check.
		 * @returns {Array} Array of isInLoop results for matching nodes.
		 */
		function collectIsInLoopResults(code, nodeType) {
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

			return results;
		}

		/**
		 * Asserts that exactly one result exists and matches the expected value.
		 * @param {Array} results Array of results from verification.
		 * @param {boolean} expectedInLoop Expected boolean result.
		 * @returns {void}
		 */
		function assertSingleResultEquals(results, expectedInLoop) {
			assert.lengthOf(results, 1);
			assert.strictEqual(results[0], expectedInLoop);
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
			const results = collectIsInLoopResults(code, nodeType);
			assertSingleResultEquals(results, expectedInLoop);
		}