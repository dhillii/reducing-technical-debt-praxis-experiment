```javascript
"use strict";

module.exports = class RuleSet {
  /**
   * @param {Object} rules
   */
  constructor(rules) {
    this.references = Object.create(null);
    this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
  }

  /**
   * @param {Object} rules
   * @param {Object} refs
   * @param {string} ident
   * @returns {Array}
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
   * @param {Object} rule
   * @param {Object} refs
   * @param {string} ident
   * @returns {Object}
   */
  static normalizeRule(rule, refs, ident) {
    if (typeof rule === "string") {
      return {
        use: [{ loader: rule }]
      };
    }

    if (!rule) {
      throw new Error("Unexpected null when object was expected as rule");
    }

    if (typeof rule !== "object") {
      throw new Error(`Unexpected ${typeof rule} when object was expected as rule (${rule})`);
    }

    const newRule = {};
    let useSource;
    let resourceSource;

    // Normalize resource
    if (rule.test || rule.include || rule.exclude) {
      checkResourceSource("test + include + exclude");
      const condition = {
        test: rule.test,
        include: rule.include,
        exclude: rule.exclude
      };
      try {
        newRule.resource = RuleSet.normalizeCondition(condition);
      } catch (error) {
        throw new Error(RuleSet.buildErrorMessage(condition, error));
      }
    }

    if (rule.resource) {
      checkResourceSource("resource");
      try {
        newRule.resource = RuleSet.normalizeCondition(rule.resource);
      } catch (error) {
        throw new Error(RuleSet.buildErrorMessage(rule.resource, error));
      }
    }

    // Normalize other conditions
    if (rule.resourceQuery) {
      try {
        newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);
      } catch (error) {
        throw new Error(RuleSet.buildErrorMessage(rule.resourceQuery, error));
      }
    }

    if (rule.compiler) {
      try {
        newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
      } catch (error) {
        throw new Error(RuleSet.buildErrorMessage(rule.compiler, error));
      }
    }

    if (rule.issuer) {
      try {
        newRule.issuer = RuleSet.normalizeCondition(rule.issuer);
      } catch (error) {
        throw new Error(RuleSet.buildErrorMessage(rule.issuer, error));
      }
    }

    // Normalize use
    const loader = rule.loaders || rule.loader;
    if (typeof loader === "string" && !rule.options && !rule.query) {
      checkUseSource("loader");
      newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
    } else if (typeof loader === "string" && (rule.options || rule.query)) {
      checkUseSource("loader + options/query");
      newRule.use = RuleSet.normalizeUse({
        loader: loader,
        options: rule.options,
        query: rule.query
      }, ident);
    } else if (loader && (rule.options || rule.query)) {
      throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
    } else if (loader) {
      checkUseSource("loaders");
      newRule.use = RuleSet.normalizeUse(loader, ident);
    } else if (rule.options || rule.query) {
      throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
    }

    if (rule.use) {
      checkUseSource("use");
      newRule.use = RuleSet.normalizeUse(rule.use, ident);
    }

    // Normalize rules and oneOf
    if (rule.rules) {
      newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
    }

    if (rule.oneOf) {
      newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
    }

    // Copy other properties
    const keys = Object.keys(rule).filter((key) => {
      return ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].indexOf(key) < 0;
    });
    keys.forEach((key) => {
      newRule[key] = rule[key];
    });

    // Update references
    if (Array.isArray(newRule.use)) {
      newRule.use.forEach((item) => {
        if (item.ident) {
          refs[item.ident] = item.options;
        }
      });
    }

    return newRule;

    function checkUseSource(newSource) {
      if (useSource && useSource !== newSource) {
        throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one result source (provided ${newSource} and ${useSource})`)));
      }
      useSource = newSource;
    }

    function checkResourceSource(newSource) {
      if (resourceSource && resourceSource !== newSource) {
        throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one resource source (provided ${newSource} and ${resourceSource})`)));
      }
      resourceSource = newSource;
    }
  }

  /**
   * @param {Object} condition
   * @param {Error} error
   * @returns {string}
   */
  static buildErrorMessage(condition, error) {
    const conditionAsText = JSON.stringify(condition, (key, value) => {
      return value === undefined ? "undefined" : value;
    }, 2);
    return error.message + " in " + conditionAsText;
  }

  /**
   * @param {string|Object|Array} use
   * @param {string} ident
   * @returns {Array}
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
   * @param {function} use
   * @param {Object} data
   * @returns {Object}
   */
  static normalizeUseItemFunction(use, data) {
    const result = use(data);
    if (typeof result === "string") {
      return RuleSet.normalizeUseItemString(result);
    }
    return result;
  }

  /**
   * @param {string} useItemString
   * @returns {Object}
   */
  static normalizeUseItemString(useItemString) {
    const idx = useItemString.indexOf("?");
    if (idx >= 0) {
      return {
        loader: useItemString.substr(0, idx),
        options: useItemString.substr(idx + 1)
      };
    }
    return {
      loader: useItemString
    };
  }

  /**
   * @param {Object|string} item
   * @param {string} ident
   * @returns {Object}
   */
  static normalizeUseItem(item, ident) {
    if (typeof item === "function") {
      return item;
    }

    if (typeof item === "string") {
      return RuleSet.normalizeUseItemString(item);
    }

    let newItem = {};

    if (item.options && item.query) {
      throw new Error("Provided options and query in use");
    }

    if (!item.loader) {
      throw new Error("No loader specified");
    }

    newItem.options = item.options || item.query;

    if (typeof newItem.options === "object" && newItem.options) {
      if (newItem.options.ident) {
        newItem.ident = newItem.options.ident;
      } else {
        newItem.ident = ident;
      }
    }

    const keys = Object.keys(item).filter((key) => {
      return ["options", "query"].indexOf(key) < 0;
    });

    keys.forEach((key) => {
      newItem[key] = item[key];
    });

    return newItem;
  }

  /**
   * @param {Object} condition
   * @returns {function}
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

    let matchers = [];
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
   * @param {Object} data
   * @returns {Array}
   */
  exec(data) {
    const result = [];
    this._run(data, {
      rules: this.rules
    }, result);
    return result;
  }

  /**
   * @param {Object} data
   * @param {Object} rule
   * @param {Array} result
   * @returns {boolean}
   */
  _run(data, rule, result) {
    // Test conditions
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

    // Apply
    const keys = Object.keys(rule).filter((key) => {
      return ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].indexOf(key) < 0;
    });

    keys.forEach((key) => {
      result.push({
        type: key,
        value: rule[key]
      });
    });

    if (rule.use) {
      rule.use.forEach((use) => {
        result.push({
          type: "use",
          value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
          enforce: rule.enforce
        });
      });
    }

    if (rule.rules) {
      for (let i = 0; i < rule.rules.length; i++) {
        this._run(data, rule.rules[i], result);
      }
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
   * @param {string} ident
   * @returns {Object}
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
 * @param {function} matcher
 * @returns {function}
 */
function notMatcher(matcher) {
  return (str) => !matcher(str);
}

/**
 * @param {Array<function>} items
 * @returns {function}
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
 * @param {Array<function>} items
 * @returns {function}
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