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
 * @param {Object} lang Language object
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
 * Merges fixes into one.
 * @param {Array} fixes Array of fixes
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
 * Checks if a range is valid.
 * @param {Array} range Range array
 * @returns {boolean} Whether the range is valid
 */
function isValidRange(range) {
  return Array.isArray(range) && range.length === 2 && typeof range[0] === "number" && typeof range[1] === "number";
}

/**
 * Checks if a fix is valid.
 * @param {Object} fix Fix object
 * @returns {boolean} Whether the fix is valid
 */
function isValidFix(fix) {
  return typeof fix === "object" && fix !== null && isValidRange(fix.range) && typeof fix.text === "string";
}

/**
 * Checks if a suggestion is valid.
 * @param {Object} suggestion Suggestion object
 * @returns {boolean} Whether the suggestion is valid
 */
function isValidSuggestion(suggestion) {
  return typeof suggestion === "object" && suggestion !== null && (suggestion.messageId || suggestion.desc) && typeof suggestion.fix === "function";
}

/**
 * Adds a rule message to the file report.
 * @param {string} ruleId Rule ID
 * @param {number} severity Severity
 * @param {Object} node Node object
 * @param {Object} location Location object
 * @param {string} message Message
 * @param {Object} options Options object
 * @returns {Object} Lint message object
 */
function addRuleMessage(ruleId, severity, node, location, message, options) {
  const fileReport = new FileReport({
    ruleMapper: mockRuleMapper,
    sourceCode: createSourceCode("foo\nbar"),
    language,
  });
  const loc = location || node.loc;
  const messageId = options.messageId;
  const data = options.data;
  const fix = options.fix;
  const suggest = options.suggest;

  if (messageId && message) {
    throw new TypeError("context.report() called with a message and a messageId. Please only pass one.");
  }

  if (messageId && !mockRuleMapper.meta.messages[messageId]) {
    throw new TypeError(`context.report() called with a messageId of '${messageId}' which is not present in the 'messages' config:`);
  }

  if (!message && !messageId) {
    throw new TypeError("Missing `message` property in report() call; add a message that describes the linting problem.");
  }

  const lintMessage = {
    ruleId,
    severity,
    message: messageId ? mockRuleMapper.meta.messages[messageId] : message,
    line: loc.start.line,
    column: loc.start.column,
  };

  if (loc.end) {
    lintMessage.endLine = loc.end.line;
    lintMessage.endColumn = loc.end.column;
  }

  if (fix) {
    const fixResult = fix();
    if (Array.isArray(fixResult)) {
      lintMessage.fix = mergeFixes(fixResult);
    } else if (typeof fixResult === "object" && fixResult !== null) {
      lintMessage.fix = fixResult;
    } else {
      throw new TypeError("context.report() called with a fix option that doesn't return a fix object or an array of fix objects.");
    }
  }

  if (suggest) {
    lintMessage.suggestions = suggest
      .map((suggestion) => {
        if (!isValidSuggestion(suggestion)) {
          throw new TypeError("context.report() called with a suggest option that doesn't have either a `desc` or `messageId`");
        }
        const suggestionFix = suggestion.fix();
        if (Array.isArray(suggestionFix)) {
          return {
            ...suggestion,
            fix: mergeFixes(suggestionFix),
          };
        } else if (typeof suggestionFix === "object" && suggestionFix !== null) {
          return {
            ...suggestion,
            fix: suggestionFix,
          };
        } else {
          return null;
        }
      })
      .filter((suggestion) => suggestion !== null);
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
  const loc = error.loc;
  const message = error.message;

  const lintMessage = {
    ruleId: null,
    severity: 2,
    message,
    line: loc.start.line,
    column: loc.start.column,
  };

  if (loc.end) {
    lintMessage.endLine = loc.end.line;
    lintMessage.endColumn = loc.end.column;
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
  const loc = warning.loc;
  const message = warning.message;

  const lintMessage = {
    ruleId: null,
    severity: 1,
    message,
    line: loc.start.line,
    column: loc.start.column,
  };

  if (loc.end) {
    lintMessage.endLine = loc.end.line;
    lintMessage.endColumn = loc.end.column;
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
  const loc = fatal.loc;
  const message = fatal.message;

  const lintMessage = {
    ruleId: null,
    severity: 2,
    fatal: true,
    message,
    line: loc.start.line,
    column: loc.start.column,
  };

  if (loc.end) {
    lintMessage.endLine = loc.end.line;
    lintMessage.endColumn = loc.end.column;
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
      addRuleMessage("foo-rule", 2, node, location, null, { messageId: "testMessage" });
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
      addRuleMessage("foo-rule", 2, node, location, "foo", {
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
      addRuleMessage("foo-rule", 2, node, location, "foo", {
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
      const messageObject = addRuleMessage("foo-rule", 2, node, location, "foo", {
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
          addRuleMessage("foo-rule", 2, node, location, "foo", {
            messageId: "testMessage",
          }),
        TypeError,
        "context.report() called with a message and a messageId. Please only pass one.",
      );
      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when an invalid messageId is provided", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, node, location, null, {
            messageId: "thisIsNotASpecifiedMessageId",
          }),
        TypeError,
        /^context\.report\(\) called with a messageId of '[^']+' which is not present in the 'messages' config:/u,
      );
      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when no message is provided", () => {
      assert.throws(
        () => addRuleMessage("foo-rule", 2, node, location, null, {}),
        TypeError,
        "Missing `message` property in report() call; add a message that describes the linting problem.",
      );
      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when a suggestion defines both a desc and messageId", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, node, location, "foo", {
            suggest: [
              {
                desc: "The description",
                messageId: "suggestion1",
                fix: () => ({ range: [2, 3], text: "s1" }),
              },
            ],
          }),
        TypeError,
        "context.report() called with a suggest option that defines both a 'messageId' and an 'desc'. Please only pass one.",
      );
      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when a suggestion uses an invalid messageId", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, node, location, "foo", {
            suggest: [
              {
                messageId: "noMatchingMessage",
                fix: () => ({ range: [2, 3], text: "s1" }),
              },
            ],
          }),
        TypeError,
        /^context\.report\(\) called with a suggest option with a messageId '[^']+' which is not present in the 'messages' config:/u,
      );
      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when a suggestion does not provide either a desc or messageId", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, node, location, "foo", {
            suggest: [
              {
                fix: () => ({ range: [2, 3], text: "s1" }),
              },
            ],
          }),
        TypeError,
        "context.report() called with a suggest option that doesn't have either a `desc` or `messageId`",
      );
      assert.strictEqual(fileReport.messages.length, 0);
    });

    it("should throw when a suggestion does not provide a fix function", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, node, location, "foo", {
            suggest: [
              {
                desc: "The description",
                fix: false,
              },
            ],
          }),
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
      addError({ message: "test error message", loc });
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
      const warning = addWarning({ message: "test warning message", loc });
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
      const fatal = addFatal({ message: "test fatal message", loc });
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
});