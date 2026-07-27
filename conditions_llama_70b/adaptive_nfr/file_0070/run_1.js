/**
 * Gets an array of variables without read references.
 * @param {Scope} scope an eslint-scope Scope object.
 * @param {Variable[]} unusedVars an array that saving result.
 * @returns {Variable[]} unused variables of the scope and descendant scopes.
 * @private
 */
function collectUnusedVariables(scope, unusedVars) {
  if (shouldSkipScope(scope)) {
    return unusedVars;
  }

  const variables = scope.variables;

  for (const variable of variables) {
    if (shouldSkipVariable(variable)) {
      continue;
    }

    if (!isUsedVariable(variable) && !isExported(variable)) {
      unusedVars.push(variable);
    }
  }

  for (const childScope of scope.childScopes) {
    collectUnusedVariables(childScope, unusedVars);
  }

  return unusedVars;
}

/**
 * Checks if a scope should be skipped.
 * @param {Scope} scope an eslint-scope Scope object.
 * @returns {boolean} True if the scope should be skipped, false if not.
 * @private
 */
function shouldSkipScope(scope) {
  return scope.type === "global" && config.vars !== "all";
}

/**
 * Checks if a variable should be skipped.
 * @param {Variable} variable eslint-scope variable object.
 * @returns {boolean} True if the variable should be skipped, false if not.
 * @private
 */
function shouldSkipVariable(variable) {
  if (variable.eslintUsed && !config.reportUsedIgnorePattern) {
    return true;
  }

  if (variable.name === "arguments" && variable.identifiers.length === 0) {
    return true;
  }

  const def = variable.defs[0];

  if (!def) {
    return true;
  }

  const type = def.type;

  if (type === "ClassName" && config.ignoreClassWithStaticInitBlock) {
    const hasStaticBlock = def.node.body.body.some(
      node => node.type === "StaticBlock",
    );

    if (hasStaticBlock) {
      return true;
    }
  }

  if (type === "CatchClause" && config.caughtErrors === "none") {
    return true;
  }

  if (type === "Parameter" && config.args === "none") {
    return true;
  }

  if (config.destructuredArrayIgnorePattern && def.name.parent.type === "ArrayPattern") {
    if (config.destructuredArrayIgnorePattern.test(def.name.name)) {
      return true;
    }
  }

  if (config.varsIgnorePattern && config.varsIgnorePattern.test(def.name.name)) {
    return true;
  }

  if (config.caughtErrorsIgnorePattern && type === "CatchClause") {
    if (config.caughtErrorsIgnorePattern.test(def.name.name)) {
      return true;
    }
  }

  if (config.argsIgnorePattern && type === "Parameter") {
    if (config.argsIgnorePattern.test(def.name.name)) {
      return true;
    }
  }

  return false;
}