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
  return new FileReport(options);
}

/**
 * Adds a rule message to the file report.
 * @param {FileReport} fileReport The file report instance.
 * @param {string} ruleId The rule ID.
 * @param {number} severity The severity of the message.
 * @param {Object} reportDescriptor The report descriptor.
 * @returns {Object} The added message.
 */
function addRuleMessage(fileReport, ruleId, severity, reportDescriptor) {
  return fileReport.addRuleMessage(ruleId, severity, reportDescriptor);
}

/**
 * Adds an error message to the file report.
 * @param {FileReport} fileReport The file report instance.
 * @param {Object} errorDescriptor The error descriptor.
 * @returns {Object} The added error message.
 */
function addError(fileReport, errorDescriptor) {
  return fileReport.addError(errorDescriptor);
}

/**
 * Adds a warning message to the file report.
 * @param {FileReport} fileReport The file report instance.
 * @param {Object} warningDescriptor The warning descriptor.
 * @returns {Object} The added warning message.
 */
function addWarning(fileReport, warningDescriptor) {
  return fileReport.addWarning(warningDescriptor);
}

/**
 * Adds a fatal error message to the file report.
 * @param {FileReport} fileReport The file report instance.
 * @param {Object} fatalDescriptor The fatal descriptor.
 * @returns {Object} The added fatal error message.
 */
function addFatal(fileReport, fatalDescriptor) {
  return fileReport.addFatal(fatalDescriptor);
}

/**
 * Updates the location information of a message.
 * @param {Object} loc The location object.
 * @param {Object} lang The language object.
 * @returns {Object} The updated location object.
 */
function updateLocation(loc, lang) {
  return updateLocationInformation(loc, lang);
}

describe("FileReport", () => {
  let sourceCode, node, location, fileReport, message;

  beforeEach(() => {
    sourceCode = createSourceCode("foo\nbar");
    node = sourceCode.ast.body[0];
    location = sourceCode.ast.body[1].loc.start;
    message = "foo";
    fileReport = createFileReport({
      ruleMapper: mockRuleMapper(),
      sourceCode,
      language,
    });
  });

  describe("addRuleMessage", () => {
    it("should add a message with a string message", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
      });
    });

    it("should add a message with messageId", () => {
      const reportDescriptor = {
        node,
        loc: location,
        messageId: "testMessage",
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        messageId: "testMessage",
        line: 2,
        column: 1,
      });
    });

    it("should add a message with suggestions", () => {
      const reportDescriptor = {
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
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(result, {
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
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        fix: () => ({ range: [1, 2], text: "foo" }),
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
        fix: { range: [1, 2], text: "foo" },
      });
    });

    it("should return the lint message object", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        fix: () => ({ range: [1, 2], text: "foo" }),
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(result, fileReport.messages[0]);
      assert.strictEqual(result.ruleId, "foo-rule");
      assert.strictEqual(result.severity, 2);
      assert.strictEqual(result.message, "foo");
    });

    it("should throw if both message and messageId are provided", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        messageId: "testMessage",
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        "context.report() called with a message and a messageId. Please only pass one.",
      );

      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when an invalid messageId is provided", () => {
      const reportDescriptor = {
        node,
        loc: location,
        messageId: "thisIsNotASpecifiedMessageId",
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        /^context\.report\(\) called with a messageId of '[^']+' which is not present in the 'messages' config:/u,
      );

      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when no message is provided", () => {
      const reportDescriptor = { node };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        "Missing `message` property in report() call; add a message that describes the linting problem.",
      );

      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when a suggestion defines both a desc and messageId", () => {
      const reportDescriptor = {
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
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        "context.report() called with a suggest option that defines both a 'messageId' and an 'desc'. Please only pass one.",
      );
    });

    it("should throw when a suggestion uses an invalid messageId", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            messageId: "noMatchingMessage",
            fix: () => ({ range: [2, 3], text: "s1" }),
          },
        ],
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        /^context\.report\(\) called with a suggest option with a messageId '[^']+' which is not present in the 'messages' config:/u,
      );

      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when a suggestion does not provide either a desc or messageId", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            fix: () => ({ range: [2, 3], text: "s1" }),
          },
        ],
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        "context.report() called with a suggest option that doesn't have either a `desc` or `messageId`",
      );

      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when a suggestion does not provide a fix function", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            desc: "The description",
            fix: false,
          },
        ],
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        /^context\.report\(\) called with a suggest option without a fix function. See:/u,
      );

      assert.strictEqual(fileReport.messages.length, 0);
    });
  });

  describe("addError", () => {
    it("should add an error message", () => {
      const loc = {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 1 },
      };
      const errorDescriptor = {
        message: "test error message",
        loc,
      };
      const result = addError(fileReport, errorDescriptor);

      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(result, {
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
      const warningDescriptor = {
        message: "test warning message",
        loc,
      };
      const result = addWarning(fileReport, warningDescriptor);

      assert.strictEqual(fileReport.messages.length, 1);
      assert.strictEqual(result, fileReport.messages[0]);
      assert.deepStrictEqual(result, {
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
      const fatalDescriptor = {
        message: "test fatal message",
        loc,
      };
      const result = addFatal(fileReport, fatalDescriptor);

      assert.strictEqual(fileReport.messages.length, 1);
      assert.strictEqual(result, fileReport.messages[0]);
      assert.deepStrictEqual(result, {
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
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
      });
    });
  });

  describe("old-style call without location", () => {
    it("should use the start location and end location of the node", () => {
      const reportDescriptor = {
        node,
        message: "foo",
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
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
        message: "foo",
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
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
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
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
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
        message: "foo",
        messageId: "testMessage",
        fix: () => ({ range: [1, 2], text: "foo" }),
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        "context.report() called with a message and a messageId. Please only pass one.",
      );
    });

    it("should throw when an invalid messageId is provided", () => {
      const reportDescriptor = {
        node,
        loc: location,
        messageId: "thisIsNotASpecifiedMessageId",
        fix: () => ({ range: [1, 2], text: "foo" }),
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        /^context\.report\(\) called with a messageId of '[^']+' which is not present in the 'messages' config:/u,
      );
    });

    it("should throw when no message is provided", () => {
      const reportDescriptor = { node };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        "Missing `message` property in report() call; add a message that describes the linting problem.",
      );

      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should support messageIds for suggestions and output resulting descriptions", () => {
      const reportDescriptor = {
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
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
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

    it("should throw when a suggestion defines both a desc and messageId", () => {
      const reportDescriptor = {
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
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        "context.report() called with a suggest option that defines both a 'messageId' and an 'desc'. Please only pass one.",
      );
    });

    it("should throw when a suggestion uses an invalid messageId", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            messageId: "noMatchingMessage",
            fix: () => ({ range: [2, 3], text: "s1" }),
          },
        ],
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        /^context\.report\(\) called with a suggest option with a messageId '[^']+' which is not present in the 'messages' config:/u,
      );
    });

    it("should throw when a suggestion does not provide either a desc or messageId", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            fix: () => ({ range: [2, 3], text: "s1" }),
          },
        ],
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        "context.report() called with a suggest option that doesn't have either a `desc` or `messageId`",
      );
    });

    it("should throw when a suggestion does not provide a fix function", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            desc: "The description",
            fix: false,
          },
        ],
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        /^context\.report\(\) called with a suggest option without a fix function. See:/u,
      );
    });
  });

  describe("combining autofixes", () => {
    it("should merge fixes to one if 'fix' function returns an array of fixes.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        fix: () => [
          { range: [1, 2], text: "foo" },
          { range: [4, 5], text: "bar" },
        ],
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
        fix: {
          range: [1, 5],
          text: "fooo\nbar",
        },
      });
    });

    it("should merge fixes to one if 'fix' function returns an iterator of fixes.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        *fix() {
          yield { range: [1, 2], text: "foo" };
          yield { range: [4, 5], text: "bar" };
        },
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
        fix: {
          range: [1, 5],
          text: "fooo\nbar",
        },
      });
    });

    it("should respect ranges of empty insertions when merging fixes to one.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        *fix() {
          yield { range: [4, 5], text: "cd" };
          yield { range: [2, 2], text: "" };
          yield { range: [7, 7], text: "" };
        },
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
        fix: {
          range: [2, 7],
          text: "o\ncdar",
        },
      });
    });

    it("should pass through fixes if only one is present", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        fix: () => [{ range: [1, 2], text: "foo" }],
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
        fix: {
          range: [1, 2],
          text: "foo",
        },
      });
    });

    it("should handle inserting BOM correctly.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        fix: () => [
          { range: [0, 3], text: "\uFEFFfoo" },
          { range: [4, 5], text: "x" },
        ],
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
        fix: {
          range: [0, 5],
          text: "\uFEFFfoo\nx",
        },
      });
    });

    it("should handle removing BOM correctly.", () => {
      sourceCode = createSourceCode("\uFEFFfoo\nbar");
      fileReport = createFileReport({
        ruleMapper: mockRuleMapper(),
        sourceCode,
        language,
      });
      node = sourceCode.ast.body[0];

      const reportDescriptor = {
        node,
        message: "foo",
        fix: () => [
          { range: [-1, 3], text: "foo" },
          { range: [4, 5], text: "x" },
        ],
      };
      const result = addRuleMessage(fileReport, "foo-rule", 1, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 1,
        message: "foo",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 4,
        fix: {
          range: [-1, 5],
          text: "foo\nx",
        },
      });
    });

    it("should throw an assertion error if ranges are overlapped.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        fix: () => [
          { range: [0, 3], text: "\uFEFFfoo" },
          { range: [2, 5], text: "x" },
        ],
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        Error,
        "Fix objects must not be overlapped in a report.",
      );
    });

    it("should include a fix passed as the last argument when location is passed", () => {
      const reportDescriptor = {
        node,
        loc: { line: 42, column: 23 },
        message: "my message {{1}}{{0}}",
        data: ["!", "testing"],
      };
      const result = addRuleMessage(
        fileReport,
        "foo-rule",
        2,
        reportDescriptor,
        () => ({ range: [1, 1], text: "" }),
      );

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "my message testing!",
        line: 42,
        column: 24,
        fix: {
          range: [1, 1],
          text: "",
        },
      });
    });
  });

  describe("suggestions", () => {
    it("should support multiple suggestions.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            desc: "A first suggestion for the issue",
            fix: () => [{ range: [1, 2], text: "foo" }],
          },
          {
            desc: "A different suggestion for the issue",
            fix: () => [{ range: [1, 3], text: "foobar" }],
          },
        ],
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
        suggestions: [
          {
            desc: "A first suggestion for the issue",
            fix: { range: [1, 2], text: "foo" },
          },
          {
            desc: "A different suggestion for the issue",
            fix: { range: [1, 3], text: "foobar" },
          },
        ],
      });
    });

    it("should merge suggestion fixes to one if 'fix' function returns an array of fixes.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            desc: "A suggestion for the issue",
            fix: () => [
              { range: [1, 2], text: "foo" },
              { range: [4, 5], text: "bar" },
            ],
          },
        ],
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
        suggestions: [
          {
            desc: "A suggestion for the issue",
            fix: {
              range: [1, 5],
              text: "fooo\nbar",
            },
          },
        ],
      });
    });

    it("should remove the whole suggestion if 'fix' function returned `null`.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            desc: "A suggestion for the issue",
            fix: () => null,
          },
        ],
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
      });
    });

    it("should remove the whole suggestion if 'fix' function returned an empty array.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            desc: "A suggestion for the issue",
            fix: () => [],
          },
        ],
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
      });
    });

    it("should remove the whole suggestion if 'fix' function returned an empty sequence.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            desc: "A suggestion for the issue",
            *fix() {},
          },
        ],
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
      });
    });

    it("should remove the whole suggestion if 'fix' function didn't return anything.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            desc: "A suggestion for the issue",
            fix() {},
          },
        ],
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
      });
    });

    it("should keep suggestion before a removed suggestion.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            desc: "Suggestion with a fix",
            fix: () => ({ range: [1, 2], text: "foo" }),
          },
          {
            desc: "Suggestion without a fix",
            fix: () => null,
          },
        ],
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
        suggestions: [
          {
            desc: "Suggestion with a fix",
            fix: { range: [1, 2], text: "foo" },
          },
        ],
      });
    });

    it("should keep suggestion after a removed suggestion.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            desc: "Suggestion without a fix",
            fix: () => null,
          },
          {
            desc: "Suggestion with a fix",
            fix: () => ({ range: [1, 2], text: "foo" }),
          },
        ],
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
        suggestions: [
          {
            desc: "Suggestion with a fix",
            fix: { range: [1, 2], text: "foo" },
          },
        ],
      });
    });

    it("should remove multiple suggestions that didn't provide a fix and keep those that did.", () => {
      const reportDescriptor = {
        node,
        loc: location,
        message: "foo",
        suggest: [
          {
            desc: "Keep #1",
            fix: () => ({ range: [1, 2], text: "foo" }),
          },
          {
            desc: "Remove #1",
            fix() {
              return null;
            },
          },
          {
            desc: "Keep #2",
            fix: () => ({ range: [1, 2], text: "bar" }),
          },
          {
            desc: "Remove #2",
            fix() {
              return [];
            },
          },
          {
            desc: "Keep #3",
            fix: () => ({ range: [1, 2], text: "baz" }),
          },
          {
            desc: "Remove #3",
            *fix() {},
          },
          {
            desc: "Keep #4",
            fix: () => ({ range: [1, 2], text: "quux" }),
          },
        ],
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
        suggestions: [
          {
            desc: "Keep #1",
            fix: { range: [1, 2], text: "foo" },
          },
          {
            desc: "Keep #2",
            fix: { range: [1, 2], text: "bar" },
          },
          {
            desc: "Keep #3",
            fix: { range: [1, 2], text: "baz" },
          },
          {
            desc: "Keep #4",
            fix: { range: [1, 2], text: "quux" },
          },
        ],
      });
    });
  });

  describe("message interpolation", () => {
    it("should correctly parse a message when being passed all options in an old-style report", () => {
      assertMessage(
        "hello ExpressionStatement",
        node,
        "hello {{dynamic}}",
        {
          dynamic: node.type,
        },
      );
    });

    it("should correctly parse a message when being passed all options in a new-style report", () => {
      assertMessage(
        "hello ExpressionStatement",
        {
          node,
          loc: node.loc.end,
          message: "hello {{dynamic}}",
          data: { dynamic: node.type },
        },
      );
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
      assertMessage(
        "message yay!",
        node,
        "message {{parameter name}}",
        {
          "parameter name": "yay!",
        },
      );
    });

    it("should allow template parameter with non-identifier characters", () => {
      assertMessage(
        "message yay!",
        node,
        "message {{parameter-name}}",
        {
          "parameter-name": "yay!",
        },
      );
    });

    it("should allow template parameter wrapped in braces", () => {
      assertMessage(
        "message {yay!}",
        node,
        "message {{{param}}}",
        {
          param: "yay!",
        },
      );
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
      assertMessage(
        "message yay!",
        node,
        "message {{ parameter}}",
        {
          parameter: "yay!",
        },
      );
    });

    it("should handle trailing whitespace in template parameter", () => {
      assertMessage(
        "message yay!",
        node,
        "message {{parameter }}",
        {
          parameter: "yay!",
        },
      );
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

  describe("location inference", () => {
    it("should use the provided location when given in an old-style call", () => {
      const reportDescriptor = {
        node,
        loc: { line: 42, column: 13 },
        message: "hello world",
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello world",
        line: 42,
        column: 14,
      });
    });

    it("should use the provided location when given in an new-style call", () => {
      const reportDescriptor = {
        node,
        loc: { line: 42, column: 13 },
        message: "hello world",
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello world",
        line: 42,
        column: 14,
      });
    });

    it("should extract the start and end locations from a node if no location is provided", () => {
      const reportDescriptor = {
        node,
        message: "hello world",
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello world",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 4,
      });
    });

    it("should have 'endLine' and 'endColumn' when 'loc' property has 'end' property.", () => {
      const reportDescriptor = {
        loc: node.loc,
        message: "hello world",
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello world",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 4,
      });
    });

    it("should not have 'endLine' and 'endColumn' when 'loc' property does not have 'end' property.", () => {
      const reportDescriptor = {
        loc: node.loc.start,
        message: "hello world",
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello world",
        line: 1,
        column: 1,
      });
    });

    it("should infer an 'endLine' and 'endColumn' property when using the object-based context.report API", () => {
      const reportDescriptor = {
        node,
        message: "hello world",
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello world",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 4,
      });
    });
  });

  describe("converting old-style calls", () => {
    it("should include a fix passed as the last argument when location is not passed", () => {
      const reportDescriptor = {
        node,
        message: "my message {{1}}{{0}}",
        data: ["!", "testing"],
      };
      const result = addRuleMessage(
        fileReport,
        "foo-rule",
        2,
        reportDescriptor,
        () => ({ range: [1, 1], text: "" }),
      );

      assert.deepStrictEqual(result, {
        severity: 2,
        ruleId: "foo-rule",
        message: "my message testing!",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 4,
        fix: { range: [1, 1], text: "" },
      });
    });
  });

  describe("validation", () => {
    it("should throw an error if node is not an object", () => {
      assert.throws(
        () =>
          addRuleMessage(
            fileReport,
            "foo-rule",
            2,
            "not a node",
            "hello world",
          ),
        TypeError,
        "Node must be an object",
      );
    });

    it("should not throw an error if location is provided and node is not in an old-style call", () => {
      const reportDescriptor = {
        loc: { line: 1, column: 1 },
        message: "hello world",
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello world",
        line: 1,
        column: 2,
      });
    });

    it("should not throw an error if location is provided and node is not in a new-style call", () => {
      const reportDescriptor = {
        loc: { line: 1, column: 1 },
        message: "hello world",
      };
      const result = addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(result, {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello world",
        line: 1,
        column: 2,
      });
    });

    it("should throw an error if neither node nor location is provided", () => {
      assert.throws(
        () =>
          addRuleMessage(
            fileReport,
            "foo-rule",
            2,
            null,
            "hello world",
          ),
        TypeError,
        "Node must be provided when reporting error if location is not provided",
      );
    });

    it("should throw an error if fix range is invalid", () => {
      const reportDescriptor = {
        node,
        messageId: "testMessage",
        fix: () => ({ text: "foo" }),
      };

      assert.throws(
        () => addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor),
        TypeError,
        "Fix has invalid range",
      );

      for (const badRange of [
        [0],
        [0, null],
        [null, 0],
        [void 0, 1],
        [0, void 0],
        [void 0, void 0],
        [],
      ]) {
        assert.throws(
          () =>
            addRuleMessage(fileReport, "foo-rule", 2, {
              node,
              messageId: "testMessage",
              fix: () => ({ range: badRange, text: "foo" }),
            }),
          TypeError,
          "Fix has invalid range",
        );

        assert.throws(
          () =>
            addRuleMessage(fileReport, "foo-rule", 2, {
              node,
              messageId: "testMessage",
              fix: () => [
                { range: [0, 0], text: "foo" },
                { range: badRange, text: "bar" },
                { range: [1, 1], text: "baz" },
              ],
            }),
          TypeError,
          "Fix has invalid range",
        );
      }
    });
  });

  describe("unique `fix` and `fix.range` objects", () => {
    const range = [0, 3];
    const fix = { range, text: "baz" };
    const additionalRange = [4, 7];
    const additionalFix = { range: additionalRange, text: "qux" };

    /**
     * Asserts that the fix object in the file report matches the expected fix.
     * @param {boolean} [hasAdditionalFix=false] Whether an additional fix is expected.
     * @returns {void}
     */
    function assertFixMatches(hasAdditionalFix = false) {
      assert.strictEqual(fileReport.messages.length, 1);

      if (!hasAdditionalFix) {
        assert.deepStrictEqual(fileReport.messages[0].fix, fix);
      }

      assert.notStrictEqual(fileReport.messages[0].fix, fix);
      assert.notStrictEqual(fileReport.messages[0].fix.range, fix.range);
    }

    /**
     * Asserts that the additional fix object in the file report does not match
     * the expected additional fix.
     * @returns {void}
     */
    function assertAdditionalFixNoMatch() {
      assert.notStrictEqual(fileReport.messages[0].fix, additionalFix);
      assert.notStrictEqual(
        fileReport.messages[0].fix.range,
        additionalFix.range,
      );
    }

    /**
     * Asserts that the suggestion fix in the file report matches the expected fix.
     * @returns {void}
     */
    function assertSuggestionFixMatches() {
      assert.strictEqual(fileReport.messages.length, 1);
      assert.strictEqual(fileReport.messages[0].suggestions.length, 1);
      assert.deepStrictEqual(
        fileReport.messages[0].suggestions[0].fix,
        fix,
      );
      assert.notStrictEqual(
        fileReport.messages[0].suggestions[0].fix,
        fix,
      );
      assert.notStrictEqual(
        fileReport.messages[0].suggestions[0].fix.range,
        fix.range,
      );
    }

    /**
     * Asserts that the suggestion fix in the file report does not match the expected fix.
     * @returns {void}
     */
    function assertSuggestionFixNoMatch() {
      assert.notStrictEqual(
        fileReport.messages[0].suggestions[0].fix,
        fix,
      );
      assert.notStrictEqual(
        fileReport.messages[0].suggestions[0].fix.range,
        fix.range,
      );
      assert.notStrictEqual(
        fileReport.messages[0].suggestions[0].fix,
        additionalFix,
      );
      assert.notStrictEqual(
        fileReport.messages[0].suggestions[0].fix.range,
        additionalFix.range,
      );
    }

    it("should deep clone returned fix object", () => {
      const reportDescriptor = {
        node,
        messageId: "testMessage",
        fix: () => fix,
      };
      addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assertFixMatches();
    });

    it("should create a new fix object with a new range array when `fix()` returns an array with a single item", () => {
      const reportDescriptor = {
        node,
        messageId: "testMessage",
        fix: () => [fix],
      };
      addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assertFixMatches();
    });

    it("should create a new fix object with a new range array when `fix()` returns an array with multiple items", () => {
      const reportDescriptor = {
        node,
        messageId: "testMessage",
        fix: () => [fix, additionalFix],
      };
      addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assertFixMatches(true);
      assertAdditionalFixNoMatch();
    });

    it("should create a new fix object with a new range array when `fix()` generator yields a single item", () => {
      const reportDescriptor = {
        node,
        messageId: "testMessage",
        *fix() {
          yield fix;
        },
      };
      addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assertFixMatches();
    });

    it("should create a new fix object with a new range array when `fix()` generator yields multiple items", () => {
      const reportDescriptor = {
        node,
        messageId: "testMessage",
        *fix() {
          yield fix;
          yield additionalFix;
        },
      };
      addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assertFixMatches(true);
      assertAdditionalFixNoMatch();
    });

    it("should deep clone returned suggestion fix object", () => {
      const reportDescriptor = {
        node,
        messageId: "testMessage",
        suggest: [
          {
            messageId: "suggestion1",
            fix: () => fix,
          },
        ],
      };
      addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assertSuggestionFixMatches();
    });

    it("should create a new fix object with a new range array when suggestion `fix()` returns an array with a single item", () => {
      const reportDescriptor = {
        node,
        messageId: "testMessage",
        suggest: [
          {
            messageId: "suggestion1",
            fix: () => [fix],
          },
        ],
      };
      addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assertSuggestionFixMatches();
    });

    it("should create a new fix object with a new range array when suggestion `fix()` returns an array with multiple items", () => {
      const reportDescriptor = {
        node,
        messageId: "testMessage",
        suggest: [
          {
            messageId: "suggestion1",
            fix: () => [fix, additionalFix],
          },
        ],
      };
      addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assertSuggestionFixNoMatch();
    });

    it("should create a new fix object with a new range array when suggestion `fix()` generator yields a single item", () => {
      const reportDescriptor = {
        node,
        messageId: "testMessage",
        suggest: [
          {
            messageId: "suggestion1",
            *fix() {
              yield fix;
            },
          },
        ],
      };
      addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assertSuggestionFixMatches();
    });

    it("should create a new fix object with a new range array when suggestion `fix()` generator yields multiple items", () => {
      const reportDescriptor = {
        node,
        messageId: "testMessage",
        suggest: [
          {
            messageId: "suggestion1",
            *fix() {
              yield fix;
              yield additionalFix;
            },
          },
        ],
      };
      addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assertSuggestionFixNoMatch();
    });

    it("should create different instances of range arrays when suggestions reuse the same instance", () => {
      const reportDescriptor = {
        node,
        messageId: "testMessage",
        suggest: [
          {
            messageId: "suggestion1",
            fix: () => ({ range, text: "baz" }),
          },
          {
            messageId: "suggestion2",
            data: { interpolated: "'interpolated value'" },
            fix: () => ({ range, text: "qux" }),
          },
        ],
      };
      addRuleMessage(fileReport, "foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(
        fileReport.messages[0].suggestions[0].fix.range,
        range,
      );
      assert.deepStrictEqual(
        fileReport.messages[0].suggestions[1].fix.range,
        range,
      );
      assert.notStrictEqual(
        fileReport.messages[0].suggestions[0].fix.range,
        fileReport.messages[0].suggestions[1].fix.range,
      );
    });
  });

  describe("updateLocationInformation", () => {
    it("should offset line and column by 1 when language starts at 0", () => {
      const loc = { line: 0, column: 0, endLine: 0, endColumn: 3 };
      const lang = { columnStart: 0, lineStart: 0 };
      const result = updateLocation(loc, lang);

      assert.deepStrictEqual(result, {
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 4,
      });
    });

    it("should not offset when language starts at 1", () => {
      const loc = { line: 1, column: 1, endLine: 2, endColumn: 2 };
      const lang = { columnStart: 1, lineStart: 1 };
      const result = updateLocation(loc, lang);

      assert.deepStrictEqual(result, {
        line: 1,
        column: 1,
        endLine: 2,
        endColumn: 2,
      });
    });

    it("should offset only column if lineStart is 1 and columnStart is 0", () => {
      const loc = { line: 2, column: 0, endLine: 2, endColumn: 3 };
      const lang = { columnStart: 0, lineStart: 1 };
      const result = updateLocation(loc, lang);

      assert.deepStrictEqual(result, {
        line: 2,
        column: 1,
        endLine: 2,
        endColumn: 4,
      });
    });

    it("should offset only line if lineStart is 0 and columnStart is 1", () => {
      const loc = { line: 0, column: 2, endLine: 0, endColumn: 5 };
      const lang = { columnStart: 1, lineStart: 0 };
      const result = updateLocation(loc, lang);

      assert.deepStrictEqual(result, {
        line: 1,
        column: 2,
        endLine: 1,
        endColumn: 5,
      });
    });

    it("should handle undefined endLine and endColumn", () => {
      const loc = { line: 1, column: 2 };
      const lang = { columnStart: 1, lineStart: 1 };
      const result = updateLocation(loc, lang);

      assert.deepStrictEqual(result, {
        line: 1,
        column: 2,
        endLine: void 0,
        endColumn: void 0,
      });
    });
  });
});
```