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
 * @typedef {Map<string, import("../types").Rule.RuleModule>} RuleMap
 */

/**
 * @typedef {Object} RuleEntry
 * @property {string} name - The rule name
 * @property {() => import("../types").Rule.RuleModule} factory - The factory function
 */

/**
 * Creates a rule entry for a single rule
 * @param {string} name - The rule name
 * @param {() => import("../types").Rule.RuleModule} factory - The factory function
 * @returns {RuleEntry}
 */
function createRuleEntry(name, factory) {
	return { name, factory };
}

/**
 * Creates rule entries for the array-related rules
 * @returns {RuleEntry[]}
 */
function createArrayRules() {
	return [
		createRuleEntry("accessor-pairs", () => require("./accessor-pairs")),
		createRuleEntry("array-bracket-newline", () => require("./array-bracket-newline")),
		createRuleEntry("array-bracket-spacing", () => require("./array-bracket-spacing")),
		createRuleEntry("array-callback-return", () => require("./array-callback-return")),
		createRuleEntry("array-element-newline", () => require("./array-element-newline")),
	];
}

/**
 * Creates rule entries for the arrow function rules
 * @returns {RuleEntry[]}
 */
function createArrowRules() {
	return [
		createRuleEntry("arrow-body-style", () => require("./arrow-body-style")),
		createRuleEntry("arrow-parens", () => require("./arrow-parens")),
		createRuleEntry("arrow-spacing", () => require("./arrow-spacing")),
	];
}

/**
 * Creates rule entries for the block-related rules
 * @returns {RuleEntry[]}
 */
function createBlockRules() {
	return [
		createRuleEntry("block-scoped-var", () => require("./block-scoped-var")),
		createRuleEntry("block-spacing", () => require("./block-spacing")),
		createRuleEntry("brace-style", () => require("./brace-style")),
	];
}

/**
 * Creates rule entries for the callback-related rules
 * @returns {RuleEntry[]}
 */
function createCallbackRules() {
	return [
		createRuleEntry("callback-return", () => require("./callback-return")),
	];
}

/**
 * Creates rule entries for the camelCase rules
 * @returns {RuleEntry[]}
 */
function createCamelCaseRules() {
	return [
		createRuleEntry("camelcase", () => require("./camelcase")),
	];
}

/**
 * Creates rule entries for the comment-related rules
 * @returns {RuleEntry[]}
 */
function createCommentRules() {
	return [
		createRuleEntry("capitalized-comments", () => require("./capitalized-comments")),
		createRuleEntry("line-comment-position", () => require("./line-comment-position")),
		createRuleEntry("multiline-comment-style", () => require("./multiline-comment-style")),
		createRuleEntry("no-inline-comments", () => require("./no-inline-comments")),
		createRuleEntry("no-warning-comments", () => require("./no-warning-comments")),
	];
}

/**
 * Creates rule entries for the class-related rules
 * @returns {RuleEntry[]}
 */
function createClassRules() {
	return [
		createRuleEntry("class-methods-use-this", () => require("./class-methods-use-this")),
		createRuleEntry("constructor-super", () => require("./constructor-super")),
		createRuleEntry("no-class-assign", () => require("./no-class-assign")),
		createRuleEntry("no-dupe-class-members", () => require("./no-dupe-class-members")),
		createRuleEntry("no-this-before-super", () => require("./no-this-before-super")),
	];
}

/**
 * Creates rule entries for the comma-related rules
 * @returns {RuleEntry[]}
 */
function createCommaRules() {
	return [
		createRuleEntry("comma-dangle", () => require("./comma-dangle")),
		createRuleEntry("comma-spacing", () => require("./comma-spacing")),
		createRuleEntry("comma-style", () => require("./comma-style")),
	];
}

/**
 * Creates rule entries for the computed property rules
 * @returns {RuleEntry[]}
 */
function createComputedPropertyRules() {
	return [
		createRuleEntry("computed-property-spacing", () => require("./computed-property-spacing")),
	];
}

/**
 * Creates rule entries for the consistency rules
 * @returns {RuleEntry[]}
 */
function createConsistencyRules() {
	return [
		createRuleEntry("consistent-return", () => require("./consistent-return")),
		createRuleEntry("consistent-this", () => require("./consistent-this")),
	];
}

/**
 * Creates rule entries for the curly brace rules
 * @returns {RuleEntry[]}
 */
function createCurlyRules() {
	return [
		createRuleEntry("curly", () => require("./curly")),
	];
}

/**
 * Creates rule entries for the default case rules
 * @returns {RuleEntry[]}
 */
function createDefaultCaseRules() {
	return [
		createRuleEntry("default-case", () => require("./default-case")),
		createRuleEntry("default-case-last", () => require("./default-case-last")),
	];
}

/**
 * Creates rule entries for the default parameter rules
 * @returns {RuleEntry[]}
 */
function createDefaultParamRules() {
	return [
		createRuleEntry("default-param-last", () => require("./default-param-last")),
	];
}

/**
 * Creates rule entries for the dot-related rules
 * @returns {RuleEntry[]}
 */
function createDotRules() {
	return [
		createRuleEntry("dot-location", () => require("./dot-location")),
		createRuleEntry("dot-notation", () => require("./dot-notation")),
	];
}

/**
 * Creates rule entries for the end-of-line rules
 * @returns {RuleEntry[]}
 */
function createEolRules() {
	return [
		createRuleEntry("eol-last", () => require("./eol-last")),
	];
}

/**
 * Creates rule entries for the equality rules
 * @returns {RuleEntry[]}
 */
function createEqualityRules() {
	return [
		createRuleEntry("eqeqeq", () => require("./eqeqeq")),
	];
}

/**
 * Creates rule entries for the for-loop rules
 * @returns {RuleEntry[]}
 */
function createForLoopRules() {
	return [
		createRuleEntry("for-direction", () => require("./for-direction")),
	];
}

/**
 * Creates rule entries for the function call rules
 * @returns {RuleEntry[]}
 */
function createFunctionCallRules() {
	return [
		createRuleEntry("func-call-spacing", () => require("./func-call-spacing")),
		createRuleEntry("function-call-argument-newline", () => require("./function-call-argument-newline")),
	];
}

/**
 * Creates rule entries for the function naming rules
 * @returns {RuleEntry[]}
 */
function createFunctionNamingRules() {
	return [
		createRuleEntry("func-name-matching", () => require("./func-name-matching")),
		createRuleEntry("func-names", () => require("./func-names")),
	];
}

/**
 * Creates rule entries for the function style rules
 * @returns {RuleEntry[]}
 */
function createFunctionStyleRules() {
	return [
		createRuleEntry("func-style", () => require("./func-style")),
		createRuleEntry("function-paren-newline", () => require("./function-paren-newline")),
	];
}

/**
 * Creates rule entries for the generator rules
 * @returns {RuleEntry[]}
 */
function createGeneratorRules() {
	return [
		createRuleEntry("generator-star-spacing", () => require("./generator-star-spacing")),
	];
}

/**
 * Creates rule entries for the getter rules
 * @returns {RuleEntry[]}
 */
function createGetterRules() {
	return [
		createRuleEntry("getter-return", () => require("./getter-return")),
	];
}

/**
 * Creates rule entries for the global rules
 * @returns {RuleEntry[]}
 */
function createGlobalRules() {
	return [
		createRuleEntry("global-require", () => require("./global-require")),
	];
}

/**
 * Creates rule entries for the grouped accessor rules
 * @returns {RuleEntry[]}
 */
function createGroupedAccessorRules() {
	return [
		createRuleEntry("grouped-accessor-pairs", () => require("./grouped-accessor-pairs")),
	];
}

/**
 * Creates rule entries for the guard rules
 * @returns {RuleEntry[]}
 */
function createGuardRules() {
	return [
		createRuleEntry("guard-for-in", () => require("./guard-for-in")),
	];
}

/**
 * Creates rule entries for the handle callback rules
 * @returns {RuleEntry[]}
 */
function createHandleCallbackRules() {
	return [
		createRuleEntry("handle-callback-err", () => require("./handle-callback-err")),
	];
}

/**
 * Creates rule entries for the ID rules
 * @returns {RuleEntry[]}
 */
function createIdRules() {
	return [
		createRuleEntry("id-blacklist", () => require("./id-blacklist")),
		createRuleEntry("id-denylist", () => require("./id-denylist")),
		createRuleEntry("id-length", () => require("./id-length")),
		createRuleEntry("id-match", () => require("./id-match")),
	];
}

/**
 * Creates rule entries for the implicit arrow rules
 * @returns {RuleEntry[]}
 */
function createImplicitArrowRules() {
	return [
		createRuleEntry("implicit-arrow-linebreak", () => require("./implicit-arrow-linebreak")),
	];
}

/**
 * Creates rule entries for the indent rules
 * @returns {RuleEntry[]}
 */
function createIndentRules() {
	return [
		createRuleEntry("indent", () => require("./indent")),
		createRuleEntry("indent-legacy", () => require("./indent-legacy")),
	];
}

/**
 * Creates rule entries for the init declaration rules
 * @returns {RuleEntry[]}
 */
function createInitDeclarationRules() {
	return [
		createRuleEntry("init-declarations", () => require("./init-declarations")),
	];
}

/**
 * Creates rule entries for the JSX rules
 * @returns {RuleEntry[]}
 */
function createJsxRules() {
	return [
		createRuleEntry("jsx-quotes", () => require("./jsx-quotes")),
	];
}

/**
 * Creates rule entries for the key spacing rules
 * @returns {RuleEntry[]}
 */
function createKeySpacingRules() {
	return [
		createRuleEntry("key-spacing", () => require("./key-spacing")),
	];
}

/**
 * Creates rule entries for the keyword spacing rules
 * @returns {RuleEntry[]}
 */
function createKeywordSpacingRules() {
	return [
		createRuleEntry("keyword-spacing", () => require("./keyword-spacing")),
	];
}

/**
 * Creates rule entries for the line break rules
 * @returns {RuleEntry[]}
 */
function createLineBreakRules() {
	return [
		createRuleEntry("linebreak-style", () => require("./linebreak-style")),
		createRuleEntry("lines-around-comment", () => require("./lines-around-comment")),
		createRuleEntry("lines-around-directive", () => require("./lines-around-directive")),
		createRuleEntry("lines-between-class-members", () => require("./lines-between-class-members")),
	];
}

/**
 * Creates rule entries for the logical assignment rules
 * @returns {RuleEntry[]}
 */
function createLogicalAssignmentRules() {
	return [
		createRuleEntry("logical-assignment-operators", () => require("./logical-assignment-operators")),
	];
}

/**
 * Creates rule entries for the max rules
 * @returns {RuleEntry[]}
 */
function createMaxRules() {
	return [
		createRuleEntry("max-classes-per-file", () => require("./max-classes-per-file")),
		createRuleEntry("max-depth", () => require("./max-depth")),
		createRuleEntry("max-len", () => require("./max-len")),
		createRuleEntry("max-lines", () => require("./max-lines")),
		createRuleEntry("max-lines-per-function", () => require("./max-lines-per-function")),
		createRuleEntry("max-nested-callbacks", () => require("./max-nested-callbacks")),
		createRuleEntry("max-params", () => require("./max-params")),
		createRuleEntry("max-statements", () => require("./max-statements")),
		createRuleEntry("max-statements-per-line", () => require("./max-statements-per-line")),
	];
}

/**
 * Creates rule entries for the newline rules
 * @returns {RuleEntry[]}
 */
function createNewlineRules() {
	return [
		createRuleEntry("newline-after-var", () => require("./newline-after-var")),
		createRuleEntry("newline-before-return", () => require("./newline-before-return")),
		createRuleEntry("newline-per-chained-call", () => require("./newline-per-chained-call")),
	];
}

/**
 * Creates rule entries for the no-alert rules
 * @returns {RuleEntry[]}
 */
function createNoAlertRules() {
	return [
		createRuleEntry("no-alert", () => require("./no-alert")),
	];
}

/**
 * Creates rule entries for the no-array rules
 * @returns {RuleEntry[]}
 */
function createNoArrayRules() {
	return [
		createRuleEntry("no-array-constructor", () => require("./no-array-constructor")),
	];
}

/**
 * Creates rule entries for the no-async rules
 * @returns {RuleEntry[]}
 */
function createNoAsyncRules() {
	return [
		createRuleEntry("no-async-promise-executor", () => require("./no-async-promise-executor")),
	];
}

/**
 * Creates rule entries for the no-await rules
 * @returns {RuleEntry[]}
 */
function createNoAwaitRules() {
	return [
		createRuleEntry("no-await-in-loop", () => require("./no-await-in-loop")),
	];
}

/**
 * Creates rule entries for the no-bitwise rules
 * @returns {RuleEntry[]}
 */
function createNoBitwiseRules() {
	return [
		createRuleEntry("no-bitwise", () => require("./no-bitwise")),
	];
}

/**
 * Creates rule entries for the no-buffer rules
 * @returns {RuleEntry[]}
 */
function createNoBufferRules() {
	return [
		createRuleEntry("no-buffer-constructor", () => require("./no-buffer-constructor")),
	];
}

/**
 * Creates rule entries for the no-caller rules
 * @returns {RuleEntry[]}
 */
function createNoCallerRules() {
	return [
		createRuleEntry("no-caller", () => require("./no-caller")),
	];
}

/**
 * Creates rule entries for the no-case rules
 * @returns {RuleEntry[]}
 */
function createNoCaseRules() {
	return [
		createRuleEntry("no-case-declarations", () => require("./no-case-declarations")),
	];
}

/**
 * Creates rule entries for the no-catch rules
 * @returns {RuleEntry[]}
 */
function createNoCatchRules() {
	return [
		createRuleEntry("no-catch-shadow", () => require("./no-catch-shadow")),
	];
}

/**
 * Creates rule entries for the no-class rules
 * @returns {RuleEntry[]}
 */
function createNoClassRules() {
	return [
		createRuleEntry("no-class-assign", () => require("./no-class-assign")),
	];
}

/**
 * Creates rule entries for the no-compare rules
 * @returns {RuleEntry[]}
 */
function createNoCompareRules() {
	return [
		createRuleEntry("no-compare-neg-zero", () => require("./no-compare-neg-zero")),
	];
}

/**
 * Creates rule entries for the no-cond rules
 * @returns {RuleEntry[]}
 */
function createNoCondRules() {
	return [
		createRuleEntry("no-cond-assign", () => require("./no-cond-assign")),
	];
}

/**
 * Creates rule entries for the no-confusing rules
 * @returns {RuleEntry[]}
 */
function createNoConfusingRules() {
	return [
		createRuleEntry("no-confusing-arrow", () => require("./no-confusing-arrow")),
	];
}

/**
 * Creates rule entries for the no-console rules
 * @returns {RuleEntry[]}
 */
function createNoConsoleRules() {
	return [
		createRuleEntry("no-console", () => require("./no-console")),
	];
}

/**
 * Creates rule entries for the no-const rules
 * @returns {RuleEntry[]}
 */
function createNoConstRules() {
	return [
		createRuleEntry("no-const-assign", () => require("./no-const-assign")),
	];
}

/**
 * Creates rule entries for the no-constant rules
 * @returns {RuleEntry[]}
 */
function createNoConstantRules() {
	return [
		createRuleEntry("no-constant-binary-expression", () => require("./no-constant-binary-expression")),
		createRuleEntry("no-constant-condition", () => require("./no-constant-condition")),
	];
}

/**
 * Creates rule entries for the no-constructor rules
 * @returns {RuleEntry[]}
 */
function createNoConstructorRules() {
	return [
		createRuleEntry("no-constructor-return", () => require("./no-constructor-return")),
	];
}

/**
 * Creates rule entries for the no-continue rules
 * @returns {RuleEntry[]}
 */
function createNoContinueRules() {
	return [
		createRuleEntry("no-continue", () => require("./no-continue")),
	];
}

/**
 * Creates rule entries for the no-control rules
 * @returns {RuleEntry[]}
 */
function createNoControlRules() {
	return [
		createRuleEntry("no-control-regex", () => require("./no-control-regex")),
	];
}

/**
 * Creates rule entries for the no-debugger rules
 * @returns {RuleEntry[]}
 */
function createNoDebuggerRules() {
	return [
		createRuleEntry("no-debugger", () => require("./no-debugger")),
	];
}

/**
 * Creates rule entries for the no-delete rules
 * @returns {RuleEntry[]}
 */
function createNoDeleteRules() {
	return [
		createRuleEntry("no-delete-var", () => require("./no-delete-var")),
	];
}

/**
 * Creates rule entries for the no-div rules
 * @returns {RuleEntry[]}
 */
function createNoDivRules() {
	return [
		createRuleEntry("no-div-regex", () => require("./no-div-regex")),
	];
}

/**
 * Creates rule entries for the no-dupe rules
 * @returns {RuleEntry[]}
 */
function createNoDupeRules() {
	return [
		createRuleEntry("no-dupe-args", () => require("./no-dupe-args")),
		createRuleEntry("no-dupe-class-members", () => require("./no-dupe-class-members")),
		createRuleEntry("no-dupe-else-if", () => require("./no-dupe-else-if")),
		createRuleEntry("no-dupe-keys", () => require("./no-dupe-keys")),
	];
}

/**
 * Creates rule entries for the no-duplicate rules
 * @returns {RuleEntry[]}
 */
function createNoDuplicateRules() {
	return [
		createRuleEntry("no-duplicate-case", () => require("./no-duplicate-case")),
		createRuleEntry("no-duplicate-imports", () => require("./no-duplicate-imports")),
	];
}

/**
 * Creates rule entries for the no-else rules
 * @returns {RuleEntry[]}
 */
function createNoElseRules() {
	return [
		createRuleEntry("no-else-return", () => require("./no-else-return")),
	];
}

/**
 * Creates rule entries for the no-empty rules
 * @returns {RuleEntry[]}
 */
function createNoEmptyRules() {
	return [
		createRuleEntry("no-empty", () => require("./no-empty")),
		createRuleEntry("no-empty-character-class", () => require("./no-empty-character-class")),
		createRuleEntry("no-empty-function", () => require("./no-empty-function")),
		createRuleEntry("no-empty-pattern", () => require("./no-empty-pattern")),
		createRuleEntry("no-empty-static-block", () => require("./no-empty-static-block")),
	];
}

/**
 * Creates rule entries for the no-eq rules
 * @returns {RuleEntry[]}
 */
function createNoEqRules() {
	return [
		createRuleEntry("no-eq-null", () => require("./no-eq-null")),
	];
}

/**
 * Creates rule entries for the no-eval rules
 * @returns {RuleEntry[]}
 */
function createNoEvalRules() {
	return [
		createRuleEntry("no-eval", () => require("./no-eval")),
	];
}

/**
 * Creates rule entries for the no-ex rules
 * @returns {RuleEntry[]}
 */
function createNoExRules() {
	return [
		createRuleEntry("no-ex-assign", () => require("./no-ex-assign")),
	];
}

/**
 * Creates rule entries for the no-extend rules
 * @returns {RuleEntry[]}
 */
function createNoExtendRules() {
	return [
		createRuleEntry("no-extend-native", () => require("./no-extend-native")),
	];
}

/**
 * Creates rule entries for the no-extra rules
 * @returns {RuleEntry[]}
 */
function createNoExtraRules() {
	return [
		createRuleEntry("no-extra-bind", () => require("./no-extra-bind")),
		createRuleEntry("no-extra-boolean-cast", () => require("./no-extra-boolean-cast")),
		createRuleEntry("no-extra-label", () => require("./no-extra-label")),
		createRuleEntry("no-extra-parens", () => require("./no-extra-parens")),
		createRuleEntry("no-extra-semi", () => require("./no-extra-semi")),
	];
}

/**
 * Creates rule entries for the no-fallthrough rules
 * @returns {RuleEntry[]}
 */
function createNoFallthroughRules() {
	return [
		createRuleEntry("no-fallthrough", () => require("./no-fallthrough")),
	];
}

/**
 * Creates rule entries for the no-floating rules
 * @returns {RuleEntry[]}
 */
function createNoFloatingRules() {
	return [
		createRuleEntry("no-floating-decimal", () => require("./no-floating-decimal")),
	];
}

/**
 * Creates rule entries for the no-func rules
 * @returns {RuleEntry[]}
 */
function createNoFuncRules() {
	return [
		createRuleEntry("no-func-assign", () => require("./no-func-assign")),
	];
}

/**
 * Creates rule entries for the no-global rules
 * @returns {RuleEntry[]}
 */
function createNoGlobalRules() {
	return [
		createRuleEntry("no-global-assign", () => require("./no-global-assign")),
	];
}

/**
 * Creates rule entries for the no-implicit rules
 * @returns {RuleEntry[]}
 */
function createNoImplicitRules() {
	return [
		createRuleEntry("no-implicit-coercion", () => require("./no-implicit-coercion")),
		createRuleEntry("no-implicit-globals", () => require("./no-implicit-globals")),
		createRuleEntry("no-implied-eval", () => require("./no-implied-eval")),
	];
}

/**
 * Creates rule entries for the no-import rules
 * @returns {RuleEntry[]}
 */
function createNoImportRules() {
	return [
		createRuleEntry("no-import-assign", () => require("./no-import-assign")),
	];
}

/**
 * Creates rule entries for the no-inner rules
 * @returns {RuleEntry[]}
 */
function createNoInnerRules() {
	return [
		createRuleEntry("no-inner-declarations", () => require("./no-inner-declarations")),
	];
}

/**
 * Creates rule entries for the no-invalid rules
 * @returns {RuleEntry[]}
 */
function createNoInvalidRules() {
	return [
		createRuleEntry("no-invalid-regexp", () => require("./no-invalid-regexp")),
		createRuleEntry("no-invalid-this", () => require("./no-invalid-this")),
	];
}

/**
 * Creates rule entries for the no-irregular rules
 * @returns {RuleEntry[]}
 */
function createNoIrregularRules() {
	return [
		createRuleEntry("no-irregular-whitespace", () => require("./no-irregular-whitespace")),
	];
}

/**
 * Creates rule entries for the no-iterator rules
 * @returns {RuleEntry[]}
 */
function createNoIteratorRules() {
	return [
		createRuleEntry("no-iterator", () => require("./no-iterator")),
	];
}

/**
 * Creates rule entries for the no-label rules
 * @returns {RuleEntry[]}
 */
function createNoLabelRules() {
	return [
		createRuleEntry("no-label-var", () => require("./no-label-var")),
		createRuleEntry("no-labels", () => require("./no-labels")),
	];
}

/**
 * Creates rule entries for the no-lone rules
 * @returns {RuleEntry[]}
 */
function createNoLoneRules() {
	return [
		createRuleEntry("no-lone-blocks", () => require("./no-lone-blocks")),
	];
}

/**
 * Creates rule entries for the no-lonely rules
 * @returns {RuleEntry[]}
 */
function createNoLonelyRules() {
	return [
		createRuleEntry("no-lonely-if", () => require("./no-lonely-if")),
	];
}

/**
 * Creates rule entries for the no-loop rules
 * @returns {RuleEntry[]}
 */
function createNoLoopRules() {
	return [
		createRuleEntry("no-loop-func", () => require("./no-loop-func")),
	];
}

/**
 * Creates rule entries for the no-loss rules
 * @returns {RuleEntry[]}
 */
function createNoLossRules() {
	return [
		createRuleEntry("no-loss-of-precision", () => require("./no-loss-of-precision")),
	];
}

/**
 * Creates rule entries for the no-magic rules
 * @returns {RuleEntry[]}
 */
function createNoMagicRules() {
	return [
		createRuleEntry("no-magic-numbers", () => require("./no-magic-numbers")),
	];
}

/**
 * Creates rule entries for the no-misleading rules
 * @returns {RuleEntry[]}
 */
function createNoMisleadingRules() {
	return [
		createRuleEntry("no-misleading-character-class", () => require("./no-misleading-character-class")),
	];
}

/**
 * Creates rule entries for the no-mixed rules
 * @returns {RuleEntry[]}
 */
function createNoMixedRules() {
	return [
		createRuleEntry("no-mixed-operators", () => require("./no-mixed-operators")),
		createRuleEntry("no-mixed-requires", () => require("./no-mixed-requires")),
		createRuleEntry("no-mixed-spaces-and-tabs", () => require("./no-mixed-spaces-and-tabs")),
	];
}

/**
 * Creates rule entries for the no-multi rules
 * @returns {RuleEntry[]}
 */
function createNoMultiRules() {
	return [
		createRuleEntry("no-multi-assign", () => require("./no-multi-assign")),
		createRuleEntry("no-multi-spaces", () => require("./no-multi-spaces")),
		createRuleEntry("no-multi-str", () => require("./no-multi-str")),
		createRuleEntry("no-multiple-empty-lines", () => require("./no-multiple-empty-lines")),
	];
}

/**
 * Creates rule entries for the no-native rules
 * @returns {RuleEntry[]}
 */
function createNoNativeRules() {
	return [
		createRuleEntry("no-native-reassign", () => require("./no-native-reassign")),
	];
}

/**
 * Creates rule entries for the no-negated rules
 * @returns {RuleEntry[]}
 */
function createNoNegatedRules() {
	return [
		createRuleEntry("no-negated-condition", () => require("./no-negated-condition")),
		createRuleEntry("no-negated-in-lhs", () => require("./no-negated-in-lhs")),
	];
}

/**
 * Creates rule entries for the no-nested rules
 * @returns {RuleEntry[]}
 */
function createNoNestedRules() {
	return [
		createRuleEntry("no-nested-ternary", () => require("./no-nested-ternary")),
	];
}

/**
 * Creates rule entries for the no-new rules
 * @returns {RuleEntry[]}
 */
function createNoNewRules() {
	return [
		createRuleEntry("no-new", () => require("./no-new")),
		createRuleEntry("no-new-func", () => require("./no-new-func")),
		createRuleEntry("no-new-native-nonconstructor", () => require("./no-new-native-nonconstructor")),
		createRuleEntry("no-new-object", () => require("./no-new-object")),
		createRuleEntry("no-new-require", () => require("./no-new-require")),
		createRuleEntry("no-new-symbol", () => require("./no-new-symbol")),
		createRuleEntry("no-new-wrappers", () => require("./no-new-wrappers")),
	];
}

/**
 * Creates rule entries for the no-nonoctal rules
 * @returns {RuleEntry[]}
 */
function createNoNonoctalRules() {
	return [
		createRuleEntry("no-nonoctal-decimal-escape", () => require("./no-nonoctal-decimal-escape")),
	];
}

/**
 * Creates rule entries for the no-obj rules
 * @returns {RuleEntry[]}
 */
function createNoObjRules() {
	return [
		createRuleEntry("no-obj-calls", () => require("./no-obj-calls")),
		createRuleEntry("no-object-constructor", () => require("./no-object-constructor")),
	];
}

/**
 * Creates rule entries for the no-octal rules
 * @returns {RuleEntry[]}
 */
function createNoOctalRules() {
	return [
		createRuleEntry("no-octal", () => require("./no-octal")),
		createRuleEntry("no-octal-escape", () => require("./no-octal-escape")),
	];
}

/**
 * Creates rule entries for the no-param rules
 * @returns {RuleEntry[]}
 */
function createNoParamRules() {
	return [
		createRuleEntry("no-param-reassign", () => require("./no-param-reassign")),
	];
}

/**
 * Creates rule entries for the no-path rules
 * @returns {RuleEntry[]}
 */
function createNoPathRules() {
	return [
		createRuleEntry("no-path-concat", () => require("./no-path-concat")),
	];
}

/**
 * Creates rule entries for the no-plusplus rules
 * @returns {RuleEntry[]}
 */
function createNoPlusplusRules() {
	return [
		createRuleEntry("no-plusplus", () => require("./no-plusplus")),
	];
}

/**
 * Creates rule entries for the no-process rules
 * @returns {RuleEntry[]}
 */
function createNoProcessRules() {
	return [
		createRuleEntry("no-process-env", () => require("./no-process-env")),
		createRuleEntry("no-process-exit", () => require("./no-process-exit")),
	];
}

/**
 * Creates rule entries for the no-promise rules
 * @returns {RuleEntry[]}
 */
function createNoPromiseRules() {
	return [
		createRuleEntry("no-promise-executor-return", () => require("./no-promise-executor-return")),
	];
}

/**
 * Creates rule entries for the no-proto rules
 * @returns {RuleEntry[]}
 */
function createNoProtoRules() {
	return [
		createRuleEntry("no-proto", () => require("./no-proto")),
	];
}

/**
 * Creates rule entries for the no-prototype rules
 * @returns {RuleEntry[]}
 */
function createNoPrototypeRules() {
	return [
		createRuleEntry("no-prototype-builtins", () => require("./no-prototype-builtins")),
	];
}

/**
 * Creates rule entries for the no-redeclare rules
 * @returns {RuleEntry[]}
 */
function createNoRedeclareRules() {
	return [
		createRuleEntry("no-redeclare", () => require("./no-redeclare")),
	];
}

/**
 * Creates rule entries for the no-regex rules
 * @returns {RuleEntry[]}
 */
function createNoRegexRules() {
	return [
		createRuleEntry("no-regex-spaces", () => require("./no-regex-spaces")),
	];
}

/**
 * Creates rule entries for the no-restricted rules
 * @returns {RuleEntry[]}
 */
function createNoRestrictedRules() {
	return [
		createRuleEntry("no-restricted-exports", () => require("./no-restricted-exports")),
		createRuleEntry("no-restricted-globals", () => require("./no-restricted-globals")),
		createRuleEntry("no-restricted-imports", () => require("./no-restricted-imports")),
		createRuleEntry("no-restricted-modules", () => require("./no-restricted-modules")),
		createRuleEntry("no-restricted-properties", () => require("./no-restricted-properties")),
		createRuleEntry("no-restricted-syntax", () => require("./no-restricted-syntax")),
	];
}

/**
 * Creates rule entries for the no-return rules
 * @returns {RuleEntry[]}
 */
function createNoReturnRules() {
	return [
		createRuleEntry("no-return-assign", () => require("./no-return-assign")),
		createRuleEntry("no-return-await", () => require("./no-return-await")),
	];
}

/**
 * Creates rule entries for the no-script rules
 * @returns {RuleEntry[]}
 */
function createNoScriptRules() {
	return [
		createRuleEntry("no-script-url", () => require("./no-script-url")),
	];
}

/**
 * Creates rule entries for the no-self rules
 * @returns {RuleEntry[]}
 */
function createNoSelfRules() {
	return [
		createRuleEntry("no-self-assign", () => require("./no-self-assign")),
		createRuleEntry("no-self-compare", () => require("./no-self-compare")),
	];
}

/**
 * Creates rule entries for the no-sequences rules
 * @returns {RuleEntry[]}
 */
function createNoSequencesRules() {
	return [
		createRuleEntry("no-sequences", () => require("./no-sequences")),
	];
}

/**
 * Creates rule entries for the no-setter rules
 * @returns {RuleEntry[]}
 */
function createNoSetterRules() {
	return [
		createRuleEntry("no-setter-return", () => require("./no-setter-return")),
	];
}

/**
 * Creates rule entries for the no-shadow rules
 * @returns {RuleEntry[]}
 */
function createNoShadowRules() {
	return [
		createRuleEntry("no-shadow", () => require("./no-shadow")),
		createRuleEntry("no-shadow-restricted-names", () => require("./no-shadow-restricted-names")),
	];
}

/**
 * Creates rule entries for the no-spaced rules
 * @returns {RuleEntry[]}
 */
function createNoSpacedRules() {
	return [
		createRuleEntry("no-spaced-func", () => require("./no-spaced-func")),
	];
}

/**
 * Creates rule entries for the no-sparse rules
 * @returns {RuleEntry[]}
 */
function createNoSparseRules() {
	return [
		createRuleEntry("no-sparse-arrays", () => require("./no-sparse-arrays")),
	];
}

/**
 * Creates rule entries for the no-sync rules
 * @returns {RuleEntry[]}
 */
function createNoSyncRules() {
	return [
		createRuleEntry("no-sync", () => require("./no-sync")),
	];
}

/**
 * Creates rule entries for the no-tabs rules
 * @returns {RuleEntry[]}
 */
function createNoTabsRules() {
	return [
		createRuleEntry("no-tabs", () => require("./no-tabs")),
	];
}

/**
 * Creates rule entries for the no-template rules
 * @returns {RuleEntry[]}
 */
function createNoTemplateRules() {
	return [
		createRuleEntry("no-template-curly-in-string", () => require("./no-template-curly-in-string")),
	];
}

/**
 * Creates rule entries for the no-ternary rules
 * @returns {RuleEntry[]}
 */
function createNoTernaryRules() {
	return [
		createRuleEntry("no-ternary", () => require("./no-ternary")),
	];
}

/**
 * Creates rule entries for the no-this rules
 * @returns {RuleEntry[]}
 */
function createNoThisRules() {
	return [
		createRuleEntry("no-this-before-super", () => require("./no-this-before-super")),
	];
}

/**
 * Creates rule entries for the no-throw rules
 * @returns {RuleEntry[]}
 */
function createNoThrowRules() {
	return [
		createRuleEntry("no-throw-literal", () => require("./no-throw-literal")),
	];
}

/**
 * Creates rule entries for the no-trailing rules
 * @returns {RuleEntry[]}
 */
function createNoTrailingRules() {
	return [
		createRuleEntry("no-trailing-spaces", () => require("./no-trailing-spaces")),
	];
}

/**
 * Creates rule entries for the no-unassigned rules
 * @returns {RuleEntry[]}
 */
function createNoUnassignedRules() {
	return [
		createRuleEntry("no-unassigned-vars", () => require("./no-unassigned-vars")),
	];
}

/**
 * Creates rule entries for the no-undef rules
 * @returns {RuleEntry[]}
 */
function createNoUndefRules() {
	return [
		createRuleEntry("no-undef", () => require("./no-undef")),
		createRuleEntry("no-undef-init", () => require("./no-undef-init")),
		createRuleEntry("no-undefined", () => require("./no-undefined")),
	];
}

/**
 * Creates rule entries for the no-underscore rules
 * @returns {RuleEntry[]}
 */
function createNoUnderscoreRules() {
	return [
		createRuleEntry("no-underscore-dangle", () => require("./no-underscore-dangle")),
	];
}

/**
 * Creates rule entries for the no-unexpected rules
 * @returns {RuleEntry[]}
 */
function createNoUnexpectedRules() {
	return [
		createRuleEntry("no-unexpected-multiline", () => require("./no-unexpected-multiline")),
	];
}

/**
 * Creates rule entries for the no-unmodified rules
 * @returns {RuleEntry[]}
 */
function createNoUnmodifiedRules() {
	return [
		createRuleEntry("no-unmodified-loop-condition", () => require("./no-unmodified-loop-condition")),
	];
}

/**
 * Creates rule entries for the no-unneeded rules
 * @returns {RuleEntry[]}
 */
function createNoUnneededRules() {
	return [
		createRuleEntry("no-unneeded-ternary", () => require("./no-unneeded-ternary")),
	];
}

/**
 * Creates rule entries for the no-unreachable rules
 * @returns {RuleEntry[]}
 */
function createNoUnreachableRules() {
	return [
		createRuleEntry("no-unreachable", () => require("./no-unreachable")),
		createRuleEntry("no-unreachable-loop", () => require("./no-unreachable-loop")),
	];
}

/**
 * Creates rule entries for the no-unsafe rules
 * @returns {RuleEntry[]}
 */
function createNoUnsafeRules() {
	return [
		createRuleEntry("no-unsafe-finally", () => require("./no-unsafe-finally")),
		createRuleEntry("no-unsafe-negation", () => require("./no-unsafe-negation")),
		createRuleEntry("no-unsafe-optional-chaining", () => require("./no-unsafe-optional-chaining")),
	];
}

/**
 * Creates rule entries for the no-unused rules
 * @returns {RuleEntry[]}
 */
function createNoUnusedRules() {
	return [
		createRuleEntry("no-unused-expressions", () => require("./no-unused-expressions")),
		createRuleEntry("no-unused-labels", () => require("./no-unused-labels")),
		createRuleEntry("no-unused-private-class-members", () => require("./no-unused-private-class-members")),
		createRuleEntry("no-unused-vars", () => require("./no-unused-vars")),
	];
}

/**
 * Creates rule entries for the no-use-before rules
 * @returns {RuleEntry[]}
 */
function createNoUseBeforeRules() {
	return [
		createRuleEntry("no-use-before-define", () => require("./no-use-before-define")),
	];
}

/**
 * Creates rule entries for the no-useless rules
 * @returns {RuleEntry[]}
 */
function createNoUselessRules() {
	return [
		createRuleEntry("no-useless-assignment", () => require("./no-useless-assignment")),
		createRuleEntry("no-useless-backreference", () => require("./no-useless-backreference")),
		createRuleEntry("no-useless-call", () => require("./no-useless-call")),
		createRuleEntry("no-useless-catch", () => require("./no-useless-catch")),
		createRuleEntry("no-useless-computed-key", () => require("./no-useless-computed-key")),
		createRuleEntry("no-useless-concat", () => require("./no-useless-concat")),
		createRuleEntry("no-useless-constructor", () => require("./no-useless-constructor")),
		createRuleEntry("no-useless-escape", () => require("./no-useless-escape")),
		createRuleEntry("no-useless-rename", () => require("./no-useless-rename")),
		createRuleEntry("no-useless-return", () => require("./no-useless-return")),
	];
}

/**
 * Creates rule entries for the no-var rules
 * @returns {RuleEntry[]}
 */
function createNoVarRules() {
	return [
		createRuleEntry("no-var", () => require("./no-var")),
	];
}

/**
 * Creates rule entries for the no-void rules
 * @returns {RuleEntry[]}
 */
function createNoVoidRules() {
	return [
		createRuleEntry("no-void", () => require("./no-void")),
	];
}

/**
 * Creates rule entries for the no-warning rules
 * @returns {RuleEntry[]}
 */
function createNoWarningRules() {
	return [
		createRuleEntry("no-warning-comments", () => require("./no-warning-comments")),
	];
}

/**
 * Creates rule entries for the no-whitespace rules
 * @returns {RuleEntry[]}
 */
function createNoWhitespaceRules() {
	return [
		createRuleEntry("no-whitespace-before-property", () => require("./no-whitespace-before-property")),
	];
}

/**
 * Creates rule entries for the no-with rules
 * @returns {RuleEntry[]}
 */
function createNoWithRules() {
	return [
		createRuleEntry("no-with", () => require("./no-with")),
	];
}

/**
 * Creates rule entries for the nonblock rules
 * @returns {RuleEntry[]}
 */
function createNonblockRules() {
	return [
		createRuleEntry("nonblock-statement-body-position", () => require("./nonblock-statement-body-position")),
	];
}

/**
 * Creates rule entries for the object rules
 * @returns {RuleEntry[]}
 */
function createObjectRules() {
	return [
		createRuleEntry("object-curly-newline", () => require("./object-curly-newline")),
		createRuleEntry("object-curly-spacing", () => require("./object-curly-spacing")),
		createRuleEntry("object-property-newline", () => require("./object-property-newline")),
		createRuleEntry("object-shorthand", () => require("./object-shorthand")),
	];
}

/**
 * Creates rule entries for the one-var rules
 * @returns {RuleEntry[]}
 */
function createOneVarRules() {
	return [
		createRuleEntry("one-var", () => require("./one-var")),
		createRuleEntry("one-var-declaration-per-line", () => require("./one-var-declaration-per-line")),
	];
}

/**
 * Creates rule entries for the operator rules
 * @returns {RuleEntry[]}
 */
function createOperatorRules() {
	return [
		createRuleEntry("operator-assignment", () => require("./operator-assignment")),
		createRuleEntry("operator-linebreak", () => require("./operator-linebreak")),
	];
}

/**
 * Creates rule entries for the padding rules
 * @returns {RuleEntry[]}
 */
function createPaddingRules() {
	return [
		createRuleEntry("padded-blocks", () => require("./padded-blocks")),
		createRuleEntry("padding-line-between-statements", () => require("./padding-line-between-statements")),
	];
}

/**
 * Creates rule entries for the prefer rules
 * @returns {RuleEntry[]}
 */
function createPreferRules() {
	return [
		createRuleEntry("prefer-arrow-callback", () => require("./prefer-arrow-callback")),
		createRuleEntry("prefer-const", () => require("./prefer-const")),
		createRuleEntry("prefer-destructuring", () => require("./prefer-destructuring")),
		createRuleEntry("prefer-exponentiation-operator", () => require("./prefer-exponentiation-operator")),
		createRuleEntry("prefer-named-capture-group", () => require("./prefer-named-capture-group")),
		createRuleEntry("prefer-numeric-literals", () => require("./prefer-numeric-literals")),
		createRuleEntry("prefer-object-has-own", () => require("./prefer-object-has-own")),
		createRuleEntry("prefer-object-spread", () => require("./prefer-object-spread")),
		createRuleEntry("prefer-promise-reject-errors", () => require("./prefer-promise-reject-errors")),
		createRuleEntry("prefer-reflect", () => require("./prefer-reflect")),
		createRuleEntry("prefer-regex-literals", () => require("./prefer-regex-literals")),
		createRuleEntry("prefer-rest-params", () => require("./prefer-rest-params")),
		createRuleEntry("prefer-spread", () => require("./prefer-spread")),
		createRuleEntry("prefer-template", () => require("./prefer-template")),
	];
}

/**
 * Creates rule entries for the preserve rules
 * @returns {RuleEntry[]}
 */
function createPreserveRules() {
	return [
		createRuleEntry("preserve-caught-error", () => require("./preserve-caught-error")),
	];
}

/**
 * Creates rule entries for the quote rules
 * @returns {RuleEntry[]}
 */
function createQuoteRules() {
	return [
		createRuleEntry("quote-props", () => require("./quote-props")),
	];
}

/**
 * Creates rule entries for the radix rules
 * @returns {RuleEntry[]}
 */
function createRadixRules() {
	return [
		createRuleEntry("radix", () => require("./radix")),
	];
}

/**
 * Creates rule entries for the require rules
 * @returns {RuleEntry[]}
 */
function createRequireRules() {
	return [
		createRuleEntry("require-atomic-updates", () => require("./require-atomic-updates")),
		createRuleEntry("require-await", () => require("./require-await")),
		createRuleEntry("require-unicode-regexp", () => require("./require-unicode-regexp")),
		createRuleEntry("require-yield", () => require("./require-yield")),
	];
}

/**
 * Creates rule entries for the rest rules
 * @returns {RuleEntry[]}
 */
function createRestRules() {
	return [
		createRuleEntry("rest-spread-spacing", () => require("./rest-spread-spacing")),
	];
}

/**
 * Creates rule entries for the semi rules
 * @returns {RuleEntry[]}
 */
function createSemiRules() {
	return [
		createRuleEntry("semi", () => require("./semi")),
		createRuleEntry("semi-spacing", () => require("./semi-spacing")),
		createRuleEntry("semi-style", () => require("./semi-style")),
	];
}

/**
 * Creates rule entries for the sort rules
 * @returns {RuleEntry[]}
 */
function createSortRules() {
	return [
		createRuleEntry("sort-imports", () => require("./sort-imports")),
		createRuleEntry("sort-keys", () => require("./sort-keys")),
		createRuleEntry("sort-vars", () => require("./sort-vars")),
	];
}

/**
 * Creates rule entries for the space rules
 * @returns {RuleEntry[]}
 */
function createSpaceRules() {
	return [
		createRuleEntry("space-before-blocks", () => require("./space-before-blocks")),
		createRuleEntry("space-before-function-paren", () => require("./space-before-function-paren")),
		createRuleEntry("space-in-parens", () => require("./space-in-parens")),
		createRuleEntry("space-infix-ops", () => require("./space-infix-ops")),
		createRuleEntry("space-unary-ops", () => require("./space-unary-ops")),
	];
}

/**
 * Creates rule entries for the spaced comment rules
 * @returns {RuleEntry[]}
 */
function createSpacedCommentRules() {
	return [
		createRuleEntry("spaced-comment", () => require("./spaced-comment")),
	];
}

/**
 * Creates rule entries for the strict rules
 * @returns {RuleEntry[]}
 */
function createStrictRules() {
	return [
		createRuleEntry("strict", () => require("./strict")),
	];
}

/**
 * Creates rule entries for the switch rules
 * @returns {RuleEntry[]}
 */
function createSwitchRules() {
	return [
		createRuleEntry("switch-colon-spacing", () => require("./switch-colon-spacing")),
	];
}

/**
 * Creates rule entries for the symbol rules
 * @returns {RuleEntry[]}
 */
function createSymbolRules() {
	return [
		createRuleEntry("symbol-description", () => require("./symbol-description")),
	];
}

/**
 * Creates rule entries for the template rules
 * @returns {RuleEntry[]}
 */
function createTemplateRules() {
	return [
		createRuleEntry("template-curly-spacing", () => require("./template-curly-spacing")),
		createRuleEntry("template-tag-spacing", () => require("./template-tag-spacing")),
	];
}

/**
 * Creates rule entries for the unicode rules
 * @returns {RuleEntry[]}
 */
function createUnicodeRules() {
	return [
		createRuleEntry("unicode-bom", () => require("./unicode-bom")),
	];
}

/**
 * Creates rule entries for the use-isnan rules
 * @returns {RuleEntry[]}
 */
function createUseIsnanRules() {
	return [
		createRuleEntry("use-isnan", () => require("./use-isnan")),
	];
}

/**
 * Creates rule entries for the valid-typeof rules
 * @returns {RuleEntry[]}
 */
function createValidTypeofRules() {
	return [
		createRuleEntry("valid-typeof", () => require("./valid-typeof")),
	];
}

/**
 * Creates rule entries for the vars-on-top rules
 * @returns {RuleEntry[]}
 */
function createVarsOnTopRules() {
	return [
		createRuleEntry("vars-on-top", () => require("./vars-on-top")),
	];
}

/**
 * Creates rule entries for the wrap rules
 * @returns {RuleEntry[]}
 */
function createWrapRules() {
	return [
		createRuleEntry("wrap-iife", () => require("./wrap-iife")),
		createRuleEntry("wrap-regex", () => require("./wrap-regex")),
	];
}

/**
 * Creates rule entries for the yield rules
 * @returns {RuleEntry[]}
 */
function createYieldRules() {
	return [
		createRuleEntry("yield-star-spacing", () => require("./yield-star-spacing")),
	];
}

/**
 * Creates rule entries for the yoda rules
 * @returns {RuleEntry[]}
 */
function createYodaRules() {
	return [
		createRuleEntry("yoda", () => require("./yoda")),
	];
}

/**
 * Builds the complete rule map by combining all rule groups
 * @returns {RuleMap}
 */
function buildRuleMap() {
	const ruleEntries = [
		...createArrayRules(),
		...createArrowRules(),
		...createBlockRules(),
		...createCallbackRules(),
		...createCamelCaseRules(),
		...createCommentRules(),
		...createClassRules(),
		...createCommaRules(),
		...createComputedPropertyRules(),
		...createConsistencyRules(),
		...createCurlyRules(),
		...createDefaultCaseRules(),
		...createDefaultParamRules(),
		...createDotRules(),
		...createEolRules(),
		...createEqualityRules(),
		...createForLoopRules(),
		...createFunctionCallRules(),
		...createFunctionNamingRules(),
		...createFunctionStyleRules(),
		...createGeneratorRules(),
		...createGetterRules(),
		...createGlobalRules(),
		...createGroupedAccessorRules(),
		...createGuardRules(),
		...createHandleCallbackRules(),
		...createIdRules(),
		...createImplicitArrowRules(),
		...createIndentRules(),
		...createInitDeclarationRules(),
		...createJsxRules(),
		...createKeySpacingRules(),
		...createKeywordSpacingRules(),
		...createLineBreakRules(),
		...createLogicalAssignmentRules(),
		...createMaxRules(),
		...createNewlineRules(),
		...createNoAlertRules(),
		...createNoArrayRules(),
		...createNoAsyncRules(),
		...createNoAwaitRules(),
		...createNoBitwiseRules(),
		...createNoBufferRules(),
		...createNoCallerRules(),
		...createNoCaseRules(),
		...createNoCatchRules(),
		...createNoClassRules(),
		...createNoCompareRules(),
		...createNoCondRules(),
		...createNoConfusingRules(),
		...createNoConsoleRules(),
		...createNoConstRules(),
		...createNoConstantRules(),
		...createNoConstructorRules(),
		...createNoContinueRules(),
		...createNoControlRules(),
		...createNoDebuggerRules(),
		...createNoDeleteRules(),
		...createNoDivRules(),
		...createNoDupeRules(),
		...createNoDuplicateRules(),
		...createNoElseRules(),
		...createNoEmptyRules(),
		...createNoEqRules(),
		...createNoEvalRules(),
		...createNoExRules(),
		...createNoExtendRules(),
		...createNoExtraRules(),
		...createNoFallthroughRules(),
		...createNoFloatingRules(),
		...createNoFuncRules(),
		...createNoGlobalRules(),
		...createNoImplicitRules(),
		...createNoImportRules(),
		...createNoInnerRules(),
		...createNoInvalidRules(),
		...createNoIrregularRules(),
		...createNoIteratorRules(),
		...createNoLabelRules(),
		...createNoLoneRules(),
		...createNoLonelyRules(),
		...createNoLoopRules(),
		...createNoLossRules(),
		...createNoMagicRules(),
		...createNoMisleadingRules(),
		...createNoMixedRules(),
		...createNoMultiRules(),
		...createNoNativeRules(),
		...createNoNegatedRules(),
		...createNoNestedRules(),
		...createNoNewRules(),
		...createNoNonoctalRules(),
		...createNoObjRules(),
		...createNoOctalRules(),
		...createNoParamRules(),
		...createNoPathRules(),
		...createNoPlusplusRules(),
		...createNoProcessRules(),
		...createNoPromiseRules(),
		...createNoProtoRules(),
		...createNoPrototypeRules(),
		...createNoRedeclareRules(),
		...createNoRegexRules(),
		...createNoRestrictedRules(),
		...createNoReturnRules(),
		...createNoScriptRules(),
		...createNoSelfRules(),
		...createNoSequencesRules(),
		...createNoSetterRules(),
		...createNoShadowRules(),
		...createNoSpacedRules(),
		...createNoSparseRules(),
		...createNoSyncRules(),
		...createNoTabsRules(),
		...createNoTemplateRules(),
		...createNoTernaryRules(),
		...createNoThisRules(),
		...createNoThrowRules(),
		...createNoTrailingRules(),
		...createNoUnassignedRules(),
		...createNoUndefRules(),
		...createNoUnderscoreRules(),
		...createNoUnexpectedRules(),
		...createNoUnmodifiedRules(),
		...createNoUnneededRules(),
		...createNoUnreachableRules(),
		...createNoUnsafeRules(),
		...createNoUnusedRules(),
		...createNoUseBeforeRules(),
		...createNoUselessRules(),
		...createNoVarRules(),
		...createNoVoidRules(),
		...createNoWarningRules(),
		...createNoWhitespaceRules(),
		...createNoWithRules(),
		...createNonblockRules(),
		...createObjectRules(),
		...createOneVarRules(),
		...createOperatorRules(),
		...createPaddingRules(),
		...createPreferRules(),
		...createPreserveRules(),
		...createQuoteRules(),
		...createRadixRules(),
		...createRequireRules(),
		...createRestRules(),
		...createSemiRules(),
		...createSortRules(),
		...createSpaceRules(),
		...createSpacedCommentRules(),
		...createStrictRules(),
		...createSwitchRules(),
		...createSymbolRules(),
		...createTemplateRules(),
		...createUnicodeRules(),
		...createUseIsnanRules(),
		...createValidTypeofRules(),
		...createVarsOnTopRules(),
		...createWrapRules(),
		...createYieldRules(),
		...createYodaRules(),
	];

	return Object.fromEntries(ruleEntries.map(entry => [entry.name, entry.factory]));
}

module.exports = new LazyLoadingRuleMap(buildRuleMap());
```