import java.util.PriorityQueue;

protected static void hbMakeCodeLengths(char[] len, int[] freq,
                                        int alphaSize, int maxLen) {
    final int[] weight = new int[MAX_ALPHA_SIZE * 2];
    final int[] parent = new int[MAX_ALPHA_SIZE * 2];

    for (int i = alphaSize; --i >= 0;) {
        weight[i + 1] = (freq[i] == 0 ? 1 : freq[i]) << 8;
    }

    boolean tooLong;
    do {
        tooLong = false;
        int nNodes = alphaSize;
        PriorityQueue<Integer> pq = new PriorityQueue<>(Comparator.comparingInt(idx -> weight[idx]));

        for (int i = 1; i <= alphaSize; i++) {
            parent[i] = -1;
            pq.add(i);
        }

        while (pq.size() > 1) {
            int n1 = pq.poll();
            int n2 = pq.poll();
            nNodes++;
            parent[n1] = parent[n2] = nNodes;

            int w1 = weight[n1];
            int w2 = weight[n2];
            int high1 = w1 & 0xffffff00;
            int high2 = w2 & 0xffffff00;
            int low1 = w1 & 0x000000ff;
            int low2 = w2 & 0x000000ff;
            weight[nNodes] = (high1 + high2) | (1 + Math.max(low1, low2));
            parent[nNodes] = -1;
            pq.add(nNodes);
        }

        for (int i = 1; i <= alphaSize; i++) {
            int depth = 0;
            int k = i;
            while (parent[k] >= 0) {
                k = parent[k];
                depth++;
            }
            len[i - 1] = (char) depth;
            if (depth > maxLen) {
                tooLong = true;
            }
        }

        if (tooLong) {
            for (int i = 1; i < alphaSize; i++) {
                int w = weight[i];
                int newHigh = (w >> 8) + 1;
                weight[i] = newHigh << 8;
            }
        }
    } while (tooLong);
}