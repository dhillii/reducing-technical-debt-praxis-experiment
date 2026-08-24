this.forkContext = this.forkContext.upper;
		const normalSegments = headSegments.slice(
			0,
			mathTruncate(headSegments.length / 2),
		);
		const leavingSegments = headSegments.slice(
			mathTruncate(headSegments.length / 2),
		);

/**
 * Truncates a number toward zero (same as `Math.trunc`).
 * @param {number} value The number to truncate.
 * @returns {number} The truncated integer.
 */
function mathTruncate(value) {
	return value | 0;
}