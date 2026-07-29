package org.apache.hadoop.yarn.server.timeline;

import com.google.common.annotations.VisibleForTesting;
import com.google.common.base.Preconditions;
import org.apache.commons.collections.map.LRUMap;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.classification.InterfaceAudience;
import org.apache.hadoop.classification.InterfaceAudience.Private;
import org.apache.hadoop.classification.InterfaceStability;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.Path;
import org.apache.hadoop.fs.permission.FsPermission;
import org.apache.hadoop.io.IOUtils;
import org.apache.hadoop.io.WritableComparator;
import org.apache.hadoop.service.AbstractService;
import org.apache.hadoop.yarn.api.records.timeline.*;
import org.apache.hadoop.yarn.api.records.timeline.TimelineEvents.EventsOfOneEntity;
import org.apache.hadoop.yarn.api.records.timeline.TimelinePutResponse.TimelinePutError;
import org.apache.hadoop.yarn.conf.YarnConfiguration;
import org.apache.hadoop.yarn.proto.YarnServerCommonProtos.VersionProto;
import org.apache.hadoop.yarn.server.records.Version;
import org.apache.hadoop.yarn.server.records.impl.pb.VersionPBImpl;
import org.apache.hadoop.yarn.server.timeline.TimelineDataManager.CheckAcl;
import org.apache.hadoop.yarn.server.timeline.util.LeveldbUtils.KeyBuilder;
import org.apache.hadoop.yarn.server.timeline.util.LeveldbUtils.KeyParser;
import org.apache.hadoop.yarn.server.utils.LeveldbIterator;
import org.fusesource.leveldbjni.JniDBFactory;
import org.iq80.leveldb.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.Charset;
import java.util.*;
import java.util.Map.Entry;
import java.util.concurrent.locks.ReentrantLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

import static org.apache.hadoop.yarn.server.timeline.GenericObjectMapper.readReverseOrderedLong;
import static org.apache.hadoop.yarn.server.timeline.GenericObjectMapper.writeReverseOrderedLong;
import static org.apache.hadoop.yarn.server.timeline.TimelineDataManager.DEFAULT_DOMAIN_ID;
import static org.apache.hadoop.yarn.server.timeline.util.LeveldbUtils.prefixMatches;
import static org.fusesource.leveldbjni.JniDBFactory.bytes;

/**
 * <p>An implementation of an application timeline store backed by leveldb.</p>
 *
 * <p>There are three sections of the db, the start time section,
 * the entity section, and the indexed entity section.</p>
 *
 * <p>The start time section is used to retrieve the unique start time for
 * a given entity. Its values each contain a start time while its keys are of
 * the form:</p>
 * <pre>
 *   START_TIME_LOOKUP_PREFIX + entity type + entity id</pre>
 *
 * <p>The entity section is ordered by entity type, then entity start time
 * descending, then entity ID. There are four sub-sections of the entity
 * section: events, primary filters, related entities,
 * and other info. The event entries have event info serialized into their
 * values. The other info entries have values corresponding to the values of
 * the other info name/value map for the entry (note the names are contained
 * in the key). All other entries have empty values. The key structure is as
 * follows:</p>
 * <pre>
 *   ENTITY_ENTRY_PREFIX + entity type + revstarttime + entity id
 *
 *   ENTITY_ENTRY_PREFIX + entity type + revstarttime + entity id +
 *     EVENTS_COLUMN + reveventtimestamp + eventtype
 *
 *   ENTITY_ENTRY_PREFIX + entity type + revstarttime + entity id +
 *     PRIMARY_FILTERS_COLUMN + name + value
 *
 *   ENTITY_ENTRY_PREFIX + entity type + revstarttime + entity id +
 *     OTHER_INFO_COLUMN + name
 *
 *   ENTITY_ENTRY_PREFIX + entity type + revstarttime + entity id +
 *     RELATED_ENTITIES_COLUMN + relatedentity type + relatedentity id
 *
 *   ENTITY_ENTRY_PREFIX + entity type + revstarttime + entity id +
 *     DOMAIN_ID_COLUMN
 *
 *   ENTITY_ENTRY_PREFIX + entity type + revstarttime + entity id +
 *     INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN + relatedentity type +
 *     relatedentity id</pre>
 *
 * <p>The indexed entity section contains a primary filter name and primary
 * filter value as the prefix. Within a given name/value, entire entity
 * entries are stored in the same format as described in the entity section
 * above (below, "key" represents any one of the possible entity entry keys
 * described above).</p>
 * <pre>
 *   INDEXED_ENTRY_PREFIX + primaryfilter name + primaryfilter value +
 *     key</pre>
 */
@InterfaceAudience.Private
@InterfaceStability.Unstable
public class LeveldbTimelineStore extends AbstractService
    implements TimelineStore {
  private static final Log LOG = LogFactory
      .getLog(LeveldbTimelineStore.class);

  @Private
  @VisibleForTesting
  static final String FILENAME = "leveldb-timeline-store.ldb";

  private static final byte[] START_TIME_LOOKUP_PREFIX = "k".getBytes(Charset.forName("UTF-8"));
  private static final byte[] ENTITY_ENTRY_PREFIX = "e".getBytes(Charset.forName("UTF-8"));
  private static final byte[] INDEXED_ENTRY_PREFIX = "i".getBytes(Charset.forName("UTF-8"));

  private static final byte[] EVENTS_COLUMN = "e".getBytes(Charset.forName("UTF-8"));
  private static final byte[] PRIMARY_FILTERS_COLUMN = "f".getBytes(Charset.forName("UTF-8"));
  private static final byte[] OTHER_INFO_COLUMN = "i".getBytes(Charset.forName("UTF-8"));
  private static final byte[] RELATED_ENTITIES_COLUMN = "r".getBytes(Charset.forName("UTF-8"));
  private static final byte[] INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN =
      "z".getBytes(Charset.forName("UTF-8"));
  private static final byte[] DOMAIN_ID_COLUMN = "d".getBytes(Charset.forName("UTF-8"));

  private static final byte[] DOMAIN_ENTRY_PREFIX = "d".getBytes(Charset.forName("UTF-8"));
  private static final byte[] OWNER_LOOKUP_PREFIX = "o".getBytes(Charset.forName("UTF-8"));
  private static final byte[] DESCRIPTION_COLUMN = "d".getBytes(Charset.forName("UTF-8"));
  private static final byte[] OWNER_COLUMN = "o".getBytes(Charset.forName("UTF-8"));
  private static final byte[] READER_COLUMN = "r".getBytes(Charset.forName("UTF-8"));
  private static final byte[] WRITER_COLUMN = "w".getBytes(Charset.forName("UTF-8"));
  private static final byte[] TIMESTAMP_COLUMN = "t".getBytes(Charset.forName("UTF-8"));

  private static final byte[] EMPTY_BYTES = new byte[0];
  
  private static final String TIMELINE_STORE_VERSION_KEY = "timeline-store-version";
  
  private static final Version CURRENT_VERSION_INFO = Version
      .newInstance(1, 0);

  @Private
  @VisibleForTesting
  static final FsPermission LEVELDB_DIR_UMASK = FsPermission
      .createImmutable((short) 0700);

  private Map<EntityIdentifier, StartAndInsertTime> startTimeWriteCache;
  private Map<EntityIdentifier, Long> startTimeReadCache;

  /**
   * Per-entity locks are obtained when writing.
   */
  private final LockMap<EntityIdentifier> writeLocks =
      new LockMap<EntityIdentifier>();

  private final ReentrantReadWriteLock deleteLock =
      new ReentrantReadWriteLock();

  private DB db;

  private Thread deletionThread;

  public LeveldbTimelineStore() {
    super(LeveldbTimelineStore.class.getName());
  }

  @Override
  @SuppressWarnings("unchecked")
  protected void serviceInit(Configuration conf) throws Exception {
    Preconditions.checkArgument(conf.getLong(
        YarnConfiguration.TIMELINE_SERVICE_TTL_MS,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_TTL_MS) > 0,
        "%s property value should be greater than zero",
        YarnConfiguration.TIMELINE_SERVICE_TTL_MS);
    Preconditions.checkArgument(conf.getLong(
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_TTL_INTERVAL_MS,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_TTL_INTERVAL_MS) > 0,
        "%s property value should be greater than zero",
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_TTL_INTERVAL_MS);
    Preconditions.checkArgument(conf.getLong(
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE) >= 0,
        "%s property value should be greater than or equal to zero",
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE);
    Preconditions.checkArgument(conf.getLong(
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_READ_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_START_TIME_READ_CACHE_SIZE) > 0,
        " %s property value should be greater than zero",
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_READ_CACHE_SIZE);
    Preconditions.checkArgument(conf.getLong(
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_WRITE_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_START_TIME_WRITE_CACHE_SIZE) > 0,
        "%s property value should be greater than zero",
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_WRITE_CACHE_SIZE);

    Options options = new Options();
    options.createIfMissing(true);
    options.cacheSize(conf.getLong(
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE));
    JniDBFactory factory = new JniDBFactory();
    Path dbPath = new Path(
        conf.get(YarnConfiguration.TIMELINE_SERVICE_LEVELDB_PATH), FILENAME);
    FileSystem localFS = null;
    try {
      localFS = FileSystem.getLocal(conf);
      if (!localFS.exists(dbPath)) {
        if (!localFS.mkdirs(dbPath)) {
          throw new IOException("Couldn't create directory for leveldb " +
              "timeline store " + dbPath);
        }
        localFS.setPermission(dbPath, LEVELDB_DIR_UMASK);
      }
    } finally {
      IOUtils.cleanup(LOG, localFS);
    }
    LOG.info("Using leveldb path " + dbPath);
    db = factory.open(new File(dbPath.toString()), options);
    checkVersion();
    startTimeWriteCache =
        Collections.synchronizedMap(new LRUMap(getStartTimeWriteCacheSize(
            conf)));
    startTimeReadCache =
        Collections.synchronizedMap(new LRUMap(getStartTimeReadCacheSize(
            conf)));

    if (conf.getBoolean(YarnConfiguration.TIMELINE_SERVICE_TTL_ENABLE, true)) {
      deletionThread = new EntityDeletionThread(conf);
      deletionThread.start();
    }

    super.serviceInit(conf);
  }

  @Override
  protected void serviceStop() throws Exception {
    if (deletionThread != null) {
      deletionThread.interrupt();
      LOG.info("Waiting for deletion thread to complete its current action");
      try {
        deletionThread.join();
      } catch (InterruptedException e) {
        LOG.warn("Interrupted while waiting for deletion thread to complete," +
            " closing db now", e);
      }
    }
    IOUtils.cleanup(LOG, db);
    super.serviceStop();
  }

  private static class StartAndInsertTime {
    final long startTime;
    final long insertTime;

    public StartAndInsertTime(long startTime, long insertTime) {
      this.startTime = startTime;
      this.insertTime = insertTime;
    }
  }

  private class EntityDeletionThread extends Thread {
    private final long ttl;
    private final long ttlInterval;

    public EntityDeletionThread(Configuration conf) {
      ttl  = conf.getLong(YarnConfiguration.TIMELINE_SERVICE_TTL_MS,
          YarnConfiguration.DEFAULT_TIMELINE_SERVICE_TTL_MS);
      ttlInterval = conf.getLong(
          YarnConfiguration.TIMELINE_SERVICE_LEVELDB_TTL_INTERVAL_MS,
          YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_TTL_INTERVAL_MS);
      LOG.info("Starting deletion thread with ttl " + ttl + " and cycle " +
          "interval " + ttlInterval);
    }

    @Override
    public void run() {
      while (true) {
        long timestamp = System.currentTimeMillis() - ttl;
        try {
          discardOldEntities(timestamp);
          Thread.sleep(ttlInterval);
        } catch (IOException e) {
          LOG.error(e);
        } catch (InterruptedException e) {
          LOG.info("Deletion thread received interrupt, exiting");
          break;
        }
      }
    }
  }

  private static class LockMap<K> {
    private static class CountingReentrantLock<K> extends ReentrantLock {
      private static final long serialVersionUID = 1L;
      private int count;
      private K key;

      CountingReentrantLock(K key) {
        super();
        this.count = 0;
        this.key = key;
      }
    }

    private Map<K, CountingReentrantLock<K>> locks =
        new HashMap<K, CountingReentrantLock<K>>();

    synchronized CountingReentrantLock<K> getLock(K key) {
      CountingReentrantLock<K> lock = locks.get(key);
      if (lock == null) {
        lock = new CountingReentrantLock<K>(key);
        locks.put(key, lock);
      }

      lock.count++;
      return lock;
    }

    synchronized void returnLock(CountingReentrantLock<K> lock) {
      if (lock.count == 0) {
        throw new IllegalStateException("Returned lock more times than it " +
            "was retrieved");
      }
      lock.count--;

      if (lock.count == 0) {
        locks.remove(lock.key);
      }
    }
  }


  @Override
  public TimelineEntity getEntity(String entityId, String entityType,
      EnumSet<Field> fields) throws IOException {
    Long revStartTime = getStartTimeLong(entityId, entityType);
    if (revStartTime == null) {
      return null;
    }
    byte[] prefix = KeyBuilder.newInstance().add(ENTITY_ENTRY_PREFIX)
        .add(entityType).add(writeReverseOrderedLong(revStartTime))
        .add(entityId).getBytesForLookup();

    LeveldbIterator iterator = null;
    try {
      iterator = new LeveldbIterator(db);
      iterator.seek(prefix);

      return getEntity(entityId, entityType, revStartTime, fields, iterator,
          prefix, prefix.length);
    } catch(DBException e) {
      throw new IOException(e);            	
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
  }

  /**
   * Read entity from a db iterator.  If no information is found in the
   * specified fields for this entity, return null.
   */
  private static TimelineEntity getEntity(String entityId, String entityType,
      Long startTime, EnumSet<Field> fields, LeveldbIterator iterator,
      byte[] prefix, int prefixlen) throws IOException {
    if (fields == null) {
      fields = EnumSet.allOf(Field.class);
    }

    TimelineEntity entity = new TimelineEntity();
    EntityFieldFlags fieldFlags = new EntityFieldFlags(fields);
    
    if (!fieldFlags.hasEvents() && !fieldFlags.hasLastEvent()) {
      entity.setEvents(null);
    }
    if (!fieldFlags.hasRelatedEntities()) {
      entity.setRelatedEntities(null);
    }
    if (!fieldFlags.hasPrimaryFilters()) {
      entity.setPrimaryFilters(null);
    }
    if (!fieldFlags.hasOtherInfo()) {
      entity.setOtherInfo(null);
    }

    for (; iterator.hasNext(); iterator.next()) {
      byte[] key = iterator.peekNext().getKey();
      if (!prefixMatches(prefix, prefixlen, key)) {
        break;
      }
      if (key.length == prefixlen) {
        continue;
      }
      processEntityKeyColumn(entity, key, prefixlen, iterator, fieldFlags);
    }

    entity.setEntityId(entityId);
    entity.setEntityType(entityType);
    entity.setStartTime(startTime);

    return entity;
  }

  /**
   * Process a single column from an entity key.
   */
  private static void processEntityKeyColumn(TimelineEntity entity, byte[] key,
      int prefixlen, LeveldbIterator iterator, EntityFieldFlags fieldFlags)
      throws IOException {
    byte columnType = key[prefixlen];
    
    if (columnType == PRIMARY_FILTERS_COLUMN[0]) {
      if (fieldFlags.hasPrimaryFilters()) {
        addPrimaryFilter(entity, key, prefixlen + PRIMARY_FILTERS_COLUMN.length);
      }
    } else if (columnType == OTHER_INFO_COLUMN[0]) {
      if (fieldFlags.hasOtherInfo()) {
        entity.addOtherInfo(parseRemainingKey(key,
            prefixlen + OTHER_INFO_COLUMN.length),
            GenericObjectMapper.read(iterator.peekNext().getValue()));
      }
    } else if (columnType == RELATED_ENTITIES_COLUMN[0]) {
      if (fieldFlags.hasRelatedEntities()) {
        addRelatedEntity(entity, key, prefixlen + RELATED_ENTITIES_COLUMN.length);
      }
    } else if (columnType == EVENTS_COLUMN[0]) {
      processEventColumn(entity, key, prefixlen, iterator, fieldFlags);
    } else if (columnType == DOMAIN_ID_COLUMN[0]) {
      byte[] v = iterator.peekNext().getValue();
      String domainId = new String(v, Charset.forName("UTF-8"));
      entity.setDomainId(domainId);
    } else if (columnType != INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN[0]) {
      LOG.warn(String.format("Found unexpected column for entity (0x%02x)", columnType));
    }
  }

  /**
   * Process event column for entity.
   */
  private static void processEventColumn(TimelineEntity entity, byte[] key,
      int prefixlen, LeveldbIterator iterator, EntityFieldFlags fieldFlags)
      throws IOException {
    boolean shouldAddEvent = fieldFlags.hasEvents() ||
        (fieldFlags.hasLastEvent() && entity.getEvents().size() == 0);
    
    if (shouldAddEvent) {
      TimelineEvent event = getEntityEvent(null, key, prefixlen +
          EVENTS_COLUMN.length, iterator.peekNext().getValue());
      if (event != null) {
        entity.addEvent(event);
      }
    }
  }

  /**
   * Flags for entity field presence.
   */
  private static class EntityFieldFlags {
    private final boolean events;
    private final boolean lastEvent;
    private final boolean relatedEntities;
    private final boolean primaryFilters;
    private final boolean otherInfo;

    EntityFieldFlags(EnumSet<Field> fields) {
      this.events = fields.contains(Field.EVENTS);
      this.lastEvent = fields.contains(Field.LAST_EVENT_ONLY);
      this.relatedEntities = fields.contains(Field.RELATED_ENTITIES);
      this.primaryFilters = fields.contains(Field.PRIMARY_FILTERS);
      this.otherInfo = fields.contains(Field.OTHER_INFO);
    }

    boolean hasEvents() {
      return events;
    }

    boolean hasLastEvent() {
      return lastEvent;
    }

    boolean hasRelatedEntities() {
      return relatedEntities;
    }

    boolean hasPrimaryFilters() {
      return primaryFilters;
    }

    boolean hasOtherInfo() {
      return otherInfo;
    }
  }

  @Override
  public TimelineEvents getEntityTimelines(String entityType,
      SortedSet<String> entityIds, Long limit, Long windowStart,
      Long windowEnd, Set<String> eventType) throws IOException {
    TimelineEvents events = new TimelineEvents();
    if (entityIds == null || entityIds.isEmpty()) {
      return events;
    }
    
    Map<byte[], List<EntityIdentifier>> startTimeMap = buildStartTimeMap(
        entityIds, entityType);
    
    LeveldbIterator iterator = null;
    try {
      for (Entry<byte[], List<EntityIdentifier>> entry :
          startTimeMap.entrySet()) {
        byte[] revStartTime = entry.getKey();
        for (EntityIdentifier entityIdentifier : entry.getValue()) {
          processEntityTimeline(events, entityType, entityIdentifier,
              revStartTime, limit, windowStart, windowEnd, eventType);
        }
      }
    } catch(DBException e) {
      throw new IOException(e);            	
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
    return events;
  }

  /**
   * Build a map of start times to entity identifiers.
   */
  private Map<byte[], List<EntityIdentifier>> buildStartTimeMap(
      SortedSet<String> entityIds, String entityType) throws IOException {
    Map<byte[], List<EntityIdentifier>> startTimeMap = new TreeMap<byte[],
        List<EntityIdentifier>>(new Comparator<byte[]>() {
          @Override
          public int compare(byte[] o1, byte[] o2) {
            return WritableComparator.compareBytes(o1, 0, o1.length, o2, 0,
                o2.length);
          }
        });
    
    for (String entityId : entityIds) {
      byte[] startTime = getStartTime(entityId, entityType);
      if (startTime != null) {
        List<EntityIdentifier> entities = startTimeMap.get(startTime);
        if (entities == null) {
          entities = new ArrayList<EntityIdentifier>();
          startTimeMap.put(startTime, entities);
        }
        entities.add(new EntityIdentifier(entityId, entityType));
      }
    }
    return startTimeMap;
  }

  /**
   * Process timeline for a single entity.
   */
  private void processEntityTimeline(TimelineEvents events, String entityType,
      EntityIdentifier entityIdentifier, byte[] revStartTime, Long limit,
      Long windowStart, Long windowEnd, Set<String> eventType)
      throws IOException {
    EventsOfOneEntity entity = new EventsOfOneEntity();
    entity.setEntityId(entityIdentifier.getId());
    entity.setEntityType(entityType);
    events.addEvent(entity);
    
    KeyBuilder kb = KeyBuilder.newInstance().add(ENTITY_ENTRY_PREFIX)
        .add(entityType).add(revStartTime).add(entityIdentifier.getId())
        .add(EVENTS_COLUMN);
    byte[] prefix = kb.getBytesForLookup();
    
    Long adjustedWindowEnd = windowEnd == null ? Long.MAX_VALUE : windowEnd;
    byte[] revts = writeReverseOrderedLong(adjustedWindowEnd);
    kb.add(revts);
    byte[] first = kb.getBytesForLookup();
    
    byte[] last = null;
    if (windowStart != null) {
      last = KeyBuilder.newInstance().add(prefix)
          .add(writeReverseOrderedLong(windowStart)).getBytesForLookup();
    }
    
    Long adjustedLimit = limit == null ? DEFAULT_LIMIT : limit;
    
    LeveldbIterator iterator = new LeveldbIterator(db);
    try {
      for (iterator.seek(first); entity.getEvents().size() < adjustedLimit &&
          iterator.hasNext(); iterator.next()) {
        byte[] key = iterator.peekNext().getKey();
        if (!prefixMatches(prefix, prefix.length, key) || (last != null &&
            WritableComparator.compareBytes(key, 0, key.length, last, 0,
                last.length) > 0)) {
          break;
        }
        TimelineEvent event = getEntityEvent(eventType, key, prefix.length,
            iterator.peekNext().getValue());
        if (event != null) {
          entity.addEvent(event);
        }
      }
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
  }

  @Override
  public TimelineEntities getEntities(String entityType,
      Long limit, Long windowStart, Long windowEnd, String fromId, Long fromTs,
      NameValuePair primaryFilter, Collection<NameValuePair> secondaryFilters,
      EnumSet<Field> fields, CheckAcl checkAcl) throws IOException {
    if (primaryFilter == null) {
      return getEntityByTime(ENTITY_ENTRY_PREFIX, entityType, limit,
          windowStart, windowEnd, fromId, fromTs, secondaryFilters, 
          fields, checkAcl);
    } else {
      byte[] base = KeyBuilder.newInstance().add(INDEXED_ENTRY_PREFIX)
          .add(primaryFilter.getName())
          .add(GenericObjectMapper.write(primaryFilter.getValue()), true)
          .add(ENTITY_ENTRY_PREFIX).getBytesForLookup();
      return getEntityByTime(base, entityType, limit, windowStart, windowEnd,
          fromId, fromTs, secondaryFilters, fields, checkAcl);
    }
  }

  /**
   * Retrieves a list of entities satisfying given parameters.
   *
   * @param base A byte array prefix for the lookup
   * @param entityType The type of the entity
   * @param limit A limit on the number of entities to return
   * @param starttime The earliest entity start time to retrieve (exclusive)
   * @param endtime The latest entity start time to retrieve (inclusive)
   * @param fromId Retrieve entities starting with this entity
   * @param fromTs Ignore entities with insert timestamp later than this ts
   * @param secondaryFilters Filter pairs that the entities should match
   * @param fields The set of fields to retrieve
   * @return A list of entities
   * @throws IOException
   */
  private TimelineEntities getEntityByTime(byte[] base,
      String entityType, Long limit, Long starttime, Long endtime,
      String fromId, Long fromTs, Collection<NameValuePair> secondaryFilters,
      EnumSet<Field> fields, CheckAcl checkAcl) throws IOException {
    LeveldbIterator iterator = null;
    try {
      KeyBuilder kb = KeyBuilder.newInstance().add(base).add(entityType);
      byte[] prefix = kb.getBytesForLookup();
      
      Long adjustedEndtime = endtime == null ? Long.MAX_VALUE : endtime;
      
      byte[] first = buildFirstKey(kb, fromId, entityType, adjustedEndtime);
      
      byte[] last = null;
      if (starttime != null) {
        last = KeyBuilder.newInstance().add(base).add(entityType)
            .add(writeReverseOrderedLong(starttime)).getBytesForLookup();
      }
      
      Long adjustedLimit = limit == null ? DEFAULT_LIMIT : limit;

      TimelineEntities entities = new TimelineEntities();
      iterator = new LeveldbIterator(db);
      iterator.seek(first);
      
      while (entities.getEntities().size() < adjustedLimit && iterator.hasNext()) {
        byte[] key = iterator.peekNext().getKey();
        if (!prefixMatches(prefix, prefix.length, key) || (last != null &&
            WritableComparator.compareBytes(key, 0, key.length, last, 0,
                last.length) > 0)) {
          break;
        }
        
        KeyParser kp = new KeyParser(key, prefix.length);
        Long startTime = kp.getNextLong();
        String entityId = kp.getNextString();

        if (shouldSkipEntity(fromTs, iterator, kp)) {
          continue;
        }

        TimelineEntity entity = getEntity(entityId, entityType, startTime,
            fields, iterator, key, kp.getOffset());
        
        if (shouldAddEntity(entity, secondaryFilters, checkAcl)) {
          entities.addEntity(entity);
        }
      }
      return entities;
    } catch(DBException e) {
      throw new IOException(e);   	
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
  }

  /**
   * Build the first key for seeking.
   */
  private byte[] buildFirstKey(KeyBuilder kb, String fromId, String entityType,
      Long endtime) throws IOException {
    if (fromId != null) {
      Long fromIdStartTime = getStartTimeLong(fromId, entityType);
      if (fromIdStartTime == null) {
        return null;
      }
      if (fromIdStartTime <= endtime) {
        return kb.add(writeReverseOrderedLong(fromIdStartTime))
            .add(fromId).getBytesForLookup();
      }
    }
    return kb.add(writeReverseOrderedLong(endtime)).getBytesForLookup();
  }

  /**
   * Check if entity should be skipped based on insert timestamp.
   */
  private boolean shouldSkipEntity(Long fromTs, LeveldbIterator iterator,
      KeyParser kp) throws IOException {
    if (fromTs == null) {
      return false;
    }
    
    long insertTime = readReverseOrderedLong(iterator.peekNext()
        .getValue(), 0);
    if (insertTime > fromTs) {
      byte[] firstKey = iterator.peekNext().getKey();
      while (iterator.hasNext() && prefixMatches(firstKey,
          kp.getOffset(), iterator.peekNext().getKey())) {
        iterator.next();
      }
      return true;
    }
    return false;
  }

  /**
   * Check if entity should be added based on filters and ACL.
   */
  private boolean shouldAddEntity(TimelineEntity entity,
      Collection<NameValuePair> secondaryFilters, CheckAcl checkAcl) {
    if (!passesSecondaryFilters(entity, secondaryFilters)) {
      return false;
    }
    
    if (entity.getDomainId() == null) {
      entity.setDomainId(DEFAULT_DOMAIN_ID);
    }
    
    return checkAcl == null || checkAcl.check(entity);
  }

  /**
   * Check if entity passes secondary filters.
   */
  private boolean passesSecondaryFilters(TimelineEntity entity,
      Collection<NameValuePair> secondaryFilters) {
    if (secondaryFilters == null) {
      return true;
    }
    
    for (NameValuePair filter : secondaryFilters) {
      if (!entityMatchesFilter(entity, filter)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if entity matches a single filter.
   */
  private boolean entityMatchesFilter(TimelineEntity entity,
      NameValuePair filter) {
    Object v = entity.getOtherInfo().get(filter.getName());
    if (v == null) {
      Set<Object> vs = entity.getPrimaryFilters().get(filter.getName());
      return vs != null && vs.contains(filter.getValue());
    }
    return v.equals(filter.getValue());
  }
  
  /**
   * Handle error and set it in response.
   */
  private static void handleError(TimelineEntity entity, TimelinePutResponse response, final int errorCode) {
    TimelinePutError error = new TimelinePutError();
    error.setEntityId(entity.getEntityId());
    error.setEntityType(entity.getEntityType());
    error.setErrorCode(errorCode);
    response.addError(error);
  }

  /**
   * Put a single entity.  If there is an error, add a TimelinePutError to the
   * given response.
   */
  private void put(TimelineEntity entity, TimelinePutResponse response,
      boolean allowEmptyDomainId) {
    LockMap.CountingReentrantLock<EntityIdentifier> lock =
        writeLocks.getLock(new EntityIdentifier(entity.getEntityId(),
            entity.getEntityType()));
    lock.lock();
    WriteBatch writeBatch = null;
    List<EntityIdentifier> relatedEntitiesWithoutStartTimes =
        new ArrayList<EntityIdentifier>();
    byte[] revStartTime = null;
    Map<String, Set<Object>> primaryFilters = null;
    try {
      writeBatch = db.createWriteBatch();
      List<TimelineEvent> events = entity.getEvents();
      
      StartAndInsertTime startAndInsertTime = getAndSetStartTime(
          entity.getEntityId(), entity.getEntityType(),
          entity.getStartTime(), events);
      if (startAndInsertTime == null) {
        handleError(entity, response, TimelinePutError.NO_START_TIME);   
        return;
      }
      revStartTime = writeReverseOrderedLong(startAndInsertTime.startTime);
      primaryFilters = entity.getPrimaryFilters();

      writePutEntityMarker(writeBatch, entity, revStartTime, startAndInsertTime,
          primaryFilters);
      writePutEvents(writeBatch, entity, revStartTime, primaryFilters);
      writePutRelatedEntities(writeBatch, entity, revStartTime,
          relatedEntitiesWithoutStartTimes, response);
      writePutPrimaryFilters(writeBatch, entity, revStartTime, primaryFilters);
      writePutOtherInfo(writeBatch, entity, revStartTime, primaryFilters);
      writePutDomainId(writeBatch, entity, revStartTime, allowEmptyDomainId,
          response, primaryFilters);
      
      db.write(writeBatch);
    } catch (DBException de) {
      LOG.error("Error putting entity " + entity.getEntityId() +
                " of type " + entity.getEntityType(), de);
      handleError(entity, response, TimelinePutError.IO_EXCEPTION);
    } catch (IOException e) {
      LOG.error("Error putting entity " + entity.getEntityId() +
          " of type " + entity.getEntityType(), e);
      handleError(entity, response, TimelinePutError.IO_EXCEPTION);
    } finally {
      lock.unlock();
      writeLocks.returnLock(lock);
      IOUtils.cleanup(LOG, writeBatch);
    }

    processDeferredRelatedEntities(relatedEntitiesWithoutStartTimes, entity,
        revStartTime, response);
  }

  /**
   * Write entity marker to batch.
   */
  private void writePutEntityMarker(WriteBatch writeBatch, TimelineEntity entity,
      byte[] revStartTime, StartAndInsertTime startAndInsertTime,
      Map<String, Set<Object>> primaryFilters) throws IOException {
    byte[] markerKey = createEntityMarkerKey(entity.getEntityId(),
        entity.getEntityType(), revStartTime);
    byte[] markerValue = writeReverseOrderedLong(startAndInsertTime.insertTime);
    writeBatch.put(markerKey, markerValue);
    writePrimaryFilterEntries(writeBatch, primaryFilters, markerKey, markerValue);
  }

  /**
   * Write events to batch.
   */
  private void writePutEvents(WriteBatch writeBatch, TimelineEntity entity,
      byte[] revStartTime, Map<String, Set<Object>> primaryFilters)
      throws IOException {
    List<TimelineEvent> events = entity.getEvents();
    if (events == null || events.isEmpty()) {
      return;
    }
    
    for (TimelineEvent event : events) {
      byte[] revts = writeReverseOrderedLong(event.getTimestamp());
      byte[] key = createEntityEventKey(entity.getEntityId(),
          entity.getEntityType(), revStartTime, revts,
          event.getEventType());
      byte[] value = GenericObjectMapper.write(event.getEventInfo());
      writeBatch.put(key, value);
      writePrimaryFilterEntries(writeBatch, primaryFilters, key, value);
    }
  }

  /**
   * Write related entities to batch.
   */
  private void writePutRelatedEntities(WriteBatch writeBatch,
      TimelineEntity entity, byte[] revStartTime,
      List<EntityIdentifier> relatedEntitiesWithoutStartTimes,
      TimelinePutResponse response) throws IOException {
    Map<String, Set<String>> relatedEntities = entity.getRelatedEntities();
    if (relatedEntities == null || relatedEntities.isEmpty()) {
      return;
    }
    
    for (Entry<String, Set<String>> relatedEntityList :
        relatedEntities.entrySet()) {
      String relatedEntityType = relatedEntityList.getKey();
      for (String relatedEntityId : relatedEntityList.getValue()) {
        processRelatedEntity(writeBatch, entity, revStartTime,
            relatedEntityId, relatedEntityType,
            relatedEntitiesWithoutStartTimes, response);
      }
    }
  }

  /**
   * Process a single related entity.
   */
  private void processRelatedEntity(WriteBatch writeBatch, TimelineEntity entity,
      byte[] revStartTime, String relatedEntityId, String relatedEntityType,
      List<EntityIdentifier> relatedEntitiesWithoutStartTimes,
      TimelinePutResponse response) throws IOException {
    byte[] key = createReverseRelatedEntityKey(entity.getEntityId(),
        entity.getEntityType(), revStartTime, relatedEntityId,
        relatedEntityType);
    writeBatch.put(key, EMPTY_BYTES);
    
    byte[] relatedEntityStartTime = getStartTime(relatedEntityId,
        relatedEntityType);
    if (relatedEntityStartTime == null) {
      relatedEntitiesWithoutStartTimes.add(
          new EntityIdentifier(relatedEntityId, relatedEntityType));
      return;
    }
    
    if (!validateRelatedEntityDomain(writeBatch, entity, relatedEntityId,
        relatedEntityType, relatedEntityStartTime, response)) {
      return;
    }
    
    key = createRelatedEntityKey(relatedEntityId, relatedEntityType,
        relatedEntityStartTime, entity.getEntityId(), entity.getEntityType());
    writeBatch.put(key, EMPTY_BYTES);
  }

  /**
   * Validate related entity domain compatibility.
   */
  private boolean validateRelatedEntityDomain(WriteBatch writeBatch,
      TimelineEntity entity, String relatedEntityId, String relatedEntityType,
      byte[] relatedEntityStartTime, TimelinePutResponse response)
      throws IOException {
    byte[] domainIdBytes = db.get(createDomainIdKey(
        relatedEntityId, relatedEntityType, relatedEntityStartTime));
    
    String domainId = domainIdBytes == null ?
        TimelineDataManager.DEFAULT_DOMAIN_ID :
        new String(domainIdBytes, Charset.forName("UTF-8"));
    
    if (!domainId.equals(entity.getDomainId())) {
      handleError(entity, response, TimelinePutError.FORBIDDEN_RELATION);
      return false;
    }
    return true;
  }

  /**
   * Write primary filters to batch.
   */
  private void writePutPrimaryFilters(WriteBatch writeBatch,
      TimelineEntity entity, byte[] revStartTime,
      Map<String, Set<Object>> primaryFilters) throws IOException {
    if (primaryFilters == null || primaryFilters.isEmpty()) {
      return;
    }
    
    for (Entry<String, Set<Object>> primaryFilter :
        primaryFilters.entrySet()) {
      for (Object primaryFilterValue : primaryFilter.getValue()) {
        byte[] key = createPrimaryFilterKey(entity.getEntityId(),
            entity.getEntityType(), revStartTime,
            primaryFilter.getKey(), primaryFilterValue);
        writeBatch.put(key, EMPTY_BYTES);
        writePrimaryFilterEntries(writeBatch, primaryFilters, key, EMPTY_BYTES);
      }
    }
  }

  /**
   * Write other info to batch.
   */
  private void writePutOtherInfo(WriteBatch writeBatch, TimelineEntity entity,
      byte[] revStartTime, Map<String, Set<Object>> primaryFilters)
      throws IOException {
    Map<String, Object> otherInfo = entity.getOtherInfo();
    if (otherInfo == null || otherInfo.isEmpty()) {
      return;
    }
    
    for (Entry<String, Object> i : otherInfo.entrySet()) {
      byte[] key = createOtherInfoKey(entity.getEntityId(),
          entity.getEntityType(), revStartTime, i.getKey());
      byte[] value = GenericObjectMapper.write(i.getValue());
      writeBatch.put(key, value);
      writePrimaryFilterEntries(writeBatch, primaryFilters, key, value);
    }
  }

  /**
   * Write domain ID to batch.
   */
  private void writePutDomainId(WriteBatch writeBatch, TimelineEntity entity,
      byte[] revStartTime, boolean allowEmptyDomainId,
      TimelinePutResponse response, Map<String, Set<Object>> primaryFilters)
      throws IOException {
    byte[] key = createDomainIdKey(entity.getEntityId(),
        entity.getEntityType(), revStartTime);
    
    if (entity.getDomainId() == null || entity.getDomainId().length() == 0) {
      if (!allowEmptyDomainId) {
        handleError(entity, response, TimelinePutError.NO_DOMAIN);
      }
      return;
    }
    
    byte[] domainIdBytes = entity.getDomainId().getBytes(Charset.forName("UTF-8"));
    writeBatch.put(key, domainIdBytes);
    writePrimaryFilterEntries(writeBatch, primaryFilters, key, domainIdBytes);
  }

  /**
   * Process deferred related entities.
   */
  private void processDeferredRelatedEntities(
      List<EntityIdentifier> relatedEntitiesWithoutStartTimes,
      TimelineEntity entity, byte[] revStartTime, TimelinePutResponse response) {
    for (EntityIdentifier relatedEntity : relatedEntitiesWithoutStartTimes) {
      processDeferredRelatedEntity(relatedEntity, entity, revStartTime, response);
    }
  }

  /**
   * Process a single deferred related entity.
   */
  private void processDeferredRelatedEntity(EntityIdentifier relatedEntity,
      TimelineEntity entity, byte[] revStartTime, TimelinePutResponse response) {
    LockMap.CountingReentrantLock<EntityIdentifier> lock =
        writeLocks.getLock(relatedEntity);
    lock.lock();
    try {
      StartAndInsertTime relatedEntityStartAndInsertTime =
          getAndSetStartTime(relatedEntity.getId(), relatedEntity.getType(),
          readReverseOrderedLong(revStartTime, 0), null);
      if (relatedEntityStartAndInsertTime == null) {
        throw new IOException("Error setting start time for related entity");
      }
      byte[] relatedEntityStartTime = writeReverseOrderedLong(
          relatedEntityStartAndInsertTime.startTime);
      
      byte[] key = createDomainIdKey(relatedEntity.getId(),
          relatedEntity.getType(), relatedEntityStartTime);
      db.put(key, entity.getDomainId().getBytes(Charset.forName("UTF-8")));
      db.put(createRelatedEntityKey(relatedEntity.getId(),
          relatedEntity.getType(), relatedEntityStartTime,
          entity.getEntityId(), entity.getEntityType()), EMPTY_BYTES);
      db.put(createEntityMarkerKey(relatedEntity.getId(),
          relatedEntity.getType(), relatedEntityStartTime),
          writeReverseOrderedLong(relatedEntityStartAndInsertTime.insertTime));
    } catch (DBException de) {
      LOG.error("Error putting related entity " + relatedEntity.getId() +
          " of type " + relatedEntity.getType() + " for entity " +
          entity.getEntityId() + " of type " + entity.getEntityType(), de);
      handleError(entity, response, TimelinePutError.IO_EXCEPTION);
    } catch (IOException e) {
      LOG.error("Error putting related entity " + relatedEntity.getId() +
          " of type " + relatedEntity.getType() + " for entity " +
          entity.getEntityId() + " of type " + entity.getEntityType(), e);
      handleError(entity, response, TimelinePutError.IO_EXCEPTION);
    } finally {
      lock.unlock();
      writeLocks.returnLock(lock);
    }
  }

  /**
   * For a given key / value pair that has been written to the db,
   * write additional entries to the db for each primary filter.
   */
  private static void writePrimaryFilterEntries(WriteBatch writeBatch,
      Map<String, Set<Object>> primaryFilters, byte[] key, byte[] value)
      throws IOException {
    if (primaryFilters != null && !primaryFilters.isEmpty()) {
      for (Entry<String, Set<Object>> pf : primaryFilters.entrySet()) {
        for (Object pfval : pf.getValue()) {
          writeBatch.put(addPrimaryFilterToKey(pf.getKey(), pfval,
              key), value);
        }
      }
    }
  }

  @Override
  public TimelinePutResponse put(TimelineEntities entities) {
    try {
      deleteLock.readLock().lock();
      TimelinePutResponse response = new TimelinePutResponse();
      for (TimelineEntity entity : entities.getEntities()) {
        put(entity, response, false);
      }
      return response;
    } finally {
      deleteLock.readLock().unlock();
    }
  }

  @Private
  @VisibleForTesting
  public TimelinePutResponse putWithNoDomainId(TimelineEntities entities) {
    try {
      deleteLock.readLock().lock();
      TimelinePutResponse response = new TimelinePutResponse();
      for (TimelineEntity entity : entities.getEntities()) {
        put(entity, response, true);
      }
      return response;
    } finally {
      deleteLock.readLock().unlock();
    }
  }

  /**
   * Get the unique start time for a given entity as a byte array that sorts
   * the timestamps in reverse order (see {@link
   * GenericObjectMapper#writeReverseOrderedLong(long)}).
   *
   * @param entityId The id of the entity
   * @param entityType The type of the entity
   * @return A byte array, null if not found
   * @throws IOException
   */
  private byte[] getStartTime(String entityId, String entityType)
      throws IOException {
    Long l = getStartTimeLong(entityId, entityType);
    return l == null ? null : writeReverseOrderedLong(l);
  }

  /**
   * Get the unique start time for a given entity as a Long.
   *
   * @param entityId The id of the entity
   * @param entityType The type of the entity
   * @return A Long, null if not found
   * @throws IOException
   */
  private Long getStartTimeLong(String entityId, String entityType)
      throws IOException {
    EntityIdentifier entity = new EntityIdentifier(entityId, entityType);
    try {
      if (startTimeReadCache.containsKey(entity)) {
        return startTimeReadCache.get(entity);
      }
      
      byte[] b = createStartTimeLookupKey(entity.getId(), entity.getType());
      byte[] v = db.get(b);
      if (v == null) {
        return null;
      }
      
      Long l = readReverseOrderedLong(v, 0);
      startTimeReadCache.put(entity, l);
      return l;
    } catch(DBException e) {
      throw new IOException(e);   
    }
  }

  /**
   * Get the unique start time for a given entity as a byte array that sorts
   * the timestamps in reverse order (see {@link
   * GenericObjectMapper#writeReverseOrderedLong(long)}). If the start time
   * doesn't exist, set it based on the information provided. Should only be
   * called when a lock has been obtained on the entity.
   *
   * @param entityId The id of the entity
   * @param entityType The type of the entity
   * @param startTime The start time of the entity, or null
   * @param events A list of events for the entity, or null
   * @return A StartAndInsertTime
   * @throws IOException
   */
  private StartAndInsertTime getAndSetStartTime(String entityId,
      String entityType, Long startTime, List<TimelineEvent> events)
      throws IOException {
    EntityIdentifier entity = new EntityIdentifier(entityId, entityType);
    
    if (startTime != null) {
      return getAndSetStartTimeWithProvidedTime(entity, startTime);
    }
    
    return getAndSetStartTimeWithoutProvidedTime(entity, events);
  }

  /**
   * Get and set start time when start time is provided.
   */
  private StartAndInsertTime getAndSetStartTimeWithProvidedTime(
      EntityIdentifier entity, Long startTime) throws IOException {
    if (startTimeWriteCache.containsKey(entity)) {
      return startTimeWriteCache.get(entity);
    }
    return checkStartTimeInDb(entity, startTime);
  }

  /**
   * Get and set start time when start time is not provided.
   */
  private StartAndInsertTime getAndSetStartTimeWithoutProvidedTime(
      EntityIdentifier entity, List<TimelineEvent> events) throws IOException {
    if (startTimeWriteCache.containsKey(entity)) {
      return startTimeWriteCache.get(entity);
    }
    
    Long suggestedStartTime = null;
    if (events != null) {
      suggestedStartTime = findMinEventTimestamp(events);
    }
    
    return checkStartTimeInDb(entity, suggestedStartTime);
  }

  /**
   * Find minimum timestamp from events.
   */
  private Long findMinEventTimestamp(List<TimelineEvent> events) {
    Long min = Long.MAX_VALUE;
    for (TimelineEvent e : events) {
      if (min > e.getTimestamp()) {
        min = e.getTimestamp();
      }
    }
    return min;
  }

  /**
   * Checks db for start time and returns it if it exists.  If it doesn't
   * exist, writes the suggested start time (if it is not null).  This is
   * only called when the start time is not found in the cache,
   * so it adds it back into the cache if it is found. Should only be called
   * when a lock has been obtained on the entity.
   */
  private StartAndInsertTime checkStartTimeInDb(EntityIdentifier entity,
      Long suggestedStartTime) throws IOException {
    StartAndInsertTime startAndInsertTime = null;
    byte[] b = createStartTimeLookupKey(entity.getId(), entity.getType());
    try {
      byte[] v = db.get(b);
      if (v == null) {
        if (suggestedStartTime == null) {
          return null;
        }
        startAndInsertTime = createAndStoreStartTime(b, suggestedStartTime);
      } else {
        startAndInsertTime = new StartAndInsertTime(readReverseOrderedLong(v, 0),
            readReverseOrderedLong(v, 8));
      }
    } catch(DBException e) {
      throw new IOException(e);            	
    } 
    startTimeWriteCache.put(entity, startAndInsertTime);
    startTimeReadCache.put(entity, startAndInsertTime.startTime);
    return startAndInsertTime;
  }

  /**
   * Create and store start time in database.
   */
  private StartAndInsertTime createAndStoreStartTime(byte[] key,
      Long suggestedStartTime) throws IOException {
    StartAndInsertTime startAndInsertTime = new StartAndInsertTime(
        suggestedStartTime, System.currentTimeMillis());
    
    byte[] v = new byte[16];
    writeReverseOrderedLong(suggestedStartTime, v, 0);
    writeReverseOrderedLong(startAndInsertTime.insertTime, v, 8);
    WriteOptions writeOptions = new WriteOptions();
    writeOptions.sync(true);
    db.put(key, v, writeOptions);
    
    return startAndInsertTime;
  }

  /**
   * Creates a key for looking up the start time of a given entity,
   * of the form START_TIME_LOOKUP_PREFIX + entity type + entity id.
   */
  private static byte[] createStartTimeLookupKey(String entityId,
      String entityType) throws IOException {
    return KeyBuilder.newInstance().add(START_TIME_LOOKUP_PREFIX)
        .add(entityType).add(entityId).getBytes();
  }

  /**
   * Creates an entity marker, serializing ENTITY_ENTRY_PREFIX + entity type +
   * revstarttime + entity id.
   */
  private static byte[] createEntityMarkerKey(String entityId,
      String entityType, byte[] revStartTime) throws IOException {
    return KeyBuilder.newInstance().add(ENTITY_ENTRY_PREFIX)
        .add(entityType).add(revStartTime).add(entityId).getBytesForLookup();
  }

  /**
   * Creates an index entry for the given key of the form
   * INDEXED_ENTRY_PREFIX + primaryfiltername + primaryfiltervalue + key.
   */
  private static byte[] addPrimaryFilterToKey(String primaryFilterName,
      Object primaryFilterValue, byte[] key) throws IOException {
    return KeyBuilder.newInstance().add(INDEXED_ENTRY_PREFIX)
        .add(primaryFilterName)
        .add(GenericObjectMapper.write(primaryFilterValue), true).add(key)
        .getBytes();
  }

  /**
   * Creates an event key, serializing ENTITY_ENTRY_PREFIX + entity type +
   * revstarttime + entity id + EVENTS_COLUMN + reveventtimestamp + event type.
   */
  private static byte[] createEntityEventKey(String entityId,
      String entityType, byte[] revStartTime, byte[] revEventTimestamp,
      String eventType) throws IOException {
    return KeyBuilder.newInstance().add(ENTITY_ENTRY_PREFIX)
        .add(entityType).add(revStartTime).add(entityId).add(EVENTS_COLUMN)
        .add(revEventTimestamp).add(eventType).getBytes();
  }

  /**
   * Creates an event object from the given key, offset, and value.  If the
   * event type is not contained in the specified set of event types,
   * returns null.
   */
  private static TimelineEvent getEntityEvent(Set<String> eventTypes,
      byte[] key, int offset, byte[] value) throws IOException {
    KeyParser kp = new KeyParser(key, offset);
    long ts = kp.getNextLong();
    String tstype = kp.getNextString();
    if (eventTypes == null || eventTypes.contains(tstype)) {
      TimelineEvent event = new TimelineEvent();
      event.setTimestamp(ts);
      event.setEventType(tstype);
      Object o = GenericObjectMapper.read(value);
      if (o == null) {
        event.setEventInfo(null);
      } else if (o instanceof Map) {
        @SuppressWarnings("unchecked")
        Map<String, Object> m = (Map<String, Object>) o;
        event.setEventInfo(m);
      } else {
        throw new IOException("Couldn't deserialize event info map");
      }
      return event;
    }
    return null;
  }

  /**
   * Creates a primary filter key, serializing ENTITY_ENTRY_PREFIX +
   * entity type + revstarttime + entity id + PRIMARY_FILTERS_COLUMN + name +
   * value.
   */
  private static byte[] createPrimaryFilterKey(String entityId,
      String entityType, byte[] revStartTime, String name, Object value)
      throws IOException {
    return KeyBuilder.newInstance().add(ENTITY_ENTRY_PREFIX).add(entityType)
        .add(revStartTime).add(entityId).add(PRIMARY_FILTERS_COLUMN).add(name)
        .add(GenericObjectMapper.write(value)).getBytes();
  }

  /**
   * Parses the primary filter from the given key at the given offset and
   * adds it to the given entity.
   */
  private static void addPrimaryFilter(TimelineEntity entity, byte[] key,
      int offset) throws IOException {
    KeyParser kp = new KeyParser(key, offset);
    String name = kp.getNextString();
    Object value = GenericObjectMapper.read(key, kp.getOffset());
    entity.addPrimaryFilter(name, value);
  }

  /**
   * Creates an other info key, serializing ENTITY_ENTRY_PREFIX + entity type +
   * revstarttime + entity id + OTHER_INFO_COLUMN + name.
   */
  private static byte[] createOtherInfoKey(String entityId, String entityType,
      byte[] revStartTime, String name) throws IOException {
    return KeyBuilder.newInstance().add(ENTITY_ENTRY_PREFIX).add(entityType)
        .add(revStartTime).add(entityId).add(OTHER_INFO_COLUMN).add(name)
        .getBytes();
  }

  /**
   * Creates a string representation of the byte array from the given offset
   * to the end of the array (for parsing other info keys).
   */
  private static String parseRemainingKey(byte[] b, int offset) {
    return new String(b, offset, b.length - offset, Charset.forName("UTF-8"));
  }

  /**
   * Creates a related entity key, serializing ENTITY_ENTRY_PREFIX +
   * entity type + revstarttime + entity id + RELATED_ENTITIES_COLUMN +
   * relatedentity type + relatedentity id.
   */
  private static byte[] createRelatedEntityKey(String entityId,
      String entityType, byte[] revStartTime, String relatedEntityId,
      String relatedEntityType) throws IOException {
    return KeyBuilder.newInstance().add(ENTITY_ENTRY_PREFIX).add(entityType)
        .add(revStartTime).add(entityId).add(RELATED_ENTITIES_COLUMN)
        .add(relatedEntityType).add(relatedEntityId).getBytes();
  }

  /**
   * Parses the related entity from the given key at the given offset and
   * adds it to the given entity.
   */
  private static void addRelatedEntity(TimelineEntity entity, byte[] key,
      int offset) throws IOException {
    KeyParser kp = new KeyParser(key, offset);
    String type = kp.getNextString();
    String id = kp.getNextString();
    entity.addRelatedEntity(type, id);
  }

  /**
   * Creates a reverse related entity key, serializing ENTITY_ENTRY_PREFIX +
   * entity type + revstarttime + entity id +
   * INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN +
   * relatedentity type + relatedentity id.
   */
  private static byte[] createReverseRelatedEntityKey(String entityId,
      String entityType, byte[] revStartTime, String relatedEntityId,
      String relatedEntityType) throws IOException {
    return KeyBuilder.newInstance().add(ENTITY_ENTRY_PREFIX).add(entityType)
        .add(revStartTime).add(entityId)
        .add(INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN)
        .add(relatedEntityType).add(relatedEntityId).getBytes();
  }

  /**
   * Creates a domain id key, serializing ENTITY_ENTRY_PREFIX +
   * entity type + revstarttime + entity id + DOMAIN_ID_COLUMN.
   */
  private static byte[] createDomainIdKey(String entityId,
      String entityType, byte[] revStartTime) throws IOException {
    return KeyBuilder.newInstance().add(ENTITY_ENTRY_PREFIX).add(entityType)
        .add(revStartTime).add(entityId).add(DOMAIN_ID_COLUMN).getBytes();
  }
  /**
   * Clears the cache to test reloading start times from leveldb (only for
   * testing).
   */
  @VisibleForTesting
  void clearStartTimeCache() {
    startTimeWriteCache.clear();
    startTimeReadCache.clear();
  }

  @VisibleForTesting
  static int getStartTimeReadCacheSize(Configuration conf) {
    return conf.getInt(
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_READ_CACHE_SIZE,
        YarnConfiguration.
            DEFAULT_TIMELINE_SERVICE_LEVELDB_START_TIME_READ_CACHE_SIZE);
  }

  @VisibleForTesting
  static int getStartTimeWriteCacheSize(Configuration conf) {
    return conf.getInt(
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_WRITE_CACHE_SIZE,
        YarnConfiguration.
            DEFAULT_TIMELINE_SERVICE_LEVELDB_START_TIME_WRITE_CACHE_SIZE);
  }

  @VisibleForTesting
  List<String> getEntityTypes() throws IOException {
    LeveldbIterator iterator = null;
    try {
      iterator = getDbIterator(false);
      List<String> entityTypes = new ArrayList<String>();
      iterator.seek(ENTITY_ENTRY_PREFIX);
      while (iterator.hasNext()) {
        byte[] key = iterator.peekNext().getKey();
        if (key[0] != ENTITY_ENTRY_PREFIX[0]) {
          break;
        }
        KeyParser kp = new KeyParser(key,
            ENTITY_ENTRY_PREFIX.length);
        String entityType = kp.getNextString();
        entityTypes.add(entityType);
        byte[] lookupKey = KeyBuilder.newInstance().add(ENTITY_ENTRY_PREFIX)
            .add(entityType).getBytesForLookup();
        if (lookupKey[lookupKey.length - 1] != 0x0) {
          throw new IOException("Found unexpected end byte in lookup key");
        }
        lookupKey[lookupKey.length - 1] = 0x1;
        iterator.seek(lookupKey);
      }
      return entityTypes;
    } catch(DBException e) {
      throw new IOException(e);            	
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
  }

  /**
   * Finds all keys in the db that have a given prefix and deletes them on
   * the given write batch.
   */
  private void deleteKeysWithPrefix(WriteBatch writeBatch, byte[] prefix,
      LeveldbIterator iterator) {
    for (iterator.seek(prefix); iterator.hasNext(); iterator.next()) {
      byte[] key = iterator.peekNext().getKey();
      if (!prefixMatches(prefix, prefix.length, key)) {
        break;
      }
      writeBatch.delete(key);
    }
  }

  @VisibleForTesting
  boolean deleteNextEntity(String entityType, byte[] reverseTimestamp,
      LeveldbIterator iterator, LeveldbIterator pfIterator, boolean seeked)
      throws IOException {
    WriteBatch writeBatch = null;
    try {
      KeyBuilder kb = KeyBuilder.newInstance().add(ENTITY_ENTRY_PREFIX)
          .add(entityType);
      byte[] typePrefix = kb.getBytesForLookup();
      kb.add(reverseTimestamp);
      if (!seeked) {
        iterator.seek(kb.getBytesForLookup());
      }
      if (!iterator.hasNext()) {
        return false;
      }
      byte[] entityKey = iterator.peekNext().getKey();
      if (!prefixMatches(typePrefix, typePrefix.length, entityKey)) {
        return false;
      }

      KeyParser kp = new KeyParser(entityKey, typePrefix.length + 8);
      String entityId = kp.getNextString();
      int prefixlen = kp.getOffset();
      byte[] deletePrefix = new byte[prefixlen];
      System.arraycopy(entityKey, 0, deletePrefix, 0, prefixlen);

      writeBatch = db.createWriteBatch();

      if (LOG.isDebugEnabled()) {
        LOG.debug("Deleting entity type:" + entityType + " id:" + entityId);
      }
      
      writeBatch.delete(createStartTimeLookupKey(entityId, entityType));
      EntityIdentifier entityIdentifier =
          new EntityIdentifier(entityId, entityType);
      startTimeReadCache.remove(entityIdentifier);
      startTimeWriteCache.remove(entityIdentifier);

      deleteEntityKeys(writeBatch, iterator, entityKey, prefixlen, entityType,
          entityId, pfIterator);
      
      WriteOptions writeOptions = new WriteOptions();
      writeOptions.sync(true);
      db.write(writeBatch, writeOptions);
      return true;
    } catch(DBException e) {
      throw new IOException(e);
    } finally {
      IOUtils.cleanup(LOG, writeBatch);
    }
  }

  /**
   * Delete all keys for an entity.
   */
  private void deleteEntityKeys(WriteBatch writeBatch, LeveldbIterator iterator,
      byte[] entityKey, int prefixlen, String entityType, String entityId,
      LeveldbIterator pfIterator) throws IOException {
    for (; iterator.hasNext(); iterator.next()) {
      byte[] key = iterator.peekNext().getKey();
      if (!prefixMatches(entityKey, prefixlen, key)) {
        break;
      }
      writeBatch.delete(key);

      if (key.length == prefixlen) {
        continue;
      }
      
      processDeleteKeyColumn(writeBatch, key, prefixlen, entityType, entityId,
          pfIterator);
    }
  }

  /**
   * Process a column during entity deletion.
   */
  private void processDeleteKeyColumn(WriteBatch writeBatch, byte[] key,
      int prefixlen, String entityType, String entityId,
      LeveldbIterator pfIterator) throws IOException {
    byte columnType = key[prefixlen];
    
    if (columnType == PRIMARY_FILTERS_COLUMN[0]) {
      deleteEntityPrimaryFilter(writeBatch, key, prefixlen, entityType,
          entityId, pfIterator);
    } else if (columnType == RELATED_ENTITIES_COLUMN[0]) {
      deleteEntityRelatedEntity(writeBatch, key, prefixlen, entityType,
          entityId);
    } else if (columnType == INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN[0]) {
      deleteEntityInvisibleRelatedEntity(writeBatch, key, prefixlen,
          entityType, entityId);
    }
  }

  /**
   * Delete primary filter during entity deletion.
   */
  private void deleteEntityPrimaryFilter(WriteBatch writeBatch, byte[] key,
      int prefixlen, String entityType, String entityId,
      LeveldbIterator pfIterator) throws IOException {
    KeyParser kp = new KeyParser(key,
        prefixlen + PRIMARY_FILTERS_COLUMN.length);
    String name = kp.getNextString();
    Object value = GenericObjectMapper.read(key, kp.getOffset());
    byte[] deletePrefix = new byte[prefixlen];
    System.arraycopy(key, 0, deletePrefix, 0, prefixlen);
    deleteKeysWithPrefix(writeBatch, addPrimaryFilterToKey(name, value,
        deletePrefix), pfIterator);
    if (LOG.isDebugEnabled()) {
      LOG.debug("Deleting entity type:" + entityType + " id:" +
          entityId + " primary filter entry " + name + " " + value);
    }
  }

  /**
   * Delete related entity during entity deletion.
   */
  private void deleteEntityRelatedEntity(WriteBatch writeBatch, byte[] key,
      int prefixlen, String entityType, String entityId) throws IOException {
    KeyParser kp = new KeyParser(key,
        prefixlen + RELATED_ENTITIES_COLUMN.length);
    String type = kp.getNextString();
    String id = kp.getNextString();
    byte[] relatedEntityStartTime = getStartTime(id, type);
    if (relatedEntityStartTime == null) {
      LOG.warn("Found no start time for related entity " + id + " of type " +
          type + " while deleting " + entityId + " of type " + entityType);
      return;
    }
    writeBatch.delete(createReverseRelatedEntityKey(id, type,
        relatedEntityStartTime, entityId, entityType));
    if (LOG.isDebugEnabled()) {
      LOG.debug("Deleting entity type:" + entityType + " id:" +
          entityId + " from invisible reverse related entity entry of type:" +
          type + " id:" + id);
    }
  }

  /**
   * Delete invisible related entity during entity deletion.
   */
  private void deleteEntityInvisibleRelatedEntity(WriteBatch writeBatch,
      byte[] key, int prefixlen, String entityType, String entityId)
      throws IOException {
    KeyParser kp = new KeyParser(key, prefixlen +
        INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN.length);
    String type = kp.getNextString();
    String id = kp.getNextString();
    byte[] relatedEntityStartTime = getStartTime(id, type);
    if (relatedEntityStartTime == null) {
      LOG.warn("Found no start time for reverse related entity " + id +
          " of type " + type + " while deleting " + entityId + " of type " +
          entityType);
      return;
    }
    writeBatch.delete(createRelatedEntityKey(id, type,
        relatedEntityStartTime, entityId, entityType));
    if (LOG.isDebugEnabled()) {
      LOG.debug("Deleting entity type:" + entityType + " id:" +
          entityId + " from related entity entry of type:" + type + " id:" + id);
    }
  }

  /**
   * Discards entities with start timestamp less than or equal to the given
   * timestamp.
   */
  @VisibleForTesting
  void discardOldEntities(long timestamp)
      throws IOException, InterruptedException {
    byte[] reverseTimestamp = writeReverseOrderedLong(timestamp);
    long totalCount = 0;
    long t1 = System.currentTimeMillis();
    try {
      List<String> entityTypes = getEntityTypes();
      for (String entityType : entityTypes) {
        totalCount += discardEntitiesOfType(entityType, reverseTimestamp);
      }
    } finally {
      long t2 = System.currentTimeMillis();
      LOG.info("Discarded " + totalCount + " entities for timestamp " +
          timestamp + " and earlier in " + (t2 - t1) / 1000.0 + " seconds");
    }
  }

  /**
   * Discard entities of a specific type.
   */
  private long discardEntitiesOfType(String entityType, byte[] reverseTimestamp)
      throws IOException, InterruptedException {
    LeveldbIterator iterator = null;
    LeveldbIterator pfIterator = null;
    long typeCount = 0;
    try {
      deleteLock.writeLock().lock();
      iterator = getDbIterator(false);
      pfIterator = getDbIterator(false);

      if (deletionThread != null && deletionThread.isInterrupted()) {
        throw new InterruptedException();
      }
      boolean seeked = false;
      while (deleteNextEntity(entityType, reverseTimestamp, iterator,
          pfIterator, seeked)) {
        typeCount++;
        seeked = true;
        if (deletionThread != null && deletionThread.isInterrupted()) {
          throw new InterruptedException();
        }
      }
    } catch (IOException e) {
      LOG.error("Got IOException while deleting entities for type " +
          entityType + ", continuing to next type", e);
    } finally {
      IOUtils.cleanup(LOG, iterator, pfIterator);
      deleteLock.writeLock().unlock();
      if (typeCount > 0) {
        LOG.info("Deleted " + typeCount + " entities of type " + entityType);
      }
    }
    return typeCount;
  }

  @VisibleForTesting
  LeveldbIterator getDbIterator(boolean fillCache) {
    ReadOptions readOptions = new ReadOptions();
    readOptions.fillCache(fillCache);
    return new LeveldbIterator(db, readOptions);
  }
  
  Version loadVersion() throws IOException {
    try {
      byte[] data = db.get(bytes(TIMELINE_STORE_VERSION_KEY));
      if (data == null || data.length == 0) {
        return getCurrentVersion();
      }
      Version version =
          new VersionPBImpl(VersionProto.parseFrom(data));
      return version;
    } catch(DBException e) {
      throw new IOException(e);    	
    }
  }
  
  @VisibleForTesting
  void storeVersion(Version state) throws IOException {
    dbStoreVersion(state);
  }
  
  private void dbStoreVersion(Version state) throws IOException {
    String key = TIMELINE_STORE_VERSION_KEY;
    byte[] data = 
        ((VersionPBImpl) state).getProto().toByteArray();
    try {
      db.put(bytes(key), data);
    } catch (DBException e) {
      throw new IOException(e);
    }
  }

  Version getCurrentVersion() {
    return CURRENT_VERSION_INFO;
  }
  
  /**
   * 1) Versioning timeline store: major.minor. For e.g. 1.0, 1.1, 1.2...1.25, 2.0 etc.
   * 2) Any incompatible change of TS-store is a major upgrade, and any
   *    compatible change of TS-store is a minor upgrade.
   * 3) Within a minor upgrade, say 1.1 to 1.2:
   *    overwrite the version info and proceed as normal.
   * 4) Within a major upgrade, say 1.2 to 2.0:
   *    throw exception and indicate user to use a separate upgrade tool to
   *    upgrade timeline store or remove incompatible old state.
   */
  private void checkVersion() throws IOException {
    Version loadedVersion = loadVersion();
    LOG.info("Loaded timeline store version info " + loadedVersion);
    if (loadedVersion.equals(getCurrentVersion())) {
      return;
    }
    if (loadedVersion.isCompatibleTo(getCurrentVersion())) {
      LOG.info("Storing timeline store version info " + getCurrentVersion());
      dbStoreVersion(CURRENT_VERSION_INFO);
    } else {
      String incompatibleMessage = 
          "Incompatible version for timeline store: expecting version " 
              + getCurrentVersion() + ", but loading version " + loadedVersion;
      LOG.fatal(incompatibleMessage);
      throw new IOException(incompatibleMessage);
    }
  }

  @Override
  public void put(TimelineDomain domain) throws IOException {
    WriteBatch writeBatch = null;
    try {
      writeBatch = db.createWriteBatch();
      validateDomain(domain);

      writeDomainDescription(writeBatch, domain);
      writeDomainOwner(writeBatch, domain);
      writeDomainReaders(writeBatch, domain);
      writeDomainWriters(writeBatch, domain);
      writeDomainTimestamps(writeBatch, domain);
      
      db.write(writeBatch);
    } catch(DBException e) {
      throw new IOException(e);            	
    } finally {
      IOUtils.cleanup(LOG, writeBatch);
    }
  }

  /**
   * Validate domain has required fields.
   */
  private void validateDomain(TimelineDomain domain) {
    if (domain.getId() == null || domain.getId().length() == 0) {
      throw new IllegalArgumentException("Domain doesn't have an ID");
    }
    if (domain.getOwner() == null || domain.getOwner().length() == 0) {
      throw new IllegalArgumentException("Domain doesn't have an owner.");
    }
  }

  /**
   * Write domain description.
   */
  private void writeDomainDescription(WriteBatch writeBatch,
      TimelineDomain domain) throws IOException {
    byte[] domainEntryKey = createDomainEntryKey(
        domain.getId(), DESCRIPTION_COLUMN);
    byte[] ownerLookupEntryKey = createOwnerLookupKey(
        domain.getOwner(), domain.getId(), DESCRIPTION_COLUMN);
    byte[] descriptionBytes = domain.getDescription() != null ?
        domain.getDescription().getBytes(Charset.forName("UTF-8")) :
        EMPTY_BYTES;
    writeBatch.put(domainEntryKey, descriptionBytes);
    writeBatch.put(ownerLookupEntryKey, descriptionBytes);
  }

  /**
   * Write domain owner.
   */
  private void writeDomainOwner(WriteBatch writeBatch, TimelineDomain domain)
      throws IOException {
    byte[] domainEntryKey = createDomainEntryKey(domain.getId(), OWNER_COLUMN);
    byte[] ownerLookupEntryKey = createOwnerLookupKey(
        domain.getOwner(), domain.getId(), OWNER_COLUMN);
    byte[] ownerBytes = domain.getOwner().getBytes(Charset.forName("UTF-8"));
    writeBatch.put(domainEntryKey, ownerBytes);
    writeBatch.put(ownerLookupEntryKey, ownerBytes);
  }

  /**
   * Write domain readers.
   */
  private void writeDomainReaders(WriteBatch writeBatch, TimelineDomain domain)
      throws IOException {
    byte[] domainEntryKey = createDomainEntryKey(domain.getId(), READER_COLUMN);
    byte[] ownerLookupEntryKey = createOwnerLookupKey(
        domain.getOwner(), domain.getId(), READER_COLUMN);
    byte[] readersBytes = (domain.getReaders() != null &&
        domain.getReaders().length() > 0) ?
        domain.getReaders().getBytes(Charset.forName("UTF-8")) :
        EMPTY_BYTES;
    writeBatch.put(domainEntryKey, readersBytes);
    writeBatch.put(ownerLookupEntryKey, readersBytes);
  }

  /**
   * Write domain writers.
   */
  private void writeDomainWriters(WriteBatch writeBatch, TimelineDomain domain)
      throws IOException {
    byte[] domainEntryKey = createDomainEntryKey(domain.getId(), WRITER_COLUMN);
    byte[] ownerLookupEntryKey = createOwnerLookupKey(
        domain.getOwner(), domain.getId(), WRITER_COLUMN);
    byte[] writersBytes = (domain.getWriters() != null &&
        domain.getWriters().length() > 0) ?
        domain.getWriters().getBytes(Charset.forName("UTF-8")) :
        EMPTY_BYTES;
    writeBatch.put(domainEntryKey, writersBytes);
    writeBatch.put(ownerLookupEntryKey, writersBytes);
  }

  /**
   * Write domain timestamps.
   */
  private void writeDomainTimestamps(WriteBatch writeBatch,
      TimelineDomain domain) throws IOException {
    byte[] domainEntryKey = createDomainEntryKey(domain.getId(),
        TIMESTAMP_COLUMN);
    byte[] ownerLookupEntryKey = createOwnerLookupKey(
        domain.getOwner(), domain.getId(), TIMESTAMP_COLUMN);
    long currentTimestamp = System.currentTimeMillis();
    byte[] timestamps = db.get(domainEntryKey);
    if (timestamps == null) {
      timestamps = new byte[16];
      writeReverseOrderedLong(currentTimestamp, timestamps, 0);
      writeReverseOrderedLong(currentTimestamp, timestamps, 8);
    } else {
      writeReverseOrderedLong(currentTimestamp, timestamps, 8);
    }
    writeBatch.put(domainEntryKey, timestamps);
    writeBatch.put(ownerLookupEntryKey, timestamps);
  }

  /**
   * Creates a domain entity key with column name suffix,
   * of the form DOMAIN_ENTRY_PREFIX + domain id + column name.
   */
  private static byte[] createDomainEntryKey(String domainId,
      byte[] columnName) throws IOException {
    return KeyBuilder.newInstance().add(DOMAIN_ENTRY_PREFIX)
        .add(domainId).add(columnName).getBytes();
  }

  /**
   * Creates an owner lookup key with column name suffix,
   * of the form OWNER_LOOKUP_PREFIX + owner + domain id + column name.
   */
  private static byte[] createOwnerLookupKey(
      String owner, String domainId, byte[] columnName) throws IOException {
    return KeyBuilder.newInstance().add(OWNER_LOOKUP_PREFIX)
        .add(owner).add(domainId).add(columnName).getBytes();
  }

  @Override
  public TimelineDomain getDomain(String domainId)
      throws IOException {
    LeveldbIterator iterator = null;
    try {
      byte[] prefix = KeyBuilder.newInstance()
          .add(DOMAIN_ENTRY_PREFIX).add(domainId).getBytesForLookup();
      iterator = new LeveldbIterator(db);
      iterator.seek(prefix);
      return getTimelineDomain(iterator, domainId, prefix);
    } catch(DBException e) {
      throw new IOException(e);            	
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
  }

  @Override
  public TimelineDomains getDomains(String owner)
      throws IOException {
    LeveldbIterator iterator = null;
    try {
      byte[] prefix = KeyBuilder.newInstance()
          .add(OWNER_LOOKUP_PREFIX).add(owner).getBytesForLookup();
      List<TimelineDomain> domains = new ArrayList<TimelineDomain>();
      for (iterator = new LeveldbIterator(db), iterator.seek(prefix);
          iterator.hasNext();) {
        byte[] key = iterator.peekNext().getKey();
        if (!prefixMatches(prefix, prefix.length, key)) {
          break;
        }
        KeyParser kp = new KeyParser(key, prefix.length);
        String domainId = kp.getNextString();
        byte[] prefixExt = KeyBuilder.newInstance().add(OWNER_LOOKUP_PREFIX)
            .add(owner).add(domainId).getBytesForLookup();
        TimelineDomain domainToReturn =
            getTimelineDomain(iterator, domainId, prefixExt);
        if (domainToReturn != null) {
          domains.add(domainToReturn);
        }
      }
      Collections.sort(domains, new DomainComparator());
      TimelineDomains domainsToReturn = new TimelineDomains();
      domainsToReturn.addDomains(domains);
      return domainsToReturn;
    } catch(DBException e) {
      throw new IOException(e);            	
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
  }

  /**
   * Comparator for sorting domains by creation and modification time.
   */
  private static class DomainComparator implements Comparator<TimelineDomain> {
    @Override
    public int compare(TimelineDomain domain1, TimelineDomain domain2) {
      int result = domain2.getCreatedTime().compareTo(
          domain1.getCreatedTime());
      if (result == 0) {
        return domain2.getModifiedTime().compareTo(
            domain1.getModifiedTime());
      }
      return result;
    }
  }

  private static TimelineDomain getTimelineDomain(
      LeveldbIterator iterator, String domainId, byte[] prefix) throws IOException {
    TimelineDomain domain = new TimelineDomain();
    domain.setId(domainId);
    boolean noRows = true;
    for (; iterator.hasNext(); iterator.next()) {
      byte[] key = iterator.peekNext().getKey();
      if (!prefixMatches(prefix, prefix.length, key)) {
        break;
      }
      if (noRows) {
        noRows = false;
      }
      processDomainColumn(domain, key, prefix);
    }
    return noRows ? null : domain;
  }

  /**
   * Process a domain column.
   */
  private static void processDomainColumn(TimelineDomain domain, byte[] key,
      byte[] prefix) throws IOException {
    byte[] value = domain.getId().getBytes();
    LeveldbIterator iterator = new LeveldbIterator(null);
    byte[] iterValue = iterator.peekNext().getValue();
    if (iterValue == null || iterValue.length == 0) {
      return;
    }
    
    byte columnType = key[prefix.length];
    if (columnType == DESCRIPTION_COLUMN[0]) {
      domain.setDescription(new String(iterValue, Charset.forName("UTF-8")));
    } else if (columnType == OWNER_COLUMN[0]) {
      domain.setOwner(new String(iterValue, Charset.forName("UTF-8")));
    } else if (columnType == READER_COLUMN[0]) {
      domain.setReaders(new String(iterValue, Charset.forName("UTF-8")));
    } else if (columnType == WRITER_COLUMN[0]) {
      domain.setWriters(new String(iterValue, Charset.forName("UTF-8")));
    } else if (columnType == TIMESTAMP_COLUMN[0]) {
      domain.setCreatedTime(readReverseOrderedLong(iterValue, 0));
      domain.setModifiedTime(readReverseOrderedLong(iterValue, 8));
    } else {
      LOG.error("Unrecognized domain column: " + columnType);
    }
  }
}