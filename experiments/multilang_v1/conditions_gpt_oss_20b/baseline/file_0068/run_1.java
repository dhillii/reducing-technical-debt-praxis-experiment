private void recvDecodingTables() throws IOException {
    final Data dataShadow = this.data;
    final boolean[] inUse = dataShadow.inUse;
    final byte[] pos = dataShadow.recvDecodingTables_pos;
    final byte[] selector = dataShadow.selector;
    final byte[] selectorMtf = dataShadow.selectorMtf;

    readInUseTable(inUse);
    makeMaps();
    final int alphaSize = this.nInUse + 2;

    int[] groupsAndSelectors = readSelectors(selectorMtf, selector, pos);
    int nGroups = groupsAndSelectors[0];
    int nSelectors = groupsAndSelectors[1];

    readCodingTables(nGroups, alphaSize, dataShadow.temp_charArray2d);

    createHuffmanDecodingTables(alphaSize, nGroups);
}

private void readInUseTable(boolean[] inUse) throws IOException {
    int inUse16 = 0;
    for (int i = 0; i < 16; i++) {
        if (bsGetBit()) {
            inUse16 |= 1 << i;
        }
    }
    for (int i = 255; i >= 0; i--) {
        inUse[i] = false;
    }
    for (int i = 0; i < 16; i++) {
        if ((inUse16 & (1 << i)) != 0) {
            int i16 = i << 4;
            for (int j = 0; j < 16; j++) {
                if (bsGetBit()) {
                    inUse[i16 + j] = true;
                }
            }
        }
    }
}

private int[] readSelectors(byte[] selectorMtf, byte[] selector, byte[] pos) throws IOException {
    int nGroups = (int) bsR(3);
    int nSelectors = (int) bsR(15);
    for (int i = 0; i < nSelectors; i++) {
        int j = 0;
        while (bsGetBit()) {
            j++;
        }
        selectorMtf[i] = (byte) j;
    }
    undoMtf(pos, selectorMtf, selector, nGroups, nSelectors);
    return new int[]{nGroups, nSelectors};
}

private void undoMtf(byte[] pos, byte[] selectorMtf, byte[] selector, int nGroups, int nSelectors) {
    for (int v = nGroups; --v >= 0;) {
        pos[v] = (byte) v;
    }
    for (int i = 0; i < nSelectors; i++) {
        int v = selectorMtf[i] & 0xff;
        byte tmp = pos[v];
        while (v > 0) {
            pos[v] = pos[v - 1];
            v--;
        }
        pos[0] = tmp;
        selector[i] = tmp;
    }
}

private void readCodingTables(int nGroups, int alphaSize, char[][] len) throws IOException {
    for (int t = 0; t < nGroups; t++) {
        int curr = (int) bsR(5);
        char[] len_t = len[t];
        for (int i = 0; i < alphaSize; i++) {
            while (bsGetBit()) {
                curr += bsGetBit() ? -1 : 1;
            }
            len_t[i] = (char) curr;
        }
    }
}