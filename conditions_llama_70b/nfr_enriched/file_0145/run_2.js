"use strict";

module.exports = class RuleSet {
  constructor(rules) {
    this.references = Object.create(null);
    this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
  }

  static normalizeRules(rules, refs, ident) {
    if (Array.isArray(rules)) {
      return rules.map((rule, idx) => RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`));
    } else if (rules) {
      return [RuleSet.normalizeRule(rules, refs, ident)];
    } else {
      return [];
    }
  }

  static normalizeRule(rule, refs, ident) {
    if (typeof rule === "string") {
      return {
        use: [{ loader: rule }]
      };
    }

    if (!rule) {
      throw new Error("Unexcepted null when object was expected as rule");
    }

    if (typeof rule !== "object") {
      throw new Error("Unexcepted " + typeof rule + " when object was expected as rule (" + rule + ")");
    }

    const newRule = {};
    const resourceSource = RuleSet.getResourceSource(rule);
    const useSource = RuleSet.getUseSource(rule);

    newRule.resource = RuleSet.normalizeResource(rule, resourceSource);
    newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);
    newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
    newRule.issuer = RuleSet.normalizeCondition(rule.issuer);
    newRule.use = RuleSet.normalizeUse(rule, useSource, ident);
    newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
    newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

    Object.assign(newRule, RuleSet.getAdditionalProperties(rule));

    return newRule;
  }

  static getResourceSource(rule) {
    if (rule.test || rule.include || rule.exclude) {
      return "test + include + exclude";
    }

    if (rule.resource) {
      return "resource";
    }

    return null;
  }

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

  static normalizeResource(rule, resourceSource) {
    if (resourceSource === "test + include + exclude") {
      return RuleSet.normalizeCondition({
        test: rule.test,
        include: rule.include,
        exclude: rule.exclude
      });
    }

    if (resourceSource === "resource") {
      return RuleSet.normalizeCondition(rule.resource);
    }

    return null;
  }

  static normalizeUse(rule, useSource, ident) {
    if (useSource === "loader") {
      return RuleSet.normalizeUseLoader(rule.loader, ident);
    }

    if (useSource === "loaders") {
      return RuleSet.normalizeUseLoaders(rule.loaders, ident);
    }

    if (useSource === "use") {
      return RuleSet.normalizeUseArray(rule.use, ident);
    }

    return null;
  }

  static normalizeUseLoader(loader, ident) {
    if (typeof loader === "string") {
      return RuleSet.normalizeUseItem(loader, ident);
    }

    throw new Error("Invalid loader type");
  }

  static normalizeUseLoaders(loaders, ident) {
    return loaders.map((loader, idx) => RuleSet.normalizeUseItem(loader, `${ident}-${idx}`));
  }

  static normalizeUseArray(useArray, ident) {
    return useArray.map((item, idx) => RuleSet.normalizeUseItem(item, `${ident}-${idx}`));
  }

  static normalizeUseItem(item, ident) {
    if (typeof item === "function") {
      return item;
    }

    if (typeof item === "string") {
      return RuleSet.normalizeUseItemString(item);
    }

    return RuleSet.normalizeUseItemObject(item, ident);
  }

  static normalizeUseItemString(itemString) {
    const idx = itemString.indexOf("?");
    if (idx >= 0) {
      return {
        loader: itemString.substr(0, idx),
        options: itemString.substr(idx + 1)
      };
    }
    return {
      loader: itemString
    };
  }

  static normalizeUseItemObject(item, ident) {
    const newItem = {};

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

    Object.assign(newItem, RuleSet.getAdditionalProperties(item));

    return newItem;
  }

  static getAdditionalProperties(obj) {
    const keys = Object.keys(obj).filter(key => {
      return ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].indexOf(key) < 0;
    });

    const additionalProperties = {};

    keys.forEach(key => {
      additionalProperties[key] = obj[key];
    });

    return additionalProperties;
  }

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
      return orMatcher(condition.map(c => RuleSet.normalizeCondition(c)));
    }

    if (typeof condition !== "object") {
      throw Error("Unexcepted " + typeof condition + " when condition was expected (" + condition + ")");
    }

    const matchers = [];

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

  static buildErrorMessage(condition, error) {
    const conditionAsText = JSON.stringify(condition, (key, value) => {
      return value === undefined ? "undefined" : value;
    }, 2);
    return error.message + " in " + conditionAsText;
  }

  exec(data) {
    const result = [];
    this._run(data, {
      rules: this.rules
    }, result);
    return result;
  }

  _run(data, rule, result) {
    if (!this._testConditions(data, rule)) {
      return false;
    }

    this._applyRule(data, rule, result);

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

  _applyRule(data, rule, result) {
    const keys = Object.keys(rule).filter(key => {
      return ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].indexOf(key) < 0;
    });

    keys.forEach(key => {
      result.push({
        type: key,
        value: rule[key]
      });
    });

    if (rule.use) {
      rule.use.forEach(use => {
        result.push({
          type: "use",
          value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
          enforce: rule.enforce
        });
      });
    }
  }

  findOptionsByIdent(ident) {
    const options = this.references[ident];
    if (!options) {
      throw new Error("Can't find options with ident '" + ident + "'");
    }
    return options;
  }
};

function notMatcher(matcher) {
  return function(str) {
    return !matcher(str);
  };
}

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