"use strict";

module.exports = class RuleSet {
  constructor(rules) {
    this.references = Object.create(null);
    this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
  }

  static normalizeRules(rules, refs, ident) {
    return RuleSet.isArray(rules) ? 
      rules.map((rule, idx) => RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`)) : 
      RuleSet.normalizeRule(rules, refs, ident);
  }

  static normalizeRule(rule, refs, ident) {
    if (typeof rule === "string") {
      return { use: [{ loader: rule }] };
    }

    if (!rule) {
      throw new Error("Unexcepted null when object was expected as rule");
    }

    if (typeof rule !== "object") {
      throw new Error("Unexcepted " + typeof rule + " when object was expected as rule (" + rule + ")");
    }

    const newRule = {};
    const useSource = RuleSet.getUseSource(rule);
    const resourceSource = RuleSet.getResourceSource(rule);

    newRule.resource = RuleSet.normalizeResource(rule, refs, ident);
    newRule.resourceQuery = RuleSet.normalizeResourceQuery(rule, refs, ident);
    newRule.compiler = RuleSet.normalizeCompiler(rule, refs, ident);
    newRule.issuer = RuleSet.normalizeIssuer(rule, refs, ident);
    newRule.use = RuleSet.normalizeUse(rule, refs, ident);
    newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
    newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

    Object.assign(newRule, RuleSet.getAdditionalProperties(rule));

    return newRule;
  }

  static getUseSource(rule) {
    if (rule.loader && rule.loaders) {
      throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
    }

    const loader = rule.loaders || rule.loader;
    if (typeof loader === "string" && !rule.options && !rule.query) {
      return "loader";
    } else if (typeof loader === "string" && (rule.options || rule.query)) {
      return "loader + options/query";
    } else if (loader && (rule.options || rule.query)) {
      throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
    } else if (loader) {
      return "loaders";
    } else if (rule.options || rule.query) {
      throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
    } else if (rule.use) {
      return "use";
    }
  }

  static getResourceSource(rule) {
    if (rule.test || rule.include || rule.exclude) {
      return "test + include + exclude";
    } else if (rule.resource) {
      return "resource";
    }
  }

  static normalizeResource(rule, refs, ident) {
    if (rule.test || rule.include || rule.exclude) {
      return RuleSet.normalizeCondition({ test: rule.test, include: rule.include, exclude: rule.exclude });
    } else if (rule.resource) {
      return RuleSet.normalizeCondition(rule.resource);
    }
  }

  static normalizeResourceQuery(rule, refs, ident) {
    if (rule.resourceQuery) {
      return RuleSet.normalizeCondition(rule.resourceQuery);
    }
  }

  static normalizeCompiler(rule, refs, ident) {
    if (rule.compiler) {
      return RuleSet.normalizeCondition(rule.compiler);
    }
  }

  static normalizeIssuer(rule, refs, ident) {
    if (rule.issuer) {
      return RuleSet.normalizeCondition(rule.issuer);
    }
  }

  static normalizeUse(rule, refs, ident) {
    if (rule.use) {
      return RuleSet.normalizeUseArray(rule.use, refs, ident);
    } else {
      const loader = rule.loaders || rule.loader;
      if (loader) {
        return RuleSet.normalizeUseArray(loader, refs, ident);
      }
    }
  }

  static normalizeUseArray(use, refs, ident) {
    if (Array.isArray(use)) {
      return use.map((item, idx) => RuleSet.normalizeUseItem(item, refs, `${ident}-${idx}`));
    } else {
      return [RuleSet.normalizeUseItem(use, refs, ident)];
    }
  }

  static normalizeUseItem(item, refs, ident) {
    if (typeof item === "function") {
      return item;
    }

    if (typeof item === "string") {
      return RuleSet.normalizeUseItemString(item);
    }

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
      return RuleSet.orMatcher(condition.map(c => RuleSet.normalizeCondition(c)));
    }

    if (typeof condition !== "object") {
      throw new Error("Unexcepted " + typeof condition + " when condition was expected (" + condition + ")");
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
            matchers.push(RuleSet.andMatcher(items));
          }
          break;
        case "not":
        case "exclude":
          if (value) {
            const matcher = RuleSet.normalizeCondition(value);
            matchers.push(RuleSet.notMatcher(matcher));
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

    return RuleSet.andMatcher(matchers);
  }

  static orMatcher(items) {
    return function(str) {
      for (let i = 0; i < items.length; i++) {
        if (items[i](str)) {
          return true;
        }
      }
      return false;
    };
  }

  static andMatcher(items) {
    return function(str) {
      for (let i = 0; i < items.length; i++) {
        if (!items[i](str)) {
          return false;
        }
      }
      return true;
    };
  }

  static notMatcher(matcher) {
    return function(str) {
      return !matcher(str);
    };
  }

  static getAdditionalProperties(obj) {
    const keys = Object.keys(obj).filter(key => {
      return ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].indexOf(key) < 0;
    });

    const result = {};

    keys.forEach(key => {
      result[key] = obj[key];
    });

    return result;
  }

  static isArray(arr) {
    return Array.isArray(arr);
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

  static normalizeUseItemFunction(use, data) {
    const result = use(data);
    if (typeof result === "string") {
      return RuleSet.normalizeUseItemString(result);
    }
    return result;
  }
}