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
 * but does not create a new fork because the result of the expression is
 * not used as the test expression in another expression. In this case,
 * `isForkingAsResult` is false. The expression `a || b || c`, the `a || b`
 * expression appears as the test expression for `|| c`, so the
 * result of `a || b` creates a fork because execution may or may not
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
	 *      conditional expression, this is `"test"`; otherwise this is `"loop"`.
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

		returned.add = addToReturnedOrThrown.bind(null, returned, thrown, final);
		thrown.add = addToReturnedOrThrown.bind(null, thrown, returned, final);
	}

	/** @type {CodePathSegment[]} */
	get headSegments() {
		return this.forkContext.head;
	}

	/** @type {ForkContext} */
	get parentForkContext() {
		const current = this.forkContext;
		return current && current.upper;
	}

	/**
	 * Creates and stacks new forking context.
	 * @param {boolean} forkLeavingPath A flag which shows being in a
	 *   "finally" block.
	 * @returns {ForkContext}
	 */
	pushForkContext(forkLeavingPath) {
		this.forkContext = ForkContext.newEmpty(this.forkContext, forkLeavingPath);
		return this.forkContext;
	}

	/**
	 * Pops and merges the last forking context.
	 * @returns {ForkContext}
	 */
	popForkContext() {
		const lastContext = this.forkContext;
		this.forkContext = lastContext.upper;
		this.forkContext.replaceHead(lastContext.makeNext(0, -1));
		return lastContext;
	}

	/** @returns {void} */
	forkPath() {
		this.forkContext.add(this.parentForkContext.makeNext(-1, -1));
	}

	/** @returns {void} */
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
	 * @param {string} kind A kind string.
	 * @param {boolean} isForkingAsResult Indicates if the result of the choice creates a fork.
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
	 * @returns {ChoiceContext}
	 */
	popChoiceContext() {
		const popped = this.choiceContext;
		const forkContext = this.forkContext;
		const head = forkContext.head;
		this.choiceContext = popped.upper;
		return this._finalizePoppedChoice(popped, forkContext, head);
	}

	/**
	 * Internal helper to finalize a popped choice context.
	 * @private
	 */
	_finalizePoppedChoice(popped, forkContext, head) {
		switch (popped.kind) {
			case "&&":
			case "||":
			case "??":
				if (!popped.processed) {
					popped.trueForkContext.add(head);
					popped.falseForkContext.add(head);
					popped.nullishForkContext.add(head);
				}
				if (popped.isForkingAsResult) {
					const parent = this.choiceContext;
					parent.trueForkContext.addAll(popped.trueForkContext);
					parent.falseForkContext.addAll(popped.falseForkContext);
					parent.nullishForkContext.addAll(popped.nullishForkContext);
					parent.processed = true;
					return popped;
				}
				break;
			case "test":
				if (!popped.processed) {
					popped.trueForkContext.clear();
					popped.trueForkContext.add(head);
				} else {
					popped.falseForkContext.clear();
					popped.falseForkContext.add(head);
				}
				break;
			case "loop":
				return popped;
			/* c8 ignore next */
			default:
				throw new Error("unreachable");
		}
		const combined = popped.trueForkContext;
		combined.addAll(popped.falseForkContext);
		forkContext.replaceHead(combined.makeNext(0, -1));
		return popped;
	}

	/** @returns {void} */
	makeLogicalRight() {
		const current = this.choiceContext;
		const forkContext = this.forkContext;
		if (current.processed) {
			let prev;
			switch (current.kind) {
				case "&&":
					prev = current.trueForkContext;
					break;
				case "||":
					prev = current.falseForkContext;
					break;
				case "??":
					prev = current.nullishForkContext;
					break;
				default:
					throw new Error("unreachable");
			}
			forkContext.replaceHead(prev.makeNext(0, -1));
			prev.clear();
			current.processed = false;
		} else {
			switch (current.kind) {
				case "&&":
					current.falseForkContext.add(forkContext.head);
					current.nullishForkContext.add(forkContext.head);
					break;
				case "||":
					current.trueForkContext.add(forkContext.head);
					break;
				case "??":
					current.trueForkContext.add(forkContext.head);
					current.falseForkContext.add(forkContext.head);
					break;
				default:
					throw new Error("unreachable");
			}
			forkContext.replaceHead(forkContext.makeNext(-1, -1));
		}
	}

	/** @returns {void} */
	makeIfConsequent() {
		const ctx = this.choiceContext;
		const fork = this.forkContext;
		if (!ctx.processed) {
			ctx.trueForkContext.add(fork.head);
			ctx.falseForkContext.add(fork.head);
			ctx.nullishForkContext.add(fork.head);
		}
		ctx.processed = false;
		fork.replaceHead(ctx.trueForkContext.makeNext(0, -1));
	}

	/** @returns {void} */
	makeIfAlternate() {
		const ctx = this.choiceContext;
		const fork = this.forkContext;
		ctx.trueForkContext.clear();
		ctx.trueForkContext.add(fork.head);
		ctx.processed = true;
		fork.replaceHead(ctx.falseForkContext.makeNext(0, -1));
	}

	//--------------------------------------------------------------------------
	// ChainExpression
	//--------------------------------------------------------------------------

	/** @returns {void} */
	pushChainContext() {
		this.chainContext = new ChainContext(this.chainContext);
	}

	/** @returns {void} */
	popChainContext() {
		const ctx = this.chainContext;
		this.chainContext = ctx.upper;
		for (let i = ctx.choiceContextCount; i > 0; --i) {
			this.popChoiceContext();
		}
	}

	/** @returns {void} */
	makeOptionalNode() {
		if (this.chainContext) {
			this.chainContext.choiceContextCount += 1;
			this.pushChoiceContext("??", false);
		}
	}

	/** @returns {void} */
	makeOptionalRight() {
		if (this.chainContext) {
			this.makeLogicalRight();
		}
	}

	//--------------------------------------------------------------------------
	// SwitchStatement
	//--------------------------------------------------------------------------

	/** @returns {void} */
	pushSwitchContext(hasCase, label) {
		this.switchContext = new SwitchContext(this.switchContext, hasCase);
		this.pushBreakContext(true, label);
	}

	/** @returns {void} */
	popSwitchContext() {
		const ctx = this.switchContext;
		this.switchContext = ctx.upper;
		const fork = this.forkContext;
		const broken = this.popBreakContext().brokenForkContext;

		if (ctx.forkCount === 0) {
			if (!broken.empty) {
				broken.add(fork.makeNext(-1, -1));
				fork.replaceHead(broken.makeNext(0, -1));
			}
			return;
		}

		const lastSegments = fork.head;
		this.forkBypassPath();
		const lastCaseSegments = fork.head;

		broken.add(lastSegments);

		if (!ctx.lastIsDefault) {
			if (ctx.defaultBodySegments) {
				disconnectSegments(ctx.defaultSegments, ctx.defaultBodySegments);
				makeLooped(this, lastCaseSegments, ctx.defaultBodySegments);
			} else {
				broken.add(lastCaseSegments);
			}
		}

		for (let i = 0; i < ctx.forkCount; ++i) {
			this.forkContext = this.forkContext.upper;
		}
		this.forkContext.replaceHead(broken.makeNext(0, -1));
	}

	/** @returns {void} */
	makeSwitchCaseBody(isCaseBodyEmpty, isDefaultCase) {
		const ctx = this.switchContext;
		if (!ctx.hasCase) {
			return;
		}
		const parent = this.forkContext;
		const fork = this.pushForkContext();
		fork.add(parent.makeNext(0, -1));

		if (isDefaultCase) {
			ctx.defaultSegments = parent.head;
			if (isCaseBodyEmpty) {
				ctx.foundEmptyDefault = true;
			} else {
				ctx.defaultBodySegments = fork.head;
			}
		} else if (!isCaseBodyEmpty && ctx.foundEmptyDefault) {
			ctx.foundEmptyDefault = false;
			ctx.defaultBodySegments = fork.head;
		}
		ctx.lastIsDefault = isDefaultCase;
		ctx.forkCount += 1;
	}

	//--------------------------------------------------------------------------
	// TryStatement
	//--------------------------------------------------------------------------

	/** @returns {void} */
	pushTryContext(hasFinalizer) {
		this.tryContext = new TryContext(
			this.tryContext,
			hasFinalizer,
			this.forkContext,
		);
	}

	/** @returns {void} */
	popTryContext() {
		const ctx = this.tryContext;
		this.tryContext = ctx.upper;

		if (ctx.position === "catch") {
			this.popForkContext();
			return;
		}

		const returned = ctx.returnedForkContext;
		const thrown = ctx.thrownForkContext;

		if (returned.empty && thrown.empty) {
			return;
		}

		const headSegments = this.forkContext.head;
		this.forkContext = this.forkContext.upper;

		const [normalSegments, leavingSegments] = this._splitHeadSegments(headSegments);

		if (!returned.empty) {
			getReturnContext(this).returnedForkContext.add(leavingSegments);
		}
		if (!thrown.empty) {
			getThrowContext(this).thrownForkContext.add(leavingSegments);
		}
		this.forkContext.replaceHead(normalSegments);

		if (!ctx.lastOfTryIsReachable && !ctx.lastOfCatchIsReachable) {
			this.forkContext.makeUnreachable();
		}
	}

	/**
	 * Splits head segments into normal and leaving parts.
	 * @private
	 * @param {Array<CodePathSegment>} headSegments
	 * @returns {[Array<CodePathSegment>, Array<CodePathSegment>]}
	 */
	_splitHeadSegments(headSegments) {
		const half = Math.trunc(headSegments.length / 2);
		const normal = headSegments.slice(0, half);
		const leaving = headSegments.slice(half);
		return [normal, leaving];
	}

	/** @returns {void} */
	makeCatchBlock() {
		const ctx = this.tryContext;
		const fork = this.forkContext;
		const originalThrown = ctx.thrownForkContext;

		ctx.position = "catch";
		ctx.thrownForkContext = ForkContext.newEmpty(fork);
		ctx.lastOfTryIsReachable = fork.reachable;

		originalThrown.add(fork.head);
		const thrownSegments = originalThrown.makeNext(0, -1);

		this.pushForkContext();
		this.forkBypassPath();
		this.forkContext.add(thrownSegments);
	}

	/** @returns {void} */
	makeFinallyBlock() {
		const ctx = this.tryContext;
		let fork = this.forkContext;
		const originalReturned = ctx.returnedForkContext;
		const originalThrown = ctx.thrownForkContext;
		const leavingHead = fork.head;

		if (ctx.position === "catch") {
			this.popForkContext();
			fork = this.forkContext;
			ctx.lastOfCatchIsReachable = fork.reachable;
		} else {
			ctx.lastOfTryIsReachable = fork.reachable;
		}
		ctx.position = "finally";

		if (originalReturned.empty && originalThrown.empty) {
			return;
		}

		const segments = fork.makeNext(-1, -1);
		for (let i = 0; i < fork.count; ++i) {
			const prevSegs = [leavingHead[i]];
			for (let j = 0; j < originalReturned.segmentsList.length; ++j) {
				prevSegs.push(originalReturned.segmentsList[j][i]);
			}
			for (let j = 0; j < originalThrown.segmentsList.length; ++j) {
				prevSegs.push(originalThrown.segmentsList[j][i]);
			}
			segments.push(
				CodePathSegment.newNext(this.idGenerator.next(), prevSegs),
			);
		}
		this.pushForkContext(true);
		this.forkContext.add(segments);
	}

	/** @returns {void} */
	makeFirstThrowablePathInTryBlock() {
		const fork = this.forkContext;
		if (!fork.reachable) {
			return;
		}
		const ctx = getThrowContext(this);
		if (
			ctx === this ||
			ctx.position !== "try" ||
			!ctx.thrownForkContext.empty
		) {
			return;
		}
		ctx.thrownForkContext.add(fork.head);
		fork.replaceHead(fork.makeNext(-1, -1));
	}

	//--------------------------------------------------------------------------
	// Loop Statements
	//--------------------------------------------------------------------------

	/** @returns {void} */
	pushLoopContext(type, label) {
		const fork = this.forkContext;
		const breakCtx = this.pushBreakContext(true, label);
		switch (type) {
			case "WhileStatement":
				this.pushChoiceContext("loop", false);
				this.loopContext = new WhileLoopContext(this.loopContext, label, breakCtx);
				break;
			case "DoWhileStatement":
				this.pushChoiceContext("loop", false);
				this.loopContext = new DoWhileLoopContext(this.loopContext, label, breakCtx, fork);
				break;
			case "ForStatement":
				this.pushChoiceContext("loop", false);
				this.loopContext = new ForLoopContext(this.loopContext, label, breakCtx);
				break;
			case "ForInStatement":
				this.loopContext = new ForInLoopContext(this.loopContext, label, breakCtx);
				break;
			case "ForOfStatement":
				this.loopContext = new ForOfLoopContext(this.loopContext, label, breakCtx);
				break;
			/* c8 ignore next */
			default:
				throw new Error(`unknown type: "${type}"`);
		}
	}

	/** @returns {void} */
	popLoopContext() {
		const ctx = this.loopContext;
		this.loopContext = ctx.upper;
		const fork = this.forkContext;
		const broken = this.popBreakContext().brokenForkContext;
		switch (ctx.type) {
			case "WhileStatement":
			case "ForStatement":
				this.popChoiceContext();
				makeLooped(this, fork.head, ctx.continueDestSegments);
				break;
			case "DoWhileStatement":
				this._handleDoWhileLoop(ctx, fork, broken);
				break;
			case "ForInStatement":
			case "ForOfStatement":
				broken.add(fork.head);
				makeLooped(this, fork.head, ctx.leftSegments);
				break;
			/* c8 ignore next */
			default:
				throw new Error("unreachable");
		}
		if (broken.empty) {
			fork.replaceHead(fork.makeUnreachable(-1, -1));
		} else {
			fork.replaceHead(broken.makeNext(0, -1));
		}
	}

	/**
	 * Handles the specific logic for a DoWhile loop.
	 * @private
	 */
	_handleDoWhileLoop(context, fork, broken) {
		const choice = this.popChoiceContext();
		if (!choice.processed) {
			choice.trueForkContext.add(fork.head);
			choice.falseForkContext.add(fork.head);
		}
		if (context.test !== true) {
			broken.addAll(choice.falseForkContext);
		}
		const segmentsList = choice.trueForkContext.segmentsList;
		for (let i = 0; i < segmentsList.length; ++i) {
			makeLooped(this, segmentsList[i], context.entrySegments);
		}
	}

	/** @returns {void} */
	makeWhileTest(test) {
		const ctx = this.loopContext;
		const fork = this.forkContext;
		const testSegments = fork.makeNext(0, -1);
		ctx.test = test;
		ctx.continueDestSegments = testSegments;
		fork.replaceHead(testSegments);
	}

	/** @returns {void} */
	makeWhileBody() {
		const ctx = this.loopContext;
		const choice = this.choiceContext;
		const fork = this.forkContext;
		if (!choice.processed) {
			choice.trueForkContext.add(fork.head);
			choice.falseForkContext.add(fork.head);
		}
		if (ctx.test !== true) {
			ctx.brokenForkContext.addAll(choice.falseForkContext);
		}
		fork.replaceHead(choice.trueForkContext.makeNext(0, -1));
	}

	/** @returns {void} */
	makeDoWhileBody() {
		const ctx = this.loopContext;
		const fork = this.forkContext;
		const bodySegments = fork.makeNext(-1, -1);
		ctx.entrySegments = bodySegments;
		fork.replaceHead(bodySegments);
	}

	/** @returns {void} */
	makeDoWhileTest(test) {
		const ctx = this.loopContext;
		const fork = this.forkContext;
		ctx.test = test;
		if (!ctx.continueForkContext.empty) {
			ctx.continueForkContext.add(fork.head);
			const testSegments = ctx.continueForkContext.makeNext(0, -1);
			fork.replaceHead(testSegments);
		}
	}

	/** @returns {void} */
	makeForTest(test) {
		const ctx = this.loopContext;
		const fork = this.forkContext;
		const initEnd = fork.head;
		const testSegments = fork.makeNext(-1, -1);
		ctx.test = test;
		ctx.endOfInitSegments = initEnd;
		ctx.continueDestSegments = ctx.testSegments = testSegments;
		fork.replaceHead(testSegments);
	}

	/** @returns {void} */
	makeForUpdate() {
		const ctx = this.loopContext;
		const choice = this.choiceContext;
		const fork = this.forkContext;
		if (ctx.testSegments) {
			finalizeTestSegmentsOfFor(ctx, choice, fork.head);
		} else {
			ctx.endOfInitSegments = fork.head;
		}
		const updateSegments = fork.makeDisconnected(-1, -1);
		ctx.continueDestSegments = ctx.updateSegments = updateSegments;
		fork.replaceHead(updateSegments);
	}

	/** @returns {void} */
	makeForBody() {
		const ctx = this.loopContext;
		const choice = this.choiceContext;
		const fork = this.forkContext;

		if (ctx.updateSegments) {
			ctx.endOfUpdateSegments = fork.head;
			if (ctx.testSegments) {
				makeLooped(this, ctx.endOfUpdateSegments, ctx.testSegments);
			}
		} else if (ctx.testSegments) {
			finalizeTestSegmentsOfFor(ctx, choice, fork.head);
		} else {
			ctx.endOfInitSegments = fork.head;
		}

		let bodySegments = ctx.endOfTestSegments;
		if (!bodySegments) {
			const prev = ForkContext.newEmpty(fork);
			prev.add(ctx.endOfInitSegments);
			if (ctx.endOfUpdateSegments) {
				prev.add(ctx.endOfUpdateSegments);
			}
			bodySegments = prev.makeNext(0, -1);
		}
		ctx.continueDestSegments = ctx.continueDestSegments || bodySegments;
		fork.replaceHead(bodySegments);
	}

	/** @returns {void} */
	makeForInOfLeft() {
		const ctx = this.loopContext;
		const fork = this.forkContext;
		const leftSegments = fork.makeDisconnected(-1, -1);
		ctx.prevSegments = fork.head;
		ctx.leftSegments = ctx.continueDestSegments = leftSegments;
		fork.replaceHead(leftSegments);
	}

	/** @returns {void} */
	makeForInOfRight() {
		const ctx = this.loopContext;
		const fork = this.forkContext;
		const temp = ForkContext.newEmpty(fork);
		temp.add(ctx.prevSegments);
		const rightSegments = temp.makeNext(-1, -1);
		ctx.endOfLeftSegments = fork.head;
		fork.replaceHead(rightSegments);
	}

	/** @returns {void} */
	makeForInOfBody() {
		const ctx = this.loopContext;
		const fork = this.forkContext;
		const temp = ForkContext.newEmpty(fork);
		temp.add(ctx.endOfLeftSegments);
		const bodySegments = temp.makeNext(-1, -1);
		makeLooped(this, fork.head, ctx.leftSegments);
		ctx.brokenForkContext.add(fork.head);
		fork.replaceHead(bodySegments);
	}

	//--------------------------------------------------------------------------
	// Control Statements
	//--------------------------------------------------------------------------

	/** @returns {BreakContext} */
	pushBreakContext(breakable, label) {
		this.breakContext = new BreakContext(
			this.breakContext,
			breakable,
			label,
			this.forkContext,
		);
		return this.breakContext;
	}

	/** @returns {Object} */
	popBreakContext() {
		const ctx = this.breakContext;
		const fork = this.forkContext;
		this.breakContext = ctx.upper;
		if (!ctx.breakable) {
			const broken = ctx.brokenForkContext;
			if (!broken.empty) {
				broken.add(fork.head);
				fork.replaceHead(broken.makeNext(0, -1));
			}
		}
		return ctx;
	}

	/** @returns {void} */
	makeBreak(label) {
		const fork = this.forkContext;
		if (!fork.reachable) {
			return;
		}
		const ctx = getBreakContext(this, label);
		if (ctx) {
			ctx.brokenForkContext.add(fork.head);
		}
		/* c8 ignore next */
		fork.replaceHead(fork.makeUnreachable(-1, -1));
	}

	/** @returns {void} */
	makeContinue(label) {
		const fork = this.forkContext;
		if (!fork.reachable) {
			return;
		}
		const ctx = getContinueContext(this, label);
		if (ctx) {
			if (ctx.continueDestSegments) {
				makeLooped(this, fork.head, ctx.continueDestSegments);
				if (ctx.type === "ForInStatement" || ctx.type === "ForOfStatement") {
					ctx.brokenForkContext.add(fork.head);
				}
			} else {
				ctx.continueForkContext.add(fork.head);
			}
		}
		fork.replaceHead(fork.makeUnreachable(-1, -1));
	}

	/** @returns {void} */
	makeReturn() {
		const fork = this.forkContext;
		if (fork.reachable) {
			getReturnContext(this).returnedForkContext.add(fork.head);
			fork.replaceHead(fork.makeUnreachable(-1, -1));
		}
	}

	/** @returns {void} */
	makeThrow() {
		const fork = this.forkContext;
		if (fork.reachable) {
			getThrowContext(this).thrownForkContext.add(fork.head);
			fork.replaceHead(fork.makeUnreachable(-1, -1));
		}
	}

	/** @returns {void} */
	makeFinal() {
		const segs = this.currentSegments;
		if (segs.length > 0 && segs[0].reachable) {
			this.returnedForkContext.add(segs);
		}
	}
}

module.exports = CodePathState;