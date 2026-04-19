/**
 * Return an array of variable nodes declared by the given AST node.
 *
 * @param {ASTNode} node The node to inspect.
 * @returns {ASTNode[]} An array of variable nodes.
 */
getDeclaredVariables(node) {
  const vars = [];

  // Recursively collect identifiers from patterns.
  const collectPattern = (pattern) => {
    if (!pattern) return;
    switch (pattern.type) {
      case 'Identifier':
        vars.push(pattern);
        break;
      case 'ObjectPattern':
        pattern.properties.forEach((prop) => {
          if (prop.type === 'RestElement') {
            collectPattern(prop.argument);
          } else {
            collectPattern(prop.value);
          }
        });
        break;
      case 'ArrayPattern':
        pattern.elements.forEach((el) => {
          if (el) collectPattern(el);
        });
        break;
      case 'RestElement':
        collectPattern(pattern.argument);
        break;
      case 'AssignmentPattern':
        collectPattern(pattern.left);
        break;
      default:
        // ignore other pattern types
        break;
    }
  };

  // Handlers for node types that declare variables.
  const handlers = {
    VariableDeclaration: () =>
      node.declarations.forEach((decl) =>
        vars.push(...this.getDeclaredVariables(decl))
      ),
    VariableDeclarator: () => collectPattern(node.id),
    FunctionDeclaration: () => {
      if (node.id) vars.push(node.id);
      node.params.forEach((param) =>
        vars.push(...this.getDeclaredVariables(param))
      );
    },
    FunctionExpression: () => {
      if (node.id) vars.push(node.id);
      node.params.forEach((param) =>
        vars.push(...this.getDeclaredVariables(param))
      );
    },
    ArrowFunctionExpression: () => {
      node.params.forEach((param) =>
        vars.push(...this.getDeclaredVariables(param))
      );
    },
    ClassDeclaration: () => node.id && vars.push(node.id),
    ClassExpression: () => node.id && vars.push(node.id),
    ImportDeclaration: () =>
      node.specifiers.forEach((spec) =>
        vars.push(...this.getDeclaredVariables(spec))
      ),
    ImportSpecifier: () => vars.push(node.local),
    ImportDefaultSpecifier: () => vars.push(node.local),
    ImportNamespaceSpecifier: () => vars.push(node.local),
    CatchClause: () => node.param && vars.push(node.param),
  };

  const handler = handlers[node.type];
  if (handler) handler();

  return vars;
}