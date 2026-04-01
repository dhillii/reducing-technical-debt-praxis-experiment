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

/**
 * Get variables in the current scope
 * @param {Object} scope current scope
 * @param {string} name name of the variable to look for
 * @returns {ASTNode|null} The variable object
 * @private
 */
function getVariable(scope, name) {
	return scope.variables.find(v => v.name === name) || null;
}

/**
 * Check if a variable name is in the expected names list
 * @param {string} name The variable name
 * @param {Array<string>} expectedNames Expected variable names
 * @returns {boolean} True if name is in expected names
 * @private
 */
function isExpectedVariable(name, expectedNames) {
	return expectedNames.includes(name);
}

/**
 * Create a checker function for empty declared variables
 * @returns {Function} Checker function
 * @private
 */
function createEmptyChecker() {
	return function checkEmpty(node) {
		assert.strictEqual(
			0,
			sourceCode.getDeclaredVariables(node).length,
		);
	};
}

/**
 * Create rule object with empty checkers for multiple node types
 * @param {Array<string>} nodeTypes Node types to check
 * @returns {Object} Rule object
 * @private
 */
function createEmptyCheckersForNodeTypes(nodeTypes) {
	const rule = {};
	const emptyChecker = createEmptyChecker();
	nodeTypes.forEach(nodeType => {
		rule[nodeType] = emptyChecker;
	});
	return rule;
}

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

describe("SourceCode", () => {
	describe("new SourceCode()", () => {
		it("should create a new instance when called with valid data", () => {
			const ast = { comments: [], tokens: [], loc: {}, range: [] };
			const sourceCode = new SourceCode("foo;", ast);

			assert.isObject(sourceCode);
			assert.strictEqual(sourceCode.text, "foo;");
			assert.strictEqual(sourceCode.ast, ast);
		});

		it("should create a new instance when called with valid optional data", () => {
			const parserServices = {};
			const scopeManager = {};
			const visitorKeys = {};
			const ast = { comments: [], tokens: [], loc: {}, range: [] };
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
			const ast = { comments: [], tokens: [], loc: {}, range: [] };
			const sourceCode = new SourceCode("foo;\nbar;", ast);

			assert.isObject(sourceCode);
			assert.strictEqual(sourceCode.lines.length, 2);
			assert.strictEqual(sourceCode.lines[0], "foo;");
			assert.strictEqual(sourceCode.lines[1], "bar;");
		});

		it("should throw an error when called with a false AST", () => {
			assert.throws(
				() => new SourceCode("foo;", false),
				/Unexpected empty AST\. \(false\)/u,
			);
		});

		it("should throw an error when called with a null AST", () => {
			assert.throws(
				() => new SourceCode("foo;", null),
				/Unexpected empty AST\. \(null\)/u,
			);
		});

		it("should throw an error when called with a undefined AST", () => {
			assert.throws(
				() => new SourceCode("foo;", void 0),
				/Unexpected empty AST\. \(undefined\)/u,
			);
		});

		it("should throw an error when called with an AST that's missing tokens", () => {
			assert.throws(
				() =>
					new SourceCode("foo;", {
						comments: [],
						loc: {},
						range: [],
					}),
				/missing the tokens array/u,
			);
		});

		it("should throw an error when called with an AST that's missing comments", () => {
			assert.throws(
				() =>
					new SourceCode("foo;", { tokens: [], loc: {}, range: [] }),
				/missing the comments array/u,
			);
		});

		it("should throw an error when called with an AST that's missing location", () => {
			assert.throws(
				() =>
					new SourceCode("foo;", {
						comments: [],
						tokens: [],
						range: [],
					}),
				/missing location information/u,
			);
		});

		it("should throw an error when called with an AST that's missing range", () => {
			assert.throws(
				() =>
					new SourceCode("foo;", {
						comments: [],
						tokens: [],
						loc: {},
					}),
				/missing range information/u,
			);
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

			const actual = sourceCode.tokensAndComments;
			const expected = [
				comments[0],
				tokens[0],
				tokens[1],
				comments[1],
				tokens[2],
			];

			assert.deepStrictEqual(actual, expected);
		});

		describe("if a text has BOM,", () => {
			let sourceCode;

			beforeEach(() => {
				const ast = { comments: [], tokens: [], loc: {}, range: [] };

				sourceCode = new SourceCode("\uFEFFconsole.log('hello');", ast);
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
				const ast = { comments: [], tokens: [], loc: {}, range: [] };

				sourceCode = new SourceCode("console.log('hello');", ast);
			});

			it("should has false at `hasBOM` property.", () => {
				assert.strictEqual(sourceCode.hasBOM, false);
			});

			it("should not has BOM in `text` property.", () => {
				assert.strictEqual(sourceCode.text, "console.log('hello');");
			});
		});

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
				const firstToken = sourceCode.getAllComments()[0];

				assert.strictEqual(firstToken.type, "Shebang");
			});
		});

		describe("when a text does not have a shebang", () => {
			it("should not change the type of the first comment", () => {
				const ast = {
					comments: [
						{ type: "Line", value: "comment", range: [0, 9] },
					],
					tokens: [],
					loc: {},
					range: [],
				};
				const sourceCode = new SourceCode(
					"//comment\nconsole.log('hello');",
					ast,
				);
				const firstToken = sourceCode.getAllComments()[0];

				assert.strictEqual(firstToken.type, "Line");
			});
		});

		describe("when it read a UTF-8 file (has BOM), SourceCode", () => {
			const UTF8_FILE = path.resolve(
				__dirname,
				"../../../../fixtures/utf8-bom.js",
			);
			const text = fs
				.readFileSync(UTF8_FILE, "utf8")
				.replace(/\r\n/gu, "\n"); // <-- For autocrlf of "git for Windows"
			let sourceCode;

			beforeEach(() => {
				const ast = { comments: [], tokens: [], loc: {}, range: [] };

				sourceCode = new SourceCode(text, ast);
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
		it("should get proper lines when using \\n as a line break", () => {
			const code = "a;\nb;",
				ast = espree.parse(code, DEFAULT_CONFIG),
				sourceCode = new SourceCode(code, ast);

			const lines = sourceCode.getLines();

			assert.strictEqual(lines[0], "a;");
			assert.strictEqual(lines[1], "b;");
		});

		it("should get proper lines when using \\r\\n as a line break", () => {
			const code = "a;\r\nb;",
				ast = espree.parse(code, DEFAULT_CONFIG),
				sourceCode = new SourceCode(code, ast);

			const lines = sourceCode.getLines();

			assert.strictEqual(lines[0], "a;");
			assert.strictEqual(lines[1], "b;");
		});

		it("should get proper lines when using \\r as a line break", () => {
			const code = "a;\rb;",
				ast = espree.parse(code, DEFAULT_CONFIG),
				sourceCode = new SourceCode(code, ast);

			const lines = sourceCode.getLines();

			assert.strictEqual(lines[0], "a;");
			assert.strictEqual(lines[1], "b;");
		});

		it("should get proper lines when using \\u2028 as a line break", () => {
			const code = "a;\u2028b;",
				ast = espree.parse(code, DEFAULT_CONFIG),
				sourceCode = new SourceCode(code, ast);

			const lines = sourceCode.getLines();

			assert.strictEqual(lines[0], "a;");
			assert.strictEqual(lines[1], "b;");
		});

		it("should get proper lines when using \\u2029 as a line break", () => {
			const code = "a;\u2029b;",
				ast = espree.parse(code, DEFAULT_CONFIG),
				sourceCode = new SourceCode(code, ast);

			const lines = sourceCode.getLines();

			assert.strictEqual(lines[0], "a;");
			assert.strictEqual(lines[1], "b;");
		});
	});

	describe("getText()", () => {
		let sourceCode, ast;

		describe("when text begins with a shebang", () => {
			it("should retrieve unaltered shebang text", () => {
				// Shebangs are normalized to line comments before parsing.
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
			ast = espree.parse(TEST_CODE, DEFAULT_CONFIG);
			sourceCode = new SourceCode(TEST_CODE, ast);
		});

		it("should retrieve all text when used without parameters", () => {
			const text = sourceCode.getText();

			assert.strictEqual(text, TEST_CODE);
		});

		it("should retrieve all text for root node", () => {
			const text = sourceCode.getText(ast);

			assert.strictEqual(text, TEST_CODE);
		});

		it("should clamp to valid range when retrieving characters before start of source", () => {
			const text = sourceCode.getText(ast, 2, 0);

			assert.strictEqual(text, TEST_CODE);
		});

		it("should retrieve all text for binary expression", () => {
			const node = ast.body[0].declarations[0].init;
			const text = sourceCode.getText(node);

			assert.strictEqual(text, "6 * 7");
		});

		it("should retrieve all text plus two characters before for binary expression", () => {
			const node = ast.body[0].declarations[0].init;
			const text = sourceCode.getText(node, 2);

			assert.strictEqual(text, "= 6 * 7");
		});

		it("should retrieve all text plus one character after for binary expression", () => {
			const node = ast.body[0].declarations[0].init;
			const text = sourceCode.getText(node, 0, 1);

			assert.strictEqual(text, "6 * 7;");
		});

		it("should retrieve all text plus two characters before and one character after for binary expression", () => {
			const node = ast.body[0].declarations[