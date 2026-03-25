# Refactored `no-unused-vars` Rule

## Key Refactoring Strategies Applied

1. **Extract configuration parsing** into a dedicated function
2. **Merge duplicate message data functions** (`getDefinedMessageData`/`getAssignedMessageData`)
3. **Extract variable filtering logic** into focused helper functions
4. **Decompose `collectUnusedVariables`** into smaller, single-responsibility functions
5. **Decompose `handleFixes`** by extracting pattern-specific fixers into a strategy map
6. **Eliminate nested function definitions** inside `handleFixes`

---

```javascript
/**
 * @fileoverview Rule to flag declared but unused variables
 * @author Ilya Volodin
 */

"use strict";

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const REST_PROPERTY_TYPE = /^(?:RestElement|(?:Experimental)?RestProperty)$/u;
const STATEMENT_TYPE = /(?:Statement|Declaration)$/u;

const DEFAULT_CONFIG = {
    vars: "all",
    args: "after-used",
    ignoreRestSiblings: false,
    caughtErrors: "all",
    ignoreClassWithStaticInitBlock: false,
    ignoreUsingDeclarations: false,
    reportUsedIgnorePattern: false,
};

const VARIABLE_TYPE_CONFIG = {
    "array-destructure": {
        patternKey: "destructuredArrayIgnorePattern",
        description: "elements of array destructuring",
    },
    "catch-clause": {
        patternKey: "caughtErrorsIgnorePattern",
        description: "caught errors",
    },
    parameter: {
        patternKey: "argsIgnorePattern",
        description: "args",
    },
    variable: {
        patternKey: "varsIgnorePattern",
        description: "vars",
    },
};

const PATTERN_CONFIG_KEYS = [
    ["varsIgnorePattern", "varsIgnorePattern"],
    ["argsIgnorePattern", "argsIgnorePattern"],
    ["caughtErrorsIgnorePattern", "caughtErrorsIgnorePattern"],
    ["destructuredArrayIgnorePattern", "destructuredArrayIgnorePattern"],
];

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
            unusedVar: "'{{varName}}' is {{action}} but never used{{additional}}.",
            usedIgnoredVar: "'{{varName}}' is marked as ignored but is used{{additional}}.",
            removeVar: "Remove unused variable '{{varName}}'.",
        },
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const config = parseConfig(context.options[0]);

        //--------------------------------------------------------------------------
        // Configuration
        //--------------------------------------------------------------------------

        /**
         * Parses the rule options into a config object.
         * @param {*} firstOption The first rule option.
         * @returns {Object} The resolved config.
         */
        function parseConfig(firstOption) {
            const cfg = { ...DEFAULT_CONFIG };

            if (!firstOption) {
                return cfg;
            }

            if (typeof firstOption === "string") {
                cfg.vars = firstOption;
                return cfg;
            }

            const booleanKeys = [
                "ignoreRestSiblings",
                "ignoreClassWithStaticInitBlock",
                "ignoreUsingDeclarations",
                "reportUsedIgnorePattern",
            ];
            const enumKeys = ["vars", "args", "caughtErrors"];

            for (const key of enumKeys) {
                if (firstOption[key]) {
                    cfg[key] = firstOption[key];
                }
            }

            for (const key of booleanKeys) {
                if (firstOption[key]) {
                    cfg[key] = firstOption[key];
                }
            }

            for (const [optionKey, configKey] of PATTERN_CONFIG_KEYS) {
                if (firstOption[optionKey]) {
                    cfg[configKey] = new RegExp(firstOption[optionKey], "u");
                }
            }

            return cfg;
        }

        //--------------------------------------------------------------------------
        // Variable Type Helpers
        //--------------------------------------------------------------------------

        /**
         * Determines what variable type a def is.
         * @param {Object} def The declaration to check.
         * @returns {string} A simple name for the variable type.
         */
        function defToVariableType(def) {
            if (
                config.destructuredArrayIgnorePattern &&
                def.name.parent.type === "ArrayPattern"
            ) {
                return "array-destructure";
            }

            const typeMap = {
                CatchClause: "catch-clause",
                Parameter: "parameter",
            };

            return typeMap[def.type] ?? "variable";
        }

        /**
         * Gets a variable's description and configured ignore pattern.
         * @param {string} variableType The variable type.
         * @returns {[string, string|undefined]} Description and pattern string.
         */
        function getVariableDescription(variableType) {
            const entry = VARIABLE_TYPE_CONFIG[variableType];

            if (!entry) {
                throw new Error(`Unexpected variable type: ${variableType}`);
            }

            const pattern = config[entry.patternKey];

            return [entry.description, pattern ? pattern.toString() : undefined];
        }

        /**
         * Builds the `additional` message suffix for ignore pattern hints.
         * @param {string} variableType The variable type.
         * @param {"unused"|"used"} context Whether the var is unused or used-but-ignored.
         * @returns {string} The additional message string.
         */
        function buildAdditionalMessage(variableType, messageContext) {
            const [description, pattern] = getVariableDescription(variableType);

            if (!pattern || !description) {
                return "";
            }

            return messageContext === "unused"
                ? `. Allowed unused ${description} must match ${pattern}`
                : `. Used ${description} must not match ${pattern}`;
        }

        /**
         * Generates message data for an unused variable.
         * @param {Variable} unusedVar eslint-scope variable object.
         * @param {"defined"|"assigned a value"} action The action description.
         * @returns {Object} Message data.
         */
        function getUnusedVarMessageData(unusedVar, action) {
            const def = unusedVar.defs?.[0];
            const additional = def
                ? buildAdditionalMessage(defToVariableType(def), "unused")
                : "";

            return { varName: unusedVar.name, action, additional };
        }

        /**
         * Generates message data for a used-but-ignored variable.
         * @param {Variable} variable eslint-scope variable object.
         * @param {string} variableType The variable type.
         * @returns {Object} Message data.
         */
        function getUsedIgnoredMessageData(variable, variableType) {
            return {
                varName: variable.name,
                additional: buildAdditionalMessage(variableType, "used"),
            };
        }

        //--------------------------------------------------------------------------
        // Variable Usage Helpers
        //--------------------------------------------------------------------------

        /**
         * Determines if a given variable is being exported from a module.
         * @param {Variable} variable eslint-scope variable object.
         * @returns {boolean} True if the variable is exported.
         */
        function isExported(variable) {
            const definition = variable.defs[0];

            if (!definition) {
                return false;
            }

            let node = definition.node;

            if (node.type === "VariableDeclarator") {
                node = node.parent;
            } else if (definition.type === "Parameter") {
                return false;
            }

            return node.parent.type.indexOf("Export") === 0;
        }

        /**
         * Determines if a variable uses explicit resource management.
         * @param {Variable} variable eslint-scope variable object.
         * @returns {boolean} True if declared with "using" or "await using".
         */
        function usesExplicitResourceManagement(variable) {
            const [definition] = variable.defs;

            return (
                definition?.type === "Variable" &&
                (definition.parent.kind === "using" ||
                    definition.parent.kind === "await using")
            );
        }

        /**
         * Checks whether a node is a sibling of the rest property.
         * @param {ASTNode} node A node to check.
         * @returns {boolean} True if the node is a sibling of the rest property.
         */
        function hasRestSibling(node) {
            return (
                node.type === "Property" &&
                node.parent.type === "ObjectPattern" &&
                REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type)
            );
        }

        /**
         * Determines if a variable has a sibling rest property.
         * @param {Variable} variable eslint-scope variable object.
         * @returns {boolean} True if the variable has a sibling rest property.
         */
        function hasRestSpreadSibling(variable) {
            if (!config.ignoreRestSiblings) {
                return false;
            }

            return (
                variable.defs.some(def => hasRestSibling(def.name.parent)) ||
                variable.references.some(ref =>
                    hasRestSibling(ref.identifier.parent),
                )
            );
        }

        /**
         * Gets a list of function definitions for a specified variable.
         * @param {Variable} variable eslint-scope variable object.
         * @returns {ASTNode[]} Function nodes.
         */
        function getFunctionDefinitions(variable) {
            const functionDefinitions = [];

            for (const def of variable.defs) {
                const { type, node } = def;

                if (type === "FunctionName") {
                    functionDefinitions.push(node);
                }

                if (
                    type === "Variable" &&
                    node.init &&
                    (node.init.type === "FunctionExpression" ||
                        node.init.type === "ArrowFunctionExpression")
                ) {
                    functionDefinitions.push(node.init);
                }
            }

            return functionDefinitions;
        }

        /**
         * Checks the position of given nodes.
         * @param {ASTNode} inner A node expected to be inside.
         * @param {ASTNode} outer A node expected to be outside.
         * @returns {boolean} `true` if `inner` exists within `outer`.
         */
        function isInside(inner, outer) {
            return (
                inner.range[0] >= outer.range[0] &&
                inner.range[1] <= outer.range[1]
            );
        }

        /**
         * Checks whether a given node is an unused expression.
         * @param {ASTNode} node The node itself.
         * @returns {boolean} True if the node is an unused expression.
         */
        function isUnusedExpression(node) {
            const parent = node.parent;

            if (parent.type === "ExpressionStatement") {
                return true;
            }

            if (parent.type === "SequenceExpression") {
                return parent.expressions.at(-1) !== node || isUnusedExpression(parent);
            }

            return false;
        }

        /**
         * Determine if an identifier is referencing an enclosing function name.
         * @param {Reference} ref The reference to check.
         * @param {ASTNode[]} nodes The candidate function nodes.
         * @returns {boolean} True if it's a self-reference.
         */
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

        /**
         * If a reference is the LHS of an assignment, returns the RHS node.
         * @param {Reference} ref A reference to check.
         * @param {ASTNode} prevRhsNode The previous RHS node.
         * @returns {ASTNode|null} The RHS node or null.
         */
        function getRhsNode(ref, prevRhsNode) {
            const id = ref.identifier;
            const parent = id.parent;
            const canBeUsedLater =
                ref.from.variableScope !== ref.resolved.scope.variableScope ||
                astUtils.isInLoop(id);

            if (prevRhsNode && isInside(id, prevRhsNode)) {
                return prevRhsNode;
            }

            if (
                parent.type === "AssignmentExpression" &&
                isUnusedExpression(parent) &&
                id === parent.left &&
                !canBeUsedLater
            ) {
                return parent.right;
            }

            return null;
        }

        /**
         * Checks whether a given function node is stored somewhere for later use.
         * @param {ASTNode} funcNode A function node to check.
         * @param {ASTNode} rhsNode The RHS node of the previous assignment.
         * @returns {boolean} True if the function can be used later.
         */
        function isStorableFunction(funcNode, rhsNode) {
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
                        if (STATEMENT_TYPE.test(parent.type)) {
                            return true;
                        }
                }

                node = parent;
                parent = parent.parent;
            }

            return false;
        }

        /**
         * Checks whether an Identifier exists inside a storable function.
         * @param {ASTNode} id An Identifier node to check.
         * @param {ASTNode} rhsNode The RHS node of the previous assignment.
         * @returns {boolean} True if inside a storable function.
         */
        function isInsideOfStorableFunction(id, rhsNode) {
            const funcNode = astUtils.getUpperFunction(id);

            return (
                funcNode &&
                isInside(funcNode, rhsNode) &&
                isStorableFunction(funcNode, rhsNode)
            );
        }

        /**
         * Checks whether a given reference is a read to update itself.
         * @param {Reference} ref A reference to check.
         * @param {ASTNode} rhsNode The RHS node of the previous assignment.
         * @returns {boolean} True if the reference is a read-for-itself.
         */
        function isReadForItself(ref, rhsNode) {
            const id = ref.identifier;
            const parent = id.parent;

            return (
                ref.isRead() &&
                ((parent.type === "AssignmentExpression" &&
                    parent.left === id &&
                    isUnusedExpression(parent) &&
                    !astUtils.isLogicalAssignmentOperator(parent.operator)) ||
                    (parent.type === "UpdateExpression" &&
                        isUnusedExpression(parent)) ||
                    (rhsNode &&
                        isInside(id, rhsNode) &&
                        !isInsideOfStorableFunction(id, rhsNode)))
            );
        }

        /**
         * Determine if an identifier is used in for-in or for-of loops.
         * @param {Reference} ref The reference to check.
         * @returns {boolean} True if used in a for-in/of loop with a return.
         */
        function isForInOfRef(ref) {
            let target = ref.identifier.parent;

            if (target.type === "VariableDeclarator") {
                target = target.parent.parent;
            }

            if (
                target.type !== "ForInStatement" &&
                target.type !== "ForOfStatement"
            ) {
                return false;
            }

            target = target.body.type === "BlockStatement"
                ? target.body.body[0]
                : target.body;

            return Boolean(target?.type === "ReturnStatement");
        }

        /**
         * Determines if the variable is used.
         * @param {Variable} variable The variable to check.
         * @returns {boolean} True if the variable is used.
         */
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
                    ref.isRead() &&
                    !forItself &&
                    !(isFunctionDefinition && isSelfReference(ref, functionNodes))
                );
            });
        }

        /**
         * Checks whether the given variable is after the last used parameter.
         * @param {Variable} variable The variable to check.
         * @returns {boolean} True if defined after the last used parameter.
         */
        function isAfterLastUsedArg(variable) {
            const def = variable.defs[0];
            const params = sourceCode.getDeclaredVariables(def.node);
            const posteriorParams = params.slice(params.indexOf(variable) + 1);

            return !posteriorParams.some(
                v => v.references.length > 0 || v.eslintUsed,
            );
        }

        //--------------------------------------------------------------------------
        // Unused Variable Collection
        //--------------------------------------------------------------------------

        /**
         * Checks if a variable matches an ignore pattern and optionally reports
         * it if it's used but ignored.
         * @param {Variable} variable The variable to check.
         * @param {RegExp|undefined} pattern The ignore pattern.
         * @param {string} variableType The variable type string.
         * @param {ASTNode} nameNode The name node for reporting.
         * @returns {boolean} True if the variable should be skipped.
         */
        function checkIgnorePattern(variable, pattern, variableType, nameNode) {
            if (!pattern || !pattern.test(nameNode.name)) {
                return false;
            }

            if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                context.report({
                    node: nameNode,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, variableType),
                });
            }

            return true;
        }

        /**
         * Determines whether a variable should be skipped during collection.
         * Returns true if the variable should be skipped, false if it should
         * be considered for the unused list.
         * @param {Variable} variable The variable to evaluate.
         * @param {Scope} scope The current scope.
         * @returns {boolean} True if the variable should be skipped.
         */
        function shouldSkipVariable(variable, scope) {
            // Skip class self-reference in class scope
            if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
                return true;
            }

            // Skip function expression names
            if (scope.functionExpressionScope) {
                return true;
            }

            // Skip variables marked with markVariableAsUsed()
            if (!config.reportUsedIgnorePattern && variable.eslintUsed) {
                return true;
            }

            // Skip implicit "arguments" variable
            if (
                scope.type === "function" &&
                variable.name === "arguments" &&
                variable.identifiers.length === 0
            ) {
                return true;
            }

            const def = variable.defs[0];

            if (!def) {
                return false;
            }

            return shouldSkipByDefinition(variable, def, scope);
        }

        /**
         * Determines whether a variable should be skipped based on its definition.
         * @param {Variable} variable The variable.
         * @param {Object} def The variable's definition.
         * @param {Scope} scope The current scope.
         * @returns {boolean} True if the variable should be skipped.
         */
        function shouldSkipByDefinition(variable, def, scope) { // eslint-disable-line no-unused-vars
            const { type } = def;
            const refUsedInArrayPatterns = variable.references.some(
                ref => ref.identifier.parent.type === "ArrayPattern",
            );

            // Skip array destructuring elements matching the ignore pattern
            if (
                (def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) &&
                checkIgnorePattern(
                    variable,
                    config.destructuredArrayIgnorePattern,
                    "array-destructure",
                    def.name,
                )
            ) {
                return true;
            }

            if (type === "ClassName") {
                return shouldSkipClassName(def);
            }

            if (type === "CatchClause") {
                return shouldSkipCatchClause(variable, def);
            }

            if (type === "Parameter") {
                return shouldSkipParameter(variable, def);
            }

            // Regular variable
            return checkIgnorePattern(
                variable,
                config.varsIgnorePattern,
                "variable",
                def.name,
            );
        }

        /**
         * Determines whether a class variable should be skipped.
         * @param {Object} def The class definition.
         * @returns {boolean} True if the class should be skipped.
         */
        function shouldSkipClassName(def) {
            if (!config.ignoreClassWithStaticInitBlock) {
                return false;
            }

            return def.node.body.body.some(node => node.type === "StaticBlock");
        }

        /**
         * Determines whether a catch clause variable should be skipped.
         * @param {Variable} variable The variable.
         * @param {Object} def The variable's definition.
         * @returns {boolean} True if the catch clause variable should be skipped.
         */
        function shouldSkipCatchClause(variable, def) {
            if (config.caughtErrors === "none") {
                return true;
            }

            return checkIgnorePattern(
                variable,
                config.caughtErrorsIgnorePattern,
                "catch-clause",
                def.name,
            );
        }

        /**
         * Determines whether a parameter variable should be skipped.
         * @param {Variable} variable The variable.
         * @param {Object} def The variable's definition.
         * @returns {boolean} True if the parameter should be skipped.
         */
        function shouldSkipParameter(variable, def) {
            const parentKind = def.node.parent?.kind;
            const parentType = def.node.parent?.type;

            // Skip setter arguments
            if (
                (parentType === "Property" || parentType === "MethodDefinition") &&
                parentKind === "set"
            ) {
                return true;
            }

            if (config.args === "none") {
                return true;
            }

            if (
                checkIgnorePattern(
                    variable,
                    config.argsIgnorePattern,
                    "parameter",
                    def.name,
                )
            ) {
                return true;
            }

            if (
                config.args === "after-used" &&
                astUtils.isFunction(def.name.parent) &&
                !isAfterLastUsedArg(variable)
            ) {
                return true;
            }

            return false;
        }

        /**
         * Gets an array of variables without read references.
         * @param {Scope} scope An eslint-scope Scope object.
         * @param {Variable[]} unusedVars An array accumulating results.
         * @returns {Variable[]} Unused variables of the scope and descendant scopes.
         */
        function collectUnusedVariables(scope, unusedVars) {
            if (scope.type === "global" && config.vars !== "all") {
                // Only recurse into child scopes for global scope when vars !== "all"
            } else {
                for (const variable of scope.variables) {
                    if (shouldSkipVariable(variable, scope)) {
                        continue;
                    }

                    if (
                        !isUsedVariable(variable) &&
                        !isExported(variable) &&
                        !(config.ignoreUsingDeclarations && usesExplicitResourceManagement(variable)) &&
                        !hasRestSpreadSibling(variable)
                    ) {
                        unusedVars.push(variable);
                    }
                }
            }

            for (const childScope of scope.childScopes) {
                collectUnusedVariables(childScope, unusedVars);
            }

            return unusedVars;
        }

        //--------------------------------------------------------------------------
        // Fix Helpers
        //--------------------------------------------------------------------------

        /**
         * Creates a fixer helper object bound to the given sourceCode and fixer.
         * @param {Object} fixer The ESLint fixer object.
         * @returns {Object} Helper methods for computing fix ranges.
         */
        function createFixerHelpers(fixer) {
            function getPreviousTokenStart(node, skips) {
                return sourceCode.getTokenBefore(node, skips).range[0];
            }

            function getNextTokenEnd(node, skips) {
                return sourceCode.getTokenAfter(node, skips).range[1];
            }

            function getTokenBeforeValue(node) {
                return sourceCode.getTokenBefore(node).value;
            }

            function getTokenAfterValue(node) {
                return sourceCode.getTokenAfter(node).value;
            }

            function hasSingleElement(node) {
                return node.elements.filter(e => e !== null).length === 1;
            }

            function hasImportOfCertainType(node, type) {
                return node.specifiers.some(e => e.type === type);
            }

            function isDeclarationNotSafeToRemove(nextToken, prevToken) {
                return (
                    nextToken.type === "String" ||
                    (prevToken &&
                        !astUtils.isSemicolonToken(prevToken) &&
                        !astUtils.isOpeningBraceToken(prevToken))
                );
            }

            // Forward declarations for mutually recursive functions
            let fixObjectWithValueSeparator;
            let fixRestInPattern;

            function fixFunctionParameters(node) {
                const parentNode = node.parent;

                if (!astUtils.isFunction(parentNode)) {
                    return null;
                }

                if (parentNode.params.length === 1) {
                    return fixer.removeRange(node.range);
                }

                if (getTokenBeforeValue(node) === "(" && getTokenAfterValue(node) === ",") {
                    return fixer.removeRange([node.range[0], getNextTokenEnd(node)]);
                }

                return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
            }

            function fixVariables(node) {
                const parentNode = node.parent;

                if (parentNode.type === "VariableDeclarator") {
                    if (astUtils.isLoop(parentNode.parent.parent)) {
                        return null;
                    }

                    if (parentNode.parent.declarations.length === 1) {
                        const nextToken = sourceCode.getTokenAfter(parentNode.parent);
                        const prevToken = sourceCode.getTokenBefore(parentNode.parent);

                        if (nextToken && isDeclarationNotSafeToRemove(nextToken, prevToken)) {
                            return null;
                        }

                        return fixer.removeRange(parentNode.parent.range);
                    }

                    if (getTokenBeforeValue(parentNode) === ",") {
                        return fixer.removeRange([
                            getPreviousTokenStart(parentNode),
                            parentNode.range[1],
                        ]);
                    }

                    return fixer.removeRange([
                        parentNode.range[0],
                        getNextTokenEnd(parentNode),
                    ]);
                }

                if (getTokenBeforeValue(node) === ":" && parentNode.parent.type === "ObjectPattern") {
                    return fixObjectWithValueSeparator(node);
                }

                return fixFunctionParameters(node);
            }

            function fixNestedObjectVariable(node) {
                const parentNode = node.parent;

                if (
                    parentNode.parent.parent.parent.type === "ObjectPattern" &&
                    parentNode.parent.properties.length === 1
                ) {
                    return fixNestedObjectVariable(parentNode.parent);
                }

                if (parentNode.parent.type === "ObjectPattern") {
                    if (parentNode.parent.properties.length === 1) {
                        return fixVariables(parentNode.parent);
                    }

                    if (getTokenBeforeValue(parentNode) === "{") {
                        return fixer.removeRange([
                            parentNode.range[0],
                            getNextTokenEnd(parentNode),
                        ]);
                    }

                    return fixer.removeRange([
                        getPreviousTokenStart(parentNode),
                        parentNode.range[1],
                    ]);
                }

                return null;
            }

            function fixNestedArrayVariable(node) {
                const parentNode = node.parent;

                if (parentNode.parent.type === "ArrayPattern" && hasSingleElement(parentNode)) {
                    return fixNestedArrayVariable(parentNode);
                }

                if (hasSingleElement(parentNode)) {
                    if (getTokenBeforeValue(parentNode) === ":") {
                        return fixVariables(parentNode);
                    }

                    if (parentNode.parent.type === "RestElement") {
                        return fixRestInPattern(parentNode.parent);
                    }

                    return fixVariables(parentNode);
                }

                if (getTokenBeforeValue(node) === "," && getTokenAfterValue(node) === "]") {
                    return fixer.removeRange([
                        getPreviousTokenStart(node),
                        node.range[1],
                    ]);
                }

                return fixer.removeRange(node.range);
            }

            fixObjectWithValueSeparator = function(node) {
                const parentNode = node.parent.parent;

                if (
                    parentNode.parent.type === "ArrayPattern" &&
                    parentNode.properties.length === 1
                ) {
                    return fixNestedArrayVariable(parentNode);
                }

                return fixNestedObjectVariable(node);
            };

            fixRestInPattern = function(node) {
                const parentNode = node.parent;

                if (astUtils.isFunction(parentNode)) {
                    if (parentNode.params.length === 1) {
                        return fixer.removeRange(node.range);
                    }

                    return fixer.removeRange([
                        getPreviousTokenStart(node),
                        node.range[1],
                    ]);
                }

                if (parentNode.type === "ArrayPattern") {
                    if (hasSingleElement(parentNode)) {
                        if (parentNode.parent.type === "ArrayPattern") {
                            return fixNestedArrayVariable(parentNode);
                        }

                        return fixVariables(parentNode);
                    }

                    return fixer.removeRange([
                        getPreviousTokenStart(node),
                        node.range[1],
                    ]);
                }

                if (parentNode.type === "ObjectPattern") {
                    if (parentNode.properties.length === 1) {
                        return fixVariables(parentNode);
                    }

                    return fixer.removeRange([
                        getPreviousTokenStart(node),
                        node.range[1],
                    ]);
                }

                return null;
            };

            return {
                getPreviousTokenStart,
                getNextTokenEnd,
                getTokenBeforeValue,
                getTokenAfterValue,
                hasSingleElement,
                hasImportOfCertainType,
                isDeclarationNotSafeToRemove,
                fixFunctionParameters,
                fixVariables,
                fixNestedObjectVariable,
                fixNestedArrayVariable,
                fixObjectWithValueSeparator: () => fixObjectWithValueSeparator,
                fixRestInPattern: () => fixRestInPattern,
            };
        }

        /**
         * Computes the fix for an unused variable.
         * @param {Object} fixer The ESLint fixer object.
         * @param {Variable} unusedVar The unused variable.
         * @returns {Object|null} The fixer result or null.
         */
        function handleFixes(fixer, unusedVar) {
            const id = unusedVar.identifiers[0];
            const parent = id.parent;
            const parentType = parent.type;
            const tokenBefore = sourceCode.getTokenBefore(id);
            const tokenAfter = sourceCode.getTokenAfter(id);
            const allWriteReferences = unusedVar.references.filter(ref => ref.isWrite());

            // Skip fix when variable has references that would be left behind
            if (allWriteReferences.some(ref => ref.identifier.range[0] !== id.range[0])) {
                return null;
            }

            const h = createFixerHelpers(fixer);
            const fixRestInPattern = h.fixRestInPattern();
            const fixObjectWithValueSeparator = h.fixObjectWithValueSeparator();

            // VariableDeclarator
            if (parentType === "VariableDeclarator") {
                if (parent.parent.declarations.length === 1) {
                    if (
                        astUtils.isLoop(parent.parent.parent) &&
                        parent.parent.parent.body !== parent.parent
                    ) {
                        return null;
                    }

                    if (
                        parent.parent.parent.type === "IfStatement" ||
                        astUtils.isLoop(parent.parent.parent) ||
                        (parent.parent.parent.type === "WithStatement" &&
                            parent.parent.parent.body === parent.parent)
                    ) {
                        return fixer.replaceText(parent.parent, ";");
                    }

                    const nextToken = sourceCode.getTokenAfter(parent.parent);
                    const prevToken = sourceCode.getTokenBefore(parent.parent);

                    if (nextToken && h.isDeclarationNotSafeToRemove(nextToken, prevToken)) {
                        return null;
                    }

                    return fixer.removeRange(parent.parent.range);
                }

                if (tokenBefore.value === ",") {
                    return fixer.removeRange([tokenBefore.range[0], parent.range[1]]);
                }

                return fixer.removeRange([parent.range[0], h.getNextTokenEnd(parent)]);
            }

            // ObjectPattern
            if (parent.parent.type === "ObjectPattern") {
                if (parent.parent.properties.length === 1) {
                    if (parent.parent.parent.type === "RestElement") {
                        return fixRestInPattern(parent.parent.parent);
                    }

                    if (parent.parent.parent.type === "ArrayPattern") {
                        return h.fixNestedArrayVariable(parent.parent);
                    }

                    return h.fixVariables(parent.parent);
                }

                if (tokenBefore.value === ":") {
                    if (
                        h.getTokenBeforeValue(parent) === "{" &&
                        h.getTokenAfterValue(parent) === ","
                    ) {
                        return fixer.removeRange([
                            parent.range[0],
                            h.getNextTokenEnd(parent),
                        ]);
                    }

                    return fixer.removeRange([
                        h.getPreviousTokenStart(parent),
                        id.range[1],
                    ]);
                }
            }

            // ArrayPattern
            if (parentType === "ArrayPattern") {
                if (h.hasSingleElement(parent)) {
                    if (parent.parent.type === "RestElement") {
                        return fixRestInPattern(parent.parent);
                    }

                    if (parent.parent.type === "ArrayPattern") {
                        return h.fixNestedArrayVariable(parent);
                    }

                    return h.fixVariables(parent);
                }

                if (tokenBefore.value === "," && tokenAfter.value === ",") {
                    return fixer.removeRange(id.range);
                }
            }

            // RestElement
            if (parentType === "RestElement") {
                if (parent.parent.type === "ArrayPattern") {
                    if (h.hasSingleElement(parent.parent)) {
                        if (parent.parent.parent.type === "ArrayPattern") {
                            return h.fixNestedArrayVariable(parent.parent);
                        }

                        return h.fixVariables(parent.parent);
                    }

                    return fixer.removeRange([
                        h.getPreviousTokenStart(id, 1),
                        id.range[1],
                    ]);
                }

                if (parent.parent.type === "ObjectPattern") {
                    if (parent.parent.properties.length === 1) {
                        return h.fixVariables(parent.parent);
                    }

                    return fixer.removeRange([
                        h.getPreviousTokenStart(id, 1),
                        id.range[1],
                    ]);
                }

                if (astUtils.isFunction(parent.parent)) {
                    if (parent.parent.params.length === 1) {
                        return fixer.removeRange(parent.range);
                    }

                    return fixer.removeRange([
                        h.getPreviousTokenStart(parent),
                        parent.range[1],
                    ]);
                }
            }

            // AssignmentPattern
            if (parentType === "AssignmentPattern") {
                if (parent.parent.type === "ArrayPattern") {
                    return h.fixNestedArrayVariable(parent);
                }

                if (parent.parent.parent.type === "ObjectPattern") {
                    if (parent.parent.parent.properties.length === 1) {
                        if (parent.parent.parent.parent.type === "ArrayPattern") {
                            return h.fixNestedArrayVariable(parent.parent.parent);
                        }

                        return h.fixVariables(parent.parent.parent);
                    }

                    if (
                        h.getTokenBeforeValue(parent.parent) === "{" &&
                        h.getTokenAfterValue(parent.parent) === ","
                    ) {
                        return fixer.removeRange([
                            parent.parent.range[0],
                            h.getNextTokenEnd(parent.parent),
                        ]);
                    }

                    return fixer.removeRange([
                        h.getPreviousTokenStart(parent.parent),
                        parent.parent.range[1],
                    ]);
                }

                if (astUtils.isFunction(parent.parent)) {
                    return h.fixFunctionParameters(parent);
                }
            }

            // FunctionDeclaration
            if (parentType === "FunctionDeclaration" && parent.id === id) {
                return fixer.removeRange(parent.range);
            }

            // ImportDefaultSpecifier
            if (parentType === "ImportDefaultSpecifier") {
                if (
                    !h.hasImportOfCertainType(parent.parent, "ImportSpecifier") &&
                    !h.hasImportOfCertainType(parent.parent, "ImportNamespaceSpecifier")
                ) {
                    return fixer.removeRange([
                        parent.range[0],
                        parent.parent.source.range[0],
                    ]);
                }

                return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
            }

            // ImportSpecifier
            if (parentType === "ImportSpecifier") {
                const importSpecifiers = parent.parent.specifiers.filter(
                    e => e.type === "ImportSpecifier",
                );

                if (importSpecifiers.length === 1) {
                    if (!h.hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
                        return fixer.removeRange(parent.parent.range);
                    }

                    return fixer.removeRange([
                        h.getPreviousTokenStart(parent, 1),
                        tokenAfter.range[1],
                    ]);
                }

                if (h.getTokenBeforeValue(parent) === "{") {
                    return fixer.removeRange([
                        parent.range[0],
                        h.getNextTokenEnd(parent),
                    ]);
                }

                return fixer.removeRange([
                    h.getPreviousTokenStart(parent),
                    parent.range[1],
                ]);
            }

            // ImportNamespaceSpecifier
            if (parentType === "ImportNamespaceSpecifier") {
                if (h.hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
                    return fixer.removeRange([
                        h.getPreviousTokenStart(parent),
                        parent.range[1],
                    ]);
                }

                return fixer.removeRange([
                    parent.range[0],
                    parent.parent.source.range[0],
                ]);
            }

            // CatchClause
            if (parentType === "CatchClause") {
                return null;
            }

            // ClassDeclaration
            if (parentType === "ClassDeclaration") {
                return fixer.removeRange(parent.range);
            }

            // Sequence expressions
            if (tokenBefore?.value === ",") {
                return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
            }

            if (tokenAfter.value === ",") {
                if (tokenBefore.value === "(" || tokenBefore.value === "{") {
                    return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
                }
            }

            // Arrow function with single unwrapped param
            if (
                parentType === "ArrowFunctionExpression" &&
                parent.params.length === 1 &&
                tokenAfter?.value !== ")"
            ) {
                return fixer.replaceText(id, "()");
            }

            return fixer.removeRange(id.range);
        }

        //--------------------------------------------------------------------------
        // Reporting
        //--------------------------------------------------------------------------

        /**
         * Reports an unused variable with a suggestion to remove it.
         * @param {Variable} unusedVar The unused variable.
         * @param {ASTNode} node The node to report on.
         */
        function reportUnusedVar(unusedVar, node) {
            const hasWriteRef = unusedVar.references.some(ref => ref.isWrite());

            context.report({
                node,
                messageId: "unusedVar",
                data: hasWriteRef
                    ? getUnusedVarMessageData(unusedVar, "assigned a value")
                    : getUnusedVarMessageData(unusedVar, "defined"),
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
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            "Program:exit"(programNode) {
                const unusedVars = collectUnusedVariables(
                    sourceCode.getScope(programNode),
                    [],
                );

                for (const unusedVar of unusedVars) {
                    if (unusedVar.defs.length > 0) {
                        const writeReferences = unusedVar.references.filter(
                            ref =>
                                ref.isWrite() &&
                                ref.from.variableScope === unusedVar.scope.variableScope,
                        );

                        const reportNode = writeReferences.length > 0
                            ? writeReferences.at(-1).identifier
                            : unusedVar.identifiers[0];

                        reportUnusedVar(unusedVar, reportNode);
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
                            data: getUnusedVarMessageData(unusedVar, "defined"),
                        });
                    }
                }
            },
        };
    },
};
```

---

## Summary of Changes

| Area | Before | After |
|------|--------|-------|
| **Config parsing** | Inline imperative assignments | `parseConfig()` with declarative key arrays |
| **Message data** | `getDefinedMessageData` + `getAssignedMessageData` (duplicated) | Single `getUnusedVarMessageData(var, action)` |
| **Additional messages** | Duplicated string building | `buildAdditionalMessage(type, context)` |
| **Variable type metadata** | Switch statements in two places | `VARIABLE_TYPE_CONFIG` lookup table |
| **`collectUnusedVariables`** | 100+ line monolith with deep nesting | Decomposed into `shouldSkipVariable`, `shouldSkipByDefinition`, `shouldSkipClassName`, `shouldSkipCatchClause`, `shouldSkipParameter` |
| **Ignore pattern checking** | Repeated 3× inline | `checkIgnorePattern()` helper |
| **`handleFixes`** | Nested helper functions + 200+ line body | `createFixerHelpers()` factory + flat `if`-chain dispatch |
| **Reporting** | Inline in `Program:exit` | `reportUnusedVar()` helper |
| **Loops** | `for (i = 0, l = ...)` C-style | `for...of` |
| **Constants** | Scattered inline | Top-level `VARIABLE_TYPE_CONFIG`, `DEFAULT_CONFIG`, `PATTERN_CONFIG_KEYS` |