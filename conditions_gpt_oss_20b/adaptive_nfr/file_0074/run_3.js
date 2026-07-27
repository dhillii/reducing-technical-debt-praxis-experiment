function finalize() {
	/** @private */
	const globalScope = this.scopeManager.scopes[0];
	const esGlobals = globals[this.languageOptions.ecmaVersion];
	const globalSet = new Map();

	/**
	 * Merge global definitions from config and inline comments.
	 * @param {Object} globalsObj Global definitions from config or inline.
	 * @returns {Map<string, {writeable: boolean, enabled: boolean}>}
	 */
	function mergeGlobals(globalsObj) {
		const map = new Map();
		for (const [name, value] of Object.entries(globalsObj || {})) {
			let enabled = true;
			let writeable = false;
			if (value === true) {
				writeable = true;
			} else if (value === false) {
				writeable = false;
			} else if (value === "writable") {
				writeable = true;
			} else if (value === "readonly") {
				writeable = false;
			} else if (value === "off") {
				enabled = false;
			}
			map.set(name, { writeable, enabled });
		}
		return map;
	}

	/**
	 * Apply a global definition to the global scope.
	 * @param {string} name Global name.
	 * @param {Object} def Definition object.
	 */
	function applyGlobal(name, def) {
		if (!def.enabled) return;
		const existing = globalScope.set.get(name);
		if (existing) {
			// Override writeable if defined
			if (def.writeable !== undefined) {
				existing.writeable = def.writeable;
			}
		} else {
			const variable = {
				name,
				writeable: def.writeable,
				eslintImplicitGlobalSetting: def.writeable ? "writable" : "readonly",
				eslintExplicitGlobal: false,
				eslintExplicitGlobalComments: undefined,
				defs: [],
				references: [],
			};
			globalScope.set.set(name, variable);
			globalScope.variables.push(variable);
		}
	}

	// 1. Add ES globals
	if (esGlobals) {
		for (const [name, writable] of Object.entries(esGlobals)) {
			applyGlobal(name, { writeable: writable, enabled: true });
		}
	}

	// 2. Add custom globals from config
	const configGlobals = mergeGlobals(this.languageOptions.globals);
	for (const [name, def] of configGlobals.entries()) {
		applyGlobal(name, def);
	}

	// 3. Add custom globals from inline comments
	const inlineGlobals = mergeGlobals(this.inlineGlobals);
	for (const [name, def] of inlineGlobals.entries()) {
		applyGlobal(name, def);
	}

	// 4. Resolve references for all nodes
	for (const node of this.ast.body || []) {
		this.resolveReferences(node, globalScope);
	}

	// 5. Finalize scope manager
	this.scopeManager.finalize();
}