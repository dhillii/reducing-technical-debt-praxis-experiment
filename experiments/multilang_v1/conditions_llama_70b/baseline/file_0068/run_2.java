private void recvDecodingTables() throws IOException {
    final Data dataShadow = this.data;
    final boolean[] inUse = dataShadow.inUse;
    final byte[] pos = dataShadow.recvDecodingTables_pos;
    final byte[] selector = dataShadow.selector;
    final byte[] selectorMtf = dataShadow.selectorMtf;

    receiveMappingTable(inUse);
    makeMaps();
    receiveSelectors(selector, selectorMtf);
    receiveCodingTables(dataShadow);
}

private void receiveMappingTable(final boolean[] inUse) throws IOException {
    int inUse16 = 0;

    /* Receive the mapping table */
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

private void receiveSelectors(final byte[] selector, final byte[] selectorMtf) throws IOException {
    final int nGroups = (int) bsR(3);
    final int nSelectors = (int) bsR(15);

    for (int i = 0; i < nSelectors; i++) {
        int j = 0;
        while (bsGetBit()) {
            j++;
        }
        selectorMtf[i] = (byte) j;
    }

    /* Undo the MTF values for the selectors. */
    for (int v = nGroups; --v >= 0;) {
        pos[v] = (byte) v;
    }

    for (int i = 0; i < nSelectors; i++) {
        int v = selectorMtf[i] & 0xff;
        final byte tmp = pos[v];
        while (v > 0) {
            pos[v] = pos[v - 1];
            v--;
        }
        pos[0] = tmp;
        selector[i] = tmp;
    }
}

private void receiveCodingTables(final Data dataShadow) throws IOException {
    final char[][] len = dataShadow.temp_charArray2d;

    /* Now the coding tables */
    for (int t = 0; t < dataShadow.selector.length; t++) {
        int curr = (int) bsR(5);
        final char[] len_t = len[t];
        for (int i = 0; i < this.nInUse + 2; i++) {
            while (bsGetBit()) {
                curr += bsGetBit() ? -1 : 1;
            }
            len_t[i] = (char) curr;
        }
    }

    // finally create the Huffman tables
    createHuffmanDecodingTables(this.nInUse + 2, dataShadow.selector.length);
}