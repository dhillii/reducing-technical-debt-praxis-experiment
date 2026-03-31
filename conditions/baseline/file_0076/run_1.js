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
// Constants
//------------------------------------------------------------------------------

const LANGUAGE_CONFIG = { columnStart: 0, lineStart: 1 };

const PARSE_OPTIONS = {
	loc: true,
	range: true,
	raw: true,
	tokens: true,
	comment: true,
};

const MOCK_RULE_MESSAGES = {
	testMessage: "foo",
	suggestion1: "First suggestion",
	suggestion2: "Second suggestion {{interpolated}}",
};

//------------------------------------------------------------------------------
// Helpers
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
			messages: MOCK_RULE_MESSAGES,
		},
	};
}

function createTestLocation(sourceCode) {
	return sourceCode.ast.body[1].loc.start;
}

//------------------------------------------------------------------------------
// Test Helpers
//------------------------------------------------------------------------------

function createTestFixture() {
	const sourceCode = createSourceCode("foo\nbar");
	const node = sourceCode.ast.body[0];
	const location = createTestLocation(sourceCode);
	const fileReport = new FileReport({
		ruleMapper: createMockRuleMapper,
		sourceCode,
		language: LANGUAGE_CONFIG,
	});

	return { sourceCode, node, location, fileReport };
}

function assertMessageCount(fileReport, expected) {
	assert.strictEqual(fileReport.messages.length, expected);
}

function assertMessageContent(fileReport, expected) {
	assert.deepStrictEqual(fileReport.messages[0], expected);
}

function assertThrowsWithMessage(fn, errorPattern) {
	assert.throws(fn, errorPattern);
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("FileReport", () => {
	let sourceCode, node, location, fileReport, message;

	beforeEach(() => {
		const fixture = createTestFixture();
		sourceCode = fixture.sourceCode;
		node = fixture.node;
		location = fixture.location;
		fileReport = fixture.fileReport;
		message = "foo";
	});

	describe("addRuleMessage", () => {
		it("should add a message with a string message", () => {
			fileReport.addRuleMessage("foo-rule", 2, node, location, "foo", {});

			assertMessageCount(fileReport, 1);
			assertMessageContent(fileReport, {
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

			assertMessageCount(fileReport, 1);
			assertMessageContent(fileReport, {
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

			assertMessageCount(fileReport, 1);
			assertMessageContent(fileReport, {
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

			assertMessageCount(fileReport, 1);
			assertMessageContent(fileReport, {
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

			assertMessageCount(fileReport, 1);
			assert.deepStrictEqual(messageObject, fileReport.messages[0]);
			assert.strictEqual(messageObject.ruleId, "foo-rule");
			assert.strictEqual(messageObject.severity, 2);
			assert.strictEqual(messageObject.message, "foo");
		});

		it("should throw if both message and messageId are provided", () => {
			assertThrowsWithMessage(
				() => {
					fileReport.addRuleMessage("foo-rule", 2, {
						node,
						loc: location,
						message: "foo",
						messageId: "testMessage",
					});
				},
				/context\.report\(\) called with a message and a messageId/u,
			);

			assertMessageCount(fileReport, 0);
		});

		it("should throw when an invalid messageId is provided", () => {
			assertThrowsWithMessage(
				() => {
					fileReport.addRuleMessage("foo-rule", 2, {
						node,
						loc: location,
						messageId: "thisIsNotASpecifiedMessageId",
					});
				},
				/^context\.report\(\) called with a messageId of '[^']+' which is not present in the 'messages' config:/u,
			);

			assertMessageCount(fileReport, 0);
		});

		it("should throw when no message is provided", () => {
			assertThrowsWithMessage(
				() => {
					fileReport.addRuleMessage("foo-rule", 2, { node });
				},
				"Missing `message` property in report() call; add a message that describes the linting problem.",
			);

			assertMessageCount(fileReport, 0);
		});

		it("should throw when a suggestion defines both a desc and messageId", () => {
			assertThrowsWithMessage(
				() => {
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
				},
				"context.report() called with a suggest option that defines both a 'messageId' and an 'desc'. Please only pass one.",
			);

			assertMessageCount(fileReport, 0);
		});

		it("should throw when a suggestion uses an invalid messageId", () => {
			assertThrowsWithMessage(
				() => {
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
				},
				/^context\.report\(\) called with a suggest option with a messageId '[^']+' which is not present in the 'messages' config:/u,
			);

			assertMessageCount(fileReport, 0);
		});

		it("should throw when a suggestion does not provide either a desc or messageId", () => {
			assertThrowsWithMessage(
				() => {
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
				},
				"context.report() called with a suggest option that doesn't have either a `desc` or `messageId`",
			);

			assertMessageCount(fileReport, 0);
		});

		it("should throw when a suggestion does not provide a fix function", () => {
			assertThrowsWithMessage(
				() => {
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
				},
				/^context\.report\(\) called with a suggest option without a fix function. See:/u,
			);

			assertMessageCount(fileReport, 0);
		});
	});

	describe("addError", () => {
		it("should add an error message", () => {
			const loc = {
				start: { line: 1, column: 0 },
				end: { line: 1, column: 1 },
			};

			fileReport.addError({ message: "test error message", loc });

			assertMessageCount(fileReport, 1);
			assertMessageContent(fileReport, {
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

			assertMessageCount(fileReport, 1);
			assert.strictEqual(warning, fileReport.messages[0]);
			assertMessageContent(fileReport, {
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

			assertMessageCount(fileReport, 1);
			assert.strictEqual(fatal, fileReport.messages[0]);
			assertMessageContent(fileReport, {
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

			assertMessageCount(fileReport, 1);
			assertMessageContent(fileReport, {
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

			assertMessageCount(fileReport, 1);
			assertMessageContent(fileReport, {
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

			assertMessageContent(fileReport, {
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

			fileReport.addRuleMessage("foo-rule", 2, reportDescriptor);

			assertMessageContent(fileReport, {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				messageId: "testMessage",
				line: 2,
				column: 1,
				fix: {
					range: [1, 2],
					text: "foo",
				},
			});
		});

		it("should throw when both messageId and message are provided", () => {
			const reportDescriptor = {
				node,
				loc: location,
				messageId: "testMessage",
				message: "bar",
				fix: () => ({ range: [1, 2], text: "foo" }),
			};

			assertThrowsWithMessage(
				() => fileReport.addRuleMessage("foo-rule", 2, reportDescriptor),
				"context.report() called with a message and a messageId. Please only pass one.",
			);
		});

		it("should throw when an invalid messageId is provided", () => {
			const reportDescriptor = {
				node,
				loc: location,
				messageId: "thisIsNotASpecifiedMessageId",
				fix: () => ({ range: [1, 2], text: "foo" }),