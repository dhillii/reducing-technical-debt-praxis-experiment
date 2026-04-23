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

    const getVariableDescription = (variableType) => {
      switch (variableType) {
        case "array-destructure":
          return [
            "elements of array destructuring",
            config.destructuredArrayIgnorePattern,
          ];
        case "catch-clause":
          return ["caught errors", config.caughtErrorsIgnorePattern];
        case "parameter":
          return ["args", config.argsIgnorePattern];
        case "variable":
          return ["vars", config.varsIgnorePattern];
        default:
          throw new Error(`Unexpected variable type: ${variableType}`);
      }
    };

    const getDefinedMessageData = (unusedVar) => {
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
    };

    const getAssignedMessageData = (unusedVar) => {
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
    };

    const getUsedIgnoredMessageData = (variable, variableType) => {
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
    };

    const getVariableType = (def) => {
      if (config.destructuredArrayIgnorePattern && def.name.parent.type === "ArrayPattern") {
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
    };

    const isExported = (variable) => {
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
    };

    const usesExplicitResourceManagement = (variable) => {
      const [definition] = variable.defs;

      return (
        definition?.type === "Variable" &&
        (definition.parent.kind === "using" || definition.parent.kind === "await using")
      );
    };

    const hasRestSibling = (node) => {
      return (
        node.type === "Property" &&
        node.parent.type === "ObjectPattern" &&
        /^(?:RestElement|(?:Experimental)?RestProperty)$/.test(node.parent.properties.at(-1).type)
      );
    };

    const hasRestSpreadSibling = (variable) => {
      if (config.ignoreRestSiblings) {
        const hasRestSiblingDefinition = variable.defs.some((def) => hasRestSibling(def.name.parent));
        const hasRestSiblingReference = variable.references.some((ref) => hasRestSibling(ref.identifier.parent));

        return hasRestSiblingDefinition || hasRestSiblingReference;
      }

      return false;
    };

    const isReadRef = (ref) => {
      return ref.isRead();
    };

    const isSelfReference = (ref, nodes) => {
      let scope = ref.from;

      while (scope) {
        if (nodes.includes(scope.block)) {
          return true;
        }

        scope = scope.upper;
      }

      return false;
    };

    const getFunctionDefinitions = (variable) => {
      const functionDefinitions = [];

      variable.defs.forEach((def) => {
        const { type, node } = def;

        if (type === "FunctionName") {
          functionDefinitions.push(node);
        } else if (type === "Variable" && node.init && (node.init.type === "FunctionExpression" || node.init.type === "ArrowFunctionExpression")) {
          functionDefinitions.push(node.init);
        }
      });
      return functionDefinitions;
    };

    const isInside = (inner, outer) => {
      return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
    };

    const isUnusedExpression = (node) => {
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
    };

    const getRhsNode = (ref, prevRhsNode) => {
      const id = ref.identifier;
      const parent = id.parent;
      const refScope = ref.from.variableScope;
      const varScope = ref.resolved.scope.variableScope;
      const canBeUsedLater = refScope !== varScope || astUtils.isInLoop(id);

      if (prevRhsNode && isInside(id, prevRhsNode)) {
        return prevRhsNode;
      }

      if (parent.type === "AssignmentExpression" && isUnusedExpression(parent) && id === parent.left && !canBeUsedLater) {
        return parent.right;
      }
      return null;
    };

    const isStorableFunction = (funcNode, rhsNode) => {
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
            if (/^(?:Statement|Declaration)$/.test(parent.type)) {
              return true;
            }
        }

        node = parent;
        parent = parent.parent;
      }

      return false;
    };

    const isInsideOfStorableFunction = (id, rhsNode) => {
      const funcNode = astUtils.getUpperFunction(id);

      return funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode);
    };

    const isReadForItself = (ref, rhsNode) => {
      const id = ref.identifier;
      const parent = id.parent;

      return (
        ref.isRead() &&
        ((parent.type === "AssignmentExpression" && parent.left === id && isUnusedExpression(parent) && !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" && isUnusedExpression(parent)) ||
          (rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode)))
      );
    };

    const isForInOfRef = (ref) => {
      let target = ref.identifier.parent;

      if (target.type === "VariableDeclarator") {
        target = target.parent.parent;
      }

      if (target.type !== "ForInStatement" && target.type !== "ForOfStatement") {
        return false;
      }

      if (target.body.type === "BlockStatement") {
        target = target.body.body[0];
      } else {
        target = target.body;
      }

      return target.type === "ReturnStatement";
    };

    const isUsedVariable = (variable) => {
      if (variable.eslintUsed) {
        return true;
      }

      const functionNodes = getFunctionDefinitions(variable);
      const isFunctionDefinition = functionNodes.length > 0;

      let rhsNode = null;

      return variable.references.some((ref) => {
        if (isForInOfRef(ref)) {
          return true;
        }

        const forItself = isReadForItself(ref, rhsNode);

        rhsNode = getRhsNode(ref, rhsNode);

        return isReadRef(ref) && !forItself && !(isFunctionDefinition && isSelfReference(ref, functionNodes));
      });
    };

    const isAfterLastUsedArg = (variable) => {
      const def = variable.defs[0];
      const params = sourceCode.getDeclaredVariables(def.node);
      const posteriorParams = params.slice(params.indexOf(variable) + 1);

      return !posteriorParams.some((v) => v.references.length > 0 || v.eslintUsed);
    };

    const collectUnusedVariables = (scope, unusedVars) => {
      const variables = scope.variables;
      const childScopes = scope.childScopes;
      let i, l;

      if (scope.type !== "global" || config.vars === "all") {
        for (i = 0, l = variables.length; i < l; ++i) {
          const variable = variables[i];

          if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
            continue;
          }

          if (scope.functionExpressionScope) {
            continue;
          }

          if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
            continue;
          }

          if (scope.type === "function" && variable.name === "arguments" && variable.identifiers.length === 0) {
            continue;
          }

          const def = variable.defs[0];

          if (def) {
            const type = def.type;
            const refUsedInArrayPatterns = variable.references.some((ref) => ref.identifier.parent.type === "ArrayPattern");

            if (def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) {
              if (config.destructuredArrayIgnorePattern && config.destructuredArrayIgnorePattern.test(def.name.name)) {
                if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                  context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, "array-destructure"),
                  });
                }

                continue;
              }
            }

            if (type === "ClassName") {
              const hasStaticBlock = def.node.body.body.some((node) => node.type === "StaticBlock");

              if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) {
                continue;
              }
            }

            if (type === "CatchClause") {
              if (config.caughtErrors === "none") {
                continue;
              }

              if (config.caughtErrorsIgnorePattern && config.caughtErrorsIgnorePattern.test(def.name.name)) {
                if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                  context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, "catch-clause"),
                  });
                }

                continue;
              }
            } else if (type === "Parameter") {
              if (config.args === "none") {
                continue;
              }

              if (config.argsIgnorePattern && config.argsIgnorePattern.test(def.name.name)) {
                if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                  context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, "parameter"),
                  });
                }

                continue;
              }

              if (config.args === "after-used" && astUtils.isFunction(def.name.parent) && !isAfterLastUsedArg(variable)) {
                continue;
              }
            } else {
              if (config.varsIgnorePattern && config.varsIgnorePattern.test(def.name.name)) {
                if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                  context.report({
                    node: def.name,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, "variable"),
                  });
                }

                continue;
              }
            }
          }

          if (!isUsedVariable(variable) && !isExported(variable) && !(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) && !hasRestSpreadSibling(variable)) {
            unusedVars.push(variable);
          }
        }
      }

      for (i = 0, l = childScopes.length; i < l; ++i) {
        collectUnusedVariables(childScopes[i], unusedVars);
      }

      return unusedVars;
    };

    const handleFixes = (fixer, unusedVar) => {
      const id = unusedVar.identifiers[0];
      const parent = id.parent;
      const parentType = parent.type;
      const tokenBefore = sourceCode.getTokenBefore(id);
      const tokenAfter = sourceCode.getTokenAfter(id);

      if (parentType === "VariableDeclarator") {
        if (parent.parent.declarations.length === 1) {
          return fixer.removeRange(parent.parent.range);
        }

        if (tokenBefore.value === ",") {
          return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
        }

        return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
      }

      if (parentType === "ArrayPattern") {
        if (parent.elements.filter((e) => e !== null).length === 1) {
          return fixer.removeRange(parent.range);
        }

        if (tokenBefore.value === "," && tokenAfter.value === ",") {
          return fixer.removeRange(id.range);
        }
      }

      if (parentType === "RestElement") {
        return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
      }

      if (parentType === "FunctionDeclaration" && parent.id === id) {
        return fixer.removeRange(parent.range);
      }

      return fixer.removeRange(id.range);
    };

    return {
      "Program:exit"(programNode) {
        const unusedVars = collectUnusedVariables(sourceCode.getScope(programNode), []);

        for (let i = 0, l = unusedVars.length; i < l; ++i) {
          const unusedVar = unusedVars[i];

          context.report({
            node: unusedVar.identifiers[0],
            messageId: "unusedVar",
            data: unusedVar.references.some((ref) => ref.isWrite()) ? getAssignedMessageData(unusedVar) : getDefinedMessageData(unusedVar),
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