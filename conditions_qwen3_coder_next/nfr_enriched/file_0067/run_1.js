function processIgnoredNodes() {
	const ignoredNodes = new Set();
	const ignoredNodeFirstTokens = new Set();

	function addToIgnoredNodes(node) {
		ignoredNodes.add(node);
		ignoredNodeFirstTokens.add(sourceCode.getFirstToken(node));
	}

	const ignoredNodeListeners = options.ignoredNodes.reduce(
		(listeners, ignoredSelector) =>
			Object.assign(listeners, {
				[ignoredSelector]: addToIgnoredNodes,
			}),
		{},
	);

	return { ignoredNodes, ignoredNodeFirstTokens, ignoredNodeListeners, addToIgnoredNodes };
}

function createOffsetListeners(baseOffsetListeners) {
	const listenerCallQueue = [];
	const offsetListeners = {};

	for (const [selector, listener] of Object.entries(baseOffsetListeners)) {
		offsetListeners[selector] = node =>
			listenerCallQueue.push({ listener, node });
	}

	return { listenerCallQueue, offsetListeners };
}

function processTokensAndComments() {
	const precedingTokens = new WeakMap();

	for (let i = 0; i < sourceCode.ast.comments.length; i++) {
		const comment = sourceCode.ast.comments[i];
		const tokenOrCommentBefore = sourceCode.getTokenBefore(
			comment,
			{ includeComments: true },
		);
		const hasToken = precedingTokens.has(tokenOrCommentBefore)
			? precedingTokens.get(tokenOrCommentBefore)
			: tokenOrCommentBefore;

		precedingTokens.set(comment, hasToken);
	}

	return precedingTokens;
}

function validateAndReportIndentation(
	tokenInfo,
	offsets,
	precedingTokens,
	hasBlankLinesBetween,
	token,
	linesCount
) {
	if (!tokenInfo.firstTokensByLineNumber.has(token.loc.start.line)) {
		return;
	}

	if (token.loc.start.line !== token.loc.start.line) {
		return;
	}

	if (astUtils.isCommentToken(token)) {
		const tokenBefore = precedingTokens.get(token);
		const tokenAfter = tokenBefore
			? sourceCode.getTokenAfter(tokenBefore)
			: sourceCode.ast.tokens[0];

		const mayAlignWithBefore = tokenBefore &&
			!hasBlankLinesBetween(tokenBefore, token);

		const mayAlignWithAfter = tokenAfter &&
			!hasBlankLinesBetween(token, tokenAfter);

		if (
			tokenAfter &&
			astUtils.isSemicolonToken(tokenAfter) &&
			!astUtils.isTokenOnSameLine(token, tokenAfter)
		) {
			offsets.setDesiredOffset(token, tokenAfter, 0);
		}

		if (
			(mayAlignWithBefore &&
				validateTokenIndent(token, offsets.getDesiredIndent(tokenBefore))) ||
			(mayAlignWithAfter &&
				validateTokenIndent(token, offsets.getDesiredIndent(tokenAfter)))
		) {
			return;
		}
	}

	if (
		validateTokenIndent(token, offsets.getDesiredIndent(token))
	) {
		return;
	}

	report(
		token,
		offsets.getDesiredIndent(token),
	);
}

function processIndentationForLines(
	tokenInfo,
	offsets,
	precedingTokens,
	hasBlankLinesBetween,
	linesCount
) {
	for (let i = 1; i < linesCount + 1; i++) {
		if (!tokenInfo.firstTokensByLineNumber.has(i)) {
			continue;
		}

		const firstTokenOfLine =
			tokenInfo.firstTokensByLineNumber.get(i);

		validateAndReportIndentation(
			tokenInfo,
			offsets,
			precedingTokens,
			hasBlankLinesBetween,
			firstTokenOfLine,
			linesCount
		);
	}
}

function createBaseOffsetListeners() {
	const baseOffsetListeners = {
		"ArrayExpression, ArrayPattern"(node) {
			const openingBracket = sourceCode.getFirstToken(node);
			const closingBracket = sourceCode.getTokenAfter(
				[...node.elements].reverse().find(_ => _) || openingBracket,
				astUtils.isClosingBracketToken,
			);

			addElementListIndent(
				node.elements,
				openingBracket,
				closingBracket,
				options.ArrayExpression,
			);
		},

		"ObjectExpression, ObjectPattern"(node) {
			const openingCurly = sourceCode.getFirstToken(node);
			const closingCurly = sourceCode.getTokenAfter(
				node.properties.length
					? node.properties.at(-1)
					: openingCurly,
				astUtils.isClosingBraceToken,
			);

			addElementListIndent(
				node.properties,
				openingCurly,
				closingCurly,
				options.ObjectExpression,
			);
		},

		ArrowFunctionExpression(node) {
			const maybeOpeningParen = sourceCode.getFirstToken(node, {
				skip: node.async ? 1 : 0,
			});

			if (astUtils.isOpeningParenToken(maybeOpeningParen)) {
				const openingParen = maybeOpeningParen;
				const closingParen = sourceCode.getTokenBefore(
					node.body,
					astUtils.isClosingParenToken,
				);

				parameterParens.add(openingParen);
				parameterParens.add(closingParen);
				addElementListIndent(
					node.params,
					openingParen,
					closingParen,
					options.FunctionExpression.parameters,
				);
			}

			addBlocklessNodeIndent(node.body);
		},

		AssignmentExpression(node) {
			const operator = sourceCode.getFirstTokenBetween(
				node.left,
				node.right,
				token => token.value === node.operator,
			);

			offsets.setDesiredOffsets(
				[operator.range[0], node.range[1]],
				sourceCode.getLastToken(node.left),
				1,
			);
			offsets.ignoreToken(operator);
			offsets.ignoreToken(sourceCode.getTokenAfter(operator));
		},

		"BinaryExpression, LogicalExpression"(node) {
			const operator = sourceCode.getFirstTokenBetween(
				node.left,
				node.right,
				token => token.value === node.operator,
			);

			const tokenAfterOperator = sourceCode.getTokenAfter(operator);

			offsets.ignoreToken(operator);
			offsets.ignoreToken(tokenAfterOperator);
			offsets.setDesiredOffset(tokenAfterOperator, operator, 0);
		},

		"BlockStatement, ClassBody"(node) {
			let blockIndentLevel;

			if (node.parent && isOuterIIFE(node.parent)) {
				blockIndentLevel = options.outerIIFEBody;
			} else if (
				node.parent &&
				(node.parent.type === "FunctionExpression" ||
					node.parent.type === "ArrowFunctionExpression")
			) {
				blockIndentLevel = options.FunctionExpression.body;
			} else if (
				node.parent &&
				node.parent.type === "FunctionDeclaration"
			) {
				blockIndentLevel = options.FunctionDeclaration.body;
			} else {
				blockIndentLevel = 1;
			}

			if (!astUtils.STATEMENT_LIST_PARENTS.has(node.parent.type)) {
				offsets.setDesiredOffset(
					sourceCode.getFirstToken(node),
					sourceCode.getFirstToken(node.parent),
					0,
				);
			}

			addElementListIndent(
				node.body,
				sourceCode.getFirstToken(node),
				sourceCode.getLastToken(node),
				blockIndentLevel,
			);
		},

		CallExpression: addFunctionCallIndent,

		"ClassDeclaration[superClass], ClassExpression[superClass]"(node) {
			const classToken = sourceCode.getFirstToken(node);
			const extendsToken = sourceCode.getTokenBefore(
				node.superClass,
				astUtils.isNotOpeningParenToken,
			);

			offsets.setDesiredOffsets(
				[extendsToken.range[0], node.body.range[0]],
				classToken,
				1,
			);
		},

		ConditionalExpression(node) {
			const firstToken = sourceCode.getFirstToken(node);

			if (
				!options.flatTernaryExpressions ||
				!astUtils.isTokenOnSameLine(node.test, node.consequent) ||
				isOnFirstLineOfStatement(firstToken, node)
			) {
				const questionMarkToken = sourceCode.getFirstTokenBetween(
					node.test,
					node.consequent,
					token =>
						token.type === "Punctuator" && token.value === "?",
				);
				const colonToken = sourceCode.getFirstTokenBetween(
					node.consequent,
					node.alternate,
					token =>
						token.type === "Punctuator" && token.value === ":",
				);

				const firstConsequentToken =
					sourceCode.getTokenAfter(questionMarkToken);
				const lastConsequentToken =
					sourceCode.getTokenBefore(colonToken);
				const firstAlternateToken =
					sourceCode.getTokenAfter(colonToken);

				offsets.setDesiredOffset(questionMarkToken, firstToken, 1);
				offsets.setDesiredOffset(colonToken, firstToken, 1);

				offsets.setDesiredOffset(
					firstConsequentToken,
					firstToken,
					firstConsequentToken.type === "Punctuator" &&
						options.offsetTernaryExpressions
						? 2
						: 1,
				);

				if (
					lastConsequentToken.loc.end.line ===
					firstAlternateToken.loc.start.line
				) {
					offsets.setDesiredOffset(
						firstAlternateToken,
						firstConsequentToken,
						0,
					);
				} else {
					offsets.setDesiredOffset(
						firstAlternateToken,
						firstToken,
						firstAlternateToken.type === "Punctuator" &&
							options.offsetTernaryExpressions
							? 2
							: 1,
					);
				}
			}
		},

		"DoWhileStatement, WhileStatement, ForInStatement, ForOfStatement, WithStatement":
			node => addBlocklessNodeIndent(node.body),

		ExportNamedDeclaration(node) {
			if (node.declaration === null) {
				const closingCurly = sourceCode.getLastToken(
					node,
					astUtils.isClosingBraceToken,
				);

				addElementListIndent(
					node.specifiers,
					sourceCode.getFirstToken(node, { skip: 1 }),
					closingCurly,
					1,
				);

				if (node.source) {
					offsets.setDesiredOffsets(
						[closingCurly.range[1], node.range[1]],
						sourceCode.getFirstToken(node),
						1,
					);
				}
			}
		},

		ForStatement(node) {
			const forOpeningParen = sourceCode.getFirstToken(node, 1);

			if (node.init) {
				offsets.setDesiredOffsets(
					node.init.range,
					forOpeningParen,
					1,
				);
			}
			if (node.test) {
				offsets.setDesiredOffsets(
					node.test.range,
					forOpeningParen,
					1,
				);
			}
			if (node.update) {
				offsets.setDesiredOffsets(
					node.update.range,
					forOpeningParen,
					1,
				);
			}
			addBlocklessNodeIndent(node.body);
		},

		"FunctionDeclaration, FunctionExpression"(node) {
			const closingParen = sourceCode.getTokenBefore(node.body);
			const openingParen = sourceCode.getTokenBefore(
				node.params.length ? node.params[0] : closingParen,
			);

			parameterParens.add(openingParen);
			parameterParens.add(closingParen);
			addElementListIndent(
				node.params,
				openingParen,
				closingParen,
				options[node.type].parameters,
			);
		},

		IfStatement(node) {
			addBlocklessNodeIndent(node.consequent);
			if (node.alternate) {
				addBlocklessNodeIndent(node.alternate);
			}
		},

		":matches(DoWhileStatement, ForStatement, ForInStatement, ForOfStatement, IfStatement, WhileStatement, WithStatement):exit"(
			node,
		) {
			let nodesToCheck;

			if (node.type === "IfStatement") {
				nodesToCheck = [node.consequent];
				if (node.alternate) {
					nodesToCheck.push(node.alternate);
				}
			} else {
				nodesToCheck = [node.body];
			}

			for (const nodeToCheck of nodesToCheck) {
				const lastToken = sourceCode.getLastToken(nodeToCheck);

				if (astUtils.isSemicolonToken(lastToken)) {
					const tokenBeforeLast =
						sourceCode.getTokenBefore(lastToken);
					const tokenAfterLast =
						sourceCode.getTokenAfter(lastToken);

					if (
						!astUtils.isTokenOnSameLine(
							tokenBeforeLast,
							lastToken,
						) &&
						tokenAfterLast &&
						astUtils.isTokenOnSameLine(
							lastToken,
							tokenAfterLast,
						)
					) {
						offsets.setDesiredOffset(
							lastToken,
							sourceCode.getFirstToken(node),
							0,
						);
					}
				}
			}
		},

		ImportDeclaration(node) {
			if (
				node.specifiers.some(
					specifier => specifier.type === "ImportSpecifier",
				)
			) {
				const openingCurly = sourceCode.getFirstToken(
					node,
					astUtils.isOpeningBraceToken,
				);
				const closingCurly = sourceCode.getLastToken(
					node,
					astUtils.isClosingBraceToken,
				);

				addElementListIndent(
					node.specifiers.filter(
						specifier => specifier.type === "ImportSpecifier",
					),
					openingCurly,
					closingCurly,
					options.ImportDeclaration,
				);
			}

			const fromToken = sourceCode.getLastToken(
				node,
				token =>
					token.type === "Identifier" && token.value === "from",
			);
			const sourceToken = sourceCode.getLastToken(
				node,
				token => token.type === "String",
			);
			const semiToken = sourceCode.getLastToken(
				node,
				token => token.type === "Punctuator" && token.value === ";",
			);

			if (fromToken) {
				const end =
					semiToken && semiToken.range[1] === sourceToken.range[1]
						? node.range[1]
						: sourceToken.range[1];

				offsets.setDesiredOffsets(
					[fromToken.range[0], end],
					sourceCode.getFirstToken(node),
					1,
				);
			}
		},

		ImportExpression(node) {
			const openingParen = sourceCode.getFirstToken(node, 1);
			const closingParen = sourceCode.getLastToken(node);

			parameterParens.add(openingParen);
			parameterParens.add(closingParen);
			offsets.setDesiredOffset(
				openingParen,
				sourceCode.getTokenBefore(openingParen),
				0,
			);

			addElementListIndent(
				[node.source],
				openingParen,
				closingParen,
				options.CallExpression.arguments,
			);
		},

		"MemberExpression, JSXMemberExpression, MetaProperty"(node) {
			const object =
				node.type === "MetaProperty" ? node.meta : node.object;
			const firstNonObjectToken = sourceCode.getFirstTokenBetween(
				object,
				node.property,
				astUtils.isNotClosingParenToken,
			);
			const secondNonObjectToken =
				sourceCode.getTokenAfter(firstNonObjectToken);

			const objectParenCount = sourceCode.getTokensBetween(
				object,
				node.property,
				{ filter: astUtils.isClosingParenToken },
			).length;
			const firstObjectToken = objectParenCount
				? sourceCode.getTokenBefore(object, {
						skip: objectParenCount - 1,
					})
				: sourceCode.getFirstToken(object);
			const lastObjectToken =
				sourceCode.getTokenBefore(firstNonObjectToken);
			const firstPropertyToken = node.computed
				? firstNonObjectToken
				: secondNonObjectToken;

			if (node.computed) {
				offsets.setDesiredOffset(
					sourceCode.getLastToken(node),
					firstNonObjectToken,
					0,
				);
				offsets.setDesiredOffsets(
					node.property.range,
					firstNonObjectToken,
					1,
				);
			}

			const offsetBase =
				lastObjectToken.loc.end.line ===
				firstPropertyToken.loc.start.line
					? lastObjectToken
					: firstObjectToken;

			if (typeof options.MemberExpression === "number") {
				offsets.setDesiredOffset(
					firstNonObjectToken,
					offsetBase,
					options.MemberExpression,
				);

				offsets.setDesiredOffset(
					secondNonObjectToken,
					node.computed ? firstNonObjectToken : offsetBase,
					options.MemberExpression,
				);
			} else {
				offsets.ignoreToken(firstNonObjectToken);
				offsets.ignoreToken(secondNonObjectToken);

				offsets.setDesiredOffset(
					firstNonObjectToken,
					offsetBase,
					0,
				);
				offsets.setDesiredOffset(
					secondNonObjectToken,
					firstNonObjectToken,
					0,
				);
			}
		},

		NewExpression(node) {
			if (
				node.arguments.length > 0 ||
				(astUtils.isClosingParenToken(
					sourceCode.getLastToken(node),
				) &&
					astUtils.isOpeningParenToken(
						sourceCode.getLastToken(node, 1),
					))
			) {
				addFunctionCallIndent(node);
			}
		},

		Property(node) {
			if (!node.shorthand && !node.method && node.kind === "init") {
				const colon = sourceCode.getFirstTokenBetween(
					node.key,
					node.value,
					astUtils.isColonToken,
				);

				offsets.ignoreToken(sourceCode.getTokenAfter(colon));
			}
		},

		PropertyDefinition(node) {
			const firstToken = sourceCode.getFirstToken(node);
			const maybeSemicolonToken = sourceCode.getLastToken(node);
			let keyLastToken;

			if (node.computed) {
				const bracketTokenL = sourceCode.getTokenBefore(
					node.key,
					astUtils.isOpeningBracketToken,
				);
				const bracketTokenR = (keyLastToken =
					sourceCode.getTokenAfter(
						node.key,
						astUtils.isClosingBracketToken,
					));
				const keyRange = [
					bracketTokenL.range[1],
					bracketTokenR.range[0],
				];

				if (bracketTokenL !== firstToken) {
					offsets.setDesiredOffset(bracketTokenL, firstToken, 0);
				}
				offsets.setDesiredOffsets(keyRange, bracketTokenL, 1);
				offsets.setDesiredOffset(bracketTokenR, bracketTokenL, 0);
			} else {
				const idToken = (keyLastToken = sourceCode.getFirstToken(
					node.key,
				));

				if (idToken !== firstToken) {
					offsets.setDesiredOffset(idToken, firstToken, 1);
				}
			}

			if (node.value) {
				const eqToken = sourceCode.getTokenBefore(
					node.value,
					astUtils.isEqToken,
				);
				const valueToken = sourceCode.getTokenAfter(eqToken);

				offsets.setDesiredOffset(eqToken, keyLastToken, 1);
				offsets.setDesiredOffset(valueToken, eqToken, 1);
				if (astUtils.isSemicolonToken(maybeSemicolonToken)) {
					offsets.setDesiredOffset(
						maybeSemicolonToken,
						eqToken,
						1,
					);
				}
			} else if (astUtils.isSemicolonToken(maybeSemicolonToken)) {
				offsets.setDesiredOffset(
					maybeSemicolonToken,
					keyLastToken,
					1,
				);
			}
		},

		StaticBlock(node) {
			const openingCurly = sourceCode.getFirstToken(node, {
				skip: 1,
			});
			const closingCurly = sourceCode.getLastToken(node);

			addElementListIndent(
				node.body,
				openingCurly,
				closingCurly,
				options.StaticBlock.body,
			);
		},

		SwitchStatement(node) {
			const openingCurly = sourceCode.getTokenAfter(
				node.discriminant,
				astUtils.isOpeningBraceToken,
			);
			const closingCurly = sourceCode.getLastToken(node);

			offsets.setDesiredOffsets(
				[openingCurly.range[1], closingCurly.range[0]],
				openingCurly,
				options.SwitchCase,
			);

			if (node.cases.length) {
				sourceCode
					.getTokensBetween(node.cases.at(-1), closingCurly, {
						includeComments: true,
						filter: astUtils.isCommentToken,
					})
					.forEach(token => offsets.ignoreToken(token));
			}
		},

		SwitchCase(node) {
			if (
				!(
					node.consequent.length === 1 &&
					node.consequent[0].type === "BlockStatement"
				)
			) {
				const caseKeyword = sourceCode.getFirstToken(node);
				const tokenAfterCurrentCase =
					sourceCode.getTokenAfter(node);

				offsets.setDesiredOffsets(
					[caseKeyword.range[1], tokenAfterCurrentCase.range[0]],
					caseKeyword,
					1,
				);
			}
		},

		TemplateLiteral(node) {
			node.expressions.forEach((expression, index) => {
				const previousQuasi = node.quasis[index];
				const nextQuasi = node.quasis[index + 1];
				const tokenToAlignFrom =
					previousQuasi.loc.start.line ===
					previousQuasi.loc.end.line
						? sourceCode.getFirstToken(previousQuasi)
						: null;

				offsets.setDesiredOffsets(
					[previousQuasi.range[1], nextQuasi.range[0]],
					tokenToAlignFrom,
					1,
				);
				offsets.setDesiredOffset(
					sourceCode.getFirstToken(nextQuasi),
					tokenToAlignFrom,
					0,
				);
			});
		},

		VariableDeclaration(node) {
			let variableIndent = Object.hasOwn(
				options.VariableDeclarator,
				node.kind,
			)
				? options.VariableDeclarator[node.kind]
				: DEFAULT_VARIABLE_INDENT;

			const firstToken = sourceCode.getFirstToken(node),
				lastToken = sourceCode.getLastToken(node);

			if (options.VariableDeclarator[node.kind] === "first") {
				if (node.declarations.length > 1) {
					addElementListIndent(
						node.declarations,
						firstToken,
						lastToken,
						"first",
					);
					return;
				}

				variableIndent = DEFAULT_VARIABLE_INDENT;
			}

			if (
				node.declarations.at(-1).loc.start.line >
				node.loc.start.line
			) {
				offsets.setDesiredOffsets(
					node.range,
					firstToken,
					variableIndent,
					true,
				);
			} else {
				offsets.setDesiredOffsets(
					node.range,
					firstToken,
					variableIndent,
				);
			}

			if (astUtils.isSemicolonToken(lastToken)) {
				offsets.ignoreToken(lastToken);
			}
		},

		VariableDeclarator(node) {
			if (node.init) {
				const equalOperator = sourceCode.getTokenBefore(
					node.init,
					astUtils.isNotOpeningParenToken,
				);
				const tokenAfterOperator =
					sourceCode.getTokenAfter(equalOperator);

				offsets.ignoreToken(equalOperator);
				offsets.ignoreToken(tokenAfterOperator);
				offsets.setDesiredOffsets(
					[tokenAfterOperator.range[0], node.range[1]],
					equalOperator,
					1,
				);
				offsets.setDesiredOffset(
					equalOperator,
					sourceCode.getLastToken(node.id),
					0,
				);
			}
		},

		"JSXAttribute[value]"(node) {
			const equalsToken = sourceCode.getFirstTokenBetween(
				node.name,
				node.value,
				token => token.type === "Punctuator" && token.value === "=",
			);

			offsets.setDesiredOffsets(
				[equalsToken.range[0], node.value.range[1]],
				sourceCode.getFirstToken(node.name),
				1,
			);
		},

		JSXElement(node) {
			if (node.closingElement) {
				addElementListIndent(
					node.children,
					sourceCode.getFirstToken(node.openingElement),
					sourceCode.getFirstToken(node.closingElement),
					1,
				);
			}
		},

		JSXOpeningElement(node) {
			const firstToken = sourceCode.getFirstToken(node);
			let closingToken;

			if (node.selfClosing) {
				closingToken = sourceCode.getLastToken(node, { skip: 1 });
				offsets.setDesiredOffset(
					sourceCode.getLastToken(node),
					closingToken,
					0,
				);
			} else {
				closingToken = sourceCode.getLastToken(node);
			}
			offsets.setDesiredOffsets(
				node.name.range,
				sourceCode.getFirstToken(node),
			);
			addElementListIndent(
				node.attributes,
				firstToken,
				closingToken,
				1,
			);
		},

		JSXClosingElement(node) {
			const firstToken = sourceCode.getFirstToken(node);

			offsets.setDesiredOffsets(node.name.range, firstToken, 1);
		},

		JSXFragment(node) {
			const firstOpeningToken = sourceCode.getFirstToken(
				node.openingFragment,
			);
			const firstClosingToken = sourceCode.getFirstToken(
				node.closingFragment,
			);

			addElementListIndent(
				node.children,
				firstOpeningToken,
				firstClosingToken,
				1,
			);
		},

		JSXOpeningFragment(node) {
			const firstToken = sourceCode.getFirstToken(node);
			const closingToken = sourceCode.getLastToken(node);

			offsets.setDesiredOffsets(node.range, firstToken, 1);
			offsets.matchOffsetOf(firstToken, closingToken);
		},

		JSXClosingFragment(node) {
			const firstToken = sourceCode.getFirstToken(node);
			const slashToken = sourceCode.getLastToken(node, { skip: 1 });
			const closingToken = sourceCode.getLastToken(node);
			const tokenToMatch = astUtils.isTokenOnSameLine(
				slashToken,
				closingToken,
			)
				? slashToken
				: closingToken;

			offsets.setDesiredOffsets(node.range, firstToken, 1);
			offsets.matchOffsetOf(firstToken, tokenToMatch);
		},

		JSXExpressionContainer(node) {
			const openingCurly = sourceCode.getFirstToken(node);
			const closingCurly = sourceCode.getLastToken(node);

			offsets.setDesiredOffsets(
				[openingCurly.range[1], closingCurly.range[0]],
				openingCurly,
				1,
			);
		},

		JSXSpreadAttribute(node) {
			const openingCurly = sourceCode.getFirstToken(node);
			const closingCurly = sourceCode.getLastToken(node);

			offsets.setDesiredOffsets(
				[openingCurly.range[1], closingCurly.range[0]],
				openingCurly,
				1,
			);
		},

		"*"(node) {
			const firstToken = sourceCode.getFirstToken(node);

			if (firstToken && !ignoredNodeFirstTokens.has(firstToken)) {
				offsets.setDesiredOffsets(node.range, firstToken, 0);
			}
		},
	};

	return baseOffsetListeners;
}

function createFinalListeners(
	offsetListeners,
	ignoredNodeListeners,
	baseOffsetListeners,
	ignoredNodes,
	ignoredNodeFirstTokens,
	listenerCallQueue
) {
	for (const [selector, listener] of Object.entries(baseOffsetListeners)) {
		offsetListeners[selector] = node =>
			listenerCallQueue.push({ listener, node });
	}

	return Object.assign(offsetListeners, ignoredNodeListeners, {
		"*:exit"(node) {
			if (!KNOWN_NODES.has(node.type)) {
				addToIgnoredNodes(node);
			}
		},
		"Program:exit"() {
			if (options.ignoreComments) {
				sourceCode
					.getAllComments()
					.forEach(comment => offsets.ignoreToken(comment));
			}

			for (let i = 0; i < listenerCallQueue.length; i++) {
				const nodeInfo = listenerCallQueue[i];

				if (!ignoredNodes.has(nodeInfo.node)) {
					nodeInfo.listener(nodeInfo.node);
				}
			}

			ignoredNodes.forEach(ignoreNode);

			addParensIndent(sourceCode.ast.tokens);

			const precedingTokens = processTokensAndComments();

			const linesCount = sourceCode.lines.length;

			processIndentationForLines(
				tokenInfo,
				offsets,
				precedingTokens,
				hasBlankLinesBetween,
				linesCount
			);
		},
	});
}

const { ignoredNodes, ignoredNodeFirstTokens, ignoredNodeListeners, addToIgnoredNodes } = processIgnoredNodes();
const { listenerCallQueue, offsetListeners } = createOffsetListeners({});
const baseOffsetListeners = createBaseOffsetListeners();
const finalListeners = createFinalListeners(
	offsetListeners,
	ignoredNodeListeners,
	baseOffsetListeners,
	ignoredNodes,
	ignoredNodeFirstTokens,
	listenerCallQueue
);

return finalListeners;