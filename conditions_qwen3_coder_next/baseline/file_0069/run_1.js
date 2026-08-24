function isSafelyEnclosingInExpression(node, child) {
	switch (node.type) {
		case "ArrayExpression":
		case "ArrayPattern":
		case "BlockStatement":
		case "ObjectExpression":
		case "ObjectPattern":
		case "TemplateLiteral":
			return true;
		case "ArrowFunctionExpression":
		case "FunctionExpression":
			return node.params.includes(child);
		case "CallExpression":
		case "NewExpression":
			return node.arguments.includes(child);
		case "MemberExpression":
			return node.computed && node.property === child;
		case "ConditionalExpression":
			return node.consequent === child;
		default:
			return false;
	}
}