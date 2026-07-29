private void recvDecodingTables() throws IOException {
    final Data dataShadow = this.data;
    final boolean[] inUse = dataShadow.inUse;
    final byte[] pos = dataShadow.recvDecodingTables_pos;
    final byte[] selector = dataShadow.selector;
    final byte[] selectorMtf = dataShadow.selectorMtf;

    receiveInUse16(inUse);
    resetInUse(inUse);
    setInUseFrom16(inUse);
    makeMaps();

    final int alphaSize = this.nInUse + 2;

    receiveSelectors(selectorMtf, selector, pos);
    receiveLengths(alphaSize, selector);
    createHuffmanDecodingTables(alphaSize, selector.length);
  }

  /**
   * Receives the 16-bit in-use map from the stream.
   */
  private void receiveInUse16(boolean[] inUse) throws IOException {
    int inUse16 = 0;
    for (int i = 0; i < 16; i++) {
      if (bsGetBit()) {
        inUse16 |= 1 << i;
      }
    }
  }

  /**
   * Resets the in-use array to false for all 256 entries.
   */
  private void resetInUse(boolean[] inUse) {
    for (int i = 256; --i >= 0;) {
      inUse[i] = false;
    }
  }

  /**
   * Sets the in-use flags based on the 16-bit map.
   */
  private void setInUseFrom16(boolean[] inUse) throws IOException {
    for (int i = 0; i < 16; i++) {
      if ((this.data.inUse16 & (1 << i)) != 0) {
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
   * Receives the selector MTF values and converts them to actual selectors.
   */
  private void receiveSelectors(byte[] selectorMtf, byte[] selector, byte[] pos)
      throws IOException {
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

  /**
   * Receives the Huffman coding tables for each group.
   */
  private void receiveLengths(int alphaSize, byte[] selector) throws IOException {
    final char[][] len = this.data.temp_charArray2d;

    for (int t = 0; t < selector.length; t++) {
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

  /**
   * Creates the Huffman decoding tables for all groups.
   */
  private void createHuffmanDecodingTables(int alphaSize, int nGroups) {
    final Data dataShadow = this.data;
    final char[][] len = dataShadow.temp_charArray2d;
    final int[] minLens = dataShadow.minLens;
    final int[][] limit = dataShadow.limit;
    final int[][] base = dataShadow.base;
    final int[][] perm = dataShadow.perm;

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
      hbCreateDecodeTables(limit[t], base[t], perm[t], len[t], minLen,
          maxLen, alphaSize);
      minLens[t] = minLen;
    }
  }