private void recvDecodingTables() throws IOException {
    final Data dataShadow = this.data;
    final boolean[] inUse = dataShadow.inUse;
    final byte[] pos = dataShadow.recvDecodingTables_pos;
    final byte[] selector = dataShadow.selector;
    final byte[] selectorMtf = dataShadow.selectorMtf;

    int inUse16 = readInUse16();
    resetInUse(inUse);
    setInUseFromInUse16(inUse, inUse16);

    makeMaps();
    final int alphaSize = this.nInUse + 2;

    final int nGroups = (int) bsR(3);
    final int nSelectors = (int) bsR(15);

    readSelectors(selectorMtf, nSelectors);
    undoMtfSelectors(pos, nGroups, selectorMtf, selector);

    final char[][] len = dataShadow.temp_charArray2d;
    readCodingTables(len, nGroups, alphaSize);

    createHuffmanDecodingTables(alphaSize, nGroups);
}

/**
 * Reads the 16-bit in-use map from the bitstream.
 *
 * @return the 16-bit mask representing which 16-byte blocks are in use
 * @throws IOException if an I/O error occurs
 */
private int readInUse16() throws IOException {
    int mask = 0;
    for (int i = 0; i < 16; i++) {
        if (bsGetBit()) {
            mask |= 1 << i;
        }
    }
    return mask;
}

/**
 * Resets the {@code inUse} array to {@code false}.
 *
 * @param inUse the array to reset
 */
private void resetInUse(boolean[] inUse) {
    for (int i = 256; --i >= 0;) {
        inUse[i] = false;
    }
}

/**
 * Sets {@code inUse} entries based on the 16-bit mask.
 *
 * @param inUse   the array to update
 * @param inUse16 the 16-bit mask
 * @throws IOException if an I/O error occurs
 */
private void setInUseFromInUse16(boolean[] inUse, int inUse16) throws IOException {
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

/**
 * Reads the selector MTF values from the bitstream.
 *
 * @param selectorMtf the array to populate
 * @param nSelectors the number of selectors
 * @throws IOException if an I/O error occurs
 */
private void readSelectors(byte[] selectorMtf, int nSelectors) throws IOException {
    for (int i = 0; i < nSelectors; i++) {
        int j = 0;
        while (bsGetBit()) {
            j++;
        }
        selectorMtf[i] = (byte) j;
    }
}

/**
 * Undoes the MTF encoding for the selectors.
 *
 * @param pos          the temporary position array
 * @param nGroups      the number of groups
 * @param selectorMtf  the MTF-encoded selector array
 * @param selector     the final selector array
 */
private void undoMtfSelectors(byte[] pos, int nGroups, byte[] selectorMtf, byte[] selector) {
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
        selector[i] = tmp;
    }
}

/**
 * Reads the Huffman coding tables for each group.
 *
 * @param len       the 2D array to store lengths
 * @param nGroups   the number of groups
 * @param alphaSize the alphabet size
 * @throws IOException if an I/O error occurs
 */
private void readCodingTables(char[][] len, int nGroups, int alphaSize) throws IOException {
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