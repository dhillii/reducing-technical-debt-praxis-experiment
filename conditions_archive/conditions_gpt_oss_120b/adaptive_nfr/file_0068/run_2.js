/**
 * @fileoverview Collects the built‑in rules into a map structure so that they can be imported all at once and without
 * using the file‑system directly.
 * @author Peter (Somogyvari) Metz
 */

"use strict";

/* eslint sort-keys: ["error", "asc"] -- More readable for long list */

const { LazyLoadingRuleMap } = require("./utils/lazy-loading-rule-map");

/**
 * Builds the rule map entries by delegating to individual loader functions.
 * @returns {Object<string, () => import("../types").Rule.RuleModule>}
 */
function buildRuleMapEntries() {
  const entries = getRuleLoaders();
  const map = /** @type {Object<string, () => any>} */ ({});
  for (const [key, loader] of entries) {
    map[key] = loader;
  }
  return map;
}

/**
 * Returns an array of rule keys paired with their loader functions.
 * @returns {Array<[string, () => import("../types").Rule.RuleModule]>}
 */
function getRuleLoaders() {
  return [
    ["accessor-pairs", loadAccessorPairs],
    ["array-bracket-newline", loadArrayBracketNewline],
    ["array-bracket-spacing", loadArrayBracketSpacing],
    ["array-callback-return", loadArrayCallbackReturn],
    ["array-element-newline", loadArrayElementNewline],
    ["arrow-body-style", loadArrowBodyStyle],
    ["arrow-parens", loadArrowParens],
    ["arrow-spacing", loadArrowSpacing],
    ["block-scoped-var", loadBlockScopedVar],
    ["block-spacing", loadBlockSpacing],
    ["brace-style", loadBraceStyle],
    ["callback-return", loadCallbackReturn],
    ["camelcase", loadCamelcase],
    ["capitalized-comments", loadCapitalizedComments],
    ["class-methods-use-this", loadClassMethodsUseThis],
    ["comma-dangle", loadCommaDangle],
    ["comma-spacing", loadCommaSpacing],
    ["comma-style", loadCommaStyle],
    ["complexity", loadComplexity],
    ["computed-property-spacing", loadComputedPropertySpacing],
    ["consistent-return", loadConsistentReturn],
    ["consistent-this", loadConsistentThis],
    ["constructor-super", loadConstructorSuper],
    ["curly", loadCurly],
    ["default-case", loadDefaultCase],
    ["default-case-last", loadDefaultCaseLast],
    ["default-param-last", loadDefaultParamLast],
    ["dot-location", loadDotLocation],
    ["dot-notation", loadDotNotation],
    ["eol-last", loadEolLast],
    ["eqeqeq", loadEqeqeq],
    ["for-direction", loadForDirection],
    ["func-call-spacing", loadFuncCallSpacing],
    ["func-name-matching", loadFuncNameMatching],
    ["func-names", loadFuncNames],
    ["func-style", loadFuncStyle],
    ["function-call-argument-newline", loadFunctionCallArgumentNewline],
    ["function-paren-newline", loadFunctionParenNewline],
    ["generator-star-spacing", loadGeneratorStarSpacing],
    ["getter-return", loadGetterReturn],
    ["global-require", loadGlobalRequire],
    ["grouped-accessor-pairs", loadGroupedAccessorPairs],
    ["guard-for-in", loadGuardForIn],
    ["handle-callback-err", loadHandleCallbackErr],
    ["id-blacklist", loadIdBlacklist],
    ["id-denylist", loadIdDenylist],
    ["id-length", loadIdLength],
    ["id-match", loadIdMatch],
    ["implicit-arrow-linebreak", loadImplicitArrowLinebreak],
    ["indent", loadIndent],
    ["indent-legacy", loadIndentLegacy],
    ["init-declarations", loadInitDeclarations],
    ["jsx-quotes", loadJsxQuotes],
    ["key-spacing", loadKeySpacing],
    ["keyword-spacing", loadKeywordSpacing],
    ["line-comment-position", loadLineCommentPosition],
    ["linebreak-style", loadLinebreakStyle],
    ["lines-around-comment", loadLinesAroundComment],
    ["lines-around-directive", loadLinesAroundDirective],
    ["lines-between-class-members", loadLinesBetweenClassMembers],
    ["logical-assignment-operators", loadLogicalAssignmentOperators],
    ["max-classes-per-file", loadMaxClassesPerFile],
    ["max-depth", loadMaxDepth],
    ["max-len", loadMaxLen],
    ["max-lines", loadMaxLines],
    ["max-lines-per-function", loadMaxLinesPerFunction],
    ["max-nested-callbacks", loadMaxNestedCallbacks],
    ["max-params", loadMaxParams],
    ["max-statements", loadMaxStatements],
    ["max-statements-per-line", loadMaxStatementsPerLine],
    ["multiline-comment-style", loadMultilineCommentStyle],
    ["multiline-ternary", loadMultilineTernary],
    ["new-cap", loadNewCap],
    ["new-parens", loadNewParens],
    ["newline-after-var", loadNewlineAfterVar],
    ["newline-before-return", loadNewlineBeforeReturn],
    ["newline-per-chained-call", loadNewlinePerChainedCall],
    ["no-alert", loadNoAlert],
    ["no-array-constructor", loadNoArrayConstructor],
    ["no-async-promise-executor", loadNoAsyncPromiseExecutor],
    ["no-await-in-loop", loadNoAwaitInLoop],
    ["no-bitwise", loadNoBitwise],
    ["no-buffer-constructor", loadNoBufferConstructor],
    ["no-caller", loadNoCaller],
    ["no-case-declarations", loadNoCaseDeclarations],
    ["no-catch-shadow", loadNoCatchShadow],
    ["no-class-assign", loadNoClassAssign],
    ["no-compare-neg-zero", loadNoCompareNegZero],
    ["no-cond-assign", loadNoCondAssign],
    ["no-confusing-arrow", loadNoConfusingArrow],
    ["no-console", loadNoConsole],
    ["no-const-assign", loadNoConstAssign],
    ["no-constant-binary-expression", loadNoConstantBinaryExpression],
    ["no-constant-condition", loadNoConstantCondition],
    ["no-constructor-return", loadNoConstructorReturn],
    ["no-continue", loadNoContinue],
    ["no-control-regex", loadNoControlRegex],
    ["no-debugger", loadNoDebugger],
    ["no-delete-var", loadNoDeleteVar],
    ["no-div-regex", loadNoDivRegex],
    ["no-dupe-args", loadNoDupeArgs],
    ["no-dupe-class-members", loadNoDupeClassMembers],
    ["no-dupe-else-if", loadNoDupeElseIf],
    ["no-dupe-keys", loadNoDupeKeys],
    ["no-duplicate-case", loadNoDuplicateCase],
    ["no-duplicate-imports", loadNoDuplicateImports],
    ["no-else-return", loadNoElseReturn],
    ["no-empty", loadNoEmpty],
    ["no-empty-character-class", loadNoEmptyCharacterClass],
    ["no-empty-function", loadNoEmptyFunction],
    ["no-empty-pattern", loadNoEmptyPattern],
    ["no-empty-static-block", loadNoEmptyStaticBlock],
    ["no-eq-null", loadNoEqNull],
    ["no-eval", loadNoEval],
    ["no-ex-assign", loadNoExAssign],
    ["no-extend-native", loadNoExtendNative],
    ["no-extra-bind", loadNoExtraBind],
    ["no-extra-boolean-cast", loadNoExtraBooleanCast],
    ["no-extra-label", loadNoExtraLabel],
    ["no-extra-parens", loadNoExtraParens],
    ["no-extra-semi", loadNoExtraSemi],
    ["no-fallthrough", loadNoFallthrough],
    ["no-floating-decimal", loadNoFloatingDecimal],
    ["no-func-assign", loadNoFuncAssign],
    ["no-global-assign", loadNoGlobalAssign],
    ["no-implicit-coercion", loadNoImplicitCoercion],
    ["no-implicit-globals", loadNoImplicitGlobals],
    ["no-implied-eval", loadNoImpliedEval],
    ["no-import-assign", loadNoImportAssign],
    ["no-inline-comments", loadNoInlineComments],
    ["no-inner-declarations", loadNoInnerDeclarations],
    ["no-invalid-regexp", loadNoInvalidRegexp],
    ["no-invalid-this", loadNoInvalidThis],
    ["no-irregular-whitespace", loadNoIrregularWhitespace],
    ["no-iterator", loadNoIterator],
    ["no-label-var", loadNoLabelVar],
    ["no-labels", loadNoLabels],
    ["no-lone-blocks", loadNoLoneBlocks],
    ["no-lonely-if", loadNoLonelyIf],
    ["no-loop-func", loadNoLoopFunc],
    ["no-loss-of-precision", loadNoLossOfPrecision],
    ["no-magic-numbers", loadNoMagicNumbers],
    ["no-misleading-character-class", loadNoMisleadingCharacterClass],
    ["no-mixed-operators", loadNoMixedOperators],
    ["no-mixed-requires", loadNoMixedRequires],
    ["no-mixed-spaces-and-tabs", loadNoMixedSpacesAndTabs],
    ["no-multi-assign", loadNoMultiAssign],
    ["no-multi-spaces", loadNoMultiSpaces],
    ["no-multi-str", loadNoMultiStr],
    ["no-multiple-empty-lines", loadNoMultipleEmptyLines],
    ["no-native-reassign", loadNoNativeReassign],
    ["no-negated-condition", loadNoNegatedCondition],
    ["no-negated-in-lhs", loadNoNegatedInLhs],
    ["no-nested-ternary", loadNoNestedTernary],
    ["no-new", loadNoNew],
    ["no-new-func", loadNoNewFunc],
    ["no-new-native-nonconstructor", loadNoNewNativeNonconstructor],
    ["no-new-object", loadNoNewObject],
    ["no-new-require", loadNoNewRequire],
    ["no-new-symbol", loadNoNewSymbol],
    ["no-new-wrappers", loadNoNewWrappers],
    ["no-nonoctal-decimal-escape", loadNoNonoctalDecimalEscape],
    ["no-obj-calls", loadNoObjCalls],
    ["no-object-constructor", loadNoObjectConstructor],
    ["no-octal", loadNoOctal],
    ["no-octal-escape", loadNoOctalEscape],
    ["no-param-reassign", loadNoParamReassign],
    ["no-path-concat", loadNoPathConcat],
    ["no-plusplus", loadNoPlusplus],
    ["no-process-env", loadNoProcessEnv],
    ["no-process-exit", loadNoProcessExit],
    ["no-promise-executor-return", loadNoPromiseExecutorReturn],
    ["no-proto", loadNoProto],
    ["no-prototype-builtins", loadNoPrototypeBuiltins],
    ["no-redeclare", loadNoRedeclare],
    ["no-regex-spaces", loadNoRegexSpaces],
    ["no-restricted-exports", loadNoRestrictedExports],
    ["no-restricted-globals", loadNoRestrictedGlobals],
    ["no-restricted-imports", loadNoRestrictedImports],
    ["no-restricted-modules", loadNoRestrictedModules],
    ["no-restricted-properties", loadNoRestrictedProperties],
    ["no-restricted-syntax", loadNoRestrictedSyntax],
    ["no-return-assign", loadNoReturnAssign],
    ["no-return-await", loadNoReturnAwait],
    ["no-script-url", loadNoScriptUrl],
    ["no-self-assign", loadNoSelfAssign],
    ["no-self-compare", loadNoSelfCompare],
    ["no-sequences", loadNoSequences],
    ["no-setter-return", loadNoSetterReturn],
    ["no-shadow", loadNoShadow],
    ["no-shadow-restricted-names", loadNoShadowRestrictedNames],
    ["no-spaced-func", loadNoSpacedFunc],
    ["no-sparse-arrays", loadNoSparseArrays],
    ["no-sync", loadNoSync],
    ["no-tabs", loadNoTabs],
    ["no-template-curly-in-string", loadNoTemplateCurlyInString],
    ["no-ternary", loadNoTernary],
    ["no-this-before-super", loadNoThisBeforeSuper],
    ["no-throw-literal", loadNoThrowLiteral],
    ["no-trailing-spaces", loadNoTrailingSpaces],
    ["no-unassigned-vars", loadNoUnassignedVars],
    ["no-undef", loadNoUndef],
    ["no-undef-init", loadNoUndefInit],
    ["no-undefined", loadNoUndefined],
    ["no-underscore-dangle", loadNoUnderscoreDangle],
    ["no-unexpected-multiline", loadNoUnexpectedMultiline],
    ["no-unmodified-loop-condition", loadNoUnmodifiedLoopCondition],
    ["no-unneeded-ternary", loadNoUnneededTernary],
    ["no-unreachable", loadNoUnreachable],
    ["no-unreachable-loop", loadNoUnreachableLoop],
    ["no-unsafe-finally", loadNoUnsafeFinally],
    ["no-unsafe-negation", loadNoUnsafeNegation],
    ["no-unsafe-optional-chaining", loadNoUnsafeOptionalChaining],
    ["no-unused-expressions", loadNoUnusedExpressions],
    ["no-unused-labels", loadNoUnusedLabels],
    ["no-unused-private-class-members", loadNoUnusedPrivateClassMembers],
    ["no-unused-vars", loadNoUnusedVars],
    ["no-use-before-define", loadNoUseBeforeDefine],
    ["no-useless-assignment", loadNoUselessAssignment],
    ["no-useless-backreference", loadNoUselessBackreference],
    ["no-useless-call", loadNoUselessCall],
    ["no-useless-catch", loadNoUselessCatch],
    ["no-useless-computed-key", loadNoUselessComputedKey],
    ["no-useless-concat", loadNoUselessConcat],
    ["no-useless-constructor", loadNoUselessConstructor],
    ["no-useless-escape", loadNoUselessEscape],
    ["no-useless-rename", loadNoUselessRename],
    ["no-useless-return", loadNoUselessReturn],
    ["no-var", loadNoVar],
    ["no-void", loadNoVoid],
    ["no-warning-comments", loadNoWarningComments],
    ["no-whitespace-before-property", loadNoWhitespaceBeforeProperty],
    ["no-with", loadNoWith],
    ["nonblock-statement-body-position", loadNonblockStatementBodyPosition],
    ["object-curly-newline", loadObjectCurlyNewline],
    ["object-curly-spacing", loadObjectCurlySpacing],
    ["object-property-newline", loadObjectPropertyNewline],
    ["object-shorthand", loadObjectShorthand],
    ["one-var", loadOneVar],
    ["one-var-declaration-per-line", loadOneVarDeclarationPerLine],
    ["operator-assignment", loadOperatorAssignment],
    ["operator-linebreak", loadOperatorLinebreak],
    ["padded-blocks", loadPaddedBlocks],
    ["padding-line-between-statements", loadPaddingLineBetweenStatements],
    ["prefer-arrow-callback", loadPreferArrowCallback],
    ["prefer-const", loadPreferConst],
    ["prefer-destructuring", loadPreferDestructuring],
    ["prefer-exponentiation-operator", loadPreferExponentiationOperator],
    ["prefer-named-capture-group", loadPreferNamedCaptureGroup],
    ["prefer-numeric-literals", loadPreferNumericLiterals],
    ["prefer-object-has-own", loadPreferObjectHasOwn],
    ["prefer-object-spread", loadPreferObjectSpread],
    ["prefer-promise-reject-errors", loadPreferPromiseRejectErrors],
    ["prefer-reflect", loadPreferReflect],
    ["prefer-regex-literals", loadPreferRegexLiterals],
    ["prefer-rest-params", loadPreferRestParams],
    ["prefer-spread", loadPreferSpread],
    ["prefer-template", loadPreferTemplate],
    ["preserve-caught-error", loadPreserveCaughtError],
    ["quote-props", loadQuoteProps],
    ["quotes", loadQuotes],
    ["radix", loadRadix],
    ["require-atomic-updates", loadRequireAtomicUpdates],
    ["require-await", loadRequireAwait],
    ["require-unicode-regexp", loadRequireUnicodeRegexp],
    ["require-yield", loadRequireYield],
    ["rest-spread-spacing", loadRestSpreadSpacing],
    ["semi", loadSemi],
    ["semi-spacing", loadSemiSpacing],
    ["semi-style", loadSemiStyle],
    ["sort-imports", loadSortImports],
    ["sort-keys", loadSortKeys],
    ["sort-vars", loadSortVars],
    ["space-before-blocks", loadSpaceBeforeBlocks],
    ["space-before-function-paren", loadSpaceBeforeFunctionParen],
    ["space-in-parens", loadSpaceInParens],
    ["space-infix-ops", loadSpaceInfixOps],
    ["space-unary-ops", loadSpaceUnaryOps],
    ["spaced-comment", loadSpacedComment],
    ["strict", loadStrict],
    ["switch-colon-spacing", loadSwitchColonSpacing],
    ["symbol-description", loadSymbolDescription],
    ["template-curly-spacing", loadTemplateCurlySpacing],
    ["template-tag-spacing", loadTemplateTagSpacing],
    ["unicode-bom", loadUnicodeBom],
    ["use-isnan", loadUseIsnan],
    ["valid-typeof", loadValidTypeof],
    ["vars-on-top", loadVarsOnTop],
    ["wrap-iife", loadWrapIife],
    ["wrap-regex", loadWrapRegex],
    ["yield-star-spacing", loadYieldStarSpacing],
    ["yoda", loadYoda],
  ];
}

/* -------------------------------------------------------------------------- */
/* Loader functions – each returns the rule module lazily.                    */
/* -------------------------------------------------------------------------- */

/**
 * Loads the `accessor-pairs` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadAccessorPairs() {
  return require("./accessor-pairs");
}

/**
 * Loads the `array-bracket-newline` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadArrayBracketNewline() {
  return require("./array-bracket-newline");
}

/**
 * Loads the `array-bracket-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadArrayBracketSpacing() {
  return require("./array-bracket-spacing");
}

/**
 * Loads the `array-callback-return` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadArrayCallbackReturn() {
  return require("./array-callback-return");
}

/**
 * Loads the `array-element-newline` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadArrayElementNewline() {
  return require("./array-element-newline");
}

/**
 * Loads the `arrow-body-style` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadArrowBodyStyle() {
  return require("./arrow-body-style");
}

/**
 * Loads the `arrow-parens` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadArrowParens() {
  return require("./arrow-parens");
}

/**
 * Loads the `arrow-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadArrowSpacing() {
  return require("./arrow-spacing");
}

/**
 * Loads the `block-scoped-var` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadBlockScopedVar() {
  return require("./block-scoped-var");
}

/**
 * Loads the `block-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadBlockSpacing() {
  return require("./block-spacing");
}

/**
 * Loads the `brace-style` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadBraceStyle() {
  return require("./brace-style");
}

/**
 * Loads the `callback-return` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadCallbackReturn() {
  return require("./callback-return");
}

/**
 * Loads the `camelcase` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadCamelcase() {
  return require("./camelcase");
}

/**
 * Loads the `capitalized-comments` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadCapitalizedComments() {
  return require("./capitalized-comments");
}

/**
 * Loads the `class-methods-use-this` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadClassMethodsUseThis() {
  return require("./class-methods-use-this");
}

/**
 * Loads the `comma-dangle` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadCommaDangle() {
  return require("./comma-dangle");
}

/**
 * Loads the `comma-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadCommaSpacing() {
  return require("./comma-spacing");
}

/**
 * Loads the `comma-style` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadCommaStyle() {
  return require("./comma-style");
}

/**
 * Loads the `complexity` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadComplexity() {
  return require("./complexity");
}

/**
 * Loads the `computed-property-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadComputedPropertySpacing() {
  return require("./computed-property-spacing");
}

/**
 * Loads the `consistent-return` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadConsistentReturn() {
  return require("./consistent-return");
}

/**
 * Loads the `consistent-this` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadConsistentThis() {
  return require("./consistent-this");
}

/**
 * Loads the `constructor-super` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadConstructorSuper() {
  return require("./constructor-super");
}

/**
 * Loads the `curly` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadCurly() {
  return require("./curly");
}

/**
 * Loads the `default-case` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadDefaultCase() {
  return require("./default-case");
}

/**
 * Loads the `default-case-last` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadDefaultCaseLast() {
  return require("./default-case-last");
}

/**
 * Loads the `default-param-last` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadDefaultParamLast() {
  return require("./default-param-last");
}

/**
 * Loads the `dot-location` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadDotLocation() {
  return require("./dot-location");
}

/**
 * Loads the `dot-notation` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadDotNotation() {
  return require("./dot-notation");
}

/**
 * Loads the `eol-last` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadEolLast() {
  return require("./eol-last");
}

/**
 * Loads the `eqeqeq` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadEqeqeq() {
  return require("./eqeqeq");
}

/**
 * Loads the `for-direction` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadForDirection() {
  return require("./for-direction");
}

/**
 * Loads the `func-call-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadFuncCallSpacing() {
  return require("./func-call-spacing");
}

/**
 * Loads the `func-name-matching` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadFuncNameMatching() {
  return require("./func-name-matching");
}

/**
 * Loads the `func-names` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadFuncNames() {
  return require("./func-names");
}

/**
 * Loads the `func-style` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadFuncStyle() {
  return require("./func-style");
}

/**
 * Loads the `function-call-argument-newline` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadFunctionCallArgumentNewline() {
  return require("./function-call-argument-newline");
}

/**
 * Loads the `function-paren-newline` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadFunctionParenNewline() {
  return require("./function-paren-newline");
}

/**
 * Loads the `generator-star-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadGeneratorStarSpacing() {
  return require("./generator-star-spacing");
}

/**
 * Loads the `getter-return` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadGetterReturn() {
  return require("./getter-return");
}

/**
 * Loads the `global-require` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadGlobalRequire() {
  return require("./global-require");
}

/**
 * Loads the `grouped-accessor-pairs` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadGroupedAccessorPairs() {
  return require("./grouped-accessor-pairs");
}

/**
 * Loads the `guard-for-in` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadGuardForIn() {
  return require("./guard-for-in");
}

/**
 * Loads the `handle-callback-err` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadHandleCallbackErr() {
  return require("./handle-callback-err");
}

/**
 * Loads the `id-blacklist` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadIdBlacklist() {
  return require("./id-blacklist");
}

/**
 * Loads the `id-denylist` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadIdDenylist() {
  return require("./id-denylist");
}

/**
 * Loads the `id-length` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadIdLength() {
  return require("./id-length");
}

/**
 * Loads the `id-match` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadIdMatch() {
  return require("./id-match");
}

/**
 * Loads the `implicit-arrow-linebreak` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadImplicitArrowLinebreak() {
  return require("./implicit-arrow-linebreak");
}

/**
 * Loads the `indent` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadIndent() {
  return require("./indent");
}

/**
 * Loads the `indent-legacy` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadIndentLegacy() {
  return require("./indent-legacy");
}

/**
 * Loads the `init-declarations` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadInitDeclarations() {
  return require("./init-declarations");
}

/**
 * Loads the `jsx-quotes` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadJsxQuotes() {
  return require("./jsx-quotes");
}

/**
 * Loads the `key-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadKeySpacing() {
  return require("./key-spacing");
}

/**
 * Loads the `keyword-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadKeywordSpacing() {
  return require("./keyword-spacing");
}

/**
 * Loads the `line-comment-position` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadLineCommentPosition() {
  return require("./line-comment-position");
}

/**
 * Loads the `linebreak-style` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadLinebreakStyle() {
  return require("./linebreak-style");
}

/**
 * Loads the `lines-around-comment` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadLinesAroundComment() {
  return require("./lines-around-comment");
}

/**
 * Loads the `lines-around-directive` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadLinesAroundDirective() {
  return require("./lines-around-directive");
}

/**
 * Loads the `lines-between-class-members` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadLinesBetweenClassMembers() {
  return require("./lines-between-class-members");
}

/**
 * Loads the `logical-assignment-operators` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadLogicalAssignmentOperators() {
  return require("./logical-assignment-operators");
}

/**
 * Loads the `max-classes-per-file` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadMaxClassesPerFile() {
  return require("./max-classes-per-file");
}

/**
 * Loads the `max-depth` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadMaxDepth() {
  return require("./max-depth");
}

/**
 * Loads the `max-len` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadMaxLen() {
  return require("./max-len");
}

/**
 * Loads the `max-lines` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadMaxLines() {
  return require("./max-lines");
}

/**
 * Loads the `max-lines-per-function` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadMaxLinesPerFunction() {
  return require("./max-lines-per-function");
}

/**
 * Loads the `max-nested-callbacks` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadMaxNestedCallbacks() {
  return require("./max-nested-callbacks");
}

/**
 * Loads the `max-params` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadMaxParams() {
  return require("./max-params");
}

/**
 * Loads the `max-statements` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadMaxStatements() {
  return require("./max-statements");
}

/**
 * Loads the `max-statements-per-line` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadMaxStatementsPerLine() {
  return require("./max-statements-per-line");
}

/**
 * Loads the `multiline-comment-style` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadMultilineCommentStyle() {
  return require("./multiline-comment-style");
}

/**
 * Loads the `multiline-ternary` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadMultilineTernary() {
  return require("./multiline-ternary");
}

/**
 * Loads the `new-cap` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNewCap() {
  return require("./new-cap");
}

/**
 * Loads the `new-parens` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNewParens() {
  return require("./new-parens");
}

/**
 * Loads the `newline-after-var` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNewlineAfterVar() {
  return require("./newline-after-var");
}

/**
 * Loads the `newline-before-return` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNewlineBeforeReturn() {
  return require("./newline-before-return");
}

/**
 * Loads the `newline-per-chained-call` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNewlinePerChainedCall() {
  return require("./newline-per-chained-call");
}

/**
 * Loads the `no-alert` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoAlert() {
  return require("./no-alert");
}

/**
 * Loads the `no-array-constructor` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoArrayConstructor() {
  return require("./no-array-constructor");
}

/**
 * Loads the `no-async-promise-executor` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoAsyncPromiseExecutor() {
  return require("./no-async-promise-executor");
}

/**
 * Loads the `no-await-in-loop` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoAwaitInLoop() {
  return require("./no-await-in-loop");
}

/**
 * Loads the `no-bitwise` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoBitwise() {
  return require("./no-bitwise");
}

/**
 * Loads the `no-buffer-constructor` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoBufferConstructor() {
  return require("./no-buffer-constructor");
}

/**
 * Loads the `no-caller` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoCaller() {
  return require("./no-caller");
}

/**
 * Loads the `no-case-declarations` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoCaseDeclarations() {
  return require("./no-case-declarations");
}

/**
 * Loads the `no-catch-shadow` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoCatchShadow() {
  return require("./no-catch-shadow");
}

/**
 * Loads the `no-class-assign` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoClassAssign() {
  return require("./no-class-assign");
}

/**
 * Loads the `no-compare-neg-zero` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoCompareNegZero() {
  return require("./no-compare-neg-zero");
}

/**
 * Loads the `no-cond-assign` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoCondAssign() {
  return require("./no-cond-assign");
}

/**
 * Loads the `no-confusing-arrow` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoConfusingArrow() {
  return require("./no-confusing-arrow");
}

/**
 * Loads the `no-console` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoConsole() {
  return require("./no-console");
}

/**
 * Loads the `no-const-assign` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoConstAssign() {
  return require("./no-const-assign");
}

/**
 * Loads the `no-constant-binary-expression` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoConstantBinaryExpression() {
  return require("./no-constant-binary-expression");
}

/**
 * Loads the `no-constant-condition` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoConstantCondition() {
  return require("./no-constant-condition");
}

/**
 * Loads the `no-constructor-return` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoConstructorReturn() {
  return require("./no-constructor-return");
}

/**
 * Loads the `no-continue` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoContinue() {
  return require("./no-continue");
}

/**
 * Loads the `no-control-regex` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoControlRegex() {
  return require("./no-control-regex");
}

/**
 * Loads the `no-debugger` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoDebugger() {
  return require("./no-debugger");
}

/**
 * Loads the `no-delete-var` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoDeleteVar() {
  return require("./no-delete-var");
}

/**
 * Loads the `no-div-regex` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoDivRegex() {
  return require("./no-div-regex");
}

/**
 * Loads the `no-dupe-args` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoDupeArgs() {
  return require("./no-dupe-args");
}

/**
 * Loads the `no-dupe-class-members` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoDupeClassMembers() {
  return require("./no-dupe-class-members");
}

/**
 * Loads the `no-dupe-else-if` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoDupeElseIf() {
  return require("./no-dupe-else-if");
}

/**
 * Loads the `no-dupe-keys` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoDupeKeys() {
  return require("./no-dupe-keys");
}

/**
 * Loads the `no-duplicate-case` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoDuplicateCase() {
  return require("./no-duplicate-case");
}

/**
 * Loads the `no-duplicate-imports` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoDuplicateImports() {
  return require("./no-duplicate-imports");
}

/**
 * Loads the `no-else-return` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoElseReturn() {
  return require("./no-else-return");
}

/**
 * Loads the `no-empty` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoEmpty() {
  return require("./no-empty");
}

/**
 * Loads the `no-empty-character-class` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoEmptyCharacterClass() {
  return require("./no-empty-character-class");
}

/**
 * Loads the `no-empty-function` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoEmptyFunction() {
  return require("./no-empty-function");
}

/**
 * Loads the `no-empty-pattern` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoEmptyPattern() {
  return require("./no-empty-pattern");
}

/**
 * Loads the `no-empty-static-block` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoEmptyStaticBlock() {
  return require("./no-empty-static-block");
}

/**
 * Loads the `no-eq-null` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoEqNull() {
  return require("./no-eq-null");
}

/**
 * Loads the `no-eval` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoEval() {
  return require("./no-eval");
}

/**
 * Loads the `no-ex-assign` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoExAssign() {
  return require("./no-ex-assign");
}

/**
 * Loads the `no-extend-native` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoExtendNative() {
  return require("./no-extend-native");
}

/**
 * Loads the `no-extra-bind` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoExtraBind() {
  return require("./no-extra-bind");
}

/**
 * Loads the `no-extra-boolean-cast` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoExtraBooleanCast() {
  return require("./no-extra-boolean-cast");
}

/**
 * Loads the `no-extra-label` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoExtraLabel() {
  return require("./no-extra-label");
}

/**
 * Loads the `no-extra-parens` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoExtraParens() {
  return require("./no-extra-parens");
}

/**
 * Loads the `no-extra-semi` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoExtraSemi() {
  return require("./no-extra-semi");
}

/**
 * Loads the `no-fallthrough` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoFallthrough() {
  return require("./no-fallthrough");
}

/**
 * Loads the `no-floating-decimal` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoFloatingDecimal() {
  return require("./no-floating-decimal");
}

/**
 * Loads the `no-func-assign` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoFuncAssign() {
  return require("./no-func-assign");
}

/**
 * Loads the `no-global-assign` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoGlobalAssign() {
  return require("./no-global-assign");
}

/**
 * Loads the `no-implicit-coercion` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoImplicitCoercion() {
  return require("./no-implicit-coercion");
}

/**
 * Loads the `no-implicit-globals` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoImplicitGlobals() {
  return require("./no-implicit-globals");
}

/**
 * Loads the `no-implied-eval` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoImpliedEval() {
  return require("./no-implied-eval");
}

/**
 * Loads the `no-import-assign` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoImportAssign() {
  return require("./no-import-assign");
}

/**
 * Loads the `no-inline-comments` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoInlineComments() {
  return require("./no-inline-comments");
}

/**
 * Loads the `no-inner-declarations` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoInnerDeclarations() {
  return require("./no-inner-declarations");
}

/**
 * Loads the `no-invalid-regexp` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoInvalidRegexp() {
  return require("./no-invalid-regexp");
}

/**
 * Loads the `no-invalid-this` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoInvalidThis() {
  return require("./no-invalid-this");
}

/**
 * Loads the `no-irregular-whitespace` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoIrregularWhitespace() {
  return require("./no-irregular-whitespace");
}

/**
 * Loads the `no-iterator` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoIterator() {
  return require("./no-iterator");
}

/**
 * Loads the `no-label-var` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoLabelVar() {
  return require("./no-label-var");
}

/**
 * Loads the `no-labels` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoLabels() {
  return require("./no-labels");
}

/**
 * Loads the `no-lone-blocks` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoLoneBlocks() {
  return require("./no-lone-blocks");
}

/**
 * Loads the `no-lonely-if` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoLonelyIf() {
  return require("./no-lonely-if");
}

/**
 * Loads the `no-loop-func` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoLoopFunc() {
  return require("./no-loop-func");
}

/**
 * Loads the `no-loss-of-precision` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoLossOfPrecision() {
  return require("./no-loss-of-precision");
}

/**
 * Loads the `no-magic-numbers` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoMagicNumbers() {
  return require("./no-magic-numbers");
}

/**
 * Loads the `no-misleading-character-class` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoMisleadingCharacterClass() {
  return require("./no-misleading-character-class");
}

/**
 * Loads the `no-mixed-operators` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoMixedOperators() {
  return require("./no-mixed-operators");
}

/**
 * Loads the `no-mixed-requires` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoMixedRequires() {
  return require("./no-mixed-requires");
}

/**
 * Loads the `no-mixed-spaces-and-tabs` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoMixedSpacesAndTabs() {
  return require("./no-mixed-spaces-and-tabs");
}

/**
 * Loads the `no-multi-assign` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoMultiAssign() {
  return require("./no-multi-assign");
}

/**
 * Loads the `no-multi-spaces` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoMultiSpaces() {
  return require("./no-multi-spaces");
}

/**
 * Loads the `no-multi-str` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoMultiStr() {
  return require("./no-multi-str");
}

/**
 * Loads the `no-multiple-empty-lines` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoMultipleEmptyLines() {
  return require("./no-multiple-empty-lines");
}

/**
 * Loads the `no-native-reassign` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoNativeReassign() {
  return require("./no-native-reassign");
}

/**
 * Loads the `no-negated-condition` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoNegatedCondition() {
  return require("./no-negated-condition");
}

/**
 * Loads the `no-negated-in-lhs` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoNegatedInLhs() {
  return require("./no-negated-in-lhs");
}

/**
 * Loads the `no-nested-ternary` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoNestedTernary() {
  return require("./no-nested-ternary");
}

/**
 * Loads the `no-new` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoNew() {
  return require("./no-new");
}

/**
 * Loads the `no-new-func` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoNewFunc() {
  return require("./no-new-func");
}

/**
 * Loads the `no-new-native-nonconstructor` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoNewNativeNonconstructor() {
  return require("./no-new-native-nonconstructor");
}

/**
 * Loads the `no-new-object` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoNewObject() {
  return require("./no-new-object");
}

/**
 * Loads the `no-new-require` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoNewRequire() {
  return require("./no-new-require");
}

/**
 * Loads the `no-new-symbol` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoNewSymbol() {
  return require("./no-new-symbol");
}

/**
 * Loads the `no-new-wrappers` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoNewWrappers() {
  return require("./no-new-wrappers");
}

/**
 * Loads the `no-nonoctal-decimal-escape` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoNonoctalDecimalEscape() {
  return require("./no-nonoctal-decimal-escape");
}

/**
 * Loads the `no-obj-calls` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoObjCalls() {
  return require("./no-obj-calls");
}

/**
 * Loads the `no-object-constructor` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoObjectConstructor() {
  return require("./no-object-constructor");
}

/**
 * Loads the `no-octal` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoOctal() {
  return require("./no-octal");
}

/**
 * Loads the `no-octal-escape` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoOctalEscape() {
  return require("./no-octal-escape");
}

/**
 * Loads the `no-param-reassign` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoParamReassign() {
  return require("./no-param-reassign");
}

/**
 * Loads the `no-path-concat` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoPathConcat() {
  return require("./no-path-concat");
}

/**
 * Loads the `no-plusplus` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoPlusplus() {
  return require("./no-plusplus");
}

/**
 * Loads the `no-process-env` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoProcessEnv() {
  return require("./no-process-env");
}

/**
 * Loads the `no-process-exit` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoProcessExit() {
  return require("./no-process-exit");
}

/**
 * Loads the `no-promise-executor-return` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoPromiseExecutorReturn() {
  return require("./no-promise-executor-return");
}

/**
 * Loads the `no-proto` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoProto() {
  return require("./no-proto");
}

/**
 * Loads the `no-prototype-builtins` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoPrototypeBuiltins() {
  return require("./no-prototype-builtins");
}

/**
 * Loads the `no-redeclare` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoRedeclare() {
  return require("./no-redeclare");
}

/**
 * Loads the `no-regex-spaces` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoRegexSpaces() {
  return require("./no-regex-spaces");
}

/**
 * Loads the `no-restricted-exports` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoRestrictedExports() {
  return require("./no-restricted-exports");
}

/**
 * Loads the `no-restricted-globals` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoRestrictedGlobals() {
  return require("./no-restricted-globals");
}

/**
 * Loads the `no-restricted-imports` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoRestrictedImports() {
  return require("./no-restricted-imports");
}

/**
 * Loads the `no-restricted-modules` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoRestrictedModules() {
  return require("./no-restricted-modules");
}

/**
 * Loads the `no-restricted-properties` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoRestrictedProperties() {
  return require("./no-restricted-properties");
}

/**
 * Loads the `no-restricted-syntax` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoRestrictedSyntax() {
  return require("./no-restricted-syntax");
}

/**
 * Loads the `no-return-assign` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoReturnAssign() {
  return require("./no-return-assign");
}

/**
 * Loads the `no-return-await` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoReturnAwait() {
  return require("./no-return-await");
}

/**
 * Loads the `no-script-url` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoScriptUrl() {
  return require("./no-script-url");
}

/**
 * Loads the `no-self-assign` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoSelfAssign() {
  return require("./no-self-assign");
}

/**
 * Loads the `no-self-compare` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoSelfCompare() {
  return require("./no-self-compare");
}

/**
 * Loads the `no-sequences` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoSequences() {
  return require("./no-sequences");
}

/**
 * Loads the `no-setter-return` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoSetterReturn() {
  return require("./no-setter-return");
}

/**
 * Loads the `no-shadow` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoShadow() {
  return require("./no-shadow");
}

/**
 * Loads the `no-shadow-restricted-names` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoShadowRestrictedNames() {
  return require("./no-shadow-restricted-names");
}

/**
 * Loads the `no-spaced-func` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoSpacedFunc() {
  return require("./no-spaced-func");
}

/**
 * Loads the `no-sparse-arrays` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoSparseArrays() {
  return require("./no-sparse-arrays");
}

/**
 * Loads the `no-sync` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoSync() {
  return require("./no-sync");
}

/**
 * Loads the `no-tabs` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoTabs() {
  return require("./no-tabs");
}

/**
 * Loads the `no-template-curly-in-string` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoTemplateCurlyInString() {
  return require("./no-template-curly-in-string");
}

/**
 * Loads the `no-ternary` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoTernary() {
  return require("./no-ternary");
}

/**
 * Loads the `no-this-before-super` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoThisBeforeSuper() {
  return require("./no-this-before-super");
}

/**
 * Loads the `no-throw-literal` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoThrowLiteral() {
  return require("./no-throw-literal");
}

/**
 * Loads the `no-trailing-spaces` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoTrailingSpaces() {
  return require("./no-trailing-spaces");
}

/**
 * Loads the `no-unassigned-vars` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnassignedVars() {
  return require("./no-unassigned-vars");
}

/**
 * Loads the `no-undef` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUndef() {
  return require("./no-undef");
}

/**
 * Loads the `no-undef-init` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUndefInit() {
  return require("./no-undef-init");
}

/**
 * Loads the `no-undefined` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUndefined() {
  return require("./no-undefined");
}

/**
 * Loads the `no-underscore-dangle` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnderscoreDangle() {
  return require("./no-underscore-dangle");
}

/**
 * Loads the `no-unexpected-multiline` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnexpectedMultiline() {
  return require("./no-unexpected-multiline");
}

/**
 * Loads the `no-unmodified-loop-condition` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnmodifiedLoopCondition() {
  return require("./no-unmodified-loop-condition");
}

/**
 * Loads the `no-unneeded-ternary` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnneededTernary() {
  return require("./no-unneeded-ternary");
}

/**
 * Loads the `no-unreachable` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnreachable() {
  return require("./no-unreachable");
}

/**
 * Loads the `no-unreachable-loop` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnreachableLoop() {
  return require("./no-unreachable-loop");
}

/**
 * Loads the `no-unsafe-finally` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnsafeFinally() {
  return require("./no-unsafe-finally");
}

/**
 * Loads the `no-unsafe-negation` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnsafeNegation() {
  return require("./no-unsafe-negation");
}

/**
 * Loads the `no-unsafe-optional-chaining` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnsafeOptionalChaining() {
  return require("./no-unsafe-optional-chaining");
}

/**
 * Loads the `no-unused-expressions` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnusedExpressions() {
  return require("./no-unused-expressions");
}

/**
 * Loads the `no-unused-labels` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnusedLabels() {
  return require("./no-unused-labels");
}

/**
 * Loads the `no-unused-private-class-members` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnusedPrivateClassMembers() {
  return require("./no-unused-private-class-members");
}

/**
 * Loads the `no-unused-vars` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUnusedVars() {
  return require("./no-unused-vars");
}

/**
 * Loads the `no-use-before-define` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUseBeforeDefine() {
  return require("./no-use-before-define");
}

/**
 * Loads the `no-useless-assignment` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUselessAssignment() {
  return require("./no-useless-assignment");
}

/**
 * Loads the `no-useless-backreference` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUselessBackreference() {
  return require("./no-useless-backreference");
}

/**
 * Loads the `no-useless-call` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUselessCall() {
  return require("./no-useless-call");
}

/**
 * Loads the `no-useless-catch` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUselessCatch() {
  return require("./no-useless-catch");
}

/**
 * Loads the `no-useless-computed-key` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUselessComputedKey() {
  return require("./no-useless-computed-key");
}

/**
 * Loads the `no-useless-concat` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUselessConcat() {
  return require("./no-useless-concat");
}

/**
 * Loads the `no-useless-constructor` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUselessConstructor() {
  return require("./no-useless-constructor");
}

/**
 * Loads the `no-useless-escape` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUselessEscape() {
  return require("./no-useless-escape");
}

/**
 * Loads the `no-useless-rename` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUselessRename() {
  return require("./no-useless-rename");
}

/**
 * Loads the `no-useless-return` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoUselessReturn() {
  return require("./no-useless-return");
}

/**
 * Loads the `no-var` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoVar() {
  return require("./no-var");
}

/**
 * Loads the `no-void` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoVoid() {
  return require("./no-void");
}

/**
 * Loads the `no-warning-comments` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoWarningComments() {
  return require("./no-warning-comments");
}

/**
 * Loads the `no-whitespace-before-property` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoWhitespaceBeforeProperty() {
  return require("./no-whitespace-before-property");
}

/**
 * Loads the `no-with` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNoWith() {
  return require("./no-with");
}

/**
 * Loads the `nonblock-statement-body-position` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadNonblockStatementBodyPosition() {
  return require("./nonblock-statement-body-position");
}

/**
 * Loads the `object-curly-newline` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadObjectCurlyNewline() {
  return require("./object-curly-newline");
}

/**
 * Loads the `object-curly-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadObjectCurlySpacing() {
  return require("./object-curly-spacing");
}

/**
 * Loads the `object-property-newline` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadObjectPropertyNewline() {
  return require("./object-property-newline");
}

/**
 * Loads the `object-shorthand` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadObjectShorthand() {
  return require("./object-shorthand");
}

/**
 * Loads the `one-var` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadOneVar() {
  return require("./one-var");
}

/**
 * Loads the `one-var-declaration-per-line` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadOneVarDeclarationPerLine() {
  return require("./one-var-declaration-per-line");
}

/**
 * Loads the `operator-assignment` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadOperatorAssignment() {
  return require("./operator-assignment");
}

/**
 * Loads the `operator-linebreak` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadOperatorLinebreak() {
  return require("./operator-linebreak");
}

/**
 * Loads the `padded-blocks` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPaddedBlocks() {
  return require("./padded-blocks");
}

/**
 * Loads the `padding-line-between-statements` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPaddingLineBetweenStatements() {
  return require("./padding-line-between-statements");
}

/**
 * Loads the `prefer-arrow-callback` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferArrowCallback() {
  return require("./prefer-arrow-callback");
}

/**
 * Loads the `prefer-const` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferConst() {
  return require("./prefer-const");
}

/**
 * Loads the `prefer-destructuring` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferDestructuring() {
  return require("./prefer-destructuring");
}

/**
 * Loads the `prefer-exponentiation-operator` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferExponentiationOperator() {
  return require("./prefer-exponentiation-operator");
}

/**
 * Loads the `prefer-named-capture-group` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferNamedCaptureGroup() {
  return require("./prefer-named-capture-group");
}

/**
 * Loads the `prefer-numeric-literals` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferNumericLiterals() {
  return require("./prefer-numeric-literals");
}

/**
 * Loads the `prefer-object-has-own` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferObjectHasOwn() {
  return require("./prefer-object-has-own");
}

/**
 * Loads the `prefer-object-spread` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferObjectSpread() {
  return require("./prefer-object-spread");
}

/**
 * Loads the `prefer-promise-reject-errors` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferPromiseRejectErrors() {
  return require("./prefer-promise-reject-errors");
}

/**
 * Loads the `prefer-reflect` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferReflect() {
  return require("./prefer-reflect");
}

/**
 * Loads the `prefer-regex-literals` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferRegexLiterals() {
  return require("./prefer-regex-literals");
}

/**
 * Loads the `prefer-rest-params` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferRestParams() {
  return require("./prefer-rest-params");
}

/**
 * Loads the `prefer-spread` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferSpread() {
  return require("./prefer-spread");
}

/**
 * Loads the `prefer-template` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreferTemplate() {
  return require("./prefer-template");
}

/**
 * Loads the `preserve-caught-error` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadPreserveCaughtError() {
  return require("./preserve-caught-error");
}

/**
 * Loads the `quote-props` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadQuoteProps() {
  return require("./quote-props");
}

/**
 * Loads the `quotes` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadQuotes() {
  return require("./quotes");
}

/**
 * Loads the `radix` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadRadix() {
  return require("./radix");
}

/**
 * Loads the `require-atomic-updates` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadRequireAtomicUpdates() {
  return require("./require-atomic-updates");
}

/**
 * Loads the `require-await` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadRequireAwait() {
  return require("./require-await");
}

/**
 * Loads the `require-unicode-regexp` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadRequireUnicodeRegexp() {
  return require("./require-unicode-regexp");
}

/**
 * Loads the `require-yield` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadRequireYield() {
  return require("./require-yield");
}

/**
 * Loads the `rest-spread-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadRestSpreadSpacing() {
  return require("./rest-spread-spacing");
}

/**
 * Loads the `semi` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSemi() {
  return require("./semi");
}

/**
 * Loads the `semi-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSemiSpacing() {
  return require("./semi-spacing");
}

/**
 * Loads the `semi-style` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSemiStyle() {
  return require("./semi-style");
}

/**
 * Loads the `sort-imports` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSortImports() {
  return require("./sort-imports");
}

/**
 * Loads the `sort-keys` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSortKeys() {
  return require("./sort-keys");
}

/**
 * Loads the `sort-vars` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSortVars() {
  return require("./sort-vars");
}

/**
 * Loads the `space-before-blocks` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSpaceBeforeBlocks() {
  return require("./space-before-blocks");
}

/**
 * Loads the `space-before-function-paren` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSpaceBeforeFunctionParen() {
  return require("./space-before-function-paren");
}

/**
 * Loads the `space-in-parens` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSpaceInParens() {
  return require("./space-in-parens");
}

/**
 * Loads the `space-infix-ops` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSpaceInfixOps() {
  return require("./space-infix-ops");
}

/**
 * Loads the `space-unary-ops` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSpaceUnaryOps() {
  return require("./space-unary-ops");
}

/**
 * Loads the `spaced-comment` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSpacedComment() {
  return require("./spaced-comment");
}

/**
 * Loads the `strict` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadStrict() {
  return require("./strict");
}

/**
 * Loads the `switch-colon-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSwitchColonSpacing() {
  return require("./switch-colon-spacing");
}

/**
 * Loads the `symbol-description` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadSymbolDescription() {
  return require("./symbol-description");
}

/**
 * Loads the `template-curly-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadTemplateCurlySpacing() {
  return require("./template-curly-spacing");
}

/**
 * Loads the `template-tag-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadTemplateTagSpacing() {
  return require("./template-tag-spacing");
}

/**
 * Loads the `unicode-bom` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadUnicodeBom() {
  return require("./unicode-bom");
}

/**
 * Loads the `use-isnan` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadUseIsnan() {
  return require("./use-isnan");
}

/**
 * Loads the `valid-typeof` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadValidTypeof() {
  return require("./valid-typeof");
}

/**
 * Loads the `vars-on-top` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadVarsOnTop() {
  return require("./vars-on-top");
}

/**
 * Loads the `wrap-iife` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadWrapIife() {
  return require("./wrap-iife");
}

/**
 * Loads the `wrap-regex` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadWrapRegex() {
  return require("./wrap-regex");
}

/**
 * Loads the `yield-star-spacing` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadYieldStarSpacing() {
  return require("./yield-star-spacing");
}

/**
 * Loads the `yoda` rule.
 * @returns {import("../types").Rule.RuleModule}
 */
function loadYoda() {
  return require("./yoda");
}

/* Export the lazily loaded rule map */
module.exports = new LazyLoadingRuleMap(buildRuleMapEntries());