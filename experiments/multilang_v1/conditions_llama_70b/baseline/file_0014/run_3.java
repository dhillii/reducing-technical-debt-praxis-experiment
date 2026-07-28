protected static void hbMakeCodeLengths(char[] len, int[] freq, int alphaSize, int maxLen) {
    final int[] heap = new int[MAX_ALPHA_SIZE * 2];
    final int[] weight = new int[MAX_ALPHA_SIZE * 2];
    final int[] parent = new int[MAX_ALPHA_SIZE * 2];

    initializeWeights(weight, freq, alphaSize);

    buildHeap(heap, weight, parent, alphaSize);

    buildHuffmanTree(heap, weight, parent, alphaSize, maxLen);

    calculateCodeLengths(len, parent, alphaSize, maxLen);
}

private static void initializeWeights(int[] weight, int[] freq, int alphaSize) {
    for (int i = alphaSize; --i >= 0;) {
        weight[i + 1] = (freq[i] == 0 ? 1 : freq[i]) << 8;
    }
}

private static void buildHeap(int[] heap, int[] weight, int[] parent, int alphaSize) {
    int nNodes = alphaSize;
    int nHeap = 0;
    heap[0] = 0;
    weight[0] = 0;
    parent[0] = -2;

    for (int i = 1; i <= alphaSize; i++) {
        parent[i] = -1;
        nHeap++;
        heap[nHeap] = i;

        int zz = nHeap;
        int tmp = heap[zz];
        while (weight[tmp] < weight[heap[zz >> 1]]) {
            heap[zz] = heap[zz >> 1];
            zz >>= 1;
        }
        heap[zz] = tmp;
    }
}

private static void buildHuffmanTree(int[] heap, int[] weight, int[] parent, int alphaSize, int maxLen) {
    boolean tooLong = true;
    while (tooLong) {
        tooLong = false;

        int nHeap = alphaSize;
        while (nHeap > 1) {
            int n1 = heap[1];
            heap[1] = heap[nHeap];
            nHeap--;

            int yy = 0;
            int zz = 1;
            int tmp = heap[1];

            while (true) {
                yy = zz << 1;

                if (yy > nHeap) {
                    break;
                }

                if ((yy < nHeap) && (weight[heap[yy + 1]] < weight[heap[yy]])) {
                    yy++;
                }

                if (weight[tmp] < weight[heap[yy]]) {
                    break;
                }

                heap[zz] = heap[yy];
                zz = yy;
            }

            heap[zz] = tmp;

            int n2 = heap[1];
            heap[1] = heap[nHeap];
            nHeap--;

            yy = 0;
            zz = 1;
            tmp = heap[1];

            while (true) {
                yy = zz << 1;

                if (yy > nHeap) {
                    break;
                }

                if ((yy < nHeap) && (weight[heap[yy + 1]] < weight[heap[yy]])) {
                    yy++;
                }

                if (weight[tmp] < weight[heap[yy]]) {
                    break;
                }

                heap[zz] = heap[yy];
                zz = yy;
            }

            heap[zz] = tmp;
            nHeap++;
            heap[nHeap] = n1;

            tmp = 0;
            zz = nHeap;
            tmp = heap[zz];
            final int weight_tmp = weight[tmp];
            while (weight_tmp < weight[heap[zz >> 1]]) {
                heap[zz] = heap[zz >> 1];
                zz >>= 1;
            }
            heap[zz] = tmp;

            n1 = heap[1];
            heap[1] = heap[nHeap];
            nHeap--;

            yy = 0;
            zz = 1;
            tmp = heap[1];

            while (true) {
                yy = zz << 1;

                if (yy > nHeap) {
                    break;
                }

                if ((yy < nHeap) && (weight[heap[yy + 1]] < weight[heap[yy]])) {
                    yy++;
                }

                if (weight[tmp] < weight[heap[yy]]) {
                    break;
                }

                heap[zz] = heap[yy];
                zz = yy;
            }

            heap[zz] = tmp;

            int nNodes = alphaSize;
            nNodes++;
            parent[n1] = parent[n2] = nNodes;

            final int weight_n1 = weight[n1];
            final int weight_n2 = weight[n2];
            weight[nNodes] = (((weight_n1 & 0xffffff00) + (weight_n2 & 0xffffff00)) | (1 + (((weight_n1 & 0x000000ff) > (weight_n2 & 0x000000ff)) ? (weight_n1 & 0x000000ff) : (weight_n2 & 0x000000ff))));

            parent[nNodes] = -1;
            nHeap++;
            heap[nHeap] = nNodes;

            tmp = 0;
            zz = nHeap;
            tmp = heap[zz];
            final int weight_tmp2 = weight[tmp];
            while (weight_tmp2 < weight[heap[zz >> 1]]) {
                heap[zz] = heap[zz >> 1];
                zz >>= 1;
            }
            heap[zz] = tmp;
        }

        calculateCodeLengths(len, parent, alphaSize, maxLen);

        if (tooLong) {
            for (int i = 1; i < alphaSize; i++) {
                int j = weight[i] >> 8;
                j = 1 + (j >> 1);
                weight[i] = j << 8;
            }
        }
    }

    private static void calculateCodeLengths(char[] len, int[] parent, int alphaSize, int maxLen) {
        for (int i = 1; i <= alphaSize; i++) {
            int j = 0;
            int k = i;

            for (int parent_k; (parent_k = parent[k]) >= 0;) {
                k = parent_k;
                j++;
            }

            len[i - 1] = (char) j;
        }
    }