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

    const REST_PROPERTY_TYPE =
      /^(?:RestElement|(?:Experimental)?RestProperty)$/u;

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

    /**
     * Determines what variable type a def is.
     * @param  {Object} def the declaration to check
     * @returns {VariableType} a simple name for the types of variables that this rule supports
     */
    function defToVariableType(def) {
      if (
        config.destructuredArrayIgnorePattern &&
        def.name.parent.type === "ArrayPattern"
      ) {
        return "array-destructure";
      }

      switch (def.type) {
        case "CatchClause":
          return "catch-clause";
        case "Parameter":
          return "parameter";

        default:
          return "variable";
      }
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
      let pattern;
      let variableDescription;

      switch (variableType) {
        case "array-destructure":
          pattern = config.destructuredArrayIgnorePattern;
          variableDescription = "elements of array destructuring";
          break;

        case "catch-clause":
          pattern = config.caughtErrorsIgnorePattern;
          variableDescription = "caught errors";
          break;

        case "parameter":
          pattern = config.argsIgnorePattern;
          variableDescription = "args";
          break;

        case "variable":
          pattern = config.varsIgnorePattern;
          variableDescription = "vars";
          break;

        default:
          throw new Error(
            `Unexpected variable type: ${variableType}`,
          );
      }

      if (pattern) {
        pattern = pattern.toString();
      }

      return [variableDescription, pattern];
    }

    /**
     * Generates the message data about the variable being defined and unused,
     * including the ignore pattern if configured.
     * @param {Variable} unusedVar eslint-scope variable object.
     * @returns {UnusedVarMessageData} The message data to be used with this unused variable.
     */
    function getDefinedMessageData(unusedVar) {
      const def = unusedVar.defs && unusedVar.defs[0];
      let additionalMessageData = "";

      if (def) {
        const [variableDescription, pattern] = getVariableDescription(
          defToVariableType(def),
        );

        if (pattern && variableDescription) {
          additionalMessageData = `. Allowed unused ${variableDescription} must match ${pattern}`;
        }
      }

      return {
        varName: unusedVar.name,
        action: "defined",
        additional: additionalMessageData,
      };
    }

    /**
     * Generate the warning message about the variable being
     * assigned and unused, including the ignore pattern if configured.
     * @param {Variable} unusedVar eslint-scope variable object.
     * @returns {UnusedVarMessageData} The message data to be used with this unused variable.
     */
    function getAssignedMessageData(unusedVar) {
      const def = unusedVar.defs && unusedVar.defs[0];
      let additionalMessageData = "";

      if (def) {
        const [variableDescription, pattern] = getVariableDescription(
          defToVariableType(def),
        );

        if (pattern && variableDescription) {
          additionalMessageData = `. Allowed unused ${variableDescription} must match ${pattern}`;
        }
      }

      return {
        varName: unusedVar.name,
        action: "assigned a value",
        additional: additionalMessageData,
      };
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
      const [variableDescription, pattern] =
        getVariableDescription(variableType);

      let additionalMessageData = "";

      if (pattern && variableDescription) {
        additionalMessageData = `. Used ${variableDescription} must not match ${pattern}`;
      }

      return {
        varName: variable.name,
        additional: additionalMessageData,
      };
    }

    /**
     * Checks whether a given variable is after the last used parameter.
     * @param {eslint-scope.Variable} variable The variable to check.
     * @returns {boolean} `true` if the variable is defined after the last
     * used parameter.
     */
    function isAfterLastUsedArg(variable) {
      const def = variable.defs[0];
      const params = sourceCode.getDeclaredVariables(def.node);
      const posteriorParams = params.slice(params.indexOf(variable) + 1);

      // If any used parameters occur after this parameter, do not report.
      return !posteriorParams.some(
        v => v.references.length > 0 || v.eslintUsed,
      );
    }

    /**
     * Determines if a variable has a sibling rest property
     * @param {Variable} variable eslint-scope variable object.
     * @returns {boolean} True if the variable has a sibling rest property, false if not.
     * @private
     */
    function hasRestSpreadSibling(variable) {
      if (config.ignoreRestSiblings) {
        const hasRestSiblingDefinition = variable.defs.some(def =>
          hasRestSibling(def.name.parent),
        );
        const hasRestSiblingReference = variable.references.some(ref =>
          hasRestSibling(ref.identifier.parent),
        );

        return hasRestSiblingDefinition || hasRestSiblingReference;
      }

      return false;
    }

    /**
     * Determines if a reference is a read operation.
     * @param {Reference} ref An eslint-scope Reference
     * @returns {boolean} whether the given reference represents a read operation
     * @private
     */
    function isReadRef(ref) {
      return ref.isRead();
    }

    /**
     * Checks whether a given variable is used.
     * @param {Variable} variable The variable to check.
     * @returns {boolean} True if the variable is used
     * @private
     */
    function isUsedVariable(variable) {
      if (variable.eslintUsed) {
        return true;
      }

      const functionNodes = getFunctionDefinitions(variable);
      const isFunctionDefinition = functionNodes.length > 0;

      return variable.references.some(ref => {
        if (isForInOfRef(ref)) {
          return true;
        }

        const forItself = isReadForItself(ref);

        return (
          isReadRef(ref) &&
          !forItself &&
          !(
            isFunctionDefinition &&
            isSelfReference(ref, functionNodes)
          )
        );
      });
    }

    /**
     * Gets a list of function definitions for a specified variable.
     * @param {Variable} variable eslint-scope variable object.
     * @returns {ASTNode[]} Function nodes.
     * @private
     */
    function getFunctionDefinitions(variable) {
      const functionDefinitions = [];

      variable.defs.forEach(def => {
        const { type, node } = def;

        // FunctionDeclarations
        if (type === "FunctionName") {
          functionDefinitions.push(node);
        }

        // FunctionExpressions
        if (
          type === "Variable" &&
          node.init &&
          (node.init.type === "FunctionExpression" ||
            node.init.type === "ArrowFunctionExpression")
        ) {
          functionDefinitions.push(node.init);
        }
      });
      return functionDefinitions;
    }

    /**
     * Checks whether a given function node is stored to somewhere or not.
     * If the function node is stored, the function can be used later.
     * @param {ASTNode} funcNode A function node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if under the following conditions:
     *      - the funcNode is assigned to a variable.
     *      - the funcNode is bound as an argument of a function call.
     *      - the function is bound to a property and the object satisfies above conditions.
     * @private
     */
    function isStorableFunction(funcNode, rhsNode) {
      let node = funcNode;
      let parent = funcNode.parent;

      while (parent && isInside(parent, rhsNode)) {
        switch (parent.type) {
          case "SequenceExpression":
            if (parent.expressions.at(-1) !== node) {
              return false;
            }
            break;

          case "CallExpression":
          case "NewExpression":
            return parent.callee !== node;

          case "AssignmentExpression":
          case "TaggedTemplateExpression":
          case "YieldExpression":
            return true;

          default:
            if (STATEMENT_TYPE.test(parent.type)) {
              /*
               * If it encountered statements, this is a complex pattern.
               * Since analyzing complex patterns is hard, this returns `true` to avoid false positive.
               */
              return true;
            }
        }

        node = parent;
        parent = parent.parent;
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        // self update. e.g. `a += 1`, `a++`
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" &&
            isUnusedExpression(parent)) ||
          // in RHS of an assignment for itself. e.g. `a = a + 1`
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    /**
     * Determine if an identifier is used either in for-in or for-of loops.
     * @param {Reference} ref The reference to check.
     * @returns {boolean} whether reference is used in the for-in loops
     * @private
     */
    function isForInOfRef(ref) {
      let target = ref.identifier.parent;

      // "for (var ...) { return; }"
      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (
        target.type !== "ForInStatement" &&
        target.type !== "ForOfStatement"
      ) {
        return false;
      }

      // "for (...) { return; }"
      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];

        // "for (...) return;"
      } else {
        target = target.body;
      }

      // For empty loop body
      if (!target) {
        return false;
      }

      return target.type === "ReturnStatement";
    }

    /**
     * Checks whether a given node is unused expression or not.
     * @param {ASTNode} node The node itself
     * @returns {boolean} The node is an unused expression.
     * @private
     */
    function isUnusedExpression(node) {
      const parent = node.parent;

      if (parent.type === "ExpressionStatement") {
        return true;
      }

      if (parent.type === "SequenceExpression") {
        const isLastExpression = parent.expressions.at(-1) === node;

        if (!isLastExpression) {
          return true;
        }
        return isUnusedExpression(parent);
      }

      return false;
    }

    /**
     * Checks whether a given Identifier node exists inside of a function node which can be used later.
     *
     * "can be used later" means:
     * - the function is assigned to a variable.
     * - the function is bound to a property and the object can be used later.
     * - the function is bound as an argument of a function call.
     *
     * If a reference exists in a function which can be used later, the reference is read when the function is called.
     * @param {ASTNode} id An Identifier node to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} `true` if the `id` node exists inside of a function node which can be used later.
     * @private
     */
    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);

      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    /**
     * Checks whether a given reference is a read to update itself or not.
     * @param {eslint-scope.Reference} ref A reference to check.
     * @param {ASTNode} rhsNode The RHS node of the previous assignment.
     * @returns {boolean} The reference is a read to update itself.
     * @private
     */
    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead()