private void recvDecodingTables() throws IOException {
    final Data dataShadow = this.data;
    final boolean[] inUse = dataShadow.inUse;
    final byte[] pos = dataShadow.recvDecodingTables_pos;
    final byte[] selector = dataShadow.selector;
    final byte[] selectorMtf = dataShadow.selectorMtf;

    // Receive the mapping table
    receiveMappingTable(inUse);

    // Create maps
    makeMaps();

    // Receive the selectors
    receiveSelectors(selectorMtf, selector);

    // Receive the coding tables
    receiveCodingTables(dataShadow.temp_charArray2d);

    // Create Huffman decoding tables
    createHuffmanDecodingTables(dataShadow.temp_charArray2d, dataShadow.limit, dataShadow.base, dataShadow.perm, dataShadow.minLens);
}

private void receiveMappingTable(final boolean[] inUse) throws IOException {
    int inUse16 = 0;

    // Receive the mapping table
    for (int i = 0; i < 16; i++) {
        if (bsGetBit()) {
            inUse16 |= 1 << i;
        }
    }

    for (int i = 256; --i >= 0;) {
        inUse[i] = false;
    }

    for (int i = 0; i < 16; i++) {
        if ((inUse16 & (1 << i)) != 0) {
            final int i16 = i << 4;
            for (int j = 0; j < 16; j++) {
                if (bsGetBit()) {
                    inUse[i16 + j] = true;
                }
            }
        }
    }
}

private void receiveSelectors(final byte[] selectorMtf, final byte[] selector) throws IOException {
    final int nGroups = (int) bsR(3);
    final int nSelectors = (int) bsR(15);

    for (int i = 0; i < nSelectors; i++) {
        int j = 0;
        while (bsGetBit()) {
            j++;
        }
        selectorMtf[i] = (byte) j;
    }

    // Undo the MTF values for the selectors.
    for (int v = nGroups; --v >= 0;) {
        selector[v] = (byte) v;
    }

    for (int i = 0; i < nSelectors; i++) {
        int v = selectorMtf[i] & 0xff;
        final byte tmp = selector[v];
        while (v > 0) {
            selector[v] = selector[v - 1];
            v--;
        }
        selector[0] = tmp;
    }
}

private void receiveCodingTables(final char[][] len) throws IOException {
    final int nGroups = (int) bsR(3);
    final int alphaSize = this.nInUse + 2;

    // Receive the coding tables
    for (int t = 0; t < nGroups; t++) {
        int curr = (int) bsR(5);
        final char[] len_t = len[t];
        for (int i = 0; i < alphaSize; i++) {
            while (bsGetBit()) {
                curr += bsGetBit() ? -1 : 1;
            }
            len_t[i] = (char) curr;
        }
    }
}

private void createHuffmanDecodingTables(final char[][] len, final int[][] limit, final int[][] base, final int[][] perm, final int[] minLens) {
    final int nGroups = len.length;
    final int alphaSize = this.nInUse + 2;

    for (int t = 0; t < nGroups; t++) {
        int minLen = 32;
        int maxLen = 0;
        final char[] len_t = len[t];
        for (int i = alphaSize; --i >= 0;) {
            final char lent = len_t[i];
            if (lent > maxLen) {
                maxLen = lent;
            }
            if (lent < minLen) {
                minLen = lent;
            }
        }
        hbCreateDecodeTables(limit[t], base[t], perm[t], len[t], minLen, maxLen, alphaSize);
        minLens[t] = minLen;
    }
}