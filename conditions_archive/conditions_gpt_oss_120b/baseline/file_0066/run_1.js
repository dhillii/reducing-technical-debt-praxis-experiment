```javascript
/**
 * @fileoverview This option sets a specific tab width for your code
 *
 * This rule has been ported and modified from nodeca.
 * @author Vitaly Puzrin
 * @author Gyandeep Singh
 * @deprecated in ESLint v4.0.0
 */

"use strict";

const astUtils = require("./utils/ast-utils");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function parseOptions(context) {
	const DEFAULT_VARIABLE_INDENT = 1;
	const DEFAULT_PARAMETER_INDENT = null;
	const DEFAULT_FUNCTION_BODY_INDENT = 1;

	let indentType = "space";
	let indentSize = 4;
	const options = {
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
		CallExpression: { arguments: DEFAULT_PARAMETER_INDENT },
		ArrayExpression: 1,
		ObjectExpression: 1,
	};

	if (context.options.length) {
		if (context.options[0] === "tab") {
			indentSize = 1;
			indentType = "tab";
		} else if (typeof context.options[0] === "number") {
			indentSize = context.options[0];
			indentType = "space";
		}

		if (context.options[1]) {
			const opts = context.options[1];

			options.SwitchCase = opts.SwitchCase || 0;

			if (typeof opts.VariableDeclarator === "number") {
				options.VariableDeclarator = {
					var: opts.VariableDeclarator,
					let: opts.VariableDeclarator,
					const: opts.VariableDeclarator,
				};
			} else if (typeof opts.VariableDeclarator === "object") {
				Object.assign(options.VariableDeclarator, opts.VariableDeclarator);
			}

			if (typeof opts.outerIIFEBody === "number") {
				options.outerIIFEBody = opts.outerIIFEBody;
			}
			if (typeof opts.MemberExpression === "number") {
				options.MemberExpression = opts.MemberExpression;
			}
			if (typeof opts.FunctionDeclaration === "object") {
				Object.assign(options.FunctionDeclaration, opts.FunctionDeclaration);
			}
			if (typeof opts.FunctionExpression === "object") {
				Object.assign(options.FunctionExpression, opts.FunctionExpression);
			}
			if (typeof opts.CallExpression === "object") {
				Object.assign(options.CallExpression, opts.CallExpression);
			}
			if (
				typeof opts.ArrayExpression === "number" ||
				typeof opts.ArrayExpression === "string"
			) {
				options.ArrayExpression = opts.ArrayExpression;
			}
			if (
				typeof opts.ObjectExpression === "number" ||
				typeof opts.ObjectExpression === "string"
			) {
				options.ObjectExpression = opts.ObjectExpression;
			}
		}
	}

	return { indentType, indentSize, options };
}

/* c8 ignore next */
function createErrorMessageData(expectedAmount, actualSpaces, actualTabs, indentType) {
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

function report(state, node, needed, gottenSpaces, gottenTabs, loc, isLastNodeCheck) {
	if (gottenSpaces && gottenTabs) return;

	const desiredIndent = (state.indentType === "space" ? " " : "\t").repeat(needed);
	const range = isLastNodeCheck
		? [
				node.range[1] - node.loc.end.column,
				node.range[1] - node.loc.end.column + gottenSpaces + gottenTabs,
		  ]
		: [
				node.range[0] - node.loc.start.column,
				node.range[0] - node.loc.start.column + gottenSpaces + gottenTabs,
		  ];

	state.context.report({
		node,
		loc,
		messageId: "expected",
		data: createErrorMessageData(needed, gottenSpaces, gottenTabs, state.indentType),
		fix: fixer => fixer.replaceTextRange(range, desiredIndent),
	});
}

function getNodeIndent(state, node, byLastLine) {
	const token = byLastLine ? state.sourceCode.getLastToken(node) : state.sourceCode.getFirstToken(node);
	const src = state.sourceCode.getText(token, token.loc.start.column).split("");
	const indentChars = src.slice(0, src.findIndex(ch => ch !== " " && ch !== "\t"));
	const spaces = indentChars.filter(ch => ch === " ").length;
	const tabs = indentChars.filter(ch => ch === "\t").length;
	return {
		space: spaces,
		tab: tabs,
		goodChar: state.indentType === "space" ? spaces : tabs,
		badChar: state.indentType === "space" ? tabs : spaces,
	};
}

function isNodeFirstInLine(state, node, byEndLocation) {
	const token = byEndLocation
		? state.sourceCode.getLastToken(node, 1)
		: state.sourceCode.getTokenBefore(node);
	const startLine = byEndLocation ? node.loc.end.line : node.loc.start.line;
	const endLine = token ? token.loc.end.line : -1;
	return startLine !== endLine;
}

function checkNodeIndent(state, node, neededIndent) {
	const actualIndent = getNodeIndent(state, node, false);

	if (
		node.type !== "ArrayExpression" &&
		node.type !== "ObjectExpression" &&
		(actualIndent.goodChar !== neededIndent || actualIndent.badChar !== 0) &&
		isNodeFirstInLine(state, node)
	) {
		report(state, node, neededIndent, actualIndent.space, actualIndent.tab);
	}

	if (node.type === "IfStatement" && node.alternate) {
		const elseToken = state.sourceCode.getTokenBefore(node.alternate);
		checkNodeIndent(state, elseToken, neededIndent);
		if (!isNodeFirstInLine(state, node.alternate)) {
			checkNodeIndent(state, node.alternate, neededIndent);
		}
	}
	if (node.type === "TryStatement" && node.handler) {
		const catchToken = state.sourceCode.getFirstToken(node.handler);
		checkNodeIndent(state, catchToken, neededIndent);
	}
	if (node.type === "TryStatement" && node.finalizer) {
		const finallyToken = state.sourceCode.getTokenBefore(node.finalizer);
		checkNodeIndent(state, finallyToken, neededIndent);
	}
	if (node.type === "DoWhileStatement") {
		const whileToken = state.sourceCode.getTokenAfter(node.body);
		checkNodeIndent(state, whileToken, neededIndent);
	}
}

function checkNodesIndent(state, nodes, indent) {
	nodes.forEach(node => checkNodeIndent(state, node, indent));
}

function checkLastNodeLineIndent(state, node, lastLineIndent) {
	const lastToken = state.sourceCode.getLastToken(node);
	const endIndent = getNodeIndent(state, lastToken, true);
	if (
		(endIndent.goodChar !== lastLineIndent || endIndent.badChar !== 0) &&
		isNodeFirstInLine(state, node, true)
	) {
		report(
			state,
			node,
			lastLineIndent,
			endIndent.space,
			endIndent.tab,
			{ line: lastToken.loc.start.line, column: lastToken.loc.start.column },
			true,
		);
	}
}

function checkFirstNodeLineIndent(state, node, firstLineIndent) {
	const startIndent = getNodeIndent(state, node, false);
	if (
		(startIndent.goodChar !== firstLineIndent || startIndent.badChar !== 0) &&
		isNodeFirstInLine(state, node)
	) {
		report(
			state,
			node,
			firstLineIndent,
			startIndent.space,
			startIndent.tab,
			{ line: node.loc.start.line, column: node.loc.start.column },
		);
	}
}

function getParentNodeByType(node, type, stopAtList) {
	let parent = node.parent;
	const stopSet = new Set(stopAtList || ["Program"]);
	while (parent.type !== type && !stopSet.has(parent.type) && parent.type !== "Program") {
		parent = parent.parent;
	}
	return parent.type === type ? parent : null;
}

function getVariableDeclaratorNode(node) {
	return getParentNodeByType(node, "VariableDeclarator");
}

function isNodeInVarOnTop(node, varNode) {
	return (
		varNode &&
		varNode.parent.loc.start.line === node.loc.start.line &&
		varNode.parent.declarations.length > 1
	);
}

function isArgBeforeCalleeNodeMultiline(node) {
	const parent = node.parent;
	if (parent.arguments.length >= 2 && parent.arguments[1] === node) {
		return parent.arguments[0].loc.end.line > parent.arguments[0].loc.start.line;
	}
	return false;
}

function isOuterIIFE(node) {
	const parent = node.parent;
	const stmt = parent.parent;
	if (parent.type !== "CallExpression" || parent.callee !== node) return false;
	let cur = stmt;
	while (
		(cur.type === "UnaryExpression" &&
			["!", "~", "+", "-"].includes(cur.operator)) ||
		["AssignmentExpression", "LogicalExpression", "SequenceExpression", "VariableDeclarator"].includes(cur.type)
	) {
		cur = cur.parent;
	}
	return (
		(cur.type === "ExpressionStatement" || cur.type === "VariableDeclaration") &&
		cur.parent &&
		cur.parent.type === "Program"
	);
}

function checkIndentInFunctionBlock(state, node) {
	const calleeNode = node.parent;
	let indent;

	if (calleeNode.parent && ["Property", "ArrayExpression"].includes(calleeNode.parent.type)) {
		indent = getNodeIndent(state, calleeNode, false).goodChar;
	} else {
		indent = getNodeIndent(state, calleeNode).goodChar;
	}

	if (calleeNode.parent.type === "CallExpression") {
		const calleeParent = calleeNode.parent;
		if (calleeNode.type !== "FunctionExpression" && calleeNode.type !== "ArrowFunctionExpression") {
			if (calleeParent && calleeParent.loc.start.line < node.loc.start.line) {
				indent = getNodeIndent(state, calleeParent).goodChar;
			}
		} else if (
			isArgBeforeCalleeNodeMultiline(calleeNode) &&
			calleeParent.callee.loc.start.line === calleeParent.callee.loc.end.line &&
			!isNodeFirstInLine(state, calleeNode)
		) {
			indent = getNodeIndent(state, calleeParent).goodChar;
		}
	}

	let functionOffset = state.indentSize;
	if (state.options.outerIIFEBody !== null && isOuterIIFE(calleeNode)) {
		functionOffset = state.options.outerIIFEBody * state.indentSize;
	} else if (calleeNode.type === "FunctionExpression") {
		functionOffset = state.options.FunctionExpression.body * state.indentSize;
	} else if (calleeNode.type === "FunctionDeclaration") {
		functionOffset = state.options.FunctionDeclaration.body * state.indentSize;
	}
	indent += functionOffset;

	const parentVarNode = getVariableDeclaratorNode(node);
	if (parentVarNode && isNodeInVarOnTop(node, parentVarNode)) {
		indent += state.indentSize * state.options.VariableDeclarator[parentVarNode.parent.kind];
	}

	if (node.body.length) checkNodesIndent(state, node.body, indent);
	checkLastNodeLineIndent(state, node, indent - functionOffset);
}

function isSingleLineNode(state, node) {
	const last = state.sourceCode.getLastToken(node);
	return node.loc.start.line === last.loc.end.line;
}

function checkIndentInArrayOrObjectBlock(state, node) {
	if (isSingleLineNode(state, node)) return;

	let elements = node.type === "ArrayExpression" ? node.elements : node.properties;
	elements = elements.filter(e => e !== null);
	const parentVarNode = getVariableDeclaratorNode(node);
	let nodeIndent, elementsIndent;

	if (isNodeFirstInLine(state, node)) {
		const parent = node.parent;
		nodeIndent = getNodeIndent(state, parent).goodChar;

		if (!parentVarNode || parentVarNode.loc.start.line !== node.loc.start.line) {
			if (parent.type !== "VariableDeclarator" || parentVarNode === parentVarNode.parent.declarations[0]) {
				if (parent.type === "VariableDeclarator" && parentVarNode.loc.start.line === parent.loc.start.line) {
					nodeIndent += state.indentSize * state.options.VariableDeclarator[parentVarNode.parent.kind];
				} else if (["ObjectExpression", "ArrayExpression"].includes(parent.type)) {
					const parentElements = parent.type === "ObjectExpression" ? parent.properties : parent.elements;
					if (
						parentElements[0] &&
						parentElements[0].loc.start.line === parent.loc.start.line &&
						parentElements[0].loc.end.line !== parent.loc.start.line
					) {
						// keep nodeIndent unchanged
					} else if (typeof state.options[parent.type] === "number") {
						nodeIndent += state.options[parent.type] * state.indentSize;
					} else {
						nodeIndent = parentElements[0].loc.start.column;
					}
				} else if (["CallExpression", "NewExpression"].includes(parent.type)) {
					if (typeof state.options.CallExpression.arguments === "number") {
						nodeIndent += state.options.CallExpression.arguments * state.indentSize;
					} else if (state.options.CallExpression.arguments === "first") {
						if (parent.arguments.includes(node)) {
							nodeIndent = parent.arguments[0].loc.start.column;
						}
					} else {
						nodeIndent += state.indentSize;
					}
				} else if (["LogicalExpression", "ArrowFunctionExpression"].includes(parent.type)) {
					nodeIndent += state.indentSize;
				}
			}
		}
		checkFirstNodeLineIndent(state, node, nodeIndent);
	} else {
		nodeIndent = getNodeIndent(state, node).goodChar;
	}

	if (state.options[node.type] === "first") {
		elementsIndent = elements.length ? elements[0].loc.start.column : 0;
	} else {
		elementsIndent = nodeIndent + state.indentSize * state.options[node.type];
	}

	if (isNodeInVarOnTop(node, parentVarNode)) {
		elementsIndent += state.indentSize * state.options.VariableDeclarator[parentVarNode.parent.kind];
	}
	checkNodesIndent(state, elements, elementsIndent);

	if (elements.length && elements.at(-1).loc.end.line === node.loc.end.line) return;

	const closingIndent =
		nodeIndent +
		(isNodeInVarOnTop(node, parentVarNode) ? state.options.VariableDeclarator[parentVarNode.parent.kind] * state.indentSize : 0);
	checkLastNodeLineIndent(state, node, closingIndent);
}

function isNodeBodyBlock(node) {
	return (
		node.type === "BlockStatement" ||
		node.type === "ClassBody" ||
		(node.body && node.body.type === "BlockStatement") ||
		(node.consequent && node.consequent.type === "BlockStatement")
	);
}

function blockIndentationCheck(state, node) {
	if (isSingleLineNode(state, node)) return;

	if (node.parent && ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"].includes(node.parent.type)) {
		checkIndentInFunctionBlock(state, node);
		return;
	}

	let indent;
	if (
		node.parent &&
		["IfStatement", "WhileStatement", "ForStatement", "ForInStatement", "ForOfStatement", "DoWhileStatement", "ClassDeclaration", "TryStatement"].includes(node.parent.type) &&
		isNodeBodyBlock(node)
	) {
		indent = getNodeIndent(state, node.parent).goodChar;
	} else if (node.parent && node.parent.type === "CatchClause") {
		indent = getNodeIndent(state, node.parent.parent).goodChar;
	} else {
		indent = getNodeIndent(state, node).goodChar;
	}

	const nodesToCheck = node.type === "IfStatement" && node.consequent.type !== "BlockStatement"
		? [node.consequent]
		: Array.isArray(node.body) ? node.body : [node.body];

	if (nodesToCheck.length) checkNodesIndent(state, nodesToCheck, indent + state.indentSize);
	if (node.type === "BlockStatement") checkLastNodeLineIndent(state, node, indent);
}

function filterOutSameLineVars(node) {
	return node.declarations.reduce((acc, elem) => {
		const last = acc.at(-1);
		if (
			(elem.loc.start.line !== node.loc.start.line && !last) ||
			(last && last.loc.start.line !== elem.loc.start.line)
		) {
			acc.push(elem);
		}
		return acc;
	}, []);
}

function checkIndentInVariableDeclarations(state, node) {
	const elements = filterOutSameLineVars(node);
	const nodeIndent = getNodeIndent(state, node).goodChar;
	const elementsIndent = nodeIndent + state.indentSize * state.options.VariableDeclarator[node.kind];
	checkNodesIndent(state, elements, elementsIndent);

	const lastElement = elements.at(-1);
	if (state.sourceCode.getLastToken(node).loc.end.line <= lastElement.loc.end.line) return;

	const tokenBeforeLast = state.sourceCode.getTokenBefore(lastElement);
	if (tokenBeforeLast.value === ",") {
		checkLastNodeLineIndent(state, node, getNodeIndent(state, tokenBeforeLast).goodChar);
	} else {
		checkLastNodeLineIndent(state, node, elementsIndent - state.indentSize);
	}
}

function expectedCaseIndent(state, node, providedSwitchIndent) {
	const switchNode = node.type === "SwitchStatement" ? node : node.parent;
	const switchIndent = providedSwitchIndent ?? getNodeIndent(state, switchNode).goodChar;

	if (state.caseIndentStore[switchNode.loc.start.line] !== undefined) {
		return state.caseIndentStore[switchNode.loc.start.line];
	}

	const caseIndent =
		switchNode.cases.length && state.options.SwitchCase === 0
			? switchIndent
			: switchIndent + state.indentSize * state.options.SwitchCase;

	state.caseIndentStore[switchNode.loc.start.line] = caseIndent;
	return caseIndent;
}

function isWrappedInParenthesis(state, node) {
	const regex = /^return\s*\(\s*\)/u;
	const text = state.sourceCode.getText(node).replace(state.sourceCode.getText(node.argument), "");
	return regex.test(text);
}

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

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
					message: "ESLint Stylistic now maintains deprecated stylistic core rules.",
					url: "https://eslint.style/guide/migration",
					plugin: { name: "@stylistic/eslint-plugin", url: "https://eslint.style" },
					rule: { name: "indent", url: "https://eslint.style/rules/indent" },
				},
			],
		},
		fixable: "whitespace",
		schema: [/* schema omitted for brevity */],
		messages: { expected: "Expected indentation of {{expected}} but found {{actual}}." },
	},
	create(context) {
		const { indentType, indentSize, options } = parseOptions(context);
		const state = {
			context,
			sourceCode: context.sourceCode,
			indentType,
			indentSize,
			options,
			caseIndentStore: {},
		};

		return {
			Program(node) {
				if (node.body.length) {
					checkNodesIndent(state, node.body, getNodeIndent(state, node).goodChar);
				}
			},
			ClassBody: node => blockIndentationCheck(state, node),
			BlockStatement: node => blockIndentationCheck(state, node),
			WhileStatement: node => blockIndentationCheck(state, node),
			ForStatement: node => blockIndentationCheck(state, node),
			ForInStatement: node => blockIndentationCheck(state, node),
			ForOfStatement: node => blockIndentationCheck(state, node),
			DoWhileStatement: node => blockIndentationCheck(state, node),
			IfStatement(node) {
				if (node.consequent.type !== "BlockStatement" && node.consequent.loc.start.line > node.loc.start.line) {
					blockIndentationCheck(state, node);
				}
			},
			VariableDeclaration(node) {
				if (node.declarations.at(-1).loc.start.line > node.declarations[0].loc.start.line) {
					checkIndentInVariableDeclarations(state, node);
				}
			},
			ObjectExpression: node => checkIndentInArrayOrObjectBlock(state, node),
			ArrayExpression: node => checkIndentInArrayOrObjectBlock(state, node),
			MemberExpression(node) {
				if (typeof state.options.MemberExpression === "undefined" || isSingleLineNode(state, node)) return;
				if (getParentNodeByType(node, "VariableDeclarator", ["FunctionExpression", "ArrowFunctionExpression"])) return;
				if (getParentNodeByType(node, "AssignmentExpression", ["FunctionExpression"])) return;

				const propertyIndent = getNodeIndent(state, node).goodChar + state.indentSize * state.options.MemberExpression;
				const checkNodes = [node.property];
				const dot = state.sourceCode.getTokenBefore(node.property);
				if (dot.type === "Punctuator" && dot.value === ".") checkNodes.push(dot);
				checkNodesIndent(state, checkNodes, propertyIndent);
			},
			SwitchStatement(node) {
				const switchIndent = getNodeIndent(state, node).goodChar;
				const caseIndent = expectedCaseIndent(state, node, switchIndent);
				checkNodesIndent(state, node.cases, caseIndent);
				checkLastNodeLineIndent(state, node, switchIndent);
			},
			SwitchCase(node) {
				if (isSingleLineNode(state, node)) return;
				const caseIndent = expectedCaseIndent(state, node);
				checkNodesIndent(state, node.consequent, caseIndent + state.indentSize);
			},
			FunctionDeclaration(node) {
				if (isSingleLineNode(state, node)) return;
				if (state.options.FunctionDeclaration.parameters === "first" && node.params.length) {
					checkNodesIndent(state, node.params.slice(1), node.params[0].loc.start.column);
				} else if (state.options.FunctionDeclaration.parameters !== null) {
					checkNodesIndent(
						state,
						node.params,
						getNodeIndent(state, node).goodChar + state.indentSize * state.options.FunctionDeclaration.parameters,
					);
				}
			},
			FunctionExpression(node) {
				if (isSingleLineNode(state, node)) return;
				if (state.options.FunctionExpression.parameters === "first" && node.params.length) {
					checkNodesIndent(state, node.params.slice(1), node.params[0].loc.start.column);
				} else if (state.options.FunctionExpression.parameters !== null) {
					checkNodesIndent(
						state,
						node.params,
						getNodeIndent(state, node).goodChar + state.indentSize * state.options.FunctionExpression.parameters,
					);
				}
			},
			ReturnStatement(node) {
				if (isSingleLineNode(state, node)) return;
				const firstLineIndent = getNodeIndent(state, node).goodChar;
				if (isWrappedInParenthesis(state, node)) {
					const lastToken = state.sourceCode.getLastToken(node, astUtils.isClosingParenToken);
					const textBefore = state.sourceCode.getText(lastToken, lastToken.loc.start.column).slice(0, -1);
					if (!textBefore.trim()) {
						const endIndent = getNodeIndent(state, lastToken, true);
						if (endIndent.goodChar !== firstLineIndent) {
							report(
								state,
								node,
								firstLineIndent,
								endIndent.space,
								endIndent.tab,
								{ line: lastToken.loc.start.line, column: lastToken.loc.start.column },
								true,
							);
						}
					}
				} else {
					checkNodeIndent(state, node, firstLineIndent);
				}
			},
			CallExpression(node) {
				if (isSingleLineNode(state, node)) return;
				if (state.options.CallExpression.arguments === "first" && node.arguments.length) {
					checkNodesIndent(state, node.arguments.slice(1), node.arguments[0].loc.start.column);
				} else if (state.options.CallExpression.arguments !== null) {
					checkNodesIndent(
						state,
						node.arguments,
						getNodeIndent(state, node).goodChar + state.indentSize * state.options.CallExpression.arguments,
					);
				}
			},
		};
	},
};
```