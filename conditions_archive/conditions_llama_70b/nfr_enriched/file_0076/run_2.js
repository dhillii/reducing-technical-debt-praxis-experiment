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

/**
 * Asserts that a message is correctly formatted.
 * @param {string} expected The expected message.
 * @param  {...any} args The arguments to pass to `addRuleMessage`.
 * @returns {void}
 */
function assertMessage(expected, ...args) {
  const fileReport = new FileReport({
    ruleMapper: mockRuleMapper(),
    sourceCode: createSourceCode("foo\nbar"),
    language,
  });
  fileReport.addRuleMessage("foo-rule", 2, ...args);
  assert.strictEqual(fileReport.messages[0].message, expected);
}

/**
 * Creates a new FileReport instance.
 * @param {Object} options Options for the FileReport instance.
 * @returns {FileReport} A new FileReport instance.
 */
function createFileReport(options) {
  return new FileReport({
    ruleMapper: mockRuleMapper(),
    sourceCode: createSourceCode("foo\nbar"),
    language,
    ...options,
  });
}

/**
 * Adds a rule message to the file report.
 * @param {FileReport} fileReport The file report instance.
 * @param {string} ruleId The rule ID.
 * @param {number} severity The severity of the message.
 * @param {Object} options Options for the message.
 * @returns {Object} The added message.
 */
function addRuleMessage(fileReport, ruleId, severity, options) {
  return fileReport.addRuleMessage(ruleId, severity, options);
}

/**
 * Updates location information based on the language.
 * @param {Object} loc The location object.
 * @param {Object} lang The language object.
 * @returns {Object} The updated location object.
 */
function updateLocation(loc, lang) {
  return updateLocationInformation(loc, lang);
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
    fileReport = createFileReport();
  });

  describe("addRuleMessage", () => {
    it("should add a message with a string message", () => {
      const result = addRuleMessage(fileReport, "foo-rule", 2, {
        node,
        loc: location,
        message: "foo",
      });

      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
      });
    });

    // ... other tests ...
  });

  // ... other tests ...
});
```