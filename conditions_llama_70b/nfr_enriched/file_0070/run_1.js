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

    const variableTypeMap = getVariableTypeMap();

    return {
      "Program:exit"(programNode) {
        const unusedVars = collectUnusedVariables(
          sourceCode.getScope(programNode),
          [],
          config,
          variableTypeMap,
        );

        for (let i = 0, l = unusedVars.length; i < l; ++i) {
          const unusedVar = unusedVars[i];

          reportUnusedVariable(context, unusedVar, config, variableTypeMap);
        }
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
      config.caughtErrors =
        options.caughtErrors || config.caughtErrors;
      config.ignoreClassWithStaticInitBlock =
        options.ignoreClassWithStaticInitBlock ||
        config.ignoreClassWithStaticInitBlock;
      config.ignoreUsingDeclarations =
        options.ignoreUsingDeclarations ||
        config.ignoreUsingDeclarations;
      config.reportUsedIgnorePattern =
        options.reportUsedIgnorePattern ||
        config.reportUsedIgnorePattern;

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
 * Gets the variable type map.
 * @returns {Object} The variable type map.
 */
function getVariableTypeMap() {
  return {
    "array-destructure": {
      description: "elements of array destructuring",
      pattern: null,
    },
    "catch-clause": {
      description: "caught errors",
      pattern: null,
    },
    parameter: {
      description: "args",
      pattern: null,
    },
    variable: {
      description: "vars",
      pattern: null,
    },
  };
}

/**
 * Collects unused variables in the given scope.
 * @param {Scope} scope The scope to collect unused variables from.
 * @param {Variable[]} unusedVars The array to store unused variables in.
 * @param {Object} config The configuration for the rule.
 * @param {Object} variableTypeMap The variable type map.
 * @returns {Variable[]} The unused variables in the scope and its descendants.
 */
function collectUnusedVariables(scope, unusedVars, config, variableTypeMap) {
  const variables = scope.variables;
  const childScopes = scope.childScopes;
  let i, l;

  if (scope.type !== "global" || config.vars === "all") {
    for (i = 0, l = variables.length; i < l; ++i) {
      const variable = variables[i];

      if (
        !isUsedVariable(variable, config, variableTypeMap) &&
        !isExported(variable) &&
        !hasRestSpreadSibling(variable, config) &&
        !(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable))
      ) {
        unusedVars.push(variable);
      }
    }
  }

  for (i = 0, l = childScopes.length; i < l; ++i) {
    collectUnusedVariables(
      childScopes[i],
      unusedVars,
      config,
      variableTypeMap,
    );
  }

  return unusedVars;
}

/**
 * Reports an unused variable.
 * @param {Context} context The context to report the unused variable in.
 * @param {Variable} unusedVar The unused variable to report.
 * @param {Object} config The configuration for the rule.
 * @param {Object} variableTypeMap The variable type map.
 */
function reportUnusedVariable(context, unusedVar, config, variableTypeMap) {
  const def = unusedVar.defs[0];

  if (def) {
    const variableType = getVariableType(def, config);
    const messageData = getMessageData(
      unusedVar,
      variableType,
      config,
      variableTypeMap,
    );

    context.report({
      node: unusedVar.identifiers[0],
      messageId: "unusedVar",
      data: messageData,
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
 * Gets the variable type.
 * @param {Object} def The definition of the variable.
 * @param {Object} config The configuration for the rule.
 * @returns {string} The variable type.
 */
function getVariableType(def, config) {
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
 * Gets the message data for an unused variable.
 * @param {Variable} unusedVar The unused variable.
 * @param {string} variableType The type of the variable.
 * @param {Object} config The configuration for the rule.
 * @param {Object} variableTypeMap The variable type map.
 * @returns {Object} The message data for the unused variable.
 */
function getMessageData(unusedVar, variableType, config, variableTypeMap) {
  const def = unusedVar.defs[0];
  let additionalMessageData = "";

  if (def) {
    const pattern = variableTypeMap[variableType].pattern;

    if (pattern && variableTypeMap[variableType].description) {
      additionalMessageData = `. Allowed unused ${variableTypeMap[variableType].description} must match ${pattern}`;
    }
  }

  return {
    varName: unusedVar.name,
    action: "defined",
    additional: additionalMessageData,
  };
}

/**
 * Handles fixes for an unused variable.
 * @param {Fixer} fixer The fixer to use.
 * @param {Variable} unusedVar The unused variable to fix.
 * @returns {Object} The fixer object.
 */
function handleFixes(fixer, unusedVar) {
  const id = unusedVar.identifiers[0];
  const parent = id.parent;
  const parentType = parent.type;
  const tokenBefore = fixer.getTokenBefore(id);
  const tokenAfter = fixer.getTokenAfter(id);

  // remove unused declared variables such as var a; or var a, b;
  if (parentType === "VariableDeclarator") {
    if (parent.parent.declarations.length === 1) {
      return fixer.removeRange(parent.parent.range);
    }

    if (tokenBefore.value === ",") {
      return fixer.removeRange([
        tokenBefore.range[0],
        id.range[1],
      ]);
    }

    return fixer.removeRange([
      id.range[0],
      tokenAfter.range[1],
    ]);
  }

  // remove unused function parameters
  if (parentType === "Identifier" && parent.parent.type === "FunctionDeclaration") {
    if (parent.parent.params.length === 1) {
      return fixer.removeRange(parent.range);
    }

    return fixer.removeRange([
      tokenBefore.range[0],
      id.range[1],
    ]);
  }

  return fixer.removeRange(id.range);
}

/**
 * Checks if a variable is used.
 * @param {Variable} variable The variable to check.
 * @param {Object} config The configuration for the rule.
 * @param {Object} variableTypeMap The variable type map.
 * @returns {boolean} True if the variable is used, false otherwise.
 */
function isUsedVariable(variable, config, variableTypeMap) {
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
      !(isFunctionDefinition && isSelfReference(ref, functionNodes))
    );
  });
}

/**
 * Checks if a variable is exported.
 * @param {Variable} variable The variable to check.
 * @returns {boolean} True if the variable is exported, false otherwise.
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
 * Checks if a variable uses the explicit resource management protocol.
 * @param {Variable} variable The variable to check.
 * @returns {boolean} True if the variable is declared with "using" or "await using"
 */
function usesExplicitResourceManagement(variable) {
  const [definition] = variable.defs;

  return (
    definition?.type === "Variable" &&
    (definition.parent.kind === "using" || definition.parent.kind === "await using")
  );
}

/**
 * Checks if a variable has a sibling rest property
 * @param {Variable} variable The variable to check.
 * @param {Object} config The configuration for the rule.
 * @returns {boolean} True if the variable has a sibling rest property, false otherwise.
 */
function hasRestSpreadSibling(variable, config) {
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
    /^(?:RestElement|(?:Experimental)?RestProperty)$/u.test(
      node.parent.properties.at(-1).type,
    )
  );
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
 * Determine if an identifier is referencing an enclosing function name.
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
 * Determine if an identifier is used either in for-in or for-of loops.
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
 * Checks whether a given reference is a read to update itself or not.
 * @param {eslint-scope.Reference} ref A reference to check.
 * @returns {boolean} The reference is a read to update itself.
 */
function isReadForItself(ref) {
  const id = ref.identifier;
  const parent = id.parent;

  return (
    ref.isRead() &&
    // self update. e.g. `a += 1`, `a++`
    ((parent.type === "AssignmentExpression" &&
      parent.left === id &&
      isUnusedExpression(parent) &&
      !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
      (parent.type === "UpdateExpression" && isUnusedExpression(parent)))
  );
}