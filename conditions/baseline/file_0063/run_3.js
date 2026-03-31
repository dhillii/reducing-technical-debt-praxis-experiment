```javascript
/**
 * @fileoverview A class to manage state of generating a code path.
 * @author Toru Nagashima
 */

"use strict";

const CodePathSegment = require("./code-path-segment");
const ForkContext = require("./fork-context");

//-----------------------------------------------------------------------------
// Context Classes
//-----------------------------------------------------------------------------

class BreakContext {
	constructor(upperContext, breakable, label, forkContext) {
		this.upper = upperContext;
		this.breakable = breakable;
		this.label = label;
		this.brokenForkContext = ForkContext.newEmpty(forkContext);
	}
}

class ChainContext {
	constructor(upperContext) {
		this.upper = upperContext;
		this.choiceContextCount = 0;
	}
}

class ChoiceContext {
	constructor(upperContext, kind, isForkingAsResult, forkContext) {
		this.upper = upperContext;
		this.kind = kind;
		this.isForkingAsResult = isForkingAsResult;
		this.trueForkContext = ForkContext.newEmpty(forkContext);
		this.falseForkContext = ForkContext.newEmpty(forkContext);
		this.nullishForkContext = ForkContext.newEmpty(forkContext);
		this.processed = false;
	}
}

class LoopContextBase {
	constructor(upperContext, type, label, breakContext) {
		this.upper = upperContext;
		this.type = type;
		this.label = label;
		this.brokenForkContext = breakContext.brokenForkContext;
	}
}

class WhileLoopContext extends LoopContextBase {
	constructor(upperContext, label, breakContext) {
		super(upperContext, "WhileStatement", label, breakContext);
		this.test = void 0;
		this.continueDestSegments = null;
	}
}

class DoWhileLoopContext extends LoopContextBase {
	constructor(upperContext, label, breakContext, forkContext) {
		super(upperContext, "DoWhileStatement", label, breakContext);
		this.test = void 0;
		this.entrySegments = null;
		this.continueForkContext = ForkContext.newEmpty(forkContext);
	}
}

class ForLoopContext extends LoopContextBase {
	constructor(upperContext, label, breakContext) {
		super(upperContext, "ForStatement", label, breakContext);
		this.test = void 0;
		this.endOfInitSegments = null;
		this.testSegments = null;
		this.endOfTestSegments = null;
		this.updateSegments = null;
		this.endOfUpdateSegments = null;
		this.continueDestSegments = null;
	}
}

class ForInLoopContext extends LoopContextBase {
	constructor(upperContext, label, breakContext) {
		super(upperContext, "ForInStatement", label, breakContext);
		this.prevSegments = null;
		this.leftSegments = null;
		this.endOfLeftSegments = null;
		this.continueDestSegments = null;
	}
}

class ForOfLoopContext extends LoopContextBase {
	constructor(upperContext, label, breakContext) {
		super(upperContext, "ForOfStatement", label, breakContext);
		this.prevSegments = null;
		this.leftSegments = null;
		this.endOfLeftSegments = null;
		this.continueDestSegments = null;
	}
}

class SwitchContext {
	constructor(upperContext, hasCase) {
		this.upper = upperContext;
		this.hasCase = hasCase;
		this.defaultSegments = null;
		this.defaultBodySegments = null;
		this.foundEmptyDefault = false;
		this.lastIsDefault = false;
		this.forkCount = 0;
	}
}

class TryContext {
	constructor(upperContext, hasFinalizer, forkContext) {
		this.upper = upperContext;
		this.hasFinalizer = hasFinalizer;
		this.position = "try";
		this.returnedForkContext = hasFinalizer
			? ForkContext.newEmpty(forkContext)
			: null;
		this.thrownForkContext = ForkContext.newEmpty(forkContext);
		this.lastOfTryIsReachable = false;
		this.lastOfCatchIsReachable = false;
	}
}

//------------------------------------------------------------------------------
// Helper Functions
//------------------------------------------------------------------------------

function addToReturnedOrThrown(dest, others, all, segments) {
	for (let i = 0; i < segments.length; ++i) {
		const segment = segments[i];
		dest.push(segment);
		if (!others.includes(segment)) {
			all.push(segment);
		}
	}
}

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

	return null;
}

function getBreakContext(state, label) {
	let context = state.breakContext;
	while (context) {
		if (label ? context.label === label : context.breakable) {
			return context;
		}
		context = context.upper;
	}

	return null;
}

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

function removeFromArray(elements, value) {
	elements.splice(elements.indexOf(value), 1);
}

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
// CodePathState Class
//------------------------------------------------------------------------------

class CodePathState {
	constructor(idGenerator, onLooped) {
		this.idGenerator = idGenerator;
		this.notifyLooped = onLooped;
		this.forkContext = ForkContext.newRoot(idGenerator);
		this.choiceContext = null;
		this.switchContext = null;
		this.tryContext = null;
		this.loopContext = null;
		this.breakContext = null;
		this.chainContext = null;
		this.currentSegments = [];
		this.initialSegment = this.forkContext.head[0];
		this.finalSegments = [];
		this.returnedForkContext = [];
		this.thrownForkContext = [];

		const final = this.finalSegments;
		const returned = this.returnedForkContext;
		const thrown = this.thrownForkContext;

		returned.add = addToReturnedOrThrown.bind(null, returned, thrown, final);
		thrown.add = addToReturnedOrThrown.bind(null, thrown, returned, final);
	}

	get headSegments() {
		return this.forkContext.head;
	}

	get parentForkContext() {
		const current = this.forkContext;
		return current && current.upper;
	}

	pushForkContext(forkLeavingPath) {
		this.forkContext = ForkContext.newEmpty(
			this.forkContext,
			forkLeavingPath,
		);
		return this.forkContext;
	}

	popForkContext() {
		const lastContext = this.forkContext;
		this.forkContext = lastContext.upper;
		this.forkContext.replaceHead(lastContext.makeNext(0, -1));
		return lastContext;
	}

	forkPath() {
		this.forkContext.add(this.parentForkContext.makeNext(-1, -1));
	}

	forkBypassPath() {
		this.forkContext.add(this.parentForkContext.head);
	}

	pushChoiceContext(kind, isForkingAsResult) {
		this.choiceContext = new ChoiceContext(
			this.choiceContext,
			kind,
			isForkingAsResult,
			this.forkContext,
		);
	}

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

	makeIfAlternate() {
		const context = this.choiceContext;
		const forkContext = this.forkContext;

		context.trueForkContext.clear();
		context.trueForkContext.add(forkContext.head);
		context.processed = true;

		forkContext.replaceHead(context.falseForkContext.makeNext(0, -1));
	}

	pushChainContext() {
		this.chainContext = new ChainContext(this.chainContext);
	}

	popChainContext() {
		const context = this.chainContext;
		this.chainContext = context.upper;

		for (let i = context.choiceContextCount; i > 0; --i) {
			this.popChoiceContext();
		}
	}

	makeOptionalNode() {
		if (this.chainContext) {
			this.chainContext.choiceContextCount += 1;
			this.pushChoiceContext("??", false);
		}
	}

	makeOptionalRight() {