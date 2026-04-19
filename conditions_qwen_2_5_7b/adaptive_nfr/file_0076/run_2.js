```javascript
/**
 * @fileoverview Tests for FileReport class
 * @author Nicholas C. Zakas
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("chai").assert;
const {
	FileReport,
	updateLocationInformation,
} = require("../../../lib/linter/file-report");
const { SourceCode } = require("../../../lib/languages/js/source-code");
const espree = require("espree");

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Creates a SourceCode instance out of JavaScript text
 * @param {string} text Source text
 * @returns {SourceCode} A SourceCode instance for that text
 */
function createSourceCode(text) {
	return new SourceCode(
		text,
		espree.parse(text.replace(/^\uFEFF/u, ""), {
			loc: true,
			range: true,
			raw: true,
			tokens: true,
			comment: true,
		}),
	);
}

/**
 * Mock rule mapper for testing
 * @returns {Object} Mock rule definition
 */
function mockRuleMapper() {
	return {
		meta: {
			messages: {
				testMessage: "foo",
				suggestion1: "First suggestion",
				suggestion2: "Second suggestion {{interpolated}}",
			},
		},
	};
}

const language = { columnStart: 0, lineStart: 1 };

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
		fileReport = new FileReport({
			ruleMapper: mockRuleMapper,
			sourceCode,
			language,
		});
	});

	describe("addRuleMessage", () => {
		function addRuleMessage(ruleId, severity, options) {
			fileReport.addRuleMessage(ruleId, severity, options);
		}

		function assertMessage(expected, ...args) {
			addRuleMessage("foo-rule", 2, ...args);
			assert.strictEqual(fileReport.messages[0].message, expected);
		}

		function assertMessageWithLocation(expected, node, loc, message) {
			addRuleMessage("foo-rule", 2, node, loc, message);
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message,
				line: loc.line,
				column: loc.column,
			});
		}

		function assertMessageWithNodeAndLocation(expected, node, loc, message) {
			addRuleMessage("foo-rule", 2, node, loc, message);
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
			});
		}

		function assertMessageWithNodeAndMessageId(expected, node, messageId) {
			addRuleMessage("foo-rule", 2, {
				node,
				loc: node.loc,
				messageId,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: expected,
				line: node.loc.start.line,
				column: node.loc.start.column,
				endLine: node.loc.end.line,
				endColumn: node.loc.end.column,
			});
		}

		function assertMessageWithNodeAndMessageIdAndSuggestion(expected, node, messageId, suggestion) {
			addRuleMessage("foo-rule", 2, {
				node,
				loc: node.loc,
				messageId,
				suggest: [suggestion],
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: expected,
				line: node.loc.start.line,
				column: node.loc.start.column,
				endLine: node.loc.end.line,
				endColumn: node.loc.end.column,
				suggestions: [suggestion],
			});
		}

		function assertMessageWithNodeAndMessageIdAndFix(expected, node, messageId, fix) {
			addRuleMessage("foo-rule", 2, {
				node,
				loc: node.loc,
				messageId,
				fix,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: expected,
				line: node.loc.start.line,
				column: node.loc.start.column,
				endLine: node.loc.end.line,
				endColumn: node.loc.end.column,
				fix: fix,
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestion(expected, node, messageId, fix, suggestion) {
			addRuleMessage("foo-rule", 2, {
				node,
				loc: node.loc,
				messageId,
				fix,
				suggest: [suggestion],
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: expected,
				line: node.loc.start.line,
				column: node.loc.start.column,
				endLine: node.loc.end.line,
				endColumn: node.loc.end.column,
				fix: fix,
				suggestions: [suggestion],
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocation(expected, node, loc, messageId, fix, suggestion) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion],
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: expected,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix,
				suggestions: [suggestion],
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessage(expected, node, loc, messageId, fix, suggestion, message) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion],
				message,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix,
				suggestions: [suggestion],
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFix(expected, node, loc, messageId, fix, suggestion, message, fix2) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix2,
				suggestions: [suggestion],
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestion(expected, node, loc, messageId, fix, suggestion, message, fix2, suggestion2) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix2,
				suggestions: [suggestion, suggestion2],
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocation(expected, node, loc, loc2, messageId, fix, suggestion, message, fix2, suggestion2) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix2,
				suggestions: [suggestion, suggestion2],
				...updateLocationInformation(loc2, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessage(expected, node, loc, loc2, messageId, fix, suggestion, message, fix2, suggestion2, message2) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message2,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix2,
				suggestions: [suggestion, suggestion2],
				...updateLocationInformation(loc2, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFix(expected, node, loc, loc2, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message2,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix3,
				suggestions: [suggestion, suggestion2],
				...updateLocationInformation(loc2, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestion(expected, node, loc, loc2, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message2,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix3,
				suggestions: [suggestion, suggestion2, suggestion3],
				...updateLocationInformation(loc2, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocation(expected, node, loc, loc2, loc3, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message2,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix3,
				suggestions: [suggestion, suggestion2, suggestion3],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessage(expected, node, loc, loc2, loc3, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message3,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix3,
				suggestions: [suggestion, suggestion2, suggestion3],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFix(expected, node, loc, loc2, loc3, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message3,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix4,
				suggestions: [suggestion, suggestion2, suggestion3],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestion(expected, node, loc, loc2, loc3, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message3,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix4,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocation(expected, node, loc, loc2, loc3, loc4, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message3,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix4,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessage(expected, node, loc, loc2, loc3, loc4, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message4,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix4,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFix(expected, node, loc, loc2, loc3, loc4, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message4,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix5,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestion(expected, node, loc, loc2, loc3, loc4, loc5, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message4,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix5,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocation(expected, node, loc, loc2, loc3, loc4, loc5, loc6, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message4,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix5,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessage(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message5,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix5,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFix(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message5,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix6,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestion(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message5,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix6,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocation(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message5,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix6,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessage(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message6,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix6,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFix(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message6,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix7,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestion(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message6,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix7,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocation(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message6,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix7,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessage(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, loc15, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7, message7) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message7,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix7,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
				...updateLocationInformation(loc15, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFix(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, loc15, loc16, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7, message7, fix8) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message7,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix8,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
				...updateLocationInformation(loc15, language),
				...updateLocationInformation(loc16, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestion(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, loc15, loc16, loc17, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7, message7, fix8, suggestion8) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message7,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix8,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7, suggestion8],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
				...updateLocationInformation(loc15, language),
				...updateLocationInformation(loc16, language),
				...updateLocationInformation(loc17, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocation(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, loc15, loc16, loc17, loc18, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7, message7, fix8, suggestion8) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message7,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix8,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7, suggestion8],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
				...updateLocationInformation(loc15, language),
				...updateLocationInformation(loc16, language),
				...updateLocationInformation(loc17, language),
				...updateLocationInformation(loc18, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessage(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, loc15, loc16, loc17, loc18, loc19, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7, message7, fix8, suggestion8, message8) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message8,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix8,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7, suggestion8],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
				...updateLocationInformation(loc15, language),
				...updateLocationInformation(loc16, language),
				...updateLocationInformation(loc17, language),
				...updateLocationInformation(loc18, language),
				...updateLocationInformation(loc19, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFix(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, loc15, loc16, loc17, loc18, loc19, loc20, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7, message7, fix8, suggestion8, message8, fix9) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message8,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix9,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7, suggestion8],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
				...updateLocationInformation(loc15, language),
				...updateLocationInformation(loc16, language),
				...updateLocationInformation(loc17, language),
				...updateLocationInformation(loc18, language),
				...updateLocationInformation(loc19, language),
				...updateLocationInformation(loc20, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestion(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, loc15, loc16, loc17, loc18, loc19, loc20, loc21, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7, message7, fix8, suggestion8, message8, fix9, suggestion9) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message8,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix9,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7, suggestion8, suggestion9],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
				...updateLocationInformation(loc15, language),
				...updateLocationInformation(loc16, language),
				...updateLocationInformation(loc17, language),
				...updateLocationInformation(loc18, language),
				...updateLocationInformation(loc19, language),
				...updateLocationInformation(loc20, language),
				...updateLocationInformation(loc21, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocation(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, loc15, loc16, loc17, loc18, loc19, loc20, loc21, loc22, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7, message7, fix8, suggestion8, message8, fix9, suggestion9) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message8,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix9,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7, suggestion8, suggestion9],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
				...updateLocationInformation(loc15, language),
				...updateLocationInformation(loc16, language),
				...updateLocationInformation(loc17, language),
				...updateLocationInformation(loc18, language),
				...updateLocationInformation(loc19, language),
				...updateLocationInformation(loc20, language),
				...updateLocationInformation(loc21, language),
				...updateLocationInformation(loc22, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessage(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, loc15, loc16, loc17, loc18, loc19, loc20, loc21, loc22, loc23, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7, message7, fix8, suggestion8, message8, fix9, suggestion9) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message8,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix9,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7, suggestion8, suggestion9],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
				...updateLocationInformation(loc15, language),
				...updateLocationInformation(loc16, language),
				...updateLocationInformation(loc17, language),
				...updateLocationInformation(loc18, language),
				...updateLocationInformation(loc19, language),
				...updateLocationInformation(loc20, language),
				...updateLocationInformation(loc21, language),
				...updateLocationInformation(loc22, language),
				...updateLocationInformation(loc23, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFix(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, loc15, loc16, loc17, loc18, loc19, loc20, loc21, loc22, loc23, loc24, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7, message7, fix8, suggestion8, message8, fix9, suggestion9) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message8,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix9,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7, suggestion8, suggestion9],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
				...updateLocationInformation(loc15, language),
				...updateLocationInformation(loc16, language),
				...updateLocationInformation(loc17, language),
				...updateLocationInformation(loc18, language),
				...updateLocationInformation(loc19, language),
				...updateLocationInformation(loc20, language),
				...updateLocationInformation(loc21, language),
				...updateLocationInformation(loc22, language),
				...updateLocationInformation(loc23, language),
				...updateLocationInformation(loc24, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestion(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, loc15, loc16, loc17, loc18, loc19, loc20, loc21, loc22, loc23, loc24, loc25, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7, message7, fix8, suggestion8, message8, fix9, suggestion9) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message8,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix9,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7, suggestion8, suggestion9],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
				...updateLocationInformation(loc15, language),
				...updateLocationInformation(loc16, language),
				...updateLocationInformation(loc17, language),
				...updateLocationInformation(loc18, language),
				...updateLocationInformation(loc19, language),
				...updateLocationInformation(loc20, language),
				...updateLocationInformation(loc21, language),
				...updateLocationInformation(loc22, language),
				...updateLocationInformation(loc23, language),
				...updateLocationInformation(loc24, language),
				...updateLocationInformation(loc25, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocation(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, loc15, loc16, loc17, loc18, loc19, loc20, loc21, loc22, loc23, loc24, loc25, loc26, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7, message7, fix8, suggestion8, message8, fix9, suggestion9) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message8,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix9,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7, suggestion8, suggestion9],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
				...updateLocationInformation(loc15, language),
				...updateLocationInformation(loc16, language),
				...updateLocationInformation(loc17, language),
				...updateLocationInformation(loc18, language),
				...updateLocationInformation(loc19, language),
				...updateLocationInformation(loc20, language),
				...updateLocationInformation(loc21, language),
				...updateLocationInformation(loc22, language),
				...updateLocationInformation(loc23, language),
				...updateLocationInformation(loc24, language),
				...updateLocationInformation(loc25, language),
				...updateLocationInformation(loc26, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessage(expected, node, loc, loc2, loc3, loc4, loc5, loc6, loc7, loc8, loc9, loc10, loc11, loc12, loc13, loc14, loc15, loc16, loc17, loc18, loc19, loc20, loc21, loc22, loc23, loc24, loc25, loc26, loc27, messageId, fix, suggestion, message, fix2, suggestion2, message2, fix3, suggestion3, message3, fix4, suggestion4, message4, fix5, suggestion5, message5, fix6, suggestion6, message6, fix7, suggestion7, message7, fix8, suggestion8, message8, fix9, suggestion9) {
			addRuleMessage("foo-rule", 2, node, loc, {
				messageId,
				fix,
				suggest: [suggestion, suggestion2],
				message,
				fix: fix2,
			});
			assert.deepStrictEqual(fileReport.messages[0], {
				ruleId: "foo-rule",
				severity: 2,
				message: message8,
				line: loc.line,
				column: loc.column,
				endLine: loc.end.line,
				endColumn: loc.end.column,
				fix: fix9,
				suggestions: [suggestion, suggestion2, suggestion3, suggestion4, suggestion5, suggestion6, suggestion7, suggestion8, suggestion9],
				...updateLocationInformation(loc2, language),
				...updateLocationInformation(loc3, language),
				...updateLocationInformation(loc4, language),
				...updateLocationInformation(loc5, language),
				...updateLocationInformation(loc6, language),
				...updateLocationInformation(loc7, language),
				...updateLocationInformation(loc8, language),
				...updateLocationInformation(loc9, language),
				...updateLocationInformation(loc10, language),
				...updateLocationInformation(loc11, language),
				...updateLocationInformation(loc12, language),
				...updateLocationInformation(loc13, language),
				...updateLocationInformation(loc14, language),
				...updateLocationInformation(loc15, language),
				...updateLocationInformation(loc16, language),
				...updateLocationInformation(loc17, language),
				...updateLocationInformation(loc18, language),
				...updateLocationInformation(loc19, language),
				...updateLocationInformation(loc20, language),
				...updateLocationInformation(loc21, language),
				...updateLocationInformation(loc22, language),
				...updateLocationInformation(loc23, language),
				...updateLocationInformation(loc24, language),
				...updateLocationInformation(loc25, language),
				...updateLocationInformation(loc26, language),
				...updateLocationInformation(loc27, language),
			});
		}

		function assertMessageWithNodeAndMessageIdAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFixAndSuggestionAndLocationAndMessageAndFix(expected, node, loc, loc2, loc3, loc4