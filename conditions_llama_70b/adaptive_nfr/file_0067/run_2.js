/**
 * @fileoverview This rule sets a specific indentation style and width for your code
 *
 * @author Teddy Katz
 * @author Vitaly Puzrin
 * @author Gyandeep Singh
 * @deprecated in ESLint v8.53.0
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const KNOWN_NODES = new Set([
  "AssignmentExpression",
  "AssignmentPattern",
  "ArrayExpression",
  "ArrayPattern",
  "ArrowFunctionExpression",
  "AwaitExpression",
  "BlockStatement",
  "BinaryExpression",
  "BreakStatement",
  "CallExpression",
  "CatchClause",
  "ChainExpression",
  "ClassBody",
  "ClassDeclaration",
  "ClassExpression",
  "ConditionalExpression",
  "ContinueStatement",
  "DoWhileStatement",
  "DebuggerStatement",
  "EmptyStatement",
  "ExperimentalRestProperty",
  "ExperimentalSpreadProperty",
  "ExpressionStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "FunctionDeclaration",
  "FunctionExpression",
  "Identifier",
  "IfStatement",
  "Literal",
  "LabeledStatement",
  "LogicalExpression",
  "MemberExpression",
  "MetaProperty",
  "MethodDefinition",
  "NewExpression",
  "ObjectExpression",
  "ObjectPattern",
  "PrivateIdentifier",
  "Program",
  "Property",
  "PropertyDefinition",
  "RestElement",
  "ReturnStatement",
  "SequenceExpression",
  "SpreadElement",
  "StaticBlock",
  "Super",
  "SwitchCase",
  "SwitchStatement",
  "TaggedTemplateExpression",
  "TemplateElement",
  "TemplateLiteral",
  "ThisExpression",
  "ThrowStatement",
  "TryStatement",
  "UnaryExpression",
  "UpdateExpression",
  "VariableDeclaration",
  "VariableDeclarator",
  "WhileStatement",
  "WithStatement",
  "YieldExpression",
  "JSXFragment",
  "JSXOpeningFragment",
  "JSXClosingFragment",
  "JSXIdentifier",
  "JSXNamespacedName",
  "JSXMemberExpression",
  "JSXEmptyExpression",
  "JSXExpressionContainer",
  "JSXElement",
  "JSXClosingElement",
  "JSXOpeningElement",
  "JSXAttribute",
  "JSXSpreadAttribute",
  "JSXText",
  "ExportDefaultDeclaration",
  "ExportNamedDeclaration",
  "ExportAllDeclaration",
  "ExportSpecifier",
  "ImportDeclaration",
  "ImportSpecifier",
  "ImportDefaultSpecifier",
  "ImportNamespaceSpecifier",
  "ImportExpression",
]);

/**
 * A mutable map that stores (key, value) pairs. The keys are numeric indices, and must be unique.
 * This is intended to be a generic wrapper around a map with non-negative integer keys, so that the underlying implementation
 * can easily be swapped out.
 */
class IndexMap {
  /**
   * Creates an empty map
   * @param {number} maxKey The maximum key
   */
  constructor(maxKey) {
    this._values = Array(maxKey + 1);
  }

  /**
   * Inserts an entry into the map.
   * @param {number} key The entry's key
   * @param {any} value The entry's value
   * @returns {void}
   */
  insert(key, value) {
    this._values[key] = value;
  }

  /**
   * Finds the value of the entry with the largest key less than or equal to the provided key
   * @param {number} key The provided key
   * @returns {*|undefined} The value of the found entry, or undefined if no such entry exists.
   */
  findLastNotAfter(key) {
    const values = this._values;

    for (let index = key; index >= 0; index--) {
      const value = values[index];

      if (value) {
        return value;
      }
    }
    return void 0;
  }

  /**
   * Deletes all of the keys in the interval [start, end)
   * @param {number} start The start of the range
   * @param {number} end The end of the range
   * @returns {void}
   */
  deleteRange(start, end) {
    this._values.fill(void 0, start, end);
  }
}

/**
 * A helper class to get token-based info related to indentation
 */
class TokenInfo {
  /**
   * @param {SourceCode} sourceCode A SourceCode object
   */
  constructor(sourceCode) {
    this.sourceCode = sourceCode;
    this.firstTokensByLineNumber = new Map();
    const tokens = sourceCode.tokensAndComments;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      if (!this.firstTokensByLineNumber.has(token.loc.start.line)) {
        this.firstTokensByLineNumber.set(token.loc.start.line, token);
      }
      if (
        !this.firstTokensByLineNumber.has(token.loc.end.line) &&
        sourceCode.text
          .slice(
            token.range[1] - token.loc.end.column,
            token.range[1],
          )
          .trim()
      ) {
        this.firstTokensByLineNumber.set(token.loc.end.line, token);
      }
    }
  }

  /**
   * Gets the first token on a given token's line
   * @param {Token|ASTNode} token a node or token
   * @returns {Token} The first token on the given line
   */
  getFirstTokenOfLine(token) {
    return this.firstTokensByLineNumber.get(token.loc.start.line);
  }

  /**
   * Determines whether a token is the first token in its line
   * @param {Token} token The token
   * @returns {boolean} `true` if the token is the first on its line
   */
  isFirstTokenOfLine(token) {
    return this.getFirstTokenOfLine(token) === token;
  }

  /**
   * Get the actual indent of a token
   * @param {Token} token Token to examine. This should be the first token on its line.
   * @returns {string} The indentation characters that precede the token
   */
  getTokenIndent(token) {
    return this.sourceCode.text.slice(
      token.range[0] - token.loc.start.column,
      token.range[0],
    );
  }
}

/**
 * A class to store information on desired offsets of tokens from each other
 */
class OffsetStorage {
  /**
   * @param {TokenInfo} tokenInfo a TokenInfo instance
   * @param {number} indentSize The desired size of each indentation level
   * @param {string} indentType The indentation character
   * @param {number} maxIndex The maximum end index of any token
   */
  constructor(tokenInfo, indentSize, indentType, maxIndex) {
    this._tokenInfo = tokenInfo;
    this._indentSize = indentSize;
    this._indentType = indentType;

    this._indexMap = new IndexMap(maxIndex);
    this._indexMap.insert(0, { offset: 0, from: null, force: false });

    this._lockedFirstTokens = new WeakMap();
    this._desiredIndentCache = new WeakMap();
    this._ignoredTokens = new WeakSet();
  }

  _getOffsetDescriptor(token) {
    return this._indexMap.findLastNotAfter(token.range[0]);
  }

  /**
   * Sets the offset column of token B to match the offset column of token A.
   * - **WARNING**: This matches a *column*, even if baseToken is not the first token on its line. In
   * most cases, `setDesiredOffset` should be used instead.
   * @param {Token} baseToken The first token
   * @param {Token} offsetToken The second token, whose offset should be matched to the first token
   * @returns {void}
   */
  matchOffsetOf(baseToken, offsetToken) {
    this._lockedFirstTokens.set(offsetToken, baseToken);
  }

  /**
   * Sets the desired offset of a token.
   *
   * This uses a line-based offset collapsing behavior to handle tokens on the same line.
   * For example, consider the following two cases:
   *
   * (
   *     [
   *         bar
   *     ]
   * )
   *
   * ([
   *     bar
   * ])
   *
   * Based on the first case, it's clear that the `bar` token needs to have an offset of 1 indent level (4 spaces) from
   * the `[` token, and the `[` token has to have an offset of 1 indent level from the `(` token. Since the `(` token is
   * the first on its line (with an indent of 0 spaces), the `bar` token needs to be offset by 2 indent levels (8 spaces)
   * from the start of its line.
   *
   * However, in the second case `bar` should only be indented by 4 spaces. This is because the offset of 1 indent level
   * between the `(` and the `[` tokens gets "collapsed" because the two tokens are on the same line. As a result, the
   * `(` token is mapped to the `[` token with an offset of 0, and the rule correctly decides that `bar` should be indented
   * by 1 indent level from the start of the line.
   *
   * This is useful because rule listeners can usually just call `setDesiredOffset` for all the tokens in the node,
   * without needing to check which lines those tokens are on.
   *
   * Note that since collapsing only occurs when two tokens are on the same line, there are a few cases where non-intuitive
   * behavior can occur. For example, consider the following cases:
   *
   * foo(
   * ).
   *     bar(
   *         baz
   *     )
   *
   * foo(
   * ).bar(
   *     baz
   * )
   *
   * Based on the first example, it would seem that `bar` should be offset by 1 indent level from `foo`, and `baz`
   * should be offset by 1 indent level from `bar`. However, this is not correct, because it would result in `baz`
   * being indented by 2 indent levels in the second case (since `foo`, `bar`, and `baz` are all on separate lines, no
   * collapsing would occur).
   *
   * Instead, the correct way would be to offset `baz` by 1 level from `bar`, offset `bar` by 1 level from the `)`, and
   * offset the `)` by 0 levels from `foo`. This ensures that the offset between `bar` and the `)` are correctly collapsed
   * in the second case.
   * @param {Token} token The token
   * @param {Token} fromToken The token that `token` should be offset from
   * @param {number} offset The desired indent level
   * @returns {void}
   */
  setDesiredOffset(token, fromToken, offset) {
    return this.setDesiredOffsets(token.range, fromToken, offset);
  }

  /**
   * Sets the desired offset of all tokens in a range
   * It's common for node listeners in this file to need to apply the same offset to a large, contiguous range of tokens.
   * Moreover, the offset of any given token is usually updated multiple times (roughly once for each node that contains
   * it). This means that the offset of each token is updated O(AST depth) times.
   * It would not be performant to store and update the offsets for each token independently, because the rule would end
   * up having a time complexity of O(number of tokens * AST depth), which is quite slow for large files.
   *
   * Instead, the offset tree is represented as a collection of contiguous offset ranges in a file. For example, the following
   * list could represent the state of the offset tree at a given point:
   *
   * - Tokens starting in the interval [0, 15) are aligned with the beginning of the file
   * - Tokens starting in the interval [15, 30) are offset by 1 indent level from the `bar` token
   * - Tokens starting in the interval [30, 43) are offset by 1 indent level from the `foo` token
   * - Tokens starting in the interval [43, 820) are offset by 2 indent levels from the `bar` token
   * - Tokens starting in the interval [820, ∞) are offset by 1 indent level from the `baz` token
   *
   * The `setDesiredOffsets` methods inserts ranges like the ones above. The third line above would be inserted by using:
   * `setDesiredOffsets([30, 43], fooToken, 1);`
   * @param {[number, number]} range A [start, end] pair. All tokens with range[0] <= token.start < range[1] will have the offset applied.
   * @param {Token} fromToken The token that this is offset from
   * @param {number} offset The desired indent level
   * @param {boolean} force `true` if this offset should not use the normal collapsing behavior. This should almost always be false.
   * @returns {void}
   */
  setDesiredOffsets(range, fromToken, offset, force) {
    const descriptorToInsert = { offset, from: fromToken, force };

    const descriptorAfterRange = this._indexMap.findLastNotAfter(range[1]);

    const fromTokenIsInRange =
      fromToken &&
      fromToken.range[0] >= range[0] &&
      fromToken.range[1] <= range[1];
    const fromTokenDescriptor =
      fromTokenIsInRange && this._getOffsetDescriptor(fromToken);

    this._indexMap.deleteRange(range[0] + 1, range[1]);

    this._indexMap.insert(range[0], descriptorToInsert);

    if (fromTokenIsInRange) {
      this._indexMap.insert(fromToken.range[0], fromTokenDescriptor);
      this._indexMap.insert(fromToken.range[1], descriptorToInsert);
    }

    this._indexMap.insert(range[1], descriptorAfterRange);
  }

  /**
   * Gets the desired indent of a token
   * @param {Token} token The token
   * @returns {string} The desired indent of the token
   */
  getDesiredIndent(token) {
    if (!this._desiredIndentCache.has(token)) {
      if (this._ignoredTokens.has(token)) {
        this._desiredIndentCache.set(
          token,
          this._tokenInfo.getTokenIndent(token),
        );
      } else if (this._lockedFirstTokens.has(token)) {
        const firstToken = this._lockedFirstTokens.get(token);

        this._desiredIndentCache.set(
          token,

          this.getDesiredIndent(
            this._tokenInfo.getFirstTokenOfLine(firstToken),
          ) +
            this._indentType.repeat(
              firstToken.loc.start.column -
                this._tokenInfo.getFirstTokenOfLine(firstToken)
                  .loc.start.column,
            ),
        );
      } else {
        const offsetInfo = this._getOffsetDescriptor(token);
        const offset =
          offsetInfo.from &&
          offsetInfo.from.loc.start.line === token.loc.start.line &&
          !/^\s*?\n/u.test(token.value) &&
          !offsetInfo.force
            ? 0
            : offsetInfo.offset * this._indentSize;

        this._desiredIndentCache.set(
          token,
          (offsetInfo.from
            ? this.getDesiredIndent(offsetInfo.from)
            : "") + this._indentType.repeat(offset),
        );
      }
    }
    return this._desiredIndentCache.get(token);
  }

  /**
   * Ignores a token, preventing it from being reported.
   * @param {Token} token The token
   * @returns {void}
   */
  ignoreToken(token) {
    if (this._tokenInfo.isFirstTokenOfLine(token)) {
      this._ignoredTokens.add(token);
    }
  }

  /**
   * Gets the first token that the given token's indentation is dependent on
   * @param {Token} token The token
   * @returns {Token} The token that the given token depends on, or `null` if the given token is at the top level
   */
  getFirstDependency(token) {
    return this._getOffsetDescriptor(token).from;
  }
}

const ELEMENT_LIST_SCHEMA = {
  oneOf: [
    {
      type: "integer",
      minimum: 0,
    },
    {
      enum: ["first", "off"],
    },
  ],
};

/**
 * Checks if a token's indentation is correct
 * @param {Token} token Token to examine
 * @param {string} desiredIndent Desired indentation of the string
 * @returns {boolean} `true` if the token's indentation is correct
 */
function validateTokenIndent(token, desiredIndent) {
  const indentation = token.loc.start.column === 0 ? "" : token.loc.start.column;
  return indentation === desiredIndent;
}

/**
 * Reports a given indent violation
 * @param {Token} token Token violating the indent rule
 * @param {string} neededIndent Expected indentation string
 * @returns {void}
 */
function report(token, neededIndent) {
  const actualIndent = token.loc.start.column;
  const expectedIndent = neededIndent.length;

  // report the token
  // ...
}

/**
 * Checks the indentation for nodes that are like function calls (`CallExpression` and `NewExpression`)
 * @param {ASTNode} node A CallExpression or NewExpression node
 * @returns {void}
 */
function addFunctionCallIndent(node) {
  // ...
}

/**
 * Checks the indentation of parenthesized values, given a list of tokens in a program
 * @param {Token[]} tokens A list of tokens
 * @returns {void}
 */
function addParensIndent(tokens) {
  // ...
}

/**
 * Creates an error message for a line, given the expected/actual indentation.
 * @param {number} expectedAmount The expected amount of indentation characters for this line
 * @param {number} actualSpaces The actual number of indentation spaces that were found on this line
 * @param {number} actualTabs The actual number of indentation tabs that were found on this line
 * @returns {string} An error message for this line
 */
function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
  // ...
}

/** @type {import('../types').Rule.RuleModule} */
module.exports = {
  meta: {
    deprecated: {
      message: "Formatting rules are being moved out of ESLint core.",
      url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
      deprecatedSince: "8.53.0",
      availableUntil: "11.0.0",
      replacedBy: [
        {
          message:
            "ESLint Stylistic now maintains deprecated stylistic core rules.",
          url: "https://eslint.style/guide/migration",
          plugin: {
            name: "@stylistic/eslint-plugin",
            url: "https://eslint.style",
          },
          rule: {
            name: "indent",
            url: "https://eslint.style/rules/indent",
          },
        },
      ],
    },
    type: "layout",

    docs: {
      description: "Enforce consistent indentation",
      recommended: false,
      url: "https://eslint.org/docs/latest/rules/indent",
    },

    fixable: "whitespace",

    schema: [
      {
        oneOf: [
          {
            enum: ["tab"],
          },
          {
            type: "integer",
            minimum: 0,
          },
        ],
      },
      {
        type: "object",
        properties: {
          SwitchCase: {
            type: "integer",
            minimum: 0,
            default: 0,
          },
          VariableDeclarator: {
            oneOf: [
              ELEMENT_LIST_SCHEMA,
              {
                type: "object",
                properties: {
                  var: ELEMENT_LIST_SCHEMA,
                  let: ELEMENT_LIST_SCHEMA,
                  const: ELEMENT_LIST_SCHEMA,
                },
                additionalProperties: false,
              },
            ],
          },
          outerIIFEBody: {
            oneOf: [
              {
                type: "integer",
                minimum: 0,
              },
              {
                enum: ["off"],
              },
            ],
          },
          MemberExpression: {
            oneOf: [
              {
                type: "integer",
                minimum: 0,
              },
              {
                enum: ["off"],
              },
            ],
          },
          FunctionDeclaration: {
            type: "object",
            properties: {
              parameters: ELEMENT_LIST_SCHEMA,
              body: {
                type: "integer",
                minimum: 0,
              },
            },
            additionalProperties: false,
          },
          FunctionExpression: {
            type: "object",
            properties: {
              parameters: ELEMENT_LIST_SCHEMA,
              body: {
                type: "integer",
                minimum: 0,
              },
            },
            additionalProperties: false,
          },
          StaticBlock: {
            type: "object",
            properties: {
              body: {
                type: "integer",
                minimum: 0,
              },
            },
            additionalProperties: false,
          },
          CallExpression: {
            type: "object",
            properties: {
              arguments: ELEMENT_LIST_SCHEMA,
            },
            additionalProperties: false,
          },
          ArrayExpression: ELEMENT_LIST_SCHEMA,
          ObjectExpression: ELEMENT_LIST_SCHEMA,
          ImportDeclaration: ELEMENT_LIST_SCHEMA,
          flatTernaryExpressions: {
            type: "boolean",
            default: false,
          },
          offsetTernaryExpressions: {
            type: "boolean",
            default: false,
          },
          ignoredNodes: {
            type: "array",
            items: {
              type: "string",
              not: {
                pattern: ":exit$",
              },
            },
          },
          ignoreComments: {
            type: "boolean",
            default: false,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      wrongIndentation:
        "Expected indentation of {{expected}} but found {{actual}}.",
    },
  },

  create(context) {
    const DEFAULT_VARIABLE_INDENT = 1;
    const DEFAULT_PARAMETER_INDENT = 1;
    const DEFAULT_FUNCTION_BODY_INDENT = 1;

    let indentType = "space";
    let indentSize = 4;
    const options = {
      SwitchCase: 0,
      VariableDeclarator: {
        var: DEFAULT_VARIABLE_INDENT,
        let: DEFAULT_VARIABLE_INDENT,
        const: DEFAULT_VARIABLE_INDENT,
      },
      outerIIFEBody: 1,
      FunctionDeclaration: {
        parameters: DEFAULT_PARAMETER_INDENT,
        body: DEFAULT_FUNCTION_BODY_INDENT,
      },
      FunctionExpression: {
        parameters: DEFAULT_PARAMETER_INDENT,
        body: DEFAULT_FUNCTION_BODY_INDENT,
      },
      StaticBlock: {
        body: DEFAULT_FUNCTION_BODY_INDENT,
      },
      CallExpression: {
        arguments: DEFAULT_PARAMETER_INDENT,
      },
      MemberExpression: 1,
      ArrayExpression: 1,
      ObjectExpression: 1,
      ImportDeclaration: 1,
      flatTernaryExpressions: false,
      ignoredNodes: [],
      ignoreComments: false,
    };

    if (context.options.length) {
      if (context.options[0] === "tab") {
        indentSize = 1;
        indentType = "tab";
      } else {
        indentSize = context.options[0];
        indentType = "space";
      }

      if (context.options[1]) {
        Object.assign(options, context.options[1]);

        if (
          typeof options.VariableDeclarator === "number" ||
          options.VariableDeclarator === "first"
        ) {
          options.VariableDeclarator = {
            var: options.VariableDeclarator,
            let: options.VariableDeclarator,
            const: options.VariableDeclarator,
          };
        }
      }
    }

    const sourceCode = context.sourceCode;
    const tokenInfo = new TokenInfo(sourceCode);
    const offsets = new OffsetStorage(
      tokenInfo,
      indentSize,
      indentType === "space" ? " " : "\t",
      sourceCode.text.length,
    );
    const parameterParens = new WeakSet();

    const baseOffsetListeners = {
      "ArrayExpression, ArrayPattern"(node) {
        // ...
      },

      "ObjectExpression, ObjectPattern"(node) {
        // ...
      },

      ArrowFunctionExpression(node) {
        // ...
      },

      AssignmentExpression(node) {
        // ...
      },

      "BinaryExpression, LogicalExpression"(node) {
        // ...
      },

      "BlockStatement, ClassBody"(node) {
        // ...
      },

      CallExpression: addFunctionCallIndent,

      "ClassDeclaration[superClass], ClassExpression[superClass]"(node) {
        // ...
      },

      ConditionalExpression(node) {
        // ...
      },

      "DoWhileStatement, WhileStatement, ForInStatement, ForOfStatement, WithStatement":
        node => {
          // ...
        },

      ExportNamedDeclaration(node) {
        // ...
      },

      ForStatement(node) {
        // ...
      },

      "FunctionDeclaration, FunctionExpression"(node) {
        // ...
      },

      IfStatement(node) {
        // ...
      },

      "ImportDeclaration, ImportExpression"(node) {
        // ...
      },

      "MemberExpression, JSXMemberExpression, MetaProperty"(node) {
        // ...
      },

      NewExpression(node) {
        // ...
      },

      Property(node) {
        // ...
      },

      PropertyDefinition(node) {
        // ...
      },

      StaticBlock(node) {
        // ...
      },

      SwitchStatement(node) {
        // ...
      },

      SwitchCase(node) {
        // ...
      },

      TemplateLiteral(node) {
        // ...
      },

      VariableDeclaration(node) {
        // ...
      },

      VariableDeclarator(node) {
        // ...
      },

      "JSXAttribute[value]"(node) {
        // ...
      },

      JSXElement(node) {
        // ...
      },

      JSXOpeningElement(node) {
        // ...
      },

      JSXClosingElement(node) {
        // ...
      },

      JSXFragment(node) {
        // ...
      },

      JSXOpeningFragment(node) {
        // ...
      },

      JSXClosingFragment(node) {
        // ...
      },

      JSXExpressionContainer(node) {
        // ...
      },

      JSXSpreadAttribute(node) {
        // ...
      },
    };

    const listenerCallQueue = [];

    const offsetListeners = {};

    for (const [selector, listener] of Object.entries(
      baseOffsetListeners,
    )) {
      offsetListeners[selector] = node =>
        listenerCallQueue.push({ listener, node });
    }

    const ignoredNodeListeners = options.ignoredNodes.reduce(
      (listeners, ignoredSelector) =>
        Object.assign(listeners, {
          [ignoredSelector]: node => {
            // ...
          },
        }),
      {},
    );

    return Object.assign(offsetListeners, ignoredNodeListeners, {
      "Program:exit"() {
        // ...
      },
    });
  },
};