/**
 * @fileoverview This option sets a specific tab width for your code
 *
 * This rule has been ported and modified from nodeca.
 * @author Vitaly Puzrin
 * @author Gyandeep Singh
 * @deprecated in ESLint v4.0.0
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------
// this rule has known coverage issues, but it's deprecated and shouldn't be updated in the future anyway.
/* c8 ignore next */
/** @type {import('../types').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "layout",

    docs: {
      description: "Enforce consistent indentation",
      recommended: false,
      url: "https://eslint.org/docs/latest/rules/indent-legacy",
    },

    deprecated: {
      message: "Formatting rules are being moved out of ESLint core.",
      url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
      deprecatedSince: "4.0.0",
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
          },
          VariableDeclarator: {
            oneOf: [
              {
                type: "integer",
                minimum: 0,
              },
              {
                type: "object",
                properties: {
                  var: {
                    type: "integer",
                    minimum: 0,
                  },
                  let: {
                    type: "integer",
                    minimum: 0,
                  },
                  const: {
                    type: "integer",
                    minimum: 0,
                  },
                },
              },
            ],
          },
          outerIIFEBody: {
            type: "integer",
            minimum: 0,
          },
          MemberExpression: {
            type: "integer",
            minimum: 0,
          },
          FunctionDeclaration: {
            type: "object",
            properties: {
              parameters: {
                oneOf: [
                  {
                    type: "integer",
                    minimum: 0,
                  },
                  {
                    enum: ["first"],
                  },
                ],
              },
              body: {
                type: "integer",
                minimum: 0,
              },
            },
          },
          FunctionExpression: {
            type: "object",
            properties: {
              parameters: {
                oneOf: [
                  {
                    type: "integer",
                    minimum: 0,
                  },
                  {
                    enum: ["first"],
                  },
                ],
              },
              body: {
                type: "integer",
                minimum: 0,
              },
            },
          },
          CallExpression: {
            type: "object",
            properties: {
              parameters: {
                oneOf: [
                  {
                    type: "integer",
                    minimum: 0,
                  },
                  {
                    enum: ["first"],
                  },
                ],
              },
            },
          },
          ArrayExpression: {
            oneOf: [
              {
                type: "integer",
                minimum: 0,
              },
              {
                enum: ["first"],
              },
            ],
          },
          ObjectExpression: {
            oneOf: [
              {
                type: "integer",
                minimum: 0,
              },
              {
                enum: ["first"],
              },
            ],
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      expected:
        "Expected indentation of {{expected}} but found {{actual}}.",
    },
  },

  create(context) {
    const DEFAULT_VARIABLE_INDENT = 1;
    const DEFAULT_PARAMETER_INDENT = null; // For backwards compatibility, don't check parameter indentation unless specified in the config
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
      outerIIFEBody: null,
      FunctionDeclaration: {
        parameters: DEFAULT_PARAMETER_INDENT,
        body: DEFAULT_FUNCTION_BODY_INDENT,
      },
      FunctionExpression: {
        parameters: DEFAULT_PARAMETER_INDENT,
        body: DEFAULT_FUNCTION_BODY_INDENT,
      },
      CallExpression: {
        arguments: DEFAULT_PARAMETER_INDENT,
      },
      ArrayExpression: 1,
      ObjectExpression: 1,
    };

    const sourceCode = context.sourceCode;

    // Process options
    function processOptions() {
      if (context.options.length) {
        if (context.options[0] === "tab") {
          indentSize = 1;
          indentType = "tab";
        } else if (typeof context.options[0] === "number") {
          indentSize = context.options[0];
          indentType = "space";
        }

        if (context.options[1]) {
          const opts = context.options[1];

          options.SwitchCase = opts.SwitchCase || 0;
          const variableDeclaratorRules = opts.VariableDeclarator;

          if (typeof variableDeclaratorRules === "number") {
            options.VariableDeclarator = {
              var: variableDeclaratorRules,
              let: variableDeclaratorRules,
              const: variableDeclaratorRules,
            };
          } else if (typeof variableDeclaratorRules === "object") {
            Object.assign(options.VariableDeclarator, variableDeclaratorRules);
          }

          if (typeof opts.outerIIFEBody === "number") {
            options.outerIIFEBody = opts.outerIIFEBody;
          }

          if (typeof opts.MemberExpression === "number") {
            options.MemberExpression = opts.MemberExpression;
          }

          if (typeof opts.FunctionDeclaration === "object") {
            Object.assign(options.FunctionDeclaration, opts.FunctionDeclaration);
          }

          if (typeof opts.FunctionExpression === "object") {
            Object.assign(options.FunctionExpression, opts.FunctionExpression);
          }

          if (typeof opts.CallExpression === "object") {
            Object.assign(options.CallExpression, opts.CallExpression);
          }

          if (
            typeof opts.ArrayExpression === "number" ||
            typeof opts.ArrayExpression === "string"
          ) {
            options.ArrayExpression = opts.ArrayExpression;
          }

          if (
            typeof opts.ObjectExpression === "number" ||
            typeof opts.ObjectExpression === "string"
          ) {
            options.ObjectExpression = opts.ObjectExpression;
          }
        }
      }
    }

    processOptions();

    // Helper functions
    function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
      // Creates an error message for a line, given the expected/actual indentation.
      const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`; // e.g. "2 tabs"
      const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`; // e.g. "space"
      const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`; // e.g. "tabs"
      let foundStatement;

      if (actualSpaces > 0 && actualTabs > 0) {
        foundStatement = `${actualSpaces} ${foundSpacesWord} and ${actualTabs} ${foundTabsWord}`; // e.g. "1 space and 2 tabs"
      } else if (actualSpaces > 0) {
        foundStatement =
          indentType === "space"
            ? actualSpaces
            : `${actualSpaces} ${foundSpacesWord}`;
      } else if (actualTabs > 0) {
        foundStatement =
          indentType === "tab"
            ? actualTabs
            : `${actualTabs} ${foundTabsWord}`;
      } else {
        foundStatement = "0";
      }
      return {
        expected: expectedStatement,
        actual: foundStatement,
      };
    }

    function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
      // Reports a given indent violation
      if (gottenSpaces && gottenTabs) {
        return;
      }

      const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);

      const textRange = isLastNodeCheck
        ? [
            node.range[1] - node.loc.end.column,
            node.range[1] - node.loc.end.column + gottenSpaces + gottenTabs,
          ]
        : [
            node.range[0] - node.loc.start.column,
            node.range[0] - node.loc.start.column + gottenSpaces + gottenTabs,
          ];

      context.report({
        node,
        loc,
        messageId: "expected",
        data: createErrorMessageData(needed, gottenSpaces, gottenTabs),
        fix: fixer => fixer.replaceTextRange(textRange, desiredIndent),
      });
    }

    function getNodeIndent(node, byLastLine) {
      // Get the actual indent of node
      const token = byLastLine
        ? sourceCode.getLastToken(node)
        : sourceCode.getFirstToken(node);
      const srcCharsBeforeNode = sourceCode
        .getText(token, token.loc.start.column)
        .split("");
      const indentChars = srcCharsBeforeNode.slice(
        0,
        srcCharsBeforeNode.findIndex(char => char !== " " && char !== "\t"),
      );
      const spaces = indentChars.filter(char => char === " ").length;
      const tabs = indentChars.filter(char => char === "\t").length;

      return {
        space: spaces,
        tab: tabs,
        goodChar: indentType === "space" ? spaces : tabs,
        badChar: indentType === "space" ? tabs : spaces,
      };
    }

    function isNodeFirstInLine(node, byEndLocation) {
      // Checks node is the first in its own start line.
      const firstToken =
        byEndLocation === true
          ? sourceCode.getLastToken(node, 1)
          : sourceCode.getTokenBefore(node);
      const startLine =
        byEndLocation === true
          ? node.loc.end.line
          : node.loc.start.line;
      const endLine = firstToken ? firstToken.loc.end.line : -1;

      return startLine !== endLine;
    }

    function checkNodeIndent(node, neededIndent) {
      // Check indent for node
      const actualIndent = getNodeIndent(node, false);

      if (
        node.type !== "ArrayExpression" &&
        node.type !== "ObjectExpression" &&
        (actualIndent.goodChar !== neededIndent ||
          actualIndent.badChar !== 0) &&
        isNodeFirstInLine(node)
      ) {
        report(node, neededIndent, actualIndent.space, actualIndent.tab);
      }

      if (node.type === "IfStatement" && node.alternate) {
        const elseToken = sourceCode.getTokenBefore(node.alternate);

        checkNodeIndent(elseToken, neededIndent);

        if (!isNodeFirstInLine(node.alternate)) {
          checkNodeIndent(node.alternate, neededIndent);
        }
      }

      if (node.type === "TryStatement" && node.handler) {
        const catchToken = sourceCode.getFirstToken(node.handler);

        checkNodeIndent(catchToken, neededIndent);
      }

      if (node.type === "TryStatement" && node.finalizer) {
        const finallyToken = sourceCode.getTokenBefore(node.finalizer);

        checkNodeIndent(finallyToken, neededIndent);
      }

      if (node.type === "DoWhileStatement") {
        const whileToken = sourceCode.getTokenAfter(node.body);

        checkNodeIndent(whileToken, neededIndent);
      }
    }

    function checkNodesIndent(nodes, indent) {
      // Check indent for nodes list
      nodes.forEach(node => checkNodeIndent(node, indent));
    }

    function checkLastNodeLineIndent(node, lastLineIndent) {
      // Check last node line indent this detects, that block closed correctly
      const lastToken = sourceCode.getLastToken(node);
      const endIndent = getNodeIndent(lastToken, true);

      if (
        (endIndent.goodChar !== lastLineIndent ||
          endIndent.badChar !== 0) &&
        isNodeFirstInLine(node, true)
      ) {
        report(
          node,
          lastLineIndent,
          endIndent.space,
          endIndent.tab,
          {
            line: lastToken.loc.start.line,
            column: lastToken.loc.start.column,
          },
          true,
        );
      }
    }

    function checkLastReturnStatementLineIndent(node, firstLineIndent) {
      // Check last node line indent this detects, that block closed correctly
      // This function for more complicated return statement case, where closing parenthesis may be followed by ';'
      const lastToken = sourceCode.getLastToken(
        node,
        astUtils.isClosingParenToken,
      );
      const textBeforeClosingParenthesis = sourceCode
        .getText(lastToken, lastToken.loc.start.column)
        .slice(0, -1);

      if (textBeforeClosingParenthesis.trim()) {
        return;
      }

      const endIndent = getNodeIndent(lastToken, true);

      if (endIndent.goodChar !== firstLineIndent) {
        report(
          node,
          firstLineIndent,
          endIndent.space,
          endIndent.tab,
          {
            line: lastToken.loc.start.line,
            column: lastToken.loc.start.column,
          },
          true,
        );
      }
    }

    function checkFirstNodeLineIndent(node, firstLineIndent) {
      // Check first node line indent is correct
      const startIndent = getNodeIndent(node, false);

      if (
        (startIndent.goodChar !== firstLineIndent ||
          startIndent.badChar !== 0) &&
        isNodeFirstInLine(node)
      ) {
        report(
          node,
          firstLineIndent,
          startIndent.space,
          startIndent.tab,
          {
            line: node.loc.start.line,
            column: node.loc.start.column,
          },
        );
      }
    }

    function getParentNodeByType(node, type, stopAtList) {
      // Returns a parent node of given node based on a specified type
      // if not present then return null
      let parent = node.parent;
      const stopAtSet = new Set(stopAtList || ["Program"]);

      while (
        parent.type !== type &&
        !stopAtSet.has(parent.type) &&
        parent.type !== "Program"
      ) {
        parent = parent.parent;
      }

      return parent.type === type ? parent : null;
    }

    function getVariableDeclaratorNode(node) {
      // Returns the VariableDeclarator based on the current node
      // if not present then return null
      return getParentNodeByType(node, "VariableDeclarator");
    }

    function isNodeInVarOnTop(node, varNode) {
      // Check to see if the node is part of the multi-line variable declaration.
      // Also if its on the same line as the varNode
      return (
        varNode &&
        varNode.parent.loc.start.line === node.loc.start.line &&
        varNode.parent.declarations.length > 1
      );
    }

    function isArgBeforeCalleeNodeMultiline(node) {
      // Check to see if the argument before the callee node is multi-line and
      // there should only be 1 argument before the callee node
      const parent = node.parent;

      if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
        return (
          parent.arguments[0].loc.end.line >
          parent.arguments[0].loc.start.line
        );
      }

      return false;
    }

    function isOuterIIFE(node) {
      // Check to see if the node is a file level IIFE
      const parent = node.parent;
      let stmt = parent.parent;

      if (parent.type !== "CallExpression" || parent.callee !== node) {
        return false;
      }

      while (
        (stmt.type === "UnaryExpression" &&
          (stmt.operator === "!" ||
            stmt.operator === "~" ||
            stmt.operator === "+" ||
            stmt.operator === "-")) ||
        stmt.type === "AssignmentExpression" ||
        stmt.type === "LogicalExpression" ||
        stmt.type === "SequenceExpression" ||
        stmt.type === "VariableDeclarator"
      ) {
        stmt = stmt.parent;
      }

      return (
        (stmt.type === "ExpressionStatement" ||
          stmt.type === "VariableDeclaration") &&
        stmt.parent &&
        stmt.parent.type === "Program"
      );
    }

    function checkIndentInFunctionBlock(node) {
      // Check indent for function block content
      const calleeNode = node.parent; // FunctionExpression
      let indent;

      if (
        calleeNode.parent &&
        (calleeNode.parent.type === "Property" ||
          calleeNode.parent.type === "ArrayExpression")
      ) {
        indent = getNodeIndent(calleeNode, false).goodChar;
      } else {
        indent = getNodeIndent(calleeNode).goodChar;
      }

      if (calleeNode.parent.type === "CallExpression") {
        const calleeParent = calleeNode.parent;

        if (
          calleeNode.type !== "FunctionExpression" &&
          calleeNode.type !== "ArrowFunctionExpression"
        ) {
          if (
            calleeParent &&
            calleeParent.loc.start.line < node.loc.start.line
          ) {
            indent = getNodeIndent(calleeParent).goodChar;
          }
        } else {
          if (
            isArgBeforeCalleeNodeMultiline(calleeNode) &&
            calleeParent.callee.loc.start.line ===
              calleeParent.callee.loc.end.line &&
            !isNodeFirstInLine(calleeNode)
          ) {
            indent = getNodeIndent(calleeParent).goodChar;
          }
        }
      }

      let functionOffset = indentSize;

      if (options.outerIIFEBody !== null && isOuterIIFE(calleeNode)) {
        functionOffset = options.outerIIFEBody * indentSize;
      } else if (calleeNode.type === "FunctionExpression") {
        functionOffset = options.FunctionExpression.body * indentSize;
      } else if (calleeNode.type === "FunctionDeclaration") {
        functionOffset = options.FunctionDeclaration.body * indentSize;
      }
      indent += functionOffset;

      const parentVarNode = getVariableDeclaratorNode(node);

      if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
        indent +=
          indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
      }

      if (node.body.length > 0) {
        checkNodesIndent(node.body, indent);
      }

      checkLastNodeLineIndent(node, indent - functionOffset);
    }

    function isSingleLineNode(node) {
      // Checks if the given node starts and ends on the same line
      const lastToken = sourceCode.getLastToken(node);
      const startLine = node.loc.start.line;
      const endLine = lastToken.loc.end.line;

      return startLine === endLine;
    }

    function checkIndentInArrayOrObjectBlock(node) {
      // Check indent for array block content or object block content
      if (isSingleLineNode(node)) {
        return;
      }

      let elements =
        node.type === "ArrayExpression"
          ? node.elements
          : node.properties;

      elements = elements.filter(elem => elem !== null);

      let nodeIndent;
      let elementsIndent;
      const parentVarNode = getVariableDeclaratorNode(node);

      if (isNodeFirstInLine(node)) {
        const parent = node.parent;

        nodeIndent = getNodeIndent(parent).goodChar;
        if (
          !parentVarNode ||
          parentVarNode.loc.start.line !== node.loc.start.line
        ) {
          if (
            parent.type !== "VariableDeclarator" ||
            parentVarNode === parentVarNode.parent.declarations[0]
          ) {
            if (
              parent.type === "VariableDeclarator" &&
              parentVarNode.loc.start.line === parent.loc.start.line
            ) {
              nodeIndent +=
                indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
            } else if (
              parent.type === "ObjectExpression" ||
              parent.type === "ArrayExpression"
            ) {
              const parentElements =
                node.parent.type === "ObjectExpression"
                  ? node.parent.properties
                  : node.parent.elements;

              if (
                parentElements[0] &&
                parentElements[0].loc.start.line ===
                  parent.loc.start.line &&
                parentElements[0].loc.end.line !== parent.loc.start.line
              ) {
                // If the first element of the array spans multiple lines, don't increase the expected indentation of the rest.
              } else if (typeof options[parent.type] === "number") {
                nodeIndent += options[parent.type] * indentSize;
              } else {
                nodeIndent = parentElements[0].loc.start.column;
              }
            } else if (
              parent.type === "CallExpression" ||
              parent.type === "NewExpression"
            ) {
              if (typeof options.CallExpression.arguments === "number") {
                nodeIndent +=
                  options.CallExpression.arguments * indentSize;
              } else if (options.CallExpression.arguments === "first") {
                if (parent.arguments.includes(node)) {
                  nodeIndent = parent.arguments[0].loc.start.column;
                }
              } else {
                nodeIndent += indentSize;
              }
            } else if (
              parent.type === "LogicalExpression" ||
              parent.type === "ArrowFunctionExpression"
            ) {
              nodeIndent += indentSize;
            }
          }
        }
      } else {
        nodeIndent = getNodeIndent(node).goodChar;
      }

      if (options[node.type] === "first") {
        elementsIndent = elements.length
          ? elements[0].loc.start.column
          : 0; // If there are no elements, elementsIndent doesn't matter.
      } else {
        elementsIndent = nodeIndent + indentSize * options[node.type];
      }

      if (isNodeInVarOnTop(node, parentVarNode)) {
        elementsIndent +=
          indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
      }

      checkNodesIndent(elements, elementsIndent);

      if (elements.length > 0) {
        if (elements.at(-1).loc.end.line === node.loc.end.line) {
          return;
        }
      }

      checkLastNodeLineIndent(
        node,
        nodeIndent +
          (isNodeInVarOnTop(node, parentVarNode)
            ? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize
            : 0),
      );
    }

    function isNodeBodyBlock(node) {
      // Check if the node or node body is a BlockStatement or not
      return (
        node.type === "BlockStatement" ||
        node.type === "ClassBody" ||
        (node.body && node.body.type === "BlockStatement") ||
        (node.consequent && node.consequent.type === "BlockStatement")
      );
    }

    function blockIndentationCheck(node) {
      // Check indentation for blocks
      if (isSingleLineNode(node)) {
        return;
      }

      if (
        node.parent &&
        (node.parent.type === "FunctionExpression" ||
          node.parent.type === "FunctionDeclaration" ||
          node.parent.type === "ArrowFunctionExpression")
      ) {
        checkIndentInFunctionBlock(node);
        return;
      }

      let indent;
      let nodesToCheck;

      const statementsWithProperties = [
        "IfStatement",
        "WhileStatement",
        "ForStatement",
        "ForInStatement",
        "ForOfStatement",
        "DoWhileStatement",
        "ClassDeclaration",
        "TryStatement",
      ];

      if (
        node.parent &&
        statementsWithProperties.includes(node.parent.type) &&
        isNodeBodyBlock(node)
      ) {
        indent = getNodeIndent(node.parent).goodChar;
      } else if (node.parent && node.parent.type === "CatchClause") {
        indent = getNodeIndent(node.parent.parent).goodChar;
      } else {
        indent = getNodeIndent(node).goodChar;
      }

      if (
        node.type === "IfStatement" &&
        node.consequent.type !== "BlockStatement"
      ) {
        nodesToCheck = [node.consequent];
      } else if (Array.isArray(node.body)) {
        nodesToCheck = node.body;
      } else {
        nodesToCheck = [node.body];
      }

      if (nodesToCheck.length > 0) {
        checkNodesIndent(nodesToCheck, indent + indentSize);
      }

      if (node.type === "BlockStatement") {
        checkLastNodeLineIndent(node, indent);
      }
    }

    function filterOutSameLineVars(node) {
      // Filter out the elements which are on the same line of each other or the node.
      // basically have only 1 elements from each line except the variable declaration line.
      return node.declarations.reduce((finalCollection, elem) => {
        const lastElem = finalCollection.at(-1);

        if (
          (elem.loc.start.line !== node.loc.start.line && !lastElem) ||
          (lastElem && lastElem.loc.start.line !== elem.loc.start.line)
        ) {
          finalCollection.push(elem);
        }

        return finalCollection;
      }, []);
    }

    function checkIndentInVariableDeclarations(node) {
      // Check indentation for variable declarations
      const elements = filterOutSameLineVars(node);
      const nodeIndent = getNodeIndent(node).goodChar;
      const lastElement = elements.at(-1);

      const elementsIndent =
        nodeIndent + indentSize * options.VariableDeclarator[node.kind];

      checkNodesIndent(elements, elementsIndent);

      if (
        sourceCode.getLastToken(node).loc.end.line <=
        lastElement.loc.end.line
      ) {
        return;
      }

      const tokenBeforeLastElement = sourceCode.getTokenBefore(lastElement);

      if (tokenBeforeLastElement.value === ",") {
        checkLastNodeLineIndent(
          node,
          getNodeIndent(tokenBeforeLastElement).goodChar,
        );
      } else {
        checkLastNodeLineIndent(node, elementsIndent - indentSize);
      }
    }

    function blockLessNodes(node) {
      // Check and decide whether to check for indentation for blockless nodes
      // Scenarios are for or while statements without braces around them
      if (node.body.type !== "BlockStatement") {
        blockIndentationCheck(node);
      }
    }

    function expectedCaseIndent(node, providedSwitchIndent) {
      // Returns the expected indentation for the case statement
      const switchNode =
        node.type === "SwitchStatement" ? node : node.parent;
      const switchIndent =
        typeof providedSwitchIndent === "undefined"
          ? getNodeIndent(switchNode).goodChar
          : providedSwitchIndent;
      let caseIndent;

      if (switchNode.cases.length > 0 && options.SwitchCase === 0) {
        caseIndent = switchIndent;
      } else {
        caseIndent = switchIndent + indentSize * options.SwitchCase;
      }

      return caseIndent;
    }

    function isWrappedInParenthesis(node) {
      // Checks whether a return statement is wrapped in ()
      const regex = /^return\s*\(\s*\)/u;

      const statementWithoutArgument = sourceCode
        .getText(node)
        .replace(sourceCode.getText(node.argument), "");

      return regex.test(statementWithoutArgument);
    }

    return {
      Program(node) {
        if (node.body.length > 0) {
          checkNodesIndent(node.body, getNodeIndent(node).goodChar);
        }
      },

      ClassBody: blockIndentationCheck,

      BlockStatement: blockIndentationCheck,

      WhileStatement: blockLessNodes,

      ForStatement: blockLessNodes,

      ForInStatement: blockLessNodes,

      ForOfStatement: blockLessNodes,

      DoWhileStatement: blockLessNodes,

      IfStatement(node) {
        if (
          node.consequent.type !== "BlockStatement" &&
          node.consequent.loc.start.line > node.loc.start.line
        ) {
          blockIndentationCheck(node);
        }
      },

      VariableDeclaration(node) {
        if (
          node.declarations.at(-1).loc.start.line >
          node.declarations[0].loc.start.line
        ) {
          checkIndentInVariableDeclarations(node);
        }
      },

      ObjectExpression(node) {
        checkIndentInArrayOrObjectBlock(node);
      },

      ArrayExpression(node) {
        checkIndentInArrayOrObjectBlock(node);
      },

      MemberExpression(node) {
        if (typeof options.MemberExpression === "undefined") {
          return;
        }

        if (isSingleLineNode(node)) {
          return;
        }

        const propertyIndent =
          getNodeIndent(node).goodChar +
          indentSize * options.MemberExpression;

        const checkNodes = [node.property];

        const dot = sourceCode.getTokenBefore(node.property);

        if (dot.type === "Punctuator" && dot.value === ".") {
          checkNodes.push(dot);
        }

        checkNodesIndent(checkNodes, propertyIndent);
      },

      SwitchStatement(node) {
        const switchIndent = getNodeIndent(node).goodChar;
        const caseIndent = expectedCaseIndent(node, switchIndent);

        checkNodesIndent(node.cases, caseIndent);

        checkLastNodeLineIndent(node, switchIndent);
      },

      SwitchCase(node) {
        if (isSingleLineNode(node)) {
          return;
        }
        const caseIndent = expectedCaseIndent(node);

        checkNodesIndent(node.consequent, caseIndent + indentSize);
      },

      FunctionDeclaration(node) {
        if (isSingleLineNode(node)) {
          return;
        }
        if (
          options.FunctionDeclaration.parameters === "first" &&
          node.params.length
        ) {
          checkNodesIndent(
            node.params.slice(1),
            node.params[0].loc.start.column,
          );
        } else if (options.FunctionDeclaration.parameters !== null) {
          checkNodesIndent(
            node.params,
            getNodeIndent(node).goodChar +
              indentSize * options.FunctionDeclaration.parameters,
          );
        }
      },

      FunctionExpression(node) {
        if (isSingleLineNode(node)) {
          return;
        }
        if (
          options.FunctionExpression.parameters === "first" &&
          node.params.length
        ) {
          checkNodesIndent(
            node.params.slice(1),
            node.params[0].loc.start.column,
          );
        } else if (options.FunctionExpression.parameters !== null) {
          checkNodesIndent(
            node.params,
            getNodeIndent(node).goodChar +
              indentSize * options.FunctionExpression.parameters,
          );
        }
      },

      ReturnStatement(node) {
        if (isSingleLineNode(node)) {
          return;
        }

        const firstLineIndent = getNodeIndent(node).goodChar;

        if (isWrappedInParenthesis(node)) {
          checkLastReturnStatementLineIndent(node, firstLineIndent);
        } else {
          checkNodeIndent(node, firstLineIndent);
        }
      },

      CallExpression(node) {
        if (isSingleLineNode(node)) {
          return;
        }
        if (
          options.CallExpression.arguments === "first" &&
          node.arguments.length
        ) {
          checkNodesIndent(
            node.arguments.slice(1),
            node.arguments[0].loc.start.column,
          );
        } else if (options.CallExpression.arguments !== null) {
          checkNodesIndent(
            node.arguments,
            getNodeIndent(node).goodChar +
              indentSize * options.CallExpression.arguments,
          );
        }
      },
    };
  },
};