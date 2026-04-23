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
 * Gets an array of unused variables in the given scope.
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
 * @param {Variable[]} unusedVars An array to store the unused variables.
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
 * Checks if a variable should be reported as unused.
 * @param {Variable} variable The variable to check.
 * @param {Scope} scope The scope of the variable.
 * @param {Object} config The configuration for the rule.
 * @returns {boolean} True if the variable should be reported, false otherwise.
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
 * Checks if a node is a sibling of the rest property or not.
 * @param {ASTNode} node A node to check
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
 * Checks if a variable is used.
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
      !(isFunctionDefinition && isSelfReference(ref, functionNodes))
    );
  });
}

/**
 * Gets a list of function definitions for a specified variable.
 * @param {Variable} variable The variable to check.
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
 * Reports unused variables.
 * @param {Context} context The context to report in.
 * @param {Variable[]} unusedVars An array of unused variables.
 * @param {Object} config The configuration for the rule.
 */
function reportUnusedVariables(context, unusedVars, config) {
  for (const unusedVar of unusedVars) {
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
      const directiveComment = unusedVar.eslintExplicitGlobalComments[0];

      context.report({
        node: context.getSourceCode().ast,
        loc: astUtils.getNameLocationInGlobalDirectiveComment(
          context.getSourceCode(),
          directiveComment,
          unusedVar.name,
        ),
        messageId: "unusedVar",
        data: getDefinedMessageData(unusedVar),
      });
    }
  }
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
 * Determines what variable type a def is.
 * @param  {Object} def the declaration to check
 * @returns {VariableType} a simple name for the types of variables that this rule supports
 */
function defToVariableType(def) {
  if (
    def.name.parent.type === "ArrayPattern" &&
    def.name.parent.parent.type === "VariableDeclarator"
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
      pattern = "destructuredArrayIgnorePattern";
      variableDescription = "elements of array destructuring";
      break;

    case "catch-clause":
      pattern = "caughtErrorsIgnorePattern";
      variableDescription = "caught errors";
      break;

    case "parameter":
      pattern = "argsIgnorePattern";
      variableDescription = "args";
      break;

    case "variable":
      pattern = "varsIgnorePattern";
      variableDescription = "vars";
      break;

    default:
      throw new Error(`Unexpected variable type: ${variableType}`);
  }

  return [variableDescription, pattern];
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
  const tokenBefore = context.getSourceCode().getTokenBefore(id);
  const tokenAfter = context.getSourceCode().getTokenAfter(id);
  const isFunction = astUtils.isFunction;
  const isLoop = astUtils.isLoop;
  const allWriteReferences = unusedVar.references.filter(ref =>
    ref.isWrite(),
  );

  // ... rest of the handleFixes function remains the same ...
}