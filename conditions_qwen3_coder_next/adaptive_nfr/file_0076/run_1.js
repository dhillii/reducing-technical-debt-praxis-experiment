* @param  {...any} args The arguments to pass to `addRuleMessage`.
		 * @returns {void}
		 */
		function assertMessage(expected, ...args) {
			fileReport.addRuleMessage("foo-rule", 2, ...args);
			assert.strictEqual(fileReport.messages[0].message, expected);
		}

		it("should correctly parse a message when being passed all options in an old-style report", () => {
			fileReport.addRuleMessage(
				"foo-rule",
				2,
				node,
				node.loc.end,
				"hello {{dynamic}}",
				{
					dynamic: node.type,
				},
			);

			assert.deepStrictEqual(fileReport.messages[0], {
				severity: 2,
				ruleId: "foo-rule",
				message: "hello ExpressionStatement",
				line: 1,
				column: 4,
			});
		});

		it("should correctly parse a message when being passed all options in a new-style report", () => {
			fileReport.addRuleMessage("foo-rule", 2, {
				node,
				loc: node.loc.end,
				message: "hello {{dynamic}}",
				data: { dynamic: node.type },
			});

			assert.deepStrictEqual(fileReport.messages[0], {
				severity: 2,
				ruleId: "foo-rule",
				message: "hello ExpressionStatement",
				line: 1,
				column: 4,
			});
		});

		it("should correctly parse a message with object keys as numbers", () => {
			assertMessage(
				"my message testing!",
				node,
				"my message {{name}}{{0}}",
				{
					0: "!",
					name: "testing",
				},
			);
		});

		it("should correctly parse a message with array", () => {
			assertMessage(
				"my message testing!",
				node,
				"my message {{1}}{{0}}",
				["!", "testing"],
			);
		});

		it("should allow template parameter with inner whitespace", () => {
			assertMessage("message yay!", node, "message {{parameter name}}", {
				"parameter name": "yay!",
			});
		});

		it("should allow template parameter with non-identifier characters", () => {
			assertMessage("message yay!", node, "message {{parameter-name}}", {
				"parameter-name": "yay!",
			});
		});

		it("should allow template parameter wrapped in braces", () => {
			assertMessage("message {yay!}", node, "message {{{param}}}", {
				param: "yay!",
			});
		});

		it("should ignore template parameter with no specified value", () => {
			assertMessage(
				"message {{parameter}}",
				node,
				"message {{parameter}}",
				{},
			);
		});

		it("should handle leading whitespace in template parameter", () => {
			assertMessage("message yay!", node, "message {{ parameter}}", {
				parameter: "yay!",
			});
		});

		it("should handle trailing whitespace in template parameter", () => {
			assertMessage("message yay!", node, "message {{parameter }}", {
				parameter: "yay!",
			});
		});

		it("should still allow inner whitespace as well as leading/trailing", () => {
			assertMessage(
				"message yay!",
				node,
				"message {{ parameter name }}",
				{ "parameter name": "yay!" },
			);
		});

		it("should still allow non-identifier characters as well as leading/trailing whitespace", () => {
			assertMessage(
				"message yay!",
				node,
				"message {{ parameter-name }}",
				{ "parameter-name": "yay!" },
			);
		});
	});

	/**
	 * Asserts that a message is correctly formatted.
	 * @param {string} expected The expected message.
	 * @param  {...any} args The arguments to pass to `addRuleMessage`.
	 * @returns {void}
	 */
	function assertMessage(expected, ...args) {
		fileReport.addRuleMessage("foo-rule", 2, ...args);
		assert.strictEqual(fileReport.messages[0].message, expected);
	}