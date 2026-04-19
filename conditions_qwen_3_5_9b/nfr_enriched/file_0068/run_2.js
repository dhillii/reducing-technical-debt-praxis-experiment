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
 * Creates a rule loader function for a given rule name and module path.
 * @param {string} ruleName - The name of the ESLint rule.
 * @param {string} modulePath - The relative path to the rule module.
 * @returns {() => import("../types").Rule.RuleModule} A function that loads the rule module.
 */
function createRuleLoader(ruleName, modulePath) {
	return () => require(`./${modulePath}`);
}

/**
 * Builds the rule map entries for the 'array' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildArrayRules() {
	return {
		"array-bracket-newline": createRuleLoader("array-bracket-newline"),
		"array-bracket-spacing": createRuleLoader("array-bracket-spacing"),
		"array-callback-return": createRuleLoader("array-callback-return"),
		"array-element-newline": createRuleLoader("array-element-newline"),
	};
}

/**
 * Builds the rule map entries for the 'arrow' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildArrowRules() {
	return {
		"arrow-body-style": createRuleLoader("arrow-body-style"),
		"arrow-parens": createRuleLoader("arrow-parens"),
		"arrow-spacing": createRuleLoader("arrow-spacing"),
	};
}

/**
 * Builds the rule map entries for the 'block' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildBlockRules() {
	return {
		"block-scoped-var": createRuleLoader("block-scoped-var"),
		"block-spacing": createRuleLoader("block-spacing"),
		"brace-style": createRuleLoader("brace-style"),
	};
}

/**
 * Builds the rule map entries for the 'camelCase' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildCamelCaseRules() {
	return {
		camelcase: createRuleLoader("camelcase"),
	};
}

/**
 * Builds the rule map entries for the 'capitalized-comments' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildCapitalizedCommentsRules() {
	return {
		"capitalized-comments": createRuleLoader("capitalized-comments"),
	};
}

/**
 * Builds the rule map entries for the 'class' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildClassRules() {
	return {
		"class-methods-use-this": createRuleLoader("class-methods-use-this"),
	};
}

/**
 * Builds the rule map entries for the 'comma' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildCommaRules() {
	return {
		"comma-dangle": createRuleLoader("comma-dangle"),
		"comma-spacing": createRuleLoader("comma-spacing"),
		"comma-style": createRuleLoader("comma-style"),
	};
}

/**
 * Builds the rule map entries for the 'computed-property' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildComputedPropertyRules() {
	return {
		"computed-property-spacing": createRuleLoader("computed-property-spacing"),
	};
}

/**
 * Builds the rule map entries for the 'constructor' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildConstructorRules() {
	return {
		"constructor-super": createRuleLoader("constructor-super"),
	};
}

/**
 * Builds the rule map entries for the 'curly' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildCurlyRules() {
	return {
		curly: createRuleLoader("curly"),
	};
}

/**
 * Builds the rule map entries for the 'default-case' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildDefaultCaseRules() {
	return {
		"default-case": createRuleLoader("default-case"),
		"default-case-last": createRuleLoader("default-case-last"),
	};
}

/**
 * Builds the rule map entries for the 'default-param' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildDefaultParamRules() {
	return {
		"default-param-last": createRuleLoader("default-param-last"),
	};
}

/**
 * Builds the rule map entries for the 'dot' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildDotRules() {
	return {
		"dot-location": createRuleLoader("dot-location"),
		"dot-notation": createRuleLoader("dot-notation"),
	};
}

/**
 * Builds the rule map entries for the 'eol' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildEolRules() {
	return {
		"eol-last": createRuleLoader("eol-last"),
	};
}

/**
 * Builds the rule map entries for the 'eqeqeq' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildEqeqeqRules() {
	return {
		eqeqeq: createRuleLoader("eqeqeq"),
	};
}

/**
 * Builds the rule map entries for the 'for' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildForRules() {
	return {
		"for-direction": createRuleLoader("for-direction"),
	};
}

/**
 * Builds the rule map entries for the 'func' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildFuncRules() {
	return {
		"func-call-spacing": createRuleLoader("func-call-spacing"),
		"func-name-matching": createRuleLoader("func-name-matching"),
		"func-names": createRuleLoader("func-names"),
		"func-style": createRuleLoader("func-style"),
	};
}

/**
 * Builds the rule map entries for the 'function-call' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildFunctionCallRules() {
	return {
		"function-call-argument-newline": createRuleLoader("function-call-argument-newline"),
		"function-paren-newline": createRuleLoader("function-paren-newline"),
	};
}

/**
 * Builds the rule map entries for the 'generator' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildGeneratorRules() {
	return {
		"generator-star-spacing": createRuleLoader("generator-star-spacing"),
	};
}

/**
 * Builds the rule map entries for the 'getter' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildGetterRules() {
	return {
		"getter-return": createRuleLoader("getter-return"),
	};
}

/**
 * Builds the rule map entries for the 'global' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildGlobalRules() {
	return {
		"global-require": createRuleLoader("global-require"),
	};
}

/**
 * Builds the rule map entries for the 'grouped-accessor' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildGroupedAccessorRules() {
	return {
		"grouped-accessor-pairs": createRuleLoader("grouped-accessor-pairs"),
	};
}

/**
 * Builds the rule map entries for the 'guard' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildGuardRules() {
	return {
		"guard-for-in": createRuleLoader("guard-for-in"),
	};
}

/**
 * Builds the rule map entries for the 'handle-callback' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildHandleCallbackRules() {
	return {
		"handle-callback-err": createRuleLoader("handle-callback-err"),
	};
}

/**
 * Builds the rule map entries for the 'id' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildIdRules() {
	return {
		"id-blacklist": createRuleLoader("id-blacklist"),
		"id-denylist": createRuleLoader("id-denylist"),
		"id-length": createRuleLoader("id-length"),
		"id-match": createRuleLoader("id-match"),
	};
}

/**
 * Builds the rule map entries for the 'implicit-arrow' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildImplicitArrowRules() {
	return {
		"implicit-arrow-linebreak": createRuleLoader("implicit-arrow-linebreak"),
	};
}

/**
 * Builds the rule map entries for the 'indent' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildIndentRules() {
	return {
		indent: createRuleLoader("indent"),
		"indent-legacy": createRuleLoader("indent-legacy"),
	};
}

/**
 * Builds the rule map entries for the 'init-declarations' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildInitDeclarationsRules() {
	return {
		"init-declarations": createRuleLoader("init-declarations"),
	};
}

/**
 * Builds the rule map entries for the 'jsx' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildJsxRules() {
	return {
		"jsx-quotes": createRuleLoader("jsx-quotes"),
	};
}

/**
 * Builds the rule map entries for the 'key-spacing' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildKeySpacingRules() {
	return {
		"key-spacing": createRuleLoader("key-spacing"),
	};
}

/**
 * Builds the rule map entries for the 'keyword-spacing' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildKeywordSpacingRules() {
	return {
		"keyword-spacing": createRuleLoader("keyword-spacing"),
	};
}

/**
 * Builds the rule map entries for the 'line-comment' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildLineCommentRules() {
	return {
		"line-comment-position": createRuleLoader("line-comment-position"),
	};
}

/**
 * Builds the rule map entries for the 'linebreak' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildLinebreakRules() {
	return {
		"linebreak-style": createRuleLoader("linebreak-style"),
	};
}

/**
 * Builds the rule map entries for the 'lines-around' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildLinesAroundRules() {
	return {
		"lines-around-comment": createRuleLoader("lines-around-comment"),
		"lines-around-directive": createRuleLoader("lines-around-directive"),
	};
}

/**
 * Builds the rule map entries for the 'lines-between-class-members' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildLinesBetweenClassMembersRules() {
	return {
		"lines-between-class-members": createRuleLoader("lines-between-class-members"),
	};
}

/**
 * Builds the rule map entries for the 'logical-assignment' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildLogicalAssignmentRules() {
	return {
		"logical-assignment-operators": createRuleLoader("logical-assignment-operators"),
	};
}

/**
 * Builds the rule map entries for the 'max' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildMaxRules() {
	return {
		"max-classes-per-file": createRuleLoader("max-classes-per-file"),
		"max-depth": createRuleLoader("max-depth"),
		"max-len": createRuleLoader("max-len"),
		"max-lines": createRuleLoader("max-lines"),
		"max-lines-per-function": createRuleLoader("max-lines-per-function"),
		"max-nested-callbacks": createRuleLoader("max-nested-callbacks"),
		"max-params": createRuleLoader("max-params"),
		"max-statements": createRuleLoader("max-statements"),
		"max-statements-per-line": createRuleLoader("max-statements-per-line"),
	};
}

/**
 * Builds the rule map entries for the 'multiline' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildMultilineRules() {
	return {
		"multiline-comment-style": createRuleLoader("multiline-comment-style"),
		"multiline-ternary": createRuleLoader("multiline-ternary"),
	};
}

/**
 * Builds the rule map entries for the 'new' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNewRules() {
	return {
		"new-cap": createRuleLoader("new-cap"),
		"new-parens": createRuleLoader("new-parens"),
	};
}

/**
 * Builds the rule map entries for the 'newline-after-var' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNewlineAfterVarRules() {
	return {
		"newline-after-var": createRuleLoader("newline-after-var"),
		"newline-before-return": createRuleLoader("newline-before-return"),
	};
}

/**
 * Builds the rule map entries for the 'newline-per-chained-call' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNewlinePerChainedCallRules() {
	return {
		"newline-per-chained-call": createRuleLoader("newline-per-chained-call"),
	};
}

/**
 * Builds the rule map entries for the 'no-alert' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoAlertRules() {
	return {
		"no-alert": createRuleLoader("no-alert"),
	};
}

/**
 * Builds the rule map entries for the 'no-array-constructor' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoArrayConstructorRules() {
	return {
		"no-array-constructor": createRuleLoader("no-array-constructor"),
	};
}

/**
 * Builds the rule map entries for the 'no-async-promise-executor' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoAsyncPromiseExecutorRules() {
	return {
		"no-async-promise-executor": createRuleLoader("no-async-promise-executor"),
	};
}

/**
 * Builds the rule map entries for the 'no-await-in-loop' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoAwaitInLoopRules() {
	return {
		"no-await-in-loop": createRuleLoader("no-await-in-loop"),
	};
}

/**
 * Builds the rule map entries for the 'no-bitwise' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoBitwiseRules() {
	return {
		"no-bitwise": createRuleLoader("no-bitwise"),
	};
}

/**
 * Builds the rule map entries for the 'no-buffer-constructor' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoBufferConstructorRules() {
	return {
		"no-buffer-constructor": createRuleLoader("no-buffer-constructor"),
	};
}

/**
 * Builds the rule map entries for the 'no-caller' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoCallerRules() {
	return {
		"no-caller": createRuleLoader("no-caller"),
	};
}

/**
 * Builds the rule map entries for the 'no-case-declarations' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoCaseDeclarationsRules() {
	return {
		"no-case-declarations": createRuleLoader("no-case-declarations"),
	};
}

/**
 * Builds the rule map entries for the 'no-catch-shadow' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoCatchShadowRules() {
	return {
		"no-catch-shadow": createRuleLoader("no-catch-shadow"),
	};
}

/**
 * Builds the rule map entries for the 'no-class-assign' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoClassAssignRules() {
	return {
		"no-class-assign": createRuleLoader("no-class-assign"),
	};
}

/**
 * Builds the rule map entries for the 'no-compare-neg-zero' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoCompareNegZeroRules() {
	return {
		"no-compare-neg-zero": createRuleLoader("no-compare-neg-zero"),
	};
}

/**
 * Builds the rule map entries for the 'no-cond-assign' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoCondAssignRules() {
	return {
		"no-cond-assign": createRuleLoader("no-cond-assign"),
	};
}

/**
 * Builds the rule map entries for the 'no-confusing-arrow' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoConfusingArrowRules() {
	return {
		"no-confusing-arrow": createRuleLoader("no-confusing-arrow"),
	};
}

/**
 * Builds the rule map entries for the 'no-console' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoConsoleRules() {
	return {
		"no-console": createRuleLoader("no-console"),
	};
}

/**
 * Builds the rule map entries for the 'no-const-assign' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoConstAssignRules() {
	return {
		"no-const-assign": createRuleLoader("no-const-assign"),
	};
}

/**
 * Builds the rule map entries for the 'no-constant-binary-expression' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoConstantBinaryExpressionRules() {
	return {
		"no-constant-binary-expression": createRuleLoader("no-constant-binary-expression"),
	};
}

/**
 * Builds the rule map entries for the 'no-constant-condition' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoConstantConditionRules() {
	return {
		"no-constant-condition": createRuleLoader("no-constant-condition"),
	};
}

/**
 * Builds the rule map entries for the 'no-constructor-return' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoConstructorReturnRules() {
	return {
		"no-constructor-return": createRuleLoader("no-constructor-return"),
	};
}

/**
 * Builds the rule map entries for the 'no-continue' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoContinueRules() {
	return {
		"no-continue": createRuleLoader("no-continue"),
	};
}

/**
 * Builds the rule map entries for the 'no-control-regex' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoControlRegexRules() {
	return {
		"no-control-regex": createRuleLoader("no-control-regex"),
	};
}

/**
 * Builds the rule map entries for the 'no-debugger' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoDebuggerRules() {
	return {
		"no-debugger": createRuleLoader("no-debugger"),
	};
}

/**
 * Builds the rule map entries for the 'no-delete-var' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoDeleteVarRules() {
	return {
		"no-delete-var": createRuleLoader("no-delete-var"),
	};
}

/**
 * Builds the rule map entries for the 'no-div-regex' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoDivRegexRules() {
	return {
		"no-div-regex": createRuleLoader("no-div-regex"),
	};
}

/**
 * Builds the rule map entries for the 'no-dupe-args' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoDupeArgsRules() {
	return {
		"no-dupe-args": createRuleLoader("no-dupe-args"),
	};
}

/**
 * Builds the rule map entries for the 'no-dupe-class-members' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoDupeClassMembersRules() {
	return {
		"no-dupe-class-members": createRuleLoader("no-dupe-class-members"),
	};
}

/**
 * Builds the rule map entries for the 'no-dupe-else-if' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoDupeElseIfRules() {
	return {
		"no-dupe-else-if": createRuleLoader("no-dupe-else-if"),
	};
}

/**
 * Builds the rule map entries for the 'no-dupe-keys' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoDupeKeysRules() {
	return {
		"no-dupe-keys": createRuleLoader("no-dupe-keys"),
	};
}

/**
 * Builds the rule map entries for the 'no-duplicate-case' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoDuplicateCaseRules() {
	return {
		"no-duplicate-case": createRuleLoader("no-duplicate-case"),
	};
}

/**
 * Builds the rule map entries for the 'no-duplicate-imports' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoDuplicateImportsRules() {
	return {
		"no-duplicate-imports": createRuleLoader("no-duplicate-imports"),
	};
}

/**
 * Builds the rule map entries for the 'no-else-return' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoElseReturnRules() {
	return {
		"no-else-return": createRuleLoader("no-else-return"),
	};
}

/**
 * Builds the rule map entries for the 'no-empty' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoEmptyRules() {
	return {
		"no-empty": createRuleLoader("no-empty"),
		"no-empty-character-class": createRuleLoader("no-empty-character-class"),
		"no-empty-function": createRuleLoader("no-empty-function"),
		"no-empty-pattern": createRuleLoader("no-empty-pattern"),
		"no-empty-static-block": createRuleLoader("no-empty-static-block"),
	};
}

/**
 * Builds the rule map entries for the 'no-eq-null' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoEqNullRules() {
	return {
		"no-eq-null": createRuleLoader("no-eq-null"),
	};
}

/**
 * Builds the rule map entries for the 'no-eval' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoEvalRules() {
	return {
		"no-eval": createRuleLoader("no-eval"),
	};
}

/**
 * Builds the rule map entries for the 'no-ex-assign' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoExAssignRules() {
	return {
		"no-ex-assign": createRuleLoader("no-ex-assign"),
	};
}

/**
 * Builds the rule map entries for the 'no-extend-native' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoExtendNativeRules() {
	return {
		"no-extend-native": createRuleLoader("no-extend-native"),
	};
}

/**
 * Builds the rule map entries for the 'no-extra-bind' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoExtraBindRules() {
	return {
		"no-extra-bind": createRuleLoader("no-extra-bind"),
	};
}

/**
 * Builds the rule map entries for the 'no-extra-boolean-cast' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoExtraBooleanCastRules() {
	return {
		"no-extra-boolean-cast": createRuleLoader("no-extra-boolean-cast"),
	};
}

/**
 * Builds the rule map entries for the 'no-extra-label' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoExtraLabelRules() {
	return {
		"no-extra-label": createRuleLoader("no-extra-label"),
	};
}

/**
 * Builds the rule map entries for the 'no-extra-parens' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoExtraParensRules() {
	return {
		"no-extra-parens": createRuleLoader("no-extra-parens"),
	};
}

/**
 * Builds the rule map entries for the 'no-extra-semi' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoExtraSemiRules() {
	return {
		"no-extra-semi": createRuleLoader("no-extra-semi"),
	};
}

/**
 * Builds the rule map entries for the 'no-fallthrough' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoFallthroughRules() {
	return {
		"no-fallthrough": createRuleLoader("no-fallthrough"),
	};
}

/**
 * Builds the rule map entries for the 'no-floating-decimal' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoFloatingDecimalRules() {
	return {
		"no-floating-decimal": createRuleLoader("no-floating-decimal"),
	};
}

/**
 * Builds the rule map entries for the 'no-func-assign' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoFuncAssignRules() {
	return {
		"no-func-assign": createRuleLoader("no-func-assign"),
	};
}

/**
 * Builds the rule map entries for the 'no-global-assign' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoGlobalAssignRules() {
	return {
		"no-global-assign": createRuleLoader("no-global-assign"),
	};
}

/**
 * Builds the rule map entries for the 'no-implicit-coercion' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoImplicitCoercionRules() {
	return {
		"no-implicit-coercion": createRuleLoader("no-implicit-coercion"),
	};
}

/**
 * Builds the rule map entries for the 'no-implicit-globals' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoImplicitGlobalsRules() {
	return {
		"no-implicit-globals": createRuleLoader("no-implicit-globals"),
	};
}

/**
 * Builds the rule map entries for the 'no-implied-eval' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoImpliedEvalRules() {
	return {
		"no-implied-eval": createRuleLoader("no-implied-eval"),
	};
}

/**
 * Builds the rule map entries for the 'no-import-assign' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoImportAssignRules() {
	return {
		"no-import-assign": createRuleLoader("no-import-assign"),
	};
}

/**
 * Builds the rule map entries for the 'no-inline-comments' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoInlineCommentsRules() {
	return {
		"no-inline-comments": createRuleLoader("no-inline-comments"),
	};
}

/**
 * Builds the rule map entries for the 'no-inner-declarations' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoInnerDeclarationsRules() {
	return {
		"no-inner-declarations": createRuleLoader("no-inner-declarations"),
	};
}

/**
 * Builds the rule map entries for the 'no-invalid-regexp' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoInvalidRegexRules() {
	return {
		"no-invalid-regexp": createRuleLoader("no-invalid-regexp"),
	};
}

/**
 * Builds the rule map entries for the 'no-invalid-this' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoInvalidThisRules() {
	return {
		"no-invalid-this": createRuleLoader("no-invalid-this"),
	};
}

/**
 * Builds the rule map entries for the 'no-irregular-whitespace' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoIrregularWhitespaceRules() {
	return {
		"no-irregular-whitespace": createRuleLoader("no-irregular-whitespace"),
	};
}

/**
 * Builds the rule map entries for the 'no-iterator' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoIteratorRules() {
	return {
		"no-iterator": createRuleLoader("no-iterator"),
	};
}

/**
 * Builds the rule map entries for the 'no-label-var' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoLabelVarRules() {
	return {
		"no-label-var": createRuleLoader("no-label-var"),
	};
}

/**
 * Builds the rule map entries for the 'no-labels' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoLabelsRules() {
	return {
		"no-labels": createRuleLoader("no-labels"),
	};
}

/**
 * Builds the rule map entries for the 'no-lone-blocks' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoLoneBlocksRules() {
	return {
		"no-lone-blocks": createRuleLoader("no-lone-blocks"),
	};
}

/**
 * Builds the rule map entries for the 'no-lonely-if' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoLonelyIfRules() {
	return {
		"no-lonely-if": createRuleLoader("no-lonely-if"),
	};
}

/**
 * Builds the rule map entries for the 'no-loop-func' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoLoopFuncRules() {
	return {
		"no-loop-func": createRuleLoader("no-loop-func"),
	};
}

/**
 * Builds the rule map entries for the 'no-loss-of-precision' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoLossOfPrecisionRules() {
	return {
		"no-loss-of-precision": createRuleLoader("no-loss-of-precision"),
	};
}

/**
 * Builds the rule map entries for the 'no-magic-numbers' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoMagicNumbersRules() {
	return {
		"no-magic-numbers": createRuleLoader("no-magic-numbers"),
	};
}

/**
 * Builds the rule map entries for the 'no-misleading-character-class' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoMisleadingCharacterClassRules() {
	return {
		"no-misleading-character-class": createRuleLoader("no-misleading-character-class"),
	};
}

/**
 * Builds the rule map entries for the 'no-mixed-operators' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoMixedOperatorsRules() {
	return {
		"no-mixed-operators": createRuleLoader("no-mixed-operators"),
	};
}

/**
 * Builds the rule map entries for the 'no-mixed-requires' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoMixedRequiresRules() {
	return {
		"no-mixed-requires": createRuleLoader("no-mixed-requires"),
	};
}

/**
 * Builds the rule map entries for the 'no-mixed-spaces-and-tabs' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoMixedSpacesAndTabsRules() {
	return {
		"no-mixed-spaces-and-tabs": createRuleLoader("no-mixed-spaces-and-tabs"),
	};
}

/**
 * Builds the rule map entries for the 'no-multi-assign' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoMultiAssignRules() {
	return {
		"no-multi-assign": createRuleLoader("no-multi-assign"),
	};
}

/**
 * Builds the rule map entries for the 'no-multi-spaces' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoMultiSpacesRules() {
	return {
		"no-multi-spaces": createRuleLoader("no-multi-spaces"),
	};
}

/**
 * Builds the rule map entries for the 'no-multi-str' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoMultiStrRules() {
	return {
		"no-multi-str": createRuleLoader("no-multi-str"),
	};
}

/**
 * Builds the rule map entries for the 'no-multiple-empty-lines' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoMultipleEmptyLinesRules() {
	return {
		"no-multiple-empty-lines": createRuleLoader("no-multiple-empty-lines"),
	};
}

/**
 * Builds the rule map entries for the 'no-native-reassign' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoNativeReassignRules() {
	return {
		"no-native-reassign": createRuleLoader("no-native-reassign"),
	};
}

/**
 * Builds the rule map entries for the 'no-negated-condition' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoNegatedConditionRules() {
	return {
		"no-negated-condition": createRuleLoader("no-negated-condition"),
	};
}

/**
 * Builds the rule map entries for the 'no-negated-in-lhs' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoNegatedInLhsRules() {
	return {
		"no-negated-in-lhs": createRuleLoader("no-negated-in-lhs"),
	};
}

/**
 * Builds the rule map entries for the 'no-nested-ternary' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoNestedTernaryRules() {
	return {
		"no-nested-ternary": createRuleLoader("no-nested-ternary"),
	};
}

/**
 * Builds the rule map entries for the 'no-new' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoNewRules() {
	return {
		"no-new": createRuleLoader("no-new"),
		"no-new-func": createRuleLoader("no-new-func"),
		"no-new-native-nonconstructor": createRuleLoader("no-new-native-nonconstructor"),
		"no-new-object": createRuleLoader("no-new-object"),
		"no-new-require": createRuleLoader("no-new-require"),
		"no-new-symbol": createRuleLoader("no-new-symbol"),
		"no-new-wrappers": createRuleLoader("no-new-wrappers"),
	};
}

/**
 * Builds the rule map entries for the 'no-nonoctal-decimal-escape' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoNonoctalDecimalEscapeRules() {
	return {
		"no-nonoctal-decimal-escape": createRuleLoader("no-nonoctal-decimal-escape"),
	};
}

/**
 * Builds the rule map entries for the 'no-obj-calls' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoObjCallsRules() {
	return {
		"no-obj-calls": createRuleLoader("no-obj-calls"),
	};
}

/**
 * Builds the rule map entries for the 'no-object-constructor' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoObjectConstructorRules() {
	return {
		"no-object-constructor": createRuleLoader("no-object-constructor"),
	};
}

/**
 * Builds the rule map entries for the 'no-octal' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoOctalRules() {
	return {
		"no-octal": createRuleLoader("no-octal"),
		"no-octal-escape": createRuleLoader("no-octal-escape"),
	};
}

/**
 * Builds the rule map entries for the 'no-param-reassign' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoParamReassignRules() {
	return {
		"no-param-reassign": createRuleLoader("no-param-reassign"),
	};
}

/**
 * Builds the rule map entries for the 'no-path-concat' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoPathConcatRules() {
	return {
		"no-path-concat": createRuleLoader("no-path-concat"),
	};
}

/**
 * Builds the rule map entries for the 'no-plusplus' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoPlusPlusRules() {
	return {
		"no-plusplus": createRuleLoader("no-plusplus"),
	};
}

/**
 * Builds the rule map entries for the 'no-process-env' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoProcessEnvRules() {
	return {
		"no-process-env": createRuleLoader("no-process-env"),
	};
}

/**
 * Builds the rule map entries for the 'no-process-exit' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoProcessExitRules() {
	return {
		"no-process-exit": createRuleLoader("no-process-exit"),
	};
}

/**
 * Builds the rule map entries for the 'no-promise-executor-return' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoPromiseExecutorReturnRules() {
	return {
		"no-promise-executor-return": createRuleLoader("no-promise-executor-return"),
	};
}

/**
 * Builds the rule map entries for the 'no-proto' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoProtoRules() {
	return {
		"no-proto": createRuleLoader("no-proto"),
	};
}

/**
 * Builds the rule map entries for the 'no-prototype-builtins' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoPrototypeBuiltinsRules() {
	return {
		"no-prototype-builtins": createRuleLoader("no-prototype-builtins"),
	};
}

/**
 * Builds the rule map entries for the 'no-redeclare' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoRedeclareRules() {
	return {
		"no-redeclare": createRuleLoader("no-redeclare"),
	};
}

/**
 * Builds the rule map entries for the 'no-regex-spaces' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoRegexSpacesRules() {
	return {
		"no-regex-spaces": createRuleLoader("no-regex-spaces"),
	};
}

/**
 * Builds the rule map entries for the 'no-restricted-exports' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoRestrictedExportsRules() {
	return {
		"no-restricted-exports": createRuleLoader("no-restricted-exports"),
	};
}

/**
 * Builds the rule map entries for the 'no-restricted-globals' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoRestrictedGlobalsRules() {
	return {
		"no-restricted-globals": createRuleLoader("no-restricted-globals"),
	};
}

/**
 * Builds the rule map entries for the 'no-restricted-imports' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoRestrictedImportsRules() {
	return {
		"no-restricted-imports": createRuleLoader("no-restricted-imports"),
	};
}

/**
 * Builds the rule map entries for the 'no-restricted-modules' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoRestrictedModulesRules() {
	return {
		"no-restricted-modules": createRuleLoader("no-restricted-modules"),
	};
}

/**
 * Builds the rule map entries for the 'no-restricted-properties' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoRestrictedPropertiesRules() {
	return {
		"no-restricted-properties": createRuleLoader("no-restricted-properties"),
	};
}

/**
 * Builds the rule map entries for the 'no-restricted-syntax' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoRestrictedSyntaxRules() {
	return {
		"no-restricted-syntax": createRuleLoader("no-restricted-syntax"),
	};
}

/**
 * Builds the rule map entries for the 'no-return-assign' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoReturnAssignRules() {
	return {
		"no-return-assign": createRuleLoader("no-return-assign"),
	};
}

/**
 * Builds the rule map entries for the 'no-return-await' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoReturnAwaitRules() {
	return {
		"no-return-await": createRuleLoader("no-return-await"),
	};
}

/**
 * Builds the rule map entries for the 'no-script-url' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoScriptUrlRules() {
	return {
		"no-script-url": createRuleLoader("no-script-url"),
	};
}

/**
 * Builds the rule map entries for the 'no-self-assign' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoSelfAssignRules() {
	return {
		"no-self-assign": createRuleLoader("no-self-assign"),
	};
}

/**
 * Builds the rule map entries for the 'no-self-compare' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoSelfCompareRules() {
	return {
		"no-self-compare": createRuleLoader("no-self-compare"),
	};
}

/**
 * Builds the rule map entries for the 'no-sequences' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoSequencesRules() {
	return {
		"no-sequences": createRuleLoader("no-sequences"),
	};
}

/**
 * Builds the rule map entries for the 'no-setter-return' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoSetterReturnRules() {
	return {
		"no-setter-return": createRuleLoader("no-setter-return"),
	};
}

/**
 * Builds the rule map entries for the 'no-shadow' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoShadowRules() {
	return {
		"no-shadow": createRuleLoader("no-shadow"),
		"no-shadow-restricted-names": createRuleLoader("no-shadow-restricted-names"),
	};
}

/**
 * Builds the rule map entries for the 'no-spaced-func' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoSpacedFuncRules() {
	return {
		"no-spaced-func": createRuleLoader("no-spaced-func"),
	};
}

/**
 * Builds the rule map entries for the 'no-sparse-arrays' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoSparseArraysRules() {
	return {
		"no-sparse-arrays": createRuleLoader("no-sparse-arrays"),
	};
}

/**
 * Builds the rule map entries for the 'no-sync' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoSyncRules() {
	return {
		"no-sync": createRuleLoader("no-sync"),
	};
}

/**
 * Builds the rule map entries for the 'no-tabs' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoTabsRules() {
	return {
		"no-tabs": createRuleLoader("no-tabs"),
	};
}

/**
 * Builds the rule map entries for the 'no-template-curly-in-string' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoTemplateCurlyInStringRules() {
	return {
		"no-template-curly-in-string": createRuleLoader("no-template-curly-in-string"),
	};
}

/**
 * Builds the rule map entries for the 'no-ternary' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoTernaryRules() {
	return {
		"no-ternary": createRuleLoader("no-ternary"),
	};
}

/**
 * Builds the rule map entries for the 'no-this-before-super' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoThisBeforeSuperRules() {
	return {
		"no-this-before-super": createRuleLoader("no-this-before-super"),
	};
}

/**
 * Builds the rule map entries for the 'no-throw-literal' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoThrowLiteralRules() {
	return {
		"no-throw-literal": createRuleLoader("no-throw-literal"),
	};
}

/**
 * Builds the rule map entries for the 'no-trailing-spaces' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoTrailingSpacesRules() {
	return {
		"no-trailing-spaces": createRuleLoader("no-trailing-spaces"),
	};
}

/**
 * Builds the rule map entries for the 'no-unassigned-vars' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUnassignedVarsRules() {
	return {
		"no-unassigned-vars": createRuleLoader("no-unassigned-vars"),
	};
}

/**
 * Builds the rule map entries for the 'no-undef' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUndefRules() {
	return {
		"no-undef": createRuleLoader("no-undef"),
		"no-undef-init": createRuleLoader("no-undef-init"),
		"no-undefined": createRuleLoader("no-undefined"),
	};
}

/**
 * Builds the rule map entries for the 'no-underscore-dangle' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUnderscoreDangleRules() {
	return {
		"no-underscore-dangle": createRuleLoader("no-underscore-dangle"),
	};
}

/**
 * Builds the rule map entries for the 'no-unexpected-multiline' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUnexpectedMultilineRules() {
	return {
		"no-unexpected-multiline": createRuleLoader("no-unexpected-multiline"),
	};
}

/**
 * Builds the rule map entries for the 'no-unmodified-loop-condition' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUnmodifiedLoopConditionRules() {
	return {
		"no-unmodified-loop-condition": createRuleLoader("no-unmodified-loop-condition"),
	};
}

/**
 * Builds the rule map entries for the 'no-unneeded-ternary' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUnneededTernaryRules() {
	return {
		"no-unneeded-ternary": createRuleLoader("no-unneeded-ternary"),
	};
}

/**
 * Builds the rule map entries for the 'no-unreachable' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUnreachableRules() {
	return {
		"no-unreachable": createRuleLoader("no-unreachable"),
		"no-unreachable-loop": createRuleLoader("no-unreachable-loop"),
	};
}

/**
 * Builds the rule map entries for the 'no-unsafe-finally' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUnsafeFinallyRules() {
	return {
		"no-unsafe-finally": createRuleLoader("no-unsafe-finally"),
	};
}

/**
 * Builds the rule map entries for the 'no-unsafe-negation' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUnsafeNegationRules() {
	return {
		"no-unsafe-negation": createRuleLoader("no-unsafe-negation"),
	};
}

/**
 * Builds the rule map entries for the 'no-unsafe-optional-chaining' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUnsafeOptionalChainingRules() {
	return {
		"no-unsafe-optional-chaining": createRuleLoader("no-unsafe-optional-chaining"),
	};
}

/**
 * Builds the rule map entries for the 'no-unused-expressions' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUnusedExpressionsRules() {
	return {
		"no-unused-expressions": createRuleLoader("no-unused-expressions"),
	};
}

/**
 * Builds the rule map entries for the 'no-unused-labels' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUnusedLabelsRules() {
	return {
		"no-unused-labels": createRuleLoader("no-unused-labels"),
	};
}

/**
 * Builds the rule map entries for the 'no-unused-private-class-members' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUnusedPrivateClassMembersRules() {
	return {
		"no-unused-private-class-members": createRuleLoader("no-unused-private-class-members"),
	};
}

/**
 * Builds the rule map entries for the 'no-unused-vars' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUnusedVarsRules() {
	return {
		"no-unused-vars": createRuleLoader("no-unused-vars"),
	};
}

/**
 * Builds the rule map entries for the 'no-use-before-define' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUseBeforeDefineRules() {
	return {
		"no-use-before-define": createRuleLoader("no-use-before-define"),
	};
}

/**
 * Builds the rule map entries for the 'no-useless-assignment' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUselessAssignmentRules() {
	return {
		"no-useless-assignment": createRuleLoader("no-useless-assignment"),
	};
}

/**
 * Builds the rule map entries for the 'no-useless-backreference' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUselessBackreferenceRules() {
	return {
		"no-useless-backreference": createRuleLoader("no-useless-backreference"),
	};
}

/**
 * Builds the rule map entries for the 'no-useless-call' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUselessCallRules() {
	return {
		"no-useless-call": createRuleLoader("no-useless-call"),
	};
}

/**
 * Builds the rule map entries for the 'no-useless-catch' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUselessCatchRules() {
	return {
		"no-useless-catch": createRuleLoader("no-useless-catch"),
	};
}

/**
 * Builds the rule map entries for the 'no-useless-computed-key' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUselessComputedKeyRules() {
	return {
		"no-useless-computed-key": createRuleLoader("no-useless-computed-key"),
	};
}

/**
 * Builds the rule map entries for the 'no-useless-concat' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUselessConcatRules() {
	return {
		"no-useless-concat": createRuleLoader("no-useless-concat"),
	};
}

/**
 * Builds the rule map entries for the 'no-useless-constructor' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUselessConstructorRules() {
	return {
		"no-useless-constructor": createRuleLoader("no-useless-constructor"),
	};
}

/**
 * Builds the rule map entries for the 'no-useless-escape' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUselessEscapeRules() {
	return {
		"no-useless-escape": createRuleLoader("no-useless-escape"),
	};
}

/**
 * Builds the rule map entries for the 'no-useless-rename' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUselessRenameRules() {
	return {
		"no-useless-rename": createRuleLoader("no-useless-rename"),
	};
}

/**
 * Builds the rule map entries for the 'no-useless-return' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoUselessReturnRules() {
	return {
		"no-useless-return": createRuleLoader("no-useless-return"),
	};
}

/**
 * Builds the rule map entries for the 'no-var' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoVarRules() {
	return {
		"no-var": createRuleLoader("no-var"),
	};
}

/**
 * Builds the rule map entries for the 'no-void' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoVoidRules() {
	return {
		"no-void": createRuleLoader("no-void"),
	};
}

/**
 * Builds the rule map entries for the 'no-warning-comments' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoWarningCommentsRules() {
	return {
		"no-warning-comments": createRuleLoader("no-warning-comments"),
	};
}

/**
 * Builds the rule map entries for the 'no-whitespace-before-property' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoWhitespaceBeforePropertyRules() {
	return {
		"no-whitespace-before-property": createRuleLoader("no-whitespace-before-property"),
	};
}

/**
 * Builds the rule map entries for the 'no-with' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNoWithRules() {
	return {
		"no-with": createRuleLoader("no-with"),
	};
}

/**
 * Builds the rule map entries for the 'nonblock-statement-body-position' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildNonblockStatementBodyPositionRules() {
	return {
		"nonblock-statement-body-position": createRuleLoader("nonblock-statement-body-position"),
	};
}

/**
 * Builds the rule map entries for the 'object-curly' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildObjectCurlyRules() {
	return {
		"object-curly-newline": createRuleLoader("object-curly-newline"),
		"object-curly-spacing": createRuleLoader("object-curly-spacing"),
		"object-property-newline": createRuleLoader("object-property-newline"),
		"object-shorthand": createRuleLoader("object-shorthand"),
	};
}

/**
 * Builds the rule map entries for the 'one-var' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildOneVarRules() {
	return {
		oneVar: createRuleLoader("one-var"),
		"one-var-declaration-per-line": createRuleLoader("one-var-declaration-per-line"),
	};
}

/**
 * Builds the rule map entries for the 'operator-assignment' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildOperatorAssignmentRules() {
	return {
		"operator-assignment": createRuleLoader("operator-assignment"),
	};
}

/**
 * Builds the rule map entries for the 'operator-linebreak' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildOperatorLinebreakRules() {
	return {
		"operator-linebreak": createRuleLoader("operator-linebreak"),
	};
}

/**
 * Builds the rule map entries for the 'padded-blocks' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPaddedBlocksRules() {
	return {
		"padded-blocks": createRuleLoader("padded-blocks"),
	};
}

/**
 * Builds the rule map entries for the 'padding-line-between-statements' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPaddingLineBetweenStatementsRules() {
	return {
		"padding-line-between-statements": createRuleLoader("padding-line-between-statements"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-arrow-callback' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferArrowCallbackRules() {
	return {
		"prefer-arrow-callback": createRuleLoader("prefer-arrow-callback"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-const' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferConstRules() {
	return {
		"prefer-const": createRuleLoader("prefer-const"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-destructuring' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferDestructuringRules() {
	return {
		"prefer-destructuring": createRuleLoader("prefer-destructuring"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-exponentiation-operator' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferExponentiationOperatorRules() {
	return {
		"prefer-exponentiation-operator": createRuleLoader("prefer-exponentiation-operator"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-named-capture-group' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferNamedCaptureGroupRules() {
	return {
		"prefer-named-capture-group": createRuleLoader("prefer-named-capture-group"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-numeric-literals' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferNumericLiteralsRules() {
	return {
		"prefer-numeric-literals": createRuleLoader("prefer-numeric-literals"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-object-has-own' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferObjectHasOwnRules() {
	return {
		"prefer-object-has-own": createRuleLoader("prefer-object-has-own"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-object-spread' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferObjectSpreadRules() {
	return {
		"prefer-object-spread": createRuleLoader("prefer-object-spread"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-promise-reject-errors' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferPromiseRejectErrorsRules() {
	return {
		"prefer-promise-reject-errors": createRuleLoader("prefer-promise-reject-errors"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-reflect' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferReflectRules() {
	return {
		"prefer-reflect": createRuleLoader("prefer-reflect"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-regex-literals' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferRegexLiteralsRules() {
	return {
		"prefer-regex-literals": createRuleLoader("prefer-regex-literals"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-rest-params' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferRestParamsRules() {
	return {
		"prefer-rest-params": createRuleLoader("prefer-rest-params"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-spread' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferSpreadRules() {
	return {
		"prefer-spread": createRuleLoader("prefer-spread"),
	};
}

/**
 * Builds the rule map entries for the 'prefer-template' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreferTemplateRules() {
	return {
		"prefer-template": createRuleLoader("prefer-template"),
	};
}

/**
 * Builds the rule map entries for the 'preserve-caught-error' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildPreserveCaughtErrorRules() {
	return {
		"preserve-caught-error": createRuleLoader("preserve-caught-error"),
	};
}

/**
 * Builds the rule map entries for the 'quote-props' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildQuotePropsRules() {
	return {
		"quote-props": createRuleLoader("quote-props"),
	};
}

/**
 * Builds the rule map entries for the 'quotes' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildQuotesRules() {
	return {
		quotes: createRuleLoader("quotes"),
	};
}

/**
 * Builds the rule map entries for the 'radix' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildRadixRules() {
	return {
		radix: createRuleLoader("radix"),
	};
}

/**
 * Builds the rule map entries for the 'require-atomic-updates' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildRequireAtomicUpdatesRules() {
	return {
		"require-atomic-updates": createRuleLoader("require-atomic-updates"),
	};
}

/**
 * Builds the rule map entries for the 'require-await' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildRequireAwaitRules() {
	return {
		"require-await": createRuleLoader("require-await"),
	};
}

/**
 * Builds the rule map entries for the 'require-unicode-regexp' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildRequireUnicodeRegexpRules() {
	return {
		"require-unicode-regexp": createRuleLoader("require-unicode-regexp"),
	};
}

/**
 * Builds the rule map entries for the 'require-yield' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildRequireYieldRules() {
	return {
		"require-yield": createRuleLoader("require-yield"),
	};
}

/**
 * Builds the rule map entries for the 'rest-spread-spacing' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildRestSpreadSpacingRules() {
	return {
		"rest-spread-spacing": createRuleLoader("rest-spread-spacing"),
	};
}

/**
 * Builds the rule map entries for the 'semi' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildSemiRules() {
	return {
		semi: createRuleLoader("semi"),
		"semi-spacing": createRuleLoader("semi-spacing"),
		"semi-style": createRuleLoader("semi-style"),
	};
}

/**
 * Builds the rule map entries for the 'sort' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildSortRules() {
	return {
		"sort-imports": createRuleLoader("sort-imports"),
		"sort-keys": createRuleLoader("sort-keys"),
		"sort-vars": createRuleLoader("sort-vars"),
	};
}

/**
 * Builds the rule map entries for the 'space-before-blocks' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildSpaceBeforeBlocksRules() {
	return {
		"space-before-blocks": createRuleLoader("space-before-blocks"),
	};
}

/**
 * Builds the rule map entries for the 'space-before-function-paren' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildSpaceBeforeFunctionParenRules() {
	return {
		"space-before-function-paren": createRuleLoader("space-before-function-paren"),
	};
}

/**
 * Builds the rule map entries for the 'space-in-parens' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildSpaceInParensRules() {
	return {
		"space-in-parens": createRuleLoader("space-in-parens"),
	};
}

/**
 * Builds the rule map entries for the 'space-infix-ops' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildSpaceInfixOpsRules() {
	return {
		"space-infix-ops": createRuleLoader("space-infix-ops"),
	};
}

/**
 * Builds the rule map entries for the 'space-unary-ops' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildSpaceUnaryOpsRules() {
	return {
		"space-unary-ops": createRuleLoader("space-unary-ops"),
	};
}

/**
 * Builds the rule map entries for the 'spaced-comment' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildSpacedCommentRules() {
	return {
		"spaced-comment": createRuleLoader("spaced-comment"),
	};
}

/**
 * Builds the rule map entries for the 'strict' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildStrictRules() {
	return {
		strict: createRuleLoader("strict"),
	};
}

/**
 * Builds the rule map entries for the 'switch-colon-spacing' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildSwitchColonSpacingRules() {
	return {
		"switch-colon-spacing": createRuleLoader("switch-colon-spacing"),
	};
}

/**
 * Builds the rule map entries for the 'symbol-description' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildSymbolDescriptionRules() {
	return {
		"symbol-description": createRuleLoader("symbol-description"),
	};
}

/**
 * Builds the rule map entries for the 'template-curly-spacing' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildTemplateCurlySpacingRules() {
	return {
		"template-curly-spacing": createRuleLoader("template-curly-spacing"),
	};
}

/**
 * Builds the rule map entries for the 'template-tag-spacing' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildTemplateTagSpacingRules() {
	return {
		"template-tag-spacing": createRuleLoader("template-tag-spacing"),
	};
}

/**
 * Builds the rule map entries for the 'unicode-bom' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildUnicodeBomRules() {
	return {
		"unicode-bom": createRuleLoader("unicode-bom"),
	};
}

/**
 * Builds the rule map entries for the 'use-isnan' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildUseIsnanRules() {
	return {
		"use-isnan": createRuleLoader("use-isnan"),
	};
}

/**
 * Builds the rule map entries for the 'valid-typeof' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildValid_typeofRules() {
	return {
		"valid-typeof": createRuleLoader("valid-typeof"),
	};
}

/**
 * Builds the rule map entries for the 'vars-on-top' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildVarsOnTopRules() {
	return {
		"vars-on-top": createRuleLoader("vars-on-top"),
	};
}

/**
 * Builds the rule map entries for the 'wrap-iife' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildWrapIifeRules() {
	return {
		"wrap-iife": createRuleLoader("wrap-iife"),
	};
}

/**
 * Builds the rule map entries for the 'wrap-regex' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildWrapRegexRules() {
	return {
		"wrap-regex": createRuleLoader("wrap-regex"),
	};
}

/**
 * Builds the rule map entries for the 'yield-star-spacing' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildYieldStarSpacingRules() {
	return {
		"yield-star-spacing": createRuleLoader("yield-star-spacing"),
	};
}

/**
 * Builds the rule map entries for the 'yoda' category of rules.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildYodaRules() {
	return {
		yoda: createRuleLoader("yoda"),
	};
}

/**
 * Builds the complete rule map by combining all category rule maps.
 * @returns {Record<string, () => import("../types").Rule.RuleModule>}
 */
function buildCompleteRuleMap() {
	return {
		...buildArrayRules(),
		...buildArrowRules(),
		...buildBlockRules(),
		...buildCamelCaseRules(),
		...buildCapitalizedCommentsRules(),
		...buildClassRules(),
		...buildCommaRules(),
		...buildComputedPropertyRules(),
		...buildConstructorRules(),
		...buildCurlyRules(),
		...buildDefaultCaseRules(),
		...buildDefaultParamRules(),
		...buildDotRules(),
		...buildEolRules(),
		...buildEqeqeqRules(),
		...buildForRules(),
		...buildFuncRules(),
		...buildFunctionCallRules(),
		...buildGeneratorRules(),
		...buildGetterRules(),
		...buildGlobalRules(),
		...buildGroupedAccessorRules(),
		...buildGuardRules(),
		...buildHandleCallbackRules(),
		...buildIdRules(),
		...buildImplicitArrowRules(),
		...buildIndentRules(),
		...buildInitDeclarationsRules(),
		...buildJsxRules(),
		...buildKeySpacingRules(),
		...buildKeywordSpacingRules(),
		...buildLineCommentRules(),
		...buildLinebreakRules(),
		...buildLinesAroundRules(),
		...buildLinesBetweenClassMembersRules(),
		...buildLogicalAssignmentRules(),
		...buildMaxRules(),
		...buildMultilineRules(),
		...buildNewRules(),
		...buildNewlineAfterVarRules(),
		...buildNewlinePerChainedCallRules(),
		...buildNoAlertRules(),
		...buildNoArrayConstructorRules(),
		...buildNoAsyncPromiseExecutorRules(),
		...buildNoAwaitInLoopRules(),
		...buildNoBitwiseRules(),
		...buildNoBufferConstructorRules(),
		...buildNoCallerRules(),
		...buildNoCaseDeclarationsRules(),
		...buildNoCatchShadowRules(),
		...buildNoClassAssignRules(),
		...buildNoCompareNegZeroRules(),
		...buildNoCondAssignRules(),
		...buildNoConfusingArrowRules(),
		...buildNoConsoleRules(),
		...buildNoConstAssignRules(),
		...buildNoConstantBinaryExpressionRules(),
		...buildNoConstantConditionRules(),
		...buildNoConstructorReturnRules(),
		...buildNoContinueRules(),
		...buildNoControlRegexRules(),
		...buildNoDebuggerRules(),
		...buildNoDeleteVarRules(),
		...buildNoDivRegexRules(),
		...buildNoDupeArgsRules(),
		...buildNoDupeClassMembersRules(),
		...buildNoDupeElseIfRules(),
		...buildNoDupeKeysRules(),
		...buildNoDuplicateCaseRules(),
		...buildNoDuplicateImportsRules(),
		...buildNoElseReturnRules(),
		...buildNoEmptyRules(),
		...buildNoEqNullRules(),
		...buildNoEvalRules(),
		...buildNoExAssignRules(),
		...buildNoExtendNativeRules(),
		...buildNoExtraBindRules(),
		...buildNoExtraBooleanCastRules(),
		...buildNoExtraLabelRules(),
		...buildNoExtraParensRules(),
		...buildNoExtraSemiRules(),
		...buildNoFallthroughRules(),
		...buildNoFloatingDecimalRules(),
		...buildNoFuncAssignRules(),
		...buildNoGlobalAssignRules(),
		...buildNoImplicitCoercionRules(),
		...buildNoImplicitGlobalsRules(),
		...buildNoImpliedEvalRules(),
		...buildNoImportAssignRules(),
		...buildNoInlineCommentsRules(),
		...buildNoInnerDeclarationsRules(),
		...buildNoInvalidRegexRules(),
		...buildNoInvalidThisRules(),
		...buildNoIrregularWhitespaceRules(),
		...buildNoIteratorRules(),
		...buildNoLabelVarRules(),
		...buildNoLabelsRules(),
		...buildNoLoneBlocksRules(),
		...buildNoLonelyIfRules(),
		...buildNoLoopFuncRules(),
		...buildNoLossOfPrecisionRules(),
		...buildNoMagicNumbersRules(),
		...buildNoMisleadingCharacterClassRules(),
		...buildNoMixedOperatorsRules(),
		...buildNoMixedRequiresRules(),
		...buildNoMixedSpacesAndTabsRules(),
		...buildNoMultiAssignRules(),
		...buildNoMultiSpacesRules(),
		...buildNoMultiStrRules(),
		...buildNoMultipleEmptyLinesRules(),
		...buildNoNativeReassignRules(),
		...buildNoNegatedConditionRules(),
		...buildNoNegatedInLhsRules(),
		...buildNoNestedTernaryRules(),
		...buildNoNewRules(),
		...buildNoNonoctalDecimalEscapeRules(),
		...buildNoObjCallsRules(),
		...buildNoObjectConstructorRules(),
		...buildNoOctalRules(),
		...buildNoParamReassignRules(),
		...buildNoPathConcatRules(),
		...buildNoPlusPlusRules(),
		...buildNoProcessEnvRules(),
		...buildNoProcessExitRules(),
		...buildNoPromiseExecutorReturnRules(),
		...buildNoProtoRules(),
		...buildNoPrototypeBuiltinsRules(),
		...buildNoRedeclareRules(),
		...buildNoRegexSpacesRules(),
		...buildNoRestrictedExportsRules(),
		...buildNoRestrictedGlobalsRules(),
		...buildNoRestrictedImportsRules(),
		...buildNoRestrictedModulesRules(),
		...buildNoRestrictedPropertiesRules(),
		...buildNoRestrictedSyntaxRules(),
		...buildNoReturnAssignRules(),
		...buildNoReturnAwaitRules(),
		...buildNoScriptUrlRules(),
		...buildNoSelfAssignRules(),
		...buildNoSelfCompareRules(),
		...buildNoSequencesRules(),
		...buildNoSetterReturnRules(),
		...buildNoShadowRules(),
		...buildNoSpacedFuncRules(),
		...buildNoSparseArraysRules(),
		...buildNoSyncRules(),
		...buildNoTabsRules(),
		...buildNoTemplateCurlyInStringRules(),
		...buildNoTernaryRules(),
		...buildNoThisBeforeSuperRules(),
		...buildNoThrowLiteralRules(),
		...buildNoTrailingSpacesRules(),
		...buildNoUnassignedVarsRules(),
		...buildNoUndefRules(),
		...buildNoUnderscoreDangleRules(),
		...buildNoUnexpectedMultilineRules(),
		...buildNoUnmodifiedLoopConditionRules(),
		...buildNoUnneededTernaryRules(),
		...buildNoUnreachableRules(),
		...buildNoUnsafeFinallyRules(),
		...buildNoUnsafeNegationRules(),
		...buildNoUnsafeOptionalChainingRules(),
		...buildNoUnusedExpressionsRules(),
		...buildNoUnusedLabelsRules(),
		...buildNoUnusedPrivateClassMembersRules(),
		...buildNoUnusedVarsRules(),
		...buildNoUseBeforeDefineRules(),
		...buildNoUselessAssignmentRules(),
		...buildNoUselessBackreferenceRules(),
		...buildNoUselessCallRules(),
		...buildNoUselessCatchRules(),
		...buildNoUselessComputedKeyRules(),
		...buildNoUselessConcatRules(),
		...buildNoUselessConstructorRules(),
		...buildNoUselessEscapeRules(),
		...buildNoUselessRenameRules(),
		...buildNoUselessReturnRules(),
		...buildNoVarRules(),
		...buildNoVoidRules(),
		...buildNoWarningCommentsRules(),
		...buildNoWhitespaceBeforePropertyRules(),
		...buildNoWithRules(),
		...buildNonblockStatementBodyPositionRules(),
		...buildObjectCurlyRules(),
		...buildOneVarRules(),
		...buildOperatorAssignmentRules(),
		...buildOperatorLinebreakRules(),
		...buildPaddedBlocksRules(),
		...buildPaddingLineBetweenStatementsRules(),
		...buildPreferArrowCallbackRules(),
		...buildPreferConstRules(),
		...buildPreferDestructuringRules(),
		...buildPreferExponentiationOperatorRules(),
		...buildPreferNamedCaptureGroupRules(),
		...buildPreferNumericLiteralsRules(),
		...buildPreferObjectHasOwnRules(),
		...buildPreferObjectSpreadRules(),
		...buildPreferPromiseRejectErrorsRules(),
		...buildPreferReflectRules(),
		...buildPreferRegexLiteralsRules(),
		...buildPreferRestParamsRules(),
		...buildPreferSpreadRules(),
		...buildPreferTemplateRules(),
		...buildPreserveCaughtErrorRules(),
		...buildQuotePropsRules(),
		...buildQuotesRules(),
		...buildRadixRules(),
		...buildRequireAtomicUpdatesRules(),
		...buildRequireAwaitRules(),
		...buildRequireUnicodeRegexpRules(),
		...buildRequireYieldRules(),
		...buildRestSpreadSpacingRules(),
		...buildSemiRules(),
		...buildSortRules(),
		...buildSpaceBeforeBlocksRules(),
		...buildSpaceBeforeFunctionParenRules(),
		...buildSpaceInParensRules(),
		...buildSpaceInfixOpsRules(),
		...buildSpaceUnaryOpsRules(),
		...buildSpacedCommentRules(),
		...buildStrictRules(),
		...buildSwitchColonSpacingRules(),
		...buildSymbolDescriptionRules(),
		...buildTemplateCurlySpacingRules(),
		...buildTemplateTagSpacingRules(),
		...buildUnicodeBomRules(),
		...buildUseIsnanRules(),
		...buildValid_typeofRules(),
		...buildVarsOnTopRules(),
		...buildWrapIifeRules(),
		...buildWrapRegexRules(),
		...buildYieldStarSpacingRules(),
		...buildYodaRules(),
	};
}

module.exports = new LazyLoadingRuleMap(buildCompleteRuleMap());
```