"use strict";

module.exports = class RuleSet {
	constructor(rules) {
		this.references = Object.create(null);
		this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
	}

	static normalizeRules(rules, refs, ident) {
		if(Array.isArray(rules)) {
			return rules.map((rule, idx) => {
				return RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`);
			});
		} else if(rules) {
			return [RuleSet.normalizeRule(rules, refs, ident)];
		} else {
			return [];
		}
	}

	static normalizeRule(rule, refs, ident) {
		if(typeof rule === "string")
			return {
				use: [{
					loader: rule
				}]
			};
		if(!rule)
			throw new Error("Unexcepted null when object was expected as rule");
		if(typeof rule !== "object")
			throw new Error("Unexcepted " + typeof rule + " when object was expected as rule (" + rule + ")");

		let newRule = {};
		let useSource;
		let resourceSource;
		let condition;

		if(rule.test || rule.include || rule.exclude) {
			checkResourceSource("test + include + exclude");
			condition = {
				test: rule.test,
				include: rule.include,
				exclude: rule.exclude
			};
			try {
				newRule.resource = RuleSet.normalizeCondition(condition);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(condition, error));
			}
		}

		if(rule.resource) {
			checkResourceSource("resource");
			try {
				newRule.resource = RuleSet.normalizeCondition(rule.resource);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(rule.resource, error));
			}
		}

		if(rule.resourceQuery) {
			try {
				newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(rule.resourceQuery, error));
			}
		}

		if(rule.compiler) {
			try {
				newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(rule.compiler, error));
			}
		}

		if(rule.issuer) {
			try {
				newRule.issuer = RuleSet.normalizeCondition(rule.issuer);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(rule.issuer, error));
			}
		}

		const loader = rule.loaders || rule.loader;
		if(RuleSet._hasOnlyLoader(rule)) {
			checkUseSource("loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if(RuleSet._hasLoaderWithQueryOrOptions(rule)) {
			checkUseSource("loader + options/query");
			newRule.use = RuleSet.normalizeUse({
				loader: loader,
				options: rule.options,
				query: rule.query
			}, ident);
		} else if(loader && (rule.options || rule.query)) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if(loader) {
			checkUseSource("loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if(rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}

		if(rule.use) {
			checkUseSource("use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}

		if(rule.rules)
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);

		if(rule.oneOf)
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

		const keys = Object.keys(rule).filter((key) => {
			return RuleSet._isStandardKey(key) === false;
		});
		keys.forEach((key) => {
			newRule[key] = rule[key];
		});

		function checkUseSource(newSource) {
			if(useSource && useSource !== newSource)
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one result source (provided " + newSource + " and " + useSource + ")")));
			useSource = newSource;
		}

		function checkResourceSource(newSource) {
			if(resourceSource && resourceSource !== newSource)
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one resource source (provided " + newSource + " and " + resourceSource + ")")));
			resourceSource = newSource;
		}

		if(Array.isArray(newRule.use)) {
			newRule.use.forEach((item) => {
				if(item.ident) {
					refs[item.ident] = item.options;
				}
			});
		}

		return newRule;
	}

	static _hasOnlyLoader(rule) {
		return typeof (rule.loaders || rule.loader) === "string" && !rule.options && !rule.query;
	}

	static _hasLoaderWithQueryOrOptions(rule) {
		return typeof (rule.loaders || rule.loader) === "string" && (rule.options || rule.query);
	}

	static _isStandardKey(key) {
		return ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].indexOf(key) >= 0;
	}

	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(condition, (key, value) => {
			return value === undefined ? "undefined" : value;
		}, 2);
		return error.message + " in " + conditionAsText;
	}

	static normalizeUse(use, ident) {
		if(Array.isArray(use)) {
			return use
				.map((item, idx) => RuleSet.normalizeUse(item, `${ident}-${idx}`))
				.reduce((arr, items) => arr.concat(items), []);
		}
		return [RuleSet.normalizeUseItem(use, ident)];
	}

	static normalizeUseItemFunction(use, data) {
		const result = use(data);
		if(typeof result === "string") {
			return RuleSet.normalizeUseItem(result);
		}
		return result;
	}

	static normalizeUseItemString(useItemString) {
		const idx = useItemString.indexOf("?");
		if(idx >= 0) {
			return {
				loader: useItemString.substr(0, idx),
				options: useItemString.substr(idx + 1)
			};
		}
		return {
			loader: useItemString
		};
	}

	static normalizeUseItem(item, ident) {
		if(typeof item === "function")
			return item;

		if(typeof item === "string") {
			return RuleSet.normalizeUseItemString(item);
		}

		let newItem = {};

		if(item.options && item.query)
			throw new Error("Provided options and query in use");

		if(!item.loader)
			throw new Error("No loader specified");

		newItem.options = item.options || item.query;

		if(typeof newItem.options === "object" && newItem.options) {
			if(newItem.options.ident)
				newItem.ident = newItem.options.ident;
			else
				newItem.ident = ident;
		}

		const keys = Object.keys(item).filter(function(key) {
			return ["options", "query"].indexOf(key) < 0;
		});

		keys.forEach(function(key) {
			newItem[key] = item[key];
		});

		return newItem;
	}

	static normalizeCondition(condition) {
		if(!condition)
			throw new Error("Expected condition but got falsy value");

		if(RuleSet._isStringCondition(condition)) {
			return str => str.indexOf(condition) === 0;
		}
		if(RuleSet._isFunctionCondition(condition)) {
			return condition;
		}
		if(RuleSet._isRegExpCondition(condition)) {
			return condition.test.bind(condition);
		}
		if(RuleSet._isArrayCondition(condition)) {
			const items = condition.map(c => RuleSet.normalizeCondition(c));
			return orMatcher(items);
		}
		if(RuleSet._isObjectCondition(condition)) {
			return RuleSet._normalizeObjectCondition(condition);
		}

		throw Error("Unexcepted " + typeof condition + " when condition was expected (" + condition + ")");
	}

	static _isStringCondition(condition) {
		return typeof condition === "string";
	}

	static _isFunctionCondition(condition) {
		return typeof condition === "function";
	}

	static _isRegExpCondition(condition) {
		return condition instanceof RegExp;
	}

	static _isArrayCondition(condition) {
		return Array.isArray(condition);
	}

	static _isObjectCondition(condition) {
		return typeof condition === "object" && condition !== null;
	}

	static _normalizeObjectCondition(condition) {
		const matchers = [];
		const strategy = {
			or: (value) => {
				if(value) {
					const items = value.map(c => RuleSet.normalizeCondition(c));
					matchers.push(orMatcher(items));
				}
			},
			include: (value) => {
				if(value) matchers.push(RuleSet.normalizeCondition(value));
			},
			test: (value) => {
				if(value) matchers.push(RuleSet.normalizeCondition(value));
			},
			and: (value) => {
				if(value) {
					const items = value.map(c => RuleSet.normalizeCondition(c));
					matchers.push(andMatcher(items));
				}
			},
			not: (value) => {
				if(value) {
					const matcher = RuleSet.normalizeCondition(value);
					matchers.push(notMatcher(matcher));
				}
			},
			exclude: (value) => {
				if(value) {
					const matcher = RuleSet.normalizeCondition(value);
					matchers.push(notMatcher(matcher));
				}
			}
		};

		Object.keys(condition).forEach(key => {
			const value = condition[key];
			const handler = strategy[key];
			if(handler) {
				handler(value);
			} else {
				throw new Error("Unexcepted property " + key + " in condition");
			}
		});

		if(matchers.length === 0)
			throw new Error("Excepted condition but got " + condition);
		if(matchers.length === 1)
			return matchers[0];
		return andMatcher(matchers);
	}

	exec(data) {
		const result = [];
		this._run(data, {
			rules: this.rules
		}, result);
		return result;
	}

	_run(data, rule, result) {
		// test conditions
		if(rule.resource && !data.resource)
			return false;
		if(rule.resourceQuery && !data.resourceQuery)
			return false;
		if(rule.compiler && !data.compiler)
			return false;
		if(rule.issuer && !data.issuer)
			return false;
		if(rule.resource && !rule.resource(data.resource))
			return false;
		if(data.issuer && rule.issuer && !rule.issuer(data.issuer))
			return false;
		if(data.resourceQuery && rule.resourceQuery && !rule.resourceQuery(data.resourceQuery))
			return false;
		if(data.compiler && rule.compiler && !rule.compiler(data.compiler))
			return false;

		// apply
		const keys = Object.keys(rule).filter((key) => {
			return RuleSet._isExcludedKey(key) === false;
		});
		keys.forEach((key) => {
			result.push({
				type: key,
				value: rule[key]
			});
		});

		if(rule.use) {
			rule.use.forEach((use) => {
				result.push({
					type: "use",
					value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
					enforce: rule.enforce
				});
			});
		}

		if(rule.rules) {
			for(let i = 0; i < rule.rules.length; i++) {
				this._run(data, rule.rules[i], result);
			}
		}

		if(rule.oneOf) {
			for(let i = 0; i < rule.oneOf.length; i++) {
				if(this._run(data, rule.oneOf[i], result))
					break;
			}
		}

		return true;
	}

	static _isExcludedKey(key) {
		return ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].indexOf(key) >= 0;
	}

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if(!options) throw new Error("Can't find options with ident '" + ident + "'");
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
		for(let i = 0; i < items.length; i++) {
			if(items[i](str))
				return true;
		}
		return false;
	};
}

function andMatcher(items) {
	return function(str) {
		for(let i = 0; i < items.length; i++) {
			if(!items[i](str))
				return false;
		}
		return true;
	};
}