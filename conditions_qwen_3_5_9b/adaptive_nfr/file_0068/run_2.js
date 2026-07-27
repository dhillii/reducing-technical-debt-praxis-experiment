/**
 * @fileoverview Collects the built-in rules into a map structure so that they can be imported all at once and without
 * using the file-system directly.
 * @author Peter (Somogyvari) Metz
 */

"use strict";

/* eslint sort-keys: ["error", "asc"] -- More readable for long list */

const { LazyLoadingRuleMap } = require("./utils/lazy-loading-rule-map");

/**
 * Creates a map entry for the 'accessor-pairs' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createAccessorPairsEntry = () => require("./accessor-pairs");

/**
 * Creates a map entry for the 'array-bracket-newline' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createArrayBracketNewlineEntry = () => require("./array-bracket-newline");

/**
 * Creates a map entry for the 'array-bracket-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createArrayBracketSpacingEntry = () => require("./array-bracket-spacing");

/**
 * Creates a map entry for the 'array-callback-return' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createArrayCallbackReturnEntry = () => require("./array-callback-return");

/**
 * Creates a map entry for the 'array-element-newline' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createArrayElementNewlineEntry = () => require("./array-element-newline");

/**
 * Creates a map entry for the 'arrow-body-style' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createArrowBodyStyleEntry = () => require("./arrow-body-style");

/**
 * Creates a map entry for the 'arrow-parens' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createArrowParensEntry = () => require("./arrow-parens");

/**
 * Creates a map entry for the 'arrow-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createArrowSpacingEntry = () => require("./arrow-spacing");

/**
 * Creates a map entry for the 'block-scoped-var' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createBlockScopedVarEntry = () => require("./block-scoped-var");

/**
 * Creates a map entry for the 'block-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createBlockSpacingEntry = () => require("./block-spacing");

/**
 * Creates a map entry for the 'brace-style' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createBraceStyleEntry = () => require("./brace-style");

/**
 * Creates a map entry for the 'callback-return' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createCallbackReturnEntry = () => require("./callback-return");

/**
 * Creates a map entry for the 'camelcase' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createCamelcaseEntry = () => require("./camelcase");

/**
 * Creates a map entry for the 'capitalized-comments' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createCapitalizedCommentsEntry = () => require("./capitalized-comments");

/**
 * Creates a map entry for the 'class-methods-use-this' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createClassMethodsUseThisEntry = () => require("./class-methods-use-this");

/**
 * Creates a map entry for the 'comma-dangle' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createCommaDangleEntry = () => require("./comma-dangle");

/**
 * Creates a map entry for the 'comma-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createCommaSpacingEntry = () => require("./comma-spacing");

/**
 * Creates a map entry for the 'comma-style' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createCommaStyleEntry = () => require("./comma-style");

/**
 * Creates a map entry for the 'complexity' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createComplexityEntry = () => require("./complexity");

/**
 * Creates a map entry for the 'computed-property-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createComputedPropertySpacingEntry = () => require("./computed-property-spacing");

/**
 * Creates a map entry for the 'consistent-return' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createConsistentReturnEntry = () => require("./consistent-return");

/**
 * Creates a map entry for the 'consistent-this' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createConsistentThisEntry = () => require("./consistent-this");

/**
 * Creates a map entry for the 'constructor-super' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createConstructorSuperEntry = () => require("./constructor-super");

/**
 * Creates a map entry for the 'curly' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createCurlyEntry = () => require("./curly");

/**
 * Creates a map entry for the 'default-case' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createDefaultCaseEntry = () => require("./default-case");

/**
 * Creates a map entry for the 'default-case-last' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createDefaultCaseLastEntry = () => require("./default-case-last");

/**
 * Creates a map entry for the 'default-param-last' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createDefaultParamLastEntry = () => require("./default-param-last");

/**
 * Creates a map entry for the 'dot-location' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createDotLocationEntry = () => require("./dot-location");

/**
 * Creates a map entry for the 'dot-notation' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createDotNotationEntry = () => require("./dot-notation");

/**
 * Creates a map entry for the 'eol-last' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createEolLastEntry = () => require("./eol-last");

/**
 * Creates a map entry for the 'eqeqeq' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createEqeqeqEntry = () => require("./eqeqeq");

/**
 * Creates a map entry for the 'for-direction' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createForDirectionEntry = () => require("./for-direction");

/**
 * Creates a map entry for the 'func-call-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createFuncCallSpacingEntry = () => require("./func-call-spacing");

/**
 * Creates a map entry for the 'func-name-matching' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createFuncNameMatchingEntry = () => require("./func-name-matching");

/**
 * Creates a map entry for the 'func-names' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createFuncNamesEntry = () => require("./func-names");

/**
 * Creates a map entry for the 'func-style' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createFuncStyleEntry = () => require("./func-style");

/**
 * Creates a map entry for the 'function-call-argument-newline' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createFunctionCallArgumentNewlineEntry = () => require("./function-call-argument-newline");

/**
 * Creates a map entry for the 'function-paren-newline' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createFunctionParenNewlineEntry = () => require("./function-paren-newline");

/**
 * Creates a map entry for the 'generator-star-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createGeneratorStarSpacingEntry = () => require("./generator-star-spacing");

/**
 * Creates a map entry for the 'getter-return' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createGetterReturnEntry = () => require("./getter-return");

/**
 * Creates a map entry for the 'global-require' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createGlobalRequireEntry = () => require("./global-require");

/**
 * Creates a map entry for the 'grouped-accessor-pairs' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createGroupedAccessorPairsEntry = () => require("./grouped-accessor-pairs");

/**
 * Creates a map entry for the 'guard-for-in' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createGuardForInEntry = () => require("./guard-for-in");

/**
 * Creates a map entry for the 'handle-callback-err' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createHandleCallbackErrEntry = () => require("./handle-callback-err");

/**
 * Creates a map entry for the 'id-blacklist' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createIdBlacklistEntry = () => require("./id-blacklist");

/**
 * Creates a map entry for the 'id-denylist' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createIdDenylistEntry = () => require("./id-denylist");

/**
 * Creates a map entry for the 'id-length' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createIdLengthEntry = () => require("./id-length");

/**
 * Creates a map entry for the 'id-match' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createIdMatchEntry = () => require("./id-match");

/**
 * Creates a map entry for the 'implicit-arrow-linebreak' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createImplicitArrowLinebreakEntry = () => require("./implicit-arrow-linebreak");

/**
 * Creates a map entry for the 'indent' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createIndentEntry = () => require("./indent");

/**
 * Creates a map entry for the 'indent-legacy' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createIndentLegacyEntry = () => require("./indent-legacy");

/**
 * Creates a map entry for the 'init-declarations' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createInitDeclarationsEntry = () => require("./init-declarations");

/**
 * Creates a map entry for the 'jsx-quotes' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createJsxQuotesEntry = () => require("./jsx-quotes");

/**
 * Creates a map entry for the 'key-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createKeySpacingEntry = () => require("./key-spacing");

/**
 * Creates a map entry for the 'keyword-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createKeywordSpacingEntry = () => require("./keyword-spacing");

/**
 * Creates a map entry for the 'line-comment-position' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createLineCommentPositionEntry = () => require("./line-comment-position");

/**
 * Creates a map entry for the 'linebreak-style' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createLinebreakStyleEntry = () => require("./linebreak-style");

/**
 * Creates a map entry for the 'lines-around-comment' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createLinesAroundCommentEntry = () => require("./lines-around-comment");

/**
 * Creates a map entry for the 'lines-around-directive' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createLinesAroundDirectiveEntry = () => require("./lines-around-directive");

/**
 * Creates a map entry for the 'lines-between-class-members' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createLinesBetweenClassMembersEntry = () => require("./lines-between-class-members");

/**
 * Creates a map entry for the 'logical-assignment-operators' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createLogicalAssignmentOperatorsEntry = () => require("./logical-assignment-operators");

/**
 * Creates a map entry for the 'max-classes-per-file' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createMaxClassesPerFileEntry = () => require("./max-classes-per-file");

/**
 * Creates a map entry for the 'max-depth' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createMaxDepthEntry = () => require("./max-depth");

/**
 * Creates a map entry for the 'max-len' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createMaxLenEntry = () => require("./max-len");

/**
 * Creates a map entry for the 'max-lines' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createMaxLinesEntry = () => require("./max-lines");

/**
 * Creates a map entry for the 'max-lines-per-function' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createMaxLinesPerFunctionEntry = () => require("./max-lines-per-function");

/**
 * Creates a map entry for the 'max-nested-callbacks' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createMaxNestedCallbacksEntry = () => require("./max-nested-callbacks");

/**
 * Creates a map entry for the 'max-params' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createMaxParamsEntry = () => require("./max-params");

/**
 * Creates a map entry for the 'max-statements' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createMaxStatementsEntry = () => require("./max-statements");

/**
 * Creates a map entry for the 'max-statements-per-line' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createMaxStatementsPerLineEntry = () => require("./max-statements-per-line");

/**
 * Creates a map entry for the 'multiline-comment-style' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createMultilineCommentStyleEntry = () => require("./multiline-comment-style");

/**
 * Creates a map entry for the 'multiline-ternary' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createMultilineTernaryEntry = () => require("./multiline-ternary");

/**
 * Creates a map entry for the 'new-cap' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNewCapEntry = () => require("./new-cap");

/**
 * Creates a map entry for the 'new-parens' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNewParensEntry = () => require("./new-parens");

/**
 * Creates a map entry for the 'newline-after-var' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNewlineAfterVarEntry = () => require("./newline-after-var");

/**
 * Creates a map entry for the 'newline-before-return' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNewlineBeforeReturnEntry = () => require("./newline-before-return");

/**
 * Creates a map entry for the 'newline-per-chained-call' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNewlinePerChainedCallEntry = () => require("./newline-per-chained-call");

/**
 * Creates a map entry for the 'no-alert' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoAlertEntry = () => require("./no-alert");

/**
 * Creates a map entry for the 'no-array-constructor' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoArrayConstructorEntry = () => require("./no-array-constructor");

/**
 * Creates a map entry for the 'no-async-promise-executor' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoAsyncPromiseExecutorEntry = () => require("./no-async-promise-executor");

/**
 * Creates a map entry for the 'no-await-in-loop' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoAwaitInLoopEntry = () => require("./no-await-in-loop");

/**
 * Creates a map entry for the 'no-bitwise' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoBitwiseEntry = () => require("./no-bitwise");

/**
 * Creates a map entry for the 'no-buffer-constructor' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoBufferConstructorEntry = () => require("./no-buffer-constructor");

/**
 * Creates a map entry for the 'no-caller' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoCallerEntry = () => require("./no-caller");

/**
 * Creates a map entry for the 'no-case-declarations' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoCaseDeclarationsEntry = () => require("./no-case-declarations");

/**
 * Creates a map entry for the 'no-catch-shadow' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoCatchShadowEntry = () => require("./no-catch-shadow");

/**
 * Creates a map entry for the 'no-class-assign' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoClassAssignEntry = () => require("./no-class-assign");

/**
 * Creates a map entry for the 'no-compare-neg-zero' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoCompareNegZeroEntry = () => require("./no-compare-neg-zero");

/**
 * Creates a map entry for the 'no-cond-assign' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoCondAssignEntry = () => require("./no-cond-assign");

/**
 * Creates a map entry for the 'no-confusing-arrow' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoConfusingArrowEntry = () => require("./no-confusing-arrow");

/**
 * Creates a map entry for the 'no-console' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoConsoleEntry = () => require("./no-console");

/**
 * Creates a map entry for the 'no-const-assign' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoConstAssignEntry = () => require("./no-const-assign");

/**
 * Creates a map entry for the 'no-constant-binary-expression' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoConstantBinaryExpressionEntry = () => require("./no-constant-binary-expression");

/**
 * Creates a map entry for the 'no-constant-condition' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoConstantConditionEntry = () => require("./no-constant-condition");

/**
 * Creates a map entry for the 'no-constructor-return' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoConstructorReturnEntry = () => require("./no-constructor-return");

/**
 * Creates a map entry for the 'no-continue' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoContinueEntry = () => require("./no-continue");

/**
 * Creates a map entry for the 'no-control-regex' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoControlRegexEntry = () => require("./no-control-regex");

/**
 * Creates a map entry for the 'no-debugger' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoDebuggerEntry = () => require("./no-debugger");

/**
 * Creates a map entry for the 'no-delete-var' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoDeleteVarEntry = () => require("./no-delete-var");

/**
 * Creates a map entry for the 'no-div-regex' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoDivRegexEntry = () => require("./no-div-regex");

/**
 * Creates a map entry for the 'no-dupe-args' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoDupeArgsEntry = () => require("./no-dupe-args");

/**
 * Creates a map entry for the 'no-dupe-class-members' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoDupeClassMembersEntry = () => require("./no-dupe-class-members");

/**
 * Creates a map entry for the 'no-dupe-else-if' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoDupeElseIfEntry = () => require("./no-dupe-else-if");

/**
 * Creates a map entry for the 'no-dupe-keys' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoDupeKeysEntry = () => require("./no-dupe-keys");

/**
 * Creates a map entry for the 'no-duplicate-case' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoDuplicateCaseEntry = () => require("./no-duplicate-case");

/**
 * Creates a map entry for the 'no-duplicate-imports' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoDuplicateImportsEntry = () => require("./no-duplicate-imports");

/**
 * Creates a map entry for the 'no-else-return' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoElseReturnEntry = () => require("./no-else-return");

/**
 * Creates a map entry for the 'no-empty' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoEmptyEntry = () => require("./no-empty");

/**
 * Creates a map entry for the 'no-empty-character-class' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoEmptyCharacterClassEntry = () => require("./no-empty-character-class");

/**
 * Creates a map entry for the 'no-empty-function' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoEmptyFunctionEntry = () => require("./no-empty-function");

/**
 * Creates a map entry for the 'no-empty-pattern' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoEmptyPatternEntry = () => require("./no-empty-pattern");

/**
 * Creates a map entry for the 'no-empty-static-block' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoEmptyStaticBlockEntry = () => require("./no-empty-static-block");

/**
 * Creates a map entry for the 'no-eq-null' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoEqNullEntry = () => require("./no-eq-null");

/**
 * Creates a map entry for the 'no-eval' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoEvalEntry = () => require("./no-eval");

/**
 * Creates a map entry for the 'no-ex-assign' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoExAssignEntry = () => require("./no-ex-assign");

/**
 * Creates a map entry for the 'no-extend-native' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoExtendNativeEntry = () => require("./no-extend-native");

/**
 * Creates a map entry for the 'no-extra-bind' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoExtraBindEntry = () => require("./no-extra-bind");

/**
 * Creates a map entry for the 'no-extra-boolean-cast' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoExtraBooleanCastEntry = () => require("./no-extra-boolean-cast");

/**
 * Creates a map entry for the 'no-extra-label' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoExtraLabelEntry = () => require("./no-extra-label");

/**
 * Creates a map entry for the 'no-extra-parens' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoExtraParensEntry = () => require("./no-extra-parens");

/**
 * Creates a map entry for the 'no-extra-semi' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoExtraSemiEntry = () => require("./no-extra-semi");

/**
 * Creates a map entry for the 'no-fallthrough' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoFallthroughEntry = () => require("./no-fallthrough");

/**
 * Creates a map entry for the 'no-floating-decimal' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoFloatingDecimalEntry = () => require("./no-floating-decimal");

/**
 * Creates a map entry for the 'no-func-assign' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoFuncAssignEntry = () => require("./no-func-assign");

/**
 * Creates a map entry for the 'no-global-assign' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoGlobalAssignEntry = () => require("./no-global-assign");

/**
 * Creates a map entry for the 'no-implicit-coercion' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoImplicitCoercionEntry = () => require("./no-implicit-coercion");

/**
 * Creates a map entry for the 'no-implicit-globals' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoImplicitGlobalsEntry = () => require("./no-implicit-globals");

/**
 * Creates a map entry for the 'no-implied-eval' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoImpliedEvalEntry = () => require("./no-implied-eval");

/**
 * Creates a map entry for the 'no-import-assign' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoImportAssignEntry = () => require("./no-import-assign");

/**
 * Creates a map entry for the 'no-inline-comments' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoInlineCommentsEntry = () => require("./no-inline-comments");

/**
 * Creates a map entry for the 'no-inner-declarations' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoInnerDeclarationsEntry = () => require("./no-inner-declarations");

/**
 * Creates a map entry for the 'no-invalid-regexp' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoInvalidRegexEntry = () => require("./no-invalid-regexp");

/**
 * Creates a map entry for the 'no-invalid-this' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoInvalidThisEntry = () => require("./no-invalid-this");

/**
 * Creates a map entry for the 'no-irregular-whitespace' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoIrregularWhitespaceEntry = () => require("./no-irregular-whitespace");

/**
 * Creates a map entry for the 'no-iterator' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoIteratorEntry = () => require("./no-iterator");

/**
 * Creates a map entry for the 'no-label-var' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoLabelVarEntry = () => require("./no-label-var");

/**
 * Creates a map entry for the 'no-labels' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoLabelsEntry = () => require("./no-labels");

/**
 * Creates a map entry for the 'no-lone-blocks' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoLoneBlocksEntry = () => require("./no-lone-blocks");

/**
 * Creates a map entry for the 'no-lonely-if' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoLonelyIfEntry = () => require("./no-lonely-if");

/**
 * Creates a map entry for the 'no-loop-func' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoLoopFuncEntry = () => require("./no-loop-func");

/**
 * Creates a map entry for the 'no-loss-of-precision' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoLossOfPrecisionEntry = () => require("./no-loss-of-precision");

/**
 * Creates a map entry for the 'no-magic-numbers' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoMagicNumbersEntry = () => require("./no-magic-numbers");

/**
 * Creates a map entry for the 'no-misleading-character-class' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoMisleadingCharacterClassEntry = () => require("./no-misleading-character-class");

/**
 * Creates a map entry for the 'no-mixed-operators' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoMixedOperatorsEntry = () => require("./no-mixed-operators");

/**
 * Creates a map entry for the 'no-mixed-requires' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoMixedRequiresEntry = () => require("./no-mixed-requires");

/**
 * Creates a map entry for the 'no-mixed-spaces-and-tabs' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoMixedSpacesAndTabsEntry = () => require("./no-mixed-spaces-and-tabs");

/**
 * Creates a map entry for the 'no-multi-assign' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoMultiAssignEntry = () => require("./no-multi-assign");

/**
 * Creates a map entry for the 'no-multi-spaces' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoMultiSpacesEntry = () => require("./no-multi-spaces");

/**
 * Creates a map entry for the 'no-multi-str' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoMultiStrEntry = () => require("./no-multi-str");

/**
 * Creates a map entry for the 'no-multiple-empty-lines' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoMultipleEmptyLinesEntry = () => require("./no-multiple-empty-lines");

/**
 * Creates a map entry for the 'no-native-reassign' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoNativeReassignEntry = () => require("./no-native-reassign");

/**
 * Creates a map entry for the 'no-negated-condition' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoNegatedConditionEntry = () => require("./no-negated-condition");

/**
 * Creates a map entry for the 'no-negated-in-lhs' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoNegatedInLhsEntry = () => require("./no-negated-in-lhs");

/**
 * Creates a map entry for the 'no-nested-ternary' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoNestedTernaryEntry = () => require("./no-nested-ternary");

/**
 * Creates a map entry for the 'no-new' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoNewEntry = () => require("./no-new");

/**
 * Creates a map entry for the 'no-new-func' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoNewFuncEntry = () => require("./no-new-func");

/**
 * Creates a map entry for the 'no-new-native-nonconstructor' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoNewNativeNonconstructorEntry = () => require("./no-new-native-nonconstructor");

/**
 * Creates a map entry for the 'no-new-object' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoNewObjectEntry = () => require("./no-new-object");

/**
 * Creates a map entry for the 'no-new-require' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoNewRequireEntry = () => require("./no-new-require");

/**
 * Creates a map entry for the 'no-new-symbol' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoNewSymbolEntry = () => require("./no-new-symbol");

/**
 * Creates a map entry for the 'no-new-wrappers' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoNewWrappersEntry = () => require("./no-new-wrappers");

/**
 * Creates a map entry for the 'no-nonoctal-decimal-escape' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoNonoctalDecimalEscapeEntry = () => require("./no-nonoctal-decimal-escape");

/**
 * Creates a map entry for the 'no-obj-calls' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoObjCallsEntry = () => require("./no-obj-calls");

/**
 * Creates a map entry for the 'no-object-constructor' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoObjectConstructorEntry = () => require("./no-object-constructor");

/**
 * Creates a map entry for the 'no-octal' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoOctalEntry = () => require("./no-octal");

/**
 * Creates a map entry for the 'no-octal-escape' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoOctalEscapeEntry = () => require("./no-octal-escape");

/**
 * Creates a map entry for the 'no-param-reassign' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoParamReassignEntry = () => require("./no-param-reassign");

/**
 * Creates a map entry for the 'no-path-concat' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoPathConcatEntry = () => require("./no-path-concat");

/**
 * Creates a map entry for the 'no-plusplus' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoPlusplusEntry = () => require("./no-plusplus");

/**
 * Creates a map entry for the 'no-process-env' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoProcessEnvEntry = () => require("./no-process-env");

/**
 * Creates a map entry for the 'no-process-exit' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoProcessExitEntry = () => require("./no-process-exit");

/**
 * Creates a map entry for the 'no-promise-executor-return' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoPromiseExecutorReturnEntry = () => require("./no-promise-executor-return");

/**
 * Creates a map entry for the 'no-proto' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoProtoEntry = () => require("./no-proto");

/**
 * Creates a map entry for the 'no-prototype-builtins' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoPrototypeBuiltinsEntry = () => require("./no-prototype-builtins");

/**
 * Creates a map entry for the 'no-redeclare' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoRedeclareEntry = () => require("./no-redeclare");

/**
 * Creates a map entry for the 'no-regex-spaces' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoRegexSpacesEntry = () => require("./no-regex-spaces");

/**
 * Creates a map entry for the 'no-restricted-exports' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoRestrictedExportsEntry = () => require("./no-restricted-exports");

/**
 * Creates a map entry for the 'no-restricted-globals' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoRestrictedGlobalsEntry = () => require("./no-restricted-globals");

/**
 * Creates a map entry for the 'no-restricted-imports' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoRestrictedImportsEntry = () => require("./no-restricted-imports");

/**
 * Creates a map entry for the 'no-restricted-modules' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoRestrictedModulesEntry = () => require("./no-restricted-modules");

/**
 * Creates a map entry for the 'no-restricted-properties' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoRestrictedPropertiesEntry = () => require("./no-restricted-properties");

/**
 * Creates a map entry for the 'no-restricted-syntax' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoRestrictedSyntaxEntry = () => require("./no-restricted-syntax");

/**
 * Creates a map entry for the 'no-return-assign' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoReturnAssignEntry = () => require("./no-return-assign");

/**
 * Creates a map entry for the 'no-return-await' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoReturnAwaitEntry = () => require("./no-return-await");

/**
 * Creates a map entry for the 'no-script-url' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoScriptUrlEntry = () => require("./no-script-url");

/**
 * Creates a map entry for the 'no-self-assign' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoSelfAssignEntry = () => require("./no-self-assign");

/**
 * Creates a map entry for the 'no-self-compare' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoSelfCompareEntry = () => require("./no-self-compare");

/**
 * Creates a map entry for the 'no-sequences' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoSequencesEntry = () => require("./no-sequences");

/**
 * Creates a map entry for the 'no-setter-return' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoSetterReturnEntry = () => require("./no-setter-return");

/**
 * Creates a map entry for the 'no-shadow' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoShadowEntry = () => require("./no-shadow");

/**
 * Creates a map entry for the 'no-shadow-restricted-names' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoShadowRestrictedNamesEntry = () => require("./no-shadow-restricted-names");

/**
 * Creates a map entry for the 'no-spaced-func' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoSpacedFuncEntry = () => require("./no-spaced-func");

/**
 * Creates a map entry for the 'no-sparse-arrays' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoSparseArraysEntry = () => require("./no-sparse-arrays");

/**
 * Creates a map entry for the 'no-sync' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoSyncEntry = () => require("./no-sync");

/**
 * Creates a map entry for the 'no-tabs' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoTabsEntry = () => require("./no-tabs");

/**
 * Creates a map entry for the 'no-template-curly-in-string' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoTemplateCurlyInStringEntry = () => require("./no-template-curly-in-string");

/**
 * Creates a map entry for the 'no-ternary' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoTernaryEntry = () => require("./no-ternary");

/**
 * Creates a map entry for the 'no-this-before-super' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoThisBeforeSuperEntry = () => require("./no-this-before-super");

/**
 * Creates a map entry for the 'no-throw-literal' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoThrowLiteralEntry = () => require("./no-throw-literal");

/**
 * Creates a map entry for the 'no-trailing-spaces' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoTrailingSpacesEntry = () => require("./no-trailing-spaces");

/**
 * Creates a map entry for the 'no-unassigned-vars' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnassignedVarsEntry = () => require("./no-unassigned-vars");

/**
 * Creates a map entry for the 'no-undef' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUndefEntry = () => require("./no-undef");

/**
 * Creates a map entry for the 'no-undef-init' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUndefInitEntry = () => require("./no-undef-init");

/**
 * Creates a map entry for the 'no-undefined' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUndefinedEntry = () => require("./no-undefined");

/**
 * Creates a map entry for the 'no-underscore-dangle' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnderscoreDangleEntry = () => require("./no-underscore-dangle");

/**
 * Creates a map entry for the 'no-unexpected-multiline' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnexpectedMultilineEntry = () => require("./no-unexpected-multiline");

/**
 * Creates a map entry for the 'no-unmodified-loop-condition' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnmodifiedLoopConditionEntry = () => require("./no-unmodified-loop-condition");

/**
 * Creates a map entry for the 'no-unneeded-ternary' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnneededTernaryEntry = () => require("./no-unneeded-ternary");

/**
 * Creates a map entry for the 'no-unreachable' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnreachableEntry = () => require("./no-unreachable");

/**
 * Creates a map entry for the 'no-unreachable-loop' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnreachableLoopEntry = () => require("./no-unreachable-loop");

/**
 * Creates a map entry for the 'no-unsafe-finally' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnsafeFinallyEntry = () => require("./no-unsafe-finally");

/**
 * Creates a map entry for the 'no-unsafe-negation' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnsafeNegationEntry = () => require("./no-unsafe-negation");

/**
 * Creates a map entry for the 'no-unsafe-optional-chaining' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnsafeOptionalChainingEntry = () => require("./no-unsafe-optional-chaining");

/**
 * Creates a map entry for the 'no-unused-expressions' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnusedExpressionsEntry = () => require("./no-unused-expressions");

/**
 * Creates a map entry for the 'no-unused-labels' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnusedLabelsEntry = () => require("./no-unused-labels");

/**
 * Creates a map entry for the 'no-unused-private-class-members' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnusedPrivateClassMembersEntry = () => require("./no-unused-private-class-members");

/**
 * Creates a map entry for the 'no-unused-vars' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUnusedVarsEntry = () => require("./no-unused-vars");

/**
 * Creates a map entry for the 'no-use-before-define' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUseBeforeDefineEntry = () => require("./no-use-before-define");

/**
 * Creates a map entry for the 'no-useless-assignment' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUselessAssignmentEntry = () => require("./no-useless-assignment");

/**
 * Creates a map entry for the 'no-useless-backreference' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUselessBackreferenceEntry = () => require("./no-useless-backreference");

/**
 * Creates a map entry for the 'no-useless-call' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUselessCallEntry = () => require("./no-useless-call");

/**
 * Creates a map entry for the 'no-useless-catch' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUselessCatchEntry = () => require("./no-useless-catch");

/**
 * Creates a map entry for the 'no-useless-computed-key' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUselessComputedKeyEntry = () => require("./no-useless-computed-key");

/**
 * Creates a map entry for the 'no-useless-concat' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUselessConcatEntry = () => require("./no-useless-concat");

/**
 * Creates a map entry for the 'no-useless-constructor' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUselessConstructorEntry = () => require("./no-useless-constructor");

/**
 * Creates a map entry for the 'no-useless-escape' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUselessEscapeEntry = () => require("./no-useless-escape");

/**
 * Creates a map entry for the 'no-useless-rename' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUselessRenameEntry = () => require("./no-useless-rename");

/**
 * Creates a map entry for the 'no-useless-return' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoUselessReturnEntry = () => require("./no-useless-return");

/**
 * Creates a map entry for the 'no-var' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoVarEntry = () => require("./no-var");

/**
 * Creates a map entry for the 'no-void' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoVoidEntry = () => require("./no-void");

/**
 * Creates a map entry for the 'no-warning-comments' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoWarningCommentsEntry = () => require("./no-warning-comments");

/**
 * Creates a map entry for the 'no-whitespace-before-property' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoWhitespaceBeforePropertyEntry = () => require("./no-whitespace-before-property");

/**
 * Creates a map entry for the 'no-with' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNoWithEntry = () => require("./no-with");

/**
 * Creates a map entry for the 'nonblock-statement-body-position' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createNonblockStatementBodyPositionEntry = () => require("./nonblock-statement-body-position");

/**
 * Creates a map entry for the 'object-curly-newline' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createObjectCurlyNewlineEntry = () => require("./object-curly-newline");

/**
 * Creates a map entry for the 'object-curly-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createObjectCurlySpacingEntry = () => require("./object-curly-spacing");

/**
 * Creates a map entry for the 'object-property-newline' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createObjectPropertyNewlineEntry = () => require("./object-property-newline");

/**
 * Creates a map entry for the 'object-shorthand' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createObjectShorthandEntry = () => require("./object-shorthand");

/**
 * Creates a map entry for the 'one-var' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createOneVarEntry = () => require("./one-var");

/**
 * Creates a map entry for the 'one-var-declaration-per-line' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createOneVarDeclarationPerLineEntry = () => require("./one-var-declaration-per-line");

/**
 * Creates a map entry for the 'operator-assignment' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createOperatorAssignmentEntry = () => require("./operator-assignment");

/**
 * Creates a map entry for the 'operator-linebreak' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createOperatorLinebreakEntry = () => require("./operator-linebreak");

/**
 * Creates a map entry for the 'padded-blocks' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPaddedBlocksEntry = () => require("./padded-blocks");

/**
 * Creates a map entry for the 'padding-line-between-statements' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPaddingLineBetweenStatementsEntry = () => require("./padding-line-between-statements");

/**
 * Creates a map entry for the 'prefer-arrow-callback' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferArrowCallbackEntry = () => require("./prefer-arrow-callback");

/**
 * Creates a map entry for the 'prefer-const' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferConstEntry = () => require("./prefer-const");

/**
 * Creates a map entry for the 'prefer-destructuring' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferDestructuringEntry = () => require("./prefer-destructuring");

/**
 * Creates a map entry for the 'prefer-exponentiation-operator' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferExponentiationOperatorEntry = () => require("./prefer-exponentiation-operator");

/**
 * Creates a map entry for the 'prefer-named-capture-group' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferNamedCaptureGroupEntry = () => require("./prefer-named-capture-group");

/**
 * Creates a map entry for the 'prefer-numeric-literals' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferNumericLiteralsEntry = () => require("./prefer-numeric-literals");

/**
 * Creates a map entry for the 'prefer-object-has-own' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferObjectHasOwnEntry = () => require("./prefer-object-has-own");

/**
 * Creates a map entry for the 'prefer-object-spread' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferObjectSpreadEntry = () => require("./prefer-object-spread");

/**
 * Creates a map entry for the 'prefer-promise-reject-errors' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferPromiseRejectErrorsEntry = () => require("./prefer-promise-reject-errors");

/**
 * Creates a map entry for the 'prefer-reflect' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferReflectEntry = () => require("./prefer-reflect");

/**
 * Creates a map entry for the 'prefer-regex-literals' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferRegexLiteralsEntry = () => require("./prefer-regex-literals");

/**
 * Creates a map entry for the 'prefer-rest-params' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferRestParamsEntry = () => require("./prefer-rest-params");

/**
 * Creates a map entry for the 'prefer-spread' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferSpreadEntry = () => require("./prefer-spread");

/**
 * Creates a map entry for the 'prefer-template' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreferTemplateEntry = () => require("./prefer-template");

/**
 * Creates a map entry for the 'preserve-caught-error' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createPreserveCaughtErrorEntry = () => require("./preserve-caught-error");

/**
 * Creates a map entry for the 'quote-props' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createQuotePropsEntry = () => require("./quote-props");

/**
 * Creates a map entry for the 'quotes' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createQuotesEntry = () => require("./quotes");

/**
 * Creates a map entry for the 'radix' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createRadixEntry = () => require("./radix");

/**
 * Creates a map entry for the 'require-atomic-updates' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createRequireAtomicUpdatesEntry = () => require("./require-atomic-updates");

/**
 * Creates a map entry for the 'require-await' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createRequireAwaitEntry = () => require("./require-await");

/**
 * Creates a map entry for the 'require-unicode-regexp' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createRequireUnicodeRegexpEntry = () => require("./require-unicode-regexp");

/**
 * Creates a map entry for the 'require-yield' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createRequireYieldEntry = () => require("./require-yield");

/**
 * Creates a map entry for the 'rest-spread-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createRestSpreadSpacingEntry = () => require("./rest-spread-spacing");

/**
 * Creates a map entry for the 'semi' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSemiEntry = () => require("./semi");

/**
 * Creates a map entry for the 'semi-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSemiSpacingEntry = () => require("./semi-spacing");

/**
 * Creates a map entry for the 'semi-style' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSemiStyleEntry = () => require("./semi-style");

/**
 * Creates a map entry for the 'sort-imports' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSortImportsEntry = () => require("./sort-imports");

/**
 * Creates a map entry for the 'sort-keys' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSortKeysEntry = () => require("./sort-keys");

/**
 * Creates a map entry for the 'sort-vars' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSortVarsEntry = () => require("./sort-vars");

/**
 * Creates a map entry for the 'space-before-blocks' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSpaceBeforeBlocksEntry = () => require("./space-before-blocks");

/**
 * Creates a map entry for the 'space-before-function-paren' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSpaceBeforeFunctionParenEntry = () => require("./space-before-function-paren");

/**
 * Creates a map entry for the 'space-in-parens' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSpaceInParensEntry = () => require("./space-in-parens");

/**
 * Creates a map entry for the 'space-infix-ops' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSpaceInfixOpsEntry = () => require("./space-infix-ops");

/**
 * Creates a map entry for the 'space-unary-ops' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSpaceUnaryOpsEntry = () => require("./space-unary-ops");

/**
 * Creates a map entry for the 'spaced-comment' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSpacedCommentEntry = () => require("./spaced-comment");

/**
 * Creates a map entry for the 'strict' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createStrictEntry = () => require("./strict");

/**
 * Creates a map entry for the 'switch-colon-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSwitchColonSpacingEntry = () => require("./switch-colon-spacing");

/**
 * Creates a map entry for the 'symbol-description' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createSymbolDescriptionEntry = () => require("./symbol-description");

/**
 * Creates a map entry for the 'template-curly-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createTemplateCurlySpacingEntry = () => require("./template-curly-spacing");

/**
 * Creates a map entry for the 'template-tag-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createTemplateTagSpacingEntry = () => require("./template-tag-spacing");

/**
 * Creates a map entry for the 'unicode-bom' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createUnicodeBomEntry = () => require("./unicode-bom");

/**
 * Creates a map entry for the 'use-isnan' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createUseIsnanEntry = () => require("./use-isnan");

/**
 * Creates a map entry for the 'valid-typeof' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createValidTypeofEntry = () => require("./valid-typeof");

/**
 * Creates a map entry for the 'vars-on-top' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createVarsOnTopEntry = () => require("./vars-on-top");

/**
 * Creates a map entry for the 'wrap-iife' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createWrapIifeEntry = () => require("./wrap-iife");

/**
 * Creates a map entry for the 'wrap-regex' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createWrapRegexEntry = () => require("./wrap-regex");

/**
 * Creates a map entry for the 'yield-star-spacing' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createYieldStarSpacingEntry = () => require("./yield-star-spacing");

/**
 * Creates a map entry for the 'yoda' rule.
 * @returns {() => import("../types").Rule.RuleModule}
 */
const createYodaEntry = () => require("./yoda");

module.exports = new LazyLoadingRuleMap(
	Object.entries({
		"accessor-pairs": createAccessorPairsEntry,
		"array-bracket-newline": createArrayBracketNewlineEntry,
		"array-bracket-spacing": createArrayBracketSpacingEntry,
		"array-callback-return": createArrayCallbackReturnEntry,
		"array-element-newline": createArrayElementNewlineEntry,
		"arrow-body-style": createArrowBodyStyleEntry,
		"arrow-parens": createArrowParensEntry,
		"arrow-spacing": createArrowSpacingEntry,
		"block-scoped-var": createBlockScopedVarEntry,
		"block-spacing": createBlockSpacingEntry,
		"brace-style": createBraceStyleEntry,
		"callback-return": createCallbackReturnEntry,
		camelcase: createCamelcaseEntry,
		"capitalized-comments": createCapitalizedCommentsEntry,
		"class-methods-use-this": createClassMethodsUseThisEntry,
		"comma-dangle": createCommaDangleEntry,
		"comma-spacing": createCommaSpacingEntry,
		"comma-style": createCommaStyleEntry,
		complexity: createComplexityEntry,
		"computed-property-spacing": createComputedPropertySpacingEntry,
		"consistent-return": createConsistentReturnEntry,
		"consistent-this": createConsistentThisEntry,
		"constructor-super": createConstructorSuperEntry,
		curly: createCurlyEntry,
		"default-case": createDefaultCaseEntry,
		"default-case-last": createDefaultCaseLastEntry,
		"default-param-last": createDefaultParamLastEntry,
		"dot-location": createDotLocationEntry,
		"dot-notation": createDotNotationEntry,
		"eol-last": createEolLastEntry,
		eqeqeq: createEqeqeqEntry,
		"for-direction": createForDirectionEntry,
		"func-call-spacing": createFuncCallSpacingEntry,
		"func-name-matching": createFuncNameMatchingEntry,
		"func-names": createFuncNamesEntry,
		"func-style": createFuncStyleEntry,
		"function-call-argument-newline": createFunctionCallArgumentNewlineEntry,
		"function-paren-newline": createFunctionParenNewlineEntry,
		"generator-star-spacing": createGeneratorStarSpacingEntry,
		"getter-return": createGetterReturnEntry,
		"global-require": createGlobalRequireEntry,
		"grouped-accessor-pairs": createGroupedAccessorPairsEntry,
		"guard-for-in": createGuardForInEntry,
		"handle-callback-err": createHandleCallbackErrEntry,
		"id-blacklist": createIdBlacklistEntry,
		"id-denylist": createIdDenylistEntry,
		"id-length": createIdLengthEntry,
		"id-match": createIdMatchEntry,
		"implicit-arrow-linebreak": createImplicitArrowLinebreakEntry,
		indent: createIndentEntry,
		"indent-legacy": createIndentLegacyEntry,
		"init-declarations": createInitDeclarationsEntry,
		"jsx-quotes": createJsxQuotesEntry,
		"key-spacing": createKeySpacingEntry,
		"keyword-spacing": createKeywordSpacingEntry,
		"line-comment-position": createLineCommentPositionEntry,
		"linebreak-style": createLinebreakStyleEntry,
		"lines-around-comment": createLinesAroundCommentEntry,
		"lines-around-directive": createLinesAroundDirectiveEntry,
		"lines-between-class-members": createLinesBetweenClassMembersEntry,
		"logical-assignment-operators": createLogicalAssignmentOperatorsEntry,
		"max-classes-per-file": createMaxClassesPerFileEntry,
		"max-depth": createMaxDepthEntry,
		"max-len": createMaxLenEntry,
		"max-lines": createMaxLinesEntry,
		"max-lines-per-function": createMaxLinesPerFunctionEntry,
		"max-nested-callbacks": createMaxNestedCallbacksEntry,
		"max-params": createMaxParamsEntry,
		"max-statements": createMaxStatementsEntry,
		"max-statements-per-line": createMaxStatementsPerLineEntry,
		"multiline-comment-style": createMultilineCommentStyleEntry,
		"multiline-ternary": createMultilineTernaryEntry,
		"new-cap": createNewCapEntry,
		"new-parens": createNewParensEntry,
		"newline-after-var": createNewlineAfterVarEntry,
		"newline-before-return": createNewlineBeforeReturnEntry,
		"newline-per-chained-call": createNewlinePerChainedCallEntry,
		"no-alert": createNoAlertEntry,
		"no-array-constructor": createNoArrayConstructorEntry,
		"no-async-promise-executor": createNoAsyncPromiseExecutorEntry,
		"no-await-in-loop": createNoAwaitInLoopEntry,
		"no-bitwise": createNoBitwiseEntry,
		"no-buffer-constructor": createNoBufferConstructorEntry,
		"no-caller": createNoCallerEntry,
		"no-case-declarations": createNoCaseDeclarationsEntry,
		"no-catch-shadow": createNoCatchShadowEntry,
		"no-class-assign": createNoClassAssignEntry,
		"no-compare-neg-zero": createNoCompareNegZeroEntry,
		"no-cond-assign": createNoCondAssignEntry,
		"no-confusing-arrow": createNoConfusingArrowEntry,
		"no-console": createNoConsoleEntry,
		"no-const-assign": createNoConstAssignEntry,
		"no-constant-binary-expression": createNoConstantBinaryExpressionEntry,
		"no-constant-condition": createNoConstantConditionEntry,
		"no-constructor-return": createNoConstructorReturnEntry,
		"no-continue": createNoContinueEntry,
		"no-control-regex": createNoControlRegexEntry,
		"no-debugger": createNoDebuggerEntry,
		"no-delete-var": createNoDeleteVarEntry,
		"no-div-regex": createNoDivRegexEntry,
		"no-dupe-args": createNoDupeArgsEntry,
		"no-dupe-class-members": createNoDupeClassMembersEntry,
		"no-dupe-else-if": createNoDupeElseIfEntry,
		"no-dupe-keys": createNoDupeKeysEntry,
		"no-duplicate-case": createNoDuplicateCaseEntry,
		"no-duplicate-imports": createNoDuplicateImportsEntry,
		"no-else-return": createNoElseReturnEntry,
		"no-empty": createNoEmptyEntry,
		"no-empty-character-class": createNoEmptyCharacterClassEntry,
		"no-empty-function": createNoEmptyFunctionEntry,
		"no-empty-pattern": createNoEmptyPatternEntry,
		"no-empty-static-block": createNoEmptyStaticBlockEntry,
		"no-eq-null": createNoEqNullEntry,
		"no-eval": createNoEvalEntry,
		"no-ex-assign": createNoExAssignEntry,
		"no-extend-native": createNoExtendNativeEntry,
		"no-extra-bind": createNoExtraBindEntry,
		"no-extra-boolean-cast": createNoExtraBooleanCastEntry,
		"no-extra-label": createNoExtraLabelEntry,
		"no-extra-parens": createNoExtraParensEntry,
		"no-extra-semi": createNoExtraSemiEntry,
		"no-fallthrough": createNoFallthroughEntry,
		"no-floating-decimal": createNoFloatingDecimalEntry,
		"no-func-assign": createNoFuncAssignEntry,
		"no-global-assign": createNoGlobalAssignEntry,
		"no-implicit-coercion": createNoImplicitCoercionEntry,
		"no-implicit-globals": createNoImplicitGlobalsEntry,
		"no-implied-eval": createNoImpliedEvalEntry,
		"no-import-assign": createNoImportAssignEntry,
		"no-inline-comments": createNoInlineCommentsEntry,
		"no-inner-declarations": createNoInnerDeclarationsEntry,
		"no-invalid-regexp": createNoInvalidRegexEntry,
		"no-invalid-this": createNoInvalidThisEntry,
		"no-irregular-whitespace": createNoIrregularWhitespaceEntry,
		"no-iterator": createNoIteratorEntry,
		"no-label-var": createNoLabelVarEntry,
		"no-labels": createNoLabelsEntry,
		"no-lone-blocks": createNoLoneBlocksEntry,
		"no-lonely-if": createNoLonelyIfEntry,
		"no-loop-func": createNoLoopFuncEntry,
		"no-loss-of-precision": createNoLossOfPrecisionEntry,
		"no-magic-numbers": createNoMagicNumbersEntry,
		"no-misleading-character-class": createNoMisleadingCharacterClassEntry,
		"no-mixed-operators": createNoMixedOperatorsEntry,
		"no-mixed-requires": createNoMixedRequiresEntry,
		"no-mixed-spaces-and-tabs": createNoMixedSpacesAndTabsEntry,
		"no-multi-assign": createNoMultiAssignEntry,
		"no-multi-spaces": createNoMultiSpacesEntry,
		"no-multi-str": createNoMultiStrEntry,
		"no-multiple-empty-lines": createNoMultipleEmptyLinesEntry,
		"no-native-reassign": createNoNativeReassignEntry,
		"no-negated-condition": createNoNegatedConditionEntry,
		"no-negated-in-lhs": createNoNegatedInLhsEntry,
		"no-nested-ternary": createNoNestedTernaryEntry,
		"no-new": createNoNewEntry,
		"no-new-func": createNoNewFuncEntry,
		"no-new-native-nonconstructor": createNoNewNativeNonconstructorEntry,
		"no-new-object": createNoNewObjectEntry,
		"no-new-require": createNoNewRequireEntry,
		"no-new-symbol": createNoNewSymbolEntry,
		"no-new-wrappers": createNoNewWrappersEntry,
		"no-nonoctal-decimal-escape": createNoNonoctalDecimalEscapeEntry,
		"no-obj-calls": createNoObjCallsEntry,
		"no-object-constructor": createNoObjectConstructorEntry,
		"no-octal": createNoOctalEntry,
		"no-octal-escape": createNoOctalEscapeEntry,
		"no-param-reassign": createNoParamReassignEntry,
		"no-path-concat": createNoPathConcatEntry,
		"no-plusplus": createNoPlusplusEntry,
		"no-process-env": createNoProcessEnvEntry,
		"no-process-exit": createNoProcessExitEntry,
		"no-promise-executor-return": createNoPromiseExecutorReturnEntry,
		"no-proto": createNoProtoEntry,
		"no-prototype-builtins": createNoPrototypeBuiltinsEntry,
		"no-redeclare": createNoRedeclareEntry,
		"no-regex-spaces": createNoRegexSpacesEntry,
		"no-restricted-exports": createNoRestrictedExportsEntry,
		"no-restricted-globals": createNoRestrictedGlobalsEntry,
		"no-restricted-imports": createNoRestrictedImportsEntry,
		"no-restricted-modules": createNoRestrictedModulesEntry,
		"no-restricted-properties": createNoRestrictedPropertiesEntry,
		"no-restricted-syntax": createNoRestrictedSyntaxEntry,
		"no-return-assign": createNoReturnAssignEntry,
		"no-return-await": createNoReturnAwaitEntry,
		"no-script-url": createNoScriptUrlEntry,
		"no-self-assign": createNoSelfAssignEntry,
		"no-self-compare": createNoSelfCompareEntry,
		"no-sequences": createNoSequencesEntry,
		"no-setter-return": createNoSetterReturnEntry,
		"no-shadow": createNoShadowEntry,
		"no-shadow-restricted-names": createNoShadowRestrictedNamesEntry,
		"no-spaced-func": createNoSpacedFuncEntry,
		"no-sparse-arrays": createNoSparseArraysEntry,
		"no-sync": createNoSyncEntry,
		"no-tabs": createNoTabsEntry,
		"no-template-curly-in-string": createNoTemplateCurlyInStringEntry,
		"no-ternary": createNoTernaryEntry,
		"no-this-before-super": createNoThisBeforeSuperEntry,
		"no-throw-literal": createNoThrowLiteralEntry,
		"no-trailing-spaces": createNoTrailingSpacesEntry,
		"no-unassigned-vars": createNoUnassignedVarsEntry,
		"no-undef": createNoUndefEntry,
		"no-undef-init": createNoUndefInitEntry,
		"no-undefined": createNoUndefinedEntry,
		"no-underscore-dangle": createNoUnderscoreDangleEntry,
		"no-unexpected-multiline": createNoUnexpectedMultilineEntry,
		"no-unmodified-loop-condition": createNoUnmodifiedLoopConditionEntry,
		"no-unneeded-ternary": createNoUnneededTernaryEntry,
		"no-unreachable": createNoUnreachableEntry,
		"no-unreachable-loop": createNoUnreachableLoopEntry,
		"no-unsafe-finally": createNoUnsafeFinallyEntry,
		"no-unsafe-negation": createNoUnsafeNegationEntry,
		"no-unsafe-optional-chaining": createNoUnsafeOptionalChainingEntry,
		"no-unused-expressions": createNoUnusedExpressionsEntry,
		"no-unused-labels": createNoUnusedLabelsEntry,
		"no-unused-private-class-members": createNoUnusedPrivateClassMembersEntry,
		"no-unused-vars": createNoUnusedVarsEntry,
		"no-use-before-define": createNoUseBeforeDefineEntry,
		"no-useless-assignment": createNoUselessAssignmentEntry,
		"no-useless-backreference": createNoUselessBackreferenceEntry,
		"no-useless-call": createNoUselessCallEntry,
		"no-useless-catch": createNoUselessCatchEntry,
		"no-useless-computed-key": createNoUselessComputedKeyEntry,
		"no-useless-concat": createNoUselessConcatEntry,
		"no-useless-constructor": createNoUselessConstructorEntry,
		"no-useless-escape": createNoUselessEscapeEntry,
		"no-useless-rename": createNoUselessRenameEntry,
		"no-useless-return": createNoUselessReturnEntry,
		"no-var": createNoVarEntry,
		"no-void": createNoVoidEntry,
		"no-warning-comments": createNoWarningCommentsEntry,
		"no-whitespace-before-property": createNoWhitespaceBeforePropertyEntry,
		"no-with": createNoWithEntry,
		"nonblock-statement-body-position": createNonblockStatementBodyPositionEntry,
		"object-curly-newline": createObjectCurlyNewlineEntry,
		"object-curly-spacing": createObjectCurlySpacingEntry,
		"object-property-newline": createObjectPropertyNewlineEntry,
		"object-shorthand": createObjectShorthandEntry,
		"one-var": createOneVarEntry,
		"one-var-declaration-per-line": createOneVarDeclarationPerLineEntry,
		"operator-assignment": createOperatorAssignmentEntry,
		"operator-linebreak": createOperatorLinebreakEntry,
		"padded-blocks": createPaddedBlocksEntry,
		"padding-line-between-statements": createPaddingLineBetweenStatementsEntry,
		"prefer-arrow-callback": createPreferArrowCallbackEntry,
		"prefer-const": createPreferConstEntry,
		"prefer-destructuring": createPreferDestructuringEntry,
		"prefer-exponentiation-operator": createPreferExponentiationOperatorEntry,
		"prefer-named-capture-group": createPreferNamedCaptureGroupEntry,
		"prefer-numeric-literals": createPreferNumericLiteralsEntry,
		"prefer-object-has-own": createPreferObjectHasOwnEntry,
		"prefer-object-spread": createPreferObjectSpreadEntry,
		"prefer-promise-reject-errors": createPreferPromiseRejectErrorsEntry,
		"prefer-reflect": createPreferReflectEntry,
		"prefer-regex-literals": createPreferRegexLiteralsEntry,
		"prefer-rest-params": createPreferRestParamsEntry,
		"prefer-spread": createPreferSpreadEntry,
		"prefer-template": createPreferTemplateEntry,
		"preserve-caught-error": createPreserveCaughtErrorEntry,
		"quote-props": createQuotePropsEntry,
		quotes: createQuotesEntry,
		radix: createRadixEntry,
		"require-atomic-updates": createRequireAtomicUpdatesEntry,
		"require-await": createRequireAwaitEntry,
		"require-unicode-regexp": createRequireUnicodeRegexpEntry,
		"require-yield": createRequireYieldEntry,
		"rest-spread-spacing": createRestSpreadSpacingEntry,
		semi: createSemiEntry,
		"semi-spacing": createSemiSpacingEntry,
		"semi-style": createSemiStyleEntry,
		"sort-imports": createSortImportsEntry,
		"sort-keys": createSortKeysEntry,
		"sort-vars": createSortVarsEntry,
		"space-before-blocks": createSpaceBeforeBlocksEntry,
		"space-before-function-paren": createSpaceBeforeFunctionParenEntry,
		"space-in-parens": createSpaceInParensEntry,
		"space-infix-ops": createSpaceInfixOpsEntry,
		"space-unary-ops": createSpaceUnaryOpsEntry,
		"spaced-comment": createSpacedCommentEntry,
		strict: createStrictEntry,
		"switch-colon-spacing": createSwitchColonSpacingEntry,
		"symbol-description": createSymbolDescriptionEntry,
		"template-curly-spacing": createTemplateCurlySpacingEntry,
		"template-tag-spacing": createTemplateTagSpacingEntry,
		"unicode-bom": createUnicodeBomEntry,
		"use-isnan": createUseIsnanEntry,
		"valid-typeof": createValidTypeofEntry,
		"vars-on-top": createVarsOnTopEntry,
		"wrap-iife": createWrapIifeEntry,
		"wrap-regex": createWrapRegexEntry,
		"yield-star-spacing": createYieldStarSpacingEntry,
		yoda: createYodaEntry,
	}),
);