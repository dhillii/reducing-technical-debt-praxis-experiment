private void recvDecodingTables() throws IOException {
    final Data dataShadow = this.data;
    final boolean[] inUse = dataShadow.inUse;
    final byte[] pos = dataShadow.recvDecodingTables_pos;
    final byte[] selector = dataShadow.selector;
    final byte[] selectorMtf = dataShadow.selectorMtf;

    receiveInUseTable(inUse);
    makeMaps();
    final int alphaSize = this.nInUse + 2;

    int nGroups = receiveSelectors(selector, selectorMtf, pos);
    receiveHuffmanLengths(alphaSize, selector, nGroups);
    createHuffmanDecodingTables(alphaSize, nGroups);
  }

  /**
   * Receives the in-use table from the compressed stream.
   */
  private void receiveInUseTable(boolean[] inUse) throws IOException {
    int inUse16 = 0;
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

  /**
   * Receives the selector tables and performs MTF decoding.
   *
   * @return the number of groups (nGroups)
   */
  private int receiveSelectors(byte[] selector, byte[] selectorMtf, byte[] pos)
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
    return nGroups;
  }

  /**
   * Receives the Huffman coding tables for each group.
   */
  private void receiveHuffmanLengths(int alphaSize, byte[] selector, int nGroups)
      throws IOException {
    final Data dataShadow = this.data;
    final char[][] len = dataShadow.temp_charArray2d;

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