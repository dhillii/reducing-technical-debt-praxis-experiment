}
  }

  private void recvDecodingTables() throws IOException {
    final Data dataShadow = this.data;
    final boolean[] inUse = dataShadow.inUse;
    final byte[] pos = dataShadow.recvDecodingTables_pos;
    final byte[] selector = dataShadow.selector;
    final byte[] selectorMtf = dataShadow.selectorMtf;

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

    makeMaps();
    final int alphaSize = this.nInUse + 2;

    /* Now the selectors */
    final int nGroups = (int) bsR(3);
    final int nSelectors = (int) bsR(15);

    receiveSelectors(selectorMtf, nSelectors);
    undoSelectorMTF(selectorMtf, selector, pos, nSelectors, nGroups);

    final char[][] len = dataShadow.temp_charArray2d;

    /* Now the coding tables */
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

    // finally create the Huffman tables
    createHuffmanDecodingTables(alphaSize, nGroups);
  }

  private void receiveSelectors(byte[] selectorMtf, int nSelectors) throws IOException {
    for (int i = 0; i < nSelectors; i++) {
      int j = 0;
      while (bsGetBit()) {
        j++;
      }
      selectorMtf[i] = (byte) j;
    }
  }

  private void undoSelectorMTF(byte[] selectorMtf, byte[] selector, byte[] pos, int nSelectors, int nGroups) {
    for (int v = nGroups; --v >= 0;) {
      pos[v] = (byte) v;
    }

    for (int i = 0; i < nSelectors; i++) {
      int v = selectorMtf[i] & 0xff;
      final byte tmp = pos[v];
      while (v > 0) {
        // nearly all times v is zero, 4 in most other cases
        pos[v] = pos[v - 1];
        v--;
      }
      pos[0] = tmp;
      selector[i] = tmp;
    }
  }

  /**
  * Called by recvDecodingTables() exclusively.
  */
  private void createHuffmanDecodingTables(final int alphaSize,
      final int nGroups) {
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

  private void getAndMoveToFrontDecode() throws IOException {
    this.origPtr = (int) bsR(24);
    recvDecodingTables();

    final InputStream inShadow = this.in;
    final Data dataShadow = this.data;
    final byte[] ll8 = dataShadow.ll8;
    final int[] unzftab = dataShadow.unzftab;
    final byte[] selector = dataShadow.selector;
    final byte[] seqToUnseq = dataShadow.seqToUnseq;
    final char[] yy = dataShadow.getAndMoveToFrontDecode_yy;
    final int[] minLens = dataShadow.minLens;
    final int[][] limit = dataShadow.limit;
    final int[][] base = dataShadow.base;
    final int[][] perm = dataShadow.perm;
    final int limitLast = this.blockSize100k * 100000;

    /*
    * Setting up the unzftab entries here is not strictly necessary, but it
    * does save having to do it later in a separate pass, and so saves a
    * block's worth of cache misses.
    */
    for (int i = 256; --i >= 0;) {
      yy[i] = (char) i;
      unzftab[i] = 0;
    }

    int groupNo = 0;
    int groupPos = G_SIZE - 1;
    final int eob = this.nInUse + 1;
    int nextSym = getAndMoveToFrontDecode0(0);
    int bsBuffShadow = (int) this.bsBuff;
    int bsLiveShadow = (int) this.bsLive;
    int lastShadow = -1;
    int zt = selector[groupNo] & 0xff;
    int[] base_zt = base[zt];
    int[] limit_zt = limit[zt];
    int[] perm_zt = perm[zt];
    int minLens_zt = minLens[zt];

    while (nextSym != eob) {
      if ((nextSym == RUNA) || (nextSym == RUNB)) {
        int s = -1;

        for (int n = 1; true; n <<= 1) {
          if (nextSym == RUNA) {
            s += n;
          } else if (nextSym == RUNB) {
            s += n << 1;
          } else {
            break;
          }

          if (groupPos == 0) {
            groupPos = G_SIZE - 1;
            zt = selector[++groupNo] & 0xff;
            base_zt = base[zt];
            limit_zt = limit[zt];
            perm_zt = perm[zt];
            minLens_zt = minLens[zt];
          } else {
            groupPos--;
          }

          int zn = minLens_zt;

          while (bsLiveShadow < zn) {
            final int thech = readAByte(inShadow);
            if (thech >= 0) {
              bsBuffShadow = (bsBuffShadow << 8) | thech;
              bsLiveShadow += 8;
              continue;
            } else {
              throw new IOException("unexpected end of stream");
            }
          }
          long zvec = (bsBuffShadow >> (bsLiveShadow - zn))
              & ((1 << zn) - 1);
          bsLiveShadow -= zn;

          while (zvec > limit_zt[zn]) {
            zn++;
            while (bsLiveShadow < 1) {
              final int thech = readAByte(inShadow);
              if (thech >= 0) {
                bsBuffShadow = (bsBuffShadow << 8) | thech;
                bsLiveShadow += 8;
                continue;
              } else {
                throw new IOException(
                    "unexpected end of stream");
              }
            }
            bsLiveShadow--;
            zvec = (zvec << 1)
                | ((bsBuffShadow >> bsLiveShadow) & 1);
          }
          nextSym = perm_zt[(int) (zvec - base_zt[zn])];
        }

        final byte ch = seqToUnseq[yy[0]];
        unzftab[ch & 0xff] += s + 1;

        while (s-- >= 0) {
          ll8[++lastShadow] = ch;
        }

        if (lastShadow >= limitLast) {
          throw new IOException("block overrun");
        }
      } else {
        if (++lastShadow >= limitLast) {
          throw new IOException("block overrun");
        }

        final char tmp = yy[nextSym - 1];
        unzftab[seqToUnseq[tmp] & 0xff]++;
        ll8[lastShadow] = seqToUnseq[tmp];

        /*
        * This loop is hammered during decompression, hence avoid
        * native method call overhead of System.arraycopy for very
        * small ranges to copy.
        */
        if (nextSym <= 16) {
          for (int j = nextSym - 1; j > 0;) {
            yy[j] = yy[--j];
          }
        } else {
          System.arraycopy(yy, 0, yy, 1, nextSym - 1);
        }

        yy[0] = tmp;

        if (groupPos == 0) {
          groupPos = G_SIZE - 1;
          zt = selector[++groupNo] & 0xff;
          base_zt = base[zt];
          limit_zt = limit[zt];
          perm_zt = perm[zt];
          minLens_zt = minLens[zt];
        } else {
          groupPos--;
        }

        int zn = minLens_zt;

        while (bsLiveShadow < zn) {
          final int thech = readAByte(inShadow);
          if (thech >= 0) {
            bsBuffShadow = (bsBuffShadow << 8) | thech;
            bsLiveShadow += 8;
            continue;
          } else {
            throw new IOException("unexpected end of stream");
          }
        }
        int zvec = (bsBuffShadow >> (bsLiveShadow - zn))
            & ((1 << zn) - 1);
        bsLiveShadow -= zn;

        while (zvec > limit_zt[zn]) {
          zn++;
          while (bsLiveShadow < 1) {
            final int thech = readAByte(inShadow);
            if (thech >= 0) {
              bsBuffShadow = (bsBuffShadow << 8) | thech;
              bsLiveShadow += 8;
              continue;
            } else {
              throw new IOException("unexpected end of stream");
            }
          }
          bsLiveShadow--;
          zvec = ((zvec << 1) | ((bsBuffShadow >> bsLiveShadow) & 1));
        }
        nextSym = perm_zt[zvec - base_zt[zn]];
      }
    }

    this.last = lastShadow;
    this.bsLive = bsLiveShadow;
    this.bsBuff = bsBuffShadow;
  }

  private int getAndMoveToFrontDecode0(final int groupNo) throws IOException {
    final InputStream inShadow = this.in;
    final Data dataShadow = this.data;
    final int zt = dataShadow.selector[groupNo] & 0xff;
    final int[] limit_zt = dataShadow.limit[zt];
    int zn = dataShadow.minLens[zt];
    int zvec = (int) bsR(zn);
    int bsLiveShadow = (int) this.bsLive;
    int bsBuffShadow = (int) this.bsBuff;

    while (zvec > limit_zt[zn]) {
      zn++;
      while (bsLiveShadow < 1) {
        final int thech = readAByte(inShadow);

        if (thech >= 0) {
          bsBuffShadow = (bsBuffShadow << 8) | thech;
          bsLiveShadow += 8;
          continue;
        } else {
          throw new IOException("unexpected end of stream");
        }
      }
      bsLiveShadow--;
      zvec = (zvec << 1) | ((bsBuffShadow >> bsLiveShadow) & 1);
    }

    this.bsLive = bsLiveShadow;
    this.bsBuff = bsBuffShadow;

    return dataShadow.perm[zt][zvec - dataShadow.base[zt][zn]];
  }

  private void setupBlock() throws IOException {
    if (this.data == null) {
      return;
    }

    final int[] cftab = this.data.cftab;
    final int[] tt = this.data.initTT(this.last + 1);
    final byte[] ll8 = this.data.ll8;
    cftab[0] = 0;
    System.arraycopy(this.data.unzftab, 0, cftab, 1, 256);

    for (int i = 1, c = cftab[0]; i <= 256; i++) {
      c += cftab[i];
      cftab[i] = c;
    }

    for (int i = 0, lastShadow = this.last; i <= lastShadow; i++) {
      tt[cftab[ll8[i] & 0xff]++] = i;
    }

    if ((this.origPtr < 0) || (this.origPtr >= tt.length)) {
      throw new IOException("stream corrupted");
    }

    this.su_tPos = tt[this.origPtr];
    this.su_count = 0;
    this.su_i2 = 0;
    this.su_ch2 = 256; /* not a char and not EOF */

    if (this.blockRandomised) {
      this.su_rNToGo = 0;
      this.su_rTPos = 0;
      setupRandPartA();
    } else {
      setupNoRandPartA();
    }
  }

  private void setupRandPartA() throws IOException {
    if (this.su_i2 <= this.last) {
      this.su_chPrev = this.su_ch2;
      int su_ch2Shadow = this.data.ll8[this.su_tPos] & 0xff;
      this.su_tPos = this.data.tt[this.su_tPos];
      if (this.su_rNToGo == 0) {
        this.su_rNToGo = BZip2Constants.rNums[this.su_rTPos] - 1;
        if (++this.su_rTPos == 512) {
          this.su_rTPos = 0;
        }
      } else {
        this.su_rNToGo--;
      }
      this.su_ch2 = su_ch2Shadow ^= (this.su_rNToGo == 1) ? 1 : 0;
      this.su_i2++;
      this.currentChar = su_ch2Shadow;
      this.currentState = STATE.RAND_PART_B_STATE;
      this.crc.updateCRC(su_ch2Shadow);
    } else {
      endBlock();
      if (readMode == READ_MODE.CONTINUOUS) {
      initBlock();
      setupBlock();
      } else if (readMode == READ_MODE.BYBLOCK) {
        this.currentState = STATE.NO_PROCESS_STATE;
      }
    }
  }

  private void setupNoRandPartA() throws IOException {
    if (this.su_i2 <= this.last) {
      this.su_chPrev = this.su_ch2;
      int su_ch2Shadow = this.data.ll8[this.su_tPos] & 0xff;
      this.su_ch2 = su_ch2Shadow;
      this.su_tPos = this.data.tt[this.su_tPos];
      this.su_i2++;
      this.currentChar = su_ch2Shadow;
      this.currentState = STATE.NO_RAND_PART_B_STATE;
      this.crc.updateCRC(su_ch2Shadow);
    } else {
      this.currentState = STATE.NO_RAND_PART_A_STATE;
      endBlock();
      if (readMode == READ_MODE.CONTINUOUS) {
      initBlock();
      setupBlock();
      } else if (readMode == READ_MODE.BYBLOCK) {
        this.currentState = STATE.NO_PROCESS_STATE;
      }
    }
  }

  private void setupRandPartB() throws IOException {
    if (this.su_ch2 != this.su_chPrev) {
      this.currentState = STATE.RAND_PART_A_STATE;
      this.su_count = 1;
      setupRandPartA();
    } else if (++this.su_count >= 4) {
      this.su_z = (char) (this.data.ll8[this.su_tPos] & 0xff);
      this.su_tPos = this.data.tt[this.su_tPos];
      if (this.su_rNToGo == 0) {
        this.su_rNToGo = BZip2Constants.rNums[this.su_rTPos] - 1;
        if (++this.su_rTPos == 512) {
          this.su_rTPos = 0;
        }
      } else {
        this.su_rNToGo--;
      }
      this.su_j2 = 0;
      this.currentState = STATE.RAND_PART_C_STATE;
      if (this.su_rNToGo == 1) {
        this.su_z ^= 1;
      }
      setupRandPartC();
    } else {
      this.currentState = STATE.RAND_PART_A_STATE;
      setupRandPartA();
    }
  }

  private void setupRandPartC() throws IOException {
    if (this.su_j2 < this.su_z) {
      this.currentChar = this.su_ch2;
      this.crc.updateCRC(this.su_ch2);
      this.su_j2++;
    } else {
      this.currentState = STATE.RAND_PART_A_STATE;
      this.su_i2++;
      this.su_count = 0;
      setupRandPartA();
    }
  }

  private void setupNoRandPartB() throws IOException {
    if (this.su_ch2 != this.su_chPrev) {
      this.su_count = 1;
      setupNoRandPartA();
    } else if (++this.su_count >= 4) {
      this.su_z = (char) (this.data.ll8[this.su_tPos] & 0xff);
      this.su_tPos = this.data.tt[this.su_tPos];
      this.su_j2 = 0;
      setupNoRandPartC();
    } else {
      setupNoRandPartA();
    }
  }

  private void setupNoRandPartC() throws IOException {
    if (this.su_j2 < this.su_z) {
      int su_ch2Shadow = this.su_ch2;
      this.currentChar = su_ch2Shadow;
      this.crc.updateCRC(su_ch2Shadow);
      this.su_j2++;
      this.currentState = STATE.NO_RAND_PART_C_STATE;
    } else {
      this.su_i2++;
      this.su_count = 0;
      setupNoRandPartA();
    }
  }

  private static final class Data extends Object {

    // (with blockSize 900k)
    final boolean[] inUse = new boolean[256]; // 256 byte

    final byte[] seqToUnseq = new byte[256]; // 256 byte
    final byte[] selector = new byte[MAX_SELECTORS]; // 18002 byte
    final byte[] selectorMtf = new byte[MAX_SELECTORS]; // 18002 byte

    /**
    * Freq table collected to save a pass over the data during
    * decompression.
    */
    final int[] unzftab = new int[256]; // 1024 byte

    final int[][] limit = new int[N_GROUPS][MAX_ALPHA_SIZE]; // 6192 byte
    final int[][] base = new int[N_GROUPS][MAX_ALPHA_SIZE]; // 6192 byte
    final int[][] perm = new int[N_GROUPS][MAX_ALPHA_SIZE]; // 6192 byte
    final int[] minLens = new int[N_GROUPS]; // 24 byte

    final int[] cftab = new int[257]; // 1028 byte
    final char[] getAndMoveToFrontDecode_yy = new char[256]; // 512 byte
    final char[][] temp_charArray2d = new char[N_GROUPS][MAX_ALPHA_SIZE]; // 3096
                                        // byte
    final byte[] recvDecodingTables_pos = new byte[N_GROUPS]; // 6 byte
    // ---------------
    // 60798 byte

    int[] tt; // 3600000 byte
    byte[] ll8; // 900000 byte

    // ---------------
    // 4560782 byte
    // ===============

    Data(int blockSize100k) {
      super();

      this.ll8 = new byte[blockSize100k * BZip2Constants.baseBlockSize];
    }

    /**
    * Initializes the {@link #tt} array.
    *
    * This method is called when the required length of the array is known.
    * I don't initialize it at construction time to avoid unneccessary
    * memory allocation when compressing small files.
    */
    final int[] initTT(int length) {
      int[] ttShadow = this.tt;

      // tt.length should always be >= length, but theoretically
      // it can happen, if the compressor mixed small and large
      // blocks. Normally only the last block will be smaller
      // than others.
      if ((ttShadow == null) || (ttShadow.length < length)) {
        this.tt = ttShadow = new int[length];
      }

      return ttShadow;
    }

  }
}