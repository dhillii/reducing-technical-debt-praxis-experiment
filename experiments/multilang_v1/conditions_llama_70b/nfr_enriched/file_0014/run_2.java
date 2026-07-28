protected static void hbMakeCodeLengths(char[] len, int[] freq, int alphaSize, int maxLen) {
    // Create a heap and initialize the weights
    final int[] heap = new int[MAX_ALPHA_SIZE * 2];
    final int[] weight = new int[MAX_ALPHA_SIZE * 2];
    final int[] parent = new int[MAX_ALPHA_SIZE * 2];

    initializeWeights(weight, freq, alphaSize);

    // Build the heap
    buildHeap(heap, weight, parent, alphaSize);

    // Merge nodes until only one is left
    mergeNodes(heap, weight, parent, alphaSize, maxLen, len);

    // If the codes are too long, reduce the weights and retry
    reduceWeightsIfNecessary(weight, freq, alphaSize, maxLen, len);
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

private static void mergeNodes(int[] heap, int[] weight, int[] parent, int alphaSize, int maxLen, char[] len) {
    while (heap.length > 1) {
        int n1 = heap[1];
        heap[1] = heap[heap.length - 1];
        heap[heap.length - 1] = n1;
        heap = Arrays.copyOf(heap, heap.length - 1);

        int yy = 0;
        int zz = 1;
        int tmp = heap[1];

        while (true) {
            yy = zz << 1;

            if (yy > heap.length - 1) {
                break;
            }

            if ((yy < heap.length - 1) && (weight[heap[yy + 1]] < weight[heap[yy]])) {
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
        heap[1] = heap[heap.length - 1];
        heap[heap.length - 1] = n2;
        heap = Arrays.copyOf(heap, heap.length - 1);

        yy = 0;
        zz = 1;
        tmp = heap[1];

        while (true) {
            yy = zz << 1;

            if (yy > heap.length - 1) {
                break;
            }

            if ((yy < heap.length - 1) && (weight[heap[yy + 1]] < weight[heap[yy]])) {
                yy++;
            }

            if (weight[tmp] < weight[heap[yy]]) {
                break;
            }

            heap[zz] = heap[yy];
            zz = yy;
        }

        heap[zz] = tmp;
        alphaSize++;
        parent[n1] = parent[n2] = alphaSize;

        final int weight_n1 = weight[n1];
        final int weight_n2 = weight[n2];
        weight[alphaSize] = (((weight_n1 & 0xffffff00) + (weight_n2 & 0xffffff00)) | (1 + (((weight_n1 & 0x000000ff) > (weight_n2 & 0x000000ff)) ? (weight_n1 & 0x000000ff) : (weight_n2 & 0x000000ff))));

        parent[alphaSize] = -1;
        nHeap++;
        heap = Arrays.copyOf(heap, heap.length + 1);
        heap[nHeap] = alphaSize;

        tmp = 0;
        zz = nHeap;
        tmp = heap[zz];
        final int weight_tmp = weight[tmp];
        while (weight_tmp < weight[heap[zz >> 1]]) {
            heap[zz] = heap[zz >> 1];
            zz >>= 1;
        }
        heap[zz] = tmp;
    }

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

private static void reduceWeightsIfNecessary(int[] weight, int[] freq, int alphaSize, int maxLen, char[] len) {
    boolean tooLong = false;
    for (int i = 1; i <= alphaSize; i++) {
        if (len[i - 1] > maxLen) {
            tooLong = true;
        }
    }

    if (tooLong) {
        for (int i = 1; i < alphaSize; i++) {
            int j = weight[i] >> 8;
            j = 1 + (j >> 1);
            weight[i] = j << 8;
        }
        // Recursively call hbMakeCodeLengths
        hbMakeCodeLengths(len, freq, alphaSize, maxLen);
    }
}