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