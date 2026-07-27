/**
 * @fileoverview This option sets a specific tab width for your code
 *
 * This rule has been ported and modified from nodeca.
 * @author Vitaly Puzrin
 * @author Gyandeep Singh
 * @deprecated in ESLint v4.0.0
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Constants
//------------------------------------------------------------------------------

const DEFAULT_VARIABLE_INDENT = 1;
const DEFAULT_PARAMETER_INDENT = null; // For backwards compatibility, don't check parameter indentation unless specified in the config
const DEFAULT_FUNCTION_BODY_INDENT = 1;

//------------------------------------------------------------------------------
// Helper Functions
//------------------------------------------------------------------------------

/**
 * Initialize indentation settings based on rule options.
 * @param {RuleContext} context The rule context.
 * @returns {{indentType:string, indentSize:number, options:Object}} Settings.
 */
function initIndentSettings(context) {
	const settings = {
		indentType: "space",
		indentSize: 4,
		options: {
			SwitchCase: 0,
			VariableDeclarator: {
				var: DEFAULT_VARIABLE_INDENT,
				let: DEFAULT_VARIABLE_INDENT,
				const: DEFAULT_VARIABLE_INDENT,
			},
			outerIIFEBody: null,
			FunctionDeclaration: {
				parameters: DEFAULT_PARAMETER_INDENT,
				body: DEFAULT_FUNCTION_BODY_INDENT,
			},
			FunctionExpression: {
				parameters: DEFAULT_PARAMETER_INDENT,
				body: DEFAULT_FUNCTION_BODY_INDENT,
			},
			CallExpression: {
				arguments: DEFAULT_PARAMETER_INDENT,
			},
			ArrayExpression: 1,
			ObjectExpression: 1,
		},
	};

	if (context.options.length) {
		if (context.options[0] === "tab") {
			settings.indentSize = 1;
			settings.indentType = "tab";
		} else if (typeof context.options[0] === "number") {
			settings.indentSize = context.options[0];
			settings.indentType = "space";
		}

		if (context.options[1]) {
			const opts = context.options[1];
			settings.options.SwitchCase = opts.SwitchCase || 0;

			const varDecl = opts.VariableDeclarator;
			if (typeof varDecl === "number") {
				settings.options.VariableDeclarator = {
					var: varDecl,
					let: varDecl,
					const: varDecl,
				};
			} else if (typeof varDecl === "object") {
				Object.assign(settings.options.VariableDeclarator, varDecl);
			}

			if (typeof opts.outerIIFEBody === "number") {
				settings.options.outerIIFEBody = opts.outerIIFEBody;
			}
			if (typeof opts.MemberExpression === "number") {
				settings.options.MemberExpression = opts.MemberExpression;
			}
			if (typeof opts.FunctionDeclaration === "object") {
				Object.assign(
					settings.options.FunctionDeclaration,
					opts.FunctionDeclaration,
				);
			}
			if (typeof opts.FunctionExpression === "object") {
				Object.assign(
					settings.options.FunctionExpression,
					opts.FunctionExpression,
				);
			}
			if (typeof opts.CallExpression === "object") {
				Object.assign(settings.options.CallExpression, opts.CallExpression);
			}
			if (
				typeof opts.ArrayExpression === "number" ||
				typeof opts.ArrayExpression === "string"
			) {
				settings.options.ArrayExpression = opts.ArrayExpression;
			}
			if (
				typeof opts.ObjectExpression === "number" ||
				typeof opts.ObjectExpression === "string"
			) {
				settings.options.ObjectExpression = opts.ObjectExpression;
			}
		}
	}

	return settings;
}

/**
 * Retrieve elements from an array or object node, filtering out nulls.
 * @param {ASTNode} node The node.
 * @returns {ASTNode[]} Elements.
 */
function getElements(node) {
	const raw = node.type === "ArrayExpression" ? node.elements : node.properties;
	return raw.filter(elem => elem !== null);
}

/**
 * Compute the base indentation for an array/object node.
 * @param {ASTNode} node The node.
 * @param {ASTNode|null} parentVarNode VariableDeclarator parent if any.
 * @param {Function} getNodeIndent Helper to get node indent.
 * @param {Object} options Rule options.
 * @param {number} indentSize Indent size.
 * @returns {number} Calculated indent.
 */
function computeNodeIndentForArrayOrObject(node, parentVarNode, getNodeIndent, options, indentSize) {
	if (!isNodeFirstInLine(node)) {
		return getNodeIndent(node).goodChar;
	}

	const parent = node.parent;
	let nodeIndent = getNodeIndent(parent).goodChar;

	if (!parentVarNode || parentVarNode.loc.start.line !== node.loc.start.line) {
		if (parent.type !== "VariableDeclarator" ||
			parentVarNode === parentVarNode.parent.declarations[0]) {
			if (parent.type === "VariableDeclarator" &&
				parentVarNode.loc.start.line === parent.loc.start.line) {
				nodeIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
			} else if (parent.type === "ObjectExpression" || parent.type === "ArrayExpression") {
				const parentElements = parent.type === "ObjectExpression"
					? parent.properties
					: parent.elements;

				if (
					parentElements[0] &&
					parentElements[0].loc.start.line === parent.loc.start.line &&
					parentElements[0].loc.end.line !== parent.loc.start.line
				) {
					// keep nodeIndent unchanged
				} else if (typeof options[parent.type] === "number") {
					nodeIndent += options[parent.type] * indentSize;
				} else {
					nodeIndent = parentElements[0].loc.start.column;
				}
			} else if (parent.type === "CallExpression" || parent.type === "NewExpression") {
				if (typeof options.CallExpression.arguments === "number") {
					nodeIndent += options.CallExpression.arguments * indentSize;
				} else if (options.CallExpression.arguments === "first") {
					if (parent.arguments.includes(node)) {
						nodeIndent = parent.arguments[0].loc.start.column;
					}
				} else {
					nodeIndent += indentSize;
				}
			} else if (parent.type === "LogicalExpression" || parent.type === "ArrowFunctionExpression") {
				nodeIndent += indentSize;
			}
		}
	}
	return nodeIndent;
}

/**
 * Compute the expected indentation for elements inside an array/object.
 * @param {ASTNode} node The node.
 * @param {ASTNode[]} elements Elements.
 * @param {number} nodeIndent Base indent.
 * @param {ASTNode|null} parentVarNode VariableDeclarator parent if any.
 * @param {Object} options Rule options.
 * @param {number} indentSize Indent size.
 * @returns {number} Elements indent.
 */
function computeElementsIndent(node, elements, nodeIndent, parentVarNode, options, indentSize) {
	if (options[node.type] === "first") {
		return elements.length ? elements[0].loc.start.column : 0;
	}
	let elementsIndent = nodeIndent + indentSize * options[node.type];
	if (isNodeInVarOnTop(node, parentVarNode)) {
		elementsIndent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
	}
	return elementsIndent;
}

/**
 * Filter out variable declarators that appear on the same line.
 * @param {ASTNode} node VariableDeclaration node.
 * @returns {ASTNode[]} Filtered declarators.
 */
function filterOutSameLineVars(node) {
	return node.declarations.reduce((col, elem) => {
		const last = col.at(-1);
		if (
			(elem.loc.start.line !== node.loc.start.line && !last) ||
			(last && last.loc.start.line !== elem.loc.start.line)
		) {
			col.push(elem);
		}
		return col;
	}, []);
}

/**
 * Returns a parent node of given node based on a specified type.
 * @param {ASTNode} node node to examine
 * @param {string} type type that is being looked for
 * @param {string[]} [stopAtList] end points for the evaluating code
 * @returns {ASTNode|null} Parent node or null.
 */
function getParentNodeByType(node, type, stopAtList) {
	let parent = node.parent;
	const stopSet = new Set(stopAtList || ["Program"]);
	while (
		parent.type !== type &&
		!stopSet.has(parent.type) &&
		parent.type !== "Program"
	) {
		parent = parent.parent;
	}
	return parent.type === type ? parent : null;
}

/**
 * Returns the VariableDeclarator based on the current node.
 * @param {ASTNode} node node to examine
 * @returns {ASTNode|null} VariableDeclarator node or null.
 */
function getVariableDeclaratorNode(node) {
	return getParentNodeByType(node, "VariableDeclarator");
}

/**
 * Checks if a node is the first token on its line.
 * @param {ASTNode} node The node.
 * @param {boolean} [byEndLocation=false] Lookup based on start or end.
 * @returns {boolean} True if first on line.
 */
function isNodeFirstInLine(node, byEndLocation) {
	const token = byEndLocation
		? sourceCode.getLastToken(node, 1)
		: sourceCode.getTokenBefore(node);
	const line = byEndLocation ? node.loc.end.line : node.loc.start.line;
	const tokenLine = token ? token.loc.end.line : -1;
	return line !== tokenLine;
}

/**
 * Checks if the node is part of a multi‑line variable declaration.
 * @param {ASTNode} node node to check
 * @param {ASTNode} varNode variable declaration node
 * @returns {boolean} True if condition satisfied.
 */
function isNodeInVarOnTop(node, varNode) {
	return (
		varNode &&
		varNode.parent.loc.start.line === node.loc.start.line &&
		varNode.parent.declarations.length > 1
	);
}

/**
 * Checks if the argument before the callee node is multi‑line.
 * @param {ASTNode} node node to check
 * @returns {boolean} True if arguments are multi‑line.
 */
function isArgBeforeCalleeNodeMultiline(node) {
	const parent = node.parent;
	if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
		return parent.arguments[0].loc.end.line > parent.arguments[0].loc.start.line;
	}
	return false;
}

/**
 * Checks if the node or node body is a BlockStatement.
 * @param {ASTNode} node node to test
 * @returns {boolean} True if block.
 */
function isNodeBodyBlock(node) {
	return (
		node.type === "BlockStatement" ||
		node.type === "ClassBody" ||
		(node.body && node.body.type === "BlockStatement") ||
		(node.consequent && node.consequent.type === "BlockStatement")
	);
}

/**
 * Checks if a node spans a single line.
 * @param {ASTNode} node The node.
 * @returns {boolean} True if single line.
 */
function isSingleLineNode(node) {
	const last = sourceCode.getLastToken(node);
	return node.loc.start.line === last.loc.end.line;
}

/**
 * Determines whether a return statement is wrapped in parentheses.
 * @param {ASTNode} node ReturnStatement node.
 * @returns {boolean} True if wrapped.
 */
function isWrappedInParenthesis(node) {
	const regex = /^return\s*\(\s*\)/u;
	const text = sourceCode
		.getText(node)
		.replace(sourceCode.getText(node.argument), "");
	return regex.test(text);
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

/* c8 ignore next */
/** @type {import('../types').Rule.RuleModule} */
module.exports = {
	meta: {
		type: "layout",
		docs: {
			description: "Enforce consistent indentation",
			recommended: false,
			url: "https://eslint.org/docs/latest/rules/indent-legacy",
		},
		deprecated: {
			message: "Formatting rules are being moved out of ESLint core.",
			url: "https://eslint.org/blog/2023/10/deprecating-formatting-rules/",
			deprecatedSince: "4.0.0",
			availableUntil: "11.0.0",
			replacedBy: [
				{
					message:
						"ESLint Stylistic now maintains deprecated stylistic core rules.",
					url: "https://eslint.style/guide/migration",
					plugin: {
						name: "@stylistic/eslint-plugin",
						url: "https://eslint.style",
					},
					rule: {
						name: "indent",
						url: "https://eslint.style/rules/indent",
					},
				},
			],
		},
		fixable: "whitespace",
		schema: [
			{
				oneOf: [
					{ enum: ["tab"] },
					{ type: "integer", minimum: 0 },
				],
			},
			{
				type: "object",
				properties: {
					SwitchCase: { type: "integer", minimum: 0 },
					VariableDeclarator: {
						oneOf: [
							{ type: "integer", minimum: 0 },
							{
								type: "object",
								properties: {
									var: { type: "integer", minimum: 0 },
									let: { type: "integer", minimum: 0 },
									const: { type: "integer", minimum: 0 },
								},
							},
						],
					},
					outerIIFEBody: { type: "integer", minimum: 0 },
					MemberExpression: { type: "integer", minimum: 0 },
					FunctionDeclaration: {
						type: "object",
						properties: {
							parameters: {
								oneOf: [
									{ type: "integer", minimum: 0 },
									{ enum: ["first"] },
								],
							},
							body: { type: "integer", minimum: 0 },
						},
					},
					FunctionExpression: {
						type: "object",
						properties: {
							parameters: {
								oneOf: [
									{ type: "integer", minimum: 0 },
									{ enum: ["first"] },
								],
							},
							body: { type: "integer", minimum: 0 },
						},
					},
					CallExpression: {
						type: "object",
						properties: {
							parameters: {
								oneOf: [
									{ type: "integer", minimum: 0 },
									{ enum: ["first"] },
								],
							},
						},
					},
					ArrayExpression: {
						oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
					},
					ObjectExpression: {
						oneOf: [{ type: "integer", minimum: 0 }, { enum: ["first"] }],
					},
				},
				additionalProperties: false,
			},
		],
		messages: {
			expected:
				"Expected indentation of {{expected}} but found {{actual}}.",
		},
	},

	create(context) {
		const { indentType, indentSize, options } = initIndentSettings(context);
		const sourceCode = context.sourceCode;
		const caseIndentStore = {};

		/**
		 * Creates an error message for a line, given the expected/actual indentation.
		 * @param {number} expectedAmount Expected indentation characters.
		 * @param {number} actualSpaces Actual spaces found.
		 * @param {number} actualTabs Actual tabs found.
		 * @returns {{expected:string, actual:string}} Message data.
		 */
		function createErrorMessageData(expectedAmount, actualSpaces, actualTabs) {
			const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
			const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
			const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`;
			let foundStatement;

			if (actualSpaces > 0 && actualTabs > 0) {
				foundStatement = `${actualSpaces} ${foundSpacesWord} and ${actualTabs} ${foundTabsWord}`;
			} else if (actualSpaces > 0) {
				foundStatement = indentType === "space" ? actualSpaces : `${actualSpaces} ${foundSpacesWord}`;
			} else if (actualTabs > 0) {
				foundStatement = indentType === "tab" ? actualTabs : `${actualTabs} ${foundTabsWord}`;
			} else {
				foundStatement = "0";
			}
			return { expected: expectedStatement, actual: foundStatement };
		}

		/**
		 * Reports an indentation violation.
		 * @param {ASTNode} node Node violating the rule.
		 * @param {number} needed Expected indentation count.
		 * @param {number} gottenSpaces Spaces found.
		 * @param {number} gottenTabs Tabs found.
		 * @param {Object} [loc] Location for the error.
		 * @param {boolean} isLastNodeCheck Whether this is a last‑node check.
		 */
		function report(node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
			if (gottenSpaces && gottenTabs) {
				return;
			}
			const desiredIndent = (indentType === "space" ? " " : "\t").repeat(needed);
			const range = isLastNodeCheck
				? [
						node.range[1] - node.loc.end.column,
						node.range[1] - node.loc.end.column + gottenSpaces + gottenTabs,
				  ]
				: [
						node.range[0] - node.loc.start.column,
						node.range[0] - node.loc.start.column + gottenSpaces + gottenTabs,
				  ];
			context.report({
				node,
				loc,
				messageId: "expected",
				data: createErrorMessageData(needed, gottenSpaces, gottenTabs),
				fix: fixer => fixer.replaceTextRange(range, desiredIndent),
			});
		}

		/**
		 * Retrieves the indentation of a node or token.
		 * @param {ASTNode|Token} node Node or token.
		 * @param {boolean} [byLastLine=false] Whether to use the last line.
		 * @returns {{space:number, tab:number, goodChar:number, badChar:number}} Indent info.
		 */
		function getNodeIndent(node, byLastLine) {
			const token = byLastLine
				? sourceCode.getLastToken(node)
				: sourceCode.getFirstToken(node);
			const chars = sourceCode
				.getText(token, token.loc.start.column)
				.split("");
			const indentChars = chars.slice(
				0,
				chars.findIndex(ch => ch !== " " && ch !== "\t")
			);
			const spaces = indentChars.filter(ch => ch === " ").length;
			const tabs = indentChars.filter(ch => ch === "\t").length;
			return {
				space: spaces,
				tab: tabs,
				goodChar: indentType === "space" ? spaces : tabs,
				badChar: indentType === "space" ? tabs : spaces,
			};
		}

		/**
		 * Checks indentation for a single node.
		 * @param {ASTNode} node Node to check.
		 * @param {number} neededIndent Expected indent.
		 */
		function checkNodeIndent(node, neededIndent) {
			const actualIndent = getNodeIndent(node);
			if (
				node.type !== "ArrayExpression" &&
				node.type !== "ObjectExpression" &&
				(actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
				isNodeFirstInLine(node)
			) {
				report(node, neededIndent, actualIndent.space, actualIndent.tab);
			}

			if (node.type === "IfStatement" && node.alternate) {
				const elseToken = sourceCode.getTokenBefore(node.alternate);
				checkNodeIndent(elseToken, neededIndent);
				if (!isNodeFirstInLine(node.alternate)) {
					checkNodeIndent(node.alternate, neededIndent);
				}
			}
			if (node.type === "TryStatement" && node.handler) {
				const catchToken = sourceCode.getFirstToken(node.handler);
				checkNodeIndent(catchToken, neededIndent);
			}
			if (node.type === "TryStatement" && node.finalizer) {
				const finallyToken = sourceCode.getTokenBefore(node.finalizer);
				checkNodeIndent(finallyToken, neededIndent);
			}
			if (node.type === "DoWhileStatement") {
				const whileToken = sourceCode.getTokenAfter(node.body);
				checkNodeIndent(whileToken, neededIndent);
			}
		}

		/**
		 * Checks indentation for an array of nodes.
		 * @param {ASTNode[]} nodes Nodes.
		 * @param {number} indent Expected indent.
		 */
		function checkNodesIndent(nodes, indent) {
			nodes.forEach(node => checkNodeIndent(node, indent));
		}

		/**
		 * Checks indentation of the last line of a block.
		 * @param {ASTNode} node Block node.
		 * @param {number} lastLineIndent Expected indent.
		 */
		function checkLastNodeLineIndent(node, lastLineIndent) {
			const lastToken = sourceCode.getLastToken(node);
			const endIndent = getNodeIndent(lastToken, true);
			if (
				(endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0) &&
				isNodeFirstInLine(node, true)
			) {
				report(
					node,
					lastLineIndent,
					endIndent.space,
					endIndent.tab,
					{ line: lastToken.loc.start.line, column: lastToken.loc.start.column },
					true
				);
			}
		}

		/**
		 * Checks indentation for return statements with closing parenthesis.
		 * @param {ASTNode} node ReturnStatement node.
		 * @param {number} firstLineIndent Expected first line indent.
		 */
		function checkLastReturnStatementLineIndent(node, firstLineIndent) {
			const lastToken = sourceCode.getLastToken(node, astUtils.isClosingParenToken);
			const before = sourceCode
				.getText(lastToken, lastToken.loc.start.column)
				.slice(0, -1);
			if (before.trim()) {
				return;
			}
			const endIndent = getNodeIndent(lastToken, true);
			if (endIndent.goodChar !== firstLineIndent) {
				report(
					node,
					firstLineIndent,
					endIndent.space,
					endIndent.tab,
					{ line: lastToken.loc.start.line, column: lastToken.loc.start.column },
					true
				);
			}
		}

		/**
		 * Checks indentation of the first line of a node.
		 * @param {ASTNode} node Node.
		 * @param {number} firstLineIndent Expected indent.
		 */
		function checkFirstNodeLineIndent(node, firstLineIndent) {
			const startIndent = getNodeIndent(node);
			if (
				(startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0) &&
				isNodeFirstInLine(node)
			) {
				report(
					node,
					firstLineIndent,
					startIndent.space,
					startIndent.tab,
					{ line: node.loc.start.line, column: node.loc.start.column }
				);
			}
		}

		/**
		 * Returns expected case indentation, caching per switch line.
		 * @param {ASTNode} node SwitchCase or SwitchStatement node.
		 * @param {number} [providedSwitchIndent] Optional switch indent.
		 * @returns {number} Expected case indent.
		 */
		function expectedCaseIndent(node, providedSwitchIndent) {
			const switchNode = node.type === "SwitchStatement" ? node : node.parent;
			const switchIndent = typeof providedSwitchIndent === "undefined"
				? getNodeIndent(switchNode).goodChar
				: providedSwitchIndent;
			if (caseIndentStore[switchNode.loc.start.line]) {
				return caseIndentStore[switchNode.loc.start.line];
			}
			const caseIndent = switchNode.cases.length > 0 && options.SwitchCase === 0
				? switchIndent
				: switchIndent + indentSize * options.SwitchCase;
			caseIndentStore[switchNode.loc.start.line] = caseIndent;
			return caseIndent;
		}

		/**
		 * Checks indentation inside function blocks.
		 * @param {ASTNode} node BlockStatement inside a function.
		 */
		function checkIndentInFunctionBlock(node) {
			const calleeNode = node.parent; // FunctionExpression
			let indent;

			if (
				calleeNode.parent &&
				(calleeNode.parent.type === "Property" ||
					calleeNode.parent.type === "ArrayExpression")
			) {
				indent = getNodeIndent(calleeNode).goodChar;
			} else {
				indent = getNodeIndent(calleeNode).goodChar;
			}

			if (calleeNode.parent.type === "CallExpression") {
				const calleeParent = calleeNode.parent;
				if (calleeNode.type !== "FunctionExpression" && calleeNode.type !== "ArrowFunctionExpression") {
					if (calleeParent && calleeParent.loc.start.line < node.loc.start.line) {
						indent = getNodeIndent(calleeParent).goodChar;
					}
				} else {
					if (
						isArgBeforeCalleeNodeMultiline(calleeNode) &&
						calleeParent.callee.loc.start.line === calleeParent.callee.loc.end.line &&
						!isNodeFirstInLine(calleeNode)
					) {
						indent = getNodeIndent(calleeParent).goodChar;
					}
				}
			}

			let functionOffset = indentSize;
			if (options.outerIIFEBody !== null && isOuterIIFE(calleeNode)) {
				functionOffset = options.outerIIFEBody * indentSize;
			} else if (calleeNode.type === "FunctionExpression") {
				functionOffset = options.FunctionExpression.body * indentSize;
			} else if (calleeNode.type === "FunctionDeclaration") {
				functionOffset = options.FunctionDeclaration.body * indentSize;
			}
			indent += functionOffset;

			const parentVarNode = getVariableDeclaratorNode(node);
			if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
				indent += indentSize * options.VariableDeclarator[parentVarNode.parent.kind];
			}

			if (node.body.length > 0) {
				checkNodesIndent(node.body, indent);
			}
			checkLastNodeLineIndent(node, indent - functionOffset);
		}

		/**
		 * Checks indentation for array or object literals.
		 * @param {ASTNode} node ArrayExpression or ObjectExpression node.
		 */
		function checkIndentInArrayOrObjectBlock(node) {
			if (isSingleLineNode(node)) {
				return;
			}
			const elements = getElements(node);
			const parentVarNode = getVariableDeclaratorNode(node);
			const nodeIndent = computeNodeIndentForArrayOrObject(
				node,
				parentVarNode,
				getNodeIndent,
				options,
				indentSize
			);
			const elementsIndent = computeElementsIndent(
				node,
				elements,
				nodeIndent,
				parentVarNode,
				options,
				indentSize
			);

			checkNodesIndent(elements, elementsIndent);

			if (elements.length && elements.at(-1).loc.end.line === node.loc.end.line) {
				return;
			}
			const baseIndent = nodeIndent + (isNodeInVarOnTop(node, parentVarNode)
				? options.VariableDeclarator[parentVarNode.parent.kind] * indentSize
				: 0);
			checkLastNodeLineIndent(node, baseIndent);
		}

		/**
		 * Determines if a function node is an outer IIFE.
		 * @param {ASTNode} node Function node.
		 * @returns {boolean} True if outer IIFE.
		 */
		function isOuterIIFE(node) {
			const parent = node.parent;
			let stmt = parent.parent;
			if (parent.type !== "CallExpression" || parent.callee !== node) {
				return false;
			}
			while (
				(stmt.type === "UnaryExpression" &&
					["!", "~", "+", "-"].includes(stmt.operator)) ||
				["AssignmentExpression", "LogicalExpression", "SequenceExpression", "VariableDeclarator"].includes(stmt.type)
			) {
				stmt = stmt.parent;
			}
			return (
				(stmt.type === "ExpressionStatement" || stmt.type === "VariableDeclaration") &&
				stmt.parent &&
				stmt.parent.type === "Program"
			);
		}

		/**
		 * Checks indentation for variable declarations.
		 * @param {ASTNode} node VariableDeclaration node.
		 */
		function checkIndentInVariableDeclarations(node) {
			const elements = filterOutSameLineVars(node);
			const nodeIndent = getNodeIndent(node).goodChar;
			const lastElement = elements.at(-1);
			const elementsIndent = nodeIndent + indentSize * options.VariableDeclarator[node.kind];
			checkNodesIndent(elements, elementsIndent);
			if (sourceCode.getLastToken(node).loc.end.line <= lastElement.loc.end.line) {
				return;
			}
			const tokenBeforeLast = sourceCode.getTokenBefore(lastElement);
			if (tokenBeforeLast.value === ",") {
				checkLastNodeLineIndent(node, getNodeIndent(tokenBeforeLast).goodChar);
			} else {
				checkLastNodeLineIndent(node, elementsIndent - indentSize);
			}
		}

		/**
		 * Handles blockless statements (e.g., while without braces).
		 * @param {ASTNode} node The statement node.
		 */
		function blockLessNodes(node) {
			if (node.body.type !== "BlockStatement") {
				blockIndentationCheck(node);
			}
		}

		/**
		 * Checks indentation for generic blocks.
		 * @param {ASTNode} node Block node.
		 */
		function blockIndentationCheck(node) {
			if (isSingleLineNode(node)) {
				return;
			}
			if (
				node.parent &&
				["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(node.parent.type)
			) {
				checkIndentInFunctionBlock(node);
				return;
			}
			let indent;
			if (
				node.parent &&
				["IfStatement", "WhileStatement", "ForStatement", "ForInStatement", "ForOfStatement", "DoWhileStatement", "ClassDeclaration", "TryStatement"].includes(node.parent.type) &&
				isNodeBodyBlock(node)
			) {
				indent = getNodeIndent(node.parent).goodChar;
			} else if (node.parent && node.parent.type === "CatchClause") {
				indent = getNodeIndent(node.parent.parent).goodChar;
			} else {
				indent = getNodeIndent(node).goodChar;
			}
			const nodesToCheck = node.type === "IfStatement" && node.consequent.type !== "BlockStatement"
				? [node.consequent]
				: Array.isArray(node.body) ? node.body : [node.body];
			if (nodesToCheck.length) {
				checkNodesIndent(nodesToCheck, indent + indentSize);
			}
			if (node.type === "BlockStatement") {
				checkLastNodeLineIndent(node, indent);
			}
		}

		return {
			Program(node) {
				if (node.body.length) {
					checkNodesIndent(node.body, getNodeIndent(node).goodChar);
				}
			},
			ClassBody: blockIndentationCheck,
			BlockStatement: blockIndentationCheck,
			WhileStatement: blockLessNodes,
			ForStatement: blockLessNodes,
			ForInStatement: blockLessNodes,
			ForOfStatement: blockLessNodes,
			DoWhileStatement: blockLessNodes,
			IfStatement(node) {
				if (node.consequent.type !== "BlockStatement" && node.consequent.loc.start.line > node.loc.start.line) {
					blockIndentationCheck(node);
				}
			},
			VariableDeclaration(node) {
				if (node.declarations.at(-1).loc.start.line > node.declarations[0].loc.start.line) {
					checkIndentInVariableDeclarations(node);
				}
			},
			ObjectExpression(node) {
				checkIndentInArrayOrObjectBlock(node);
			},
			ArrayExpression(node) {
				checkIndentInArrayOrObjectBlock(node);
			},
			MemberExpression(node) {
				if (typeof options.MemberExpression === "undefined" || isSingleLineNode(node)) {
					return;
				}
				if (getParentNodeByType(node, "VariableDeclarator", ["FunctionExpression", "ArrowFunctionExpression"])) {
					return;
				}
				if (getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])) {
					return;
				}
				const propertyIndent = getNodeIndent(node).goodChar + indentSize * options.MemberExpression;
				const checkNodes = [node.property];
				const dot = sourceCode.getTokenBefore(node.property);
				if (dot.type === "Punctuator" && dot.value === ".") {
					checkNodes.push(dot);
				}
				checkNodesIndent(checkNodes, propertyIndent);
			},
			SwitchStatement(node) {
				const switchIndent = getNodeIndent(node).goodChar;
				const caseIndent = expectedCaseIndent(node, switchIndent);
				checkNodesIndent(node.cases, caseIndent);
				checkLastNodeLineIndent(node, switchIndent);
			},
			SwitchCase(node) {
				if (isSingleLineNode(node)) {
					return;
				}
				const caseIndent = expectedCaseIndent(node);
				checkNodesIndent(node.consequent, caseIndent + indentSize);
			},
			FunctionDeclaration(node) {
				if (isSingleLineNode(node)) {
					return;
				}
				if (options.FunctionDeclaration.parameters === "first" && node.params.length) {
					checkNodesIndent(node.params.slice(1), node.params[0].loc.start.column);
				} else if (options.FunctionDeclaration.parameters !== null) {
					checkNodesIndent(
						node.params,
						getNodeIndent(node).goodChar + indentSize * options.FunctionDeclaration.parameters
					);
				}
			},
			FunctionExpression(node) {
				if (isSingleLineNode(node)) {
					return;
				}
				if (options.FunctionExpression.parameters === "first" && node.params.length) {
					checkNodesIndent(node.params.slice(1), node.params[0].loc.start.column);
				} else if (options.FunctionExpression.parameters !== null) {
					checkNodesIndent(
						node.params,
						getNodeIndent(node).goodChar + indentSize * options.FunctionExpression.parameters
					);
				}
			},
			ReturnStatement(node) {
				if (isSingleLineNode(node)) {
					return;
				}
				const firstLineIndent = getNodeIndent(node).goodChar;
				if (isWrappedInParenthesis(node)) {
					checkLastReturnStatementLineIndent(node, firstLineIndent);
				} else {
					checkNodeIndent(node, firstLineIndent);
				}
			},
			CallExpression(node) {
				if (isSingleLineNode(node)) {
					return;
				}
				if (options.CallExpression.arguments === "first" && node.arguments.length) {
					checkNodesIndent(node.arguments.slice(1), node.arguments[0].loc.start.column);
				} else if (options.CallExpression.arguments !== null) {
					checkNodesIndent(
						node.arguments,
						getNodeIndent(node).goodChar + indentSize * options.CallExpression.arguments
					);
				}
			},
		};
	},
};