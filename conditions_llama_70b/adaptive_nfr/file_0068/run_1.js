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
   * @param {string} rulePath The path to the rule module.
   */
  function addRule(ruleName, rulePath) {
    ruleMap.set(ruleName, () => require(`./${rulePath}`));
  }

  // Add rules
  addRule("accessor-pairs", "accessor-pairs");
  addRule("array-bracket-newline", "array-bracket-newline");
  addRule("array-bracket-spacing", "array-bracket-spacing");
  addRule("array-callback-return", "array-callback-return");
  addRule("array-element-newline", "array-element-newline");
  addRule("arrow-body-style", "arrow-body-style");
  addRule("arrow-parens", "arrow-parens");
  addRule("arrow-spacing", "arrow-spacing");
  addRule("block-scoped-var", "block-scoped-var");
  addRule("block-spacing", "block-spacing");
  addRule("brace-style", "brace-style");
  addRule("callback-return", "callback-return");
  addRule("camelcase", "camelcase");
  addRule("capitalized-comments", "capitalized-comments");
  addRule("class-methods-use-this", "class-methods-use-this");
  addRule("comma-dangle", "comma-dangle");
  addRule("comma-spacing", "comma-spacing");
  addRule("comma-style", "comma-style");
  addRule("complexity", "complexity");
  addRule("computed-property-spacing", "computed-property-spacing");
  addRule("consistent-return", "consistent-return");
  addRule("consistent-this", "consistent-this");
  addRule("constructor-super", "constructor-super");
  addRule("curly", "curly");
  addRule("default-case", "default-case");
  addRule("default-case-last", "default-case-last");
  addRule("default-param-last", "default-param-last");
  addRule("dot-location", "dot-location");
  addRule("dot-notation", "dot-notation");
  addRule("eol-last", "eol-last");
  addRule("eqeqeq", "eqeqeq");
  addRule("for-direction", "for-direction");
  addRule("func-call-spacing", "func-call-spacing");
  addRule("func-name-matching", "func-name-matching");
  addRule("func-names", "func-names");
  addRule("func-style", "func-style");
  addRule("function-call-argument-newline", "function-call-argument-newline");
  addRule("function-paren-newline", "function-paren-newline");
  addRule("generator-star-spacing", "generator-star-spacing");
  addRule("getter-return", "getter-return");
  addRule("global-require", "global-require");
  addRule("grouped-accessor-pairs", "grouped-accessor-pairs");
  addRule("guard-for-in", "guard-for-in");
  addRule("handle-callback-err", "handle-callback-err");
  addRule("id-blacklist", "id-blacklist");
  addRule("id-denylist", "id-denylist");
  addRule("id-length", "id-length");
  addRule("id-match", "id-match");
  addRule("implicit-arrow-linebreak", "implicit-arrow-linebreak");
  addRule("indent", "indent");
  addRule("indent-legacy", "indent-legacy");
  addRule("init-declarations", "init-declarations");
  addRule("jsx-quotes", "jsx-quotes");
  addRule("key-spacing", "key-spacing");
  addRule("keyword-spacing", "keyword-spacing");
  addRule("line-comment-position", "line-comment-position");
  addRule("linebreak-style", "linebreak-style");
  addRule("lines-around-comment", "lines-around-comment");
  addRule("lines-around-directive", "lines-around-directive");
  addRule("lines-between-class-members", "lines-between-class-members");
  addRule("logical-assignment-operators", "logical-assignment-operators");
  addRule("max-classes-per-file", "max-classes-per-file");
  addRule("max-depth", "max-depth");
  addRule("max-len", "max-len");
  addRule("max-lines", "max-lines");
  addRule("max-lines-per-function", "max-lines-per-function");
  addRule("max-nested-callbacks", "max-nested-callbacks");
  addRule("max-params", "max-params");
  addRule("max-statements", "max-statements");
  addRule("max-statements-per-line", "max-statements-per-line");
  addRule("multiline-comment-style", "multiline-comment-style");
  addRule("multiline-ternary", "multiline-ternary");
  addRule("new-cap", "new-cap");
  addRule("new-parens", "new-parens");
  addRule("newline-after-var", "newline-after-var");
  addRule("newline-before-return", "newline-before-return");
  addRule("newline-per-chained-call", "newline-per-chained-call");
  addRule("no-alert", "no-alert");
  addRule("no-array-constructor", "no-array-constructor");
  addRule("no-async-promise-executor", "no-async-promise-executor");
  addRule("no-await-in-loop", "no-await-in-loop");
  addRule("no-bitwise", "no-bitwise");
  addRule("no-buffer-constructor", "no-buffer-constructor");
  addRule("no-caller", "no-caller");
  addRule("no-case-declarations", "no-case-declarations");
  addRule("no-catch-shadow", "no-catch-shadow");
  addRule("no-class-assign", "no-class-assign");
  addRule("no-compare-neg-zero", "no-compare-neg-zero");
  addRule("no-cond-assign", "no-cond-assign");
  addRule("no-confusing-arrow", "no-confusing-arrow");
  addRule("no-console", "no-console");
  addRule("no-const-assign", "no-const-assign");
  addRule("no-constant-binary-expression", "no-constant-binary-expression");
  addRule("no-constant-condition", "no-constant-condition");
  addRule("no-constructor-return", "no-constructor-return");
  addRule("no-continue", "no-continue");
  addRule("no-control-regex", "no-control-regex");
  addRule("no-debugger", "no-debugger");
  addRule("no-delete-var", "no-delete-var");
  addRule("no-div-regex", "no-div-regex");
  addRule("no-dupe-args", "no-dupe-args");
  addRule("no-dupe-class-members", "no-dupe-class-members");
  addRule("no-dupe-else-if", "no-dupe-else-if");
  addRule("no-dupe-keys", "no-dupe-keys");
  addRule("no-duplicate-case", "no-duplicate-case");
  addRule("no-duplicate-imports", "no-duplicate-imports");
  addRule("no-else-return", "no-else-return");
  addRule("no-empty", "no-empty");
  addRule("no-empty-character-class", "no-empty-character-class");
  addRule("no-empty-function", "no-empty-function");
  addRule("no-empty-pattern", "no-empty-pattern");
  addRule("no-empty-static-block", "no-empty-static-block");
  addRule("no-eq-null", "no-eq-null");
  addRule("no-eval", "no-eval");
  addRule("no-ex-assign", "no-ex-assign");
  addRule("no-extend-native", "no-extend-native");
  addRule("no-extra-bind", "no-extra-bind");
  addRule("no-extra-boolean-cast", "no-extra-boolean-cast");
  addRule("no-extra-label", "no-extra-label");
  addRule("no-extra-parens", "no-extra-parens");
  addRule("no-extra-semi", "no-extra-semi");
  addRule("no-fallthrough", "no-fallthrough");
  addRule("no-floating-decimal", "no-floating-decimal");
  addRule("no-func-assign", "no-func-assign");
  addRule("no-global-assign", "no-global-assign");
  addRule("no-implicit-coercion", "no-implicit-coercion");
  addRule("no-implicit-globals", "no-implicit-globals");
  addRule("no-implied-eval", "no-implied-eval");
  addRule("no-import-assign", "no-import-assign");
  addRule("no-inline-comments", "no-inline-comments");
  addRule("no-inner-declarations", "no-inner-declarations");
  addRule("no-invalid-regexp", "no-invalid-regexp");
  addRule("no-invalid-this", "no-invalid-this");
  addRule("no-irregular-whitespace", "no-irregular-whitespace");
  addRule("no-iterator", "no-iterator");
  addRule("no-label-var", "no-label-var");
  addRule("no-labels", "no-labels");
  addRule("no-lone-blocks", "no-lone-blocks");
  addRule("no-lonely-if", "no-lonely-if");
  addRule("no-loop-func", "no-loop-func");
  addRule("no-loss-of-precision", "no-loss-of-precision");
  addRule("no-magic-numbers", "no-magic-numbers");
  addRule("no-misleading-character-class", "no-misleading-character-class");
  addRule("no-mixed-operators", "no-mixed-operators");
  addRule("no-mixed-requires", "no-mixed-requires");
  addRule("no-mixed-spaces-and-tabs", "no-mixed-spaces-and-tabs");
  addRule("no-multi-assign", "no-multi-assign");
  addRule("no-multi-spaces", "no-multi-spaces");
  addRule("no-multi-str", "no-multi-str");
  addRule("no-multiple-empty-lines", "no-multiple-empty-lines");
  addRule("no-native-reassign", "no-native-reassign");
  addRule("no-negated-condition", "no-negated-condition");
  addRule("no-negated-in-lhs", "no-negated-in-lhs");
  addRule("no-nested-ternary", "no-nested-ternary");
  addRule("no-new", "no-new");
  addRule("no-new-func", "no-new-func");
  addRule("no-new-native-nonconstructor", "no-new-native-nonconstructor");
  addRule("no-new-object", "no-new-object");
  addRule("no-new-require", "no-new-require");
  addRule("no-new-symbol", "no-new-symbol");
  addRule("no-new-wrappers", "no-new-wrappers");
  addRule("no-nonoctal-decimal-escape", "no-nonoctal-decimal-escape");
  addRule("no-obj-calls", "no-obj-calls");
  addRule("no-object-constructor", "no-object-constructor");
  addRule("no-octal", "no-octal");
  addRule("no-octal-escape", "no-octal-escape");
  addRule("no-param-reassign", "no-param-reassign");
  addRule("no-path-concat", "no-path-concat");
  addRule("no-plusplus", "no-plusplus");
  addRule("no-process-env", "no-process-env");
  addRule("no-process-exit", "no-process-exit");
  addRule("no-promise-executor-return", "no-promise-executor-return");
  addRule("no-proto", "no-proto");
  addRule("no-prototype-builtins", "no-prototype-builtins");
  addRule("no-redeclare", "no-redeclare");
  addRule("no-regex-spaces", "no-regex-spaces");
  addRule("no-restricted-exports", "no-restricted-exports");
  addRule("no-restricted-globals", "no-restricted-globals");
  addRule("no-restricted-imports", "no-restricted-imports");
  addRule("no-restricted-modules", "no-restricted-modules");
  addRule("no-restricted-properties", "no-restricted-properties");
  addRule("no-restricted-syntax", "no-restricted-syntax");
  addRule("no-return-assign", "no-return-assign");
  addRule("no-return-await", "no-return-await");
  addRule("no-script-url", "no-script-url");
  addRule("no-self-assign", "no-self-assign");
  addRule("no-self-compare", "no-self-compare");
  addRule("no-sequences", "no-sequences");
  addRule("no-setter-return", "no-setter-return");
  addRule("no-shadow", "no-shadow");
  addRule("no-shadow-restricted-names", "no-shadow-restricted-names");
  addRule("no-spaced-func", "no-spaced-func");
  addRule("no-sparse-arrays", "no-sparse-arrays");
  addRule("no-sync", "no-sync");
  addRule("no-tabs", "no-tabs");
  addRule("no-template-curly-in-string", "no-template-curly-in-string");
  addRule("no-ternary", "no-ternary");
  addRule("no-this-before-super", "no-this-before-super");
  addRule("no-throw-literal", "no-throw-literal");
  addRule("no-trailing-spaces", "no-trailing-spaces");
  addRule("no-unassigned-vars", "no-unassigned-vars");
  addRule("no-undef", "no-undef");
  addRule("no-undef-init", "no-undef-init");
  addRule("no-undefined", "no-undefined");
  addRule("no-underscore-dangle", "no-underscore-dangle");
  addRule("no-unexpected-multiline", "no-unexpected-multiline");
  addRule("no-unmodified-loop-condition", "no-unmodified-loop-condition");
  addRule("no-unneeded-ternary", "no-unneeded-ternary");
  addRule("no-unreachable", "no-unreachable");
  addRule("no-unreachable-loop", "no-unreachable-loop");
  addRule("no-unsafe-finally", "no-unsafe-finally");
  addRule("no-unsafe-negation", "no-unsafe-negation");
  addRule("no-unsafe-optional-chaining", "no-unsafe-optional-chaining");
  addRule("no-unused-expressions", "no-unused-expressions");
  addRule("no-unused-labels", "no-unused-labels");
  addRule("no-unused-private-class-members", "no-unused-private-class-members");
  addRule("no-unused-vars", "no-unused-vars");
  addRule("no-use-before-define", "no-use-before-define");
  addRule("no-useless-assignment", "no-useless-assignment");
  addRule("no-useless-backreference", "no-useless-backreference");
  addRule("no-useless-call", "no-useless-call");
  addRule("no-useless-catch", "no-useless-catch");
  addRule("no-useless-computed-key", "no-useless-computed-key");
  addRule("no-useless-concat", "no-useless-concat");
  addRule("no-useless-constructor", "no-useless-constructor");
  addRule("no-useless-escape", "no-useless-escape");
  addRule("no-useless-rename", "no-useless-rename");
  addRule("no-useless-return", "no-useless-return");
  addRule("no-var", "no-var");
  addRule("no-void", "no-void");
  addRule("no-warning-comments", "no-warning-comments");
  addRule("no-whitespace-before-property", "no-whitespace-before-property");
  addRule("no-with", "no-with");
  addRule("nonblock-statement-body-position", "nonblock-statement-body-position");
  addRule("object-curly-newline", "object-curly-newline");
  addRule("object-curly-spacing", "object-curly-spacing");
  addRule("object-property-newline", "object-property-newline");
  addRule("object-shorthand", "object-shorthand");
  addRule("one-var", "one-var");
  addRule("one-var-declaration-per-line", "one-var-declaration-per-line");
  addRule("operator-assignment", "operator-assignment");
  addRule("operator-linebreak", "operator-linebreak");
  addRule("padded-blocks", "padded-blocks");
  addRule("padding-line-between-statements", "padding-line-between-statements");
  addRule("prefer-arrow-callback", "prefer-arrow-callback");
  addRule("prefer-const", "prefer-const");
  addRule("prefer-destructuring", "prefer-destructuring");
  addRule("prefer-exponentiation-operator", "prefer-exponentiation-operator");
  addRule("prefer-named-capture-group", "prefer-named-capture-group");
  addRule("prefer-numeric-literals", "prefer-numeric-literals");
  addRule("prefer-object-has-own", "prefer-object-has-own");
  addRule("prefer-object-spread", "prefer-object-spread");
  addRule("prefer-promise-reject-errors", "prefer-promise-reject-errors");
  addRule("prefer-reflect", "prefer-reflect");
  addRule("prefer-regex-literals", "prefer-regex-literals");
  addRule("prefer-rest-params", "prefer-rest-params");
  addRule("prefer-spread", "prefer-spread");
  addRule("prefer-template", "prefer-template");
  addRule("preserve-caught-error", "preserve-caught-error");
  addRule("quote-props", "quote-props");
  addRule("quotes", "quotes");
  addRule("radix", "radix");
  addRule("require-atomic-updates", "require-atomic-updates");
  addRule("require-await", "require-await");
  addRule("require-unicode-regexp", "require-unicode-regexp");
  addRule("require-yield", "require-yield");
  addRule("rest-spread-spacing", "rest-spread-spacing");
  addRule("semi", "semi");
  addRule("semi-spacing", "semi-spacing");
  addRule("semi-style", "semi-style");
  addRule("sort-imports", "sort-imports");
  addRule("sort-keys", "sort-keys");
  addRule("sort-vars", "sort-vars");
  addRule("space-before-blocks", "space-before-blocks");
  addRule("space-before-function-paren", "space-before-function-paren");
  addRule("space-in-parens", "space-in-parens");
  addRule("space-infix-ops", "space-infix-ops");
  addRule("space-unary-ops", "space-unary-ops");
  addRule("spaced-comment", "spaced-comment");
  addRule("strict", "strict");
  addRule("switch-colon-spacing", "switch-colon-spacing");
  addRule("symbol-description", "symbol-description");
  addRule("template-curly-spacing", "template-curly-spacing");
  addRule("template-tag-spacing", "template-tag-spacing");
  addRule("unicode-bom", "unicode-bom");
  addRule("use-isnan", "use-isnan");
  addRule("valid-typeof", "valid-typeof");
  addRule("vars-on-top", "vars-on-top");
  addRule("wrap-iife", "wrap-iife");
  addRule("wrap-regex", "wrap-regex");
  addRule("yield-star-spacing", "yield-star-spacing");
  addRule("yoda", "yoda");

  return ruleMap;
}

/**
 * Creates a new LazyLoadingRuleMap instance with the rule map.
 * @returns {LazyLoadingRuleMap} A new LazyLoadingRuleMap instance.
 */
function createLazyLoadingRuleMap() {
  return new LazyLoadingRuleMap(createRuleMap());
}

module.exports = createLazyLoadingRuleMap();