```javascript
/**
 * @fileoverview Disallow parenthesising higher precedence subexpressions.
 * @author Michael Ficarra
 * @deprecated in ESLint v8.53.0
 */
"use strict";

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const {
  isParenthesized: isParenthesizedRaw,
} = require("@eslint-community/eslint-utils");
const astUtils = require("./utils/ast-utils.js");

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
            name: "no-extra-parens",
            url: "https://eslint.style/rules/no-extra-parens",
          },
        },
      ],
    },
    type: "layout",

    docs: {
      description: "Disallow unnecessary parentheses",
      recommended: false,
      url: "https://eslint.org/docs/latest/rules/no-extra-parens",
    },

    fixable: "code",

    schema: {
      anyOf: [
        {
          type: "array",
          items: [
            {
              enum: ["functions"],
            },
          ],
          minItems: 0,
          maxItems: 1,
        },
        {
          type: "array",
          items: [
            {
              enum: ["all"],
            },
            {
              type: "object",
              properties: {
                conditionalAssign: { type: "boolean" },
                ternaryOperandBinaryExpressions: {
                  type: "boolean",
                },
                nestedBinaryExpressions: { type: "boolean" },
                returnAssign: { type: "boolean" },
                ignoreJSX: {
                  enum: [
                    "none",
                    "all",
                    "single-line",
                    "multi-line",
                  ],
                },
                enforceForArrowConditionals: {
                  type: "boolean",
                },
                enforceForSequenceExpressions: {
                  type: "boolean",
                },
                enforceForNewInMemberExpressions: {
                  type: "boolean",
                },
                enforceForFunctionPrototypeMethods: {
                  type: "boolean",
                },
                allowParensAfterCommentPattern: {
                  type: "string",
                },
              },
              additionalProperties: false,
            },
          ],
          minItems: 0,
          maxItems: 2,
        },
      ],
    },

    messages: {
      unexpected: "Unnecessary parentheses around expression.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    const tokensToIgnore = new WeakSet();
    const precedence = astUtils.getPrecedence;
    const ALL_NODES = context.options[0] !== "functions";
    const EXCEPT_COND_ASSIGN =
      ALL_NODES &&
      context.options[1] &&
      context.options[1].conditionalAssign === false;
    const EXCEPT_COND_TERNARY =
      ALL_NODES &&
      context.options[1] &&
      context.options[1].ternaryOperandBinaryExpressions === false;
    const NESTED_BINARY =
      ALL_NODES &&
      context.options[1] &&
      context.options[1].nestedBinaryExpressions === false;
    const EXCEPT_RETURN_ASSIGN =
      ALL_NODES &&
      context.options[1] &&
      context.options[1].returnAssign === false;
    const IGNORE_JSX =
      ALL_NODES && context.options[1] && context.options[1].ignoreJSX;
    const IGNORE_ARROW_CONDITIONALS =
      ALL_NODES &&
      context.options[1] &&
      context.options[1].enforceForArrowConditionals === false;
    const IGNORE_SEQUENCE_EXPRESSIONS =
      ALL_NODES &&
      context.options[1] &&
      context.options[1].enforceForSequenceExpressions === false;
    const IGNORE_NEW_IN_MEMBER_EXPR =
      ALL_NODES &&
      context.options[1] &&
      context.options[1].enforceForNewInMemberExpressions === false;
    const IGNORE_FUNCTION_PROTOTYPE_METHODS =
      ALL_NODES &&
      context.options[1] &&
      context.options[1].enforceForFunctionPrototypeMethods === false;
    const ALLOW_PARENS_AFTER_COMMENT_PATTERN =
      ALL_NODES &&
      context.options[1] &&
      context.options[1].allowParensAfterCommentPattern;

    const PRECEDENCE_OF_ASSIGNMENT_EXPR = precedence({
      type: "AssignmentExpression",
    });
    const PRECEDENCE_OF_UPDATE_EXPR = precedence({
      type: "UpdateExpression",
    });

    let reportsBuffer;

    function isParenthesised(node) {
      return isParenthesizedRaw(1, node, sourceCode);
    }

    function isParenthesisedTwice(node) {
      return isParenthesizedRaw(2, node, sourceCode);
    }

    function hasExcessParens(node) {
      return isParenthesised(node);
    }

    function hasDoubleExcessParens(node) {
      return isParenthesisedTwice(node);
    }

    function hasExcessParensWithPrecedence(node, precedenceLowerLimit) {
      if (hasExcessParens(node)) {
        if (
          precedence(node) >= precedenceLowerLimit ||
          hasDoubleExcessParens(node)
        ) {
          return true;
        }
      }
      return false;
    }

    function report(node) {
      const leftParenToken = sourceCode.getTokenBefore(node);
      const rightParenToken = sourceCode.getTokenAfter(node);

      if (!isParenthesisedTwice(node)) {
        if (tokensToIgnore.has(sourceCode.getFirstToken(node))) {
          return;
        }

        if (isIIFE(node) && !isParenthesised(node.callee)) {
          return;
        }

        if (ALLOW_PARENS_AFTER_COMMENT_PATTERN) {
          const commentsBeforeLeftParenToken =
            sourceCode.getCommentsBefore(leftParenToken);
          const totalCommentsBeforeLeftParenTokenCount =
            commentsBeforeLeftParenToken.length;
          const ignorePattern = new RegExp(
            ALLOW_PARENS_AFTER_COMMENT_PATTERN,
            "u",
          );

          if (
            totalCommentsBeforeLeftParenTokenCount > 0 &&
            ignorePattern.test(
              commentsBeforeLeftParenToken[
                totalCommentsBeforeLeftParenTokenCount - 1
              ].value,
            )
          ) {
            return;
          }
        }
      }

      context.report({
        node,
        loc: leftParenToken.loc,
        messageId: "unexpected",
        fix: fixer => {
          const parenthesizedSource =
            sourceCode.text.slice(
              leftParenToken.range[1],
              rightParenToken.range[0],
            );

          return fixer.replaceTextRange(
            [
              leftParenToken.range[0],
              rightParenToken.range[1],
            ],
            parenthesizedSource,
          );
        },
      });
    }

    function checkArgumentWithPrecedence(node) {
      if (hasExcessParensWithPrecedence(node.argument, precedence(node))) {
        report(node.argument);
      }
    }

    function checkBinaryLogical(node) {
      const prec = precedence(node);
      const leftPrecedence = precedence(node.left);
      const rightPrecedence = precedence(node.right);
      const isExponentiation = node.operator === "**";
      const shouldSkipLeft =
        NESTED_BINARY &&
        (node.left.type === "BinaryExpression" ||
          node.left.type === "LogicalExpression");
      const shouldSkipRight =
        NESTED_BINARY &&
        (node.right.type === "BinaryExpression" ||
          node.right.type === "LogicalExpression");

      if (!shouldSkipLeft && hasExcessParens(node.left)) {
        if (
          !(
            ["AwaitExpression", "UnaryExpression"].includes(node.left.type) &&
            isExponentiation
          ) &&
          !astUtils.isMixedLogicalAndCoalesceExpressions(
            node.left,
            node,
          ) &&
          (leftPrecedence > prec ||
            (leftPrecedence === prec && !isExponentiation))
        ) {
          report(node.left);
        }
      }

      if (!shouldSkipRight && hasExcessParens(node.right)) {
        if (
          !astUtils.isMixedLogicalAndCoalesceExpressions(
            node.right,
            node,
          ) &&
          (rightPrecedence > prec ||
            (rightPrecedence === prec && isExponentiation))
        ) {
          report(node.right);
        }
      }
    }

    function checkCallNew(node) {
      const callee = node.callee;

      if (hasExcessParensWithPrecedence(callee, precedence(node))) {
        report(callee);
      }

      node.arguments
        .filter(arg =>
          hasExcessParensWithPrecedence(
            arg,
            PRECEDENCE_OF_ASSIGNMENT_EXPR,
          ),
        )
        .forEach(report);
    }

    function checkExpressionOrExportStatement(node) {
      if (hasExcessParens(node)) {
        report(node);
      }
    }

    function checkClass(node) {
      if (node.superClass) {
        if (hasExcessParens(node.superClass)) {
          report(node.superClass);
        }
      }
    }

    function checkSpreadOperator(node) {
      if (hasExcessParens(node.argument)) {
        report(node.argument);
      }
    }

    return {
      ArrayExpression(node) {
        node.elements
          .filter(e => e && hasExcessParens(e))
          .forEach(report);
      },

      ArrayPattern(node) {
        node.elements
          .filter(e => e && hasExcessParens(e))
          .forEach(report);
      },

      ArrowFunctionExpression(node) {
        if (node.body.type !== "BlockStatement") {
          if (hasExcessParens(node.body)) {
            report(node.body);
          }
        }
      },

      AssignmentExpression(node) {
        if (hasExcessParens(node.left)) {
          report(node.left);
        }

        if (hasExcessParens(node.right)) {
          report(node.right);
        }
      },

      BinaryExpression(node) {
        checkBinaryLogical(node);
      },

      CallExpression: checkCallNew,

      ConditionalExpression(node) {
        if (hasExcessParens(node.test)) {
          report(node.test);
        }

        if (hasExcessParens(node.consequent)) {
          report(node.consequent);
        }

        if (hasExcessParens(node.alternate)) {
          report(node.alternate);
        }
      },

      ClassDeclaration: checkClass,
      ClassExpression: checkClass,

      ExportDefaultDeclaration: node =>
        checkExpressionOrExportStatement(node.declaration),
      ExpressionStatement: node =>
        checkExpressionOrExportStatement(node.expression),

      ForInStatement(node) {
        if (hasExcessParens(node.left)) {
          report(node.left);
        }

        if (hasExcessParens(node.right)) {
          report(node.right);
        }
      },

      ForOfStatement(node) {
        if (hasExcessParens(node.left)) {
          report(node.left);
        }

        if (hasExcessParens(node.right)) {
          report(node.right);
        }
      },

      ForStatement(node) {
        if (node.test && hasExcessParens(node.test)) {
          report(node.test);
        }

        if (node.update && hasExcessParens(node.update)) {
          report(node.update);
        }
      },

      IfStatement(node) {
        if (hasExcessParens(node.test)) {
          report(node.test);
        }
      },

      LogicalExpression: checkBinaryLogical,

      MemberExpression(node) {
        if (hasExcessParens(node.object)) {
          report(node.object);
        }

        if (node.computed && hasExcessParens(node.property)) {
          report(node.property);
        }
      },

      NewExpression: checkCallNew,

      ObjectExpression(node) {
        node.properties
          .filter(property => property.value && hasExcessParens(property.value))
          .forEach(property => report(property.value));
      },

      ObjectPattern(node) {
        node.properties
          .filter(property => property.value && hasExcessParens(property.value))
          .forEach(property => report(property.value));
      },

      Property(node) {
        if (node.computed && hasExcessParens(node.key)) {
          report(node.key);
        }
      },

      ReturnStatement(node) {
        if (node.argument && hasExcessParens(node.argument)) {
          report(node.argument);
        }
      },

      SequenceExpression(node) {
        node.expressions
          .filter(e => e && hasExcessParens(e))
          .forEach(report);
      },

      SpreadElement: checkSpreadOperator,
      SpreadProperty: checkSpreadOperator,
      ExperimentalSpreadProperty: checkSpreadOperator,

      TemplateLiteral(node) {
        node.expressions
          .filter(e => e && hasExcessParens(e))
          .forEach(report);
      },

      UnaryExpression: checkArgumentWithPrecedence,
      UpdateExpression(node) {
        if (node.prefix) {
          checkArgumentWithPrecedence(node);
        } else {
          const { argument } = node;
          const operatorToken = sourceCode.getLastToken(node);

          if (
            argument.loc.end.line === operatorToken.loc.start.line
          ) {
            checkArgumentWithPrecedence(node);
          } else {
            if (hasDoubleExcessParens(argument)) {
              report(argument);
            }
          }
        }
      },
      AwaitExpression: checkArgumentWithPrecedence,

      VariableDeclarator(node) {
        if (node.init && hasExcessParens(node.init)) {
          report(node.init);
        }
      },

      WhileStatement(node) {
        if (node.test && hasExcessParens(node.test)) {
          report(node.test);
        }
      },

      WithStatement(node) {
        if (hasExcessParens(node.object)) {
          report(node.object);
        }
      },

      YieldExpression(node) {
        if (node.argument) {
          const yieldToken = sourceCode.getFirstToken(node);

          if (
            precedence(node.argument) >= precedence(node) &&
            hasExcessParensNoLineTerminator(yieldToken, node.argument)
          ) {
            report(node.argument);
          }
        }
      },
    };
  },
};
```