function getDeclaredVariables(node) {
    if (!node) {
        throw new Error("Missing required argument: node");
    }

    const handlers = {
        VariableDeclaration: () => {
            const vars = [];
            for (const decl of node.declarations) {
                vars.push(...extractIdentifiers(decl.id));
            }
            return vars;
        },
        VariableDeclarator: () => extractIdentifiers(node.id),
        FunctionDeclaration: () => {
            const vars = [node.id.name];
            for (const param of node.params) {
                vars.push(...extractIdentifiers(param));
            }
            return vars;
        },
        FunctionExpression: () => {
            const vars = [];
            if (node.id) vars.push(node.id.name);
            for (const param of node.params) {
                vars.push(...extractIdentifiers(param));
            }
            return vars;
        },
        ArrowFunctionExpression: () => {
            const vars = [];
            for (const param of node.params) {
                vars.push(...extractIdentifiers(param));
            }
            return vars;
        },
        ClassDeclaration: () => [node.id.name],
        ClassExpression: () => (node.id ? [node.id.name] : []),
        CatchClause: () => extractIdentifiers(node.param),
        ImportSpecifier: () => [node.local.name],
        ImportDefaultSpecifier: () => [node.local.name],
        ImportNamespaceSpecifier: () => [node.local.name],
        ImportDeclaration: () => {
            const vars = [];
            for (const spec of node.specifiers) {
                vars.push(...extractIdentifiers(spec.local));
            }
            return vars;
        },
        // Add other node types as needed
    };

    const handler = handlers[node.type];
    if (!handler) return [];

    return handler();

    function extractIdentifiers(pattern) {
        const ids = [];
        if (!pattern) return ids;
        switch (pattern.type) {
            case "Identifier":
                ids.push(pattern.name);
                break;
            case "ObjectPattern":
                for (const prop of pattern.properties) {
                    if (prop.type === "RestElement") {
                        ids.push(...extractIdentifiers(prop.argument));
                    } else {
                        ids.push(...extractIdentifiers(prop.value));
                    }
                }
                break;
            case "ArrayPattern":
                for (const elem of pattern.elements) {
                    if (elem) ids.push(...extractIdentifiers(elem));
                }
                break;
            case "RestElement":
                ids.push(...extractIdentifiers(pattern.argument));
                break;
            case "AssignmentPattern":
                ids.push(...extractIdentifiers(pattern.left));
                break;
            default:
                break;
        }
        return ids;
    }
}