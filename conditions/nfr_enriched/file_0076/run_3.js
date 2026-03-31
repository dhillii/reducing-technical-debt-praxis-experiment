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
// Test Fixtures
//------------------------------------------------------------------------------

class TestFixture {
	constructor() {
		this.sourceCode = createSourceCode("foo\nbar");
		this.node = this.sourceCode.ast.body[0];
		this.location = createTestLocation(this.sourceCode);
		this.message = "foo";
		this.fileReport = new FileReport({
			ruleMapper: createMockRuleMapper,
			sourceCode: this.sourceCode,
			language: LANGUAGE_CONFIG,
		});
	}
}

//------------------------------------------------------------------------------
// Test Suites
//------------------------------------------------------------------------------

describe("FileReport", () => {
	let fixture;

	beforeEach(() => {
		fixture = new TestFixture();
	});

	describe("addRuleMessage", () => {
		it("should add a message with a string message", () => {
			fixture.fileReport.addRuleMessage(
				"foo-rule",
				2,
				fixture.node,
				fixture.location,
				"foo",
				{},
			);

			assert.strictEqual(fixture.fileReport.messages.length, 1);
			assert.deepStrictEqual(fixture.fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
			});
		});

		it("should add a message with messageId", () => {
			fixture.fileReport.addRuleMessage("foo-rule", 2, {
				node: fixture.node,
				loc: fixture.location,
				messageId: "testMessage",
			});

			assert.strictEqual(fixture.fileReport.messages.length, 1);
			assert.deepStrictEqual(fixture.fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				messageId: "testMessage",
				line: 2,
				column: 1,
			});
		});

		it("should add a message with suggestions", () => {
			fixture.fileReport.addRuleMessage("foo-rule", 2, {
				node: fixture.node,
				loc: fixture.location,
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

			assert.strictEqual(fixture.fileReport.messages.length, 1);
			assert.deepStrictEqual(fixture.fileReport.messages[0], {
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
			fixture.fileReport.addRuleMessage("foo-rule", 2, {
				node: fixture.node,
				loc: fixture.location,
				message: "foo",
				fix: () => ({ range: [1, 2], text: "foo" }),
			});

			assert.strictEqual(fixture.fileReport.messages.length, 1);
			assert.deepStrictEqual(fixture.fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: "foo",
				line: 2,
				column: 1,
				fix: { range: [1, 2], text: "foo" },
			});
		});

		it("should return the lint message object", () => {
			const messageObject = fixture.fileReport.addRuleMessage(
				"foo-rule",
				2,
				{
					node: fixture.node,
					loc: fixture.location,
					message: "foo",
					fix: () => ({ range: [1, 2], text: "foo" }),
				},
			);

			assert.strictEqual(fixture.fileReport.messages.length, 1);
			assert.deepStrictEqual(messageObject, fixture.fileReport.messages[0]);
			assert.strictEqual(messageObject.ruleId, "foo-rule");
			assert.strictEqual(messageObject.severity, 2);
			assert.strictEqual(messageObject.message, "foo");
		});

		it("should throw if both message and messageId are provided", () => {
			assert.throws(() => {
				fixture.fileReport.addRuleMessage("foo-rule", 2, {
					node: fixture.node,
					loc: fixture.location,
					message: "foo",
					messageId: "testMessage",
				});
			}, /context\.report\(\) called with a message and a messageId/u);

			assert.strictEqual(fixture.fileReport.messages.length, 0);
		});

		it("should throw when an invalid messageId is provided", () => {
			assert.throws(() => {
				fixture.fileReport.addRuleMessage("foo-rule", 2, {
					node: fixture.node,
					loc: fixture.location,
					messageId: "thisIsNotASpecifiedMessageId",
				});
			}, /^context\.report\(\) called with a messageId of '[^']+' which is not present in the 'messages' config:/u);

			assert.strictEqual(fixture.fileReport.messages.length, 0);
		});

		it("should throw when no message is provided", () => {
			assert.throws(() => {
				fixture.fileReport.addRuleMessage("foo-rule", 2, {
					node: fixture.node,
				});
			}, "Missing `message` property in report() call; add a message that describes the linting problem.");

			assert.strictEqual(fixture.fileReport.messages.length, 0);
		});

		it("should throw when a suggestion defines both a desc and messageId", () => {
			assert.throws(() => {
				fixture.fileReport.addRuleMessage("foo-rule", 2, {
					node: fixture.node,
					loc: fixture.location,
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

			assert.strictEqual(fixture.fileReport.messages.length, 0);
		});

		it("should throw when a suggestion uses an invalid messageId", () => {
			assert.throws(() => {
				fixture.fileReport.addRuleMessage("foo-rule", 2, {
					node: fixture.node,
					loc: fixture.location,
					message: "foo",
					suggest: [
						{
							messageId: "noMatchingMessage",
							fix: () => ({ range: [2, 3], text: "s1" }),
						},
					],
				});
			}, /^context\.report\(\) called with a suggest option with a messageId '[^']+' which is not present in the 'messages' config:/u);

			assert.strictEqual(fixture.fileReport.messages.length, 0);
		});

		it("should throw when a suggestion does not provide either a desc or messageId", () => {
			assert.throws(() => {
				fixture.fileReport.addRuleMessage("foo-rule", 2, {
					node: fixture.node,
					loc: fixture.location,
					message: "foo",
					suggest: [
						{
							fix: () => ({ range: [2, 3], text: "s1" }),
						},
					],
				});
			}, "context.report() called with a suggest option that doesn't have either a `desc` or `messageId`");

			assert.strictEqual(fixture.fileReport.messages.length, 0);
		});

		it("should throw when a suggestion does not provide a fix function", () => {
			assert.throws(() => {
				fixture.fileReport.addRuleMessage("foo-rule", 2, {
					node: fixture.node,
					loc: fixture.location,
					message: "foo",
					suggest: [
						{
							desc: "The description",
							fix: false,
						},
					],
				});
			}, /^context\.report\(\) called with a suggest option without a fix function. See:/u);

			assert.strictEqual(fixture.fileReport.messages.length, 0);
		});
	});

	describe("addError", () => {
		it("should add an error message", () => {
			const loc = {
				start: { line: 1, column: 0 },
				end: { line: 1, column: 1 },
			};

			fixture.fileReport.addError({
				message: "test error message",
				loc,
			});

			assert.strictEqual(fixture.fileReport.messages.length, 1);
			assert.deepStrictEqual(fixture.fileReport.messages[0], {
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

			const warning = fixture.fileReport.addWarning({
				message: "test warning message",
				loc,
			});

			assert.strictEqual(fixture.fileReport.messages.length, 1);
			assert.strictEqual(warning, fixture.fileReport.messages[0]);
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

			const fatal = fixture.fileReport.addFatal({
				message: "test fatal message",
				loc,
			});

			assert.strictEqual(fixture.fileReport.messages.length, 1);
			assert.strictEqual(fatal, fixture.fileReport.messages[0]);
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
			fixture.fileReport.addRuleMessage(
				"foo-rule",
				2,
				fixture.node,
				fixture.location,
				fixture.message,
				{},
			);

			assert.strictEqual(fixture.fileReport.messages.length, 1);
			assert.deepStrictEqual(fixture.fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: fixture.message,
				line: 2,
				column: 1,
			});
		});
	});

	describe("old-style call without location", () => {
		it("should use the start location and end location of the node", () => {
			fixture.fileReport.addRuleMessage(
				"foo-rule",
				2,
				fixture.node,
				fixture.message,
				{},
			);

			assert.strictEqual(fixture.fileReport.messages.length, 1);
			assert.deepStrictEqual(fixture.fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: fixture.message,
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
				node: fixture.node,
				loc: fixture.location,
				message: fixture.message,
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

			fixture.fileReport.addRuleMessage("foo-rule", 2, reportDescriptor);

			assert.deepStrictEqual(fixture.fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: fixture.message,
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
				node: fixture.node,
				loc: fixture.location,
				messageId: "testMessage",
				fix: () => ({ range: [1, 2], text: "foo" }),
			};

			fixture.fileReport.addRuleMessage("foo-rule", 2, reportDescriptor);

			assert.deepStrictEqual(fixture.fileReport.messages[0], {
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

		it("should throw when both