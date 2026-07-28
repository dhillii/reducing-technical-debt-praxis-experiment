static final class Location implements Comparable<Location>, Cloneable {
  private int blockIndex;
  // distance/offset from the beginning of the block
  private long recordIndex;

  Location(int blockIndex, long recordIndex) {
    set(blockIndex, recordIndex);
  }

  void incRecordIndex() {
    ++recordIndex;
  }

  Location(Location other) {
    set(other);
  }

  int getBlockIndex() {
    return blockIndex;
  }

  long getRecordIndex() {
    return recordIndex;
  }

  void set(int blockIndex, long recordIndex) {
    if ((blockIndex | recordIndex) < 0) {
      throw new IllegalArgumentException(
          "Illegal parameter for BlockLocation.");
    }
    this.blockIndex = blockIndex;
    this.recordIndex = recordIndex;
  }

  void set(Location other) {
    set(other.blockIndex, other.recordIndex);
  }

  /**
   * @see java.lang.Comparable#compareTo(java.lang.Object)
   */
  @Override
  public int compareTo(Location other) {
    return compareTo(other.blockIndex, other.recordIndex);
  }

  int compareTo(int bid, long rid) {
    if (this.blockIndex == bid) {
      long ret = this.recordIndex - rid;
      if (ret > 0) return 1;
      if (ret < 0) return -1;
      return 0;
    }
    return this.blockIndex - bid;
  }

  /**
   * Create a copy of this Location.
   * 
   * @return a new Location object that is a copy of this one.
   */
  public Location copy() {
    return new Location(this);
  }

  /**
   * @see java.lang.Object#hashCode()
   */
  @Override
  public int hashCode() {
    final int prime = 31;
    int result = prime + blockIndex;
    result = (int) (prime * result + recordIndex);
    return result;
  }

  /**
   * @see java.lang.Object#equals(java.lang.Object)
   */
  @Override
  public boolean equals(Object obj) {
    if (this == obj) return true;
    if (obj == null) return false;
    if (getClass() != obj.getClass()) return false;
    Location other = (Location) obj;
    if (blockIndex != other.blockIndex) return false;
    if (recordIndex != other.recordIndex) return false;
    return true;
  }
}