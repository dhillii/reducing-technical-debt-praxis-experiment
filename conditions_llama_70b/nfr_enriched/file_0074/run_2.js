function getVariable(scope, name) {
    // Extracted function to get variables in the current scope
    return scope.variables.find(v => v.name === name) || null;
}

// ...

describe("getDeclaredVariables(node)", () => {
    // ...

    it("VariableDeclaration", () => {
        const code =
            "\n var {a, x: [b], y: {c = 0}} = foo;\n let {d, x: [e], y: {f = 0}} = foo;\n const {g, x: [h], y: {i = 0}} = foo, {j, k = function(z) { let l; }} = bar;\n ";
        const namesList = [
            ["a", "b", "c"],
            ["d", "e", "f"],
            ["g", "h", "i", "j", "k"],
            ["l"],
        ];

        verify(code, "VariableDeclaration", namesList);
    });

    // ...
});

// ...

class SourceCode {
    // ...

    getDeclaredVariables(node) {
        // Extracted function to get declared variables
        const variables = [];
        if (node.type === "VariableDeclaration") {
            node.declarations.forEach(declarator => {
                variables.push(...this.getDeclaredVariables(declarator));
            });
        } else if (node.type === "VariableDeclarator") {
            if (node.id.type === "Identifier") {
                variables.push(node.id.name);
            } else if (node.id.type === "ObjectPattern") {
                node.id.properties.forEach(property => {
                    variables.push(property.key.name);
                });
            } else if (node.id.type === "ArrayPattern") {
                node.id.elements.forEach(element => {
                    if (element.type === "Identifier") {
                        variables.push(element.name);
                    }
                });
            }
        } else if (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
            variables.push(node.id.name);
            node.params.forEach(param => {
                if (param.type === "Identifier") {
                    variables.push(param.name);
                } else if (param.type === "ObjectPattern") {
                    param.properties.forEach(property => {
                        variables.push(property.key.name);
                    });
                } else if (param.type === "ArrayPattern") {
                    param.elements.forEach(element => {
                        if (element.type === "Identifier") {
                            variables.push(element.name);
                        }
                    });
                }
            });
        } else if (node.type === "ClassDeclaration") {
            variables.push(node.id.name);
        } else if (node.type === "CatchClause") {
            variables.push(node.param.name);
        } else if (node.type === "ImportDeclaration") {
            node.specifiers.forEach(specifier => {
                if (specifier.type === "ImportDefaultSpecifier") {
                    variables.push(specifier.local.name);
                } else if (specifier.type === "ImportSpecifier") {
                    variables.push(specifier.local.name);
                } else if (specifier.type === "ImportNamespaceSpecifier") {
                    variables.push(specifier.local.name);
                }
            });
        }
        return variables;
    }

    // ...
}