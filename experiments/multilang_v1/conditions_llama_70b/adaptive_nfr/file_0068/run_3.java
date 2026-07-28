private void recvDecodingTables() throws IOException {
    final Data dataShadow = this.data;
    final boolean[] inUse = dataShadow.inUse;
    final byte[] pos = dataShadow.recvDecodingTables_pos;
    final byte[] selector = dataShadow.selector;
    final byte[] selectorMtf = dataShadow.selectorMtf;

    if (!isInUseArrayInitialized(inUse)) {
        return;
    }

    int inUse16 = getInUse16(inUse);
    initializeInUseArray(inUse, inUse16);

    makeMaps();
    final int alphaSize = this.nInUse + 2;

    final int nGroups = getNGroups();
    final int nSelectors = getNSelectors(nGroups);

    initializeSelectors(selectorMtf, nSelectors);
    initializePosArray(pos, nGroups, selectorMtf);

    final char[][] len = dataShadow.temp_charArray2d;
    initializeLenArray(len, nGroups, alphaSize);

    createHuffmanDecodingTables(alphaSize, nGroups);
}

private boolean isInUseArrayInitialized(final boolean[] inUse) {
    for (int i = 0; i < 256; i++) {
        if (inUse[i]) {
            return true;
        }
    }
    return false;
}

private int getInUse16(final boolean[] inUse) {
    int inUse16 = 0;
    for (int i = 0; i < 16; i++) {
        if (bsGetBit()) {
            inUse16 |= 1 << i;
        }
    }
    return inUse16;
}

private void initializeInUseArray(final boolean[] inUse, int inUse16) {
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

private int getNGroups() {
    return (int) bsR(3);
}

private int getNSelectors(int nGroups) {
    return (int) bsR(15);
}

private void initializeSelectors(final byte[] selectorMtf, int nSelectors) {
    for (int i = 0; i < nSelectors; i++) {
        int j = 0;
        while (bsGetBit()) {
            j++;
        }
        selectorMtf[i] = (byte) j;
    }
}

private void initializePosArray(final byte[] pos, int nGroups, final byte[] selectorMtf) {
    for (int v = nGroups; --v >= 0;) {
        pos[v] = (byte) v;
    }

    for (int i = 0; i < selectorMtf.length; i++) {
        int v = selectorMtf[i] & 0xff;
        final byte tmp = pos[v];
        while (v > 0) {
            pos[v] = pos[v - 1];
            v--;
        }
        pos[0] = tmp;
    }
}

private void initializeLenArray(final char[][] len, int nGroups, int alphaSize) {
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