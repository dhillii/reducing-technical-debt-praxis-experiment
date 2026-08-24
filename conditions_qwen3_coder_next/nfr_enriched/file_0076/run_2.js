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