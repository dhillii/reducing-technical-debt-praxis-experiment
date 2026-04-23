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
        const unusedVars = getUnusedVariables(
          sourceCode.getScope(programNode),
          config,
        );

        reportUnusedVariables(context, unusedVars, config);
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
        options.ignoreClassWithStaticInitBlock || config.ignoreClassWithStaticInitBlock;
      config.ignoreUsingDeclarations =
        options.ignoreUsingDeclarations || config.ignoreUsingDeclarations;
      config.reportUsedIgnorePattern =
        options.reportUsedIgnorePattern || config.reportUsedIgnorePattern;

      if (options.varsIgnorePattern) {
        config.varsIgnorePattern = new RegExp(options.varsIgnorePattern, "u");
      }

      if (options.argsIgnorePattern) {
        config.argsIgnorePattern = new RegExp(options.argsIgnorePattern, "u");
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
 * Gets an array of unused variables.
 * @param {Scope} scope The scope to check.
 * @param {Object} config The configuration for the rule.
 * @returns {Variable[]} An array of unused variables.
 */
function getUnusedVariables(scope, config) {
  const unusedVars = [];

  collectUnusedVariables(scope, unusedVars, config);

  return unusedVars;
}

/**
 * Collects unused variables in the given scope and its child scopes.
 * @param {Scope} scope The scope to check.
 * @param {Variable[]} unusedVars An array to store unused variables.
 * @param {Object} config The configuration for the rule.
 */
function collectUnusedVariables(scope, unusedVars, config) {
  const variables = scope.variables;
  const childScopes = scope.childScopes;

  for (const variable of variables) {
    if (shouldReportVariable(variable, scope, config)) {
      unusedVars.push(variable);
    }
  }

  for (const childScope of childScopes) {
    collectUnusedVariables(childScope, unusedVars, config);
  }
}

/**
 * Checks if a variable should be reported.
 * @param {Variable} variable The variable to check.
 * @param {Scope} scope The scope of the variable.
 * @param {Object} config The configuration for the rule.
 * @returns {boolean} True if the variable should be reported.
 */
function shouldReportVariable(variable, scope, config) {
  if (variable.eslintUsed) {
    return false;
  }

  if (isExported(variable)) {
    return false;
  }

  if (config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) {
    return false;
  }

  if (hasRestSpreadSibling(variable, config)) {
    return false;
  }

  return !isUsedVariable(variable);
}

/**
 * Checks if a variable is used.
 * @param {Variable} variable The variable to check.
 * @returns {boolean} True if the variable is used.
 */
function isUsedVariable(variable) {
  return variable.references.some(ref => isReadRef(ref));
}

/**
 * Checks if a reference is a read operation.
 * @param {Reference} ref The reference to check.
 * @returns {boolean} True if the reference is a read operation.
 */
function isReadRef(ref) {
  return ref.isRead();
}

/**
 * Reports unused variables.
 * @param {Context} context The context to report in.
 * @param {Variable[]} unusedVars The unused variables to report.
 * @param {Object} config The configuration for the rule.
 */
function reportUnusedVariables(context, unusedVars, config) {
  for (const unusedVar of unusedVars) {
    const messageData = getUnusedVarMessageData(unusedVar, config);

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
 * Gets the message data for an unused variable.
 * @param {Variable} unusedVar The unused variable.
 * @param {Object} config The configuration for the rule.
 * @returns {UnusedVarMessageData} The message data for the unused variable.
 */
function getUnusedVarMessageData(unusedVar, config) {
  const def = unusedVar.defs[0];

  if (def) {
    const variableType = getVariableType(def);

    return getUnusedVarMessageDataForType(
      unusedVar,
      variableType,
      config,
    );
  }

  return {
    varName: unusedVar.name,
    action: "defined",
    additional: "",
  };
}

/**
 * Gets the type of a variable.
 * @param {Object} def The definition of the variable.
 * @returns {VariableType} The type of the variable.
 */
function getVariableType(def) {
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
 * Gets the message data for an unused variable of a specific type.
 * @param {Variable} unusedVar The unused variable.
 * @param {VariableType} variableType The type of the variable.
 * @param {Object} config The configuration for the rule.
 * @returns {UnusedVarMessageData} The message data for the unused variable.
 */
function getUnusedVarMessageDataForType(unusedVar, variableType, config) {
  const [variableDescription, pattern] = getVariableDescription(
    variableType,
    config,
  );

  let additionalMessageData = "";

  if (pattern && variableDescription) {
    additionalMessageData = `. Allowed unused ${variableDescription} must match ${pattern}`;
  }

  return {
    varName: unusedVar.name,
    action: "defined",
    additional: additionalMessageData,
  };
}

/**
 * Gets the description and pattern for a variable type.
 * @param {VariableType} variableType The type of the variable.
 * @param {Object} config The configuration for the rule.
 * @returns {[string, string]} The description and pattern for the variable type.
 */
function getVariableDescription(variableType, config) {
  switch (variableType) {
    case "catch-clause":
      return ["caught errors", config.caughtErrorsIgnorePattern];
    case "parameter":
      return ["args", config.argsIgnorePattern];
    default:
      return ["vars", config.varsIgnorePattern];
  }
}

/**
 * Handles fixes for unused variables.
 * @param {Fixer} fixer The fixer to use.
 * @param {Variable} unusedVar The unused variable to fix.
 * @returns {Object} The fixer object.
 */
function handleFixes(fixer, unusedVar) {
  const id = unusedVar.identifiers[0];
  const parent = id.parent;

  if (parent.type === "VariableDeclarator") {
    return fixVariableDeclarator(fixer, parent);
  }

  if (parent.type === "FunctionDeclaration") {
    return fixFunctionDeclaration(fixer, parent);
  }

  return fixer.removeRange(id.range);
}

/**
 * Fixes a variable declarator.
 * @param {Fixer} fixer The fixer to use.
 * @param {VariableDeclarator} variableDeclarator The variable declarator to fix.
 * @returns {Object} The fixer object.
 */
function fixVariableDeclarator(fixer, variableDeclarator) {
  const parent = variableDeclarator.parent;

  if (parent.declarations.length === 1) {
    return fixer.removeRange(parent.range);
  }

  return fixer.removeRange(variableDeclarator.range);
}

/**
 * Fixes a function declaration.
 * @param {Fixer} fixer The fixer to use.
 * @param {FunctionDeclaration} functionDeclaration The function declaration to fix.
 * @returns {Object} The fixer object.
 */
function fixFunctionDeclaration(fixer, functionDeclaration) {
  return fixer.removeRange(functionDeclaration.range);
}

/**
 * Checks if a variable is exported.
 * @param {Variable} variable The variable to check.
 * @returns {boolean} True if the variable is exported.
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
 * Checks if a variable uses explicit resource management.
 * @param {Variable} variable The variable to check.
 * @returns {boolean} True if the variable uses explicit resource management.
 */
function usesExplicitResourceManagement(variable) {
  const [definition] = variable.defs;

  return (
    definition?.type === "Variable" &&
    (definition.parent.kind === "using" || definition.parent.kind === "await using")
  );
}

/**
 * Checks if a variable has a sibling rest property.
 * @param {Variable} variable The variable to check.
 * @param {Object} config The configuration for the rule.
 * @returns {boolean} True if the variable has a sibling rest property.
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
 * Checks if a node is a sibling of the rest property.
 * @param {ASTNode} node The node to check.
 * @returns {boolean} True if the node is a sibling of the rest property.
 */
function hasRestSibling(node) {
  return (
    node.type === "Property" &&
    node.parent.type === "ObjectPattern" &&
    node.parent.properties.at(-1).type === "RestElement"
  );
}