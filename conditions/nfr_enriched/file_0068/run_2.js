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
	"constructor-super": createRuleLoader("constructor-super"),
	"no-constructor-return": createRuleLoader("no-constructor-return"),
	"no-useless-constructor": createRuleLoader("no-useless-constructor"),
};

const controlFlowRules = {
	curly: createRuleLoader("curly"),
	"for-direction": createRuleLoader("for-direction"),
	"guard-for-in": createRuleLoader("guard-for-in"),
	"no-continue": createRuleLoader("no-continue"),
	"no-fallthrough": createRuleLoader("no-fallthrough"),
	"no-loop-func": createRuleLoader("no-loop-func"),
	"no-unmodified-loop-condition": createRuleLoader("no-unmodified-loop-condition"),
	"no-unreachable-loop": createRuleLoader("no-unreachable-loop"),
};

const dotRules = {
	"dot-location": createRuleLoader("dot-location"),
	"dot-notation": createRuleLoader("dot-notation"),
};

const eolRules = {
	"eol-last": createRuleLoader("eol-last"),
};

const equalityRules = {
	eqeqeq: createRuleLoader("eqeqeq"),
	"no-eq-null": createRuleLoader("no-eq-null"),
};

const evalRules = {
	"no-eval": createRuleLoader("no-eval"),
	"no-implied-eval": createRuleLoader("no-implied-eval"),
};

const functionRules = {
	"default-param-last": createRuleLoader("default-param-last"),
	"func-call-spacing": createRuleLoader("func-call-spacing"),
	"func-name-matching": createRuleLoader("func-name-matching"),
	"func-names": createRuleLoader("func-names"),
	"func-style": createRuleLoader("func-style"),
	"function-call-argument-newline": createRuleLoader("function-call-argument-newline"),
	"function-paren-newline": createRuleLoader("function-paren-newline"),
	"max-lines-per-function": createRuleLoader("max-lines-per-function"),
	"max-params": createRuleLoader("max-params"),
	"no-func-assign": createRuleLoader("no-func-assign"),
	"no-inner-declarations": createRuleLoader("no-inner-declarations"),
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
	"no-underscore-dangle": createRuleLoader("no-underscore-dangle"),
};

const importRules = {
	"no-duplicate-imports": createRuleLoader("no-duplicate-imports"),
	"no-import-assign": createRuleLoader("no-import-assign"),
	"no-restricted-imports": createRuleLoader("no-restricted-imports"),
	"sort-imports": createRuleLoader("sort-imports"),
};

const indentRules = {
	indent: createRuleLoader("indent"),
	"indent-legacy": createRuleLoader("indent-legacy"),
	"implicit-arrow-linebreak": createRuleLoader("implicit-arrow-linebreak"),
};

const initRules = {
	"init-declarations": createRuleLoader("init-declarations"),
};

const jsxRules = {
	"jsx-quotes": createRuleLoader("jsx-quotes"),
};

const keyRules = {
	"key-spacing": createRuleLoader("key-spacing"),
	"keyword-spacing": createRuleLoader("keyword-spacing"),
};

const lineRules = {
	"linebreak-style": createRuleLoader("linebreak-style"),
	"lines-between-class-members": createRuleLoader("lines-between-class-members"),
	"max-lines": createRuleLoader("max-lines"),
	"no-multiple-empty-lines": createRuleLoader("no-multiple-empty-lines"),
};

const literalRules = {
	"no-array-constructor": createRuleLoader("no-array-constructor"),
	"no-new-object": createRuleLoader("no-new-object"),
	"no-new-wrappers": createRuleLoader("no-new-wrappers"),
	"no-throw-literal": createRuleLoader("no-throw-literal"),
	"prefer-regex-literals": createRuleLoader("prefer-regex-literals"),
};

const logicalRules = {
	"logical-assignment-operators": createRuleLoader("logical-assignment-operators"),
	"no-mixed-operators": createRuleLoader("no-mixed-operators"),
};

const maxRules = {
	"max-classes-per-file": createRuleLoader("max-classes-per-file"),
	"max-len": createRuleLoader("max-len"),
	"max-statements-per-line": createRuleLoader("max-statements-per-line"),
};

const multilineRules = {
	"multiline-ternary": createRuleLoader("multiline-ternary"),
	"no-nested-ternary": createRuleLoader("no-nested-ternary"),
	"no-unneeded-ternary": createRuleLoader("no-unneeded-ternary"),
};

const newRules = {
	"new-cap": createRuleLoader("new-cap"),
	"new-parens": createRuleLoader("new-parens"),
	"newline-after-var": createRuleLoader("newline-after-var"),
	"newline-before-return": createRuleLoader("newline-before-return"),
	"newline-per-chained-call": createRuleLoader("newline-per-chained-call"),
	"no-new": createRuleLoader("no-new"),
	"no-new-func": createRuleLoader("no-new-func"),
	"no-new-native-nonconstructor": createRuleLoader("no-new-native-nonconstructor"),
	"no-new-require": createRuleLoader("no-new-require"),
	"no-new-symbol": createRuleLoader("no-new-symbol"),
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

const noDeleteRules = {
	"no-delete-var": createRuleLoader("no-delete-var"),
};

const noDivRules = {
	"no-div-regex": createRuleLoader("no-div-regex"),
};

const noDupeRules = {
	"no-dupe-args": createRuleLoader("no-dupe-args"),
	"no-dupe-else-if": createRuleLoader("no-dupe-else-if"),
	"no-dupe-keys": createRuleLoader("no-dupe-keys"),
};

const noElseRules = {
	"no-else-return": createRuleLoader("no-else-return"),
};

const noEmptyRules = {
	"no-empty": createRuleLoader("no-empty"),
	"no-empty-character-class": createRuleLoader("no-empty-character-class"),
	"no-empty-function": createRuleLoader("no-empty-function"),
	"no-empty-pattern": createRuleLoader("no-empty-pattern"),
};

const noExRules = {
	"no-ex-assign": createRuleLoader("no-ex-assign"),
};

const noExtendRules = {
	"no-extend-native": createRuleLoader("no-extend-native"),
};

const noExtraRules = {
	"no-extra-bind": createRuleLoader("no-extra-bind"),
	"no-extra-boolean-cast": createRuleLoader("no-extra-boolean-cast"),
	"no-extra-label": createRuleLoader("no-extra-label"),
	"no-extra-parens": createRuleLoader("no-extra-parens"),
	"no-extra-semi": createRuleLoader("no-extra-semi"),
};

const noFloatingRules = {
	"no-floating-decimal": createRuleLoader("no-floating-decimal"),
};

const noImplicitRules = {
	"no-implicit-coercion": createRuleLoader("no-implicit-coercion"),
};

const noInlineRules = {
	"no-inline-comments": createRuleLoader("no-inline-comments"),
};

const noInvalidRules = {
	"no-invalid-regexp": createRuleLoader("no-invalid-regexp"),
	"no-invalid-this": createRuleLoader("no-invalid-this"),
};

const noIrregularRules = {
	"no-irregular-whitespace": createRuleLoader("no-irregular