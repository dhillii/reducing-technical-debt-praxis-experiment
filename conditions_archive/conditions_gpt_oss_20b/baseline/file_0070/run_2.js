"use strict";

const astUtils = require("./utils/ast-utils");

/**
 * @typedef {'array-destructure'|'catch-clause'|'parameter'|'variable'} VariableType
 */

/**
 * @typedef {Object} UnusedVarMessageData
 * @property {string} varName
 * @property {'defined'|'assigned a value'} action
 * @property {string} additional
 */

/**
 * @typedef {Object} UsedIgnoredVarMessageData
 * @property {string} varName
 * @property {string} additional
 */

/**
 * @type {import('../types').Rule.RuleModule}
 */
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
          { enum: ["all", "local"] },
          {
            type: "object",
            properties: {
              vars: { enum: ["all", "local"] },
              varsIgnorePattern: { type: "string" },
              args: { enum: ["all", "after-used", "none"] },
              ignoreRestSiblings: { type: "boolean" },
              argsIgnorePattern: { type: "string" },
              caughtErrors: { enum: ["all", "none"] },
              caughtErrorsIgnorePattern: { type: "string" },
              destructuredArrayIgnorePattern: { type: "string" },
              ignoreClassWithStaticInitBlock: { type: "boolean" },
              ignoreUsingDeclarations: { type: "boolean" },
              reportUsedIgnorePattern: { type: "boolean" },
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
        if (firstOption.varsIgnorePattern)
          config.varsIgnorePattern = new RegExp(firstOption.varsIgnorePattern, "u");
        if (firstOption.argsIgnorePattern)
          config.argsIgnorePattern = new RegExp(firstOption.argsIgnorePattern, "u");
        if (firstOption.caughtErrorsIgnorePattern)
          config.caughtErrorsIgnorePattern = new RegExp(
            firstOption.caughtErrorsIgnorePattern,
            "u",
          );
        if (firstOption.destructuredArrayIgnorePattern)
          config.destructuredArrayIgnorePattern = new RegExp(
            firstOption.destructuredArrayIgnorePattern,
            "u",
          );
      }
    }

    const REST_PROPERTY_TYPE =
      /^(?:RestElement|(?:Experimental)?RestProperty)$/u;

    function isExported(variable) {
      const def = variable.defs[0];
      if (!def) return false;
      let node = def.node;
      if (node.type === "VariableDeclarator") node = node.parent;
      if (def.type === "Parameter") return false;
      return node.parent.type.startsWith("Export");
    }

    function usesExplicitResourceManagement(variable) {
      const [def] = variable.defs;
      return (
        def?.type === "Variable" &&
        (def.parent.kind === "using" || def.parent.kind === "await using")
      );
    }

    function hasRestSpreadSibling(variable) {
      if (!config.ignoreRestSiblings) return false;
      const hasRestSiblingDefinition = variable.defs.some(def =>
        hasRestSibling(def.name.parent),
      );
      const hasRestSiblingReference = variable.references.some(ref =>
        hasRestSibling(ref.identifier.parent),
      );
      return hasRestSiblingDefinition || hasRestSiblingReference;
    }

    function hasRestSibling(node) {
      return (
        node.type === "Property" &&
        node.parent.type === "ObjectPattern" &&
        REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type)
      );
    }

    function isUsedVariable(variable) {
      if (variable.eslintUsed) return true;
      const functionNodes = getFunctionDefinitions(variable);
      const isFunctionDefinition = functionNodes.length > 0;
      let rhsNode = null;
      return variable.references.some(ref => {
        if (isForInOfRef(ref)) return true;
        const forItself = isReadForItself(ref, rhsNode);
        rhsNode = getRhsNode(ref, rhsNode);
        return (
          isReadRef(ref) &&
          !forItself &&
          !(isFunctionDefinition && isSelfReference(ref, functionNodes))
        );
      });
    }

    function getFunctionDefinitions(variable) {
      const defs = [];
      variable.defs.forEach(def => {
        if (def.type === "FunctionName") defs.push(def.node);
        if (
          def.type === "Variable" &&
          def.node.init &&
          (def.node.init.type === "FunctionExpression" ||
            def.node.init.type === "ArrowFunctionExpression")
        )
          defs.push(def.node.init);
      });
      return defs;
    }

    function isReadRef(ref) {
      return ref.isRead();
    }

    function isSelfReference(ref, nodes) {
      let scope = ref.from;
      while (scope) {
        if (nodes.includes(scope.block)) return true;
        scope = scope.upper;
      }
      return false;
    }

    function isForInOfRef(ref) {
      let target = ref.identifier.parent;
      if (target.type === "VariableDeclarator") target = target.parent.parent;
      if (target.type !== "ForInStatement" && target.type !== "ForOfStatement")
        return false;
      if (target.body.type === "BlockStatement") target = target.body.body[0];
      else target = target.body;
      if (!target) return false;
      return target.type === "ReturnStatement";
    }

    function getRhsNode(ref, prevRhsNode) {
      const id = ref.identifier;
      const parent = id.parent;
      const refScope = ref.from.variableScope;
      const varScope = ref.resolved.scope.variableScope;
      const canBeUsedLater = refScope !== varScope || astUtils.isInLoop(id);
      if (prevRhsNode && isInside(id, prevRhsNode)) return prevRhsNode;
      if (
        parent.type === "AssignmentExpression" &&
        isUnusedExpression(parent) &&
        id === parent.left &&
        !canBeUsedLater
      )
        return parent.right;
      return null;
    }

    function isInside(inner, outer) {
      return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
    }

    function isUnusedExpression(node) {
      const parent = node.parent;
      if (parent.type === "ExpressionStatement") return true;
      if (parent.type === "SequenceExpression") {
        const isLast = parent.expressions.at(-1) === node;
        if (!isLast) return true;
        return isUnusedExpression(parent);
      }
      return false;
    }

    function isReadForItself(ref, rhsNode) {
      const id = ref.identifier;
      const parent = id.parent;
      return (
        ref.isRead() &&
        ((parent.type === "AssignmentExpression" &&
          parent.left === id &&
          isUnusedExpression(parent) &&
          !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
          (parent.type === "UpdateExpression" && isUnusedExpression(parent)) ||
          (rhsNode &&
            isInside(id, rhsNode) &&
            !isInsideOfStorableFunction(id, rhsNode)))
      );
    }

    function isInsideOfStorableFunction(id, rhsNode) {
      const funcNode = astUtils.getUpperFunction(id);
      return (
        funcNode &&
        isInside(funcNode, rhsNode) &&
        isStorableFunction(funcNode, rhsNode)
      );
    }

    function isStorableFunction(funcNode, rhsNode) {
      let node = funcNode;
      let parent = funcNode.parent;
      while (parent && isInside(parent, rhsNode)) {
        switch (parent.type) {
          case "SequenceExpression":
            if (parent.expressions.at(-1) !== node) return false;
            break;
          case "CallExpression":
          case "NewExpression":
            return parent.callee !== node;
          case "AssignmentExpression":
          case "TaggedTemplateExpression":
          case "YieldExpression":
            return true;
          default:
            if (/Statement$/.test(parent.type)) return true;
        }
        node = parent;
        parent = parent.parent;
      }
      return false;
    }

    function getVariableDescription(variableType) {
      switch (variableType) {
        case "array-destructure":
          return ["elements of array destructuring", config.destructuredArrayIgnorePattern];
        case "catch-clause":
          return ["caught errors", config.caughtErrorsIgnorePattern];
        case "parameter":
          return ["args", config.argsIgnorePattern];
        case "variable":
          return ["vars", config.varsIgnorePattern];
        default:
          throw new Error(`Unexpected variable type: ${variableType}`);
      }
    }

    function defToVariableType(def) {
      if (
        config.destructuredArrayIgnorePattern &&
        def.name.parent.type === "ArrayPattern"
      )
        return "array-destructure";
      switch (def.type) {
        case "CatchClause":
          return "catch-clause";
        case "Parameter":
          return "parameter";
        default:
          return "variable";
      }
    }

    function getDefinedMessageData(unusedVar) {
      const def = unusedVar.defs && unusedVar.defs[0];
      let additional = "";
      if (def) {
        const [desc, pattern] = getVariableDescription(defToVariableType(def));
        if (pattern && desc) additional = `. Allowed unused ${desc} must match ${pattern}`;
      }
      return { varName: unusedVar.name, action: "defined", additional };
    }

    function getAssignedMessageData(unusedVar) {
      const def = unusedVar.defs && unusedVar.defs[0];
      let additional = "";
      if (def) {
        const [desc, pattern] = getVariableDescription(defToVariableType(def));
        if (pattern && desc) additional = `. Allowed unused ${desc} must match ${pattern}`;
      }
      return { varName: unusedVar.name, action: "assigned a value", additional };
    }

    function getUsedIgnoredMessageData(variable, variableType) {
      const [desc, pattern] = getVariableDescription(variableType);
      let additional = "";
      if (pattern && desc) additional = `. Used ${desc} must not match ${pattern}`;
      return { varName: variable.name, additional };
    }

    function shouldIgnore(variable) {
      const def = variable.defs[0];
      if (!def) return false;
      const type = defToVariableType(def);
      const [desc, pattern] = getVariableDescription(type);
      if (!pattern) return false;
      return pattern.test(def.name.name);
    }

    function collectUnusedVariables(scope, unusedVars) {
      if (scope.type !== "global" || config.vars === "all") {
        for (const variable of scope.variables) {
          if (variable.eslintUsed) continue;
          if (isExported(variable)) continue;
          if (usesExplicitResourceManagement(variable)) continue;
          if (hasRestSpreadSibling(variable)) continue;
          if (shouldIgnore(variable)) continue;
          if (!isUsedVariable(variable)) unusedVars.push(variable);
        }
      }
      for (const child of scope.childScopes) {
        collectUnusedVariables(child, unusedVars);
      }
      return unusedVars;
    }

    function handleFixes(fixer, unusedVar) {
      const id = unusedVar.identifiers[0];
      const parent = id.parent;
      const parentType = parent.type;
      const tokenBefore = sourceCode.getTokenBefore(id);
      const tokenAfter = sourceCode.getTokenAfter(id);

      // Simplified: only remove the variable declaration or parameter
      if (parentType === "VariableDeclarator") {
        if (parent.parent.declarations.length === 1) {
          return fixer.removeRange(parent.parent.range);
        }
        if (tokenBefore.value === ",") {
          return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
        }
        return fixer.removeRange([parent.range[0], tokenAfter.range[1]]);
      }

      if (parentType === "AssignmentPattern") {
        if (isFunction(parent.parent)) {
          return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
        }
      }

      if (parentType === "RestElement") {
        if (isFunction(parent.parent)) {
          return fixer.removeRange(parent.range);
        }
      }

      if (parentType === "ObjectPattern" || parentType === "ArrayPattern") {
        return fixer.removeRange(id.range);
      }

      return fixer.removeRange(id.range);
    }

    return {
      "Program:exit"(programNode) {
        const unusedVars = collectUnusedVariables(
          sourceCode.getScope(programNode),
          [],
        );

        for (const unusedVar of unusedVars) {
          if (unusedVar.defs.length > 0) {
            const writeRefs = unusedVar.references.filter(
              ref => ref.isWrite() && ref.from.variableScope === unusedVar.scope.variableScope,
            );
            const refToReport = writeRefs.length ? writeRefs.at(-1) : null;
            context.report({
              node: refToReport ? refToReport.identifier : unusedVar.identifiers[0],
              messageId: "unusedVar",
              data: unusedVar.references.some(ref => ref.isWrite())
                ? getAssignedMessageData(unusedVar)
                : getDefinedMessageData(unusedVar),
              suggest: [
                {
                  messageId: "removeVar",
                  data: { varName: unusedVar.name },
                  fix(fixer) {
                    return handleFixes(fixer, unusedVar);
                  },
                },
              ],
            });
          } else if (unusedVar.eslintExplicitGlobalComments) {
            const directiveComment = unusedVar.eslintExplicitGlobalComments[0];
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