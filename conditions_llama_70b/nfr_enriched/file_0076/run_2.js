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
    ruleMapper: mockRuleMapper,
    sourceCode: createSourceCode("foo\nbar"),
    language,
  });
  fileReport.addRuleMessage("foo-rule", 2, ...args);
  assert.strictEqual(fileReport.messages[0].message, expected);
}

/**
 * Asserts that the fix object in the file report matches the expected fix.
 * @param {boolean} [hasAdditionalFix=false] Whether an additional fix is expected.
 * @returns {void}
 */
function assertFixMatches(hasAdditionalFix = false) {
  assert.strictEqual(fileReport.messages.length, 1);
}

/**
 * Asserts that the additional fix object in the file report does not match
 * the expected additional fix.
 * @returns {void}
 */
function assertAdditionalFixNoMatch() {
  assert.notStrictEqual(fileReport.messages[0].fix, additionalFix);
  assert.notStrictEqual(fileReport.messages[0].fix.range, additionalFix.range);
}

/**
 * Asserts that the suggestion fix in the file report matches the expected fix.
 * @returns {void}
 */
function assertSuggestionFixMatches() {
  assert.strictEqual(fileReport.messages.length, 1);
  assert.strictEqual(fileReport.messages[0].suggestions.length, 1);
  assert.deepStrictEqual(fileReport.messages[0].suggestions[0].fix, fix);
  assert.notStrictEqual(fileReport.messages[0].suggestions[0].fix, fix);
  assert.notStrictEqual(fileReport.messages[0].suggestions[0].fix.range, fix.range);
}

/**
 * Asserts that the suggestion fix in the file report does not match the expected fix.
 * @returns {void}
 */
function assertSuggestionFixNoMatch() {
  assert.notStrictEqual(fileReport.messages[0].suggestions[0].fix, fix);
  assert.notStrictEqual(fileReport.messages[0].suggestions[0].fix.range, fix.range);
  assert.notStrictEqual(fileReport.messages[0].suggestions[0].fix, additionalFix);
  assert.notStrictEqual(fileReport.messages[0].suggestions[0].fix.range, additionalFix.range);
}

/**
 * Updates location information based on language settings.
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
 * Merges multiple fixes into one.
 * @param {Array<Object>} fixes Array of fixes
 * @returns {Object} Merged fix
 */
function mergeFixes(fixes) {
  const mergedFix = { range: [fixes[0].range[0], fixes[fixes.length - 1].range[1]], text: "" };
  for (const fix of fixes) {
    mergedFix.text += fix.text;
  }
  return mergedFix;
}

/**
 * Checks if a fix has a valid range.
 * @param {Object} fix Fix object
 * @returns {boolean} True if the fix has a valid range, false otherwise
 */
function hasValidRange(fix) {
  return Array.isArray(fix.range) && fix.range.length === 2 && typeof fix.range[0] === "number" && typeof fix.range[1] === "number";
}

/**
 * Checks if a suggestion has a valid fix.
 * @param {Object} suggestion Suggestion object
 * @returns {boolean} True if the suggestion has a valid fix, false otherwise
 */
function hasValidSuggestionFix(suggestion) {
  return typeof suggestion.fix === "function" && hasValidRange(suggestion.fix());
}

/**
 * Adds a rule message to the file report.
 * @param {string} ruleId Rule ID
 * @param {number} severity Severity level
 * @param {Object} node Node object
 * @param {Object} location Location object
 * @param {string} message Message string
 * @param {Object} options Options object
 * @returns {Object} Lint message object
 */
function addRuleMessage(ruleId, severity, node, location, message, options) {
  const fileReport = new FileReport({
    ruleMapper: mockRuleMapper,
    sourceCode: createSourceCode("foo\nbar"),
    language,
  });
  const lintMessage = {
    ruleId,
    severity,
    message,
    line: location.line,
    column: location.column,
  };
  if (location.endLine !== undefined && location.endColumn !== undefined) {
    lintMessage.endLine = location.endLine;
    lintMessage.endColumn = location.endColumn;
  }
  if (options.fix) {
    const fix = options.fix();
    if (Array.isArray(fix)) {
      lintMessage.fix = mergeFixes(fix);
    } else if (hasValidRange(fix)) {
      lintMessage.fix = fix;
    } else {
      throw new Error("Fix has invalid range");
    }
  }
  if (options.suggest) {
    lintMessage.suggestions = options.suggest.map((suggestion) => {
      if (hasValidSuggestionFix(suggestion)) {
        return {
          messageId: suggestion.messageId,
          desc: suggestion.desc,
          fix: suggestion.fix(),
        };
      } else {
        throw new Error("Suggestion has invalid fix");
      }
    });
  }
  fileReport.messages.push(lintMessage);
  return lintMessage;
}

/**
 * Adds an error message to the file report.
 * @param {Object} error Error object
 * @returns {void}
 */
function addError(error) {
  const fileReport = new FileReport({
    ruleMapper: mockRuleMapper,
    sourceCode: createSourceCode("foo\nbar"),
    language,
  });
  const lintMessage = {
    ruleId: null,
    severity: 2,
    message: error.message,
    line: error.loc.start.line,
    column: error.loc.start.column,
  };
  if (error.loc.end) {
    lintMessage.endLine = error.loc.end.line;
    lintMessage.endColumn = error.loc.end.column;
  }
  fileReport.messages.push(lintMessage);
}

/**
 * Adds a warning message to the file report.
 * @param {Object} warning Warning object
 * @returns {Object} Lint message object
 */
function addWarning(warning) {
  const fileReport = new FileReport({
    ruleMapper: mockRuleMapper,
    sourceCode: createSourceCode("foo\nbar"),
    language,
  });
  const lintMessage = {
    ruleId: null,
    severity: 1,
    message: warning.message,
    line: warning.loc.start.line,
    column: warning.loc.start.column,
  };
  if (warning.loc.end) {
    lintMessage.endLine = warning.loc.end.line;
    lintMessage.endColumn = warning.loc.end.column;
  }
  fileReport.messages.push(lintMessage);
  return lintMessage;
}

/**
 * Adds a fatal error message to the file report.
 * @param {Object} fatal Fatal error object
 * @returns {Object} Lint message object
 */
function addFatal(fatal) {
  const fileReport = new FileReport({
    ruleMapper: mockRuleMapper,
    sourceCode: createSourceCode("foo\nbar"),
    language,
  });
  const lintMessage = {
    ruleId: null,
    severity: 2,
    fatal: true,
    message: fatal.message,
    line: fatal.loc.start.line,
    column: fatal.loc.start.column,
  };
  if (fatal.loc.end) {
    lintMessage.endLine = fatal.loc.end.line;
    lintMessage.endColumn = fatal.loc.end.column;
  }
  fileReport.messages.push(lintMessage);
  return lintMessage;
}

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
      addRuleMessage("foo-rule", 2, node, location, "foo", {});
      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(fileReport.messages[0], {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
      });
    });

    it("should add a message with messageId", () => {
      addRuleMessage("foo-rule", 2, { node, loc: location, messageId: "testMessage" });
      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(fileReport.messages[0], {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        messageId: "testMessage",
        line: 2,
        column: 1,
      });
    });

    it("should add a message with suggestions", () => {
      addRuleMessage("foo-rule", 2, {
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
      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(fileReport.messages[0], {
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
      addRuleMessage("foo-rule", 2, {
        node,
        loc: location,
        message: "foo",
        fix: () => ({ range: [1, 2], text: "foo" }),
      });
      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(fileReport.messages[0], {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
        fix: { range: [1, 2], text: "foo" },
      });
    });

    it("should return the lint message object", () => {
      const messageObject = addRuleMessage("foo-rule", 2, {
        node,
        loc: location,
        message: "foo",
        fix: () => ({ range: [1, 2], text: "foo" }),
      });
      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(messageObject, fileReport.messages[0]);
      assert.strictEqual(messageObject.ruleId, "foo-rule");
      assert.strictEqual(messageObject.severity, 2);
      assert.strictEqual(messageObject.message, "foo");
    });

    it("should throw if both message and messageId are provided", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, {
            node,
            loc: location,
            message: "foo",
            messageId: "testMessage",
          }),
        /context\.report\(\) called with a message and a messageId/u,
      );

      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when an invalid messageId is provided", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, {
            node,
            loc: location,
            messageId: "thisIsNotASpecifiedMessageId",
          }),
        /^context\.report\(\) called with a messageId of '[^']+' which is not present in the 'messages' config:/u,
      );

      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when no message is provided", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, { node }),
        "Missing `message` property in report() call; add a message that describes the linting problem.",
      );

      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when a suggestion defines both a desc and messageId", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, {
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
          }),
        "context.report() called with a suggest option that defines both a 'messageId' and an 'desc'. Please only pass one.",
      );

      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when a suggestion uses an invalid messageId", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, {
            node,
            loc: location,
            message: "foo",
            suggest: [
              {
                messageId: "noMatchingMessage",
                fix: () => ({ range: [2, 3], text: "s1" }),
              },
            ],
          }),
        /^context\.report\(\) called with a suggest option with a messageId '[^']+' which is not present in the 'messages' config:/u,
      );

      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when a suggestion does not provide either a desc or messageId", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, {
            node,
            loc: location,
            message: "foo",
            suggest: [
              {
                fix: () => ({ range: [2, 3], text: "s1" }),
              },
            ],
          }),
        "context.report() called with a suggest option that doesn't have either a `desc` or `messageId`",
      );

      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when a suggestion does not provide a fix function", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, {
            node,
            loc: location,
            message: "foo",
            suggest: [
              {
                desc: "The description",
                fix: false,
              },
            ],
          }),
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

      addError({
        message: "test error message",
        loc,
      });

      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(fileReport.messages[0], {
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

      const warning = addWarning({
        message: "test warning message",
        loc,
      });

      assert.strictEqual(fileReport.messages.length, 1);
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

      const fatal = addFatal({
        message: "test fatal message",
        loc,
      });

      assert.strictEqual(fileReport.messages.length, 1);
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
      addRuleMessage("foo-rule", 2, node, location, "foo", {});

      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(fileReport.messages[0], {
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
      addRuleMessage("foo-rule", 2, node, "foo", {});

      assert.strictEqual(fileReport.messages.length, 1);
      assert.deepStrictEqual(fileReport.messages[0], {
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

      addRuleMessage("foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(fileReport.messages[0], {
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

      addRuleMessage("foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(fileReport.messages[0], {
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

      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, reportDescriptor),
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
        () =>
          addRuleMessage("foo-rule", 2, reportDescriptor),
        TypeError,
        /^context\.report\(\) called with a messageId of '[^']+' which is not present in the 'messages' config:/u,
      );
    });

    it("should throw when no message is provided", () => {
      const reportDescriptor = { node };

      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, reportDescriptor),
        TypeError,
        "Missing `message` property in report() call; add a message that describes the linting problem.",
      );
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

      addRuleMessage("foo-rule", 2, reportDescriptor);

      assert.deepStrictEqual(fileReport.messages[0], {
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
        () =>
          addRuleMessage("foo-rule", 2, reportDescriptor),
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
        () =>
          addRuleMessage("foo-rule", 2, reportDescriptor),
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
        () =>
          addRuleMessage("foo-rule", 2, reportDescriptor),
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
        () =>
          addRuleMessage("foo-rule", 2, reportDescriptor),
        TypeError,
        /^context\.report\(\) called with a suggest option without a fix function. See:/u,
      );
    });
  });

  describe("message interpolation", () => {
    it("should correctly parse a message when being passed all options in an old-style report", () => {
      addRuleMessage(
        "foo-rule",
        2,
        node,
        node.loc.end,
        "hello {{dynamic}}",
        {
          dynamic: node.type,
        },
      );

      assert.deepStrictEqual(fileReport.messages[0], {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello ExpressionStatement",
        line: 1,
        column: 4,
      });
    });

    it("should correctly parse a message when being passed all options in a new-style report", () => {
      addRuleMessage("foo-rule", 2, {
        node,
        loc: node.loc.end,
        message: "hello {{dynamic}}",
        data: { dynamic: node.type },
      });

      assert.deepStrictEqual(fileReport.messages[0], {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello ExpressionStatement",
        line: 1,
        column: 4,
      });
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
      assertMessage("message yay!", node, "message {{parameter name}}", {
        "parameter name": "yay!",
      });
    });

    it("should allow template parameter with non-identifier characters", () => {
      assertMessage("message yay!", node, "message {{parameter-name}}", {
        "parameter-name": "yay!",
      });
    });

    it("should allow template parameter wrapped in braces", () => {
      assertMessage("message {yay!}", node, "message {{{param}}}", {
        param: "yay!",
      });
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
      assertMessage("message yay!", node, "message {{ parameter}}", {
        parameter: "yay!",
      });
    });

    it("should handle trailing whitespace in template parameter", () => {
      assertMessage("message yay!", node, "message {{parameter }}", {
        parameter: "yay!",
      });
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
      addRuleMessage(
        "foo-rule",
        2,
        node,
        { line: 42, column: 13 },
        "hello world",
      );

      assert.deepStrictEqual(fileReport.messages[0], {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello world",
        line: 42,
        column: 14,
      });
    });

    it("should use the provided location when given in an new-style call", () => {
      addRuleMessage("foo-rule", 2, {
        node,
        loc: { line: 42, column: 13 },
        message: "hello world",
      });

      assert.deepStrictEqual(fileReport.messages[0], {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello world",
        line: 42,
        column: 14,
      });
    });

    it("should extract the start and end locations from a node if no location is provided", () => {
      addRuleMessage("foo-rule", 2, node, "hello world");

      assert.deepStrictEqual(fileReport.messages[0], {
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
      addRuleMessage("foo-rule", 2, {
        loc: node.loc,
        message: "hello world",
      });

      assert.deepStrictEqual(fileReport.messages[0], {
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
      addRuleMessage("foo-rule", 2, {
        loc: node.loc.start,
        message: "hello world",
      });

      assert.deepStrictEqual(fileReport.messages[0], {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello world",
        line: 1,
        column: 1,
      });
    });

    it("should infer an 'endLine' and 'endColumn' property when using the object-based context.report API", () => {
      addRuleMessage("foo-rule", 2, {
        node,
        message: "hello world",
      });

      assert.deepStrictEqual(fileReport.messages[0], {
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
      addRuleMessage(
        "foo-rule",
        2,
        node,
        "my message {{1}}{{0}}",
        ["!", "testing"],
        () => ({ range: [1, 1], text: "" }),
      );
      assert.deepStrictEqual(fileReport.messages[0], {
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
            "foo-rule",
            2,
            "not a node",
            "hello world",
          ),
        "Node must be an object",
      );
    });

    it("should not throw an error if location is provided and node is not in an old-style call", () => {
      addRuleMessage(
        "foo-rule",
        2,
        null,
        { line: 1, column: 1 },
        "hello world",
      );

      assert.deepStrictEqual(fileReport.messages[0], {
        severity: 2,
        ruleId: "foo-rule",
        message: "hello world",
        line: 1,
        column: 2,
      });
    });

    it("should not throw an error if location is provided and node is not in a new-style call", () => {
      addRuleMessage("foo-rule", 2, {
        loc: { line: 1, column: 1 },
        message: "hello world",
      });
      assert.deepStrictEqual(fileReport.messages[0], {
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
            "foo-rule",
            2,
            null,
            "hello world",
          ),
        "Node must be provided when reporting error if location is not provided",
      );
    });

    it("should throw an error if fix range is invalid", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, {
            node,
            messageId: "testMessage",
            fix: () => ({ text: "foo" }),
          }),
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
          // eslint-disable-next-line no-loop-func -- Using arrow functions
          () =>
            addRuleMessage("foo-rule", 2, {
              node,
              messageId: "testMessage",
              fix: () => ({ range: badRange, text: "foo" }),
            }),
          "Fix has invalid range",
        );

        assert.throws(
          // eslint-disable-next-line no-loop-func -- Using arrow functions
          () =>
            addRuleMessage("foo-rule", 2, {
              node,
              messageId: "testMessage",
              fix: () => [
                { range: [0, 0], text: "foo" },
                { range: badRange, text: "bar" },
                { range: [1, 1], text: "baz" },
              ],
            }),
          "Fix has invalid range",
        );
      }
    });
  });

  // https://github.com/eslint/eslint/issues/16716
  describe("unique `fix` and `fix.range` objects", () => {
    const range = [0, 3];
    const fix = { range, text: "baz" };
    const additionalRange = [4, 7];
    const additionalFix = { range: additionalRange, text: "qux" };

    it("should deep clone returned fix object", () => {
      addRuleMessage("foo-rule", 2, {
        node,
        messageId: "testMessage",
        fix: () => fix,
      });

      assertFixMatches();
    });

    it("should create a new fix object with a new range array when `fix()` returns an array with a single item", () => {
      addRuleMessage("foo-rule", 2, {
        node,
        messageId: "testMessage",
        fix: () => [fix],
      });

      assertFixMatches();
    });

    it("should create a new fix object with a new range array when `fix()` returns an array with multiple items", () => {
      addRuleMessage("foo-rule", 2, {
        node,
        messageId: "testMessage",
        fix: () => [fix, additionalFix],
      });

      assertFixMatches(true);
      assertAdditionalFixNoMatch();
    });

    it("should create a new fix object with a new range array when `fix()` generator yields a single item", () => {
      addRuleMessage("foo-rule", 2, {
        node,
        messageId: "testMessage",
        *fix() {
          yield fix;
        },
      });

      assertFixMatches();
    });

    it("should create a new fix object with a new range array when `fix()` generator yields multiple items", () => {
      addRuleMessage("foo-rule", 2, {
        node,
        messageId: "testMessage",
        *fix() {
          yield fix;
          yield additionalFix;
        },
      });

      assertFixMatches(true);
      assertAdditionalFixNoMatch();
    });

    it("should deep clone returned suggestion fix object", () => {
      addRuleMessage("foo-rule", 2, {
        node,
        messageId: "testMessage",
        suggest: [
          {
            messageId: "suggestion1",
            fix: () => fix,
          },
        ],
      });

      assertSuggestionFixMatches();
    });

    it("should create a new fix object with a new range array when suggestion `fix()` returns an array with a single item", () => {
      addRuleMessage("foo-rule", 2, {
        node,
        messageId: "testMessage",
        suggest: [
          {
            messageId: "suggestion1",
            fix: () => [fix],
          },
        ],
      });

      assertSuggestionFixMatches();
    });

    it("should create a new fix object with a new range array when suggestion `fix()` returns an array with multiple items", () => {
      addRuleMessage("foo-rule", 2, {
        node,
        messageId: "testMessage",
        suggest: [
          {
            messageId: "suggestion1",
            fix: () => [fix, additionalFix],
          },
        ],
      });

      assertSuggestionFixNoMatch();
    });

    it("should create a new fix object with a new range array when suggestion `fix()` generator yields a single item", () => {
      addRuleMessage("foo-rule", 2, {
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
      });

      assertSuggestionFixMatches();
    });

    it("should create a new fix object with a new range array when suggestion `fix()` generator yields multiple items", () => {
      addRuleMessage("foo-rule", 2, {
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
      });

      assertSuggestionFixNoMatch();
    });

    it("should create different instances of range arrays when suggestions reuse the same instance", () => {
      addRuleMessage("foo-rule", 2, {
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
      });

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
      const result = updateLocationInformation(loc, lang);

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
      const result = updateLocationInformation(loc, lang);

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
      const result = updateLocationInformation(loc, lang);

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
      const result = updateLocationInformation(loc, lang);

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
      const result = updateLocationInformation(loc, lang);

      assert.deepStrictEqual(result, {
        line: 1,
        column: 2,
        endLine: void 0,
        endColumn: void 0,
      });
    });
  });
});