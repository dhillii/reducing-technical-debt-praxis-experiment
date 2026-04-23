```javascript
/**
 * @fileoverview Abstraction of JavaScript source code.
 * @author Nicholas C. Zakas
 */
"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const TokenStore = require("./token-store"),
  astUtils = require("../../../shared/ast-utils"),
  Traverser = require("../../../shared/traverser"),
  globals = require("../../../../conf/globals"),
  { directivesPattern } = require("../../../shared/directives"),
  CodePathAnalyzer = require("../../../linter/code-path-analysis/code-path-analyzer"),
  {
    ConfigCommentParser,
    VisitNodeStep,
    CallMethodStep,
    Directive,
  } = require("@eslint/plugin-kit");

//------------------------------------------------------------------------------
// Type Definitions
//------------------------------------------------------------------------------

/** @typedef {import("eslint-scope").Variable} Variable */
/** @typedef {import("eslint-scope").Scope} Scope */
/** @typedef {import("eslint-scope").ScopeManager} ScopeManager */
/** @typedef {import("@eslint/core").SourceCode} ISourceCode */
/** @typedef {import("@eslint/core").Directive} IDirective */
/** @typedef {import("@eslint/core").TraversalStep} ITraversalStep */

//------------------------------------------------------------------------------
// Private
//------------------------------------------------------------------------------

const commentParser = new ConfigCommentParser();

/**
 * Validates that the given AST has the required information.
 * @param {ASTNode} ast The Program node of the AST to check.
 * @throws {TypeError} If the AST doesn't contain the correct information.
 * @returns {void}
 * @private
 */
function validate(ast) {
  if (!ast) {
    throw new TypeError(`Unexpected empty AST. (${ast})`);
  }

  if (!ast.tokens) {
    throw new TypeError("AST is missing the tokens array.");
  }

  if (!ast.comments) {
    throw new TypeError("AST is missing the comments array.");
  }

  if (!ast.loc) {
    throw new TypeError("AST is missing location information.");
  }

  if (!ast.range) {
    throw new TypeError("AST is missing range information");
  }
}

/**
 * Retrieves globals for the given ecmaVersion.
 * @param {number} ecmaVersion The version to retrieve globals for.
 * @returns {Object} The globals for the given ecmaVersion.
 */
const ecmaVersionGlobals = {
  3: globals.es3,
  5: globals.es5,
};

function getGlobalsForEcmaVersion(ecmaVersion) {
  if (ecmaVersion in ecmaVersionGlobals) {
    return ecmaVersionGlobals[ecmaVersion];
  }

  if (ecmaVersion < 2015) {
    return globals[`es${ecmaVersion + 2009}`];
  }

  return globals[`es${ecmaVersion}`];
}

/**
 * Merges two sorted lists into a larger sorted list in O(n) time.
 * @param {Token[]} tokens The list of tokens.
 * @param {Token[]} comments The list of comments.
 * @returns {Token[]} A sorted list of tokens and comments.
 * @private
 */
function sortedMerge(tokens, comments) {
  const result = [];
  let tokenIndex = 0;
  let commentIndex = 0;

  while (tokenIndex < tokens.length || commentIndex < comments.length) {
    if (
      commentIndex >= comments.length ||
      (tokenIndex < tokens.length &&
        tokens[tokenIndex].range[0] < comments[commentIndex].range[0])
    ) {
      result.push(tokens[tokenIndex++]);
    } else {
      result.push(comments[commentIndex++]);
    }
  }

  return result;
}

/**
 * Normalizes a value for a global in a config
 * @param {(boolean|string|null)} configuredValue The value given for a global in configuration or in
 * a global directive comment
 * @returns {("readonly"|"writable"|"off")} The value normalized as a string
 * @throws {Error} if global value is invalid
 */
const globalValueMap = {
  off: "off",
  true: "writable",
  "true": "writable",
  "writeable": "writable",
  "writable": "writable",
  null: "readonly",
  false: "readonly",
  "false": "readonly",
  "readable": "readonly",
  "readonly": "readonly",
};

function normalizeConfigGlobal(configuredValue) {
  if (configuredValue in globalValueMap) {
    return globalValueMap[configuredValue];
  }

  throw new Error(
    `'${configuredValue}' is not a valid configuration for a global (use 'readonly', 'writable', or 'off')`,
  );
}

/**
 * Determines if two nodes or tokens overlap.
 * @param {ASTNode|Token} first The first node or token to check.
 * @param {ASTNode|Token} second The second node or token to check.
 * @returns {boolean} True if the two nodes or tokens overlap.
 * @private
 */
function nodesOrTokensOverlap(first, second) {
  return (
    (first.range[0] <= second.range[0] &&
      first.range[1] >= second.range[0]) ||
    (second.range[0] <= first.range[0] && second.range[1] >= first.range[0])
  );
}

/**
 * Performs binary search to find the line number containing a given character index.
 * Returns the lower bound - the index of the first element greater than the target.
 * **Please note that the `lineStartIndices` should be sorted in ascending order**.
 * - Time Complexity: O(log n) - Significantly faster than linear search for large files.
 * @param {number[]} lineStartIndices Sorted array of line start indices.
 * @param {number} target The character index to find the line number for.
 * @returns {number} The 1-based line number for the target index.
 * @private
 */
function findLineNumberBinarySearch(lineStartIndices, target) {
  let low = 0;
  let high = lineStartIndices.length;

  while (low < high) {
    const mid = Math.trunc((low + high) / 2);

    if (target < lineStartIndices[mid]) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

/**
 * Checks if a node is a global reference.
 * @param {ASTNode} node The node to check.
 * @param {ScopeManager} scopeManager The scope manager.
 * @returns {boolean} True if the node is a global reference.
 */
function isGlobalReference(node, scopeManager) {
  if (node.type !== "Identifier") {
    return false;
  }

  const variable = scopeManager.scopes[0].set.get(node.name);

  if (!variable || variable.defs.length > 0) {
    return false;
  }

  return variable.references.some(
    ({ identifier }) => identifier === node,
  );
}

/**
 * Adds declared globals to the scope manager.
 * @param {ScopeManager} scopeManager The scope manager.
 * @param {Object} configGlobals The globals declared in configuration.
 * @param {Object} inlineGlobals The globals declared in the source code.
 * @returns {void}
 */
function addDeclaredGlobals(
  scopeManager,
  configGlobals,
  inlineGlobals,
) {
  const finalGlobals = { ...configGlobals };

  for (const [name, data] of Object.entries(inlineGlobals)) {
    finalGlobals[name] = data.value;
  }

  const names = Object.keys(finalGlobals).filter(
    (name) => finalGlobals[name] !== "off",
  );

  scopeManager.addGlobals(names);

  const globalScope = scopeManager.scopes[0];

  for (const name of names) {
    const variable = globalScope.set.get(name);

    variable.eslintImplicitGlobalSetting = configGlobals[name];
    variable.eslintExplicitGlobal = !!inlineGlobals[name];
    variable.eslintExplicitGlobalComments = inlineGlobals[name]?.comments;
    variable.writeable = finalGlobals[name] === "writable";
  }
}

/**
 * Marks a variable as exported.
 * @param {Scope} globalScope The global scope.
 * @param {Record<string, string>} variables The variables to mark as exported.
 * @returns {void}
 */
function markExportedVariables(globalScope, variables) {
  Object.keys(variables).forEach((name) => {
    const variable = globalScope.set.get(name);

    if (variable) {
      variable.eslintUsed = true;
      variable.eslintExported = true;
    }
  });
}

/**
 * Applies language options to the source code.
 * @param {Object} languageOptions The language options.
 * @param {SourceCode} sourceCode The source code.
 * @returns {void}
 */
function applyLanguageOptions(languageOptions, sourceCode) {
  const configGlobals = getGlobalsForEcmaVersion(
    languageOptions.ecmaVersion,
  );

  const varsCache = sourceCode[caches].get("vars");

  varsCache.set("configGlobals", configGlobals);
}

/**
 * Applies inline configuration to the source code.
 * @param {SourceCode} sourceCode The source code.
 * @returns {{ problems: Array<Problem>, configs: { config: FlatConfigArray, loc: Location }[] }} The problems and configs.
 */
function applyInlineConfig(sourceCode) {
  const problems = [];
  const configs = [];
  const exportedVariables = {};
  const inlineGlobals = Object.create(null);

  sourceCode.getInlineConfigNodes().forEach((comment) => {
    const { label, value } = commentParser.parseDirective(comment.value);

    switch (label) {
      case "exported":
        Object.assign(exportedVariables, commentParser.parseListConfig(value));
        break;

      case "globals":
      case "global":
        for (const [id, idSetting] of Object.entries(
          commentParser.parseStringConfig(value),
        )) {
          let normalizedValue;

          try {
            normalizedValue = normalizeConfigGlobal(idSetting);
          } catch (err) {
            problems.push({
              ruleId: null,
              loc: comment.loc,
              message: err.message,
            });
            continue;
          }

          if (inlineGlobals[id]) {
            inlineGlobals[id].comments.push(comment);
            inlineGlobals[id].value = normalizedValue;
          } else {
            inlineGlobals[id] = {
              comments: [comment],
              value: normalizedValue,
            };
          }
        }
        break;

      case "eslint":
        const parseResult = commentParser.parseJSONLikeConfig(value);

        if (parseResult.ok) {
          configs.push({
            config: {
              rules: parseResult.config,
            },
            loc: comment.loc,
          });
        } else {
          problems.push({
            ruleId: null,
            loc: comment.loc,
            message: parseResult.error.message,
          });
        }

        break;
      case "eslint-env":
        problems.push({
          ruleId: null,
          loc: comment.loc,
          message: "/* eslint-env */ comments are no longer supported.",
        });
        break;

      // no default
    }
  });

  return { problems, configs };
}

/**
 * Finalizes the source code.
 * @param {SourceCode} sourceCode The source code.
 * @returns {void}
 */
function finalize(sourceCode) {
  const varsCache = sourceCode[caches].get("vars");
  const configGlobals = varsCache.get("configGlobals");
  const inlineGlobals = varsCache.get("inlineGlobals");
  const exportedVariables = varsCache.get("exportedVariables");
  const globalScope = sourceCode.scopeManager.scopes[0];

  addDeclaredGlobals(sourceCode.scopeManager, configGlobals, inlineGlobals);

  if (exportedVariables) {
    markExportedVariables(globalScope, exportedVariables);
  }
}

/**
 * Traverses the source code and returns the steps.
 * @param {SourceCode} sourceCode The source code.
 * @returns {Array<TraversalStep>} The steps.
 */
function traverse(sourceCode) {
  if (sourceCode.#steps) {
    return sourceCode.#steps;
  }

  const steps = (sourceCode.#steps = []);

  let analyzer = {
    enterNode(node) {
      steps.push(
        new VisitNodeStep({
          target: node,
          phase: 1,
          args: [node],
        }),
      );
    },
    leaveNode(node) {
      steps.push(
        new VisitNodeStep({
          target: node,
          phase: 2,
          args: [node],
        }),
      );
    },
    emit(eventName, args) {
      steps.push(
        new CallMethodStep({
          target: eventName,
          args,
        }),
      );
    },
  };

  if (sourceCode.isESTree) {
    analyzer = new CodePathAnalyzer(analyzer);
  }

  Traverser.traverse(sourceCode.ast, {
    enter(node, parent) {
      node.parent = parent;

      analyzer.enterNode(node);
    },
    leave(node) {
      analyzer.leaveNode(node);
    },
    visitorKeys: sourceCode.visitorKeys,
  });

  return steps;
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

const caches = Symbol("caches");

/**
 * Represents parsed source code.
 * @implements {ISourceCode}
 */
class SourceCode extends TokenStore {
  /**
   * The cache of steps that were taken while traversing the source code.
   * @type {Array<ITraversalStep>}
   */
  #steps;

  /**
   * Creates a new instance.
   * @param {string|Object} textOrConfig The source code text or config object.
   * @param {string} textOrConfig.text The source code text.
   * @param {ASTNode} textOrConfig.ast The Program node of the AST representing the code. This AST should be created from the text that BOM was stripped.
   * @param {boolean} textOrConfig.hasBOM Indicates if the text has a Unicode BOM.
   * @param {Object|null} textOrConfig.parserServices The parser services.
   * @param {ScopeManager|null} textOrConfig.scopeManager The scope of this source code.
   * @param {Object|null} textOrConfig.visitorKeys The visitor keys to traverse AST.
   * @param {ASTNode} [astIfNoConfig] The Program node of the AST representing the code. This AST should be created from the text that BOM was stripped.
   */
  constructor(textOrConfig, astIfNoConfig) {
    let text, hasBOM, ast, parserServices, scopeManager, visitorKeys;

    if (typeof textOrConfig === "string") {
      text = textOrConfig;
      ast = astIfNoConfig;
      hasBOM = false;
    } else if (typeof textOrConfig === "object" && textOrConfig !== null) {
      text = textOrConfig.text;
      ast = textOrConfig.ast;
      hasBOM = textOrConfig.hasBOM;
      parserServices = textOrConfig.parserServices;
      scopeManager = textOrConfig.scopeManager;
      visitorKeys = textOrConfig.visitorKeys;
    }

    validate(ast);
    super(ast.tokens, ast.comments);

    this[caches] = new Map([
      ["scopes", new WeakMap()],
      ["vars", new Map()],
      ["configNodes", void 0],
      ["isGlobalReference", new WeakMap()],
    ]);

    this.isESTree = ast.type === "Program";

    const textHasBOM = text.charCodeAt(0) === 0xfeff;

    this.hasBOM = textHasBOM || !!hasBOM;

    this.text = textHasBOM ? text.slice(1) : text;

    this.ast = ast;

    this.parserServices = parserServices || {};

    this.scopeManager = scopeManager || null;

    this.visitorKeys = visitorKeys || Traverser.DEFAULT_VISITOR_KEYS;

    const shebangMatched = this.text.match(astUtils.shebangPattern);
    const hasShebang =
      shebangMatched &&
      ast.comments.length &&
      ast.comments[0].value === shebangMatched[1];

    if (hasShebang) {
      ast.comments[0].type = "Shebang";
    }

    this.tokensAndComments = sortedMerge(ast.tokens, ast.comments);

    this.lines = [];

    this.lineStartIndices = [0];

    const lineEndingPattern = astUtils.createGlobalLinebreakMatcher();
    let match;

    while ((match = lineEndingPattern.exec(this.text))) {
      this.lines.push(
        this.text.slice(this.lineStartIndices.at(-1), match.index),
      );
      this.lineStartIndices.push(match.index + match[0].length);
    }
    this.lines.push(this.text.slice(this.lineStartIndices.at(-1)));

    Object.freeze(this);
    Object.freeze(this.lines);
  }

  /**
   * Split the source code into multiple lines based on the line delimiters.
   * @param {string} text Source code as a string.
   * @returns {string[]} Array of source code lines.
   * @public
   */
  static splitLines(text) {
    return text.split(astUtils.createGlobalLinebreakMatcher());
  }

  /**
   * Gets the source code for the given node.
   * @param {ASTNode} [node] The AST node to get the text for.
   * @param {number} [beforeCount] The number of characters before the node to retrieve.
   * @param {number} [afterCount] The number of characters after the node to retrieve.
   * @returns {string} The text representing the AST node.
   * @public
   */
  getText(node, beforeCount, afterCount) {
    if (node) {
      return this.text.slice(
        Math.max(node.range[0] - (beforeCount || 0), 0),
        node.range[1] + (afterCount || 0),
      );
    }
    return this.text;
  }

  /**
   * Gets the entire source text split into an array of lines.
   * @returns {string[]} The source text as an array of lines.
   * @public
   */
  getLines() {
    return this.lines;
  }

  /**
   * Retrieves an array containing all comments in the source code.
   * @returns {ASTNode[]} An array of comment nodes.
   * @public
   */
  getAllComments() {
    return this.ast.comments;
  }

  /**
   * Gets the deepest node containing a range index.
   * @param {number} index Range index of the desired node.
   * @returns {ASTNode} The node if found or null if not found.
   * @public
   */
  getNodeByRangeIndex(index) {
    let result = null;

    Traverser.traverse(this.ast, {
      visitorKeys: this.visitorKeys,
      enter(node) {
        if (node.range[0] <= index && index < node.range[1]) {
          result = node;
        } else {
          this.skip();
        }
      },
      leave(node) {
        if (node === result) {
          this.break();
        }
      },
    });

    return result;
  }

  /**
   * Determines if two nodes or tokens have at least one whitespace character
   * between them. Order does not matter. Returns false if the given nodes or
   * tokens overlap.
   * @param {ASTNode|Token} first The first node or token to check between.
   * @param {ASTNode|Token} second The second node or token to check between.
   * @returns {boolean} True if there is a whitespace character between
   * any of the tokens found between the two given nodes or tokens.
   * @public
   */
  isSpaceBetween(first, second) {
    if (nodesOrTokensOverlap(first, second)) {
      return false;
    }

    const [startingNodeOrToken, endingNodeOrToken] =
      first.range[1] <= second.range[0]
        ? [first, second]
        : [second, first];
    const firstToken =
      this.getLastToken(startingNodeOrToken) || startingNodeOrToken;
    const finalToken =
      this.getFirstToken(endingNodeOrToken) || endingNodeOrToken;
    let currentToken = firstToken;

    while (currentToken !== finalToken) {
      const nextToken = this.getTokenAfter(currentToken, {
        includeComments: true,
      });

      if (currentToken.range[1] !== nextToken.range[0]) {
        return true;
      }

      currentToken = nextToken;
    }

    return false;
  }

  /**
   * Converts a source text index into a (line, column) pair.
   * @param {number} index The index of a character in a file.
   * @throws {TypeError|RangeError} If non-numeric index or index out of range.
   * @returns {{line: number, column: number}} A {line, column} location object with 1-indexed line and 0-indexed column.
   * @public
   */
  getLocFromIndex(index) {
    if (typeof index !== "number") {
      throw new TypeError("Expected `index` to be a number.");
    }

    if (index < 0 || index > this.text.length) {
      throw new RangeError(
        `Index out of range (requested index ${index}, but source text has length ${this.text.length}).`,
      );
    }

    const lineNumber =
      index >= this.lineStartIndices.at(-1)
        ? this.lineStartIndices.length
        : findLineNumberBinarySearch(this.lineStartIndices, index);

    return {
      line: lineNumber,
      column: index - this.lineStartIndices[lineNumber - 1],
    };
  }

  /**
   * Converts a (line, column) pair into a range index.
   * @param {Object} loc A line/column location
   * @param {number} loc.line The line number of the location (1-indexed)
   * @param {number} loc.column The column number of the location (0-indexed)
   * @throws {TypeError|RangeError} If `loc` is not an object with a numeric
   *   `line` and `column`, if the `line` is less than or equal to zero or
   *   the line or column is out of the expected range.
   * @returns {number} The range index of the location in the file.
   * @public
   */
  getIndexFromLoc(loc) {
    if (
      loc === null ||
      typeof loc !== "object" ||
      typeof loc.line !== "number" ||
      typeof loc.column !== "number"
    ) {
      throw new TypeError(
        "Expected `loc` to be an object with numeric `line` and `column` properties.",
      );
    }

    if (loc.line <= 0) {
      throw new RangeError(
        `Line number out of range (line ${loc.line} requested). Line numbers should be 1-based.`,
      );
    }

    if (loc.line > this.lineStartIndices.length) {
      throw new RangeError(
        `Line number out of range (line ${loc.line} requested, but only ${this.lineStartIndices.length} lines present).`,
      );
    }

    if (loc.column < 0) {
      throw new RangeError(
        `Invalid column number (column ${loc.column} requested).`,
      );
    }

    const lineStartIndex = this.lineStartIndices[loc.line - 1];
    const lineEndIndex =
      loc.line === this.lineStartIndices.length
        ? this.text.length
        : this.lineStartIndices[loc.line];
    const positionIndex = lineStartIndex + loc.column;

    if (
      (loc.line === this.lineStartIndices.length &&
        positionIndex > lineEndIndex) ||
      (loc.line < this.lineStartIndices.length &&
        positionIndex >= lineEndIndex)
    ) {
      throw new RangeError(
        `Column number out of range (column ${loc.column} requested, but the length of line ${loc.line} is ${lineEndIndex - lineStartIndex}).`,
      );
    }

    return positionIndex;
  }

  /**
   * Gets the scope for the given node
   * @param {ASTNode} currentNode The node to get the scope of
   * @returns {Scope} The scope information for this node
   * @throws {TypeError} If the `currentNode` argument is missing.
   */
  getScope(currentNode) {
    if (!currentNode) {
      throw new TypeError("Missing required argument: node.");
    }

    const cache = this[caches].get("scopes");
    const cachedScope = cache.get(currentNode);

    if (cachedScope) {
      return cachedScope;
    }

    let node = currentNode;
    let scope;

    while (node) {
      scope = this.scopeManager.acquire(node);

      if (scope) {
        if (scope.type === "function-expression-name") {
          cache.set(currentNode, scope.childScopes[0]);
          return scope.childScopes[0];
        }

        cache.set(currentNode, scope);
        return scope;
      }

      node = node.parent;
    }

    cache.set(currentNode, this.scopeManager.scopes[0]);
    return this.scopeManager.scopes[0];
  }

  /**
   * Get the variables that `node` defines.
   * This is a convenience method that passes through
   * to the same method on the `scopeManager`.
   * @param {ASTNode} node The node for which the variables are obtained.
   * @returns {Array<Variable>} An array of variable nodes representing
   *      the variables that `node` defines.
   */
  getDeclaredVariables(node) {
    return this.scopeManager.getDeclaredVariables(node);
  }

  /**
   * Gets all the ancestors of a given node
   * @param {ASTNode} node The node
   * @returns {Array<ASTNode>} All the ancestor nodes in the AST, not including the provided node, starting
   * from the root node at index 0 and going inwards to the parent node.
   * @throws {TypeError} When `node` is missing.
   */
  getAncestors(node) {
    if (!node) {
      throw new TypeError("Missing required argument: node.");
    }

    const ancestorsStartingAtParent = [];

    for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
      ancestorsStartingAtParent.push(ancestor);
    }

    return ancestorsStartingAtParent.reverse();
  }

  /**
   * Determines whether the given identifier node is a reference to a global variable.
   * @param {ASTNode} node `Identifier` node to check.
   * @returns {boolean} True if the identifier is a reference to a global variable.
   */
  isGlobalReference(node) {
    if (!node) {
      throw new TypeError("Missing required argument: node.");
    }

    const cache = this[caches].get("isGlobalReference");

    if (cache.has(node)) {
      return cache.get(node);
    }

    const result = isGlobalReference(node, this.scopeManager);
    cache.set(node, result);
    return result;
  }

  /**
   * Returns the location of the given node or token.
   * @param {ASTNode|Token} nodeOrToken The node or token to get the location of.
   * @returns {SourceLocation} The location of the node or token.
   */
  getLoc(nodeOrToken) {
    return nodeOrToken.loc;
  }

  /**
   * Returns the range of the given node or token.
   * @param {ASTNode|Token} nodeOrToken The node or token to get the range of.
   * @returns {[number, number]} The range of the node or token.
   */
  getRange(nodeOrToken) {
    return nodeOrToken.range;
  }

  /**
   * Marks a variable as used in the current scope
   * @param {string} name The name of the variable to mark as used.
   * @param {ASTNode} [refNode] The closest node to the variable reference.
   * @returns {boolean} True if the variable was found and marked as used, false if not.
   */
  markVariableAsUsed(name, refNode = this.ast) {
    const currentScope = this.getScope(refNode);
    let initialScope = currentScope;

    if (
      currentScope.type === "global" &&
      currentScope.childScopes.length > 0 &&
      currentScope.childScopes[0].block === this.ast
    ) {
      initialScope = currentScope.childScopes[0];
    }

    for (let scope = initialScope; scope; scope = scope.upper) {
      const variable = scope.variables.find(
        (scopeVar) => scopeVar.name === name,
      );

      if (variable) {
        variable.eslintUsed = true;
        return true;
      }
    }

    return false;
  }

  /**
   * Returns an array of all inline configuration nodes found in the
   * source code.
   * @returns {Array<Token>} An array of all inline configuration nodes.
   */
  getInlineConfigNodes() {
    let configNodes = this[caches].get("configNodes");

    if (configNodes) {
      return configNodes;
    }

    configNodes = this.ast.comments.filter((comment) => {
      if (comment.type === "Shebang") {
        return false;
      }

      const directive = commentParser.parseDirective(comment.value);

      if (!directive) {
        return false;
      }

      if (!directivesPattern.test(directive.label)) {
        return false;
      }

      return (
        comment.type !== "Line" ||
        !!/^eslint-disable-(?:next-)?line$/u.test(directive.label)
      );
    });

    this[caches].set("configNodes", configNodes);

    return configNodes;
  }

  /**
   * Returns an all directive nodes that enable or disable rules along with any problems
   * encountered while parsing the directives.
   * @returns {{problems:Array<Problem>,directives:Array<Directive>}} Information
   *      that ESLint needs to further process the directives.
   */
  getDisableDirectives() {
    const cachedDirectives = this[caches].get("disableDirectives");

    if (cachedDirectives) {
      return cachedDirectives;
    }

    const problems = [];
    const directives = [];

    this.getInlineConfigNodes().forEach((comment) => {
      const { label, value } = commentParser.parseDirective(comment.value);

      switch (label) {
        case "eslint-disable":
        case "eslint-enable":
        case "eslint-disable-next-line":
        case "eslint-disable-line": {
          const directiveType = label.slice("eslint-".length);

          directives.push(
            new Directive({
              type: directiveType,
              node: comment,
              value,
            }),
          );
        }

        // no default
      }
    });

    const result = { problems, directives };

    this[caches].set("disableDirectives", result);

    return result;
  }

  /**
   * Applies language options sent in from the core.
   * @param {Object} languageOptions The language options for this run.
   * @returns {void}
   */
  applyLanguageOptions(languageOptions) {
    applyLanguageOptions(languageOptions, this);
  }

  /**
   * Applies configuration found inside of the source code. This method is only
   * called when ESLint is running with inline configuration allowed.
   * @returns {{problems:Array<Problem>,configs:{config:FlatConfigArray,loc:Location}}} Information
   *      that ESLint needs to further process the inline configuration.
   */
  applyInlineConfig() {
    return applyInlineConfig(this);
  }

  /**
   * Called by ESLint core to indicate that it has finished providing
   * information. We now add in all the missing variables and ensure that
   * state-changing methods cannot be called by rules.
   * @returns {void}
   */
  finalize() {
    finalize(this);
  }

  /**
   * Traverse the source code and return the steps that were taken.
   * @returns {Array<TraversalStep>} The steps that were taken while traversing the source code.
   */
  traverse() {
    return traverse(this);
  }
}

module.exports = SourceCode;
```