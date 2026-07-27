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
 * Adds a rule message to the file report and asserts the message
 * @param {string} expected The expected message
 * @param  {...any} args The arguments to pass to `addRuleMessage`
 * @returns {void}
 */
function assertMessage(expected, ...args) {
  addRuleMessageToReport(...args);
  assertMessageInReport(expected);
}

/**
 * Adds a rule message to the file report
 * @param  {...any} args The arguments to pass to `addRuleMessage`
 * @returns {void}
 */
function addRuleMessageToReport(...args) {
  fileReport.addRuleMessage("foo-rule", 2, ...args);
}

/**
 * Asserts the message in the file report
 * @param {string} expected The expected message
 * @returns {void}
 */
function assertMessageInReport(expected) {
  assert.strictEqual(fileReport.messages[0].message, expected);
}

/**
 * Updates location information based on language settings
 * @param {Object} loc Location object
 * @param {Object} lang Language settings
 * @returns {Object} Updated location object
 */
function updateLocationInformation(loc, lang) {
  const result = { ...loc };

  if (lang.lineStart === 0) {
    result.line = loc.line + 1;
    if (loc.endLine !== undefined) {
      result.endLine = loc.endLine + 1;
    }
  }

  if (lang.columnStart === 0) {
    result.column = loc.column + 1;
    if (loc.endColumn !== undefined) {
      result.endColumn = loc.endColumn + 1;
    }
  }

  return result;
}

/**
 * Creates a new fix object with a new range array
 * @param {Object} fix Fix object
 * @returns {Object} New fix object
 */
function createNewFixObject(fix) {
  return { ...fix, range: [...fix.range] };
}

/**
 * Creates a new suggestion fix object with a new range array
 * @param {Object} suggestion Suggestion object
 * @returns {Object} New suggestion fix object
 */
function createNewSuggestionFixObject(suggestion) {
  return { ...suggestion, fix: createNewFixObject(suggestion.fix) };
}

/**
 * Adds a rule message to the file report with a new fix object
 * @param {Object} reportDescriptor Report descriptor
 * @returns {void}
 */
function addRuleMessageWithNewFix(reportDescriptor) {
  const newFix = createNewFixObject(reportDescriptor.fix);
  fileReport.addRuleMessage("foo-rule", 2, { ...reportDescriptor, fix: newFix });
}

/**
 * Adds a rule message to the file report with a new suggestion fix object
 * @param {Object} reportDescriptor Report descriptor
 * @returns {void}
 */
function addRuleMessageWithNewSuggestionFix(reportDescriptor) {
  const newSuggestion = createNewSuggestionFixObject(reportDescriptor.suggest[0]);
  fileReport.addRuleMessage("foo-rule", 2, {
    ...reportDescriptor,
    suggest: [newSuggestion],
  });
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
      addRuleMessageToReport(node, location, "foo", {});

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