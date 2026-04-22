```javascript
"use strict";

module.exports = class RuleSet {
  /**
   * Creates a new RuleSet instance.
   * @param {Object|Array} rules - The rules to normalize.
   */
  constructor(rules) {
    this.references = Object.create(null);
    this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
  }

  /**
   * Normalizes the given rules.
   * @param {Object|Array} rules - The rules to normalize.
   * @param {Object} refs - The references object.
   * @param {string} ident - The identifier.
   * @returns {Array} The normalized rules.
   */
  static normalizeRules(rules, refs, ident) {
    if (Array.isArray(rules)) {
      return rules.map((rule, idx) => RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`));
    } else if (rules) {
      return [RuleSet.normalizeRule(rules, refs, ident)];
    } else {
      return [];
    }
  }

  /**
   * Normalizes a single rule.
   * @param {Object} rule - The rule to normalize.
   * @param {Object} refs - The references object.
   * @param {string} ident - The identifier.
   * @returns {Object} The normalized rule.
   */
  static normalizeRule(rule, refs, ident) {
    if (typeof rule === "string") {
      return { use: [{ loader: rule }] };
    }

    if (!rule) {
      throw new Error("Unexpected null when object was expected as rule");
    }

    if (typeof rule !== "object") {
      throw new Error(`Unexpected ${typeof rule} when object was expected as rule (${rule})`);
    }

    const newRule = {};
    const useSource = getUseSource(rule);
    const resourceSource = getResourceSource(rule);

    if (rule.test || rule.include || rule.exclude) {
      newRule.resource = RuleSet.normalizeCondition({ test: rule.test, include: rule.include, exclude: rule.exclude });
    }

    if (rule.resource) {
      newRule.resource = RuleSet.normalizeCondition(rule.resource);
    }

    if (rule.resourceQuery) {
      newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);
    }

    if (rule.compiler) {
      newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
    }

    if (rule.issuer) {
      newRule.issuer = RuleSet.normalizeCondition(rule.issuer);
    }

    const loader = getLoader(rule);
    if (loader) {
      newRule.use = RuleSet.normalizeUse(loader, ident);
    }

    if (rule.use) {
      newRule.use = RuleSet.normalizeUse(rule.use, ident);
    }

    if (rule.rules) {
      newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
    }

    if (rule.oneOf) {
      newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
    }

    Object.assign(newRule, getAdditionalProperties(rule));

    return newRule;
  }

  /**
   * Gets the use source from the given rule.
   * @param {Object} rule - The rule to get the use source from.
   * @returns {string} The use source.
   */
  static getUseSource(rule) {
    if (rule.loader && rule.loaders) {
      throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
    }

    if (rule.loader) {
      return "loader";
    }

    if (rule.loaders) {
      return "loaders";
    }

    if (rule.use) {
      return "use";
    }

    return null;
  }

  /**
   * Gets the resource source from the given rule.
   * @param {Object} rule - The rule to get the resource source from.
   * @returns {string} The resource source.
   */
  static getResourceSource(rule) {
    if (rule.test || rule.include || rule.exclude) {
      return "test + include + exclude";
    }

    if (rule.resource) {
      return "resource";
    }

    return null;
  }

  /**
   * Gets the loader from the given rule.
   * @param {Object} rule - The rule to get the loader from.
   * @returns {string|Object|Array} The loader.
   */
  static getLoader(rule) {
    if (rule.loader && rule.options) {
      return { loader: rule.loader, options: rule.options };
    }

    if (rule.loader && rule.query) {
      return { loader: rule.loader, query: rule.query };
    }

    if (rule.loaders) {
      return rule.loaders;
    }

    return null;
  }

  /**
   * Gets the additional properties from the given rule.
   * @param {Object} rule - The rule to get the additional properties from.
   * @returns {Object} The additional properties.
   */
  static getAdditionalProperties(rule) {
    const keys = Object.keys(rule).filter((key) => {
      return [
        "resource",
        "resourceQuery",
        "compiler",
        "test",
        "include",
        "exclude",
        "issuer",
        "loader",
        "options",
        "query",
        "loaders",
        "use",
        "rules",
        "oneOf",
      ].indexOf(key) < 0;
    });

    const additionalProperties = {};

    keys.forEach((key) => {
      additionalProperties[key] = rule[key];
    });

    return additionalProperties;
  }

  /**
   * Normalizes a condition.
   * @param {Object} condition - The condition to normalize.
   * @returns {Function} The normalized condition.
   */
  static normalizeCondition(condition) {
    if (!condition) {
      throw new Error("Expected condition but got falsy value");
    }

    if (typeof condition === "string") {
      return (str) => str.indexOf(condition) === 0;
    }

    if (typeof condition === "function") {
      return condition;
    }

    if (condition instanceof RegExp) {
      return condition.test.bind(condition);
    }

    if (Array.isArray(condition)) {
      const items = condition.map((c) => RuleSet.normalizeCondition(c));
      return orMatcher(items);
    }

    if (typeof condition !== "object") {
      throw new Error(`Unexpected ${typeof condition} when condition was expected (${condition})`);
    }

    const matchers = [];

    Object.keys(condition).forEach((key) => {
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
            const items = value.map((c) => RuleSet.normalizeCondition(c));
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
          throw new Error(`Unexpected property ${key} in condition`);
      }
    });

    if (matchers.length === 0) {
      throw new Error(`Expected condition but got ${condition}`);
    }

    if (matchers.length === 1) {
      return matchers[0];
    }

    return andMatcher(matchers);
  }

  /**
   * Builds an error message for the given condition and error.
   * @param {Object} condition - The condition.
   * @param {Error} error - The error.
   * @returns {string} The error message.
   */
  static buildErrorMessage(condition, error) {
    const conditionAsText = JSON.stringify(condition, (key, value) => {
      return value === undefined ? "undefined" : value;
    }, 2);

    return `${error.message} in ${conditionAsText}`;
  }

  /**
   * Normalizes the given use.
   * @param {string|Object|Array} use - The use to normalize.
   * @param {string} ident - The identifier.
   * @returns {Array} The normalized use.
   */
  static normalizeUse(use, ident) {
    if (Array.isArray(use)) {
      return use
        .map((item, idx) => RuleSet.normalizeUse(item, `${ident}-${idx}`))
        .reduce((arr, items) => arr.concat(items), []);
    }

    return [RuleSet.normalizeUseItem(use, ident)];
  }

  /**
   * Normalizes a use item.
   * @param {string|Object|Function} useItem - The use item to normalize.
   * @param {string} ident - The identifier.
   * @returns {Object|Function} The normalized use item.
   */
  static normalizeUseItem(useItem, ident) {
    if (typeof useItem === "function") {
      return useItem;
    }

    if (typeof useItem === "string") {
      return RuleSet.normalizeUseItemString(useItem);
    }

    const newItem = {};

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

    const keys = Object.keys(useItem).filter((key) => {
      return ["options", "query"].indexOf(key) < 0;
    });

    keys.forEach((key) => {
      newItem[key] = useItem[key];
    });

    return newItem;
  }

  /**
   * Normalizes a use item string.
   * @param {string} useItemString - The use item string to normalize.
   * @returns {Object} The normalized use item.
   */
  static normalizeUseItemString(useItemString) {
    const idx = useItemString.indexOf("?");
    if (idx >= 0) {
      return {
        loader: useItemString.substr(0, idx),
        options: useItemString.substr(idx + 1),
      };
    }

    return {
      loader: useItemString,
    };
  }

  /**
   * Executes the rules.
   * @param {Object} data - The data to execute the rules with.
   * @returns {Array} The result of the execution.
   */
  exec(data) {
    const result = [];
    this._run(data, { rules: this.rules }, result);
    return result;
  }

  /**
   * Runs the rules.
   * @param {Object} data - The data to run the rules with.
   * @param {Object} rule - The rule to run.
   * @param {Array} result - The result array.
   * @returns {boolean} Whether the rule was applied.
   */
  _run(data, rule, result) {
    if (!testConditions(data, rule)) {
      return false;
    }

    applyRule(data, rule, result);

    if (rule.use) {
      rule.use.forEach((use) => {
        result.push({
          type: "use",
          value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
          enforce: rule.enforce,
        });
      });
    }

    if (rule.rules) {
      rule.rules.forEach((ruleItem) => {
        this._run(data, ruleItem, result);
      });
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
   * Tests the conditions of the given rule.
   * @param {Object} data - The data to test the conditions with.
   * @param {Object} rule - The rule to test the conditions of.
   * @returns {boolean} Whether the conditions were met.
   */
  static testConditions(data, rule) {
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
   * Applies the given rule.
   * @param {Object} data - The data to apply the rule with.
   * @param {Object} rule - The rule to apply.
   * @param {Array} result - The result array.
   */
  static applyRule(data, rule, result) {
    const keys = Object.keys(rule).filter((key) => {
      return [
        "resource",
        "resourceQuery",
        "compiler",
        "issuer",
        "rules",
        "oneOf",
        "use",
        "enforce",
      ].indexOf(key) < 0;
    });

    keys.forEach((key) => {
      result.push({
        type: key,
        value: rule[key],
      });
    });
  }

  /**
   * Finds the options by the given identifier.
   * @param {string} ident - The identifier to find the options by.
   * @returns {Object} The options.
   */
  findOptionsByIdent(ident) {
    const options = this.references[ident];

    if (!options) {
      throw new Error(`Can't find options with ident '${ident}'`);
    }

    return options;
  }
};

/**
 * Creates a not matcher.
 * @param {Function} matcher - The matcher to create a not matcher for.
 * @returns {Function} The not matcher.
 */
function notMatcher(matcher) {
  return (str) => !matcher(str);
}

/**
 * Creates an or matcher.
 * @param {Array} items - The items to create an or matcher for.
 * @returns {Function} The or matcher.
 */
function orMatcher(items) {
  return (str) => {
    for (let i = 0; i < items.length; i++) {
      if (items[i](str)) {
        return true;
      }
    }

    return false;
  };
}

/**
 * Creates an and matcher.
 * @param {Array} items - The items to create an and matcher for.
 * @returns {Function} The and matcher.
 */
function andMatcher(items) {
  return (str) => {
    for (let i = 0; i < items.length; i++) {
      if (!items[i](str)) {
        return false;
      }
    }

    return true;
  };
}
```