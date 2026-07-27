/**
 * Gets an array of variables without read references.
 * @param {Scope} scope an eslint-scope Scope object.
 * @param {Variable[]} unusedVars an array that saving result.
 * @returns {Variable[]} unused variables of the scope and descendant scopes.
 * @private
 */
function collectUnusedVariables(scope, unusedVars) {
  const variables = scope.variables;
  const childScopes = scope.childScopes;

  if (scope.type !== "global" || config.vars === "all") {
    variables.forEach(variable => {
      if (
        scope.type === "class" &&
        scope.block.id === variable.identifiers[0]
      ) {
        return;
      }

      if (scope.functionExpressionScope) {
        return;
      }

      if (
        !config.reportUsedIgnorePattern &&
        variable.eslintUsed
      ) {
        return;
      }

      if (
        scope.type === "function" &&
        variable.name === "arguments" &&
        variable.identifiers.length === 0
      ) {
        return;
      }

      const def = variable.defs[0];

      if (def) {
        const type = def.type;
        const refUsedInArrayPatterns = variable.references.some(
          ref =>
            ref.identifier.parent.type === "ArrayPattern",
        );

        if (
          (def.name.parent.type === "ArrayPattern" ||
            refUsedInArrayPatterns) &&
          config.destructuredArrayIgnorePattern &&
          config.destructuredArrayIgnorePattern.test(def.name.name)
        ) {
          if (
            config.reportUsedIgnorePattern &&
            isUsedVariable(variable)
          ) {
            context.report({
              node: def.name,
              messageId: "usedIgnoredVar",
              data: getUsedIgnoredMessageData(
                variable,
                "array-destructure",
              ),
            });
          }

          return;
        }

        if (type === "ClassName") {
          const hasStaticBlock = def.node.body.body.some(
            node => node.type === "StaticBlock",
          );

          if (
            config.ignoreClassWithStaticInitBlock &&
            hasStaticBlock
          ) {
            return;
          }
        }

        if (type === "CatchClause") {
          if (config.caughtErrors === "none") {
            return;
          }

          if (
            config.caughtErrorsIgnorePattern &&
            config.caughtErrorsIgnorePattern.test(def.name.name)
          ) {
            if (
              config.reportUsedIgnorePattern &&
              isUsedVariable(variable)
            ) {
              context.report({
                node: def.name,
                messageId: "usedIgnoredVar",
                data: getUsedIgnoredMessageData(
                  variable,
                  "catch-clause",
                ),
              });
            }

            return;
          }
        } else if (type === "Parameter") {
          if (
            def.node.parent.type === "Property" ||
            def.node.parent.type === "MethodDefinition"
          ) {
            if (def.node.parent.kind === "set") {
              return;
            }
          }

          if (config.args === "none") {
            return;
          }

          if (
            config.argsIgnorePattern &&
            config.argsIgnorePattern.test(def.name.name)
          ) {
            if (
              config.reportUsedIgnorePattern &&
              isUsedVariable(variable)
            ) {
              context.report({
                node: def.name,
                messageId: "usedIgnoredVar",
                data: getUsedIgnoredMessageData(
                  variable,
                  "parameter",
                ),
              });
            }

            return;
          }

          if (
            config.args === "after-used" &&
            astUtils.isFunction(def.name.parent) &&
            !isAfterLastUsedArg(variable)
          ) {
            return;
          }
        } else {
          if (
            config.varsIgnorePattern &&
            config.varsIgnorePattern.test(def.name.name)
          ) {
            if (
              config.reportUsedIgnorePattern &&
              isUsedVariable(variable)
            ) {
              context.report({
                node: def.name,
                messageId: "usedIgnoredVar",
                data: getUsedIgnoredMessageData(
                  variable,
                  "variable",
                ),
              });
            }

            return;
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
        unusedVars.push(variable);
      }
    });
  }

  childScopes.forEach(childScope => {
    collectUnusedVariables(childScope, unusedVars);
  });

  return unusedVars;
}