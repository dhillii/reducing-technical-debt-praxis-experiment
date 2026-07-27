/**
 * A class which manages state to analyze code paths.
 */
class CodePathState {
    // ...

    /**
     * Pops the last context of a TryStatement and finalizes it.
     * @returns {void}
     */
    popTryContext() {
        const context = this.tryContext;

        this.tryContext = context.upper;

        const originalReturnedForkContext = context.returnedForkContext;
        const originalThrownForkContext = context.thrownForkContext;

        // no `return` or `throw` in `try` or `catch` so there's nothing left to do
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

        // Forwards the leaving path to upper contexts.
        if (!originalReturnedForkContext.empty) {
            getReturnContext(this).returnedForkContext.add(leavingSegments);
        }
        if (!originalThrownForkContext.empty) {
            getThrowContext(this).thrownForkContext.add(leavingSegments);
        }

        // Sets the normal path as the next.
        this.forkContext.replaceHead(normalSegments);

        // ...
    }

    // ...
}