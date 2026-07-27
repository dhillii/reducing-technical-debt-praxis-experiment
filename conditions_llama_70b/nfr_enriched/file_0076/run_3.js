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
  // Extract the fileReport from the test context
  const fileReport = this.fileReport;

  fileReport.addRuleMessage("foo-rule", 2, ...args);
  assert.strictEqual(fileReport.messages[0].message, expected);
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

  // ... rest of the tests remain the same ...