/**
 * @fileoverview Collects the built-in rules into a map structure so that they can be imported all at once and without
 * using the file-system directly.
 * @author Peter (Somogyvari) Metz
 */

"use strict";

/* eslint sort-keys: ["error", "asc"] -- More readable for long list */

const { LazyLoadingRuleMap } = require("./utils/lazy-loading-rule-map");

/**
 * Creates a map of rule names to their respective modules.
 * @returns {Map<string, import("../types").Rule.RuleModule>} A map of rule names to their respective modules.
 */
function createRuleMap() {
  const ruleMap = new Map();

  /**
   * Adds a rule to the map.
   * @param {string} ruleName The name of the rule.
   * @param {import("../types").Rule.RuleModule} ruleModule The module for the rule.
   */
  function addRule(ruleName, ruleModule) {
    ruleMap.set(ruleName, ruleModule);
  }

  // Accessor rules
  addRule("accessor-pairs", () => require("./accessor-pairs"));
  addRule("grouped-accessor-pairs", () => require("./grouped-accessor-pairs"));

  // Array rules
  addRule("array-bracket-newline", () => require("./array-bracket-newline"));
  addRule("array-bracket-spacing", () => require("./array-bracket-spacing"));
  addRule("array-callback-return", () => require("./array-callback-return"));
  addRule("array-element-newline", () => require("./array-element-newline"));

  // Arrow rules
  addRule("arrow-body-style", () => require("./arrow-body-style"));
  addRule("arrow-parens", () => require("./arrow-parens"));
  addRule("arrow-spacing", () => require("./arrow-spacing"));

  // Block rules
  addRule("block-scoped-var", () => require("./block-scoped-var"));
  addRule("block-spacing", () => require("./block-spacing"));

  // Brace rules
  addRule("brace-style", () => require("./brace-style"));

  // Callback rules
  addRule("callback-return", () => require("./callback-return"));

  // Class rules
  addRule("class-methods-use-this", () => require("./class-methods-use-this"));
  addRule("constructor-super", () => require("./constructor-super"));
  addRule("no-class-assign", () => require("./no-class-assign"));

  // Comment rules
  addRule("capitalized-comments", () => require("./capitalized-comments"));
  addRule("line-comment-position", () => require("./line-comment-position"));
  addRule("lines-around-comment", () => require("./lines-around-comment"));
  addRule("spaced-comment", () => require("./spaced-comment"));

  // Complexity rules
  addRule("complexity", () => require("./complexity"));

  // Computed property rules
  addRule("computed-property-spacing", () => require("./computed-property-spacing"));

  // Consistent rules
  addRule("consistent-return", () => require("./consistent-return"));
  addRule("consistent-this", () => require("./consistent-this"));

  // Default rules
  addRule("default-case", () => require("./default-case"));
  addRule("default-case-last", () => require("./default-case-last"));
  addRule("default-param-last", () => require("./default-param-last"));

  // Dot rules
  addRule("dot-location", () => require("./dot-location"));
  addRule("dot-notation", () => require("./dot-notation"));

  // EOL rules
  addRule("eol-last", () => require("./eol-last"));

  // Equality rules
  addRule("eqeqeq", () => require("./eqeqeq"));
  addRule("no-eq-null", () => require("./no-eq-null"));

  // Error rules
  addRule("no-throw-literal", () => require("./no-throw-literal"));

  // Eval rules
  addRule("no-eval", () => require("./no-eval"));

  // Export rules
  addRule("no-restricted-exports", () => require("./no-restricted-exports"));

  // Function rules
  addRule("func-call-spacing", () => require("./func-call-spacing"));
  addRule("func-name-matching", () => require("./func-name-matching"));
  addRule("func-names", () => require("./func-names"));
  addRule("func-style", () => require("./func-style"));
  addRule("function-call-argument-newline", () => require("./function-call-argument-newline"));
  addRule("function-paren-newline", () => require("./function-paren-newline"));

  // Global rules
  addRule("no-global-assign", () => require("./no-global-assign"));
  addRule("no-implicit-globals", () => require("./no-implicit-globals"));

  // Identifier rules
  addRule("id-blacklist", () => require("./id-blacklist"));
  addRule("id-denylist", () => require("./id-denylist"));
  addRule("id-length", () => require("./id-length"));
  addRule("id-match", () => require("./id-match"));

  // Import rules
  addRule("no-import-assign", () => require("./no-import-assign"));
  addRule("no-restricted-imports", () => require("./no-restricted-imports"));

  // Indentation rules
  addRule("indent", () => require("./indent"));
  addRule("indent-legacy", () => require("./indent-legacy"));

  // Keyword rules
  addRule("keyword-spacing", () => require("./keyword-spacing"));

  // Line rules
  addRule("linebreak-style", () => require("./linebreak-style"));
  addRule("lines-around-directive", () => require("./lines-around-directive"));
  addRule("lines-between-class-members", () => require("./lines-between-class-members"));

  // Logical rules
  addRule("logical-assignment-operators", () => require("./logical-assignment-operators"));

  // Max rules
  addRule("max-classes-per-file", () => require("./max-classes-per-file"));
  addRule("max-depth", () => require("./max-depth"));
  addRule("max-len", () => require("./max-len"));
  addRule("max-lines", () => require("./max-lines"));
  addRule("max-lines-per-function", () => require("./max-lines-per-function"));
  addRule("max-nested-callbacks", () => require("./max-nested-callbacks"));
  addRule("max-params", () => require("./max-params"));
  addRule("max-statements", () => require("./max-statements"));
  addRule("max-statements-per-line", () => require("./max-statements-per-line"));

  // Multiline rules
  addRule("multiline-comment-style", () => require("./multiline-comment-style"));
  addRule("multiline-ternary", () => require("./multiline-ternary"));

  // New rules
  addRule("new-cap", () => require("./new-cap"));
  addRule("new-parens", () => require("./new-parens"));
  addRule("no-new", () => require("./no-new"));
  addRule("no-new-func", () => require("./no-new-func"));
  addRule("no-new-native-nonconstructor", () => require("./no-new-native-nonconstructor"));
  addRule("no-new-object", () => require("./no-new-object"));
  addRule("no-new-require", () => require("./no-new-require"));
  addRule("no-new-symbol", () => require("./no-new-symbol"));
  addRule("no-new-wrappers", () => require("./no-new-wrappers"));

  // No rules
  addRule("no-alert", () => require("./no-alert"));
  addRule("no-array-constructor", () => require("./no-array-constructor"));
  addRule("no-async-promise-executor", () => require("./no-async-promise-executor"));
  addRule("no-await-in-loop", () => require("./no-await-in-loop"));
  addRule("no-bitwise", () => require("./no-bitwise"));
  addRule("no-buffer-constructor", () => require("./no-buffer-constructor"));
  addRule("no-caller", () => require("./no-caller"));
  addRule("no-case-declarations", () => require("./no-case-declarations"));
  addRule("no-catch-shadow", () => require("./no-catch-shadow"));
  addRule("no-class-assign", () => require("./no-class-assign"));
  addRule("no-compare-neg-zero", () => require("./no-compare-neg-zero"));
  addRule("no-cond-assign", () => require("./no-cond-assign"));
  addRule("no-confusing-arrow", () => require("./no-confusing-arrow"));
  addRule("no-console", () => require("./no-console"));
  addRule("no-const-assign", () => require("./no-const-assign"));
  addRule("no-constant-binary-expression", () => require("./no-constant-binary-expression"));
  addRule("no-constant-condition", () => require("./no-constant-condition"));
  addRule("no-constructor-return", () => require("./no-constructor-return"));
  addRule("no-continue", () => require("./no-continue"));
  addRule("no-control-regex", () => require("./no-control-regex"));
  addRule("no-debugger", () => require("./no-debugger"));
  addRule("no-delete-var", () => require("./no-delete-var"));
  addRule("no-div-regex", () => require("./no-div-regex"));
  addRule("no-dupe-args", () => require("./no-dupe-args"));
  addRule("no-dupe-class-members", () => require("./no-dupe-class-members"));
  addRule("no-dupe-else-if", () => require("./no-dupe-else-if"));
  addRule("no-dupe-keys", () => require("./no-dupe-keys"));
  addRule("no-duplicate-case", () => require("./no-duplicate-case"));
  addRule("no-duplicate-imports", () => require("./no-duplicate-imports"));
  addRule("no-else-return", () => require("./no-else-return"));
  addRule("no-empty", () => require("./no-empty"));
  addRule("no-empty-character-class", () => require("./no-empty-character-class"));
  addRule("no-empty-function", () => require("./no-empty-function"));
  addRule("no-empty-pattern", () => require("./no-empty-pattern"));
  addRule("no-empty-static-block", () => require("./no-empty-static-block"));
  addRule("no-eq-null", () => require("./no-eq-null"));
  addRule("no-eval", () => require("./no-eval"));
  addRule("no-ex-assign", () => require("./no-ex-assign"));
  addRule("no-extend-native", () => require("./no-extend-native"));
  addRule("no-extra-bind", () => require("./no-extra-bind"));
  addRule("no-extra-boolean-cast", () => require("./no-extra-boolean-cast"));
  addRule("no-extra-label", () => require("./no-extra-label"));
  addRule("no-extra-parens", () => require("./no-extra-parens"));
  addRule("no-extra-semi", () => require("./no-extra-semi"));
  addRule("no-fallthrough", () => require("./no-fallthrough"));
  addRule("no-floating-decimal", () => require("./no-floating-decimal"));
  addRule("no-func-assign", () => require("./no-func-assign"));
  addRule("no-global-assign", () => require("./no-global-assign"));
  addRule("no-implicit-coercion", () => require("./no-implicit-coercion"));
  addRule("no-implicit-globals", () => require("./no-implicit-globals"));
  addRule("no-implied-eval", () => require("./no-implied-eval"));
  addRule("no-import-assign", () => require("./no-import-assign"));
  addRule("no-inline-comments", () => require("./no-inline-comments"));
  addRule("no-inner-declarations", () => require("./no-inner-declarations"));
  addRule("no-invalid-regexp", () => require("./no-invalid-regexp"));
  addRule("no-invalid-this", () => require("./no-invalid-this"));
  addRule("no-irregular-whitespace", () => require("./no-irregular-whitespace"));
  addRule("no-iterator", () => require("./no-iterator"));
  addRule("no-label-var", () => require("./no-label-var"));
  addRule("no-labels", () => require("./no-labels"));
  addRule("no-lone-blocks", () => require("./no-lone-blocks"));
  addRule("no-lonely-if", () => require("./no-lonely-if"));
  addRule("no-loop-func", () => require("./no-loop-func"));
  addRule("no-loss-of-precision", () => require("./no-loss-of-precision"));
  addRule("no-magic-numbers", () => require("./no-magic-numbers"));
  addRule("no-misleading-character-class", () => require("./no-misleading-character-class"));
  addRule("no-mixed-operators", () => require("./no-mixed-operators"));
  addRule("no-mixed-requires", () => require("./no-mixed-requires"));
  addRule("no-mixed-spaces-and-tabs", () => require("./no-mixed-spaces-and-tabs"));
  addRule("no-multi-assign", () => require("./no-multi-assign"));
  addRule("no-multi-spaces", () => require("./no-multi-spaces"));
  addRule("no-multi-str", () => require("./no-multi-str"));
  addRule("no-multiple-empty-lines", () => require("./no-multiple-empty-lines"));
  addRule("no-native-reassign", () => require("./no-native-reassign"));
  addRule("no-negated-condition", () => require("./no-negated-condition"));
  addRule("no-negated-in-lhs", () => require("./no-negated-in-lhs"));
  addRule("no-nested-ternary", () => require("./no-nested-ternary"));
  addRule("no-new", () => require("./no-new"));
  addRule("no-new-func", () => require("./no-new-func"));
  addRule("no-new-native-nonconstructor", () => require("./no-new-native-nonconstructor"));
  addRule("no-new-object", () => require("./no-new-object"));
  addRule("no-new-require", () => require("./no-new-require"));
  addRule("no-new-symbol", () => require("./no-new-symbol"));
  addRule("no-new-wrappers", () => require("./no-new-wrappers"));
  addRule("no-nonoctal-decimal-escape", () => require("./no-nonoctal-decimal-escape"));
  addRule("no-obj-calls", () => require("./no-obj-calls"));
  addRule("no-object-constructor", () => require("./no-object-constructor"));
  addRule("no-octal", () => require("./no-octal"));
  addRule("no-octal-escape", () => require("./no-octal-escape"));
  addRule("no-param-reassign", () => require("./no-param-reassign"));
  addRule("no-path-concat", () => require("./no-path-concat"));
  addRule("no-plusplus", () => require("./no-plusplus"));
  addRule("no-process-env", () => require("./no-process-env"));
  addRule("no-process-exit", () => require("./no-process-exit"));
  addRule("no-promise-executor-return", () => require("./no-promise-executor-return"));
  addRule("no-proto", () => require("./no-proto"));
  addRule("no-prototype-builtins", () => require("./no-prototype-builtins"));
  addRule("no-redeclare", () => require("./no-redeclare"));
  addRule("no-regex-spaces", () => require("./no-regex-spaces"));
  addRule("no-restricted-exports", () => require("./no-restricted-exports"));
  addRule("no-restricted-globals", () => require("./no-restricted-globals"));
  addRule("no-restricted-imports", () => require("./no-restricted-imports"));
  addRule("no-restricted-modules", () => require("./no-restricted-modules"));
  addRule("no-restricted-properties", () => require("./no-restricted-properties"));
  addRule("no-restricted-syntax", () => require("./no-restricted-syntax"));
  addRule("no-return-assign", () => require("./no-return-assign"));
  addRule("no-return-await", () => require("./no-return-await"));
  addRule("no-script-url", () => require("./no-script-url"));
  addRule("no-self-assign", () => require("./no-self-assign"));
  addRule("no-self-compare", () => require("./no-self-compare"));
  addRule("no-sequences", () => require("./no-sequences"));
  addRule("no-setter-return", () => require("./no-setter-return"));
  addRule("no-shadow", () => require("./no-shadow"));
  addRule("no-shadow-restricted-names", () => require("./no-shadow-restricted-names"));
  addRule("no-spaced-func", () => require("./no-spaced-func"));
  addRule("no-sparse-arrays", () => require("./no-sparse-arrays"));
  addRule("no-sync", () => require("./no-sync"));
  addRule("no-tabs", () => require("./no-tabs"));
  addRule("no-template-curly-in-string", () => require("./no-template-curly-in-string"));
  addRule("no-ternary", () => require("./no-ternary"));
  addRule("no-this-before-super", () => require("./no-this-before-super"));
  addRule("no-throw-literal", () => require("./no-throw-literal"));
  addRule("no-trailing-spaces", () => require("./no-trailing-spaces"));
  addRule("no-unassigned-vars", () => require("./no-unassigned-vars"));
  addRule("no-undef", () => require("./no-undef"));
  addRule("no-undef-init", () => require("./no-undef-init"));
  addRule("no-undefined", () => require("./no-undefined"));
  addRule("no-underscore-dangle", () => require("./no-underscore-dangle"));
  addRule("no-unexpected-multiline", () => require("./no-unexpected-multiline"));
  addRule("no-unmodified-loop-condition", () => require("./no-unmodified-loop-condition"));
  addRule("no-unneeded-ternary", () => require("./no-unneeded-ternary"));
  addRule("no-unreachable", () => require("./no-unreachable"));
  addRule("no-unreachable-loop", () => require("./no-unreachable-loop"));
  addRule("no-unsafe-finally", () => require("./no-unsafe-finally"));
  addRule("no-unsafe-negation", () => require("./no-unsafe-negation"));
  addRule("no-unsafe-optional-chaining", () => require("./no-unsafe-optional-chaining"));
  addRule("no-unused-expressions", () => require("./no-unused-expressions"));
  addRule("no-unused-labels", () => require("./no-unused-labels"));
  addRule("no-unused-private-class-members", () => require("./no-unused-private-class-members"));
  addRule("no-unused-vars", () => require("./no-unused-vars"));
  addRule("no-use-before-define", () => require("./no-use-before-define"));
  addRule("no-useless-assignment", () => require("./no-useless-assignment"));
  addRule("no-useless-backreference", () => require("./no-useless-backreference"));
  addRule("no-useless-call", () => require("./no-useless-call"));
  addRule("no-useless-catch", () => require("./no-useless-catch"));
  addRule("no-useless-computed-key", () => require("./no-useless-computed-key"));
  addRule("no-useless-concat", () => require("./no-useless-concat"));
  addRule("no-useless-constructor", () => require("./no-useless-constructor"));
  addRule("no-useless-escape", () => require("./no-useless-escape"));
  addRule("no-useless-rename", () => require("./no-useless-rename"));
  addRule("no-useless-return", () => require("./no-useless-return"));
  addRule("no-var", () => require("./no-var"));
  addRule("no-void", () => require("./no-void"));
  addRule("no-warning-comments", () => require("./no-warning-comments"));
  addRule("no-whitespace-before-property", () => require("./no-whitespace-before-property"));
  addRule("no-with", () => require("./no-with"));

  // Object rules
  addRule("object-curly-newline", () => require("./object-curly-newline"));
  addRule("object-curly-spacing", () => require("./object-curly-spacing"));
  addRule("object-property-newline", () => require("./object-property-newline"));
  addRule("object-shorthand", () => require("./object-shorthand"));

  // One rules
  addRule("one-var", () => require("./one-var"));
  addRule("one-var-declaration-per-line", () => require("./one-var-declaration-per-line"));

  // Operator rules
  addRule("operator-assignment", () => require("./operator-assignment"));
  addRule("operator-linebreak", () => require("./operator-linebreak"));

  // Padded rules
  addRule("padded-blocks", () => require("./padded-blocks"));
  addRule("padding-line-between-statements", () => require("./padding-line-between-statements"));

  // Prefer rules
  addRule("prefer-arrow-callback", () => require("./prefer-arrow-callback"));
  addRule("prefer-const", () => require("./prefer-const"));
  addRule("prefer-destructuring", () => require("./prefer-destructuring"));
  addRule("prefer-exponentiation-operator", () => require("./prefer-exponentiation-operator"));
  addRule("prefer-named-capture-group", () => require("./prefer-named-capture-group"));
  addRule("prefer-numeric-literals", () => require("./prefer-numeric-literals"));
  addRule("prefer-object-has-own", () => require("./prefer-object-has-own"));
  addRule("prefer-object-spread", () => require("./prefer-object-spread"));
  addRule("prefer-promise-reject-errors", () => require("./prefer-promise-reject-errors"));
  addRule("prefer-reflect", () => require("./prefer-reflect"));
  addRule("prefer-regex-literals", () => require("./prefer-regex-literals"));
  addRule("prefer-rest-params", () => require("./prefer-rest-params"));
  addRule("prefer-spread", () => require("./prefer-spread"));
  addRule("prefer-template", () => require("./prefer-template"));

  // Quote rules
  addRule("quote-props", () => require("./quote-props"));
  addRule("quotes", () => require("./quotes"));

  // Radix rules
  addRule("radix", () => require("./radix"));

  // Require rules
  addRule("require-atomic-updates", () => require("./require-atomic-updates"));
  addRule("require-await", () => require("./require-await"));
  addRule("require-unicode-regexp", () => require("./require-unicode-regexp"));
  addRule("require-yield", () => require("./require-yield"));

  // Rest rules
  addRule("rest-spread-spacing", () => require("./rest-spread-spacing"));

  // Semi rules
  addRule("semi", () => require("./semi"));
  addRule("semi-spacing", () => require("./semi-spacing"));
  addRule("semi-style", () => require("./semi-style"));

  // Sort rules
  addRule("sort-imports", () => require("./sort-imports"));
  addRule("sort-keys", () => require("./sort-keys"));
  addRule("sort-vars", () => require("./sort-vars"));

  // Space rules
  addRule("space-before-blocks", () => require("./space-before-blocks"));
  addRule("space-before-function-paren", () => require("./space-before-function-paren"));
  addRule("space-in-parens", () => require("./space-in-parens"));
  addRule("space-infix-ops", () => require("./space-infix-ops"));
  addRule("space-unary-ops", () => require("./space-unary-ops"));

  // Strict rules
  addRule("strict", () => require("./strict"));

  // Switch rules
  addRule("switch-colon-spacing", () => require("./switch-colon-spacing"));

  // Symbol rules
  addRule("symbol-description", () => require("./symbol-description"));

  // Template rules
  addRule("template-curly-spacing", () => require("./template-curly-spacing"));
  addRule("template-tag-spacing", () => require("./template-tag-spacing"));

  // Unicode rules
  addRule("unicode-bom", () => require("./unicode-bom"));

  // Use rules
  addRule("use-isnan", () => require("./use-isnan"));

  // Valid rules
  addRule("valid-typeof", () => require("./valid-typeof"));

  // Var rules
  addRule("vars-on-top", () => require("./vars-on-top"));

  // Wrap rules
  addRule("wrap-iife", () => require("./wrap-iife"));
  addRule("wrap-regex", () => require("./wrap-regex"));

  // Yield rules
  addRule("yield-star-spacing", () => require("./yield-star-spacing"));

  // Yoda rules
  addRule("yoda", () => require("./yoda"));

  return ruleMap;
}

module.exports = new LazyLoadingRuleMap(createRuleMap());