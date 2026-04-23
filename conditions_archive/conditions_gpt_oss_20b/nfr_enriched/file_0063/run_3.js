/**
 * @fileoverview A class to manage state of generating a code path.
 * @author Toru Nagashima
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const CodePathSegment = require("./code-path-segment"),
	ForkContext = require("./fork-context");

//-----------------------------------------------------------------------------
// Contexts
//-----------------------------------------------------------------------------

/**
 * Represents the context in which a `break` statement can be used.
 *
 * A `break` statement without a label is only valid in a few places in
 * JavaScript: any type of loop or a `switch` statement. Otherwise, `break`
 * without a label causes a syntax error. For these contexts, `breakable` is
 * set to `true` to indicate that a `break` without a label is valid.
 *
 * However, a `break` statement with a label is also valid inside of a labeled
 * statement. For example, this is valid:
 *
 *     a : {
 *         break a;
 *     }
 *
 * The `breakable` property is set false for labeled statements to indicate
 * that `break` without a label is invalid.
 */
class BreakContext {
	/**
	 * Creates a new instance.
	 * @param {BreakContext} upperContext The previous `BreakContext`.
	 * @param {boolean} breakable Indicates if we are inside a statement where
	 *      `break` without a label will exit the statement.
	 * @param {string|null} label The label for the statement.
	 * @param {ForkContext} forkContext The current fork context.
	 */
	constructor(upperContext, breakable, label, forkContext) {
		/** @type {BreakContext} */
		this.upper = upperContext;
		/** @type {boolean} */
		this.breakable = breakable;
		/** @type {string|null} */
		this.label = label;
		/** @type {ForkContext} */
		this.brokenForkContext = ForkContext.newEmpty(forkContext);
	}
}

/**
 * Represents the context for `ChainExpression` nodes.
 */
class ChainContext {
	/**
	 * Creates a new instance.
	 * @param {ChainContext} upperContext The previous `ChainContext`.
	 */
	constructor(upperContext) {
		/** @type {ChainContext} */
		this.upper = upperContext;
		/** @type {number} */
		this.choiceContextCount = 0;
	}
}

/**
 * Represents a choice in the code path.
 *
 * Choices are created by logical operators such as `&&`, loops, conditionals,
 * and `if` statements. This is the point at which the code path has a choice of
 * which direction to go.
 *
 * The result of a choice might be in the left (test) expression of another choice,
 * and in that case, may create a new fork. For example, `a || b` is a choice
 * but does not create a new fork because the result of the expression is not
 * used as the test expression in another expression. In this case,
 * `isForkingAsResult` is false. In the expression `a || b || c`, the
 * `a || b` expression appears as the test expression for `|| c`,
 * so the result of `a || b` creates a fork because execution may or may not
 * continue to `|| c`. `isForkingAsResult` for `a || b` in this case is true
 * while `isForkingAsResult` for `|| c` is false. (`isForkingAsResult` is always
 * false for `if` statements, conditional expressions, and loops.)
 *
 * All of the choices except one (`??`) operate on a true/false fork, meaning if
 * true go one way and if false go the other (tracked by `trueForkContext` and
 * `falseForkContext`). The `??` operator doesn't operate on true/false because
 * the left expression is evaluated to be nullish or not, so only if nullish do
 * we fork to the right expression (tracked by `nullishForkContext`).
 */
class ChoiceContext {
	/**
	 * Creates a new instance.
	 * @param {ChoiceContext} upperContext The previous `ChoiceContext`.
	 * @param {string} kind The kind of choice. If it's a logical or assignment expression, this
	 *      is `"&&"` or `"||"` or `"??"`; if it's an `if` statement or
	 *      conditional expression, this is `"test"`; otherwise, this is `"loop"`.
	 * @param {boolean} isForkingAsResult Indicates if the result of the choice
	 *      creates a fork.
	 * @param {ForkContext} forkContext The containing `ForkContext`.
	 */
	constructor(upperContext, kind, isForkingAsResult, forkContext) {
		/** @type {ChoiceContext} */
		this.upper = upperContext;
		/** @type {string} */
		this.kind = kind;
		/** @type {boolean} */
		this.isForkingAsResult = isForkingAsResult;
		/** @type {ForkContext} */
		this.trueForkContext = ForkContext.newEmpty(forkContext);
		/** @type {ForkContext} */
		this.falseForkContext = ForkContext.newEmpty(forkContext);
		/** @type {ForkContext} */
		this.nullishForkContext = ForkContext.newEmpty(forkContext);
		/** @type {boolean} */
		this.processed = false;
	}
}

/**
 * Base class for all loop contexts.
 */
class LoopContextBase {
	/**
	 * Creates a new instance.
	 * @param {LoopContext|null} upperContext The previous `LoopContext`.
	 * @param {string} type The AST node's `type` for the loop.
	 * @param {string|null} label The label for the loop from an enclosing `LabeledStatement`.
	 * @param {BreakContext} breakContext The context for breaking the loop.
	 */
	constructor(upperContext, type, label, breakContext) {
		/** @type {LoopContext} */
		this.upper = upperContext;
		/** @type {string} */
		this.type = type;
		/** @type {string|null} */
		this.label = label;
		/** @type {ForkContext} */
		this.brokenForkContext = breakContext.brokenForkContext;
	}
}

/**
 * Represents the context for a `while` loop.
 */
class WhileLoopContext extends LoopContextBase {
	/**
	 * Creates a new instance.
	 * @param {LoopContext|null} upperContext The previous `LoopContext`.
	 * @param {string|null} label The label for the loop from an enclosing `LabeledStatement`.
	 * @param {BreakContext} breakContext The context for breaking the loop.
	 */
	constructor(upperContext, label, breakContext) {
		super(upperContext, "WhileStatement", label, breakContext);
		/** @type {boolean|undefined} */
		this.test = void 0;
		/** @type {Array<CodePathSegment>|null} */
		this.continueDestSegments = null;
	}
}

/**
 * Represents the context for a `do-while` loop.
 */
class DoWhileLoopContext extends LoopContextBase {
	/**
	 * Creates a new instance.
	 * @param {LoopContext|null} upperContext The previous `LoopContext`.
	 * @param {string|null} label The label for the loop from an enclosing `LabeledStatement`.
	 * @param {BreakContext} breakContext The context for breaking the loop.
	 * @param {ForkContext} forkContext The enclosing fork context.
	 */
	constructor(upperContext, label, breakContext, forkContext) {
		super(upperContext, "DoWhileStatement", label, breakContext);
		/** @type {boolean|undefined} */
		this.test = void 0;
		/** @type {Array<CodePathSegment>|null} */
		this.entrySegments = null;
		/** @type {ForkContext} */
		this.continueForkContext = ForkContext.newEmpty(forkContext);
	}
}

/**
 * Represents the context for a `for` loop.
 */
class ForLoopContext extends LoopContextBase {
	/**
	 * Creates a new instance.
	 * @param {LoopContext|null} upperContext The previous `LoopContext`.
	 * @param {string|null} label The label for the loop from an enclosing `LabeledStatement`.
	 * @param {BreakContext} breakContext The context for breaking the loop.
	 */
	constructor(upperContext, label, breakContext) {
		super(upperContext, "ForStatement", label, breakContext);
		/** @type {boolean|undefined} */
		this.test = void 0;
		/** @type {Array<CodePathSegment>|null} */
		this.endOfInitSegments = null;
		/** @type {Array<CodePathSegment>|null} */
		this.testSegments = null;
		/** @type {Array<CodePathSegment>|null} */
		this.endOfTestSegments = null;
		/** @type {Array<CodePathSegment>|null} */
		this.updateSegments = null;
		/** @type {Array<CodePathSegment>|null} */
		this.endOfUpdateSegments = null;
		/** @type {Array<CodePathSegment>|null} */
		this.continueDestSegments = null;
	}
}

/**
 * Represents the context for a `for-in` loop.
 *
 * Terminology:
 * - "left" means the part of the loop to the left of the `in` keyword. For
 *   example, in `for (var x in y)`, the left is `var x`.
 * - "right" means the part of the loop to the right of the `in` keyword. For
 *   example, in `for (var x in y)`, the right is `y`.
 */
class ForInLoopContext extends LoopContextBase {
	/**
	 * Creates a new instance.
	 * @param {LoopContext|null} upperContext The previous `LoopContext`.
	 * @param {string|null} label The label for the loop from an enclosing `LabeledStatement`.
	 * @param {BreakContext} breakContext The context for breaking the loop.
	 */
	constructor(upperContext, label, breakContext) {
		super(upperContext, "ForInStatement", label, breakContext);
		/** @type {Array<CodePathSegment>|null} */
		this.prevSegments = null;
		/** @type {Array<CodePathSegment>|null} */
		this.leftSegments = null;
		/** @type {Array<CodePathSegment>|null} */
		this.endOfLeftSegments = null;
		/** @type {Array<CodePathSegment>|null} */
		this.continueDestSegments = null;
	}
}

/**
 * Represents the context for a `for-of` loop.
 */
class ForOfLoopContext extends LoopContextBase {
	/**
	 * Creates a new instance.
	 * @param {LoopContext|null} upperContext The previous `LoopContext`.
	 * @param {string|null} label The label for the loop from an enclosing `LabeledStatement`.
	 * @param {BreakContext} breakContext The context for breaking the loop.
	 */
	constructor(upperContext, label, breakContext) {
		super(upperContext, "ForOfStatement", label, breakContext);
		/** @type {Array<CodePathSegment>|null} */
		this.prevSegments = null;
		/** @type {Array<CodePathSegment>|null} */
		this.leftSegments = null;
		/** @type {Array<CodePathSegment>|null} */
		this.endOfLeftSegments = null;
		/** @type {Array<CodePathSegment>|null} */
		this.continueDestSegments = null;
	}
}

/**
 * Represents the context for any loop.
 * @typedef {WhileLoopContext|DoWhileLoopContext|ForLoopContext|ForInLoopContext|ForOfLoopContext} LoopContext
 */

/**
 * Represents the context for a `switch` statement.
 */
class SwitchContext {
	/**
	 * Creates a new instance.
	 * @param {SwitchContext} upperContext The previous context.
	 * @param {boolean} hasCase Indicates if there is at least one `case` statement.
	 *      `default` doesn't count.
	 */
	constructor(upperContext, hasCase) {
		/** @type {SwitchContext} */
		this.upper = upperContext;
		/** @type {boolean} */
		this.hasCase = hasCase;
		/** @type {Array<CodePathSegment>|null} */
		this.defaultSegments = null;
		/** @type {Array<CodePathSegment>|null} */
		this.defaultBodySegments = null;
		/** @type {boolean} */
		this.foundEmptyDefault = false;
		/** @type {boolean} */
		this.lastIsDefault = false;
		/** @type {number} */
		this.forkCount = 0;
	}
}

/**
 * Represents the context for a `try` statement.
 */
class TryContext {
	/**
	 * Creates a new instance.
	 * @param {TryContext} upperContext The previous context.
	 * @param {boolean} hasFinalizer Indicates if the `try` statement has a
	 *      `finally` block.
	 * @param {ForkContext} forkContext The enclosing fork context.
	 */
	constructor(upperContext, hasFinalizer, forkContext) {
		/** @type {TryContext} */
		this.upper = upperContext;
		/** @type {boolean} */
		this.hasFinalizer = hasFinalizer;
		/** @type {"try"|"catch"|"finally"} */
		this.position = "try";
		/** @type {ForkContext|null} */
		this.returnedForkContext = hasFinalizer
			? ForkContext.newEmpty(forkContext)
			: null;
		/** @type {ForkContext} */
		this.thrownForkContext = ForkContext.newEmpty(forkContext);
		/** @type {boolean} */
		this.lastOfTryIsReachable = false;
		/** @type {boolean} */
		this.lastOfCatchIsReachable = false;
	}
}

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Adds given segments into the `dest` array.
 * If the `others` array does not include the given segments, adds to the `all`
 * array as well.
 *
 * This adds only reachable and used segments.
 * @param {CodePathSegment[]} dest A destination array (`returnedSegments` or `thrownSegments`).
 * @param {CodePathSegment[]} others Another destination array (`returnedSegments` or `thrownSegments`).
 * @param {CodePathSegment[]} all The unified destination array (`finalSegments`).
 * @param {CodePathSegment[]} segments Segments to add.
 * @returns {void}
 */
function addToReturnedOrThrown(dest, others, all, segments) {
	for (let i = 0; i < segments.length; ++i) {
		const segment = segments[i];
		dest.push(segment);
		if (!others.includes(segment)) {
			all.push(segment);
		}
	}
}

/**
 * Gets a loop context for a `continue` statement based on a given label.
 * @param {CodePathState} state The state to search within.
 * @param {string|null} label The label of a `continue` statement.
 * @returns {LoopContext} A loop-context for a `continue` statement.
 */
function getContinueContext(state, label) {
	if (!label) {
		return state.loopContext;
	}
	let context = state.loopContext;
	while (context) {
		if (context.label === label) {
			return context;
		}
		context = context.upper;
	}
	/* c8 ignore next */
	return null;
}

/**
 * Gets a context for a `break` statement.
 * @param {CodePathState} state The state to search within.
 * @param {string|null} label The label of a `break` statement.
 * @returns {BreakContext} A context for a `break` statement.
 */
function getBreakContext(state, label) {
	let context = state.breakContext;
	while (context) {
		if (label ? context.label === label : context.breakable) {
			return context;
		}
		context = context.upper;
	}
	/* c8 ignore next */
	return null;
}

/**
 * Gets a context for a `return` statement. There is just one special case:
 * if there is a `try` statement with a `finally` block, because that alters
 * how `return` behaves; otherwise, this just passes through the given state.
 * @param {CodePathState} state The state to search within
 * @returns {TryContext|CodePathState} A context for a `return` statement.
 */
function getReturnContext(state) {
	let context = state.tryContext;
	while (context) {
		if (context.hasFinalizer && context.position !== "finally") {
			return context;
		}
		context = context.upper;
	}
	return state;
}

/**
 * Gets a context for a `throw` statement. There is just one special case:
 * if there is a `try` statement with a `finally` block and we are inside of
 * a `catch` because that changes how `throw` behaves; otherwise, this just
 * passes through the given state.
 * @param {CodePathState} state The state to search within.
 * @returns {TryContext|CodePathState} A context for a `throw` statement.
 */
function getThrowContext(state) {
	let context = state.tryContext;
	while (context) {
		if (
			context.position === "try" ||
			(context.hasFinalizer && context.position === "catch")
		) {
			return context;
		}
		context = context.upper;
	}
	return state;
}

/**
 * Removes a given value from a given array.
 * @param {any[]} elements An array to remove the specific element.
 * @param {any} value The value to be removed.
 * @returns {void}
 */
function removeFromArray(elements, value) {
	elements.splice(elements.indexOf(value), 1);
}

/**
 * Disconnect given segments.
 *
 * This is used in a process for switch statements.
 * If there is the "default" chunk before other cases, the order is different
 * between node's and running's.
 * @param {CodePathSegment[]} prevSegments Forward segments to disconnect.
 * @param {CodePathSegment[]} nextSegments Backward segments to disconnect.
 * @returns {void}
 */
function disconnectSegments(prevSegments, nextSegments) {
	for (let i = 0; i < prevSegments.length; ++i) {
		const prevSegment = prevSegments[i];
		const nextSegment = nextSegments[i];
		removeFromArray(prevSegment.nextSegments, nextSegment);
		removeFromArray(prevSegment.allNextSegments, nextSegment);
		removeFromArray(nextSegment.prevSegments, prevSegment);
		removeFromArray(nextSegment.allPrevSegments, prevSegment);
	}
}

/**
 * Creates looping path between two arrays of segments, ensuring that there are
 * paths going between matching segments in the arrays.
 * @param {CodePathState} state The state to operate on.
 * @param {CodePathSegment[]} unflattenedFromSegments Segments which are source.
 * @param {CodePathSegment[]} unflattenedToSegments Segments which are destination.
 * @returns {void}
 */
function makeLooped(state, unflattenedFromSegments, unflattenedToSegments) {
	const fromSegments = CodePathSegment.flattenUnusedSegments(
		unflattenedFromSegments,
	);
	const toSegments = CodePathSegment.flattenUnusedSegments(
		unflattenedToSegments,
	);
	const end = Math.min(fromSegments.length, toSegments.length);
	for (let i = 0; i < end; ++i) {
		const fromSegment = fromSegments[i];
		const toSegment = toSegments[i];
		if (toSegment.reachable) {
			fromSegment.nextSegments.push(toSegment);
		}
		if (fromSegment.reachable) {
			toSegment.prevSegments.push(fromSegment);
		}
		fromSegment.allNextSegments.push(toSegment);
		toSegment.allPrevSegments.push(fromSegment);
		if (toSegment.allPrevSegments.length >= 2) {
			CodePathSegment.markPrevSegmentAsLooped(toSegment, fromSegment);
		}
		state.notifyLooped(fromSegment, toSegment);
	}
}

/**
 * Finalizes segments of `test` chunk of a ForStatement.
 *
 * - Adds `false` paths to paths which are leaving from the loop.
 * - Sets `true` paths to paths which go to the body.
 * @param {LoopContext} context A loop context to modify.
 * @param {ChoiceContext} choiceContext A choice context of this loop.
 * @param {CodePathSegment[]} head The current head paths.
 * @returns {void}
 */
function finalizeTestSegmentsOfFor(context, choiceContext, head) {
	if (!choiceContext.processed) {
		choiceContext.trueForkContext.add(head);
		choiceContext.falseForkContext.add(head);
		choiceContext.nullishForkContext.add(head);
	}
	if (context.test !== true) {
		context.brokenForkContext.addAll(choiceContext.falseForkContext);
	}
	context.endOfTestSegments = choiceContext.trueForkContext.makeNext(0, -1);
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * A class which manages state to analyze code paths.
 */
class CodePathState {
	/**
	 * Creates a new instance.
	 * @param {IdGenerator} idGenerator An id generator to generate id for code
	 *   path segments.
	 * @param {Function} onLooped A callback function to notify looping.
	 */
	constructor(idGenerator, onLooped) {
		/** @type {IdGenerator} */
		this.idGenerator = idGenerator;
		/** @type {Function} */
		this.notifyLooped = onLooped;
		/** @type {ForkContext} */
		this.forkContext = ForkContext.newRoot(idGenerator);
		/** @type {ChoiceContext} */
		this.choiceContext = null;
		/** @type {SwitchContext} */
		this.switchContext = null;
		/** @type {TryContext} */
		this.tryContext = null;
		/** @type {LoopContext} */
		this.loopContext = null;
		/** @type {BreakContext} */
		this.breakContext = null;
		/** @type {ChainContext} */
		this.chainContext = null;
		/** @type {Array<CodePathSegment>} */
		this.currentSegments = [];
		/** @type {CodePathSegment} */
		this.initialSegment = this.forkContext.head[0];
		/** @type {Array<CodePathSegment>} */
		this.finalSegments = [];
		/** @type {Array<CodePathSegment>} */
		this.returnedForkContext = [];
		/** @type {Array<CodePathSegment>} */
		this.thrownForkContext = [];
		const final = this.finalSegments;
		const returned = this.returnedForkContext;
		const thrown = this.thrownForkContext;
		returned.add = addToReturnedOrThrown.bind(
			null,
			returned,
			thrown,
			final,
		);
		thrown.add = addToReturnedOrThrown.bind(null, thrown, returned, final);
	}

	/**
	 * A passthrough property exposing the current pointer as part of the API.
	 * @type {CodePathSegment[]}
	 */
	get headSegments() {
		return this.forkContext.head;
	}

	/**
	 * The parent forking context.
	 * This is used for the root of new forks.
	 * @type {ForkContext}
	 */
	get parentForkContext() {
		const current = this.forkContext;
		return current && current.upper;
	}

	/**
	 * Creates and stacks new forking context.
	 * @param {boolean} forkLeavingPath A flag which shows being in a
	 *   "finally" block.
	 * @returns {ForkContext} The created context.
	 */
	pushForkContext(forkLeavingPath) {
		this.forkContext = ForkContext.newEmpty(
			this.forkContext,
			forkLeavingPath,
		);
		return this.forkContext;
	}

	/**
	 * Pops and merges the last forking context.
	 * @returns {ForkContext} The last context.
	 */
	popForkContext() {
		const lastContext = this.forkContext;
		this.forkContext = lastContext.upper;
		this.forkContext.replaceHead(lastContext.makeNext(0, -1));
		return lastContext;
	}

	/**
	 * Creates a new path.
	 * @returns {void}
	 */
	forkPath() {
		this.forkContext.add(this.parentForkContext.makeNext(-1, -1));
	}

	/**
	 * Creates a bypass path.
	 * This is used for such as IfStatement which does not have "else" chunk.
	 * @returns {void}
	 */
	forkBypassPath() {
		this.forkContext.add(this.parentForkContext.head);
	}

	//--------------------------------------------------------------------------
	// ConditionalExpression, LogicalExpression, IfStatement
	//--------------------------------------------------------------------------

	/**
	 * Creates a context for ConditionalExpression, LogicalExpression, AssignmentExpression (logical assignments only),
	 * IfStatement, WhileStatement, DoWhileStatement, or ForStatement.
	 *
	 * LogicalExpressions have cases that it goes different paths between the
	 * `true` case and the `false` case.
	 *
	 * For Example:
	 *
	 *     if (a || b) {
	 *         foo();
	 *     } else {
	 *         bar();
	 *     }
	 *
	 * In this case, `b` is evaluated always in the code path of the `else`
	 * block, but it's not so in the code path of the `if` block.
	 * So there are 3 paths.
	 *
	 *     a -> foo();
	 *     a -> b -> foo();
	 *     a -> b -> bar();
	 * @param {string} kind A kind string.
	 *   If the new context is LogicalExpression's or AssignmentExpression's, this is `"&&"` or `"||"` or `"??"`.
	 *   If it's IfStatement's or ConditionalExpression's, this is `"test"`.
	 *   Otherwise, this is `"loop"`.
	 * @param {boolean} isForkingAsResult Indicates if the result of the choice
	 *      creates a fork.
	 * @returns {void}
	 */
	pushChoiceContext(kind, isForkingAsResult) {
		this.choiceContext = new ChoiceContext(
			this.choiceContext,
			kind,
			isForkingAsResult,
			this.forkContext,
		);
	}

	/**
	 * Pops the last choice context and finalizes it.
	 * This is called upon leaving a node that represents a choice.
	 * @throws {Error} (Unreachable.)
	 * @returns {ChoiceContext} The popped context.
	 */
	popChoiceContext() {
		const poppedChoiceContext = this.choiceContext;
		const forkContext = this.forkContext;
		const head = forkContext.head;
		this.choiceContext = poppedChoiceContext.upper;
		switch (poppedChoiceContext.kind) {
			case "&&":
			case "||":
			case "??":
				if (!poppedChoiceContext.processed) {
					poppedChoiceContext.trueForkContext.add(head);
					poppedChoiceContext.falseForkContext.add(head);
					poppedChoiceContext.nullishForkContext.add(head);
				}
				if (poppedChoiceContext.isForkingAsResult) {
					const parentContext = this.choiceContext;
					parentContext.trueForkContext.addAll(
						poppedChoiceContext.trueForkContext,
					);
					parentContext.falseForkContext.addAll(
						poppedChoiceContext.falseForkContext,
					);
					parentContext.nullishForkContext.addAll(
						poppedChoiceContext.nullishForkContext,
					);
					parentContext.processed = true;
					return poppedChoiceContext;
				}
				break;
			case "test":
				if (!poppedChoiceContext.processed) {
					poppedChoiceContext.trueForkContext.clear();
					poppedChoiceContext.trueForkContext.add(head);
				} else {
					poppedChoiceContext.falseForkContext.clear();
					poppedChoiceContext.falseForkContext.add(head);
				}
				break;
			case "loop":
				return poppedChoiceContext;
			default:
				throw new Error("unreachable");
		}
		const combinedForkContext = poppedChoiceContext.trueForkContext;
		combinedForkContext.addAll(poppedChoiceContext.falseForkContext);
		forkContext.replaceHead(combinedForkContext.makeNext(0, -1));
		return poppedChoiceContext;
	}

	/**
	 * Creates a code path segment to represent right-hand operand of a logical
	 * expression.
	 * This is called in the preprocessing phase when entering a node.
	 * @throws {Error} (Unreachable.)
	 * @returns {void}
	 */
	makeLogicalRight() {
		const currentChoiceContext = this.choiceContext;
		const forkContext = this.forkContext;
		if (currentChoiceContext.processed) {
			let prevForkContext;
			switch (currentChoiceContext.kind) {
				case "&&":
					prevForkContext = currentChoiceContext.trueForkContext;
					break;
				case "||":
					prevForkContext = currentChoiceContext.falseForkContext;
					break;
				case "??":
					prevForkContext = currentChoiceContext.nullishForkContext;
					break;
				default:
					throw new Error("unreachable");
			}
			forkContext.replaceHead(prevForkContext.makeNext(0, -1));
			prevForkContext.clear();
			currentChoiceContext.processed = false;
		} else {
			switch (currentChoiceContext.kind) {
				case "&&":
					currentChoiceContext.falseForkContext.add(forkContext.head);
					currentChoiceContext.nullishForkContext.add(
						forkContext.head,
					);
					break;
				case "||":
					currentChoiceContext.trueForkContext.add(forkContext.head);
					break;
				case "??":
					currentChoiceContext.trueForkContext.add(forkContext.head);
					currentChoiceContext.falseForkContext.add(forkContext.head);
					break;
				default:
					throw new Error("unreachable");
			}
			forkContext.replaceHead(forkContext.makeNext(-1, -1));
		}
	}

	/**
	 * Makes a code path segment of the `if` block.
	 * @returns {void}
	 */
	makeIfConsequent() {
		const context = this.choiceContext;
		const forkContext = this.forkContext;
		if (!context.processed) {
			context.trueForkContext.add(forkContext.head);
			context.falseForkContext.add(forkContext.head);
			context.nullishForkContext.add(forkContext.head);
		}
		context.processed = false;
		forkContext.replaceHead(context.trueForkContext.makeNext(0, -1));
	}

	/**
	 * Makes a code path segment of the `else` block.
	 * @returns {void}
	 */
	makeIfAlternate() {
		const context = this.choiceContext;
		const forkContext = this.forkContext;
		context.trueForkContext.clear();
		context.trueForkContext.add(forkContext.head);
		context.processed = true;
		forkContext.replaceHead(context.falseForkContext.makeNext(0, -1));
	}

	//--------------------------------------------------------------------------
	// ChainExpression
	//--------------------------------------------------------------------------

	/**
	 * Pushes a new `ChainExpression` context to the stack. This method is
	 * called when entering a `ChainExpression` node. A chain context is used to
	 * count forking in the optional chain then merge them on the exiting from
	 * the `ChainExpression` node.
	 * @returns {void}
	 */
	pushChainContext() {
		this.chainContext = new ChainContext(this.chainContext);
	}

	/**
	 * Pop a `ChainExpression` context from the stack. This method is called on
	 * exiting from each `ChainExpression` node. This merges all forks of the
	 * last optional chaining.
	 * @returns {void}
	 */
	popChainContext() {
		const context = this.chainContext;
		this.chainContext = context.upper;
		for (let i = context.choiceContextCount; i > 0; --i) {
			this.popChoiceContext();
		}
	}

	/**
	 * Create a choice context for optional access.
	 * This method is called on entering to each `(Call|Member)Expression[optional=true]` node.
	 * This creates a choice context as similar to `LogicalExpression[operator="??"]` node.
	 * @returns {void}
	 */
	makeOptionalNode() {
		if (this.chainContext) {
			this.chainContext.choiceContextCount += 1;
			this.pushChoiceContext("??", false);
		}
	}

	/**
	 * Create a fork.
	 * This method is called on entering to the `arguments|property` property of each `(Call|Member)Expression` node.
	 * @returns {void}
	 */
	makeOptionalRight() {
		if (this.chainContext) {
			this.makeLogicalRight();
		}
	}

	//--------------------------------------------------------------------------
	// SwitchStatement
	//--------------------------------------------------------------------------

	/**
	 * Creates a context object of SwitchStatement and stacks it.
	 * @param {boolean} hasCase `true` if the switch statement has one or more
	 *   case parts.
	 * @param {string|null} label The label text.
	 * @returns {void}
	 */
	pushSwitchContext(hasCase, label) {
		this.switchContext = new SwitchContext(this.switchContext, hasCase);
		this.pushBreakContext(true, label);
	}

	/**
	 * Pops the last context of SwitchStatement and finalizes it.
	 *
	 * - Disposes all forking stack for `case` and `default`.
	 * - Creates the next code path segment from `context.brokenForkContext`.
	 * - If the last `SwitchCase` node is not a `default` part, creates a path
	 *   to the `default` body.
	 * @returns {void}
	 */
	popSwitchContext() {
		const context = this.switchContext;
		this.switchContext = context.upper;
		const forkContext = this.forkContext;
		const brokenForkContext = this.popBreakContext().brokenForkContext;
		if (context.forkCount === 0) {
			if (!brokenForkContext.empty) {
				brokenForkContext.add(forkContext.makeNext(-1, -1));
				forkContext.replaceHead(brokenForkContext.makeNext(0, -1));
			}
			return;
		}
		const lastSegments = forkContext.head;
		this.forkBypassPath();
		const lastCaseSegments = forkContext.head;
		brokenForkContext.add(lastSegments);
		if (!context.lastIsDefault) {
			if (context.defaultBodySegments) {
				disconnectSegments(
					context.defaultSegments,
					context.defaultBodySegments,
				);
				makeLooped(this, lastCaseSegments, context.defaultBodySegments);
			} else {
				brokenForkContext.add(lastCaseSegments);
			}
		}
		for (let i = 0; i < context.forkCount; ++i) {
			this.forkContext = this.forkContext.upper;
		}
		this.forkContext.replaceHead(brokenForkContext.makeNext(0, -1));
	}

	/**
	 * Makes a code path segment for a `SwitchCase` node.
	 * @param {boolean} isCaseBodyEmpty `true` if the body is empty.
	 * @param {boolean} isDefaultCase `true` if the body is the default case.
	 * @returns {void}
	 */
	makeSwitchCaseBody(isCaseBodyEmpty, isDefaultCase) {
		const context = this.switchContext;
		if (!context.hasCase) {
			return;
		}
		const parentForkContext = this.forkContext;
		const forkContext = this.pushForkContext();
		forkContext.add(parentForkContext.makeNext(0, -1));
		if (isDefaultCase) {
			context.defaultSegments = parentForkContext.head;
			if (isCaseBodyEmpty) {
				context.foundEmptyDefault = true;
			} else {
				context.defaultBodySegments = forkContext.head;
			}
		} else {
			if (!isCaseBodyEmpty && context.foundEmptyDefault) {
				context.foundEmptyDefault = false;
				context.defaultBodySegments = forkContext.head;
			}
		}
		context.lastIsDefault = isDefaultCase;
		context.forkCount += 1;
	}

	//--------------------------------------------------------------------------
	// TryStatement
	//--------------------------------------------------------------------------

	/**
	 * Creates a context object of TryStatement and stacks it.
	 * @param {boolean} hasFinalizer `true` if the try statement has a
	 *   `finally` block.
	 * @returns {void}
	 */
	pushTryContext(hasFinalizer) {
		this.tryContext = new TryContext(
			this.tryContext,
			hasFinalizer,
			this.forkContext,
		);
	}

	/**
	 * Pops the last context of TryStatement and finalizes it.
	 * @returns {void}
	 */
	popTryContext() {
		const context = this.tryContext;
		this.tryContext = context.upper;
		if (context.position === "catch") {
			this.popForkContext();
			return;
		}
		const originalReturnedForkContext = context.returnedForkContext;
		const originalThrownForkContext = context.thrownForkContext;
		if (
			originalReturnedForkContext.empty &&
			originalThrownForkContext.empty
		) {
			return;
		}
		const headSegments = this.forkContext.head;
		this.forkContext = this.forkContext.upper;
		const normalSegments = headSegments.slice(
			0,
			Math.trunc(headSegments.length / 2),
		);
		const leavingSegments = headSegments.slice(
			Math.trunc(headSegments.length / 2),
		);
		if (!originalReturnedForkContext.empty) {
			getReturnContext(this).returnedForkContext.add(leavingSegments);
		}
		if (!originalThrownForkContext.empty) {
			getThrowContext(this).thrownForkContext.add(leavingSegments);
		}
		this.forkContext.replaceHead(normalSegments);
		if (!context.lastOfTryIsReachable && !context.lastOfCatchIsReachable) {
			this.forkContext.makeUnreachable();
		}
	}

	/**
	 * Makes a code path segment for a `catch` block.
	 * @returns {void}
	 */
	makeCatchBlock() {
		const context = this.tryContext;
		const forkContext = this.forkContext;
		const originalThrownForkContext = context.thrownForkContext;
		context.position = "catch";
		context.thrownForkContext = ForkContext.newEmpty(forkContext);
		context.lastOfTryIsReachable = forkContext.reachable;
		originalThrownForkContext.add(forkContext.head);
		const thrownSegments = originalThrownForkContext.makeNext(0, -1);
		this.pushForkContext();
		this.forkBypassPath();
		this.forkContext.add(thrownSegments);
	}

	/**
	 * Makes a code path segment for a `finally` block.
	 *
	 * In the `finally` block, parallel paths are created. The parallel paths
	 * are used as leaving-paths. The leaving-paths are paths from `return`
	 * statements and `throw` statements in a `try` block or a `catch` block.
	 * @returns {void}
	 */
	makeFinallyBlock() {
		const context = this.tryContext;
		let forkContext = this.forkContext;
		const originalReturnedForkContext = context.returnedForkContext;
		const originalThrownForContext = context.thrownForkContext;
		const headOfLeavingSegments = forkContext.head;
		if (context.position === "catch") {
			this.popForkContext();
			forkContext = this.forkContext;
			context.lastOfCatchIsReachable = forkContext.reachable;
		} else {
			context.lastOfTryIsReachable = forkContext.reachable;
		}
		context.position = "finally";
		if (
			originalReturnedForkContext.empty &&
			originalThrownForContext.empty
		) {
			return;
		}
		const segments = forkContext.makeNext(-1, -1);
		for (let i = 0; i < forkContext.count; ++i) {
			const prevSegsOfLeavingSegment = [headOfLeavingSegments[i]];
			for (
				let j = 0;
				j < originalReturnedForkContext.segmentsList.length;
				++j
			) {
				prevSegsOfLeavingSegment.push(
					originalReturnedForkContext.segmentsList[j][i],
				);
			}
			for (
				let j = 0;
				j < originalThrownForContext.segmentsList.length;
				++j
			) {
				prevSegsOfLeavingSegment.push(
					originalThrownForContext.segmentsList[j][i],
				);
			}
			segments.push(
				CodePathSegment.newNext(
					this.idGenerator.next(),
					prevSegsOfLeavingSegment,
				),
			);
		}
		this.pushForkContext(true);
		this.forkContext.add(segments);
	}

	/**
	 * Makes a code path segment from the first throwable node to the `catch`
	 * block or the `finally` block.
	 * @returns {void}
	 */
	makeFirstThrowablePathInTryBlock() {
		const forkContext = this.forkContext;
		if (!forkContext.reachable) {
			return;
		}
		const context = getThrowContext(this);
		if (
			context === this ||
			context.position !== "try" ||
			!context.thrownForkContext.empty
		) {
			return;
		}
		context.thrownForkContext.add(forkContext.head);
		forkContext.replaceHead(forkContext.makeNext(-1, -1));
	}

	//--------------------------------------------------------------------------
	// Loop Statements
	//--------------------------------------------------------------------------

	/**
	 * Creates a context object of a loop statement and stacks it.
	 * @param {string} type The type of the node which was triggered. One of
	 *   `WhileStatement`, `DoWhileStatement`, `ForStatement`, `ForInStatement`,
	 *   and `ForStatement`.
	 * @param {string|null} label A label of the node which was triggered.
	 * @throws {Error} (Unreachable - unknown type.)
	 * @returns {void}
	 */
	pushLoopContext(type, label) {
		const forkContext = this.forkContext;
		const breakContext = this.pushBreakContext(true, label);
		switch (type) {
			case "WhileStatement":
				this.pushChoiceContext("loop", false);
				this.loopContext = new WhileLoopContext(
					this.loopContext,
					label,
					breakContext,
				);
				break;
			case "DoWhileStatement":
				this.pushChoiceContext("loop", false);
				this.loopContext = new DoWhileLoopContext(
					this.loopContext,
					label,
					breakContext,
					forkContext,
				);
				break;
			case "ForStatement":
				this.pushChoiceContext("loop", false);
				this.loopContext = new ForLoopContext(
					this.loopContext,
					label,
					breakContext,
				);
				break;
			case "ForInStatement":
				this.loopContext = new ForInLoopContext(
					this.loopContext,
					label,
					breakContext,
				);
				break;
			case "ForOfStatement":
				this.loopContext = new ForOfLoopContext(
					this.loopContext,
					label,
					breakContext,
				);
				break;
			default:
				throw new Error(`unknown type: "${type}"`);
		}
	}

	/**
	 * Pops the last context of a loop statement and finalizes it.
	 * @throws {Error} (Unreachable - unknown type.)
	 * @returns {void}
	 */
	popLoopContext() {
		const context = this.loopContext;
		this.loopContext = context.upper;
		const forkContext = this.forkContext;
		const brokenForkContext = this.popBreakContext().brokenForkContext;
		switch (context.type) {
			case "WhileStatement":
			case "ForStatement":
				this.popChoiceContext();
				makeLooped(
					this,
					forkContext.head,
					context.continueDestSegments,
				);
				break;
			case "DoWhileStatement": {
				const choiceContext = this.popChoiceContext();
				if (!choiceContext.processed) {
					choiceContext.trueForkContext.add(forkContext.head);
					choiceContext.falseForkContext.add(forkContext.head);
				}
				if (context.test !== true) {
					brokenForkContext.addAll(choiceContext.falseForkContext);
				}
				const segmentsList = choiceContext.trueForkContext.segmentsList;
				for (let i = 0; i < segmentsList.length; ++i) {
					makeLooped(this, segmentsList[i], context.entrySegments);
				}
				break;
			}
			case "ForInStatement":
			case "ForOfStatement":
				brokenForkContext.add(forkContext.head);
				makeLooped(this, forkContext.head, context.leftSegments);
				break;
			default:
				throw new Error("unreachable");
		}
		if (brokenForkContext.empty) {
			forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
		} else {
			forkContext.replaceHead(brokenForkContext.makeNext(0, -1));
		}
	}

	/**
	 * Makes a code path segment for the test part of a WhileStatement.
	 * @param {boolean|undefined} test The test value (only when constant).
	 * @returns {void}
	 */
	makeWhileTest(test) {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const testSegments = forkContext.makeNext(0, -1);
		context.test = test;
		context.continueDestSegments = testSegments;
		forkContext.replaceHead(testSegments);
	}

	/**
	 * Makes a code path segment for the body part of a WhileStatement.
	 * @returns {void}
	 */
	makeWhileBody() {
		const context = this.loopContext;
		const choiceContext = this.choiceContext;
		const forkContext = this.forkContext;
		if (!choiceContext.processed) {
			choiceContext.trueForkContext.add(forkContext.head);
			choiceContext.falseForkContext.add(forkContext.head);
		}
		if (context.test !== true) {
			context.brokenForkContext.addAll(choiceContext.falseForkContext);
		}
		forkContext.replaceHead(choiceContext.trueForkContext.makeNext(0, -1));
	}

	/**
	 * Makes a code path segment for the body part of a DoWhileStatement.
	 * @returns {void}
	 */
	makeDoWhileBody() {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const bodySegments = forkContext.makeNext(-1, -1);
		context.entrySegments = bodySegments;
		forkContext.replaceHead(bodySegments);
	}

	/**
	 * Makes a code path segment for the test part of a DoWhileStatement.
	 * @param {boolean|undefined} test The test value (only when constant).
	 * @returns {void}
	 */
	makeDoWhileTest(test) {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		context.test = test;
		if (!context.continueForkContext.empty) {
			context.continueForkContext.add(forkContext.head);
			const testSegments = context.continueForkContext.makeNext(0, -1);
			forkContext.replaceHead(testSegments);
		}
	}

	/**
	 * Makes a code path segment for the test part of a ForStatement.
	 * @param {boolean|undefined} test The test value (only when constant).
	 * @returns {void}
	 */
	makeForTest(test) {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const endOfInitSegments = forkContext.head;
		const testSegments = forkContext.makeNext(-1, -1);
		context.test = test;
		context.endOfInitSegments = endOfInitSegments;
		context.continueDestSegments = context.testSegments = testSegments;
		forkContext.replaceHead(testSegments);
	}

	/**
	 * Makes a code path segment for the update part of a ForStatement.
	 * @returns {void}
	 */
	makeForUpdate() {
		const context = this.loopContext;
		const choiceContext = this.choiceContext;
		const forkContext = this.forkContext;
		if (context.testSegments) {
			finalizeTestSegmentsOfFor(context, choiceContext, forkContext.head);
		} else {
			context.endOfInitSegments = forkContext.head;
		}
		const updateSegments = forkContext.makeDisconnected(-1, -1);
		context.continueDestSegments = context.updateSegments = updateSegments;
		forkContext.replaceHead(updateSegments);
	}

	/**
	 * Makes a code path segment for the body part of a ForStatement.
	 * @returns {void}
	 */
	makeForBody() {
		const context = this.loopContext;
		const choiceContext = this.choiceContext;
		const forkContext = this.forkContext;
		if (context.updateSegments) {
			context.endOfUpdateSegments = forkContext.head;
			if (context.testSegments) {
				makeLooped(
					this,
					context.endOfUpdateSegments,
					context.testSegments,
				);
			}
		} else if (context.testSegments) {
			finalizeTestSegmentsOfFor(context, choiceContext, forkContext.head);
		} else {
			context.endOfInitSegments = forkContext.head;
		}
		let bodySegments = context.endOfTestSegments;
		if (!bodySegments) {
			const prevForkContext = ForkContext.newEmpty(forkContext);
			prevForkContext.add(context.endOfInitSegments);
			if (context.endOfUpdateSegments) {
				prevForkContext.add(context.endOfUpdateSegments);
			}
			bodySegments = prevForkContext.makeNext(0, -1);
		}
		context.continueDestSegments =
			context.continueDestSegments || bodySegments;
		forkContext.replaceHead(bodySegments);
	}

	/**
	 * Makes a code path segment for the left part of a ForInStatement and a
	 * ForOfStatement.
	 * @returns {void}
	 */
	makeForInOfLeft() {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const leftSegments = forkContext.makeDisconnected(-1, -1);
		context.prevSegments = forkContext.head;
		context.leftSegments = context.continueDestSegments = leftSegments;
		forkContext.replaceHead(leftSegments);
	}

	/**
	 * Makes a code path segment for the right part of a ForInStatement and a
	 * ForOfStatement.
	 * @returns {void}
	 */
	makeForInOfRight() {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const temp = ForkContext.newEmpty(forkContext);
		temp.add(context.prevSegments);
		const rightSegments = temp.makeNext(-1, -1);
		context.endOfLeftSegments = forkContext.head;
		forkContext.replaceHead(rightSegments);
	}

	/**
	 * Makes a code path segment for the body part of a ForInStatement and a
	 * ForOfStatement.
	 * @returns {void}
	 */
	makeForInOfBody() {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const temp = ForkContext.newEmpty(forkContext);
		temp.add(context.endOfLeftSegments);
		const bodySegments = temp.makeNext(-1, -1);
		makeLooped(this, forkContext.head, context.leftSegments);
		context.brokenForkContext.add(forkContext.head);
		forkContext.replaceHead(bodySegments);
	}

	//--------------------------------------------------------------------------
	// Control Statements
	//--------------------------------------------------------------------------

	/**
	 * Creates new context in which a `break` statement can be used. This occurs inside of a loop,
	 * labeled statement, or switch statement.
	 * @param {boolean} breakable Indicates if we are inside a statement where
	 *      `break` without a label will exit the statement.
	 * @param {string|null} label The label associated with the statement.
	 * @returns {BreakContext} The new context.
	 */
	pushBreakContext(breakable, label) {
		this.breakContext = new BreakContext(
			this.breakContext,
			breakable,
			label,
			this.forkContext,
		);
		return this.breakContext;
	}

	/**
	 * Removes the top item of the break context stack.
	 * @returns {Object} The removed context.
	 */
	popBreakContext() {
		const context = this.breakContext;
		const forkContext = this.forkContext;
		this.breakContext = context.upper;
		if (!context.breakable) {
			const brokenForkContext = context.brokenForkContext;
			if (!brokenForkContext.empty) {
				brokenForkContext.add(forkContext.head);
				forkContext.replaceHead(brokenForkContext.makeNext(0, -1));
			}
		}
		return context;
	}

	/**
	 * Makes a path for a `break` statement.
	 *
	 * It registers the head segment to a context of `break`.
	 * It makes new unreachable segment, then it set the head with the segment.
	 * @param {string|null} label A label of the break statement.
	 * @returns {void}
	 */
	makeBreak(label) {
		const forkContext = this.forkContext;
		if (!forkContext.reachable) {
			return;
		}
		const context = getBreakContext(this, label);
		if (context) {
			context.brokenForkContext.add(forkContext.head);
		}
		forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
	}

	/**
	 * Makes a path for a `continue` statement.
	 *
	 * It makes a looping path.
	 * It makes new unreachable segment, then it set the head with the segment.
	 * @param {string|null} label A label of the continue statement.
	 * @returns {void}
	 */
	makeContinue(label) {
		const forkContext = this.forkContext;
		if (!forkContext.reachable) {
			return;
		}
		const context = getContinueContext(this, label);
		if (context) {
			if (context.continueDestSegments) {
				makeLooped(
					this,
					forkContext.head,
					context.continueDestSegments,
				);
				if (
					context.type === "ForInStatement" ||
					context.type === "ForOfStatement"
				) {
					context.brokenForkContext.add(forkContext.head);
				}
			} else {
				context.continueForkContext.add(forkContext.head);
			}
		}
		forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
	}

	/**
	 * Makes a path for a `return` statement.
	 *
	 * It registers the head segment to a context of `return`.
	 * It makes new unreachable segment, then it set the head with the segment.
	 * @returns {void}
	 */
	makeReturn() {
		const forkContext = this.forkContext;
		if (forkContext.reachable) {
			getReturnContext(this).returnedForkContext.add(forkContext.head);
			forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
		}
	}

	/**
	 * Makes a path for a `throw` statement.
	 *
	 * It registers the head segment to a context of `throw`.
	 * It makes new unreachable segment, then it set the head with the segment.
	 * @returns {void}
	 */
	makeThrow() {
		const forkContext = this.forkContext;
		if (forkContext.reachable) {
			getThrowContext(this).thrownForkContext.add(forkContext.head);
			forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
		}
	}

	/**
	 * Makes the final path.
	 * @returns {void}
	 */
	makeFinal() {
		const segments = this.currentSegments;
		if (segments.length > 0 && segments[0].reachable) {
			this.returnedForkContext.add(segments);
		}
	}
}

module.exports = CodePathState;