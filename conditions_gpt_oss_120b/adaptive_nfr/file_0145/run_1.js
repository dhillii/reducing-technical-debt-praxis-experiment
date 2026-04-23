"use strict";

module.exports = class RuleSet {
	constructor(rules) {
		this.references = Object.create(null);
		this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
	}

	static normalizeRules(rules, refs, ident) {
		if (Array.isArray(rules)) {
			return rules.map((rule, idx) => RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`));
		}
		if (rules) {
			return [RuleSet.normalizeRule(rules, refs, ident)];
		}
		return [];
	}

	static normalizeRule(rule, refs, ident) {
		if (typeof rule === "string") {
			return { use: [{ loader: rule }] };
		}
		if (!rule) throw new Error("Unexcepted null when object was expected as rule");
		if (typeof rule !== "object") throw new Error(`Unexcepted ${typeof rule} when object was expected as rule (${rule})`);

		let newRule = {};
		let useSource;
		let resourceSource;

		if (rule.test || rule.include || rule.exclude) {
			checkResourceSource("test + include + exclude");
			newRule.resource = RuleSet._processCondition({ test: rule.test, include: rule.include, exclude: rule.exclude });
		}
		if (rule.resource) {
			checkResourceSource("resource");
			newRule.resource = RuleSet._processCondition(rule.resource);
		}
		if (rule.resourceQuery) newRule.resourceQuery = RuleSet._processCondition(rule.resourceQuery);
		if (rule.compiler) newRule.compiler = RuleSet._processCondition(rule.compiler);
		if (rule.issuer) newRule.issuer = RuleSet._processCondition(rule.issuer);

		if (rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}
		const loader = rule.loaders || rule.loader;
		if (typeof loader === "string" && !rule.options && !rule.query) {
			checkUseSource("loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && (rule.options || rule.query)) {
			checkUseSource("loader + options/query");
			newRule.use = RuleSet.normalizeUse({ loader, options: rule.options, query: rule.query }, ident);
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
		if (rule.rules) newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		if (rule.oneOf) newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

		const extraKeys = Object.keys(rule).filter(
			(key) => !["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].includes(key)
		);
		extraKeys.forEach((key) => {
			newRule[key] = rule[key];
		});

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
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach((item) => {
				if (item.ident) refs[item.ident] = item.options;
			});
		}
		return newRule;
	}

	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(
			condition,
			(key, value) => (value === undefined ? "undefined" : value),
			2
		);
		return `${error.message} in ${conditionAsText}`;
	}

	/** @private */
	static _processCondition(condition) {
		try {
			return RuleSet.normalizeCondition(condition);
		} catch (error) {
			throw new Error(RuleSet.buildErrorMessage(condition, error));
		}
	}

	static normalizeUse(use, ident) {
		if (Array.isArray(use)) {
			return use
				.map((item, idx) => RuleSet.normalizeUse(item, `${ident}-${idx}`))
				.reduce((arr, items) => arr.concat(items), []);
		}
		return [RuleSet.normalizeUseItem(use, ident)];
	}

	static normalizeUseItemFunction(use, data) {
		const result = use(data);
		if (typeof result === "string") {
			return RuleSet.normalizeUseItem(result);
		}
		return result;
	}

	static normalizeUseItemString(useItemString) {
		const idx = useItemString.indexOf("?");
		if (idx >= 0) {
			return {
				loader: useItemString.substring(0, idx),
				options: useItemString.substring(idx + 1)
			};
		}
		return { loader: useItemString };
	}

	static normalizeUseItem(item, ident) {
		if (typeof item === "function") return item;
		if (typeof item === "string") return RuleSet.normalizeUseItemString(item);

		if (item.options && item.query) throw new Error("Provided options and query in use");
		if (!item.loader) throw new Error("No loader specified");

		const newItem = { options: item.options || item.query };
		if (typeof newItem.options === "object" && newItem.options) {
			newItem.ident = newItem.options.ident || ident;
		}
		Object.keys(item)
			.filter((key) => !["options", "query"].includes(key))
			.forEach((key) => {
				newItem[key] = item[key];
			});
		return newItem;
	}

	static normalizeCondition(condition) {
		if (!condition) throw new Error("Expected condition but got falsy value");
		if (typeof condition === "string") return (str) => str.indexOf(condition) === 0;
		if (typeof condition === "function") return condition;
		if (condition instanceof RegExp) return condition.test.bind(condition);
		if (Array.isArray(condition)) return orMatcher(condition.map(RuleSet.normalizeCondition));
		if (typeof condition !== "object") throw Error(`Unexcepted ${typeof condition} when condition was expected (${condition})`);

		return RuleSet._buildObjectMatcher(condition);
	}

	/** @private */
	static _buildObjectMatcher(condition) {
		const matchers = [];
		Object.keys(condition).forEach((key) => {
			const value = condition[key];
			switch (key) {
				case "or":
				case "include":
				case "test":
					if (value) matchers.push(RuleSet.normalizeCondition(value));
					break;
				case "and":
					if (value) matchers.push(andMatcher(value.map(RuleSet.normalizeCondition)));
					break;
				case "not":
				case "exclude":
					if (value) matchers.push(notMatcher(RuleSet.normalizeCondition(value)));
					break;
				default:
					throw new Error(`Unexcepted property ${key} in condition`);
			}
		});
		if (matchers.length === 0) throw new Error(`Excepted condition but got ${condition}`);
		if (matchers.length === 1) return matchers[0];
		return andMatcher(matchers);
	}

	exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	_run(data, rule, result) {
		if (!RuleSet._passesResourceChecks(data, rule)) return false;
		RuleSet._collectExtraProperties(rule, result);
		if (rule.use) RuleSet._processUse(rule.use, data, result, rule.enforce);
		if (rule.rules) RuleSet._runNestedRules(this, data, rule.rules, result);
		if (rule.oneOf) RuleSet._runOneOf(this, data, rule.oneOf, result);
		return true;
	}

	/** @private */
	static _passesResourceChecks(data, rule) {
		if (rule.resource && !data.resource) return false;
		if (rule.resourceQuery && !data.resourceQuery) return false;
		if (rule.compiler && !data.compiler) return false;
		if (rule.issuer && !data.issuer) return false;
		if (rule.resource && !rule.resource(data.resource)) return false;
		if (data.issuer && rule.issuer && !rule.issuer(data.issuer)) return false;
		if (data.resourceQuery && rule.resourceQuery && !rule.resourceQuery(data.resourceQuery)) return false;
		if (data.compiler && rule.compiler && !rule.compiler(data.compiler)) return false;
		return true;
	}

	/** @private */
	static _collectExtraProperties(rule, result) {
		const keys = Object.keys(rule).filter(
			(key) => !["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].includes(key)
		);
		keys.forEach((key) => {
			result.push({ type: key, value: rule[key] });
		});
	}

	/** @private */
	static _processUse(useArray, data, result, enforce) {
		useArray.forEach((use) => {
			const value = typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use;
			result.push({ type: "use", value, enforce });
		});
	}

	/** @private */
	static _runNestedRules(context, data, rules, result) {
		for (let i = 0; i < rules.length; i++) {
			context._run(data, rules[i], result);
		}
	}

	/** @private */
	static _runOneOf(context, data, oneOf, result) {
		for (let i = 0; i < oneOf.length; i++) {
			if (context._run(data, oneOf[i], result)) break;
		}
	}

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) throw new Error(`Can't find options with ident '${ident}'`);
		return options;
	}
};

function notMatcher(matcher) {
	return (str) => !matcher(str);
}
function orMatcher(items) {
	return (str) => {
		for (let i = 0; i < items.length; i++) {
			if (items[i](str)) return true;
		}
		return false;
	};
}
function andMatcher(items) {
	return (str) => {
		for (let i = 0; i < items.length; i++) {
			if (!items[i](str)) return false;
		}
		return true;
	};
}