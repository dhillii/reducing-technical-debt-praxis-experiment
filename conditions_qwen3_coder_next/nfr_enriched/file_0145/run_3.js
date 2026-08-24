static normalizeRule(rule, refs, ident) {
		if(typeof rule === "string")
			return {
				use: [{
					loader: rule
				}]
			};
		RuleSet.validateRuleType(rule);

		const newRule = {};
		let useSource;
		let resourceSource;

		RuleSet.normalizeResourceCondition(rule, newRule, resourceSource, ident);
		RuleSet.normalizeResourceQueryCondition(rule, newRule, ident);
		RuleSet.normalizeCompilerCondition(rule, newRule, ident);
		RuleSet.normalizeIssuerCondition(rule, newRule, ident);
		RuleSet.normalizeLoaderOrLoaders(rule, newRule, useSource, ident);
		RuleSet.normalizeUse(rule, newRule, ident);
		RuleSet.normalizeNestedRules(rule, newRule, refs, ident);

		RuleSet.copyAdditionalProperties(rule, newRule);

		RuleSet.validateUniqueUseSource(useSource, ident, "use");
		RuleSet.validateUniqueResourceSource(resourceSource, ident, "resource");

		if(Array.isArray(newRule.use)) {
			newRule.use.forEach(item => {
				if(item.ident) {
					refs[item.ident] = item.options;
				}
			});
		}

		return newRule;
	}

	static validateRuleType(rule) {
		if(!rule)
			throw new Error("Unexcepted null when object was expected as rule");
		if(typeof rule !== "object")
			throw new Error("Unexcepted " + typeof rule + " when object was expected as rule (" + rule + ")");
	}

	static normalizeResourceCondition(rule, newRule, resourceSource, ident) {
		if(rule.test || rule.include || rule.exclude) {
			RuleSet.validateUniqueResourceSource(resourceSource, ident, "test + include + exclude");
			resourceSource = "test + include + exclude";
			const condition = {
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
			RuleSet.validateUniqueResourceSource(resourceSource, ident, "resource");
			resourceSource = "resource";
			try {
				newRule.resource = RuleSet.normalizeCondition(rule.resource);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(rule.resource, error));
			}
		}
	}

	static normalizeResourceQueryCondition(rule, newRule, ident) {
		if(rule.resourceQuery) {
			try {
				newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(rule.resourceQuery, error));
			}
		}
	}

	static normalizeCompilerCondition(rule, newRule, ident) {
		if(rule.compiler) {
			try {
				newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(rule.compiler, error));
			}
		}
	}

	static normalizeIssuerCondition(rule, newRule, ident) {
		if(rule.issuer) {
			try {
				newRule.issuer = RuleSet.normalizeCondition(rule.issuer);
			} catch(error) {
				throw new Error(RuleSet.buildErrorMessage(rule.issuer, error));
			}
		}
	}

	static normalizeLoaderOrLoaders(rule, newRule, useSource, ident) {
		const loader = rule.loaders || rule.loader;
		if(loader) {
			if(rule.loader && rule.loaders)
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));

			if(typeof loader === "string" && !rule.options && !rule.query) {
				RuleSet.validateUniqueUseSource(useSource, ident, "loader");
				useSource = "loader";
				newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
			} else if(typeof loader === "string" && (rule.options || rule.query)) {
				RuleSet.validateUniqueUseSource(useSource, ident, "loader + options/query");
				useSource = "loader + options/query";
				newRule.use = RuleSet.normalizeUse({
					loader: loader,
					options: rule.options,
					query: rule.query
				}, ident);
			} else if(loader && (rule.options || rule.query)) {
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
			} else {
				RuleSet.validateUniqueUseSource(useSource, ident, "loaders");
				useSource = "loaders";
				newRule.use = RuleSet.normalizeUse(loader, ident);
			}
		}

		if(rule.options || rule.query) {
			if(!loader)
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}
	}

	static normalizeUse(rule, newRule, ident) {
		if(rule.use) {
			RuleSet.validateUniqueUseSource(useSource, ident, "use");
			useSource = "use";
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
	}

	static normalizeNestedRules(rule, newRule, refs, ident) {
		if(rule.rules)
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		if(rule.oneOf)
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
	}

	static copyAdditionalProperties(rule, newRule) {
		const keys = Object.keys(rule).filter(key =>
			["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].indexOf(key) < 0
		);
		keys.forEach(key => {
			newRule[key] = rule[key];
		});
	}

	static validateUniqueUseSource(existing, ident, newSource) {
		if(existing && existing !== newSource)
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one result source (provided " + newSource + " and " + existing + ")")));
	}

	static validateUniqueResourceSource(existing, ident, newSource) {
		if(existing && existing !== newSource)
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one resource source (provided " + newSource + " and " + existing + ")")));
	}