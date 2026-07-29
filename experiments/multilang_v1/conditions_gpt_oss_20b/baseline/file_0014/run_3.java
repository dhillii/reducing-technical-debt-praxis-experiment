protected static void hbMakeCodeLengths(char[] len, int[] freq,
                                            int alphaSize, int maxLen) {
        // Leaf weights: high 24 bits are weight, low 8 bits unused (0)
        int[] leafWeight = new int[alphaSize];
        for (int i = 0; i < alphaSize; i++) {
            leafWeight[i] = (freq[i] == 0 ? 1 : freq[i]) << 8;
        }

        while (true) {
            // Build Huffman tree using priority queue
            java.util.PriorityQueue<Node> pq = new java.util.PriorityQueue<>(
                    java.util.Comparator.comparingInt(n -> n.weight));
            for (int i = 0; i < alphaSize; i++) {
                pq.add(new Node(leafWeight[i], i, null, null));
            }

            while (pq.size() > 1) {
                Node n1 = pq.poll();
                Node n2 = pq.poll();
                int high = ((n1.weight >> 8) + (n2.weight >> 8)) << 8;
                int low = Math.max(n1.weight & 0xFF, n2.weight & 0xFF) + 1;
                Node parent = new Node(high | low, -1, n1, n2);
                pq.add(parent);
            }

            Node root = pq.poll();

            // Compute code lengths by traversing tree
            java.util.Arrays.fill(len, (char) 0);
            computeLengths(root, 0, len);

            // Check if any length exceeds maxLen
            boolean tooLong = false;
            for (int i = 0; i < alphaSize; i++) {
                if (len[i] > maxLen) {
                    tooLong = true;
                    break;
                }
            }

            if (!tooLong) {
                break;
            }

            // Reduce leaf weights and repeat
            for (int i = 0; i < alphaSize; i++) {
                int w = leafWeight[i] >> 8;
                w = 1 + (w >> 1);
                leafWeight[i] = w << 8;
            }
        }
    }

    private static void computeLengths(Node node, int depth, char[] len) {
        if (node.index >= 0) {
            len[node.index] = (char) depth;
        } else {
            computeLengths(node.left, depth + 1, len);
            computeLengths(node.right, depth + 1, len);
        }
    }

    private static final class Node {
        final int weight;
        final int index; // >=0 for leaf, -1 for internal
        final Node left;
        final Node right;

        Node(int weight, int index, Node left, Node right) {
            this.weight = weight;
            this.index = index;
            this.left = left;
            this.right = right;
        }
    }