```javascript
/**
 * @fileoverview Abstraction of JavaScript source code.
 * @author Nicholas C. Zakas
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const fs = require("node:fs"),
	path = require("node:path"),
	assert = require("chai").assert,
	espree = require("espree"),
	eslintScope = require("eslint-scope"),
	sinon = require("sinon"),
	{ Linter } = require("../../../../../lib/linter"),
	SourceCode = require("../../../../../lib/languages/js/source-code/source-code"),
	astUtils = require("../../../../../lib/shared/ast-utils"),
	globals = require("../../../../../conf/globals");

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const DEFAULT_CONFIG = {
	ecmaVersion: 6,
	comment: true,
	tokens: true,
	range: true,
	loc: true,
};
const linter = new Linter({ configType: "flat" });
const AST = espree.parse("let foo = bar;", DEFAULT_CONFIG),
	TEST_CODE = "var answer = 6 * 7;",
	SHEBANG_TEST_CODE = `#!/usr/bin/env node\n${TEST_CODE}`;
const filename = "foo.js";

function getVariable(scope, name) {
	return scope.variables.find(v => v.name === name) || null;
}

/**
 * Creates a minimal valid AST object for testing.
 */
function makeAst(overrides = {}) {
	return { comments: [], tokens: [], loc: {}, range: [], ...overrides };
}

/**
 * Parses code and returns a SourceCode instance.
 */
function makeSourceCode(code, config = DEFAULT_CONFIG) {
	const ast = espree.parse(code, config);
	return new SourceCode(code, ast);
}

/**
 * Creates a SourceCode with scope manager for testing.
 */
function makeSourceCodeWithScope(code, ecmaVersion = 6, sourceType = "script") {
	const ast = espree.parse(code, DEFAULT_CONFIG);
	const scopeManager = eslintScope.analyze(ast, {
		ignoreEval: true,
		ecmaVersion,
		sourceType,
	});
	return new SourceCode({ text: code, ast, scopeManager });
}

/**
 * Creates a linter rule plugin config for testing.
 */
function makeCheckerPlugin(createFn) {
	return {
		plugins: {
			test: {
				rules: {
					checker: { create: createFn },
				},
			},
		},
		rules: { "test/checker": "error" },
	};
}

/**
 * Get the scope on the node `astSelector` specified.
 */
function getScope(code, astSelector, ecmaVersion = 5) {
	let node, scope;

	linter.verify(code, {
		languageOptions: { ecmaVersion, sourceType: "script" },
		plugins: {
			test: {
				rules: {
					"get-scope": {
						create: context => ({
							[astSelector](node0) {
								node = node0;
								scope = context.sourceCode.getScope(node);
							},
						}),
					},
				},
			},
		},
		rules: { "test/get-scope": 2 },
	});

	return { node, scope };
}

/**
 * Creates a SourceCode and applies language options + inline config + finalize.
 */
function buildFinalizedSourceCode(code, languageOptions, applyInline = false) {
	const sourceCode = makeSourceCodeWithScope(
		code,
		languageOptions.ecmaVersion || 6,
		languageOptions.sourceType || "script",
	);
	sourceCode.applyLanguageOptions(languageOptions);
	if (applyInline) {
		sourceCode.applyInlineConfig();
	}
	sourceCode.finalize();
	return sourceCode;
}

/**
 * Asserts standard variable attributes exist on a variable.
 */
function assertVariableHasStandardAttributes(variable) {
	assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
	assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
	assert(Object.hasOwn(variable, "writeable"));
}

/**
 * Asserts standard ES global variable attributes.
 */
function assertStandardEsGlobalAttributes(variable, esGlobals) {
	assertVariableHasStandardAttributes(variable);
	assert.strictEqual(
		variable.eslintImplicitGlobalSetting,
		esGlobals[variable.name] ? "writable" : "readonly",
	);
	assert.strictEqual(variable.eslintExplicitGlobal, false);
	assert.strictEqual(variable.eslintExplicitGlobalComments, void 0);
	assert.strictEqual(variable.writeable, esGlobals[variable.name]);
	assert.strictEqual(variable.defs.length, 0);
}

/**
 * Asserts global scope has no implicit globals and no unresolved references.
 */
function assertNoImplicitOrUnresolved(globalScope) {
	assert.strictEqual(globalScope.implicit.set.size, 0);
	assert.strictEqual(globalScope.implicit.variables.length, 0);
	assert.strictEqual(globalScope.through.length, 0);
	assert.strictEqual(globalScope.implicit.left.length, 0);
}

/**
 * Asserts resolved references match expected variable names.
 */
function assertResolvedReferences(globalScope, expectedNames) {
	assert.strictEqual(globalScope.references.length, expectedNames.length);
	expectedNames.forEach((name, i) => {
		assert.strictEqual(
			globalScope.references[i].resolved,
			globalScope.set.get(name),
		);
	});
}

/**
 * Asserts unresolved references match expected identifier names.
 */
function assertUnresolvedReferences(globalScope, expectedNames) {
	assert.strictEqual(globalScope.references.length, expectedNames.length);
	assert.strictEqual(globalScope.through.length, expectedNames.length);
	assert.strictEqual(globalScope.implicit.left.length, expectedNames.length);

	expectedNames.forEach((name, i) => {
		assert.strictEqual(globalScope.references[i].identifier.name, name);
		assert.strictEqual(globalScope.through[i], globalScope.references[i]);
		assert.strictEqual(
			globalScope.implicit.left[i],
			globalScope.references[i],
		);
	});
}

/**
 * Creates a spy-based linter rule and verifies it was called.
 */
function verifyWithSpy(code, config, spyFactory, assertSpy) {
	let spy;
	const fullConfig = makeCheckerPlugin(context => {
		spy = spyFactory(context);
		return spy.handlers || spy;
	});
	linter.verify(code, { ...fullConfig, ...config });
	assertSpy(spy);
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("SourceCode", () => {
	describe("new SourceCode()", () => {
		it("should create a new instance when called with valid data", () => {
			const ast = makeAst();
			const sourceCode = new SourceCode("foo;", ast);

			assert.isObject(sourceCode);
			assert.strictEqual(sourceCode.text, "foo;");
			assert.strictEqual(sourceCode.ast, ast);
		});

		it("should create a new instance when called with valid optional data", () => {
			const parserServices = {};
			const scopeManager = {};
			const visitorKeys = {};
			const ast = makeAst();
			const sourceCode = new SourceCode({
				text: "foo;",
				ast,
				parserServices,
				scopeManager,
				visitorKeys,
			});

			assert.isObject(sourceCode);
			assert.strictEqual(sourceCode.text, "foo;");
			assert.strictEqual(sourceCode.ast, ast);
			assert.strictEqual(sourceCode.parserServices, parserServices);
			assert.strictEqual(sourceCode.scopeManager, scopeManager);
			assert.strictEqual(sourceCode.visitorKeys, visitorKeys);
		});

		it("should split text into lines when called with valid data", () => {
			const ast = makeAst();
			const sourceCode = new SourceCode("foo;\nbar;", ast);

			assert.isObject(sourceCode);
			assert.strictEqual(sourceCode.lines.length, 2);
			assert.strictEqual(sourceCode.lines[0], "foo;");
			assert.strictEqual(sourceCode.lines[1], "bar;");
		});

		const invalidAstCases = [
			[false, /Unexpected empty AST\. \(false\)/u],
			[null, /Unexpected empty AST\. \(null\)/u],
			[void 0, /Unexpected empty AST\. \(undefined\)/u],
		];

		invalidAstCases.forEach(([ast, pattern]) => {
			it(`should throw an error when called with a ${ast} AST`, () => {
				assert.throws(() => new SourceCode("foo;", ast), pattern);
			});
		});

		const missingFieldCases = [
			[{ comments: [], loc: {}, range: [] }, /missing the tokens array/u],
			[{ tokens: [], loc: {}, range: [] }, /missing the comments array/u],
			[{ comments: [], tokens: [], range: [] }, /missing location information/u],
			[{ comments: [], tokens: [], loc: {} }, /missing range information/u],
		];

		missingFieldCases.forEach(([ast, pattern]) => {
			it(`should throw an error when called with an AST that's missing required fields`, () => {
				assert.throws(() => new SourceCode("foo;", ast), pattern);
			});
		});

		it("should store all tokens and comments sorted by range", () => {
			const comments = [{ range: [0, 2] }, { range: [10, 12] }];
			const tokens = [
				{ range: [3, 8] },
				{ range: [8, 10] },
				{ range: [12, 20] },
			];
			const sourceCode = new SourceCode("", {
				comments,
				tokens,
				loc: {},
				range: [],
			});

			assert.deepStrictEqual(sourceCode.tokensAndComments, [
				comments[0],
				tokens[0],
				tokens[1],
				comments[1],
				tokens[2],
			]);
		});

		describe("BOM handling", () => {
			describe("if a text has BOM,", () => {
				let sourceCode;

				beforeEach(() => {
					sourceCode = new SourceCode("\uFEFFconsole.log('hello');", makeAst());
				});

				it("should has true at `hasBOM` property.", () => {
					assert.strictEqual(sourceCode.hasBOM, true);
				});

				it("should not has BOM in `text` property.", () => {
					assert.strictEqual(sourceCode.text, "console.log('hello');");
				});
			});

			describe("if a text doesn't have BOM,", () => {
				let sourceCode;

				beforeEach(() => {
					sourceCode = new SourceCode("console.log('hello');", makeAst());
				});

				it("should has false at `hasBOM` property.", () => {
					assert.strictEqual(sourceCode.hasBOM, false);
				});

				it("should not has BOM in `text` property.", () => {
					assert.strictEqual(sourceCode.text, "console.log('hello');");
				});
			});
		});

		describe("shebang handling", () => {
			describe("when a text has a shebang", () => {
				let sourceCode;

				beforeEach(() => {
					const ast = {
						comments: [
							{
								type: "Line",
								value: "/usr/bin/env node",
								range: [0, 19],
							},
						],
						tokens: [],
						loc: {},
						range: [],
					};
					sourceCode = new SourceCode(SHEBANG_TEST_CODE, ast);
				});

				it('should change the type of the first comment to "Shebang"', () => {
					assert.strictEqual(sourceCode.getAllComments()[0].type, "Shebang");
				});
			});

			describe("when a text does not have a shebang", () => {
				it("should not change the type of the first comment", () => {
					const ast = {
						comments: [{ type: "Line", value: "comment", range: [0, 9] }],
						tokens: [],
						loc: {},
						range: [],
					};
					const sourceCode = new SourceCode("//comment\nconsole.log('hello');", ast);

					assert.strictEqual(sourceCode.getAllComments()[0].type, "Line");
				});
			});
		});

		describe("when it read a UTF-8 file (has BOM), SourceCode", () => {
			const UTF8_FILE = path.resolve(__dirname, "../../../../fixtures/utf8-bom.js");
			const text = fs.readFileSync(UTF8_FILE, "utf8").replace(/\r\n/gu, "\n");
			let sourceCode;

			beforeEach(() => {
				sourceCode = new SourceCode(text, makeAst());
			});

			it("to be clear, check the file has UTF-8 BOM.", () => {
				const buffer = fs.readFileSync(UTF8_FILE);

				assert.strictEqual(buffer[0], 0xef);
				assert.strictEqual(buffer[1], 0xbb);
				assert.strictEqual(buffer[2], 0xbf);
			});

			it("should has true at `hasBOM` property.", () => {
				assert.strictEqual(sourceCode.hasBOM, true);
			});

			it("should not has BOM in `text` property.", () => {
				assert.strictEqual(
					sourceCode.text,
					'"use strict";\n\nconsole.log("This file has [0xEF, 0xBB, 0xBF] as BOM.");\n',
				);
			});
		});
	});

	describe("getLines()", () => {
		const lineBreakCases = [
			["\\n", "a;\nb;"],
			["\\r\\n", "a;\r\nb;"],
			["\\r", "a;\rb;"],
			["\\u2028", "a;\u2028b;"],
			["\\u2029", "a;\u2029b;"],
		];

		lineBreakCases.forEach(([breakName, code]) => {
			it(`should get proper lines when using ${breakName} as a line break`, () => {
				const sourceCode = makeSourceCode(code);
				const lines = sourceCode.getLines();

				assert.strictEqual(lines[0], "a;");
				assert.strictEqual(lines[1], "b;");
			});
		});
	});

	describe("getText()", () => {
		let sourceCode, ast;

		describe("when text begins with a shebang", () => {
			it("should retrieve unaltered shebang text", () => {
				ast = espree.parse(
					SHEBANG_TEST_CODE.replace(
						astUtils.shebangPattern,
						(match, captured) => `//${captured}`,
					),
					DEFAULT_CONFIG,
				);
				sourceCode = new SourceCode(SHEBANG_TEST_CODE, ast);

				const shebangToken = sourceCode.getAllComments()[0];
				const shebangText = sourceCode.getText(shebangToken);

				assert.strictEqual(shebangToken.type, "Shebang");
				assert.strictEqual(shebangText, "#!/usr/bin/env node");
			});
		});

		beforeEach(() => {
			ast