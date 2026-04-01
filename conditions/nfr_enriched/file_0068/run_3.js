```javascript
/**
 * @fileoverview Collects the built-in rules into a map structure so that they can be imported all at once and without
 * using the file-system directly.
 * @author Peter (Somogyvari) Metz
 */

"use strict";

/* eslint sort-keys: ["error", "asc"] -- More readable for long list */

const { LazyLoadingRuleMap } = require("./utils/lazy-loading-rule-map");

/**
 * Creates a lazy-loading rule entry for the given rule name.
 * @param {string} ruleName - The name of the rule module to load
 * @returns {Function} A function that requires the rule module when called
 */
const createRuleLoader = (ruleName) => () => require(`./${ruleName}`);

/**
 * Rule definitions organized by category for better maintainability.
 * Each category contains rules with similar purposes or naming patterns.
 */
const accessorRules = {
	"accessor-pairs": createRuleLoader("accessor-pairs"),
	"grouped-accessor-pairs": createRuleLoader("grouped-accessor-pairs"),
};

const arrayRules = {
	"array-bracket-newline": createRuleLoader("array-bracket-newline"),
	"array-bracket-spacing": createRuleLoader("array-bracket-spacing"),
	"array-callback-return": createRuleLoader("array-callback-return"),
	"array-element-newline": createRuleLoader("array-element-newline"),
};

const arrowRules = {
	"arrow-body-style": createRuleLoader("arrow-body-style"),
	"arrow-parens": createRuleLoader("arrow-parens"),
	"arrow-spacing": createRuleLoader("arrow-spacing"),
};

const blockRules = {
	"block-scoped-var": createRuleLoader("block-scoped-var"),
	"block-spacing": createRuleLoader("block-spacing"),
	"brace-style": createRuleLoader("brace-style"),
};

const callbackRules = {
	"callback-return": createRuleLoader("callback-return"),
	"handle-callback-err": createRuleLoader("handle-callback-err"),
};

const caseRules = {
	"default-case": createRuleLoader("default-case"),
	"default-case-last": createRuleLoader("default-case-last"),
	"no-case-declarations": createRuleLoader("no-case-declarations"),
	"no-duplicate-case": createRuleLoader("no-duplicate-case"),
};

const classRules = {
	"class-methods-use-this": createRuleLoader("class-methods-use-this"),
	"constructor-super": createRuleLoader("constructor-super"),
	"no-class-assign": createRuleLoader("no-class-assign"),
	"no-dupe-class-members": createRuleLoader("no-dupe-class-members"),
	"no-empty-static-block": createRuleLoader("no-empty-static-block"),
	"no-unused-private-class-members": createRuleLoader("no-unused-private-class-members"),
};

const commaRules = {
	"comma-dangle": createRuleLoader("comma-dangle"),
	"comma-spacing": createRuleLoader("comma-spacing"),
	"comma-style": createRuleLoader("comma-style"),
};

const commentRules = {
	"capitalized-comments": createRuleLoader("capitalized-comments"),
	"line-comment-position": createRuleLoader("line-comment-position"),
	"lines-around-comment": createRuleLoader("lines-around-comment"),
	"lines-around-directive": createRuleLoader("lines-around-directive"),
	"multiline-comment-style": createRuleLoader("multiline-comment-style"),
	"no-inline-comments": createRuleLoader("no-inline-comments"),
	"no-warning-comments": createRuleLoader("no-warning-comments"),
	"spaced-comment": createRuleLoader("spaced-comment"),
};

const complexityRules = {
	complexity: createRuleLoader("complexity"),
	"max-depth": createRuleLoader("max-depth"),
	"max-nested-callbacks": createRuleLoader("max-nested-callbacks"),
	"max-statements": createRuleLoader("max-statements"),
};

const computedPropertyRules = {
	"computed-property-spacing": createRuleLoader("computed-property-spacing"),
	"no-useless-computed-key": createRuleLoader("no-useless-computed-key"),
};

const consistencyRules = {
	"consistent-return": createRuleLoader("consistent-return"),
	"consistent-this": createRuleLoader("consistent-this"),
};

const constructorRules = {
	"no-constructor-return": createRuleLoader("no-constructor-return"),
	"no-new-native-nonconstructor": createRuleLoader("no-new-native-nonconstructor"),
	"no-new-object": createRuleLoader("no-new-object"),
	"no-useless-constructor": createRuleLoader("no-useless-constructor"),
	"object-constructor": createRuleLoader("no-object-constructor"),
};

const controlFlowRules = {
	curly: createRuleLoader("curly"),
	"default-param-last": createRuleLoader("default-param-last"),
	"dot-location": createRuleLoader("dot-location"),
	"dot-notation": createRuleLoader("dot-notation"),
	"for-direction": createRuleLoader("for-direction"),
	"guard-for-in": createRuleLoader("guard-for-in"),
	"no-continue": createRuleLoader("no-continue"),
	"no-else-return": createRuleLoader("no-else-return"),
	"no-fallthrough": createRuleLoader("no-fallthrough"),
	"no-lonely-if": createRuleLoader("no-lonely-if"),
	"no-loop-func": createRuleLoader("no-loop-func"),
	"no-nested-ternary": createRuleLoader("no-nested-ternary"),
	"no-unmodified-loop-condition": createRuleLoader("no-unmodified-loop-condition"),
	"no-unreachable-loop": createRuleLoader("no-unreachable-loop"),
	"nonblock-statement-body-position": createRuleLoader("nonblock-statement-body-position"),
};

const declarationRules = {
	"init-declarations": createRuleLoader("init-declarations"),
	"no-inner-declarations": createRuleLoader("no-inner-declarations"),
	"no-redeclare": createRuleLoader("no-redeclare"),
	"no-use-before-define": createRuleLoader("no-use-before-define"),
	"one-var": createRuleLoader("one-var"),
	"one-var-declaration-per-line": createRuleLoader("one-var-declaration-per-line"),
	"vars-on-top": createRuleLoader("vars-on-top"),
};

const deleteRules = {
	"no-delete-var": createRuleLoader("no-delete-var"),
};

const duplicateRules = {
	"no-dupe-args": createRuleLoader("no-dupe-args"),
	"no-dupe-else-if": createRuleLoader("no-dupe-else-if"),
	"no-dupe-keys": createRuleLoader("no-dupe-keys"),
	"no-duplicate-imports": createRuleLoader("no-duplicate-imports"),
};

const emptyRules = {
	"no-empty": createRuleLoader("no-empty"),
	"no-empty-character-class": createRuleLoader("no-empty-character-class"),
	"no-empty-function": createRuleLoader("no-empty-function"),
	"no-empty-pattern": createRuleLoader("no-empty-pattern"),
};

const equalityRules = {
	eqeqeq: createRuleLoader("eqeqeq"),
	"no-eq-null": createRuleLoader("no-eq-null"),
};

const evalRules = {
	"no-eval": createRuleLoader("no-eval"),
	"no-implied-eval": createRuleLoader("no-implied-eval"),
	"no-script-url": createRuleLoader("no-script-url"),
};

const extraRules = {
	"no-extra-bind": createRuleLoader("no-extra-bind"),
	"no-extra-boolean-cast": createRuleLoader("no-extra-boolean-cast"),
	"no-extra-label": createRuleLoader("no-extra-label"),
	"no-extra-parens": createRuleLoader("no-extra-parens"),
	"no-extra-semi": createRuleLoader("no-extra-semi"),
};

const functionRules = {
	"func-call-spacing": createRuleLoader("func-call-spacing"),
	"func-name-matching": createRuleLoader("func-name-matching"),
	"func-names": createRuleLoader("func-names"),
	"func-style": createRuleLoader("func-style"),
	"function-call-argument-newline": createRuleLoader("function-call-argument-newline"),
	"function-paren-newline": createRuleLoader("function-paren-newline"),
	"no-func-assign": createRuleLoader("no-func-assign"),
	"no-new-func": createRuleLoader("no-new-func"),
	"no-spaced-func": createRuleLoader("no-spaced-func"),
};

const generatorRules = {
	"generator-star-spacing": createRuleLoader("generator-star-spacing"),
	"require-yield": createRuleLoader("require-yield"),
	"yield-star-spacing": createRuleLoader("yield-star-spacing"),
};

const getterSetterRules = {
	"getter-return": createRuleLoader("getter-return"),
	"no-setter-return": createRuleLoader("no-setter-return"),
};

const globalRules = {
	"global-require": createRuleLoader("global-require"),
	"no-global-assign": createRuleLoader("no-global-assign"),
	"no-implicit-globals": createRuleLoader("no-implicit-globals"),
	"no-restricted-globals": createRuleLoader("no-restricted-globals"),
};

const identifierRules = {
	camelcase: createRuleLoader("camelcase"),
	"id-blacklist": createRuleLoader("id-blacklist"),
	"id-denylist": createRuleLoader("id-denylist"),
	"id-length": createRuleLoader("id-length"),
	"id-match": createRuleLoader("id-match"),
	"no-label-var": createRuleLoader("no-label-var"),
	"no-shadow": createRuleLoader("no-shadow"),
	"no-shadow-restricted-names": createRuleLoader("no-shadow-restricted-names"),
	"no-underscore-dangle": createRuleLoader("no-underscore-dangle"),
};

const importRules = {
	"no-import-assign": createRuleLoader("no-import-assign"),
	"no-restricted-imports": createRuleLoader("no-restricted-imports"),
	"no-restricted-modules": createRuleLoader("no-restricted-modules"),
};

const indentationRules = {
	indent: createRuleLoader("indent"),
	"indent-legacy": createRuleLoader("indent-legacy"),
	"implicit-arrow-linebreak": createRuleLoader("implicit-arrow-linebreak"),
};

const invalidRules = {
	"no-invalid-regexp": createRuleLoader("no-invalid-regexp"),
	"no-invalid-this": createRuleLoader("no-invalid-this"),
};

const jsxRules = {
	"jsx-quotes": createRuleLoader("jsx-quotes"),
};

const keyRules = {
	"key-spacing": createRuleLoader("key-spacing"),
	"keyword-spacing": createRuleLoader("keyword-spacing"),
};

const lineRules = {
	"eol-last": createRuleLoader("eol-last"),
	"linebreak-style": createRuleLoader("linebreak-style"),
	"lines-between-class-members": createRuleLoader("lines-between-class-members"),
	"max-lines": createRuleLoader("max-lines"),
	"max-lines-per-function": createRuleLoader("max-lines-per-function"),
	"max-statements-per-line": createRuleLoader("max-statements-per-line"),
	"newline-after-var": createRuleLoader("newline-after-var"),
	"newline-before-return": createRuleLoader("newline-before-return"),
	"newline-per-chained-call": createRuleLoader("newline-per-chained-call"),
	"no-multiple-empty-lines": createRuleLoader("no-multiple-empty-lines"),
	"no-trailing-spaces": createRuleLoader("no-trailing-spaces"),
	"padding-line-between-statements": createRuleLoader("padding-line-between-statements"),
};

const literalRules = {
	"no-array-constructor": createRuleLoader("no-array-constructor"),
	"no-multi-str": createRuleLoader("no-multi-str"),
	"no-new-symbol": createRuleLoader("no-new-symbol"),
	"no-new-wrappers": createRuleLoader("no-new-wrappers"),
	"no-throw-literal": createRuleLoader("no-throw-literal"),
	"prefer-promise-reject-errors": createRuleLoader("prefer-promise-reject-errors"),
	"prefer-regex-literals": createRuleLoader("prefer-regex-literals"),
};

const logicalRules = {
	"logical-assignment-operators": createRuleLoader("logical-assignment-operators"),
	"no-mixed-operators": createRuleLoader("no-mixed-operators"),
};

const maxRules = {
	"max-classes-per-file": createRuleLoader("max-classes-per-file"),
	"max-len": createRuleLoader("max-len"),
	"max-params": createRuleLoader("max-params"),
};

const mixedRules = {
	"no-mixed-requires": createRuleLoader("no-mixed-requires"),
	"no-mixed-spaces-and-tabs": createRuleLoader("no-mixed-spaces-and-tabs"),
};

const multilineRules = {
	"multiline-ternary": createRuleLoader("multiline-ternary"),
};

const newRules = {
	"new-cap": createRuleLoader("new-cap"),
	"new-parens": createRuleLoader("new-parens"),
	"no-new": createRuleLoader("no-new"),
	"no-new-require": createRuleLoader("no-new-require"),
};

const noAlertRules = {
	"no-alert": createRuleLoader("no-alert"),
};

const noAsyncRules = {
	"no-async-promise-executor": createRuleLoader("no-async-promise-executor"),
	"no-await-in-loop": createRuleLoader("no-await-in-loop"),
};

const noBitwiseRules = {
	"no-bitwise": createRuleLoader("no-bitwise"),
};

const noBufferRules = {
	"no-buffer-constructor": createRuleLoader("no-buffer-constructor"),
};

const noCallerRules = {
	"no-caller": createRuleLoader("no-caller"),
};

const noCatchRules = {
	"no-catch-shadow": createRuleLoader("no-catch-shadow"),
};

const noCompareRules = {
	"no-compare-neg-zero": createRuleLoader("no-compare-neg-zero"),
};

const noCondRules = {
	"no-cond-assign": createRuleLoader("no-cond-assign"),
};

const noConfusingRules = {
	"no-confusing-arrow": createRuleLoader("no-confusing-arrow"),
};

const noConsoleRules = {
	"no-console": createRuleLoader("no-console"),
};

const noConstRules = {
	"no-const-assign": createRuleLoader("no-const-assign"),
};

const noConstantRules = {
	"no-constant-binary-expression": createRuleLoader("no-constant-binary-expression"),
	"no-constant-condition": createRuleLoader("no-constant-condition"),
};

const noControlRules = {
	"no-control-regex": createRuleLoader("no-control-regex"),
};

const noDebuggerRules = {
	"no-debugger": createRuleLoader("no-debugger"),
};

const noDivRules = {
	"no-div-regex": createRuleLoader("no-div-regex"),
};

const noElseRules = {
	"no-else-return": createRuleLoader("no-else-return"),
};

const noExtendRules = {
	"no-extend-native": createRuleLoader("no-extend-native"),
};

const noFloatingRules = {
	"no-floating-decimal": createRuleLoader("no-floating-decimal"),
};

const noGlobalAssignRules = {
	"no-global-assign": createRuleLoader("no-global-assign"),
};

const noImplicitRules = {
	"no-implicit-coercion": createRuleLoader("no-implicit-coercion"),
	"no-implicit-globals": createRuleLoader("no-implicit-globals"),
};

const noInlineRules = {
	"no-inline-comments": createRuleLoader("no-inline-comments"),
};

const noInnerRules = {
	"no-inner-declarations": createRuleLoader("no-inner-declarations"),
};

const noInvalidRules = {
	"no-invalid-regexp": createRuleLoader("no-invalid-regexp"),
	"no-invalid-this": createRuleLoader("no-invalid-this"),
};

const noIrregularRules = {
	"no-irregular-whitespace": createRuleLoader("no-irregular-whitespace"),
};

const noIteratorRules = {
	"no-iterator": createRuleLoader("no-iterator"),
};

const noLabelsRules = {
	"no-labels": createRuleLoader("no-labels"),
	"no-lone-blocks": createRuleLoader("no-lone-blocks"),
};

const noLossRules = {
	"no-loss-of-precision": createRuleLoader("no-loss-of-precision"),
};

const noMagicRules = {
	"no-magic-numbers": createRuleLoader("no-magic-numbers"),
};

const noMisleadingRules = {
	"no-misleading-character-class": createRuleLoader("no-misleading-character-class"),
};

const noMultiRules = {
	"no-multi-assign": createRuleLoader("no-multi-assign"),
	"no-multi-spaces": createRuleLoader("no-multi-spaces"),
};

const noNativeRules = {
	"no-native-reassign": createRuleLoader("no-native-reassign"),
};

const noNegatedRules = {
	"no-negated-condition": createRuleLoader("no-negated-condition"),
	"no-negated-in-lhs": createRuleLoader("no-negated-in-lhs"),
};

const noNonnocalRules = {
	"no-nonoctal-decimal-escape": createRuleLoader("no-nonoctal-decimal-escape"),
};

const noObjRules = {
	"no-obj-calls": createRuleLoader("no-obj-calls"),
};

const noOctalRules = {
	"no-octal": createRuleLoader("no-octal"),
	"no-octal-escape": createRuleLoader("no-octal-escape"),
};

const noParamRules = {
	"no-param-reassign": createRuleLoader("no-param-reassign"),
};

const noPathRules = {
	"no-path-concat": createRuleLoader("no-path-concat"),
};

const noPlusRules = {
	"no-plusplus": createRuleLoader("no-plusplus"),
};

const noProcessRules = {
	"no-process-env": createRuleLoader("no-process-env"),
	"no-process-exit": createRuleLoader("no-process-exit"),
};

const noPromiseRules = {
	"no-promise-executor-return": createRuleLoader("no-promise-executor-return"),
};

const noProtoRules = {
	"no-proto": createRuleLoader("no-proto"),
	"no-prototype-builtins": createRuleLoader("no-prototype-builtins"),
};

const noRegexRules = {
	"no-regex-spaces": createRuleLoader("no-regex-spaces"),
};

const noRestrictedRules = {
	"no-restricted-exports": createRuleLoader("no-restricted-exports"),
	"no-restricted-globals": createRuleLoader("no-restricted-globals"),
	"no-restricted-imports": createRuleLoader("no-restricted-imports"),
	"no-restricted-modules": createRuleLoader("no-restricted-modules"),
	"no-restricted-properties": createRuleLoader("no-restricted-properties"),
	"no-restricted-syntax": createRuleLoader("no-restricted-syntax"),
};

const noReturnRules = {
	"no-return-assign": createRuleLoader("no-return-assign"),
	"no-return-await": createRuleLoader("no-return-await"),
};

const noSelfRules = {
	"no-self-assign": createRuleLoader("no-self-assign"),
	"no-self-compare": createRuleLoader("no-self-compare"),
};

const noSequencesRules = {
	"no-sequences": createRuleLoader("no-sequences"),
};

const noSparseRules = {
	"no-sparse-arrays": createRuleLoader("no-sparse-arrays"),
};

const noSyncRules = {
	"no-sync": createRuleLoader("no-sync"),
};

const noTabsRules = {
	"no-tabs": createRuleLoader("no-tabs"),
};

const noTemplateRules = {
	"no-template-curly-in-string": createRuleLoader("no-template-curly-in-string"),
	"template-curly-spacing": createRuleLoader("template-curly-spacing"),
	"template-tag-spacing": createRuleLoader("template-tag-spacing"),
};

const noTernaryRules = {
	"no-ternary": createRuleLoader("no-ternary"),
};

const noThisRules = {
	"no-this-before-super": createRuleLoader("no-this-before-super"),
};

const noUnassignedRules = {
	"no-unassigned-vars": createRuleLoader("no-unassigned-vars"),
};

const noUndefRules = {
	"no-undef": createRuleLoader("no-undef"),
	"no-undef-init": createRuleLoader("no-undef-init"),
	"no-undefined": createRuleLoader("no-undefined"),
};

const noUnexpectedRules = {
	"no-unexpected-multiline": createRuleLoader("no-unexpected-multiline"),
};

const noUnneededRules = {
	"no-unneeded-ternary": createRuleLoader("no-unneeded-ternary"),
};

const noUnreachableRules = {
	"no-unreachable": createRuleLoader("no-unreachable"),
	"no-unreachable-loop": createRuleLoader("no-unreachable-loop"),
};

const noUnsafeRules = {
	"no-unsafe-finally": createRuleLoader("no-unsafe-finally"),
	"no-unsafe-negation": createRuleLoader("no-unsafe-negation"),
	"no-unsafe-optional-chaining": createRuleLoader("no-unsafe-optional-chaining"),
};

const noUnusedRules = {
	"no-unused-expressions": createRuleLoader("no-unused-expressions"),
	"no-unused-labels": createRuleLoader("no-unused-labels"),
	"no-unused-vars": createRuleLoader("no-unused-vars"),
};

const noUselessRules = {
	"no-useless-assignment": createRuleLoader("no-useless-assignment"),
	"no-useless-backreference": createRuleLoader("no-useless-backreference"),
	"no-useless-call": createRuleLoader("no-useless-call"),
	"no-useless-catch": createRuleLoader("no-useless-catch"),
	"no-useless-computed-key": createRuleLoader("no-useless-computed-key"),
	"no-useless-concat": createRuleLoader("no-useless-concat"),
	"no-useless-escape": createRuleLoader("no-useless-escape"),
	"no-useless-rename": createRuleLoader("no-useless-rename"),
	"no-useless-return": createRuleLoader("no-useless-return"),
};

const noVarRules = {
	"no-var": createRuleLoader("no-var"),
};

const noVoidRules = {
	"no-void": createRuleLoader("no-void"),
};

const noWhitespaceRules = {
	"no-whitespace-before-property": createRuleLoader("no-whitespace-before-property"),
};

const noWithRules = {
	"no-with": createRuleLoader("no-with"),
};

const objectRules = {
	"object-curly-newline": createRuleLoader("object-curly-newline"),
	"object-curly-spacing": createRuleLoader("object-curly-spacing"),
	"object-property-newline": createRuleLoader("object-property-newline"),
	"object-shorthand": createRuleLoader("object-shorthand"),
};

const operatorRules = {
	"operator-assignment": createRuleLoader("operator-assignment"),
	"operator-linebreak": createRuleLoader("operator-linebreak"),
};

const paddedRules = {
	"padded-blocks": createRuleLoader("padded-blocks"),
};

const preferRules = {
	"prefer-arrow-callback": createRuleLoader("prefer-arrow-callback"),
	"prefer-const": createRuleLoader("prefer-const"),
	"prefer-destructuring": createRuleLoader("prefer-destructuring"),
	"prefer-exponentiation-operator": createRuleLoader("prefer-exponentiation-operator"),
	"prefer-named-capture-group": createRuleLoader("prefer-named-capture-group"),
	"prefer-numeric-literals": createRuleLoader("prefer-numeric-literals"),
	"prefer-object-has-own": createRuleLoader("prefer-object-has-own"),
	"prefer-object-spread": createRuleLoader("prefer-object-spread"),
	"prefer-reflect": createRuleLoader("prefer-reflect"),
	"prefer-rest-params": createRuleLoader("prefer-rest-params"),
	"prefer-spread": createRuleLoader("prefer-spread"),
	"prefer-template": createRuleLoader("prefer-template"),
};

const preserveRules = {
	"preserve-caught-error": createRuleLoader("preserve-caught-error"),
};

const quoteRules = {
	"quote-props": createRuleLoader("quote-props"),
	quotes: createRuleLoader("quotes"),
};

const radixRules = {
	radix: createRuleLoader("radix"),
};

const requireRules = {
	"require-atomic-updates": createRuleLoader("require-atomic-updates"),
	"require-await": createRuleLoader("require-await"),
	"require-unicode-regexp": createRuleLoader("require-unicode-regexp"),
	"require-yield": createRuleLoader("require-yield"),
};

const restRules = {
	"rest-spread-spacing": createRuleLoader("rest-spread-spacing"),
};

const semiRules = {
	semi: createRuleLoader("semi"),
	"semi-spacing": createRuleLoader("semi-spacing"),
	"semi-style": createRuleLoader("semi-style"),
};

const sortRules = {
	"sort-imports": createRuleLoader("sort-imports"),
	"sort-keys": createRuleLoader("sort-keys"),
	"sort-vars": createRuleLoader("sort-vars"),
};

const spaceRules = {
	"space-before-blocks": createRuleLoader("space-before-blocks"),
	"space-before-function-paren": createRuleLoader("space-before-function-paren"),
	"space-in-parens": createRuleLoader("space-in-parens"),
	"space-infix-ops": createRuleLoader("space-infix-ops"),
	"space-unary-ops": createRuleLoader("space-unary-ops"),
};

const strictRules = {
	strict: createRuleLoader("strict"),
};

const switchRules = {
	"switch-colon-spacing": createRuleLoader("switch-colon-spacing"),
};

const symbolRules = {
	"symbol-description": createRuleLoader("symbol-description"),
};

const unicodeRules = {
	"unicode-bom": createRuleLoader("unicode-bom"),
};

const useRules = {
	"use-isnan": createRuleLoader("use-isnan"),
};

const validRules = {
	"valid-typeof": createRuleLoader("valid-typeof"),
};

const wrapRules = {
	"wrap-iife": createRuleLoader("wrap-iife"),
	"wrap-regex": createRuleLoader("wrap-regex"),
};

const yodaRules = {
	yoda: createRuleLoader("yoda"),
};

/**
 * Merges all rule category objects into a single rules object.
 * @returns {Object} Combined rules object with all rule definitions
 */
const mergeRuleCategories = () => ({
	...accessorRules,
	...arrayRules,
	...arrowRules,
	...blockRules,
	...callbackRules,
	...caseRules,
	...classRules,
	...commaRules,
	...commentRules,
	...complexityRules,
	...computedPropertyRules,
	...consistencyRules,
	...constructorRules,
	...controlFlowRules,
	...declarationRules,
	...deleteRules,
	...duplicateRules,
	...emptyRules,
	...equalityRules,
	...evalRules,
	...extraRules,
	...functionRules,
	...generatorRules,
	...getterSetterRules,
	...globalRules,
	...identifierRules,
	...importRules,
	...indentationRules,
	...invalidRules,
	...jsxRules,
	...keyRules,
	...lineRules,
	...literalRules,
	...logicalRules,
	...maxRules,
	...mixedRules,
	...multilineRules,
	...newRules,
	...noAlertRules,
	...noAsyncRules,
	...noBitwiseRules,
	...noBufferRules,
	...noCallerRules,
	...noCatchRules,
	...noCompareRules,
	...noCondRules,
	...noConfusingRules,
	...noConsoleRules,
	...noConstRules,
	...noConstantRules,
	...noControlRules,
	...noDebuggerRules,
	...noDivRules,
	...noElseRules,
	...noExtendRules,
	...noFloatingRules,
	...noGlobalAssignRules,
	...noImplicitRules,
	...noInlineRules,
	...noInnerRules,
	...noInvalidRules,
	...noIrregularRules,
	...noIteratorRules,
	...noLabelsRules,
	...noLossRules,
	...noMagicRules,
	...noMisleadingRules,
	...noMultiRules,
	...noNativeRules,
	...noNegatedRules,
	...noNonnocalRules,
	...noObjRules,
	...noOctalRules,
	...noParamRules,
	...noPathRules,
	...noPlusRules,
	...noProcessRules,
	...noPromiseRules,
	...noProtoRules,
	...noRegexRules,
	...noRestrictedRules,
	...noReturnRules,
	...noSelfRules,
	...noSequencesRules,
	...noSparseRules,
	...noSyncRules,
	...noTabsRules,
	...noTemplateRules,
	...noTernaryRules,
	...noThisRules,
	...noUnassignedRules,
	...noUndefRules,
	...noUnexpectedRules,
	...noUnneededRules,
	...noUnreachableRules,
	...noUnsafeRules,
	...noUnusedRules,
	...noUselessRules,
	...noVarRules,
	...noVoidRules,
	...noWhitespaceRules,
	...noWithRules,
	...objectRules,
	...operatorRules,
	...paddedRules,
	...preferRules,
	...preserveRules,
	...quoteRules,
	...radixRules,
	...requireRules,
	...restRules,
	...semiRules,
	...sortRules,
	...spaceRules,
	...strictRules,
	...switchRules,
	...symbolRules,
	...unicodeRules,
	...useRules,
	...validRules,
	...wrapRules,
	...yodaRules,
});

/** @type {Map<string, import("../types").Rule.RuleModule>} */
module.exports = new LazyLoadingRuleMap(Object.entries(mergeRuleCategories()));
```