```javascript
"use strict";

const assert = require("chai").assert;
const {
	FileReport,
	updateLocationInformation,
} = require("../../../lib/linter/file-report");
const { SourceCode } = require("../../../lib/languages/js/source-code");
const espree = require("espree");

//------------------------------------------------------------------------------
// Test Fixtures
//------------------------------------------------------------------------------

const PARSE_OPTIONS = {
	loc: true,
	range: true,
	raw: true,
	tokens: true,
	comment: true,
};

const LANGUAGE_CONFIG = { columnStart: 0, lineStart: 1 };

const RULE_MESSAGES = {
	testMessage: "foo",
	suggestion1: "First suggestion",
	suggestion2: "Second suggestion {{interpolated}}",
};

//------------------------------------------------------------------------------
// Helper Functions
//------------------------------------------------------------------------------

function createSourceCode(text) {
	return new SourceCode(
		text,
		espree.parse(text.replace(/^\uFEFF/u, ""), PARSE_OPTIONS),
	);
}

function createMockRuleMapper() {
	return {
		meta: {
			messages: RULE_MESSAGES,
		},
	};
}

function createFileReport(sourceCode) {
	return new FileReport({
		ruleMapper: createMockRuleMapper,
		sourceCode,
		language: LANGUAGE_CONFIG,
	});
}

//------------------------------------------------------------------------------
// Test Helpers
//------------------------------------------------------------------------------

class MessageAssertions {
	constructor(fileReport) {
		this.fileReport = fileReport;
	}

	assertMessageCount(expected) {
		assert.strictEqual(this.fileReport.messages.length, expected);
		return this;
	}

	assertMessage(expected) {
		assert.deepStrictEqual(this.fileReport.messages[0], expected);
		return this;
	}

	assertMessageProperty(property, expected) {
		assert.strictEqual(this.fileReport.messages[0][property], expected);
		return this;
	}
}

class FixAssertions {
	constructor(fileReport) {
		this.fileReport = fileReport;
	}

	assertFixDeepEqual(expected) {
		assert.deepStrictEqual(this.fileReport.messages[0].fix, expected);
		return this;
	}

	assertFixNotStrictEqual(notExpected) {
		assert.notStrictEqual(this.fileReport.messages[0].fix, notExpected);
		assert.notStrictEqual(
			this.fileReport.messages[0].fix.range,
			notExpected.range,
		);
		return this;
	}

	assertSuggestionFixDeepEqual(index, expected) {
		assert.deepStrictEqual(
			this.fileReport.messages[0].suggestions[index].fix,
			expected,
		);
		return this;
	}

	assertSuggestionFixNotStrictEqual(index, notExpected) {
		assert.notStrictEqual(
			this.fileReport.messages[0].suggestions[index].fix,
			notExpected,
		);
		assert.notStrictEqual(
			this.fileReport.messages[0].suggestions[index].fix.range,
			notExpected.range,
		);
		return this;
	}
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("FileReport", () => {
	let sourceCode, node, location, fileReport, message;

	beforeEach(() => {
		sourceCode = createSourceCode("foo\nbar");
		node = sourceCode.ast.body[0];
		location = sourceCode.ast.body[1].loc.start;
		message = "foo";
		fileReport = createFileReport(sourceCode);
	});

	describe("addRuleMessage", () => {
		it("should add a message with a string message", () => {
			fileReport.addRuleMessage("foo-rule", 2, node, location, "foo", {});

			new MessageAssertions(fileReport)
				.assertMessageCount(1)
				.assertMessage({
					ruleId: "foo-rule",
					severity: 2,
					message: "foo",
					line: 2,
					column: 1,
				});
		});

		it("should add a message with messageId", () => {
			fileReport.addRuleMessage("foo-rule", 2, {
				node,
				loc: location,
				messageId: "testMessage",
			});

			new MessageAssertions(fileReport)
				.assertMessageCount(1)
				.assertMessage({
					ruleId: "foo-rule",
					severity: 2,
					message: "foo",
					messageId: "testMessage",
					line: 2,
					column: 1,
				});
		});

		it("should add a message with suggestions", () => {
			fileReport.addRuleMessage("foo-rule", 2, {
				node,
				loc: location,
				message: "foo",
				suggest: [
					{
						messageId: "suggestion1",
						fix: () => ({ range: [2, 3], text: "s1" }),
					},
					{
						messageId: "suggestion2",
						data: { interpolated: "'interpolated value'" },
						fix: () => ({ range: [3, 4], text: "s2" }),
					},
				],
			});

			new MessageAssertions(fileReport)
				.assertMessageCount(1)
				.assertMessage({
					ruleId: "foo-rule",
					severity: 2,
					message: "foo",
					line: 2,
					column: 1,
					suggestions: [
						{
							messageId: "suggestion1",
							desc: "First suggestion",
							fix: { range: [2, 3], text: "s1" },
						},
						{
							messageId: "suggestion2",
							data: { interpolated: "'interpolated value'" },
							desc: "Second suggestion 'interpolated value'",
							fix: { range: [3, 4], text: "s2" },
						},
					],
				});
		});

		it("should add a message with a fix", () => {
			fileReport.addRuleMessage("foo-rule", 2, {
				node,
				loc: location,
				message: "foo",
				fix: () => ({ range: [1, 2], text: "foo" }),
			});

			new MessageAssertions(fileReport)
				.assertMessageCount(1)
				.assertMessage({
					ruleId: "foo-rule",
					severity: 2,
					message: "foo",
					line: 2,
					column: 1,
					fix: { range: [1, 2], text: "foo" },
				});
		});

		it("should return the lint message object", () => {
			const messageObject = fileReport.addRuleMessage("foo-rule", 2, {
				node,
				loc: location,
				message: "foo",
				fix: () => ({ range: [1, 2], text: "foo" }),
			});

			new MessageAssertions(fileReport).assertMessageCount(1);
			assert.deepStrictEqual(messageObject, fileReport.messages[0]);
			new MessageAssertions(fileReport)
				.assertMessageProperty("ruleId", "foo-rule")
				.assertMessageProperty("severity", 2)
				.assertMessageProperty("message", "foo");
		});

		it("should throw if both message and messageId are provided", () => {
			assert.throws(() => {
				fileReport.addRuleMessage("foo-rule", 2, {
					node,
					loc: location,
					message: "foo",
					messageId: "testMessage",
				});
			}, /context\.report\(\) called with a message and a messageId/u);

			new MessageAssertions(fileReport).assertMessageCount(0);
		});

		it("should throw when an invalid messageId is provided", () => {
			assert.throws(() => {
				fileReport.addRuleMessage("foo-rule", 2, {
					node,
					loc: location,
					messageId: "thisIsNotASpecifiedMessageId",
				});
			}, /^context\.report\(\) called with a messageId of '[^']+' which is not present in the 'messages' config:/u);

			new MessageAssertions(fileReport).assertMessageCount(0);
		});

		it("should throw when no message is provided", () => {
			assert.throws(() => {
				fileReport.addRuleMessage("foo-rule", 2, { node });
			}, "Missing `message` property in report() call; add a message that describes the linting problem.");

			new MessageAssertions(fileReport).assertMessageCount(0);
		});

		it("should throw when a suggestion defines both a desc and messageId", () => {
			assert.throws(() => {
				fileReport.addRuleMessage("foo-rule", 2, {
					node,
					loc: location,
					message: "foo",
					suggest: [
						{
							desc: "The description",
							messageId: "suggestion1",
							fix: () => ({ range: [2, 3], text: "s1" }),
						},
					],
				});
			}, "context.report() called with a suggest option that defines both a 'messageId' and an 'desc'. Please only pass one.");

			new MessageAssertions(fileReport).assertMessageCount(0);
		});

		it("should throw when a suggestion uses an invalid messageId", () => {
			assert.throws(() => {
				fileReport.addRuleMessage("foo-rule", 2, {
					node,
					loc: location,
					message: "foo",
					suggest: [
						{
							messageId: "noMatchingMessage",
							fix: () => ({ range: [2, 3], text: "s1" }),
						},
					],
				});
			}, /^context\.report\(\) called with a suggest option with a messageId '[^']+' which is not present in the 'messages' config:/u);

			new MessageAssertions(fileReport).assertMessageCount(0);
		});

		it("should throw when a suggestion does not provide either a desc or messageId", () => {
			assert.throws(() => {
				fileReport.addRuleMessage("foo-rule", 2, {
					node,
					loc: location,
					message: "foo",
					suggest: [
						{
							fix: () => ({ range: [2, 3], text: "s1" }),
						},
					],
				});
			}, "context.report() called with a suggest option that doesn't have either a `desc` or `messageId`");

			new MessageAssertions(fileReport).assertMessageCount(0);
		});

		it("should throw when a suggestion does not provide a fix function", () => {
			assert.throws(() => {
				fileReport.addRuleMessage("foo-rule", 2, {
					node,
					loc: location,
					message: "foo",
					suggest: [
						{
							desc: "The description",
							fix: false,
						},
					],
				});
			}, /^context\.report\(\) called with a suggest option without a fix function. See:/u);

			new MessageAssertions(fileReport).assertMessageCount(0);
		});
	});

	describe("addError", () => {
		it("should add an error message", () => {
			const loc = {
				start: { line: 1, column: 0 },
				end: { line: 1, column: 1 },
			};

			fileReport.addError({
				message: "test error message",
				loc,
			});

			new MessageAssertions(fileReport)
				.assertMessageCount(1)
				.assertMessage({
					ruleId: null,
					severity: 2,
					message: "test error message",
					line: 1,
					column: 1,
					endLine: 1,
					endColumn: 2,
				});
		});
	});

	describe("addWarning", () => {
		it("should add a warning message", () => {
			const loc = {
				start: { line: 1, column: 0 },
				end: { line: 1, column: 1 },
			};

			const warning = fileReport.addWarning({
				message: "test warning message",
				loc,
			});

			new MessageAssertions(fileReport).assertMessageCount(1);
			assert.strictEqual(warning, fileReport.messages[0]);
			assert.deepStrictEqual(warning, {
				ruleId: null,
				severity: 1,
				message: "test warning message",
				line: 1,
				column: 1,
				endLine: 1,
				endColumn: 2,
			});
		});
	});

	describe("addFatal", () => {
		it("should add a fatal error message", () => {
			const loc = {
				start: { line: 1, column: 0 },
				end: { line: 1, column: 1 },
			};

			const fatal = fileReport.addFatal({
				message: "test fatal message",
				loc,
			});

			new MessageAssertions(fileReport).assertMessageCount(1);
			assert.strictEqual(fatal, fileReport.messages[0]);
			assert.deepStrictEqual(fatal, {
				ruleId: null,
				severity: 2,
				fatal: true,
				message: "test fatal message",
				line: 1,
				column: 1,
				endLine: 1,
				endColumn: 2,
			});
		});
	});

	describe("old-style call with location", () => {
		it("should extract the location correctly", () => {
			fileReport.addRuleMessage(
				"foo-rule",
				2,
				node,
				location,
				message,
				{},
			);

			new MessageAssertions(fileReport)
				.assertMessageCount(1)
				.assertMessage({
					ruleId: "foo-rule",
					severity: 2,
					message,
					line: 2,
					column: 1,
				});
		});
	});

	describe("old-style call without location", () => {
		it("should use the start location and end location of the node", () => {
			fileReport.addRuleMessage("foo-rule", 2, node, message, {});

			new MessageAssertions(fileReport)
				.assertMessageCount(1)
				.assertMessage({
					ruleId: "foo-rule",
					severity: 2,
					message,
					line: 1,
					column: 1,
					endLine: 1,
					endColumn: 4,
				});
		});
	});

	describe("new-style call with all options", () => {
		it("should include the new-style options in the report", () => {
			const reportDescriptor = {
				node,
				loc: location,
				message,
				fix: () => ({ range: [1, 2], text: "foo" }),
				suggest: [
					{
						desc: "suggestion 1",
						fix: () => ({ range: [2, 3], text: "s1" }),
					},
					{
						desc: "suggestion 2",
						fix: () => ({ range: [3, 4], text: "s2" }),
					},
				],
			};

			fileReport.addRuleMessage("foo-rule", 2, reportDescriptor);

			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message,
				line: 2,
				column: 1,
				fix: {
					range: [1, 2],
					text: "foo",
				},
				suggestions: [
					{
						desc: "suggestion 1",
						fix: { range: [2, 3], text: "s1" },
					},
					{
						desc: "suggestion 2",
						fix: { range: [3, 4], text: "s2" },
					},
				],
			});
		});

		it("should translate the messageId into a message", () => {
			const reportDescriptor = {
				node,
				loc: location,
				messageId: "testMessage",
				fix: () => ({ range: [1, 2], text: "foo" }),
			};

			fileReport.addRuleMessage("foo