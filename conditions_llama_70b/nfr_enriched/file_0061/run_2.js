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