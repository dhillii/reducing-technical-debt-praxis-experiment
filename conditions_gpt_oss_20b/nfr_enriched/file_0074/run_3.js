applyInlineConfig() {
	/**
	 * Parse all inline comments and extract:
	 *   • global variable declarations
	 *   • exported variable declarations
	 *   • eslint rule configurations
	 *
	 * The function returns an object containing:
	 *   - `configs`: an array of parsed eslint configurations
	 *   - `problems`: an array of parsing errors
	 *
	 * The extracted globals and exported variables are stored on the
	 * instance (`this._inlineGlobals`, `this._inlineExported`) so that
	 * `finalize()` can apply them to the scope manager.
	 *
	 * @returns {{configs: Array, problems: Array}}
	 */
	const configs = [];
	const problems = [];

	// Helper: add a global variable to the inline globals map
	const addInlineGlobal = (name, value) => {
		if (!this._inlineGlobals) {
			this._inlineGlobals = new Map();
		}
		this._inlineGlobals.set(name, value);
	};

	// Helper: mark a variable as exported
	const addInlineExported = name => {
		if (!this._inlineExported) {
			this._inlineExported = new Set();
		}
		this._inlineExported.add(name);
	};

	// Helper: parse a single comment block
	const parseComment = comment => {
		const value = comment.value.trim();

		// eslint directives
		if (/^eslint\b/.test(value)) {
			try {
				const json = value.replace(/^eslint\s*/, "");
				const parsed = JSON.parse(`{${json}}`);
				configs.push({ config: parsed, loc: comment.loc });
			} catch (err) {
				problems.push({
					message: `Failed to parse JSON from '${value}': ${err.message}`,
					loc: comment.loc,
					ruleId: null,
				});
			}
			return;
		}

		// global directive
		if (/^global\b/.test(value)) {
			const parts = value
				.replace(/^global\s*/, "")
				.split(",")
				.map(p => p.trim())
				.filter(Boolean);

			parts.forEach(part => {
				const [name, flag] = part.split(":").map(p => p.trim());
				const val = flag === "true" || flag === "writable" ? true : false;
				addInlineGlobal(name, val);
			});
			return;
		}

		// exported directive
		if (/^exported\b/.test(value)) {
			const names = value
				.replace(/^exported\s*/, "")
				.split(",")
				.map(p => p.trim())
				.filter(Boolean);

			names.forEach(name => addInlineExported(name));
			return;
		}
	};

	// Iterate over all comments in the AST
	this.ast.comments.forEach(parseComment);

	// Store the parsed globals/exported for later use
	this._inlineGlobals = this._inlineGlobals || new Map();
	this._inlineExported = this._inlineExported || new Set();

	return { configs, problems };
}