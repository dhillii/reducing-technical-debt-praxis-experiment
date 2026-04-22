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
        Object.assign(config, firstOption);
      }
    }

    const variableTypes = {
      "array-destructure": {
        pattern: config.destructuredArrayIgnorePattern,
        description: "elements of array destructuring",
      },
      "catch-clause": {
        pattern: config.caughtErrorsIgnorePattern,
        description: "caught errors",
      },
      parameter: {
        pattern: config.argsIgnorePattern,
        description: "args",
      },
      variable: {
        pattern: config.varsIgnorePattern,
        description: "vars",
      },
    };

    function getVariableDescription(variableType) {
      return [
        variableTypes[variableType].description,
        variableTypes[variableType].pattern,
      ];
    }

    function getDefinedMessageData(unusedVar) {
      const def = unusedVar.defs[0];
      let additionalMessageData = "";

      if (def) {
        const [variableDescription, pattern] = getVariableDescription(
          getVariableType(def),
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

    function getAssignedMessageData(unusedVar) {
      const def = unusedVar.defs[0];
      let additionalMessageData = "";

      if (def) {
        const [variableDescription, pattern] = getVariableDescription(
          getVariableType(def),
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

    function getUsedIgnoredMessageData(variable, variableType) {
      const [variableDescription, pattern] = getVariableDescription(
        variableType,
      );

      let additionalMessageData = "";

      if (pattern && variableDescription) {
        additionalMessageData = `. Used ${variableDescription} must not match ${pattern}`;
      }

      return {
        varName: variable.name,
        additional: additionalMessageData,
      };
    }

    function getVariableType(def) {
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

    function usesExplicitResourceManagement(variable) {
      const [definition] = variable.defs;

      return (
        definition?.type === "Variable" &&
        (definition.parent.kind === "using" ||
          definition.parent.kind === "await using")
      );
    }

    function hasRestSibling(node) {
      return (
        node.type === "Property" &&
        node.parent.type === "ObjectPattern" &&
        /^(?:RestElement|(?:Experimental)?RestProperty)$/.test(
          node.parent.properties.at(-1).type,
        )
      );
    }

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

    function isReadRef(ref) {
      return ref.isRead();
    }

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

    function getFunctionDefinitions(variable) {
      const functionDefinitions = [];

      variable.defs.forEach(def => {
        const { type, node } = def;

        if (type === "FunctionName") {
          functionDefinitions.push(node);
        } else if (
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

    function isAfterLastUsedArg(variable) {
      const def = variable.defs[0];
      const params = sourceCode.getDeclaredVariables(def.node);
      const posteriorParams = params.slice(params.indexOf(variable) + 1);

      return !posteriorParams.some(
        v => v.references.length > 0 || v.eslintUsed,
      );
    }

    function collectUnusedVariables(scope, unusedVars) {
      const variables = scope.variables;
      const childScopes = scope.childScopes;
      let i, l;

      if (scope.type !== "global" || config.vars === "all") {
        for (i = 0, l = variables.length; i < l; ++i) {
          const variable = variables[i];

          if (
            !isUsedVariable(variable) &&
            !isExported(variable) &&
            !hasRestSpreadSibling(variable) &&
            !(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable))
          ) {
            unusedVars.push(variable);
          }
        }
      }

      for (i = 0, l = childScopes.length; i < l; ++i) {
        collectUnusedVariables(childScopes[i], unusedVars);
      }

      return unusedVars;
    }

    function handleFixes(fixer, unusedVar) {
      const id = unusedVar.identifiers[0];
      const parent = id.parent;

      if (parent.type === "VariableDeclarator") {
        if (parent.parent.declarations.length === 1) {
          return fixer.removeRange(parent.parent.range);
        }

        if (sourceCode.getTokenBefore(parent).value === ",") {
          return fixer.removeRange([
            sourceCode.getTokenBefore(parent).range[0],
            parent.range[1],
          ]);
        }

        return fixer.removeRange([
          parent.range[0],
          sourceCode.getTokenAfter(parent).range[1],
        ]);
      }

      if (parent.type === "ArrayPattern") {
        if (hasSingleElement(parent)) {
          return fixer.removeRange(parent.range);
        }

        if (sourceCode.getTokenBefore(id).value === ",") {
          return fixer.removeRange([
            sourceCode.getTokenBefore(id).range[0],
            id.range[1],
          ]);
        }

        return fixer.removeRange(id.range);
      }

      if (parent.type === "ObjectPattern") {
        if (parent.properties.length === 1) {
          return fixer.removeRange(parent.range);
        }

        if (sourceCode.getTokenBefore(parent).value === "{") {
          return fixer.removeRange([
            parent.range[0],
            sourceCode.getTokenAfter(parent).range[1],
          ]);
        }

        return fixer.removeRange([
          sourceCode.getTokenBefore(parent).range[0],
          parent.range[1],
        ]);
      }

      return fixer.removeRange(id.range);
    }

    return {
      "Program:exit"(programNode) {
        const unusedVars = collectUnusedVariables(
          sourceCode.getScope(programNode),
          [],
        );

        for (let i = 0, l = unusedVars.length; i < l; ++i) {
          const unusedVar = unusedVars[i];

          context.report({
            node: unusedVar.identifiers[0],
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
        }
      },
    };
  },
};
```