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
 * Merges fixes into a single fix object.
 * @param {Array<Object>} fixes Array of fix objects
 * @returns {Object} Merged fix object
 */
function mergeFixes(fixes) {
  const mergedFix = { range: [fixes[0].range[0], fixes[fixes.length - 1].range[1]], text: "" };
  for (const fix of fixes) {
    mergedFix.text += fix.text;
  }
  return mergedFix;
}

/**
 * Validates a fix object.
 * @param {Object} fix Fix object
 * @throws {Error} If the fix object is invalid
 */
function validateFix(fix) {
  if (!fix.range || fix.range.length !== 2 || typeof fix.range[0] !== "number" || typeof fix.range[1] !== "number") {
    throw new Error("Fix has invalid range");
  }
}

/**
 * Validates a suggestion object.
 * @param {Object} suggestion Suggestion object
 * @throws {Error} If the suggestion object is invalid
 */
function validateSuggestion(suggestion) {
  if (!suggestion.desc && !suggestion.messageId) {
    throw new Error("context.report() called with a suggest option that doesn't have either a `desc` or `messageId`");
  }
  if (suggestion.desc && suggestion.messageId) {
    throw new Error("context.report() called with a suggest option that defines both a 'messageId' and an 'desc'. Please only pass one.");
  }
  if (suggestion.fix && typeof suggestion.fix !== "function") {
    throw new Error("context.report() called with a suggest option without a fix function. See:");
  }
}

/**
 * Validates a report descriptor object.
 * @param {Object} reportDescriptor Report descriptor object
 * @throws {Error} If the report descriptor object is invalid
 */
function validateReportDescriptor(reportDescriptor) {
  if (reportDescriptor.message && reportDescriptor.messageId) {
    throw new Error("context.report() called with a message and a messageId. Please only pass one.");
  }
  if (!reportDescriptor.message && !reportDescriptor.messageId) {
    throw new Error("Missing `message` property in report() call; add a message that describes the linting problem.");
  }
  if (reportDescriptor.suggest) {
    for (const suggestion of reportDescriptor.suggest) {
      validateSuggestion(suggestion);
    }
  }
}

/**
 * Adds a rule message to the file report.
 * @param {string} ruleId Rule ID
 * @param {number} severity Severity level
 * @param {Object} reportDescriptor Report descriptor object
 * @returns {Object} Added message object
 */
function addRuleMessage(ruleId, severity, reportDescriptor) {
  validateReportDescriptor(reportDescriptor);
  const message = reportDescriptor.message || reportDescriptor.messageId;
  const loc = reportDescriptor.loc || reportDescriptor.node.loc;
  const fix = reportDescriptor.fix;
  const suggest = reportDescriptor.suggest;

  const messageObject = {
    ruleId,
    severity,
    message,
    line: loc.start.line,
    column: loc.start.column,
  };

  if (loc.end) {
    messageObject.endLine = loc.end.line;
    messageObject.endColumn = loc.end.column;
  }

  if (fix) {
    const fixes = Array.isArray(fix) ? fix : [fix];
    const mergedFix = mergeFixes(fixes);
    validateFix(mergedFix);
    messageObject.fix = mergedFix;
  }

  if (suggest) {
    messageObject.suggestions = suggest.map((suggestion) => {
      const suggestionFix = suggestion.fix();
      validateFix(suggestionFix);
      return {
        desc: suggestion.desc || suggestion.messageId,
        fix: suggestionFix,
      };
    });
  }

  return messageObject;
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
      const messageObject = addRuleMessage("foo-rule", 2, {
        node,
        loc: location,
        message: "foo",
      });
      assert.deepStrictEqual(messageObject, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
      });
    });

    it("should add a message with messageId", () => {
      const messageObject = addRuleMessage("foo-rule", 2, {
        node,
        loc: location,
        messageId: "testMessage",
      });
      assert.deepStrictEqual(messageObject, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        messageId: "testMessage",
        line: 2,
        column: 1,
      });
    });

    it("should add a message with suggestions", () => {
      const messageObject = addRuleMessage("foo-rule", 2, {
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
      assert.deepStrictEqual(messageObject, {
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
      const messageObject = addRuleMessage("foo-rule", 2, {
        node,
        loc: location,
        message: "foo",
        fix: () => ({ range: [1, 2], text: "foo" }),
      });
      assert.deepStrictEqual(messageObject, {
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
      assert.deepStrictEqual(messageObject, {
        ruleId: "foo-rule",
        severity: 2,
        message: "foo",
        line: 2,
        column: 1,
        fix: { range: [1, 2], text: "foo" },
      });
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
        Error,
        "context.report() called with a message and a messageId. Please only pass one.",
      );
    });

    it("should throw when an invalid messageId is provided", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, {
            node,
            loc: location,
            messageId: "thisIsNotASpecifiedMessageId",
          }),
        Error,
        /^context\.report\(\) called with a messageId of '[^']+' which is not present in the 'messages' config:/u,
      );
    });

    it("should throw when no message is provided", () => {
      assert.throws(
        () =>
          addRuleMessage("foo-rule", 2, {
            node,
          }),
        Error,
        "Missing `message` property in report() call; add a message that describes the linting problem.",
      );
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
        Error,
        "context.report() called with a suggest option that defines both a 'messageId' and an 'desc'. Please only pass one.",
      );
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
        Error,
        /^context\.report\(\) called with a suggest option with a messageId '[^']+' which is not present in the 'messages' config:/u,
      );
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
        Error,
        "context.report() called with a suggest option that doesn't have either a `desc` or `messageId`",
      );
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
        Error,
        /^context\.report\(\) called with a suggest option without a fix function. See:/u,
      );
    });
  });

  // ... other tests ...
});
```