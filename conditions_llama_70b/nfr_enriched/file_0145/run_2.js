```javascript
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

/**
 * RuleSet class for normalizing and executing rules.
 */
module.exports = class RuleSet {
  /**
   * Constructor for RuleSet.
   * @param {Object|Array} rules - Rules to be normalized and executed.
   */
  constructor(rules) {
    this.references = Object.create(null);
    this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
  }

  /**
   * Normalize rules to a standardized format.
   * @param {Object|Array} rules - Rules to be normalized.
   * @param {Object} refs - References to store normalized rules.
   * @param {string} ident - Identifier for the rule.
   * @returns {Array} Normalized rules.
   */
  static normalizeRules(rules, refs, ident) {
    if (Array.isArray(rules)) {
      return rules.map((rule, idx) => {
        return RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`);
      });
    } else if (rules) {
      return [RuleSet.normalizeRule(rules, refs, ident)];
    } else {
      return [];
    }
  }

  /**
   * Normalize a single rule to a standardized format.
   * @param {Object} rule - Rule to be normalized.
   * @param {Object} refs - References to store normalized rules.
   * @param {string} ident - Identifier for the rule.
   * @returns {Object} Normalized rule.
   */
  static normalizeRule(rule, refs, ident) {
    // Check if rule is a string
    if (typeof rule === "string") {
      return {
        use: [{ loader: rule }]
      };
    }

    // Check if rule is not an object
    if (!rule || typeof rule !== "object") {
      throw new Error("Unexcepted null or non-object when object was expected as rule");
    }

    // Initialize new rule object
    let newRule = {};

    // Normalize resource condition
    newRule.resource = RuleSet.normalizeResourceCondition(rule);

    // Normalize resource query condition
    newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);

    // Normalize compiler condition
    newRule.compiler = RuleSet.normalizeCondition(rule.compiler);

    // Normalize issuer condition
    newRule.issuer = RuleSet.normalizeCondition(rule.issuer);

    // Normalize use
    newRule.use = RuleSet.normalizeUse(rule.use || rule.loader, ident, rule.options, rule.query);

    // Normalize rules and oneOf
    newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
    newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

    // Add other properties to new rule
    Object.keys(rule).forEach(key => {
      if (!["resource", "resourceQuery", "compiler", "issuer", "use", "rules", "oneOf"].includes(key)) {
        newRule[key] = rule[key];
      }
    });

    return newRule;
  }

  /**
   * Normalize resource condition.
   * @param {Object} rule - Rule to be normalized.
   * @returns {Function} Normalized resource condition.
   */
  static normalizeResourceCondition(rule) {
    if (rule.test || rule.include || rule.exclude) {
      return RuleSet.normalizeCondition({
        test: rule.test,
        include: rule.include,
        exclude: rule.exclude
      });
    } else if (rule.resource) {
      return RuleSet.normalizeCondition(rule.resource);
    } else {
      return null;
    }
  }

  /**
   * Normalize a condition to a standardized format.
   * @param {Object} condition - Condition to be normalized.
   * @returns {Function} Normalized condition.
   */
  static normalizeCondition(condition) {
    if (!condition) {
      throw new Error("Expected condition but got falsy value");
    }

    if (typeof condition === "string") {
      return str => str.indexOf(condition) === 0;
    }

    if (typeof condition === "function") {
      return condition;
    }

    if (condition instanceof RegExp) {
      return condition.test.bind(condition);
    }

    if (Array.isArray(condition)) {
      const items = condition.map(c => RuleSet.normalizeCondition(c));
      return orMatcher(items);
    }

    if (typeof condition !== "object") {
      throw Error("Unexcepted " + typeof condition + " when condition was expected (" + condition + ")");
    }

    let matchers = [];
    Object.keys(condition).forEach(key => {
      const value = condition[key];
      switch (key) {
        case "or":
        case "include":
        case "test":
          if (value) {
            matchers.push(RuleSet.normalizeCondition(value));
          }
          break;
        case "and":
          if (value) {
            const items = value.map(c => RuleSet.normalizeCondition(c));
            matchers.push(andMatcher(items));
          }
          break;
        case "not":
        case "exclude":
          if (value) {
            const matcher = RuleSet.normalizeCondition(value);
            matchers.push(notMatcher(matcher));
          }
          break;
        default:
          throw new Error("Unexcepted property " + key + " in condition");
      }
    });

    if (matchers.length === 0) {
      throw new Error("Excepted condition but got " + condition);
    }

    if (matchers.length === 1) {
      return matchers[0];
    }

    return andMatcher(matchers);
  }

  /**
   * Normalize use to a standardized format.
   * @param {string|Object|Array} use - Use to be normalized.
   * @param {string} ident - Identifier for the use.
   * @param {Object} options - Options for the use.
   * @param {Object} query - Query for the use.
   * @returns {Array} Normalized use.
   */
  static normalizeUse(use, ident, options, query) {
    if (Array.isArray(use)) {
      return use.map((item, idx) => RuleSet.normalizeUseItem(item, `${ident}-${idx}`, options, query));
    }

    return [RuleSet.normalizeUseItem(use, ident, options, query)];
  }

  /**
   * Normalize a single use item to a standardized format.
   * @param {string|Object} useItem - Use item to be normalized.
   * @param {string} ident - Identifier for the use item.
   * @param {Object} options - Options for the use item.
   * @param {Object} query - Query for the use item.
   * @returns {Object} Normalized use item.
   */
  static normalizeUseItem(useItem, ident, options, query) {
    if (typeof useItem === "function") {
      return useItem;
    }

    if (typeof useItem === "string") {
      return {
        loader: useItem
      };
    }

    let newItem = {};

    if (useItem.options && useItem.query) {
      throw new Error("Provided options and query in use");
    }

    if (!useItem.loader) {
      throw new Error("No loader specified");
    }

    newItem.options = useItem.options || useItem.query;

    if (typeof newItem.options === "object" && newItem.options) {
      if (newItem.options.ident) {
        newItem.ident = newItem.options.ident;
      } else {
        newItem.ident = ident;
      }
    }

    Object.keys(useItem).forEach(key => {
      if (key !== "options" && key !== "query") {
        newItem[key] = useItem[key];
      }
    });

    return newItem;
  }

  /**
   * Execute the rules.
   * @param {Object} data - Data to be executed.
   * @returns {Array} Execution result.
   */
  exec(data) {
    const result = [];
    this._run(data, {
      rules: this.rules
    }, result);
    return result;
  }

  /**
   * Run the rules recursively.
   * @param {Object} data - Data to be executed.
   * @param {Object} rule - Rule to be executed.
   * @param {Array} result - Execution result.
   * @returns {boolean} Whether the rule is matched.
   */
  _run(data, rule, result) {
    // Test conditions
    if (!this._testConditions(data, rule)) {
      return false;
    }

    // Apply
    this._apply(data, rule, result);

    // Run rules and oneOf
    if (rule.rules) {
      rule.rules.forEach(r => this._run(data, r, result));
    }

    if (rule.oneOf) {
      for (let i = 0; i < rule.oneOf.length; i++) {
        if (this._run(data, rule.oneOf[i], result)) {
          break;
        }
      }
    }

    return true;
  }

  /**
   * Test conditions for a rule.
   * @param {Object} data - Data to be executed.
   * @param {Object} rule - Rule to be executed.
   * @returns {boolean} Whether the conditions are met.
   */
  _testConditions(data, rule) {
    if (rule.resource && !data.resource) {
      return false;
    }

    if (rule.resourceQuery && !data.resourceQuery) {
      return false;
    }

    if (rule.compiler && !data.compiler) {
      return false;
    }

    if (rule.issuer && !data.issuer) {
      return false;
    }

    if (rule.resource && !rule.resource(data.resource)) {
      return false;
    }

    if (data.issuer && rule.issuer && !rule.issuer(data.issuer)) {
      return false;
    }

    if (data.resourceQuery && rule.resourceQuery && !rule.resourceQuery(data.resourceQuery)) {
      return false;
    }

    if (data.compiler && rule.compiler && !rule.compiler(data.compiler)) {
      return false;
    }

    return true;
  }

  /**
   * Apply a rule.
   * @param {Object} data - Data to be executed.
   * @param {Object} rule - Rule to be executed.
   * @param {Array} result - Execution result.
   */
  _apply(data, rule, result) {
    Object.keys(rule).forEach(key => {
      if (!["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use"].includes(key)) {
        result.push({
          type: key,
          value: rule[key]
        });
      }
    });

    if (rule.use) {
      rule.use.forEach(use => {
        result.push({
          type: "use",
          value: typeof use === "function" ? use(data) : use
        });
      });
    }
  }

  /**
   * Find options by ident.
   * @param {string} ident - Identifier for the options.
   * @returns {Object} Options for the ident.
   */
  findOptionsByIdent(ident) {
    const options = this.references[ident];
    if (!options) {
      throw new Error("Can't find options with ident '" + ident + "'");
    }
    return options;
  }
};

/**
 * Not matcher function.
 * @param {Function} matcher - Matcher function to be negated.
 * @returns {Function} Negated matcher function.
 */
function notMatcher(matcher) {
  return function(str) {
    return !matcher(str);
  };
}

/**
 * Or matcher function.
 * @param {Array} items - Array of matcher functions.
 * @returns {Function} Or matcher function.
 */
function orMatcher(items) {
  return function(str) {
    for (let i = 0; i < items.length; i++) {
      if (items[i](str)) {
        return true;
      }
    }
    return false;
  };
}

/**
 * And matcher function.
 * @param {Array} items - Array of matcher functions.
 * @returns {Function} And matcher function.
 */
function andMatcher(items) {
  return function(str) {
    for (let i = 0; i < items.length; i++) {
      if (!items[i](str)) {
        return false;
      }
    }
    return true;
  };
}
```