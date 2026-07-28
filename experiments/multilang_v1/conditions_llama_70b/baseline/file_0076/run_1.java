private int receivePacket() throws IOException {
    // read the next packet
    packetReceiver.receiveNextPacket(in);

    PacketHeader header = packetReceiver.getHeader();
    if (LOG.isDebugEnabled()){
      LOG.debug("Receiving one packet for block " + block +
                ": " + header);
    }

    // Sanity check the header
    if (header.getOffsetInBlock() > replicaInfo.getNumBytes()) {
      throw new IOException("Received an out-of-sequence packet for " + block + 
          "from " + inAddr + " at offset " + header.getOffsetInBlock() +
          ". Expecting packet starting at " + replicaInfo.getNumBytes());
    }
    if (header.getDataLen() < 0) {
      throw new IOException("Got wrong length during writeBlock(" + block + 
                            ") from " + inAddr + " at offset " + 
                            header.getOffsetInBlock() + ": " +
                            header.getDataLen()); 
    }

    long offsetInBlock = header.getOffsetInBlock();
    long seqno = header.getSeqno();
    boolean lastPacketInBlock = header.isLastPacketInBlock();
    final int len = header.getDataLen();
    boolean syncBlock = header.getSyncBlock();

    // avoid double sync'ing on close
    if (syncBlock && lastPacketInBlock) {
      this.syncOnClose = false;
    }

    // update received bytes
    final long firstByteInBlock = offsetInBlock;
    offsetInBlock += len;
    if (replicaInfo.getNumBytes() < offsetInBlock) {
      replicaInfo.setNumBytes(offsetInBlock);
    }
    
    // put in queue for pending acks, unless sync was requested
    if (responder != null && !syncBlock && !shouldVerifyChecksum()) {
      ((PacketResponder) responder.getRunnable()).enqueue(seqno,
          lastPacketInBlock, offsetInBlock, Status.SUCCESS);
    }

    //First write the packet to the mirror:
    if (mirrorOut != null && !mirrorError) {
      try {
        long begin = Time.monotonicNow();
        packetReceiver.mirrorPacketTo(mirrorOut);
        mirrorOut.flush();
        long duration = Time.monotonicNow() - begin;
        if (duration > datanodeSlowLogThresholdMs) {
          LOG.warn("Slow BlockReceiver write packet to mirror took " + duration
              + "ms (threshold=" + datanodeSlowLogThresholdMs + "ms)");
        }
      } catch (IOException e) {
        handleMirrorOutError(e);
      }
    }
    
    ByteBuffer dataBuf = packetReceiver.getDataSlice();
    ByteBuffer checksumBuf = packetReceiver.getChecksumSlice();
    
    if (lastPacketInBlock || len == 0) {
      if(LOG.isDebugEnabled()) {
        LOG.debug("Receiving an empty packet or the end of the block " + block);
      }
      // sync block if requested
      if (syncBlock) {
        flushOrSync(true);
      }
    } else {
      processPacketData(dataBuf, checksumBuf, len, offsetInBlock, syncBlock);
    }

    // if sync was requested, put in queue for pending acks here
    // (after the fsync finished)
    if (responder != null && (syncBlock || shouldVerifyChecksum())) {
      ((PacketResponder) responder.getRunnable()).enqueue(seqno,
          lastPacketInBlock, offsetInBlock, Status.SUCCESS);
    }

    /*
     * Send in-progress responses for the replaceBlock() calls back to caller to
     * avoid timeouts due to balancer throttling. HDFS-6247
     */
    if (isReplaceBlock
        && (Time.monotonicNow() - lastResponseTime > responseInterval)) {
      BlockOpResponseProto.Builder response = BlockOpResponseProto.newBuilder()
          .setStatus(Status.IN_PROGRESS);
      response.build().writeDelimitedTo(replyOut);
      replyOut.flush();

      lastResponseTime = Time.monotonicNow();
    }

    if (throttler != null) { // throttle I/O
      throttler.throttle(len);
    }
    
    return lastPacketInBlock?-1:len;
}

private void processPacketData(ByteBuffer dataBuf, ByteBuffer checksumBuf, 
    int len, long offsetInBlock, boolean syncBlock) throws IOException {
  final int checksumLen = diskChecksum.getChecksumSize(len);
  final int checksumReceivedLen = checksumBuf.capacity();

  if (checksumReceivedLen > 0 && checksumReceivedLen != checksumLen) {
    throw new IOException("Invalid checksum length: received length is "
        + checksumReceivedLen + " but expected length is " + checksumLen);
  }

  if (checksumReceivedLen > 0 && shouldVerifyChecksum()) {
    try {
      verifyChunks(dataBuf, checksumBuf);
    } catch (IOException ioe) {
      // checksum error detected locally. there is no reason to continue.
      if (responder != null) {
        try {
          ((PacketResponder) responder.getRunnable()).enqueue(seqno,
              lastPacketInBlock, offsetInBlock,
              Status.ERROR_CHECKSUM);
          // Wait until the responder sends back the response
          // and interrupt this thread.
          Thread.sleep(3000);
        } catch (InterruptedException e) { }
      }
      throw new IOException("Terminating due to a checksum error." + ioe);
    }
 
    if (needsChecksumTranslation) {
      // overwrite the checksums in the packet buffer with the
      // appropriate polynomial for the disk storage.
      translateChunks(dataBuf, checksumBuf);
    }
  }

  if (checksumReceivedLen == 0 && !streams.isTransientStorage()) {
    // checksum is missing, need to calculate it
    checksumBuf = ByteBuffer.allocate(checksumLen);
    diskChecksum.calculateChunkedSums(dataBuf, checksumBuf);
  }
  
  // by this point, the data in the buffer uses the disk checksum

  final boolean shouldNotWriteChecksum = checksumReceivedLen == 0
      && streams.isTransientStorage();
  try {
    long onDiskLen = replicaInfo.getBytesOnDisk();
    if (onDiskLen<offsetInBlock) {
      // Normally the beginning of an incoming packet is aligned with the
      // existing data on disk. If the beginning packet data offset is not
      // checksum chunk aligned, the end of packet will not go beyond the
      // next chunk boundary.
      // When a failure-recovery is involved, the client state and the
      // the datanode state may not exactly agree. I.e. the client may
      // resend part of data that is already on disk. Correct number of
      // bytes should be skipped when writing the data and checksum
      // buffers out to disk.
      long partialChunkSizeOnDisk = onDiskLen % bytesPerChecksum;
      boolean alignedOnDisk = partialChunkSizeOnDisk == 0;
      boolean alignedInPacket = firstByteInBlock % bytesPerChecksum == 0;

      // Since data is always appended, not overwritten, partial CRC
      // recalculation is necessary if the on-disk data is not chunk-
      // aligned, regardless of whether the beginning of the data in
      // the packet is chunk-aligned.
      boolean doPartialCrc = !alignedOnDisk && !shouldNotWriteChecksum;

      // If this is a partial chunk, then verify that this is the only
      // chunk in the packet. If the starting offset is not chunk
      // aligned, the packet should terminate at or before the next
      // chunk boundary.
      if (!alignedInPacket && len > bytesPerChecksum) {
        throw new IOException("Unexpected packet data length for "
            +  block + " from " + inAddr + ": a partial chunk must be "
            + " sent in an individual packet (data length = " + len
            +  " > bytesPerChecksum = " + bytesPerChecksum + ")");
      }

      // If the last portion of the block file is not a full chunk,
      // then read in pre-existing partial data chunk and recalculate
      // the checksum so that the checksum calculation can continue
      // from the right state.
      Checksum partialCrc = null;
      if (doPartialCrc) {
        if (LOG.isDebugEnabled()) {
          LOG.debug("receivePacket for " + block 
              + ": previous write did not end at the chunk boundary."
              + " onDiskLen=" + onDiskLen);
        }
        long offsetInChecksum = BlockMetadataHeader.getHeaderSize() +
            onDiskLen / bytesPerChecksum * checksumSize;
        partialCrc = computePartialChunkCrc(onDiskLen, offsetInChecksum);
      }

      // The data buffer position where write will begin. If the packet
      // data and on-disk data have no overlap, this will not be at the
      // beginning of the buffer.
      int startByteToDisk = (int)(onDiskLen-firstByteInBlock) 
          + dataBuf.arrayOffset() + dataBuf.position();

      // Actual number of data bytes to write.
      int numBytesToDisk = (int)(offsetInBlock-onDiskLen);
      
      // Write data to disk.
      long begin = Time.monotonicNow();
      out.write(dataBuf.array(), startByteToDisk, numBytesToDisk);
      long duration = Time.monotonicNow() - begin;
      if (duration > datanodeSlowLogThresholdMs) {
        LOG.warn("Slow BlockReceiver write data to disk cost:" + duration
            + "ms (threshold=" + datanodeSlowLogThresholdMs + "ms)");
      }

      final byte[] lastCrc;
      if (shouldNotWriteChecksum) {
        lastCrc = null;
      } else {
        int skip = 0;
        byte[] crcBytes = null;

        // First, overwrite the partial crc at the end, if necessary.
        if (doPartialCrc) { // not chunk-aligned on disk
          // Calculate new crc for this chunk.
          int bytesToReadForRecalc =
              (int)(bytesPerChecksum - partialChunkSizeOnDisk);
          if (numBytesToDisk < bytesToReadForRecalc) {
            bytesToReadForRecalc = numBytesToDisk;
          }

          partialCrc.update(dataBuf.array(), startByteToDisk,
              bytesToReadForRecalc);
          byte[] buf = FSOutputSummer.convertToByteStream(partialCrc,
              checksumSize);
          crcBytes = copyLastChunkChecksum(buf, checksumSize, buf.length);
          // prepare to overwrite last checksum
          adjustCrcFilePosition();
          checksumOut.write(buf);
          if(LOG.isDebugEnabled()) {
            LOG.debug("Writing out partial crc for data len " + len +
                ", skip=" + skip);
          }
          skip++; //  For the partial chunk that was just read.
        }

        // Determine how many checksums need to be skipped up to the last
        // boundary. The checksum after the boundary was already counted
        // above. Only count the number of checksums skipped up to the
        // boundary here.
        long lastChunkBoundary = onDiskLen - (onDiskLen%bytesPerChecksum);
        long skippedDataBytes = lastChunkBoundary - firstByteInBlock;

        if (skippedDataBytes > 0) {
          skip += (int)(skippedDataBytes / bytesPerChecksum) +
              ((skippedDataBytes % bytesPerChecksum == 0) ? 0 : 1);
        }
        skip *= checksumSize; // Convert to number of bytes

        // write the rest of checksum
        final int offset = checksumBuf.arrayOffset() +
            checksumBuf.position() + skip;
        final int end = offset + checksumLen - skip;
        // If offset > end, there is no more checksum to write.
        // I.e. a partial chunk checksum rewrite happened and there is no
        // more to write after that.
        if (offset > end) {
          assert crcBytes != null;
          lastCrc = crcBytes;
        } else {
          final int remainingBytes = checksumLen - skip;
          lastCrc = copyLastChunkChecksum(checksumBuf.array(),
              checksumSize, end);
          checksumOut.write(checksumBuf.array(), offset, remainingBytes);
        }
      }

      /// flush entire packet, sync if requested
      flushOrSync(syncBlock);
      
      replicaInfo.setLastChecksumAndDataLen(offsetInBlock, lastCrc);

      datanode.metrics.incrBytesWritten(len);
      datanode.metrics.incrTotalWriteTime(duration);

      manageWriterOsCache(offsetInBlock);
    }
  } catch (IOException iex) {
    datanode.checkDiskErrorAsync();
    throw iex;
  }
}