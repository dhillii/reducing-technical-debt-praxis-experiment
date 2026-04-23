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

    const config = getConfig(context.options[0]);

    return {
      "Program:exit"(programNode) {
        const unusedVars = collectUnusedVariables(
          sourceCode.getScope(programNode),
          [],
          config,
        );

        reportUnusedVariables(unusedVars, context, config);
      },
    };
  },
};

/**
 * Gets the configuration for the rule.
 * @param {Object|string} options The options for the rule.
 * @returns {Object} The configuration for the rule.
 */
function getConfig(options) {
  const config = {
    vars: "all",
    args: "after-used",
    ignoreRestSiblings: false,
    caughtErrors: "all",
    ignoreClassWithStaticInitBlock: false,
    ignoreUsingDeclarations: false,
    reportUsedIgnorePattern: false,
  };

  if (options) {
    if (typeof options === "string") {
      config.vars = options;
    } else {
      config.vars = options.vars || config.vars;
      config.args = options.args || config.args;
      config.ignoreRestSiblings =
        options.ignoreRestSiblings || config.ignoreRestSiblings;
      config.caughtErrors = options.caughtErrors || config.caughtErrors;
      config.ignoreClassWithStaticInitBlock =
        options.ignoreClassWithStaticInitBlock ||
        config.ignoreClassWithStaticInitBlock;
      config.ignoreUsingDeclarations =
        options.ignoreUsingDeclarations || config.ignoreUsingDeclarations;
      config.reportUsedIgnorePattern =
        options.reportUsedIgnorePattern || config.reportUsedIgnorePattern;

      if (options.varsIgnorePattern) {
        config.varsIgnorePattern = new RegExp(
          options.varsIgnorePattern,
          "u",
        );
      }

      if (options.argsIgnorePattern) {
        config.argsIgnorePattern = new RegExp(
          options.argsIgnorePattern,
          "u",
        );
      }

      if (options.caughtErrorsIgnorePattern) {
        config.caughtErrorsIgnorePattern = new RegExp(
          options.caughtErrorsIgnorePattern,
          "u",
        );
      }

      if (options.destructuredArrayIgnorePattern) {
        config.destructuredArrayIgnorePattern = new RegExp(
          options.destructuredArrayIgnorePattern,
          "u",
        );
      }
    }
  }

  return config;
}

/**
 * Collects unused variables in the given scope.
 * @param {Scope} scope The scope to collect unused variables from.
 * @param {Variable[]} unusedVars The array to store unused variables in.
 * @param {Object} config The configuration for the rule.
 * @returns {Variable[]} The unused variables in the scope.
 */
function collectUnusedVariables(scope, unusedVars, config) {
  const variables = scope.variables;
  const childScopes = scope.childScopes;

  for (const variable of variables) {
    if (shouldReportVariable(variable, config)) {
      unusedVars.push(variable);
    }
  }

  for (const childScope of childScopes) {
    collectUnusedVariables(childScope, unusedVars, config);
  }

  return unusedVars;
}

/**
 * Reports unused variables.
 * @param {Variable[]} unusedVars The unused variables to report.
 * @param {Context} context The context to report in.
 * @param {Object} config The configuration for the rule.
 */
function reportUnusedVariables(unusedVars, context, config) {
  for (const unusedVar of unusedVars) {
    context.report({
      node: unusedVar.identifiers[0],
      messageId: "unusedVar",
      data: getUnusedVarMessageData(unusedVar, config),
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
  }
}

/**
 * Gets the message data for an unused variable.
 * @param {Variable} unusedVar The unused variable to get the message data for.
 * @param {Object} config The configuration for the rule.
 * @returns {UnusedVarMessageData} The message data for the unused variable.
 */
function getUnusedVarMessageData(unusedVar, config) {
  const def = unusedVar.defs[0];
  let additionalMessageData = "";

  if (def) {
    const [variableDescription, pattern] = getVariableDescription(
      defToVariableType(def),
      config,
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
 * Determines what variable type a def is.
 * @param  {Object} def the declaration to check
 * @returns {VariableType} a simple name for the types of variables that this rule supports
 */
function defToVariableType(def) {
  if (def.name.parent.type === "ArrayPattern") {
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
 * @param {Object} config The configuration for the rule.
 * @throws {Error} (Unreachable)
 * @returns {[string | undefined, string | undefined]} the given variable's description and
 * ignore pattern
 */
function getVariableDescription(variableType, config) {
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
 * Determines if a variable should be reported.
 * @param {Variable} variable The variable to check.
 * @param {Object} config The configuration for the rule.
 * @returns {boolean} True if the variable should be reported, false if not.
 */
function shouldReportVariable(variable, config) {
  // skip a variable of class itself name in the class scope
  if (
    variable.scope.type === "class" &&
    variable.scope.block.id === variable.identifiers[0]
  ) {
    return false;
  }

  // skip function expression names
  if (variable.scope.functionExpressionScope) {
    return false;
  }

  // skip variables marked with markVariableAsUsed()
  if (
    !config.reportUsedIgnorePattern &&
    variable.eslintUsed
  ) {
    return false;
  }

  // skip implicit "arguments" variable
  if (
    variable.scope.type === "function" &&
    variable.name === "arguments" &&
    variable.identifiers.length === 0
  ) {
    return false;
  }

  // explicit global variables don't have definitions.
  const def = variable.defs[0];

  if (def) {
    const type = def.type;
    const refUsedInArrayPatterns = variable.references.some(
      ref =>
        ref.identifier.parent.type === "ArrayPattern",
    );

    // skip elements of array destructuring patterns
    if (
      (def.name.parent.type === "ArrayPattern" ||
        refUsedInArrayPatterns) &&
      config.destructuredArrayIgnorePattern &&
      config.destructuredArrayIgnorePattern.test(
        def.name.name,
      )
    ) {
      if (
        config.reportUsedIgnorePattern &&
        isUsedVariable(variable)
      ) {
        return true;
      }

      return false;
    }

    if (type === "ClassName") {
      const hasStaticBlock = def.node.body.body.some(
        node => node.type === "StaticBlock",
      );

      if (
        config.ignoreClassWithStaticInitBlock &&
        hasStaticBlock
      ) {
        return false;
      }
    }

    // skip catch variables
    if (type === "CatchClause") {
      if (config.caughtErrors === "none") {
        return false;
      }

      // skip ignored parameters
      if (
        config.caughtErrorsIgnorePattern &&
        config.caughtErrorsIgnorePattern.test(
          def.name.name,
        )
      ) {
        if (
          config.reportUsedIgnorePattern &&
          isUsedVariable(variable)
        ) {
          return true;
        }

        return false;
      }
    } else if (type === "Parameter") {
      // skip any setter argument
      if (
        (def.node.parent.type === "Property" ||
          def.node.parent.type ===
            "MethodDefinition") &&
        def.node.parent.kind === "set"
      ) {
        return false;
      }

      // if "args" option is "none", skip any parameter
      if (config.args === "none") {
        return false;
      }

      // skip ignored parameters
      if (
        config.argsIgnorePattern &&
        config.argsIgnorePattern.test(def.name.name)
      ) {
        if (
          config.reportUsedIgnorePattern &&
          isUsedVariable(variable)
        ) {
          return true;
        }

        return false;
      }

      // if "args" option is "after-used", skip used variables
      if (
        config.args === "after-used" &&
        astUtils.isFunction(def.name.parent) &&
        !isAfterLastUsedArg(variable)
      ) {
        return false;
      }
    } else {
      // skip ignored variables
      if (
        config.varsIgnorePattern &&
        config.varsIgnorePattern.test(def.name.name)
      ) {
        if (
          config.reportUsedIgnorePattern &&
          isUsedVariable(variable)
        ) {
          return true;
        }

        return false;
      }
    }
  }

  if (
    !isUsedVariable(variable) &&
    !isExported(variable) &&
   !(
      config.ignoreUsingDeclarations &&
      usesExplicitResourceManagement(variable)
    ) &&
    !hasRestSpreadSibling(variable)
  ) {
    return true;
  }

  return false;
}

/**
 * Determines if a variable is used.
 * @param {Variable} variable The variable to check.
 * @returns {boolean} True if the variable is used
 */
function isUsedVariable(variable) {
  if (variable.eslintUsed) {
    return true;
  }

  const functionNodes = getFunctionDefinitions(variable);
  const isFunctionDefinition = functionNodes.length > 0;

  let rhsNode = null;

  return variable.references.some(ref => {
    if (isForInOfRef(ref)) {
      return true;
    }

    const forItself = isReadForItself(ref, rhsNode);

    rhsNode = getRhsNode(ref, rhsNode);

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
 * Determines if a reference is a read operation.
 * @param {Reference} ref An eslint-scope Reference
 * @returns {boolean} whether the given reference represents a read operation
 */
function isReadRef(ref) {
  return ref.isRead();
}

/**
 * Determines if an identifier is referencing an enclosing function name.
 * @param {Reference} ref The reference to check.
 * @param {ASTNode[]} nodes The candidate function nodes.
 * @returns {boolean} True if it's a self-reference, false if not.
 */
function isSelfReference(ref, nodes) {
  let scope = ref.from;

  while (scope) {
    if (nodes.includes(scope.block)) {
      return true;
    }

    scope = scope.upper;
  }

  return false;
}

/**
 * Gets a list of function definitions for a specified variable.
 * @param {Variable} variable eslint-scope variable object.
 * @returns {ASTNode[]} Function nodes.
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
 * Determines if a reference is a read to update itself or not.
 * @param {eslint-scope.Reference} ref A reference to check.
 * @param {ASTNode} rhsNode The RHS node of the previous assignment.
 * @returns {boolean} The reference is a read to update itself.
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
 * Checks whether a given node is unused expression or not.
 * @param {ASTNode} node The node itself
 * @returns {boolean} The node is an unused expression.
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
 */
function getRhsNode(ref, prevRhsNode) {
  const id = ref.identifier;
  const parent = id.parent;
  const refScope = ref.from.variableScope;
  const varScope = ref.resolved.scope.variableScope;
  const canBeUsedLater =
    refScope !== varScope || astUtils.isInLoop(id);

  /*
   * Inherits the previous node if this reference is in the node.
   * This is for `a = a + a`-like code.
   */
  if (prevRhsNode && isInside(id, prevRhsNode)) {
    return prevRhsNode;
  }

  if (
    parent.type === "AssignmentExpression" &&
    isUnusedExpression(parent) &&
    id === parent.left &&
    !canBeUsedLater
  ) {
    return parent.right;
  }
  return null;
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
 * Determines if an identifier is used either in for-in or for-of loops.
 * @param {Reference} ref The reference to check.
 * @returns {boolean} whether reference is used in the for-in loops
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
 * Checks whether a given node is inside of another node.
 * @param {ASTNode} inner A node which is expected as inside.
 * @param {ASTNode} outer A node which is expected as outside.
 * @returns {boolean} `true` if the `inner` node exists in the `outer` node.
 */
function isInside(inner, outer) {
  return (
    inner.range[0] >= outer.range[0] &&
    inner.range[1] <= outer.range[1]
  );
}

/**
 * Determines if a variable has a sibling rest property
 * @param {Variable} variable eslint-scope variable object.
 * @returns {boolean} True if the variable has a sibling rest property, false if not.
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
 * Checks whether a node is a sibling of the rest property or not.
 * @param {ASTNode} node a node to check
 * @returns {boolean} True if the node is a sibling of the rest property, otherwise false.
 */
function hasRestSibling(node) {
  return (
    node.type === "Property" &&
    node.parent.type === "ObjectPattern" &&
    REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type)
  );
}

/**
 * Determines if a variable is exported from a module.
 * @param {Variable} variable eslint-scope variable object.
 * @returns {boolean} True if the variable is exported, false if not.
 */
function isExported(variable) {
  const definition = variable.defs[0];

  if (definition) {
    let node = definition.node;

    if (node.type === "VariableDeclarator") {
      node = node.parent;
    } else if (definition.type === "Parameter") {
      return false;
    }

    return node.parent.type.indexOf("Export") === 0;
  }
  return false;
}

/**
 * Determines if a variable uses the explicit resource management protocol.
 * @param {Variable} variable eslint-scope variable object.
 * @returns {boolean} True if the variable is declared with "using" or "await using"
 */
function usesExplicitResourceManagement(variable) {
  const [definition] = variable.defs;

  return (
    definition?.type === "Variable" &&
    (definition.parent.kind === "using" ||
      definition.parent.kind === "await using")
  );
}

/**
 * fixes unused variables
 * @param {Object} fixer fixer object
 * @param {Object} unusedVar unused variable to fix
 * @returns {Object} fixer object
 */
function handleFixes(fixer, unusedVar) {
  const id = unusedVar.identifiers[0];
  const parent = id.parent;
  const parentType = parent.type;
  const tokenBefore = sourceCode.getTokenBefore(id);
  const tokenAfter = sourceCode.getTokenAfter(id);
  const isFunction = astUtils.isFunction;
  const isLoop = astUtils.isLoop;
  const allWriteReferences = unusedVar.references.filter(ref =>
    ref.isWrite(),
  );

  // ... (rest of the handleFixes function remains the same)
}
```