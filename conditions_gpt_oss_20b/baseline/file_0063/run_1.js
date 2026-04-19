"use strict";

const CodePathSegment = require("./code-path-segment"),
	ForkContext = require("./fork-context");

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
		returned.add = addToReturnedOrThrown.bind(
			null,
			returned,
			thrown,
			final,
		);
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
		if (this.chainContext) {
			this.makeLogicalRight();
		}
	}
	pushSwitchContext(hasCase, label) {
		this.switchContext = new SwitchContext(this.switchContext, hasCase);
		this.pushBreakContext(true, label);
	}
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
	pushTryContext(hasFinalizer) {
		this.tryContext = new TryContext(
			this.tryContext,
			hasFinalizer,
			this.forkContext,
		);
	}
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
	makeWhileTest(test) {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const testSegments = forkContext.makeNext(0, -1);
		context.test = test;
		context.continueDestSegments = testSegments;
		forkContext.replaceHead(testSegments);
	}
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
	makeDoWhileBody() {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const bodySegments = forkContext.makeNext(-1, -1);
		context.entrySegments = bodySegments;
		forkContext.replaceHead(bodySegments);
	}
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
	makeForInOfLeft() {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const leftSegments = forkContext.makeDisconnected(-1, -1);
		context.prevSegments = forkContext.head;
		context.leftSegments = context.continueDestSegments = leftSegments;
		forkContext.replaceHead(leftSegments);
	}
	makeForInOfRight() {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const temp = ForkContext.newEmpty(forkContext);
		temp.add(context.prevSegments);
		const rightSegments = temp.makeNext(-1, -1);
		context.endOfLeftSegments = forkContext.head;
		forkContext.replaceHead(rightSegments);
	}
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
	pushBreakContext(breakable, label) {
		this.breakContext = new BreakContext(
			this.breakContext,
			breakable,
			label,
			this.forkContext,
		);
		return this.breakContext;
	}
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
	makeReturn() {
		const forkContext = this.forkContext;
		if (forkContext.reachable) {
			getReturnContext(this).returnedForkContext.add(forkContext.head);
			forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
		}
	}
	makeThrow() {
		const forkContext = this.forkContext;
		if (forkContext.reachable) {
			getThrowContext(this).thrownForkContext.add(forkContext.head);
			forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
		}
	}
	makeFinal() {
		const segments = this.currentSegments;
		if (segments.length > 0 && segments[0].reachable) {
			this.returnedForkContext.add(segments);
		}
	}
}

module.exports = CodePathState;