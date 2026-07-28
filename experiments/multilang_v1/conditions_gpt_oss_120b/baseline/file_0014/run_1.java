package org.apache.tools.bzip2;

import java.io.IOException;
import java.io.OutputStream;
import java.util.Comparator;
import java.util.PriorityQueue;

/* ... rest of the class unchanged ... */

public class CBZip2OutputStream extends OutputStream
    implements BZip2Constants {

    /* ... other members unchanged ... */

    protected static void hbMakeCodeLengths(char[] len, int[] freq,
                                            int alphaSize, int maxLen) {
        final int[] weight = new int[MAX_ALPHA_SIZE * 2];
        final int[] parent = new int[MAX_ALPHA_SIZE * 2];

        // initialise weights
        for (int i = alphaSize; --i >= 0;) {
            weight[i + 1] = (freq[i] == 0 ? 1 : freq[i]) << 8;
        }

        while (true) {
            // reset parent array for this iteration
            for (int i = 0; i <= alphaSize * 2; i++) {
                parent[i] = -1;
            }

            // build Huffman tree using a priority queue
            PriorityQueue<Integer> pq = new PriorityQueue<>(Comparator.comparingInt(i -> weight[i]));
            for (int i = 1; i <= alphaSize; i++) {
                pq.add(i);
            }

            int nNodes = alphaSize;
            while (pq.size() > 1) {
                int n1 = pq.poll();
                int n2 = pq.poll();
                nNodes++;
                parent[n1] = parent[n2] = nNodes;

                int w1 = weight[n1];
                int w2 = weight[n2];
                int combined = ((w1 & 0xffffff00) + (w2 & 0xffffff00))
                        | (1 + Math.max(w1 & 0xff, w2 & 0xff));
                weight[nNodes] = combined;
                parent[nNodes] = -1;
                pq.add(nNodes);
            }

            // compute code lengths and check for overflow
            boolean tooLong = false;
            for (int i = 1; i <= alphaSize; i++) {
                int depth = 0;
                int k = i;
                while ((k = parent[k]) >= 0) {
                    depth++;
                }
                len[i - 1] = (char) depth;
                if (depth > maxLen) {
                    tooLong = true;
                }
            }

            if (!tooLong) {
                break;
            }

            // adjust weights and repeat
            for (int i = 1; i < alphaSize; i++) {
                int w = weight[i] >> 8;
                w = 1 + (w >> 1);
                weight[i] = w << 8;
            }
        }
    }

    /* ... rest of the class unchanged ... */
}