/**
 * Retrieve the scope for a given AST node, adjusting the block property
 * according to the ECMAScript version and node type.
 *
 * @param {ASTNode} node The AST node to get the scope for.
 * @returns {{type: string, block: ASTNode, upper: Scope, variables: Array, references: Array}} The scope object.
 * @throws {Error} If the node argument is missing.
 */
getScope(node) {
  if (!node) {
    throw new Error('Missing required argument: node');
  }

  const scope = this.scopeManager.getScope(node);
  const ecmaVersion = this.languageOptions?.ecmaVersion ?? 5;
  let block;

  // Determine the block node based on node type and ECMAScript version
  switch (node.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
      block = node;
      break;

    case 'BlockStatement':
      block = ecmaVersion >= 2015 ? node : node.parent?.parent ?? node;
      break;

    case 'SwitchStatement':
      block = ecmaVersion >= 2015 ? node : node.parent?.parent ?? node;
      break;

    case 'SwitchCase':
      block = ecmaVersion >= 2015
        ? node.parent
        : node.parent?.parent?.parent ?? node;
      break;

    case 'CatchClause':
      block = node;
      break;

    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
      block = ecmaVersion >= 2015 ? node : node.parent?.parent ?? node;
      break;

    default:
      block = node;
  }

  // Return a shallow copy with the adjusted block
  return { ...scope, block };
}