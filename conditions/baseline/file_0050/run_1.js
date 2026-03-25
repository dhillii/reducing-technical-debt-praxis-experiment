# Refactored `no-unused-vars` Rule

Here's the refactored code with reduced complexity through several strategies:
1. Extracted configuration parsing into a dedicated function
2. Merged duplicate `getDefinedMessageData`/`getAssignedMessageData` into one
3. Extracted pattern-matching/ignore logic into smaller helpers
4. Simplified `collectUnusedVariables` by extracting per-variable logic
5. Organized the fix handlers into a lookup map
6. Reduced nesting throughout

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

//------------------------------------------------------------------------------
// Configuration Helpers
//------------------------------------------------------------------------------

/**
 * Parses the rule options into a config object.
 * @param {Array} options The rule options array.
 * @returns {Object} The resolved configuration.
 */
function parseConfig(options) {
    const config = { ...DEFAULT_CONFIG };
    const firstOption = options[0];

    if (!firstOption) {
        return config;
    }

    if (typeof firstOption === "string") {
        config.vars = firstOption;
        return config;
    }

    const booleanKeys = [
        "ignoreRestSiblings",
        "ignoreClassWithStaticInitBlock",
        "ignoreUsingDeclarations",
        "reportUsedIgnorePattern",
    ];
    const stringKeys = ["vars", "args", "caughtErrors"];
    const patternKeys = [
        "varsIgnorePattern",
        "argsIgnorePattern",
        "caughtErrorsIgnorePattern",
        "destructuredArrayIgnorePattern",
    ];

    for (const key of stringKeys) {
        if (firstOption[key]) {
            config[key] = firstOption[key];
        }
    }

    for (const key of booleanKeys) {
        if (firstOption[key]) {
            config[key] = firstOption[key];
        }
    }

    for (const key of patternKeys) {
        if (firstOption[key]) {
            config[key] = new RegExp(firstOption[key], "u");
        }
    }

    return config;
}

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
        const config = parseConfig(context.options);

        //--------------------------------------------------------------------------
        // Variable Type Helpers
        //--------------------------------------------------------------------------

        /**
         * Determines what variable type a def is.
         * @param {Object} def The declaration to check.
         * @returns {string} The variable type.
         */
        function defToVariableType(def) {
            if (config.destructuredArrayIgnorePattern && def.name.parent.type === "ArrayPattern") {
                return "array-destructure";
            }
            if (def.type === "CatchClause") return "catch-clause";
            if (def.type === "Parameter") return "parameter";
            return "variable";
        }

        /**
         * Gets a variable's description and configured ignore pattern.
         * @param {string} variableType The variable type.
         * @returns {[string|undefined, string|undefined]} Description and pattern string.
         */
        function getVariableDescription(variableType) {
            const typeConfig = VARIABLE_TYPE_CONFIG[variableType];

            if (!typeConfig) {
                throw new Error(`Unexpected variable type: ${variableType}`);
            }

            const pattern = config[typeConfig.patternKey];
            return [typeConfig.description, pattern ? pattern.toString() : undefined];
        }

        /**
         * Builds the `additional` message suffix for ignore pattern hints.
         * @param {string} variableType The variable type.
         * @param {"unused"|"used"} mode Whether the variable is unused or used-but-ignored.
         * @returns {string} The additional message string.
         */
        function buildAdditionalMessage(variableType, mode) {
            const [description, pattern] = getVariableDescription(variableType);

            if (!pattern || !description) return "";

            return mode === "unused"
                ? `. Allowed unused ${description} must match ${pattern}`
                : `. Used ${description} must not match ${pattern}`;
        }

        /**
         * Builds additional message data from a variable's first def.
         * @param {Object} unusedVar The eslint-scope variable.
         * @returns {string} The additional message string.
         */
        function getAdditionalFromDef(unusedVar) {
            const def = unusedVar.defs?.[0];
            if (!def) return "";
            return buildAdditionalMessage(defToVariableType(def), "unused");
        }

        /**
         * Generates message data for an unused variable.
         * @param {Object} unusedVar eslint-scope variable object.
         * @param {string} action "defined" or "assigned a value".
         * @returns {Object} Message data.
         */
        function getUnusedVarMessageData(unusedVar, action) {
            return {
                varName: unusedVar.name,
                action,
                additional: getAdditionalFromDef(unusedVar),
            };
        }

        /**
         * Generates message data for a used-but-ignored variable.
         * @param {Object} variable eslint-scope variable object.
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

        function isExported(variable) {
            const definition = variable.defs[0];
            if (!definition) return false;

            let node = definition.node;

            if (node.type === "VariableDeclarator") {
                node = node.parent;
            } else if (definition.type === "Parameter") {
                return false;
            }

            return node.parent.type.indexOf("Export") === 0;
        }

        function usesExplicitResourceManagement(variable) {
            const [definition] = variable.defs;
            return (
                definition?.type === "Variable" &&
                (definition.parent.kind === "using" || definition.parent.kind === "await using")
            );
        }

        function hasRestSibling(node) {
            return (
                node.type === "Property" &&
                node.parent.type === "ObjectPattern" &&
                REST_PROPERTY_TYPE.test(node.parent.properties.at(-1).type)
            );
        }

        function hasRestSpreadSibling(variable) {
            if (!config.ignoreRestSiblings) return false;

            return (
                variable.defs.some(def => hasRestSibling(def.name.parent)) ||
                variable.references.some(ref => hasRestSibling(ref.identifier.parent))
            );
        }

        function isSelfReference(ref, nodes) {
            let scope = ref.from;
            while (scope) {
                if (nodes.includes(scope.block)) return true;
                scope = scope.upper;
            }
            return false;
        }

        function getFunctionDefinitions(variable) {
            return variable.defs.flatMap(def => {
                if (def.type === "FunctionName") return [def.node];
                if (
                    def.type === "Variable" &&
                    def.node.init &&
                    (def.node.init.type === "FunctionExpression" ||
                        def.node.init.type === "ArrowFunctionExpression")
                ) {
                    return [def.node.init];
                }
                return [];
            });
        }

        function isInside(inner, outer) {
            return inner.range[0] >= outer.range[0] && inner.range[1] <= outer.range[1];
        }

        function isUnusedExpression(node) {
            const parent = node.parent;
            if (parent.type === "ExpressionStatement") return true;
            if (parent.type === "SequenceExpression") {
                return parent.expressions.at(-1) !== node || isUnusedExpression(parent);
            }
            return false;
        }

        function getRhsNode(ref, prevRhsNode) {
            const id = ref.identifier;
            const parent = id.parent;
            const canBeUsedLater =
                ref.from.variableScope !== ref.resolved.scope.variableScope ||
                astUtils.isInLoop(id);

            if (prevRhsNode && isInside(id, prevRhsNode)) return prevRhsNode;

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
                        if (STATEMENT_TYPE.test(parent.type)) return true;
                }
                node = parent;
                parent = parent.parent;
            }
            return false;
        }

        function isInsideOfStorableFunction(id, rhsNode) {
            const funcNode = astUtils.getUpperFunction(id);
            return funcNode && isInside(funcNode, rhsNode) && isStorableFunction(funcNode, rhsNode);
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
                    (rhsNode && isInside(id, rhsNode) && !isInsideOfStorableFunction(id, rhsNode)))
            );
        }

        function isForInOfRef(ref) {
            let target = ref.identifier.parent;

            if (target.type === "VariableDeclarator") {
                target = target.parent.parent;
            }

            if (target.type !== "ForInStatement" && target.type !== "ForOfStatement") {
                return false;
            }

            target = target.body.type === "BlockStatement" ? target.body.body[0] : target.body;

            return Boolean(target?.type === "ReturnStatement");
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
                    ref.isRead() &&
                    !forItself &&
                    !(isFunctionDefinition && isSelfReference(ref, functionNodes))
                );
            });
        }

        function isAfterLastUsedArg(variable) {
            const def = variable.defs[0];
            const params = sourceCode.getDeclaredVariables(def.node);
            const posteriorParams = params.slice(params.indexOf(variable) + 1);
            return !posteriorParams.some(v => v.references.length > 0 || v.eslintUsed);
        }

        //--------------------------------------------------------------------------
        // Unused Variable Collection
        //--------------------------------------------------------------------------

        /**
         * Checks if a variable matches an ignore pattern and optionally reports it
         * if it's used but ignored.
         * @param {Object} variable The variable to check.
         * @param {RegExp|undefined} pattern The ignore pattern.
         * @param {string} variableType The variable type string.
         * @param {Object} defName The def.name node.
         * @returns {boolean} True if the variable should be skipped.
         */
        function checkIgnorePattern(variable, pattern, variableType, defName) {
            if (!pattern || !pattern.test(defName.name)) return false;

            if (config.reportUsedIgnorePattern && isUsedVariable(variable)) {
                context.report({
                    node: defName,
                    messageId: "usedIgnoredVar",
                    data: getUsedIgnoredMessageData(variable, variableType),
                });
            }
            return true;
        }

        /**
         * Determines whether a variable should be skipped during collection.
         * Returns true if the variable should be skipped, false if it should be checked.
         * @param {Object} variable The variable to evaluate.
         * @param {Object} scope The current scope.
         * @returns {boolean} Whether to skip this variable.
         */
        function shouldSkipVariable(variable, scope) {
            // Skip class self-reference in class scope
            if (scope.type === "class" && scope.block.id === variable.identifiers[0]) {
                return true;
            }

            // Skip function expression names
            if (scope.functionExpressionScope) return true;

            // Skip variables marked with markVariableAsUsed()
            if (!config.reportUsedIgnorePattern && variable.eslintUsed) return true;

            // Skip implicit "arguments" variable
            if (
                scope.type === "function" &&
                variable.name === "arguments" &&
                variable.identifiers.length === 0
            ) {
                return true;
            }

            const def = variable.defs[0];
            if (!def) return false;

            return shouldSkipDef(variable, def);
        }

        /**
         * Determines whether a variable with a definition should be skipped.
         * @param {Object} variable The variable.
         * @param {Object} def The variable's first definition.
         * @returns {boolean} Whether to skip.
         */
        function shouldSkipDef(variable, def) {
            const { type, name: defName } = def;
            const refUsedInArrayPatterns = variable.references.some(
                ref => ref.identifier.parent.type === "ArrayPattern"
            );

            // Skip array destructuring elements matching the ignore pattern
            if (
                (def.name.parent.type === "ArrayPattern" || refUsedInArrayPatterns) &&
                checkIgnorePattern(variable, config.destructuredArrayIgnorePattern, "array-destructure", defName)
            ) {
                return true;
            }

            if (type === "ClassName") {
                const hasStaticBlock = def.node.body.body.some(n => n.type === "StaticBlock");
                if (config.ignoreClassWithStaticInitBlock && hasStaticBlock) return true;
            }

            if (type === "CatchClause") {
                if (config.caughtErrors === "none") return true;
                return checkIgnorePattern(variable, config.caughtErrorsIgnorePattern, "catch-clause", defName);
            }

            if (type === "Parameter") {
                return shouldSkipParameter(variable, def, defName);
            }

            // Regular variable
            return checkIgnorePattern(variable, config.varsIgnorePattern, "variable", defName);
        }

        /**
         * Determines whether a parameter variable should be skipped.
         * @param {Object} variable The variable.
         * @param {Object} def The definition.
         * @param {Object} defName The def.name node.
         * @returns {boolean} Whether to skip.
         */
        function shouldSkipParameter(variable, def, defName) {
            const parentType = def.node.parent.type;

            // Skip setter arguments
            if (
                (parentType === "Property" || parentType === "MethodDefinition") &&
                def.node.parent.kind === "set"
            ) {
                return true;
            }

            if (config.args === "none") return true;

            if (checkIgnorePattern(variable, config.argsIgnorePattern, "parameter", defName)) {
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
         * Collects unused variables from a scope and its descendants.
         * @param {Object} scope The eslint-scope Scope object.
         * @param {Array} unusedVars Accumulator array.
         * @returns {Array} The accumulated unused variables.
         */
        function collectUnusedVariables(scope, unusedVars) {
            if (scope.type !== "global" || config.vars === "all") {
                for (const variable of scope.variables) {
                    if (shouldSkipVariable(variable, scope)) continue;

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
         * Creates a fixer context with shared utilities.
         * @param {Object} fixer The ESLint fixer object.
         * @param {Object} unusedVar The unused variable.
         * @returns {Object} Fix result or null.
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

            // Shared token utilities
            const getPreviousTokenStart = (node, skips) =>
                sourceCode.getTokenBefore(node, skips).range[0];
            const getNextTokenEnd = (node, skips) =>
                sourceCode.getTokenAfter(node, skips).range[1];
            const getTokenBeforeValue = node => sourceCode.getTokenBefore(node).value;
            const getTokenAfterValue = node => sourceCode.getTokenAfter(node).value;
            const hasSingleElement = node => node.elements.filter(e => e !== null).length === 1;
            const hasImportOfCertainType = (node, type) =>
                node.specifiers.some(e => e.type === type);
            const isDeclarationNotSafeToRemove = (nextToken, prevToken) =>
                nextToken.type === "String" ||
                (prevToken &&
                    !astUtils.isSemicolonToken(prevToken) &&
                    !astUtils.isOpeningBraceToken(prevToken));

            function fixFunctionParameters(node) {
                const parentNode = node.parent;
                if (!astUtils.isFunction(parentNode)) return null;

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
                    if (astUtils.isLoop(parentNode.parent.parent)) return null;

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
                    return fixer.removeRange([parentNode.range[0], getNextTokenEnd(parentNode)]);
                }

                if (getTokenBeforeValue(node) === ":" && parentNode.parent.type === "ObjectPattern") {
                    return fixObjectWithValueSeparator(node); // eslint-disable-line no-use-before-define
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
                        return fixer.removeRange([parentNode.range[0], getNextTokenEnd(parentNode)]);
                    }
                    return fixer.removeRange([getPreviousTokenStart(parentNode), parentNode.range[1]]);
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
                        return fixRestInPattern(parentNode.parent); // eslint-disable-line no-use-before-define
                    }
                    return fixVariables(parentNode);
                }

                if (getTokenBeforeValue(node) === "," && getTokenAfterValue(node) === "]") {
                    return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
                }
                return fixer.removeRange(node.range);
            }

            function fixObjectWithValueSeparator(node) {
                const parentNode = node.parent.parent;

                if (
                    parentNode.parent.type === "ArrayPattern" &&
                    parentNode.properties.length === 1
                ) {
                    return fixNestedArrayVariable(parentNode);
                }
                return fixNestedObjectVariable(node);
            }

            function fixRestInPattern(node) {
                const parentNode = node.parent;

                if (astUtils.isFunction(parentNode)) {
                    if (parentNode.params.length === 1) {
                        return fixer.removeRange(node.range);
                    }
                    return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
                }

                if (parentNode.type === "ArrayPattern") {
                    if (hasSingleElement(parentNode)) {
                        if (parentNode.parent.type === "ArrayPattern") {
                            return fixNestedArrayVariable(parentNode);
                        }
                        return fixVariables(parentNode);
                    }
                    return fixer.removeRange([getPreviousTokenStart(node), node.range[1]]);
                }

                return null;
            }

            // Dispatch to the appropriate fix handler based on parent type
            return applyFix({
                fixer,
                id,
                parent,
                parentType,
                tokenBefore,
                tokenAfter,
                getPreviousTokenStart,
                getNextTokenEnd,
                getTokenBeforeValue,
                getTokenAfterValue,
                hasSingleElement,
                hasImportOfCertainType,
                isDeclarationNotSafeToRemove,
                fixVariables,
                fixNestedArrayVariable,
                fixNestedObjectVariable,
                fixRestInPattern,
                fixFunctionParameters,
                fixObjectWithValueSeparator,
            });
        }

        /**
         * Dispatches fix logic based on the parent node type.
         * @param {Object} ctx Fix context object.
         * @returns {Object|null} Fixer result.
         */
        function applyFix(ctx) {
            const {
                fixer, id, parent, parentType, tokenBefore, tokenAfter,
                getPreviousTokenStart, getNextTokenEnd,
                getTokenBeforeValue, getTokenAfterValue,
                hasSingleElement, hasImportOfCertainType,
                isDeclarationNotSafeToRemove,
                fixVariables, fixNestedArrayVariable,
                fixRestInPattern, fixFunctionParameters,
            } = ctx;

            if (parentType === "VariableDeclarator") {
                return fixVariableDeclarator(ctx);
            }

            if (parent.parent?.type === "ObjectPattern") {
                return fixObjectPatternVariable(ctx);
            }

            if (parentType === "ArrayPattern") {
                return fixArrayPatternVariable(ctx);
            }

            if (parentType === "RestElement") {
                return fixRestElement(ctx);
            }

            if (parentType === "AssignmentPattern") {
                return fixAssignmentPattern(ctx);
            }

            if (parentType === "FunctionDeclaration" && parent.id === id) {
                return fixer.removeRange(parent.range);
            }

            if (parentType === "ImportDefaultSpecifier") {
                return fixImportDefault(ctx);
            }

            if (parentType === "ImportSpecifier") {
                return fixImportSpecifier(ctx);
            }

            if (parentType === "ImportNamespaceSpecifier") {
                return fixImportNamespace(ctx);
            }

            if (parentType === "CatchClause") return null;

            if (parentType === "ClassDeclaration") {
                return fixer.removeRange(parent.range);
            }

            if (tokenBefore?.value === ",") {
                return fixer.removeRange([tokenBefore.range[0], id.range[1]]);
            }

            if (tokenAfter.value === ",") {
                if (tokenBefore.value === "(" || tokenBefore.value === "{") {
                    return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
                }
            }

            if (
                parentType === "ArrowFunctionExpression" &&
                parent.params.length === 1 &&
                tokenAfter?.value !== ")"
            ) {
                return fixer.replaceText(id, "()");
            }

            return fixer.removeRange(id.range);
        }

        function fixVariableDeclarator({ fixer, id, parent, tokenBefore, getNextTokenEnd, isDeclarationNotSafeToRemove }) {
            const tokenBefore_ = sourceCode.getTokenBefore(id);

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

                if (nextToken && isDeclarationNotSafeToRemove(nextToken, prevToken)) return null;

                return fixer.removeRange(parent.parent.range);
            }

            if (tokenBefore_.value === ",") {
                return fixer.removeRange([tokenBefore_.range[0], parent.range[1]]);
            }

            return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
        }

        function fixObjectPatternVariable({ fixer, id, parent, tokenBefore, getNextTokenEnd, getPreviousTokenStart, getTokenBeforeValue, getTokenAfterValue, fixVariables, fixNestedArrayVariable, fixRestInPattern }) {
            if (parent.parent.properties.length === 1) {
                if (parent.parent.parent.type === "RestElement") {
                    return fixRestInPattern(parent.parent.parent);
                }
                if (parent.parent.parent.type === "ArrayPattern") {
                    return fixNestedArrayVariable(parent.parent);
                }
                return fixVariables(parent.parent);
            }

            if (tokenBefore.value === ":") {
                if (getTokenBeforeValue(parent) === "{" && getTokenAfterValue(parent) === ",") {
                    return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
                }
                return fixer.removeRange([getPreviousTokenStart(parent), id.range[1]]);
            }

            return null;
        }

        function fixArrayPatternVariable({ fixer, id, parent, tokenBefore, tokenAfter, hasSingleElement, fixVariables, fixNestedArrayVariable, fixRestInPattern }) {
            if (hasSingleElement(parent)) {
                if (parent.parent.type === "RestElement") return fixRestInPattern(parent.parent);
                if (parent.parent.type === "ArrayPattern") return fixNestedArrayVariable(parent);
                return fixVariables(parent);
            }

            if (tokenBefore.value === "," && tokenAfter.value === ",") {
                return fixer.removeRange(id.range);
            }

            return null;
        }

        function fixRestElement({ fixer, id, parent, hasSingleElement, getPreviousTokenStart, fixVariables, fixNestedArrayVariable, fixRestInPattern, fixFunctionParameters }) {
            if (parent.parent.type === "ArrayPattern") {
                if (hasSingleElement(parent.parent)) {
                    if (parent.parent.parent.type === "ArrayPattern") {
                        return fixNestedArrayVariable(parent.parent);
                    }
                    return fixVariables(parent.parent);
                }
                return fixer.removeRange([getPreviousTokenStart(id, 1), id.range[1]]);
            }

            if (parent.parent.type === "ObjectPattern") {
                if (parent.parent.properties.length === 1) {
                    return fixVariables(parent.parent);
                }
                return fixer.removeRange([getPreviousTokenStart(id, 1), id.range[1]]);
            }

            if (astUtils.isFunction(parent.parent)) {
                if (parent.parent.params.length === 1) {
                    return fixer.removeRange(parent.range);
                }
                return fixer.removeRange([getPreviousTokenStart(parent), parent.range[1]]);
            }

            return null;
        }

        function fixAssignmentPattern({ fixer, id, parent, getNextTokenEnd, getPreviousTokenStart, getTokenBeforeValue, getTokenAfterValue, fixVariables, fixNestedArrayVariable, fixFunctionParameters }) {
            if (parent.parent.type === "ArrayPattern") {
                return fixNestedArrayVariable(parent);
            }

            if (parent.parent.parent?.type === "ObjectPattern") {
                const objPattern = parent.parent.parent;

                if (objPattern.properties.length === 1) {
                    if (objPattern.parent.type === "ArrayPattern") {
                        return fixNestedArrayVariable(objPattern);
                    }
                    return fixVariables(objPattern);
                }

                if (getTokenBeforeValue(parent.parent) === "{" && getTokenAfterValue(parent.parent) === ",") {
                    return fixer.removeRange([parent.parent.range[0], getNextTokenEnd(parent.parent)]);
                }
                return fixer.removeRange([getPreviousTokenStart(parent.parent), parent.parent.range[1]]);
            }

            if (astUtils.isFunction(parent.parent)) {
                return fixFunctionParameters(parent);
            }

            return null;
        }

        function fixImportDefault({ fixer, id, parent, tokenAfter, hasImportOfCertainType }) {
            if (
                !hasImportOfCertainType(parent.parent, "ImportSpecifier") &&
                !hasImportOfCertainType(parent.parent, "ImportNamespaceSpecifier")
            ) {
                return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
            }
            return fixer.removeRange([id.range[0], tokenAfter.range[1]]);
        }

        function fixImportSpecifier({ fixer, parent, tokenAfter, getPreviousTokenStart, getNextTokenEnd, getTokenBeforeValue, hasImportOfCertainType }) {
            const importSpecifiers = parent.parent.specifiers.filter(e => e.type === "ImportSpecifier");

            if (importSpecifiers.length === 1) {
                if (!hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
                    return fixer.removeRange(parent.parent.range);
                }
                return fixer.removeRange([getPreviousTokenStart(parent, 1), tokenAfter.range[1]]);
            }

            if (getTokenBeforeValue(parent) === "{") {
                return fixer.removeRange([parent.range[0], getNextTokenEnd(parent)]);
            }
            return fixer.removeRange([getPreviousTokenStart(parent), parent.range[1]]);
        }

        function fixImportNamespace({ fixer, parent, getPreviousTokenStart, hasImportOfCertainType }) {
            if (hasImportOfCertainType(parent.parent, "ImportDefaultSpecifier")) {
                return fixer.removeRange([getPreviousTokenStart(parent), parent.range[1]]);
            }
            return fixer.removeRange([parent.range[0], parent.parent.source.range[0]]);
        }

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        return {
            "Program:exit"(programNode) {
                const unusedVars = collectUnusedVariables(
                    sourceCode.getScope(programNode),
                    []
                );

                for (const unusedVar of unusedVars) {
                    if (unusedVar.defs.length > 0) {
                        reportUnusedVar(unusedVar);
                    } else if (unusedVar.eslintExplicitGlobalComments) {
                        reportGlobalDirective(unusedVar, programNode);
                    }
                }
            },
        };

        function reportUnusedVar(unusedVar) {
            const writeReferences = unusedVar.references.filter(
                ref =>
                    ref.isWrite() &&
                    ref.from.variableScope === unusedVar.scope.variableScope
            );

            const referenceToReport = writeReferences.length > 0
                ? writeReferences.at(-1)
                : null;

            const hasWriteRef = unusedVar.references.some(ref => ref.isWrite());

            context.report({
                node: referenceToReport
                    ? referenceToReport.identifier
                    : unusedVar.identifiers[0],
                messageId: "unusedVar",
                data: getUnusedVarMessageData(
                    unusedVar,
                    hasWriteRef ? "assigned a value" : "defined"
                ),
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

        function reportGlobalDirective(unusedVar, programNode) {
            const directiveComment = unusedVar.eslintExplicitGlobalComments[0];

            context.report({
                node: programNode,
                loc: astUtils.getNameLocationInGlobalDirectiveComment(
                    sourceCode,
                    directiveComment,
                    unusedVar.name
                ),
                messageId: "unusedVar",
                data: getUnusedVarMessageData(unusedVar, "defined"),
            });
        }
    },
};
```

## Key Refactoring Changes

| Area | Change |
|------|--------|
| **Config parsing** | Extracted `parseConfig()` with loop-based key assignment instead of repetitive `if` blocks |
| **Variable type metadata** | Introduced `VARIABLE_TYPE_CONFIG` lookup table, eliminating the `switch` in `getVariableDescription` |
| **Message data** | Merged `getDefinedMessageData` + `getAssignedMessageData` into single `getUnusedVarMessageData(var, action)` |
| **Ignore pattern checking** | Extracted `checkIgnorePattern()` to eliminate 3 near-identical blocks |
| **`collectUnusedVariables`** | Split into `shouldSkipVariable()`, `shouldSkipDef()`, `shouldSkipParameter()` — each with single responsibility |
| **`handleFixes`** | Extracted `applyFix()` dispatcher + individual `fixVariableDeclarator`, `fixObjectPatternVariable`, etc. functions |
| **Loops** | Replaced `for (i=0; i<l; i++)` with `for...of` throughout |
| **Reporting** | Extracted `reportUnusedVar()` and `reportGlobalDirective()` from the `Program:exit` handler |