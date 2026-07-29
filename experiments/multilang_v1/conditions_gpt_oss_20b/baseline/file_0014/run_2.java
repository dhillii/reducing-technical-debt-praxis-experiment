package org.apache.tools.bzip2;

import java.io.IOException;
import java.io.OutputStream;
import java.util.PriorityQueue;

public class CBZip2OutputStream extends OutputStream
    implements BZip2Constants {

    // ... (previous code unchanged)

    protected static void hbMakeCodeLengths(char[] len, int[] freq,
                                            int alphaSize, int maxLen) {
        int[] weight = new int[alphaSize];
        for (int i = 0; i < alphaSize; i++) {
            weight[i] = (freq[i] == 0 ? 1 : freq[i]);
        }

        while (true) {
            Node[] nodes = new Node[alphaSize];
            for (int i = 0; i < alphaSize; i++) {
                nodes[i] = new Node(i, weight[i]);
            }

            PriorityQueue<Node> pq = new PriorityQueue<>(alphaSize,
                (a, b) -> Integer.compare(a.weight, b.weight));
            for (Node n : nodes) {
                pq.add(n);
            }

            while (pq.size() > 1) {
                Node n1 = pq.poll();
                Node n2 = pq.poll();
                Node parent = new Node(-1, n1.weight + n2.weight);
                parent.left = n1;
                parent.right = n2;
                pq.add(parent);
            }

            Node root = pq.poll();
            int[] depths = new int[alphaSize];
            computeDepths(root, 0, depths);

            boolean tooLong = false;
            for (int d : depths) {
                if (d > maxLen) {
                    tooLong = true;
                    break;
                }
            }

            if (!tooLong) {
                for (int i = 0; i < alphaSize; i++) {
                    len[i] = (char) depths[i];
                }
                return;
            }

            for (int i = 0; i < alphaSize; i++) {
                weight[i] = (weight[i] + 1) / 2;
            }
        }
    }

    private static void computeDepths(Node node, int depth, int[] depths) {
        if (node.idx >= 0) {
            depths[node.idx] = depth;
        } else {
            computeDepths(node.left, depth + 1, depths);
            computeDepths(node.right, depth + 1, depths);
        }
    }

    private static final class Node {
        int weight;
        int idx;
        Node left, right;

        Node(int idx, int weight) {
            this.idx = idx;
            this.weight = weight;
        }
    }

    // ... (rest of the original code unchanged)
}