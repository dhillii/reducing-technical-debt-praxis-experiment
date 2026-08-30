/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
    validateConfigurationProperties(conf);
    Options options = createDbOptions(conf);
    Path dbPath = getDbPath(conf);
    FileSystem localFS = null;
    try {
      localFS = FileSystem.getLocal(conf);
      prepareLeveldbDirectory(dbPath, localFS);
    } finally {
      IOUtils.cleanup(LOG, localFS);
    }
    LOG.info("Using leveldb path " + dbPath);
    db = openDatabase(dbPath, options);
    checkVersion();
    initializeCaches(conf);
    startDeletionThreadIfEnabled(conf);

    super.serviceInit(conf);
  }

  private void validateConfigurationProperties(Configuration conf) {
    validateTtlProperty(conf);
    validateTtlIntervalProperty(conf);
    validateReadCacheSizeProperty(conf);
    validateStartTimeReadCacheSizeProperty(conf);
    validateStartTimeWriteCacheSizeProperty(conf);
  }

  private void validateTtlProperty(Configuration conf) {
    Preconditions.checkArgument(conf.getLong(
        YarnConfiguration.TIMELINE_SERVICE_TTL_MS,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_TTL_MS) > 0,
        "%s property value should be greater than zero",
        YarnConfiguration.TIMELINE_SERVICE_TTL_MS);
  }

  private void validateTtlIntervalProperty(Configuration conf) {
    Preconditions.checkArgument(conf.getLong(
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_TTL_INTERVAL_MS,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_TTL_INTERVAL_MS) > 0,
        "%s property value should be greater than zero",
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_TTL_INTERVAL_MS);
  }

  private void validateReadCacheSizeProperty(Configuration conf) {
    Preconditions.checkArgument(conf.getLong(
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE) >= 0,
        "%s property value should be greater than or equal to zero",
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE);
  }

  private void validateStartTimeReadCacheSizeProperty(Configuration conf) {
    Preconditions.checkArgument(conf.getLong(
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_READ_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_START_TIME_READ_CACHE_SIZE) > 0,
        " %s property value should be greater than zero",
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_READ_CACHE_SIZE);
  }

  private void validateStartTimeWriteCacheSizeProperty(Configuration conf) {
    Preconditions.checkArgument(conf.getLong(
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_WRITE_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_START_TIME_WRITE_CACHE_SIZE) > 0,
        "%s property value should be greater than zero",
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_WRITE_CACHE_SIZE);
  }

  private Options createDbOptions(Configuration conf) {
    Options options = new Options();
    options.createIfMissing(true);
    options.cacheSize(conf.getLong(
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE));
    return options;
  }

  private Path getDbPath(Configuration conf) {
    return new Path(
        conf.get(YarnConfiguration.TIMELINE_SERVICE_LEVELDB_PATH), FILENAME);
  }

  private void prepareLeveldbDirectory(Path dbPath, FileSystem localFS) throws IOException {
    if (!localFS.exists(dbPath)) {
      if (!localFS.mkdirs(dbPath)) {
        throw new IOException("Couldn't create directory for leveldb " +
            "timeline store " + dbPath);
      }
      localFS.setPermission(dbPath, LEVELDB_DIR_UMASK);
    }
  }

  private DB openDatabase(Path dbPath, Options options) throws IOException {
    try {
      JniDBFactory factory = new JniDBFactory();
      return factory.open(new File(dbPath.toString()), options);
    } catch (DBException e) {
      throw new IOException(e);
    }
  }

  private void initializeCaches(Configuration conf) {
    startTimeWriteCache =
        Collections.synchronizedMap(new LRUMap(getStartTimeWriteCacheSize(
            conf)));
    startTimeReadCache =
        Collections.synchronizedMap(new LRUMap(getStartTimeReadCacheSize(
            conf)));
  }

  private void startDeletionThreadIfEnabled(Configuration conf) {
    if (conf.getBoolean(YarnConfiguration.TIMELINE_SERVICE_TTL_ENABLE, true)) {
      deletionThread = new EntityDeletionThread(conf);
      deletionThread.start();
    }
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
    configureEntityFieldFlags(entity, fields);

    // iterate through the entity's entry, parsing information if it is part
    // of a requested field
    iterateAndParseEntityEntries(entity, iterator, entityId, entityType,
        prefix, prefixlen, fields);

    entity.setEntityId(entityId);
    entity.setEntityType(entityType);
    entity.setStartTime(startTime);

    return entity;
  }

  private static void configureEntityFieldFlags(TimelineEntity entity, EnumSet<Field> fields) {
    boolean events = fields.contains(Field.EVENTS);
    boolean lastEventOnly = fields.contains(Field.LAST_EVENT_ONLY);
    
    if (events) {
      // events will be populated during iteration
    } else if (lastEventOnly) {
      // last event only will be populated during iteration
    } else {
      entity.setEvents(null);
    }
    
    configureFieldFlag(entity,
        fields.contains(Field.RELATED_ENTITIES),
        Field.RELATED_ENTITIES, entity::setRelatedEntities);
    
    configureFieldFlag(entity,
        fields.contains(Field.PRIMARY_FILTERS),
        Field.PRIMARY_FILTERS, entity::setPrimaryFilters);
    
    configureFieldFlag(entity,
        fields.contains(Field.OTHER_INFO),
        Field.OTHER_INFO, entity::setOtherInfo);
  }

  private static void configureFieldFlag(TimelineEntity entity, boolean shouldInclude, Field field, java.util.function.Consumer<Collection<?>> setter) {
    if (shouldInclude) {
      // Keep default initialization - will be populated during iteration
    } else {
      setter.accept(null);
    }
  }

  private static void iterateAndParseEntityEntries(TimelineEntity entity,
      LeveldbIterator iterator, String entityId, String entityType,
      byte[] prefix, int prefixlen, EnumSet<Field> fields) throws IOException {
    boolean lastEventOnly = fields.contains(Field.LAST_EVENT_ONLY);
    boolean events = fields.contains(Field.EVENTS) || lastEventOnly;
    boolean relatedEntities = fields.contains(Field.RELATED_ENTITIES);
    boolean primaryFilters = fields.contains(Field.PRIMARY_FILTERS);
    boolean otherInfo = fields.contains(Field.OTHER_INFO);

    for (; iterator.hasNext(); iterator.next()) {
      byte[] key = iterator.peekNext().getKey();
      if (!prefixMatches(prefix, prefixlen, key)) {
        break;
      }
      if (key.length == prefixlen) {
        continue;
      }
      
      int columnOffset = prefixlen;
      if (key[columnOffset] == PRIMARY_FILTERS_COLUMN[0]) {
        if (primaryFilters) {
          addPrimaryFilter(entity, key,
              columnOffset + PRIMARY_FILTERS_COLUMN.length);
        }
      } else if (key[columnOffset] == OTHER_INFO_COLUMN[0]) {
        if (otherInfo) {
          entity.addOtherInfo(parseRemainingKey(key,
              columnOffset + OTHER_INFO_COLUMN.length),
              GenericObjectMapper.read(iterator.peekNext().getValue()));
        }
      } else if (key[columnOffset] == RELATED_ENTITIES_COLUMN[0]) {
        if (relatedEntities) {
          addRelatedEntity(entity, key,
              columnOffset + RELATED_ENTITIES_COLUMN.length);
        }
      } else if (key[columnOffset] == EVENTS_COLUMN[0]) {
        if (events && (entity.getEvents() == null ||
            (lastEventOnly && entity.getEvents().size() == 0))) {
          TimelineEvent event = getEntityEvent(null, key, columnOffset +
              EVENTS_COLUMN.length, iterator.peekNext().getValue());
          if (event != null) {
            entity.addEvent(event);
          }
        }
      } else if (key[columnOffset] == DOMAIN_ID_COLUMN[0]) {
        byte[] v = iterator.peekNext().getValue();
        String domainId = new String(v, Charset.forName("UTF-8"));
        entity.setDomainId(domainId);
      } else if (key[columnOffset] == INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN[0]) {
        // skip invisible reverse related entities
      } else {
        LOG.warn(String.format("Found unexpected column for entity %s of " +
            "type %s (0x%02x)", entityId, entityType, key[columnOffset]));
      }
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
    
    Map<byte[], List<EntityIdentifier>> startTimeMap = createSortedStartTimeMap();
    LeveldbIterator iterator = null;
    try {
      populateStartTimeMap(entityIds, entityType, startTimeMap, iterator);
      processEntityTimelines(entityType, startTimeMap, limit, windowStart,
          windowEnd, eventType, events, iterator);
    } catch(DBException e) {
      throw new IOException(e);            	
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
    return events;
  }

  private static Map<byte[], List<EntityIdentifier>> createSortedStartTimeMap() {
    return new TreeMap<byte[], List<EntityIdentifier>>(new Comparator<byte[]>() {
      @Override
      public int compare(byte[] o1, byte[] o2) {
        return WritableComparator.compareBytes(o1, 0, o1.length, o2, 0,
            o2.length);
      }
    });
  }

  private void populateStartTimeMap(SortedSet<String> entityIds, String entityType,
      Map<byte[], List<EntityIdentifier>> startTimeMap, LeveldbIterator iterator) throws IOException {
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
  }

  private void processEntityTimelines(String entityType,
      Map<byte[], List<EntityIdentifier>> startTimeMap, Long limit,
      Long windowStart, Long windowEnd, Set<String> eventType,
      TimelineEvents events, LeveldbIterator iterator) throws IOException {
    if (windowEnd == null) {
      windowEnd = Long.MAX_VALUE;
    }
    if (limit == null) {
      limit = DEFAULT_LIMIT;
    }

    for (Entry<byte[], List<EntityIdentifier>> entry : startTimeMap.entrySet()) {
      byte[] revStartTime = entry.getKey();
      for (EntityIdentifier entityIdentifier : entry.getValue()) {
        processSingleEntityTimeline(entityType, revStartTime, entityIdentifier,
            limit, windowStart, windowEnd, eventType, events, iterator);
      }
    }
  }

  private void processSingleEntityTimeline(String entityType, byte[] revStartTime,
      EntityIdentifier entityIdentifier, Long limit, Long windowStart,
      Long windowEnd, Set<String> eventType, TimelineEvents events,
      LeveldbIterator iterator) throws IOException {
    EventsOfOneEntity entity = new EventsOfOneEntity();
    entity.setEntityId(entityIdentifier.getId());
    entity.setEntityType(entityType);
    events.addEvent(entity);
    
    KeyBuilder kb = KeyBuilder.newInstance().add(ENTITY_ENTRY_PREFIX)
        .add(entityType).add(revStartTime).add(entityIdentifier.getId())
        .add(EVENTS_COLUMN);
    byte[] prefix = kb.getBytesForLookup();
    byte[] revts = writeReverseOrderedLong(windowEnd);
    kb.add(revts);
    byte[] first = kb.getBytesForLookup();
    byte[] last = null;
    if (windowStart != null) {
      last = KeyBuilder.newInstance().add(prefix)
          .add(writeReverseOrderedLong(windowStart)).getBytesForLookup();
    }

    iterator = new LeveldbIterator(db);
    for (iterator.seek(first); 
         entity.getEvents().size() < limit && iterator.hasNext(); 
         iterator.next()) {
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
  }

  @Override
  public TimelineEntities getEntities(String entityType,
      Long limit, Long windowStart, Long windowEnd, String fromId, Long fromTs,
      NameValuePair primaryFilter, Collection<NameValuePair> secondaryFilters,
      EnumSet<Field> fields, CheckAcl checkAcl) throws IOException {
    byte[] base = getLookupBaseForEntities(primaryFilter);
    return getEntityByTime(base, entityType, limit, windowStart, windowEnd,
        fromId, fromTs, secondaryFilters, fields, checkAcl);
  }

  private byte[] getLookupBaseForEntities(NameValuePair primaryFilter) throws IOException {
    if (primaryFilter == null) {
      return ENTITY_ENTRY_PREFIX;
    } else {
      return KeyBuilder.newInstance().add(INDEXED_ENTRY_PREFIX)
          .add(primaryFilter.getName())
          .add(GenericObjectMapper.write(primaryFilter.getValue()), true)
          .add(ENTITY_ENTRY_PREFIX).getBytesForLookup();
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
      if (endtime == null) {
        endtime = Long.MAX_VALUE;
      }

      byte[] first = constructFirstSeekKey(kb, fromId, entityType, endtime);
      byte[] last = constructLastSeekKey(base, entityType, starttime);

      if (limit == null) {
        limit = DEFAULT_LIMIT;
      }

      TimelineEntities entities = new TimelineEntities();
      iterator = new LeveldbIterator(db);
      iterator.seek(first);

      boolean shouldContinue = true;
      while (shouldContinue && entities.getEntities().size() < limit && iterator.hasNext()) {
        byte[] key = iterator.peekNext().getKey();
        if (!prefixMatches(prefix, prefix.length, key) || (last != null &&
            WritableComparator.compareBytes(key, 0, key.length, last, 0,
                last.length) > 0)) {
          break;
        }

        KeyParser kp = new KeyParser(key, prefix.length);
        Long startTime = kp.getNextLong();
        String entityId = kp.getNextString();

        if (skipEntityBasedOnTimestamp(fromTs, iterator, key, kp)) {
          continue;
        }

        TimelineEntity entity = getEntity(entityId, entityType, startTime,
            fields, iterator, key, kp.getOffset());
        
        if (entityMatchesFilters(entity, secondaryFilters)) {
          setDefaultDomainId(entity);
          if (shouldAddEntityToResult(checkAcl, entity)) {
            entities.addEntity(entity);
          }
        }
      }
      return entities;
    } catch(DBException e) {
      throw new IOException(e);   	
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
  }

  private byte[] constructFirstSeekKey(KeyBuilder kb, String fromId, String entityType, Long endtime) {
    if (fromId != null) {
      Long fromIdStartTime = getStartTimeLong(fromId, entityType);
      if (fromIdStartTime != null && fromIdStartTime <= endtime) {
        return kb.add(writeReverseOrderedLong(fromIdStartTime))
            .add(fromId).getBytesForLookup();
      }
    }
    return kb.add(writeReverseOrderedLong(endtime)).getBytesForLookup();
  }

  private byte[] constructLastSeekKey(byte[] base, String entityType, Long starttime) {
    if (starttime == null) {
      return null;
    }
    return KeyBuilder.newInstance().add(base).add(entityType)
        .add(writeReverseOrderedLong(starttime)).getBytesForLookup();
  }

  private boolean skipEntityBasedOnTimestamp(Long fromTs, LeveldbIterator iterator,
      byte[] key, KeyParser kp) throws IOException {
    if (fromTs == null) {
      return false;
    }

    long insertTime = readReverseOrderedLong(iterator.peekNext().getValue(), 0);
    if (insertTime <= fromTs) {
      return false;
    }

    // Skip all keys for this entity
    byte[] firstKey = key;
    while (iterator.hasNext() && prefixMatches(firstKey, kp.getOffset(), key)) {
      iterator.next();
      if (iterator.hasNext()) {
        key = iterator.peekNext().getKey();
      }
    }
    return true;
  }

  private boolean entityMatchesFilters(TimelineEntity entity, Collection<NameValuePair> secondaryFilters) {
    if (secondaryFilters == null) {
      return true;
    }

    for (NameValuePair filter : secondaryFilters) {
      Object value = entity.getOtherInfo().get(filter.getName());
      if (value == null) {
        Set<Object> values = entity.getPrimaryFilters().get(filter.getName());
        if (values == null || !values.contains(filter.getValue())) {
          return false;
        }
      } else if (!value.equals(filter.getValue())) {
        return false;
      }
    }
    return true;
  }

  private void setDefaultDomainId(TimelineEntity entity) {
    if (entity.getDomainId() == null) {
      entity.setDomainId(DEFAULT_DOMAIN_ID);
    }
  }

  private boolean shouldAddEntityToResult(CheckAcl checkAcl, TimelineEntity entity) {
    return checkAcl == null || checkAcl.check(entity);
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
    EntityIdentifier entityIdentifier = new EntityIdentifier(entity.getEntityId(),
        entity.getEntityType());
    LockMap.CountingReentrantLock<EntityIdentifier> lock = writeLocks.getLock(entityIdentifier);
    lock.lock();
    WriteBatch writeBatch = null;
    List<EntityIdentifier> relatedEntitiesWithoutStartTimes = new ArrayList<>();
    byte[] revStartTime = null;
    Map<String, Set<Object>> primaryFilters = null;
    
    try {
      writeBatch = db.createWriteBatch();
      
      StartAndInsertTime startAndInsertTime = getAndSetStartTime(
          entity.getEntityId(), entity.getEntityType(),
          entity.getStartTime(), entity.getEvents());
      if (startAndInsertTime == null) {
        handleError(entity, response, TimelinePutError.NO_START_TIME);   
        return;
      }
      
      revStartTime = writeReverseOrderedLong(startAndInsertTime.startTime);
      primaryFilters = entity.getPrimaryFilters();

      writeEntityMarker(writeBatch, entity.getEntityId(), entity.getEntityType(),
          revStartTime, startAndInsertTime);
      writePrimaryFilterEntries(writeBatch, primaryFilters);
      writeEventEntries(writeBatch, entity, revStartTime, primaryFilters);
      writeRelatedEntityEntries(writeBatch, entity, revStartTime,
          relatedEntitiesWithoutStartTimes);
      writeOtherInfoEntries(writeBatch, entity, revStartTime, primaryFilters);
      
      if (writeDomainIdEntry(writeBatch, entity, revStartTime, allowEmptyDomainId,
          response, primaryFilters)) {
        db.write(writeBatch);
      }
    } catch (DBException de) {
      LOG.error("Error putting entity " + entity.getEntityId() + " of type " +
          entity.getEntityType(), de);
      handleError(entity, response, TimelinePutError.IO_EXCEPTION);
    } catch (IOException e) {
      LOG.error("Error putting entity " + entity.getEntityId() + " of type " +
          entity.getEntityType(), e);
      handleError(entity, response, TimelinePutError.IO_EXCEPTION);
    } finally {
      lock.unlock();
      writeLocks.returnLock(lock);
      IOUtils.cleanup(LOG, writeBatch);
    }

    processRelatedEntitiesWithoutStartTimes(entity, relatedEntitiesWithoutStartTimes,
        revStartTime, response);
  }

  private void writeEntityMarker(WriteBatch writeBatch, String entityId,
      String entityType, byte[] revStartTime, StartAndInsertTime startAndInsertTime)
      throws IOException {
    byte[] markerKey = createEntityMarkerKey(entityId, entityType, revStartTime);
    byte[] markerValue = writeReverseOrderedLong(startAndInsertTime.insertTime);
    writeBatch.put(markerKey, markerValue);
  }

  private void writePrimaryFilterEntries(WriteBatch writeBatch,
      Map<String, Set<Object>> primaryFilters) throws IOException {
    if (primaryFilters != null && !primaryFilters.isEmpty()) {
      for (Entry<String, Set<Object>> pf : primaryFilters.entrySet()) {
        for (Object pfval : pf.getValue()) {
          writeBatch.put(addPrimaryFilterToKey(pf.getKey(), pfval,
              getEntityMarkerKey(pf.getKey(), pfval, primaryFilters)), EMPTY_BYTES);
        }
      }
    }
  }

  private void writeEventEntries(WriteBatch writeBatch, TimelineEntity entity,
      byte[] revStartTime, Map<String, Set<Object>> primaryFilters) throws IOException {
    List<TimelineEvent> events = entity.getEvents();
    if (events != null && !events.isEmpty()) {
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
  }

  private void writeRelatedEntityEntries(WriteBatch writeBatch, TimelineEntity entity,
      byte[] revStartTime, List<EntityIdentifier> relatedEntitiesWithoutStartTimes) throws IOException {
    Map<String, Set<String>> relatedEntities = entity.getRelatedEntities();
    if (relatedEntities != null && !relatedEntities.isEmpty()) {
      for (Entry<String, Set<String>> relatedEntityList : relatedEntities.entrySet()) {
        String relatedEntityType = relatedEntityList.getKey();
        for (String relatedEntityId : relatedEntityList.getValue()) {
          byte[] key = createReverseRelatedEntityKey(entity.getEntityId(),
              entity.getEntityType(), revStartTime, relatedEntityId,
              relatedEntityType);
          writeBatch.put(key, EMPTY_BYTES);
          
          byte[] relatedEntityStartTime = getStartTime(relatedEntityId, relatedEntityType);
          if (relatedEntityStartTime == null) {
            relatedEntitiesWithoutStartTimes.add(
                new EntityIdentifier(relatedEntityId, relatedEntityType));
            continue;
          }
          
          validateAndWriteForwardRelation(writeBatch, entity, relatedEntityId,
              relatedEntityType, relatedEntityStartTime);
        }
      }
    }
  }

  private void validateAndWriteForwardRelation(WriteBatch writeBatch,
      TimelineEntity entity, String relatedEntityId, String relatedEntityType,
      byte[] relatedEntityStartTime) throws IOException {
    byte[] domainIdBytes = db.get(createDomainIdKey(
        relatedEntityId, relatedEntityType, relatedEntityStartTime));
    String domainId = null;
    if (domainIdBytes == null) {
      domainId = TimelineDataManager.DEFAULT_DOMAIN_ID;
    } else {
      domainId = new String(domainIdBytes, Charset.forName("UTF-8"));
    }
    
    if (!domainId.equals(entity.getDomainId())) {
      handleError(entity,ENTITY_PUT_RESPONSE_PLACEHOLDER, TimelinePutError.FORBIDDEN_RELATION);
      return;
    }
    
    byte[] key = createRelatedEntityKey(relatedEntityId,
        relatedEntityType, relatedEntityStartTime,
        entity.getEntityId(), entity.getEntityType());
    writeBatch.put(key, EMPTY_BYTES);
  }

  private void writeOtherInfoEntries(WriteBatch writeBatch, TimelineEntity entity,
      byte[] revStartTime, Map<String, Set<Object>> primaryFilters) throws IOException {
    Map<String, Object> otherInfo = entity.getOtherInfo();
    if (otherInfo != null && !otherInfo.isEmpty()) {
      for (Entry<String, Object> i : otherInfo.entrySet()) {
        byte[] key = createOtherInfoKey(entity.getEntityId(),
            entity.getEntityType(), revStartTime, i.getKey());
        byte[] value = GenericObjectMapper.write(i.getValue());
        writeBatch.put(key, value);
        writePrimaryFilterEntries(writeBatch, primaryFilters, key, value);
      }
    }
  }

  private boolean writeDomainIdEntry(WriteBatch writeBatch, TimelineEntity entity,
      byte[] revStartTime, boolean allowEmptyDomainId, TimelinePutResponse response,
      Map<String, Set<Object>> primaryFilters) throws IOException {
    byte[] key = createDomainIdKey(entity.getEntityId(), entity.getEntityType(), revStartTime);
    if (entity.getDomainId() == null || entity.getDomainId().length() == 0) {
      if (!allowEmptyDomainId) {
        handleError(entity, response, TimelinePutError.NO_DOMAIN);
        return false;
      }
    } else {
      writeBatch.put(key, entity.getDomainId().getBytes(Charset.forName("UTF-8")));
      writePrimaryFilterEntries(writeBatch, primaryFilters, key,
          entity.getDomainId().getBytes(Charset.forName("UTF-8")));
    }
    return true;
  }

  private void processRelatedEntitiesWithoutStartTimes(TimelineEntity entity,
      List<EntityIdentifier> relatedEntitiesWithoutStartTimes,
      byte[] revStartTime, TimelinePutResponse response) {
    for (EntityIdentifier relatedEntity : relatedEntitiesWithoutStartTimes) {
      LockMap.CountingReentrantLock<EntityIdentifier> lock = writeLocks.getLock(relatedEntity);
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
      } else {
        byte[] b = createStartTimeLookupKey(entity.getId(), entity.getType());
        byte[] v = db.get(b);
        if (v == null) {
          return null;
        } else {
          Long l = readReverseOrderedLong(v, 0);
          startTimeReadCache.put(entity, l);
          return l;
        }
      }
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
    if (startTime == null) {
      if (startTimeWriteCache.containsKey(entity)) {
        return startTimeWriteCache.get(entity);
      } else {
        startTime = determineStartTimeFromEvents(events);
        return checkStartTimeInDb(entity, startTime);
      }
    } else {
      if (startTimeWriteCache.containsKey(entity)) {
        return startTimeWriteCache.get(entity);
      } else {
        return checkStartTimeInDb(entity, startTime);
      }
    }
  }

  private Long determineStartTimeFromEvents(List<TimelineEvent> events) {
    if (events == null || events.isEmpty()) {
      return null;
    }
    long min = Long.MAX_VALUE;
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
    StartAndInsertTime startAndInsertTime;
    byte[] b = createStartTimeLookupKey(entity.getId(), entity.getType());
    try {
      byte[] v = db.get(b);
      if (v == null) {
        if (suggestedStartTime == null) {
          return null;
        }
        startAndInsertTime = new StartAndInsertTime(suggestedStartTime,
            System.currentTimeMillis());
        v = new byte[16];
        writeReverseOrderedLong(suggestedStartTime, v, 0);
        writeReverseOrderedLong(startAndInsertTime.insertTime, v, 8);
        WriteOptions writeOptions = new WriteOptions();
        writeOptions.sync(true);
        db.put(b, v, writeOptions);
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
      
      deleteStartTimeEntry(writeBatch, entityId, entityType);
      
      deleteAllEntityKeys(writeBatch, iterator, entityKey, prefixlen,
          pfIterator, entityId, entityType, deletePrefix);

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

  private void deleteStartTimeEntry(WriteBatch writeBatch, String entityId,
      String entityType) {
    writeBatch.delete(createStartTimeLookupKey(entityId, entityType));
    EntityIdentifier entityIdentifier = new EntityIdentifier(entityId, entityType);
    startTimeReadCache.remove(entityIdentifier);
    startTimeWriteCache.remove(entityIdentifier);
  }

  private void deleteAllEntityKeys(WriteBatch writeBatch, LeveldbIterator iterator,
      byte[] entityKey, int prefixlen, LeveldbIterator pfIterator,
      String entityId, String entityType, byte[] deletePrefix) {
    for (; iterator.hasNext(); iterator.next()) {
      byte[] key = iterator.peekNext().getKey();
      if (!prefixMatches(entityKey, prefixlen, key)) {
        break;
      }
      writeBatch.delete(key);

      if (key.length == prefixlen) {
        continue;
      }
      processEntityKeyColumn(writeBatch, key, prefixlen, pfIterator,
          entityId, entityType, deletePrefix);
    }
  }

  private void processEntityKeyColumn(WriteBatch writeBatch, byte[] key,
      int prefixlen, LeveldbIterator pfIterator, String entityId,
      String entityType, byte[] deletePrefix) {
    int columnType = key[prefixlen] & 0xFF;
    switch (columnType) {
      case PRIMARY_FILTERS_COLUMN[0] & 0xFF:
        handlePrimaryFilterColumn(writeBatch, key, prefixlen, pfIterator,
            entityId, entityType, deletePrefix);
        break;
      case RELATED_ENTITIES_COLUMN[0] & 0xFF:
        handleRelatedEntityColumn(writeBatch, key, prefixlen,
            entityId, entityType);
        break;
      case INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN[0] & 0xFF:
        handleReverseRelatedEntityColumn(writeBatch, key, prefixlen,
            entityId, entityType);
        break;
      default:
        // Skip unknown columns
        break;
    }
  }

  private void handlePrimaryFilterColumn(WriteBatch writeBatch, byte[] key,
      int prefixlen, LeveldbIterator pfIterator, String entityId,
      String entityType, byte[] deletePrefix) {
    KeyParser kp = new KeyParser(key,
        prefixlen + PRIMARY_FILTERS_COLUMN.length);
    String name = kp.getNextString();
    Object value = GenericObjectMapper.read(key, kp.getOffset());
    deleteKeysWithPrefix(writeBatch, addPrimaryFilterToKey(name, value,
        deletePrefix), pfIterator);
  }

  private void handleRelatedEntityColumn(WriteBatch writeBatch, byte[] key,
      int prefixlen, String entityId, String entityType) {
    KeyParser kp = new KeyParser(key,
        prefixlen + RELATED_ENTITIES_COLUMN.length);
    String type = kp.getNextString();
    String id = kp.getNextString();
    try {
      byte[] relatedEntityStartTime = getStartTime(id, type);
      if (relatedEntityStartTime == null) {
        LOG.warn("Found no start time for " +
            "related entity " + id + " of type " + type + " while " +
            "deleting " + entityId + " of type " + entityType);
        return;
      }
      writeBatch.delete(createReverseRelatedEntityKey(id, type,
          relatedEntityStartTime, entityId, entityType));
    } catch (IOException e) {
      LOG.error("Error deleting related entity " + id + " of type " + type, e);
    }
  }

  private void handleReverseRelatedEntityColumn(WriteBatch writeBatch, byte[] key,
      int prefixlen, String entityId, String entityType) {
    KeyParser kp = new KeyParser(key, prefixlen +
        INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN.length);
    String type = kp.getNextString();
    String id = kp.getNextString();
    try {
      byte[] relatedEntityStartTime = getStartTime(id, type);
      if (relatedEntityStartTime == null) {
        LOG.warn("Found no start time for reverse " +
            "related entity " + id + " of type " + type + " while " +
            "deleting " + entityId + " of type " + entityType);
        return;
      }
      writeBatch.delete(createRelatedEntityKey(id, type,
          relatedEntityStartTime, entityId, entityType));
    } catch (IOException e) {
      LOG.error("Error deleting reverse related entity " + id + " of type " + type, e);
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
            totalCount++;
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
            LOG.info("Deleted " + typeCount + " entities of type " +
                entityType);
          }
        }
      }
    } finally {
      long t2 = System.currentTimeMillis();
      LOG.info("Discarded " + totalCount + " entities for timestamp " +
          timestamp + " and earlier in " + (t2 - t1) / 1000.0 + " seconds");
    }
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

  private void validateDomain(TimelineDomain domain) {
    if (domain.getId() == null || domain.getId().length() == 0) {
      throw new IllegalArgumentException("Domain doesn't have an ID");
    }
    if (domain.getOwner() == null || domain.getOwner().length() == 0) {
      throw new IllegalArgumentException("Domain doesn't have an owner.");
    }
  }

  private void writeDomainDescription(WriteBatch writeBatch, TimelineDomain domain)
      throws IOException {
    byte[] domainEntryKey = createDomainEntryKey(domain.getId(), DESCRIPTION_COLUMN);
    byte[] ownerLookupEntryKey = createOwnerLookupKey(domain.getOwner(), domain.getId(), DESCRIPTION_COLUMN);
    
    if (domain.getDescription() != null) {
      writeBatch.put(domainEntryKey, domain.getDescription().getBytes(Charset.forName("UTF-8")));
      writeBatch.put(ownerLookupEntryKey, domain.getDescription().getBytes(Charset.forName("UTF-8")));
    } else {
      writeBatch.put(domainEntryKey, EMPTY_BYTES);
      writeBatch.put(ownerLookupEntryKey, EMPTY_BYTES);
    }
  }

  private void writeDomainOwner(WriteBatch writeBatch, TimelineDomain domain)
      throws IOException {
    byte[] domainEntryKey = createDomainEntryKey(domain.getId(), OWNER_COLUMN);
    byte[] ownerLookupEntryKey = createOwnerLookupKey(domain.getOwner(), domain.getId(), OWNER_COLUMN);
    writeBatch.put(domainEntryKey, domain.getOwner().getBytes(Charset.forName("UTF-8")));
    writeBatch.put(ownerLookupEntryKey, domain.getOwner().getBytes(Charset.forName("UTF-8")));
  }

  private void writeDomainReaders(WriteBatch writeBatch, TimelineDomain domain)
      throws IOException {
    byte[] domainEntryKey = createDomainEntryKey(domain.getId(), READER_COLUMN);
    byte[] ownerLookupEntryKey = createOwnerLookupKey(domain.getOwner(), domain.getId(), READER_COLUMN);
    
    if (domain.getReaders() != null && domain.getReaders().length() > 0) {
      writeBatch.put(domainEntryKey, domain.getReaders().getBytes(Charset.forName("UTF-8")));
      writeBatch.put(ownerLookupEntryKey, domain.getReaders().getBytes(Charset.forName("UTF-8")));
    } else {
      writeBatch.put(domainEntryKey, EMPTY_BYTES);
      writeBatch.put(ownerLookupEntryKey, EMPTY_BYTES);
    }
  }

  private void writeDomainWriters(WriteBatch writeBatch, TimelineDomain domain)
      throws IOException {
    byte[] domainEntryKey = createDomainEntryKey(domain.getId(), WRITER_COLUMN);
    byte[] ownerLookupEntryKey = createOwnerLookupKey(domain.getOwner(), domain.getId(), WRITER_COLUMN);
    
    if (domain.getWriters() != null && domain.getWriters().length() > 0) {
      writeBatch.put(domainEntryKey, domain.getWriters().getBytes(Charset.forName("UTF-8")));
      writeBatch.put(ownerLookupEntryKey, domain.getWriters().getBytes(Charset.forName("UTF-8")));
    } else {
      writeBatch.put(domainEntryKey, EMPTY_BYTES);
      writeBatch.put(ownerLookupEntryKey, EMPTY_BYTES);
    }
  }

  private void writeDomainTimestamps(WriteBatch writeBatch, TimelineDomain domain)
      throws IOException {
    byte[] domainEntryKey = createDomainEntryKey(domain.getId(), TIMESTAMP_COLUMN);
    byte[] ownerLookupEntryKey = createOwnerLookupKey(domain.getOwner(), domain.getId(), TIMESTAMP_COLUMN);
    
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
      iterator = new LeveldbIterator(db);
      iterator.seek(prefix);
      
      while (iterator.hasNext()) {
        byte[] key = iterator.peekNext().getKey();
        if (!prefixMatches(prefix, prefix.length, key)) {
          break;
        }
        
        KeyParser kp = new KeyParser(key, prefix.length);
        String domainId = kp.getNextString();
        byte[] prefixExt = KeyBuilder.newInstance().add(OWNER_LOOKUP_PREFIX)
            .add(owner).add(domainId).getBytesForLookup();
        TimelineDomain domain = getTimelineDomain(iterator, domainId, prefixExt);
        if (domain != null) {
          domains.add(domain);
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

  private static class DomainComparator implements Comparator<TimelineDomain> {
    @Override
    public int compare(TimelineDomain domain1, TimelineDomain domain2) {
      int result = domain2.getCreatedTime().compareTo(domain1.getCreatedTime());
      if (result == 0) {
        return domain2.getModifiedTime().compareTo(domain1.getModifiedTime());
      } else {
        return result;
      }
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
      
      byte[] value = iterator.peekNext().getValue();
      if (value != null && value.length > 0) {
        int columnType = key[prefix.length] & 0xFF;
        parseDomainValue(domain, columnType, value);
      }
    }
    
    if (noRows) {
      return null;
    }
    return domain;
  }

  private static void parseDomainValue(TimelineDomain domain, int columnType,
      byte[] value) {
    if (columnType == DESCRIPTION_COLUMN[0] & 0xFF) {
      domain.setDescription(new String(value, Charset.forName("UTF-8")));
    } else if (columnType == OWNER_COLUMN[0] & 0xFF) {
      domain.setOwner(new String(value, Charset.forName("UTF-8")));
    } else if (columnType == READER_COLUMN[0] & 0xFF) {
      domain.setReaders(new String(value, Charset.forName("UTF-8")));
    } else if (columnType == WRITER_COLUMN[0] & 0xFF) {
      domain.setWriters(new String(value, Charset.forName("UTF-8")));
    } else if (columnType == TIMESTAMP_COLUMN[0] & 0xFF) {
      domain.setCreatedTime(readReverseOrderedLong(value, 0));
      domain.setModifiedTime(readReverseOrderedLong(value, 8));
    } else {
      LOG.error("Unrecognized domain column: " + columnType);
    }
  }    
}