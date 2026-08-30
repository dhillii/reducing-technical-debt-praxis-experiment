private boolean isBitSet(int value, int bitIndex) {
    return (value & (1 << bitIndex)) != 0;
}

private void setBitIfPresent(int[] inUse16, boolean[] inUse, int i, int offset) {
    if (isBitSet(inUse16[0], i)) {
        int i16 = i << 4;
        for (int j = 0; j < 16; j++) {
            if (bsGetBit()) {
                inUse[i16 + j] = true;
            }
        }
    }
}

private int getSelectorMTFValue() throws IOException {
    int j = 0;
    while (bsGetBit()) {
        j++;
    }
    return j;
}

private void undoSelectorMTF(byte[] pos, byte[] selectorMtf, byte[] selector, int i) {
    int v = selectorMtf[i] & 0xff;
    byte tmp = pos[v];
    while (v > 0) {
        pos[v] = pos[v - 1];
        v--;
    }
    pos[0] = tmp;
    selector[i] = tmp;
}

private void decodeGroupLengths(char[][] len, int alphaSize, int t) throws IOException {
    int curr = (int) bsR(5);
    char[] len_t = len[t];
    for (int i = 0; i < alphaSize; i++) {
        while (bsGetBit()) {
            curr += bsGetBit() ? -1 : 1;
        }
        len_t[i] = (char) curr;
    }
}

private boolean isGroupPositionZero(int groupPos) {
    return groupPos == 0;
}

private void advanceToNextGroup(int[] groupNo, int[] groupPos, byte[] selector, int[][] base, int[][] limit, int[][] perm, int[] minLens) {
    groupPos[0] = G_SIZE - 1;
    int zt = selector[++groupNo[0]] & 0xff;
    base[0] = base[zt];
    limit[0] = limit[zt];
    perm[0] = perm[zt];
    minLens[0] = minLens[zt];
}

private boolean isValidStreamByte(int thech) throws IOException {
    if (thech < 0) {
        throw new IOException("unexpected end of stream");
    }
    return true;
}

private boolean shouldProcessRun(int nextSym) {
    return nextSym == RUNA || nextSym == RUNB;
}

private int processRunSymbol(int nextSym, int n, int[] s) {
    if (nextSym == RUNA) {
        s[0] += n;
    } else if (nextSym == RUNB) {
        s[0] += n << 1;
    }
    return s[0];
}

private boolean isNextSymGreaterThanEob(int nextSym, int eob) {
    return nextSym > eob;
}

private boolean isGroupPosGreaterThanZero(int groupPos) {
    return groupPos > 0;
}

private boolean isNextSymLessThanOrEqualTo16(int nextSym) {
    return nextSym <= 16;
}

private void handleEobCondition() throws IOException {
    endBlock();
    if (readMode == READ_MODE.CONTINUOUS) {
        initBlock();
        setupBlock();
    } else if (readMode == READ_MODE.BYBLOCK) {
        currentState = STATE.NO_PROCESS_STATE;
    }
}

private void advanceThroughZN(int zn, int groupPos, int[] groupNo, byte[] selector, int[][] base, int[][] limit, int[][] perm, int[] minLens, byte[] ll8, int[] unzftab, byte[] seqToUnseq, char[] yy, int[] bsBuffShadow, int[] bsLiveShadow, InputStream inShadow, int lastShadow, int eob) throws IOException {
    int[] baseZt = new int[1];
    int[] limitZt = new int[1];
    int[] permZt = new int[1];
    int[] minLensZt = new int[1];
    baseZt[0] = base[selector[groupNo[0]] & 0xff];
    limitZt[0] = limit[selector[groupNo[0]] & 0xff];
    permZt[0] = perm[selector[groupNo[0]] & 0xff];
    minLensZt[0] = minLens[selector[groupNo[0]] & 0xff];

    while (bsLiveShadow[0] < zn) {
        int thech = readAByte(inShadow);
        if (isValidStreamByte(thech)) {
            bsBuffShadow[0] = (bsBuffShadow[0] << 8) | thech;
            bsLiveShadow[0] += 8;
            continue;
        }
    }

    long zvec = (bsBuffShadow[0] >> (bsLiveShadow[0] - zn)) & ((1 << zn) - 1);
    bsLiveShadow[0] -= zn;

    while (zvec > limitZt[0][zn]) {
        zn++;
        while (bsLiveShadow[0] < 1) {
            int thech = readAByte(inShadow);
            if (isValidStreamByte(thech)) {
                bsBuffShadow[0] = (bsBuffShadow[0] << 8) | thech;
                bsLiveShadow[0] += 8;
                continue;
            }
        }
        bsLiveShadow[0]--;
        zvec = (zvec << 1) | ((bsBuffShadow[0] >> bsLiveShadow[0]) & 1);
    }

    int nextSym = permZt[0][(int) (zvec - baseZt[0][zn])];
    processDecodedSymbol(nextSym, groupPos, groupNo, selector, base, limit, perm, minLens, ll8, unzftab, seqToUnseq, yy, bsBuffShadow, bsLiveShadow, inShadow, lastShadow, eob);
}

private void processDecodedSymbol(int nextSym, int groupPos, int[] groupNo, byte[] selector, int[][] base, int[][] limit, int[][] perm, int[] minLens, byte[] ll8, int[] unzftab, byte[] seqToUnseq, char[] yy, int[] bsBuffShadow, int[] bsLiveShadow, InputStream inShadow, int lastShadow, int eob) throws IOException {
    if (shouldProcessRun(nextSym)) {
        int[] s = new int[1];
        s[0] = -1;

        for (int n = 1; true; n <<= 1) {
            processRunSymbol(nextSym, n, s);
            if (!shouldProcessRun(nextSym = getAndMoveToFrontDecode0(groupNo[0]))) {
                break;
            }

            if (isGroupPositionZero(groupPos)) {
                advanceToNextGroup(groupNo, groupPos, selector, base, limit, perm, minLens);
            } else {
                groupPos--;
            }

            int zn = minLens[selector[groupNo[0]] & 0xff];
            advanceThroughZN(zn, groupPos, groupNo, selector, base, limit, perm, minLens, ll8, unzftab, seqToUnseq, yy, bsBuffShadow, bsLiveShadow, inShadow, lastShadow, eob);
        }

        final byte ch = seqToUnseq[yy[0]];
        unzftab[ch & 0xff] += s[0] + 1;

        for (int i = 0; i <= s[0]; i++) {
            ll8[++lastShadow] = ch;
        }

        if (lastShadow >= blockSizes100kTimes100k()) {
            throw new IOException("block overrun");
        }
    } else {
        if (++lastShadow >= blockSizes100kTimes100k()) {
            throw new IOException("block overrun");
        }

        final char tmp = yy[nextSym - 1];
        unzftab[seqToUnseq[tmp] & 0xff]++;
        ll8[lastShadow] = seqToUnseq[tmp];

        if (isNextSymLessThanOrEqualTo16(nextSym)) {
            for (int j = nextSym - 1; j > 0;) {
                yy[j] = yy[--j];
            }
        } else {
            System.arraycopy(yy, 0, yy, 1, nextSym - 1);
        }

        yy[0] = tmp;

        if (isGroupPositionZero(groupPos)) {
            advanceToNextGroup(groupNo, groupPos, selector, base, limit, perm, minLens);
        } else {
            groupPos--;
        }

        int zn = minLens[selector[groupNo[0]] & 0xff];

        while (bsLiveShadow[0] < zn) {
            int thech = readAByte(inShadow);
            if (isValidStreamByte(thech)) {
                bsBuffShadow[0] = (bsBuffShadow[0] << 8) | thech;
                bsLiveShadow[0] += 8;
                continue;
            }
        }
        int zvec = (bsBuffShadow[0] >> (bsLiveShadow[0] - zn)) & ((1 << zn) - 1);
        bsLiveShadow[0] -= zn;

        while (zvec > limit[selector[groupNo[0]] & 0xff][zn]) {
            zn++;
            while (bsLiveShadow[0] < 1) {
                int thech = readAByte(inShadow);
                if (isValidStreamByte(thech)) {
                    bsBuffShadow[0] = (bsBuffShadow[0] << 8) | thech;
                    bsLiveShadow[0] += 8;
                    continue;
                }
            }
            bsLiveShadow[0]--;
            zvec = ((zvec << 1) | ((bsBuffShadow[0] >> bsLiveShadow[0]) & 1));
        }
        nextSym = perm[selector[groupNo[0]] & 0xff][zvec - base[selector[groupNo[0]] & 0xff][zn]];

        processDecodedSymbol(nextSym, groupPos, groupNo, selector, base, limit, perm, minLens, ll8, unzftab, seqToUnseq, yy, bsBuffShadow, bsLiveShadow, inShadow, lastShadow, eob);
    }
}

private int blockSizes100kTimes100k() {
    return blockSize100k * 100000;
}

private void recvDecodingTables() throws IOException {
    final Data dataShadow = this.data;
    final boolean[] inUse = dataShadow.inUse;
    final byte[] pos = dataShadow.recvDecodingTables_pos;
    final byte[] selector = dataShadow.selector;
    final byte[] selectorMtf = dataShadow.selectorMtf;

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
        setBitIfPresent(new int[]{inUse16}, inUse, i, i << 4);
    }

    makeMaps();
    final int alphaSize = this.nInUse + 2;

    final int nGroups = (int) bsR(3);
    final int nSelectors = (int) bsR(15);

    for (int i = 0; i < nSelectors; i++) {
        selectorMtf[i] = (byte) getSelectorMTFValue();
    }

    for (int v = nGroups; --v >= 0;) {
        pos[v] = (byte) v;
    }

    for (int i = 0; i < nSelectors; i++) {
        undoSelectorMTF(pos, selectorMtf, selector, i);
    }

    final char[][] len = dataShadow.temp_charArray2d;

    for (int t = 0; t < nGroups; t++) {
        decodeGroupLengths(len, alphaSize, t);
    }

    createHuffmanDecodingTables(alphaSize, nGroups);
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

            if (isValidStreamByte(thech)) {
                bsBuffShadow = (bsBuffShadow << 8) | thech;
                bsLiveShadow += 8;
                continue;
            }
        }
        bsLiveShadow--;
        zvec = (zvec << 1) | ((bsBuffShadow >> bsLiveShadow) & 1);
    }

    this.bsLive = bsLiveShadow;
    this.bsBuff = bsBuffShadow;

    return dataShadow.perm[zt][zvec - dataShadow.base[zt][zn]];
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

    for (int i = 256; --i >= 0;) {
        yy[i] = (char) i;
        unzftab[i] = 0;
    }

    int[] groupNo = new int[1];
    int groupPos = G_SIZE - 1;
    final int eob = this.nInUse + 1;
    int nextSym = getAndMoveToFrontDecode0(0);
    int[] bsBuffShadow = new int[]{(int) this.bsBuff};
    int[] bsLiveShadow = new int[]{(int) this.bsLive};
    int lastShadow = -1;
    int[] base_zt = new int[1];
    int[] limit_zt = new int[1];
    int[] perm_zt = new int[1];
    int[] minLens_zt = new int[1];

    while (nextSym != eob) {
        if (shouldProcessRun(nextSym)) {
            int[] s = new int[1];

            for (int n = 1; true; n <<= 1) {
                if (processRunSymbol(nextSym, n, s) < 0) {
                    break;
                }

                if (isGroupPositionZero(groupPos)) {
                    groupPos = G_SIZE - 1;
                    base_zt[0] = base[selector[++groupNo[0]] & 0xff];
                    limit_zt[0] = limit[selector[groupNo[0]] & 0xff];
                    perm_zt[0] = perm[selector[groupNo[0]] & 0xff];
                    minLens_zt[0] = minLens[selector[groupNo[0]] & 0xff];
                } else {
                    groupPos--;
                }

                int zn = minLens_zt[0];

                while (bsLiveShadow[0] < zn) {
                    final int thech = readAByte(inShadow);
                    if (isValidStreamByte(thech)) {
                        bsBuffShadow[0] = (bsBuffShadow[0] << 8) | thech;
                        bsLiveShadow[0] += 8;
                        continue;
                    }
                }
                long zvec = (bsBuffShadow[0] >> (bsLiveShadow[0] - zn))
                    & ((1 << zn) - 1);
                bsLiveShadow[0] -= zn;

                while (zvec > limit_zt[0][zn]) {
                    zn++;
                    while (bsLiveShadow[0] < 1) {
                        final int thech = readAByte(inShadow);
                        if (isValidStreamByte(thech)) {
                            bsBuffShadow[0] = (bsBuffShadow[0] << 8) | thech;
                            bsLiveShadow[0] += 8;
                            continue;
                        }
                    }
                    bsLiveShadow[0]--;
                    zvec = (zvec << 1)
                        | ((bsBuffShadow[0] >> bsLiveShadow[0]) & 1);
                }
                nextSym = perm_zt[0][(int) (zvec - base_zt[0][zn])];
            }

            final byte ch = seqToUnseq[yy[0]];
            unzftab[ch & 0xff] += s[0] + 1;

            while (s[0]-- >= 0) {
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

            if (isNextSymLessThanOrEqualTo16(nextSym)) {
                for (int j = nextSym - 1; j > 0;) {
                    yy[j] = yy[--j];
                }
            } else {
                System.arraycopy(yy, 0, yy, 1, nextSym - 1);
            }

            yy[0] = tmp;

            if (isGroupPositionZero(groupPos)) {
                groupPos = G_SIZE - 1;
                base_zt[0] = base[selector[++groupNo[0]] & 0xff];
                limit_zt[0] = limit[selector[groupNo[0]] & 0xff];
                perm_zt[0] = perm[selector[groupNo[0]] & 0xff];
                minLens_zt[0] = minLens[selector[groupNo[0]] & 0xff];
            } else {
                groupPos--;
            }

            int zn = minLens_zt[0];

            while (bsLiveShadow[0] < zn) {
                final int thech = readAByte(inShadow);
                if (isValidStreamByte(thech)) {
                    bsBuffShadow[0] = (bsBuffShadow[0] << 8) | thech;
                    bsLiveShadow[0] += 8;
                    continue;
                }
            }
            int zvec = (bsBuffShadow[0] >> (bsLiveShadow[0] - zn))
                & ((1 << zn) - 1);
            bsLiveShadow[0] -= zn;

            while (zvec > limit_zt[0][zn]) {
                zn++;
                while (bsLiveShadow[0] < 1) {
                    final int thech = readAByte(inShadow);
                    if (isValidStreamByte(thech)) {
                        bsBuffShadow[0] = (bsBuffShadow[0] << 8) | thech;
                        bsLiveShadow[0] += 8;
                        continue;
                    }
                }
                bsLiveShadow[0]--;
                zvec = ((zvec << 1) | ((bsBuffShadow[0] >> bsLiveShadow[0]) & 1));
            }
            nextSym = perm_zt[0][zvec - base_zt[0][zn]];
        }
    }

    this.last = lastShadow;
    this.bsLive = bsLiveShadow[0];
    this.bsBuff = bsBuffShadow[0];
}