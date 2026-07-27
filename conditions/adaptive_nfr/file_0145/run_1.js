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

		const resourceHandler = new ResourceHandler(rule, newRule);
		resourceHandler.processTestIncludeExclude();
		resourceHandler.processResource();
		resourceHandler.processResourceQuery();
		resourceHandler.processCompiler();
		resourceHandler.processIssuer();

		const useHandler = new UseHandler(rule, newRule);
		useHandler.processLoaderAndOptions(useSource);
		useHandler.processUse();

		useSource = useHandler.getUseSource();
		resourceSource = resourceHandler.getResourceSource();

		if(rule.loader && rule.loaders)
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));

		if(rule.rules)
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);

		if(rule.oneOf)
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

		const keys = Object.keys(rule).filter((key) => {
			return ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].indexOf(key) < 0;
		});
		keys.forEach((key) => {
			newRule[key] = rule[key];
		});

		if(Array.isArray(newRule.use)) {
			newRule.use.forEach((item) => {
				if(item.ident) {
					refs[item.ident] = item.options;
				}
			});
		}

		return newRule;
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
		if(typeof condition === "string") {
			return str => str.indexOf(condition) === 0;
		}
		if(typeof condition === "function") {
			return condition;
		}
		if(condition instanceof RegExp) {
			return condition.test.bind(condition);
		}
		if(Array.isArray(condition)) {
			const items = condition.map(c => RuleSet.normalizeCondition(c));
			return orMatcher(items);
		}
		if(typeof condition !== "object")
			throw Error("Unexcepted " + typeof condition + " when condition was expected (" + condition + ")");

		const conditionProcessor = new ConditionProcessor(condition);
		const matchers = conditionProcessor.process();

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
			return ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].indexOf(key) < 0;
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

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if(!options) throw new Error("Can't find options with ident '" + ident + "'");
		return options;
	}
};

/**
 * Handles resource-related condition processing
 */
class ResourceHandler {
	constructor(rule, newRule) {
		this.rule = rule;
		this.newRule = newRule;
		this.resourceSource = null;
	}

	processTestIncludeExclude() {
		if(this.rule.test || this.rule.include || this.rule.exclude) {
			this.checkResourceSource("test + include + exclude");
			const condition = {
				test: this.rule.test,
				include: this.rule.include,
				exclude: this.rule.exclude
			};
			try {
				this.newRule.resource = RuleSet.normalizeCondition(condition);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(condition, error));
			}
		}
	}

	processResource() {
		if(this.rule.resource) {
			this.checkResourceSource("resource");
			try {
				this.newRule.resource = RuleSet.normalizeCondition(this.rule.resource);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(this.rule.resource, error));
			}
		}
	}

	processResourceQuery() {
		if(this.rule.resourceQuery) {
			try {
				this.newRule.resourceQuery = RuleSet.normalizeCondition(this.rule.resourceQuery);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(this.rule.resourceQuery, error));
			}
		}
	}

	processCompiler() {
		if(this.rule.compiler) {
			try {
				this.newRule.compiler = RuleSet.normalizeCondition(this.rule.compiler);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(this.rule.compiler, error));
			}
		}
	}

	processIssuer() {
		if(this.rule.issuer) {
			try {
				this.newRule.issuer = RuleSet.normalizeCondition(this.rule.issuer);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(this.rule.issuer, error));
			}
		}
	}

	checkResourceSource(newSource) {
		if(this.resourceSource && this.resourceSource !== newSource)
			throw new Error(RuleSet.buildErrorMessage(this.rule, new Error("Rule can only have one resource source (provided " + newSource + " and " + this.resourceSource + ")")));
		this.resourceSource = newSource;
	}

	getResourceSource() {
		return this.resourceSource;
	}
}

/**
 * Handles use/loader-related condition processing
 */
class UseHandler {
	constructor(rule, newRule) {
		this.rule = rule;
		this.newRule = newRule;
		this.useSource = null;
	}

	processLoaderAndOptions(useSource) {
		const loader = this.rule.loaders || this.rule.loader;
		
		if(typeof loader === "string" && !this.rule.options && !this.rule.query) {
			this.checkUseSource("loader");
			this.newRule.use = RuleSet.normalizeUse(loader.split("!"), "ident");
		} else if(typeof loader === "string" && (this.rule.options || this.rule.query)) {
			this.checkUseSource("loader + options/query");
			this.newRule.use = RuleSet.normalizeUse({
				loader: loader,
				options: this.rule.options,
				query: this.rule.query
			}, "ident");
		} else if(loader && (this.rule.options || this.rule.query)) {
			throw new Error(RuleSet.buildErrorMessage(this.rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if(loader) {
			this.checkUseSource("loaders");
			this.newRule.use = RuleSet.normalizeUse(loader, "ident");
		} else if(this.rule.options || this.rule.query) {
			throw new Error(RuleSet.buildErrorMessage(this.rule, new Error("options/query provided without loader (use loader + options)")));
		}
	}

	processUse() {
		if(this.rule.use) {
			this.checkUseSource("use");
			this.newRule.use = RuleSet.normalizeUse(this.rule.use, "ident");
		}
	}

	checkUseSource(newSource) {
		if(this.useSource && this.useSource !== newSource)
			throw new Error(RuleSet.buildErrorMessage(this.rule, new Error("Rule can only have one result source (provided " + newSource + " and " + this.useSource + ")")));
		this.useSource = newSource;
	}

	getUseSource() {
		return this.useSource;
	}
}

/**
 * Processes condition object keys and builds matchers
 */
class ConditionProcessor {
	constructor(condition) {
		this.condition = condition;
		this.matchers = [];
		this.keyHandlers = {
			"or": (value) => this.handleOrIncludeTest(value),
			"include": (value) => this.handleOrIncludeTest(value),
			"test": (value) => this.handleOrIncludeTest(value),
			"and": (value) => this.handleAnd(value),
			"not": (value) => this.handleNotExclude(value),
			"exclude": (value) => this.handleNotExclude(value)
		};
	}

	handleOrIncludeTest(value) {
		if(value)
			this.matchers.push(RuleSet.normalizeCondition(value));
	}

	handleAnd(value) {
		if(value) {
			const items = value.map(c => RuleSet.normalizeCondition(c));
			this.matchers.push(andMatcher(items));
		}
	}

	handleNotExclude(value) {
		if(value) {
			const matcher = RuleSet.normalizeCondition(value);
			this.matchers.push(notMatcher(matcher));
		}
	}

	process() {
		Object.keys(this.condition).forEach(key => {
			const handler = this.keyHandlers[key];
			if(handler) {
				handler.call(this, this.condition[key]);
			} else {
				throw new Error("Unexcepted property " + key + " in condition");
			}
		});
		return this.matchers;
	}
}

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