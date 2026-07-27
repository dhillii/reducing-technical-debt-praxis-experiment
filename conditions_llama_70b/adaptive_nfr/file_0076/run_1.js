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

/**
 * Asserts that a message is correctly formatted.
 * @param {string} expected The expected message.
 * @param  {...any} args The arguments to pass to `addRuleMessage`.
 * @returns {void}
 */
function assertMessage(expected, ...args) {
  addRuleMessageToReport("foo-rule", 2, ...args);
  assert.strictEqual(fileReport.messages[0].message, expected);
}

/**
 * Adds a rule message to the report.
 * @param {string} ruleId The rule ID.
 * @param {number} severity The severity of the message.
 * @param  {...any} args The arguments to pass to `addRuleMessage`.
 * @returns {void}
 */
function addRuleMessageToReport(ruleId, severity, ...args) {
  fileReport.addRuleMessage(ruleId, severity, ...args);
}

/**
 * Validates the location information.
 * @param {Object} loc The location information.
 * @param {Object} lang The language information.
 * @returns {Object} The updated location information.
 */
function validateLocationInformation(loc, lang) {
  return updateLocationInformation(loc, lang);
}

/**
 * Validates the fix information.
 * @param {Object} fix The fix information.
 * @returns {Object} The updated fix information.
 */
function validateFixInformation(fix) {
  if (fix.range && fix.range.length !== 2) {
    throw new Error("Fix has invalid range");
  }
  return fix;
}

/**
 * Validates the suggestion information.
 * @param {Object} suggestion The suggestion information.
 * @returns {Object} The updated suggestion information.
 */
function validateSuggestionInformation(suggestion) {
  if (suggestion.fix && suggestion.fix.range && suggestion.fix.range.length !== 2) {
    throw new Error("Fix has invalid range");
  }
  return suggestion;
}

/**
 * Adds an error message to the report.
 * @param {Object} error The error information.
 * @returns {void}
 */
function addErrorMessage(error) {
  fileReport.addError(error);
}

/**
 * Adds a warning message to the report.
 * @param {Object} warning The warning information.
 * @returns {void}
 */
function addWarningMessage(warning) {
  fileReport.addWarning(warning);
}

/**
 * Adds a fatal error message to the report.
 * @param {Object} fatal The fatal error information.
 * @returns {void}
 */
function addFatalMessage(fatal) {
  fileReport.addFatal(fatal);
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
    fileReport = new FileReport({
      ruleMapper: mockRuleMapper,
      sourceCode,
      language,
    });
  });

  describe("addRuleMessage", () => {
    it("should add a message with a string message", () => {
      addRuleMessageToReport("foo-rule", 2, node, location, "foo", {});

      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(fileReport.messages[0], {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
      });
    });

    // ... rest of the tests ...