```javascript
/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Typedefs
//------------------------------------------------------------------------------

/**
 * A simple name for the types of variables that this rule supports
 * @typedef {'array-destructure'|'catch-clause'|'parameter'|'variable'} VariableType
 */

/**
 * Bag of data used for formatting the `unusedVar` lint message.
 * @typedef {Object} UnusedVarMessageData
 * @property {string} varName The name of the unused var.
 * @property {'defined'|'assigned a value'} action Description of the vars state.
 * @property {string} additional Any additional info to be appended at the end.
 */

/**
 * Bag of data used for formatting the `usedIgnoredVar` lint message.
 * @typedef {Object} UsedIgnoredVarMessageData
 * @property {string} varName The name of the unused var.
 * @property {string} additional Any additional info to be appended at the end.
 */

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/** @type {import('../types').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",

    docs: {
      description: "Disallow unused variables",
      recommended: true,
      url: "https://eslint.org/docs/latest/rules/no-unused-vars",
    },

    hasSuggestions: true,

    schema: [
      {
        oneOf: [
          {
            enum: ["all", "local"],
          },
          {
            type: "object",
            properties: {
              vars: {
                enum: ["all", "local"],
              },
              varsIgnorePattern: {
                type: "string",
              },
              args: {
                enum: ["all", "after-used", "none"],
              },
              ignoreRestSiblings: {
                type: "boolean",
              },
              argsIgnorePattern: {
                type: "string",
              },
              caughtErrors: {
                enum: ["all", "none"],
              },
              caughtErrorsIgnorePattern: {
                type: "string",
              },
              destructuredArrayIgnorePattern: {
                type: "string",
              },
              ignoreClassWithStaticInitBlock: {
                type: "boolean",
              },
              ignoreUsingDeclarations: {
                type: "boolean",
              },
              reportUsedIgnorePattern: {
                type: "boolean",
              },
            },
            additionalProperties: false,
          },
        ],
      },
    ],

    messages: {
      unusedVar:
        "'{{varName}}' is {{action}} but never used{{additional}}.",
      usedIgnoredVar:
        "'{{varName}}' is marked as ignored but is used{{additional}}.",
      removeVar: "Remove unused variable '{{varName}}'.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    const config = getConfig(context);
    const variableTypes = getVariableTypes(config);

    /**
     * Determines what variable type a def is.
     * @param  {Object} def the declaration to check
     * @returns {VariableType} a simple name for the types of variables that this rule supports
     */
    function getVariableType(def) {
      // ...
    }

    /**
     * Gets a given variable's description and configured ignore pattern
     * based on the provided variableType
     * @param {VariableType} variableType a simple name for the types of variables that this rule supports
     * @throws {Error} (Unreachable)
     * @returns {[string | undefined, string | undefined]} the given variable's description and
     * ignore pattern
     */
    function getVariableDescription(variableType) {
      // ...
    }

    /**
     * Generates the message data about the variable being defined and unused,
     * including the ignore pattern if configured.
     * @param {Variable} unusedVar eslint-scope variable object.
     * @returns {UnusedVarMessageData} The message data to be used with this unused variable.
     */
    function getDefinedMessageData(unusedVar) {
      // ...
    }

    /**
     * Generate the warning message about the variable being
     * assigned and unused, including the ignore pattern if configured.
     * @param {Variable} unusedVar eslint-scope variable object.
     * @returns {UnusedVarMessageData} The message data to be used with this unused variable.
     */
    function getAssignedMessageData(unusedVar) {
      // ...
    }

    /**
     * Generate the warning message about a variable being used even though
     * it is marked as being ignored.
     * @param {Variable} variable eslint-scope variable object
     * @param {VariableType} variableType a simple name for the types of variables that this rule supports
     * @returns {UsedIgnoredVarMessageData} The message data to be used with
     * this used ignored variable.
     */
    function getUsedIgnoredMessageData(variable, variableType) {
      // ...
    }

    /**
     * Determines if a variable has a sibling rest property
     * @param {Variable} variable eslint-scope variable object.
     * @returns {boolean} True if the variable has a sibling rest property, false if not.
     * @private
     */
    function hasRestSpreadSibling(variable) {
      // ...
    }

    /**
     * Determines if a reference is a read operation.
     * @param {Reference} ref An eslint-scope Reference
     * @returns {boolean} whether the given reference represents a read operation
     * @private
     */
    function isReadRef(ref) {
      // ...
    }

    /**
     * Determine if an identifier is referencing an enclosing function name.
     * @param {Reference} ref The reference to check.
     * @param {ASTNode[]} nodes The candidate function nodes.
     * @returns {boolean} True if it's a self-reference, false if not.
     * @private
     */
    function isSelfReference(ref, nodes) {
      // ...
    }

    /**
     * Gets a list of function definitions for a specified variable.
     * @param {Variable} variable eslint-scope variable object.
     * @returns {ASTNode[]} Function nodes.
     * @private
     */
    function getFunctionDefinitions(variable) {
      // ...
    }

    /**
     * Checks the position of given nodes.
     * @param {ASTNode} inner A node which is expected as inside.
     * @param {ASTNode} outer A node which is expected as outside.
     * @returns {boolean} `true` if the `inner` node exists in the `outer` node.
     * @private
     */
    function isInside(inner, outer) {
      // ...
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      // ...
    }

    /**
     * If a given reference is left-hand side of an assignment, this gets
     * the right-hand side node of the assignment.
     *
     * In the following cases, this returns null.
     *
     * - The reference is not the LHS of an assignment expression.
     * - The reference is inside of a loop.
     * - The reference is inside of a function scope which is different from
     *   the declaration.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} prevRhsNode The previous RHS node.
     * @returns {ASTNode|null} The RHS node or null.
     * @private
     */
    function getRhsNode(ref, prevRhsNode) {
      // ...
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      // ...
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      // ...
    }

    /**
     * Determines if the variable is used.
     * @param {Variable} variable The variable to check.
     * @returns {boolean} True if the variable is used
     * @private
     */
    function isUsedVariable(variable) {
      // ...
    }

    /**
     * Checks whether the given variable is after the last used parameter.
     * @param {eslint-scope.Variable} variable The variable to check.
     * @returns {boolean} `true` if the variable is defined after the last
     * used parameter.
     */
    function isAfterLastUsedArg(variable) {
      // ...
    }

    /**
     * Gets an array of variables without read references.
     * @param {Scope} scope an eslint-scope Scope object.
     * @param {Variable[]} unusedVars an array that saving result.
     * @returns {Variable[]} unused variables of the scope and descendant scopes.
     * @private
     */
    function collectUnusedVariables(scope, unusedVars) {
      // ...
    }

    /**
     * fixes unused variables
     * @param {Object} fixer fixer object
     * @param {Object} unusedVar unused variable to fix
     * @returns {Object} fixer object
     */
    function handleFixes(fixer, unusedVar) {
      // ...
    }

    return {
      "Program:exit"(programNode) {
        const unusedVars = collectUnusedVariables(
          sourceCode.getScope(programNode),
          [],
        );

        for (let i = 0, l = unusedVars.length; i < l; ++i) {
          const unusedVar = unusedVars[i];

          // Report the first declaration.
          if (unusedVar.defs.length > 0) {
            // report last write reference, https://github.com/eslint/eslint/issues/14324
            const writeReferences = unusedVar.references.filter(
              ref =>
                ref.isWrite() &&
                ref.from.variableScope === unusedVar.scope.variableScope,
            );

            let referenceToReport;

            if (writeReferences.length > 0) {
              referenceToReport = writeReferences.at(-1);
            }

            context.report({
              node: referenceToReport
                ? referenceToReport.identifier
                : unusedVar.identifiers[0],
              messageId: "unusedVar",
              data: unusedVar.references.some(ref => ref.isWrite())
                ? getAssignedMessageData(unusedVar)
                : getDefinedMessageData(unusedVar),
              suggest: [
                {
                  messageId: "removeVar",
                  data: {
                    varName: unusedVar.name,
                  },
                  fix(fixer) {
                    return handleFixes(fixer, unusedVar);
                  },
                },
              ],
            });

            // If there are no regular declaration, report the first `/*globals*/` comment directive.
          } else if (unusedVar.eslintExplicitGlobalComments) {
            const directiveComment =
              unusedVar.eslintExplicitGlobalComments[0];

            context.report({
              node: programNode,
              loc: astUtils.getNameLocationInGlobalDirectiveComment(
                sourceCode,
                directiveComment,
                unusedVar.name,
              ),
              messageId: "unusedVar",
              data: getDefinedMessageData(unusedVar),
            });
          }
        }
      },
    };
  },
};

/**
 * Gets the configuration for the rule.
 * @param {Context} context The ESLint context.
 * @returns {Object} The configuration for the rule.
 */
function getConfig(context) {
  const config = {
    vars: "all",
    args: "after-used",
    ignoreRestSiblings: false,
    caughtErrors: "all",
    ignoreClassWithStaticInitBlock: false,
    ignoreUsingDeclarations: false,
    reportUsedIgnorePattern: false,
  };

  const firstOption = context.options[0];

  if (firstOption) {
    if (typeof firstOption === "string") {
      config.vars = firstOption;
    } else {
      config.vars = firstOption.vars || config.vars;
      config.args = firstOption.args || config.args;
      config.ignoreRestSiblings =
        firstOption.ignoreRestSiblings || config.ignoreRestSiblings;
      config.caughtErrors =
        firstOption.caughtErrors || config.caughtErrors;
      config.ignoreClassWithStaticInitBlock =
        firstOption.ignoreClassWithStaticInitBlock ||
        config.ignoreClassWithStaticInitBlock;
      config.ignoreUsingDeclarations =
        firstOption.ignoreUsingDeclarations ||
        config.ignoreUsingDeclarations;
      config.reportUsedIgnorePattern =
        firstOption.reportUsedIgnorePattern ||
        config.reportUsedIgnorePattern;

      if (firstOption.varsIgnorePattern) {
        config.varsIgnorePattern = new RegExp(
          firstOption.varsIgnorePattern,
          "u",
        );
      }

      if (firstOption.argsIgnorePattern) {
        config.argsIgnorePattern = new RegExp(
          firstOption.argsIgnorePattern,
          "u",
        );
      }

      if (firstOption.caughtErrorsIgnorePattern) {
        config.caughtErrorsIgnorePattern = new RegExp(
          firstOption.caughtErrorsIgnorePattern,
          "u",
        );
      }

      if (firstOption.destructuredArrayIgnorePattern) {
        config.destructuredArrayIgnorePattern = new RegExp(
          firstOption.destructuredArrayIgnorePattern,
          "u",
        );
      }
    }
  }

  return config;
}

/**
 * Gets the variable types for the rule.
 * @param {Object} config The configuration for the rule.
 * @returns {Object} The variable types for the rule.
 */
function getVariableTypes(config) {
  return {
    arrayDestructure: config.destructuredArrayIgnorePattern,
    catchClause: config.caughtErrorsIgnorePattern,
    parameter: config.argsIgnorePattern,
    variable: config.varsIgnorePattern,
  };
}
```