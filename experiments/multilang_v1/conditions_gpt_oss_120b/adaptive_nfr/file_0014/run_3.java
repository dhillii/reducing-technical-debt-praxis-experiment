/*
 *  Licensed to the Apache Software Foundation (ASF) under one or more
 *  contributor license agreements.  See the NOTICE file distributed with
 *  this work for additional information regarding copyright ownership.
 *  The ASF licenses this file to You under the Apache License, Version 2.0
 *  (the "License"); you may not use this file except in compliance with
 *  the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 *
 */

/*
 * This package is based on the work done by Keiron Liddle, Aftex Software
 * <keiron@aftexsw.com> to whom the Ant project is very grateful for his
 * great code.
 */

package org.apache.tools.bzip2;

import java.io.IOException;
import java.io.OutputStream;

/**
 * An output stream that compresses into the BZip2 format (without the file
 * header chars) into another stream.
 *
 * <p>
 * The compression requires large amounts of memory. Thus you should call the
 * {@link #close() close()} method as soon as possible, to force
 * <tt>CBZip2OutputStream</tt> to release the allocated memory.
 * </p>
 *
 * <p> You can shrink the amount of allocated memory and maybe raise
 * the compression speed by choosing a lower blocksize, which in turn
 * may cause a lower compression ratio. You can avoid unnecessary
 * memory allocation by avoiding using a blocksize which is bigger
 * than the size of the input.  </p>
 *
 * <p> You can compute the memory usage for compressing by the
 * following formula: </p>
 *
 * <pre>
 * &lt;code&gt;400k + (9 * blocksize)&lt;/code&gt;.
 * </pre>
 *
 * <p> To get the memory required for decompression by {@link
 * CBZip2InputStream CBZip2InputStream} use </p>
 *
 * <pre>
 * &lt;code&gt;65k + (5 * blocksize)&lt;/code&gt;.
 * </pre>
 *
 * <table width="100%" border="1">
 * <colgroup> <col width="33%" /> <col width="33%" /> <col width="33%" />
 * </colgroup>
 * <tr>
 * <th colspan="3">Memory usage by blocksize</th>
 * </tr>
 * <tr>
 * <th align="right">Blocksize</th> <th align="right">Compression<br>
 * memory usage</th> <th align="right">Decompression<br>
 * memory usage</th>
 * </tr>
 * <tr>
 * <td align="right">100k</td>
 * <td align="right">1300k</td>
 * <td align="right">565k</td>
 * </tr>
 * <tr>
 * <td align="right">200k</td>
 * <td align="right">2200k</td>
 * <td align="right">1065k</td>
 * </tr>
 * <tr>
 * <td align="right">300k</td>
 * <td align="right">3100k</td>
 * <td align="right">1565k</td>
 * </tr>
 * <tr>
 * <td align="right">400k</td>
 * <td align="right">4000k</td>
 * <td align="right">2065k</td>
 * </tr>
 * <tr>
 * <td align="right">500k</td>
 * <td align="right">4900k</td>
 * <td align="right">2565k</td>
 * </tr>
 * <tr>
 * <td align="right">600k</td>
 * <td align="right">5800k</td>
 * <td align="right">3065k</td>
 * </tr>
 * <tr>
 * <td align="right">700k</td>
 * <td align="right">6700k</td>
 * <td align="right">3565k</td>
 * </tr>
 * <tr>
 * <td align="right">800k</td>
 * <td align="right">7600k</td>
 * <td align="right">4065k</td>
 * </tr>
 * <tr>
 * <td align="right">900k</td>
 * <td align="right">8500k</td>
 * <td align="right">4565k</td>
 * </tr>
 * </table>
 *
 * <p>
 * For decompression <tt>CBZip2InputStream</tt> allocates less memory if the
 * bzipped input is smaller than one block.
 * </p>
 *
 * <p>
 * Instances of this class are not threadsafe.
 * </p>
 *
 * <p>
 * TODO: Update to BZip2 1.0.1
 * </p>
 *
 */
public class CBZip2OutputStream extends OutputStream
    implements BZip2Constants {

    /**
     * The minimum supported blocksize <tt> == 1</tt>.
     */
    public static final int MIN_BLOCKSIZE = 1;

    /**
     * The maximum supported blocksize <tt> == 9</tt>.
     */
    public static final int MAX_BLOCKSIZE = 9;

    /**
     * This constant is accessible by subclasses for historical
     * purposes. If you don't know what it means then you don't need
     * it.
     */
    protected static final int SETMASK = (1 << 21);

    /**
     * This constant is accessible by subclasses for historical
     * purposes. If you don't know what it means then you don't need
     * it.
     */
    protected static final int CLEARMASK = (~SETMASK);

    /**
     * This constant is accessible by subclasses for historical
     * purposes. If you don't know what it means then you don't need
     * it.
     */
    protected static final int GREATER_ICOST = 15;

    /**
     * This constant is accessible by subclasses for historical
     * purposes. If you don't know what it means then you don't need
     * it.
     */
    protected static final int LESSER_ICOST = 0;

    /**
     * This constant is accessible by subclasses for historical
     * purposes. If you don't know what it does then you don't need
     * it.
     */
    protected static final int SMALL_THRESH = 20;

    /**
     * This constant is accessible by subclasses for historical
     * purposes. If you don't know what it does then you don't need
     * it.
     */
    protected static final int DEPTH_THRESH = 10;

    /**
     * This constant is accessible by subclasses for historical
     * purposes. If you don't know what it does then you don't need
     * it.
     */
    protected static final int WORK_FACTOR = 30;

    /**
     * This constant is accessible by subclasses for historical
     * purposes. If you don't know what it does then you don't need
     * it.
     * <p> If you are ever unlucky/improbable enough to get a stack
     * overflow whilst sorting, increase the following constant and
     * try again. In practice I have never seen the stack go above 27
     * elems, so the following limit seems very generous.  </p>
     */
    protected static final int QSORT_STACK_SIZE = 1000;

    /**
     * Knuth's increments seem to work better than Incerpi-Sedgewick here.
     * Possibly because the number of elems to sort is usually small, typically
     * &lt;= 20.
     */
    private static final int[] INCS = { 1, 4, 13, 40, 121, 364, 1093, 3280,
                                        9841, 29524, 88573, 265720, 797161,
                                        2391484 };

    /**
     * Builds Huffman code lengths for a set of symbols.
     *
     * @param len       output array for code lengths
     * @param freq      frequency of each symbol
     * @param alphaSize number of symbols
     * @param maxLen    maximum allowed code length
     */
    protected static void hbMakeCodeLengths(char[] len, int[] freq,
                                            int alphaSize, int maxLen) {
        final int[] heap = new int[MAX_ALPHA_SIZE * 2];
        final int[] weight = new int[MAX_ALPHA_SIZE * 2];
        final int[] parent = new int[MAX_ALPHA_SIZE * 2];

        initialiseWeights(freq, weight, alphaSize);
        boolean tooLong = true;
        while (tooLong) {
            tooLong = false;
            initialiseHeapStructures(heap, weight, parent);
            buildInitialHeap(alphaSize, heap, weight, parent);
            while (heapSize(heap) > 1) {
                combineTwoSmallest(heap, weight, parent);
            }
            computeLengths(len, parent, alphaSize, maxLen);
            if (hasLengthExceeding(len, maxLen)) {
                tooLong = true;
                adjustWeightsForLongCodes(weight, alphaSize);
            }
        }
    }

    private static void initialiseWeights(int[] freq, int[] weight,
                                          int alphaSize) {
        for (int i = alphaSize; --i >= 0;) {
            weight[i + 1] = (freq[i] == 0 ? 1 : freq[i]) << 8;
        }
    }

    private static void initialiseHeapStructures(int[] heap, int[] weight,
                                                 int[] parent) {
        heap[0] = 0;
        weight[0] = 0;
        parent[0] = -2;
    }

    private static void buildInitialHeap(int alphaSize, int[] heap,
                                         int[] weight, int[] parent) {
        int nHeap = 0;
        for (int i = 1; i <= alphaSize; i++) {
            parent[i] = -1;
            nHeap++;
            heap[nHeap] = i;
            siftUp(heap, weight, nHeap);
        }
        setHeapSize(heap, nHeap);
    }

    private static void siftUp(int[] heap, int[] weight, int idx) {
        int zz = idx;
        int tmp = heap[zz];
        while (weight[tmp] < weight[heap[zz >> 1]]) {
            heap[zz] = heap[zz >> 1];
            zz >>= 1;
        }
        heap[zz] = tmp;
    }

    private static void combineTwoSmallest(int[] heap, int[] weight,
                                           int[] parent) {
        int nHeap = heapSize(heap);
        int n1 = heap[1];
        replaceRootWithLast(heap, nHeap);
        nHeap--;
        siftDown(heap, weight, 1, nHeap);
        int n2 = heap[1];
        replaceRootWithLast(heap, nHeap);
        nHeap--;
        siftDown(heap, weight, 1, nHeap);
        int newNode = ++parent[0]; // reuse parent[0] as node counter
        parent[n1] = parent[n2] = newNode;
        weight[newNode] = mergeWeight(weight[n1], weight[n2]);
        parent[newNode] = -1;
        nHeap++;
        heap[nHeap] = newNode;
        siftUp(heap, weight, nHeap);
        setHeapSize(heap, nHeap);
    }

    private static int mergeWeight(int w1, int w2) {
        int low1 = w1 & 0x000000ff;
        int low2 = w2 & 0x000000ff;
        int high = (w1 & 0xffffff00) + (w2 & 0xffffff00);
        int low = 1 + (low1 > low2 ? low1 : low2);
        return high | low;
    }

    private static void siftDown(int[] heap, int[] weight, int start,
                                 int heapSize) {
        int zz = start;
        int tmp = heap[zz];
        while (true) {
            int yy = zz << 1;
            if (yy > heapSize) {
                break;
            }
            if (hasRightChildSmaller(yy, heapSize, weight, heap)) {
                yy++;
            }
            if (weight[tmp] < weight[heap[yy]]) {
                break;
            }
            heap[zz] = heap[yy];
            zz = yy;
        }
        heap[zz] = tmp;
    }

    private static boolean hasRightChildSmaller(int leftIdx, int heapSize,
                                                int[] weight, int[] heap) {
        return (leftIdx < heapSize)
            && (weight[heap[leftIdx + 1]] < weight[heap[leftIdx]]);
    }

    private static void replaceRootWithLast(int[] heap, int heapSize) {
        heap[1] = heap[heapSize + 1];
    }

    private static int heapSize(int[] heap) {
        return heap[0];
    }

    private static void setHeapSize(int[] heap, int size) {
        heap[0] = size;
    }

    private static void computeLengths(char[] len, int[] parent,
                                       int alphaSize, int maxLen) {
        for (int i = 1; i <= alphaSize; i++) {
            int depth = 0;
            int k = i;
            while (parent[k] >= 0) {
                k = parent[k];
                depth++;
            }
            len[i - 1] = (char) depth;
        }
    }

    private static boolean hasLengthExceeding(char[] len, int maxLen) {
        for (char c : len) {
            if (c > maxLen) {
                return true;
            }
        }
        return false;
    }

    private static void adjustWeightsForLongCodes(int[] weight, int alphaSize) {
        for (int i = 1; i < alphaSize; i++) {
            int w = weight[i] >> 8;
            w = 1 + (w >> 1);
            weight[i] = w << 8;
        }
    }

    private static void hbMakeCodeLengths(final byte[] len, final int[] freq,
                                          final Data dat, final int alphaSize,
                                          final int maxLen) {
        /*
         * Nodes and heap entries run from 1. Entry 0 for both the heap and
         * nodes is a sentinel.
         */
        final int[] heap = dat.heap;
        final int[] weight = dat.weight;
        final int[] parent = dat.parent;

        for (int i = alphaSize; --i >= 0;) {
            weight[i + 1] = (freq[i] == 0 ? 1 : freq[i]) << 8;
        }

        for (boolean tooLong = true; tooLong;) {
            tooLong = false;

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

            while (nHeap > 1) {
                int n1 = heap[1];
                heap[1] = heap[nHeap];
                nHeap--;

                int yy = 0;
                int zz = 1;
                int tmp = heap[1];

                while (true) {
                    yy = zz << 1;

                    if (yy > nHeap) {
                        break;
                    }

                    if ((yy < nHeap)
                        && (weight[heap[yy + 1]] < weight[heap[yy]])) {
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
                heap[1] = heap[nHeap];
                nHeap--;

                yy = 0;
                zz = 1;
                tmp = heap[1];

                while (true) {
                    yy = zz << 1;

                    if (yy > nHeap) {
                        break;
                    }

                    if ((yy < nHeap)
                        && (weight[heap[yy + 1]] < weight[heap[yy]])) {
                        yy++;
                    }

                    if (weight[tmp] < weight[heap[yy]]) {
                        break;
                    }

                    heap[zz] = heap[yy];
                    zz = yy;
                }

                heap[zz] = tmp;
                nNodes++;
                parent[n1] = parent[n2] = nNodes;

                final int weight_n1 = weight[n1];
                final int weight_n2 = weight[n2];
                weight[nNodes] = ((weight_n1 & 0xffffff00)
                                  + (weight_n2 & 0xffffff00))
                    | (1 + (((weight_n1 & 0x000000ff)
                             > (weight_n2 & 0x000000ff))
                            ? (weight_n1 & 0x000000ff)
                            : (weight_n2 & 0x000000ff)));

                parent[nNodes] = -1;
                nHeap++;
                heap[nHeap] = nNodes;

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

                len[i - 1] = (byte) j;
                if (j > maxLen) {
                    tooLong = true;
                }
            }

            if (tooLong) {
                for (int i = 1; i < alphaSize; i++) {
                    int j = weight[i] >> 8;
                    j = 1 + (j >> 1);
                    weight[i] = j << 8;
                }
            }
        }
    }

    // ... rest of the original class unchanged ...

}