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
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS" BASIS,
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
  private static final Log LOG = LogFactory.getLog(LeveldbTimelineStore.class);

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
  private static final byte[] INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN = "z".getBytes(Charset.forName("UTF-8"));
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
  private static final Version CURRENT_VERSION_INFO = Version.newInstance(1, 0);

  @Private
  @VisibleForTesting
  static final FsPermission LEVELDB_DIR_UMASK = FsPermission.createImmutable((short) 0700);

  private Map<EntityIdentifier, StartAndInsertTime> startTimeWriteCache;
  private Map<EntityIdentifier, Long> startTimeReadCache;

  private final LockMap<EntityIdentifier> writeLocks = new LockMap<>();
  private final ReentrantReadWriteLock deleteLock = new ReentrantReadWriteLock();

  private DB db;
  private Thread deletionThread;

  public LeveldbTimelineStore() {
    super(LeveldbTimelineStore.class.getName());
  }

  @Override
  @SuppressWarnings("unchecked")
  protected void serviceInit(Configuration conf) throws Exception {
    validateConfiguration(conf);
    Options options = new Options();
    options.createIfMissing(true);
    options.cacheSize(conf.getLong(
        YarnConfiguration.TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE));
    JniDBFactory factory = new JniDBFactory();
    Path dbPath = new Path(conf.get(YarnConfiguration.TIMELINE_SERVICE_LEVELDB_PATH), FILENAME);
    FileSystem localFS = null;
    try {
      localFS = FileSystem.getLocal(conf);
      if (!localFS.exists(dbPath) && !localFS.mkdirs(dbPath)) {
        throw new IOException("Couldn't create directory for leveldb timeline store " + dbPath);
      }
      localFS.setPermission(dbPath, LEVELDB_DIR_UMASK);
    } finally {
      IOUtils.cleanup(LOG, localFS);
    }
    LOG.info("Using leveldb path " + dbPath);
    db = factory.open(new File(dbPath.toString()), options);
    checkVersion();
    startTimeWriteCache = Collections.synchronizedMap(new LRUMap(getStartTimeWriteCacheSize(conf)));
    startTimeReadCache = Collections.synchronizedMap(new LRUMap(getStartTimeReadCacheSize(conf)));
    if (conf.getBoolean(YarnConfiguration.TIMELINE_SERVICE_TTL_ENABLE, true)) {
      deletionThread = new EntityDeletionThread(conf);
      deletionThread.start();
    }
    super.serviceInit(conf);
  }

  private void validateConfiguration(Configuration conf) {
    Preconditions.checkArgument(conf.getLong(YarnConfiguration.TIMELINE_SERVICE_TTL_MS,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_TTL_MS) > 0,
        "%s property value should be greater than zero", YarnConfiguration.TIMELINE_SERVICE_TTL_MS);
    Preconditions.checkArgument(conf.getLong(YarnConfiguration.TIMELINE_SERVICE_LEVELDB_TTL_INTERVAL_MS,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_TTL_INTERVAL_MS) > 0,
        "%s property value should be greater than zero", YarnConfiguration.TIMELINE_SERVICE_LEVELDB_TTL_INTERVAL_MS);
    Preconditions.checkArgument(conf.getLong(YarnConfiguration.TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE) >= 0,
        "%s property value should be greater than or equal to zero", YarnConfiguration.TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE);
    Preconditions.checkArgument(conf.getLong(YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_READ_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_START_TIME_READ_CACHE_SIZE) > 0,
        "%s property value should be greater than zero", YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_READ_CACHE_SIZE);
    Preconditions.checkArgument(conf.getLong(YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_WRITE_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_START_TIME_WRITE_CACHE_SIZE) > 0,
        "%s property value should be greater than zero", YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_WRITE_CACHE_SIZE);
  }

  @Override
  protected void serviceStop() throws Exception {
    if (deletionThread != null) {
      deletionThread.interrupt();
      LOG.info("Waiting for deletion thread to complete its current action");
      try {
        deletionThread.join();
      } catch (InterruptedException e) {
        LOG.warn("Interrupted while waiting for deletion thread to complete, closing db now", e);
      }
    }
    IOUtils.cleanup(LOG, db);
    super.serviceStop();
  }

  private static class StartAndInsertTime {
    final long startTime;
    final long insertTime;
    StartAndInsertTime(long startTime, long insertTime) {
      this.startTime = startTime;
      this.insertTime = insertTime;
    }
  }

  private class EntityDeletionThread extends Thread {
    private final long ttl;
    private final long ttlInterval;
    EntityDeletionThread(Configuration conf) {
      ttl = conf.getLong(YarnConfiguration.TIMELINE_SERVICE_TTL_MS,
          YarnConfiguration.DEFAULT_TIMELINE_SERVICE_TTL_MS);
      ttlInterval = conf.getLong(YarnConfiguration.TIMELINE_SERVICE_LEVELDB_TTL_INTERVAL_MS,
          YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_TTL_INTERVAL_MS);
      LOG.info("Starting deletion thread with ttl " + ttl + " and cycle interval " + ttlInterval);
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
      private final K key;
      CountingReentrantLock(K key) {
        this.key = key;
        this.count = 0;
      }
    }
    private final Map<K, CountingReentrantLock<K>> locks = new HashMap<>();
    synchronized CountingReentrantLock<K> getLock(K key) {
      CountingReentrantLock<K> lock = locks.get(key);
      if (lock == null) {
        lock = new CountingReentrantLock<>(key);
        locks.put(key, lock);
      }
      lock.count++;
      return lock;
    }
    synchronized void returnLock(CountingReentrantLock<K> lock) {
      if (lock.count == 0) {
        throw new IllegalStateException("Returned lock more times than it was retrieved");
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
    byte[] prefix = KeyBuilder.newInstance()
        .add(ENTITY_ENTRY_PREFIX)
        .add(entityType)
        .add(writeReverseOrderedLong(revStartTime))
        .add(entityId)
        .getBytesForLookup();
    LeveldbIterator iterator = null;
    try {
      iterator = new LeveldbIterator(db);
      iterator.seek(prefix);
      return readEntityFromIterator(entityId, entityType, revStartTime, fields, iterator, prefix);
    } catch (DBException e) {
      throw new IOException(e);
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
  }

  private static TimelineEntity readEntityFromIterator(String entityId, String entityType,
      Long startTime, EnumSet<Field> fields, LeveldbIterator iterator,
      byte[] prefix) throws IOException {
    if (fields == null) {
      fields = EnumSet.allOf(Field.class);
    }
    TimelineEntity entity = new TimelineEntity();
    boolean wantEvents = fields.contains(Field.EVENTS);
    boolean wantLastEvent = fields.contains(Field.LAST_EVENT_ONLY);
    boolean wantRelated = fields.contains(Field.RELATED_ENTITIES);
    boolean wantPrimary = fields.contains(Field.PRIMARY_FILTERS);
    boolean wantOther = fields.contains(Field.OTHER_INFO);
    if (!wantEvents && !wantLastEvent) {
      entity.setEvents(null);
    }
    if (!wantRelated) {
      entity.setRelatedEntities(null);
    }
    if (!wantPrimary) {
      entity.setPrimaryFilters(null);
    }
    if (!wantOther) {
      entity.setOtherInfo(null);
    }
    while (iterator.hasNext()) {
      iterator.next();
      byte[] key = iterator.peekNext().getKey();
      if (!prefixMatches(prefix, prefix.length, key) || key.length == prefix.length) {
        continue;
      }
      byte column = key[prefix.length];
      if (column == PRIMARY_FILTERS_COLUMN[0] && wantPrimary) {
        addPrimaryFilter(entity, key, prefix.length + PRIMARY_FILTERS_COLUMN.length);
      } else if (column == OTHER_INFO_COLUMN[0] && wantOther) {
        entity.addOtherInfo(parseRemainingKey(key, prefix.length + OTHER_INFO_COLUMN.length),
            GenericObjectMapper.read(iterator.peekNext().getValue()));
      } else if (column == RELATED_ENTITIES_COLUMN[0] && wantRelated) {
        addRelatedEntity(entity, key, prefix.length + RELATED_ENTITIES_COLUMN.length);
      } else if (column == EVENTS_COLUMN[0] && (wantEvents || (wantLastEvent && entity.getEvents().isEmpty()))) {
        TimelineEvent event = getEntityEvent(null, key, prefix.length + EVENTS_COLUMN.length,
            iterator.peekNext().getValue());
        if (event != null) {
          entity.addEvent(event);
        }
      } else if (column == DOMAIN_ID_COLUMN[0]) {
        String domainId = new String(iterator.peekNext().getValue(), Charset.forName("UTF-8"));
        entity.setDomainId(domainId);
      } else if (column != INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN[0]) {
        LOG.warn(String.format("Found unexpected column for entity %s of type %s (0x%02x)",
            entityId, entityType, column));
      }
    }
    entity.setEntityId(entityId);
    entity.setEntityType(entityType);
    entity.setStartTime(startTime);
    return entity;
  }

  @Override
  public TimelineEvents getEntityTimelines(String entityType,
      SortedSet<String> entityIds, Long limit, Long windowStart,
      Long windowEnd, Set<String> eventType) throws IOException {
    TimelineEvents events = new TimelineEvents();
    if (entityIds == null || entityIds.isEmpty()) {
      return events;
    }
    Map<byte[], List<EntityIdentifier>> startTimeMap = new TreeMap<>(this::compareBytes);
    LeveldbIterator iterator = null;
    try {
      for (String entityId : entityIds) {
        byte[] startTime = getStartTime(entityId, entityType);
        if (startTime != null) {
          startTimeMap.computeIfAbsent(startTime, k -> new ArrayList<>()).add(new EntityIdentifier(entityId, entityType));
        }
      }
      for (Entry<byte[], List<EntityIdentifier>> entry : startTimeMap.entrySet()) {
        byte[] revStartTime = entry.getKey();
        for (EntityIdentifier entityIdentifier : entry.getValue()) {
          EventsOfOneEntity entity = new EventsOfOneEntity();
          entity.setEntityId(entityIdentifier.getId());
          entity.setEntityType(entityType);
          events.addEvent(entity);
          KeyBuilder kb = KeyBuilder.newInstance()
              .add(ENTITY_ENTRY_PREFIX)
              .add(entityType)
              .add(revStartTime)
              .add(entityIdentifier.getId())
              .add(EVENTS_COLUMN);
          byte[] prefix = kb.getBytesForLookup();
          long end = windowEnd == null ? Long.MAX_VALUE : windowEnd;
          byte[] first = kb.add(writeReverseOrderedLong(end)).getBytesForLookup();
          byte[] last = null;
          if (windowStart != null) {
            last = KeyBuilder.newInstance()
                .add(prefix)
                .add(writeReverseOrderedLong(windowStart))
                .getBytesForLookup();
          }
          long max = limit == null ? DEFAULT_LIMIT : limit;
          iterator = new LeveldbIterator(db);
          for (iterator.seek(first); entity.getEvents().size() < max && iterator.hasNext(); ) {
            byte[] key = iterator.peekNext().getKey();
            if (!prefixMatches(prefix, prefix.length, key) ||
                (last != null && WritableComparator.compareBytes(key, 0, key.length, last, 0, last.length) > 0)) {
              break;
            }
            TimelineEvent ev = getEntityEvent(eventType, key, prefix.length, iterator.peekNext().getValue());
            if (ev != null) {
              entity.addEvent(ev);
            }
            iterator.next();
          }
        }
      }
    } catch (DBException e) {
      throw new IOException(e);
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
    return events;
  }

  private int compareBytes(byte[] o1, byte[] o2) {
    return WritableComparator.compareBytes(o1, 0, o1.length, o2, 0, o2.length);
  }

  @Override
  public TimelineEntities getEntities(String entityType,
      Long limit, Long windowStart, Long windowEnd, String fromId, Long fromTs,
      NameValuePair primaryFilter, Collection<NameValuePair> secondaryFilters,
      EnumSet<Field> fields, CheckAcl checkAcl) throws IOException {
    if (primaryFilter == null) {
      return getEntityByTime(ENTITY_ENTRY_PREFIX, entityType, limit,
          windowStart, windowEnd, fromId, fromTs, secondaryFilters, fields, checkAcl);
    }
    byte[] base = KeyBuilder.newInstance()
        .add(INDEXED_ENTRY_PREFIX)
        .add(primaryFilter.getName())
        .add(GenericObjectMapper.write(primaryFilter.getValue()), true)
        .add(ENTITY_ENTRY_PREFIX)
        .getBytesForLookup();
    return getEntityByTime(base, entityType, limit, windowStart, windowEnd,
        fromId, fromTs, secondaryFilters, fields, checkAcl);
  }

  private TimelineEntities getEntityByTime(byte[] base,
      String entityType, Long limit, Long starttime, Long endtime,
      String fromId, Long fromTs, Collection<NameValuePair> secondaryFilters,
      EnumSet<Field> fields, CheckAcl checkAcl) throws IOException {
    if (endtime == null) {
      endtime = Long.MAX_VALUE;
    }
    KeyBuilder kb = KeyBuilder.newInstance().add(base).add(entityType);
    byte[] prefix = kb.getBytesForLookup();
    byte[] first = buildFirstKey(kb, fromId, entityType, endtime);
    byte[] last = starttime == null ? null : KeyBuilder.newInstance()
        .add(base).add(entityType).add(writeReverseOrderedLong(starttime)).getBytesForLookup();
    long max = limit == null ? DEFAULT_LIMIT : limit;
    TimelineEntities entities = new TimelineEntities();
    LeveldbIterator iterator = null;
    try {
      iterator = new LeveldbIterator(db);
      iterator.seek(first);
      while (entities.getEntities().size() < max && iterator.hasNext()) {
        byte[] key = iterator.peekNext().getKey();
        if (!prefixMatches(prefix, prefix.length, key) ||
            (last != null && WritableComparator.compareBytes(key, 0, key.length, last, 0, last.length) > 0)) {
          break;
        }
        KeyParser kp = new KeyParser(key, prefix.length);
        Long startTime = kp.getNextLong();
        String entityId = kp.getNextString();
        if (fromTs != null && isInsertTimeAfter(iterator, kp, fromTs)) {
          skipEntityKeys(iterator, kp, key);
          continue;
        }
        TimelineEntity entity = getEntity(entityId, entityType, startTime,
            fields, iterator, key, kp.getOffset());
        if (matchesSecondaryFilters(entity, secondaryFilters)) {
          if (entity.getDomainId() == null) {
            entity.setDomainId(DEFAULT_DOMAIN_ID);
          }
          if (checkAcl == null || checkAcl.check(entity)) {
            entities.addEntity(entity);
          }
        }
      }
      return entities;
    } catch (DBException e) {
      throw new IOException(e);
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
  }

  private byte[] buildFirstKey(KeyBuilder kb, String fromId, String entityType, Long endtime) throws IOException {
    if (fromId != null) {
      Long fromStart = getStartTimeLong(fromId, entityType);
      if (fromStart != null && fromStart <= endtime) {
        return kb.add(writeReverseOrderedLong(fromStart)).add(fromId).getBytesForLookup();
      }
    }
    return kb.add(writeReverseOrderedLong(endtime)).getBytesForLookup();
  }

  private boolean isInsertTimeAfter(LeveldbIterator iterator, KeyParser kp, Long fromTs) throws IOException {
    long insertTime = readReverseOrderedLong(iterator.peekNext().getValue(), 0);
    return insertTime > fromTs;
  }

  private void skipEntityKeys(LeveldbIterator iterator, KeyParser kp, byte[] startKey) throws IOException {
    byte[] firstKey = startKey;
    while (iterator.hasNext()) {
      iterator.next();
      byte[] key = iterator.peekNext().getKey();
      if (!prefixMatches(firstKey, kp.getOffset(), key)) {
        break;
      }
    }
  }

  private boolean matchesSecondaryFilters(TimelineEntity entity, Collection<NameValuePair> secondaryFilters) {
    if (secondaryFilters == null) {
      return true;
    }
    for (NameValuePair filter : secondaryFilters) {
      Object v = entity.getOtherInfo().get(filter.getName());
      if (v == null) {
        Set<Object> vs = entity.getPrimaryFilters().get(filter.getName());
        if (vs == null || !vs.contains(filter.getValue())) {
          return false;
        }
      } else if (!v.equals(filter.getValue())) {
        return false;
      }
    }
    return true;
  }

  private static void handleError(TimelineEntity entity, TimelinePutResponse response, int errorCode) {
    TimelinePutError error = new TimelinePutError();
    error.setEntityId(entity.getEntityId());
    error.setEntityType(entity.getEntityType());
    error.setErrorCode(errorCode);
    response.addError(error);
  }

  private void put(TimelineEntity entity, TimelinePutResponse response,
      boolean allowEmptyDomainId) {
    LockMap.CountingReentrantLock<EntityIdentifier> lock = writeLocks.getLock(
        new EntityIdentifier(entity.getEntityId(), entity.getEntityType()));
    lock.lock();
    WriteBatch writeBatch = null;
    List<EntityIdentifier> pendingRelated = new ArrayList<>();
    byte[] revStartTime = null;
    try {
      writeBatch = db.createWriteBatch();
      List<TimelineEvent> events = entity.getEvents();
      StartAndInsertTime startAndInsert = getAndSetStartTime(entity.getEntityId(),
          entity.getEntityType(), entity.getStartTime(), events);
      if (startAndInsert == null) {
        handleError(entity, response, TimelinePutError.NO_START_TIME);
        return;
      }
      revStartTime = writeReverseOrderedLong(startAndInsert.startTime);
      Map<String, Set<Object>> primaryFilters = entity.getPrimaryFilters();
      byte[] markerKey = createEntityMarkerKey(entity.getEntityId(),
          entity.getEntityType(), revStartTime);
      byte[] markerValue = writeReverseOrderedLong(startAndInsert.insertTime);
      writeBatch.put(markerKey, markerValue);
      writePrimaryFilterEntries(writeBatch, primaryFilters, markerKey, markerValue);
      writeEvents(writeBatch, entity, events, revStartTime, primaryFilters);
      writeRelatedEntities(writeBatch, entity, revStartTime, pendingRelated, response, allowEmptyDomainId);
      writePrimaryFilters(writeBatch, entity, revStartTime, primaryFilters);
      writeOtherInfo(writeBatch, entity, revStartTime, primaryFilters);
      writeDomainId(writeBatch, entity, revStartTime, primaryFilters, response, allowEmptyDomainId);
      db.write(writeBatch);
    } catch (DBException | IOException e) {
      LOG.error("Error putting entity " + entity.getEntityId() + " of type " + entity.getEntityType(), e);
      handleError(entity, response, TimelinePutError.IO_EXCEPTION);
    } finally {
      lock.unlock();
      writeLocks.returnLock(lock);
      IOUtils.cleanup(LOG, writeBatch);
    }
    writePendingRelatedEntities(pendingRelated, entity, revStartTime, response);
  }

  private void writeEvents(WriteBatch batch, TimelineEntity entity,
      List<TimelineEvent> events, byte[] revStartTime,
      Map<String, Set<Object>> primaryFilters) throws IOException {
    if (events == null || events.isEmpty()) {
      return;
    }
    for (TimelineEvent event : events) {
      byte[] revTs = writeReverseOrderedLong(event.getTimestamp());
      byte[] key = createEntityEventKey(entity.getEntityId(),
          entity.getEntityType(), revStartTime, revTs, event.getEventType());
      byte[] value = GenericObjectMapper.write(event.getEventInfo());
      batch.put(key, value);
      writePrimaryFilterEntries(batch, primaryFilters, key, value);
    }
  }

  private void writeRelatedEntities(WriteBatch batch, TimelineEntity entity,
      byte[] revStartTime, List<EntityIdentifier> pendingRelated,
      TimelinePutResponse response, boolean allowEmptyDomainId) throws IOException {
    Map<String, Set<String>> related = entity.getRelatedEntities();
    if (related == null || related.isEmpty()) {
      return;
    }
    for (Entry<String, Set<String>> entry : related.entrySet()) {
      String relatedType = entry.getKey();
      for (String relatedId : entry.getValue()) {
        byte[] revKey = createReverseRelatedEntityKey(entity.getEntityId(),
            entity.getEntityType(), revStartTime, relatedId, relatedType);
        batch.put(revKey, EMPTY_BYTES);
        byte[] relatedStart = getStartTime(relatedId, relatedType);
        if (relatedStart == null) {
          pendingRelated.add(new EntityIdentifier(relatedId, relatedType));
          continue;
        }
        if (!domainMatches(entity, relatedId, relatedType, relatedStart)) {
          handleError(entity, response, TimelinePutError.FORBIDDEN_RELATION);
          continue;
        }
        byte[] fwdKey = createRelatedEntityKey(relatedId, relatedType,
            relatedStart, entity.getEntityId(), entity.getEntityType());
        batch.put(fwdKey, EMPTY_BYTES);
      }
    }
  }

  private boolean domainMatches(TimelineEntity entity, String relatedId,
      String relatedType, byte[] relatedStart) throws IOException {
    byte[] domainBytes = db.get(createDomainIdKey(relatedId, relatedType, relatedStart));
    String domain = domainBytes == null ? TimelineDataManager.DEFAULT_DOMAIN_ID
        : new String(domainBytes, Charset.forName("UTF-8"));
    return domain.equals(entity.getDomainId());
  }

  private void writePrimaryFilters(WriteBatch batch, TimelineEntity entity,
      byte[] revStartTime, Map<String, Set<Object>> primaryFilters) throws IOException {
    if (primaryFilters == null || primaryFilters.isEmpty()) {
      return;
    }
    for (Entry<String, Set<Object>> pf : primaryFilters.entrySet()) {
      for (Object val : pf.getValue()) {
        byte[] key = createPrimaryFilterKey(entity.getEntityId(),
            entity.getEntityType(), revStartTime, pf.getKey(), val);
        batch.put(key, EMPTY_BYTES);
        writePrimaryFilterEntries(batch, primaryFilters, key, EMPTY_BYTES);
      }
    }
  }

  private void writeOtherInfo(WriteBatch batch, TimelineEntity entity,
      byte[] revStartTime, Map<String, Set<Object>> primaryFilters) throws IOException {
    Map<String, Object> other = entity.getOtherInfo();
    if (other == null || other.isEmpty()) {
      return;
    }
    for (Entry<String, Object> e : other.entrySet()) {
      byte[] key = createOtherInfoKey(entity.getEntityId(),
          entity.getEntityType(), revStartTime, e.getKey());
      byte[] value = GenericObjectMapper.write(e.getValue());
      batch.put(key, value);
      writePrimaryFilterEntries(batch, primaryFilters, key, value);
    }
  }

  private void writeDomainId(WriteBatch batch, TimelineEntity entity,
      byte[] revStartTime, Map<String, Set<Object>> primaryFilters,
      TimelinePutResponse response, boolean allowEmptyDomainId) throws IOException {
    byte[] key = createDomainIdKey(entity.getEntityId(),
        entity.getEntityType(), revStartTime);
    if (entity.getDomainId() == null || entity.getDomainId().isEmpty()) {
      if (!allowEmptyDomainId) {
        handleError(entity, response, TimelinePutError.NO_DOMAIN);
        return;
      }
    } else {
      byte[] val = entity.getDomainId().getBytes(Charset.forName("UTF-8"));
      batch.put(key, val);
      writePrimaryFilterEntries(batch, primaryFilters, key, val);
    }
  }

  private void writePendingRelatedEntities(List<EntityIdentifier> pending,
      TimelineEntity parent, byte[] parentRevStart, TimelinePutResponse response) {
    for (EntityIdentifier related : pending) {
      LockMap.CountingReentrantLock<EntityIdentifier> lock = writeLocks.getLock(related);
      lock.lock();
      try {
        StartAndInsertTime si = getAndSetStartTime(related.getId(),
            related.getType(), readReverseOrderedLong(parentRevStart, 0), null);
        if (si == null) {
          LOG.error("Error setting start time for related entity");
          continue;
        }
        byte[] relatedRevStart = writeReverseOrderedLong(si.startTime);
        byte[] domainKey = createDomainIdKey(related.getId(),
            related.getType(), relatedRevStart);
        db.put(domainKey, parent.getDomainId().getBytes(Charset.forName("UTF-8")));
        db.put(createRelatedEntityKey(related.getId(),
            related.getType(), relatedRevStart,
            parent.getEntityId(), parent.getEntityType()), EMPTY_BYTES);
        db.put(createEntityMarkerKey(related.getId(),
            related.getType(), relatedRevStart),
            writeReverseOrderedLong(si.insertTime));
      } catch (DBException | IOException e) {
        LOG.error("Error putting related entity " + related.getId() + " of type " + related.getType(), e);
        handleError(parent, response, TimelinePutError.IO_EXCEPTION);
      } finally {
        lock.unlock();
        writeLocks.returnLock(lock);
      }
    }
  }

  private static void writePrimaryFilterEntries(WriteBatch writeBatch,
      Map<String, Set<Object>> primaryFilters, byte[] key, byte[] value) throws IOException {
    if (primaryFilters == null || primaryFilters.isEmpty()) {
      return;
    }
    for (Entry<String, Set<Object>> pf : primaryFilters.entrySet()) {
      for (Object val : pf.getValue()) {
        writeBatch.put(addPrimaryFilterToKey(pf.getKey(), val, key), value);
      }
    }
  }

  @Override
  public TimelinePutResponse put(TimelineEntities entities) {
    deleteLock.readLock().lock();
    try {
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
    deleteLock.readLock().lock();
    try {
      TimelinePutResponse response = new TimelinePutResponse();
      for (TimelineEntity entity : entities.getEntities()) {
        put(entity, response, true);
      }
      return response;
    } finally {
      deleteLock.readLock().unlock();
    }
  }

  private byte[] getStartTime(String entityId, String entityType) throws IOException {
    Long l = getStartTimeLong(entityId, entityType);
    return l == null ? null : writeReverseOrderedLong(l);
  }

  private Long getStartTimeLong(String entityId, String entityType) throws IOException {
    EntityIdentifier entity = new EntityIdentifier(entityId, entityType);
    if (startTimeReadCache.containsKey(entity)) {
      return startTimeReadCache.get(entity);
    }
    try {
      byte[] key = createStartTimeLookupKey(entityId, entityType);
      byte[] val = db.get(key);
      if (val == null) {
        return null;
      }
      Long l = readReverseOrderedLong(val, 0);
      startTimeReadCache.put(entity, l);
      return l;
    } catch (DBException e) {
      throw new IOException(e);
    }
  }

  private StartAndInsertTime getAndSetStartTime(String entityId,
      String entityType, Long startTime, List<TimelineEvent> events) throws IOException {
    EntityIdentifier entity = new EntityIdentifier(entityId, entityType);
    if (startTime == null) {
      if (startTimeWriteCache.containsKey(entity)) {
        return startTimeWriteCache.get(entity);
      }
      if (events != null) {
        startTime = events.stream()
            .mapToLong(TimelineEvent::getTimestamp)
            .min()
            .orElse(Long.MAX_VALUE);
      }
      return checkStartTimeInDb(entity, startTime);
    }
    if (startTimeWriteCache.containsKey(entity)) {
      return startTimeWriteCache.get(entity);
    }
    return checkStartTimeInDb(entity, startTime);
  }

  private StartAndInsertTime checkStartTimeInDb(EntityIdentifier entity,
      Long suggestedStartTime) throws IOException {
    byte[] key = createStartTimeLookupKey(entity.getId(), entity.getType());
    try {
      byte[] val = db.get(key);
      StartAndInsertTime result;
      if (val == null) {
        if (suggestedStartTime == null) {
          return null;
        }
        result = new StartAndInsertTime(suggestedStartTime, System.currentTimeMillis());
        byte[] data = new byte[16];
        writeReverseOrderedLong(suggestedStartTime, data, 0);
        writeReverseOrderedLong(result.insertTime, data, 8);
        WriteOptions wo = new WriteOptions();
        wo.sync(true);
        db.put(key, data, wo);
      } else {
        result = new StartAndInsertTime(readReverseOrderedLong(val, 0),
            readReverseOrderedLong(val, 8));
      }
      startTimeWriteCache.put(entity, result);
      startTimeReadCache.put(entity, result.startTime);
      return result;
    } catch (DBException e) {
      throw new IOException(e);
    }
  }

  private static byte[] createStartTimeLookupKey(String entityId,
      String entityType) throws IOException {
    return KeyBuilder.newInstance()
        .add(START_TIME_LOOKUP_PREFIX)
        .add(entityType)
        .add(entityId)
        .getBytes();
  }

  private static byte[] createEntityMarkerKey(String entityId,
      String entityType, byte[] revStartTime) throws IOException {
    return KeyBuilder.newInstance()
        .add(ENTITY_ENTRY_PREFIX)
        .add(entityType)
        .add(revStartTime)
        .add(entityId)
        .getBytesForLookup();
  }

  private static byte[] addPrimaryFilterToKey(String primaryFilterName,
      Object primaryFilterValue, byte[] key) throws IOException {
    return KeyBuilder.newInstance()
        .add(INDEXED_ENTRY_PREFIX)
        .add(primaryFilterName)
        .add(GenericObjectMapper.write(primaryFilterValue), true)
        .add(key)
        .getBytes();
  }

  private static byte[] createEntityEventKey(String entityId,
      String entityType, byte[] revStartTime, byte[] revEventTimestamp,
      String eventType) throws IOException {
    return KeyBuilder.newInstance()
        .add(ENTITY_ENTRY_PREFIX)
        .add(entityType)
        .add(revStartTime)
        .add(entityId)
        .add(EVENTS_COLUMN)
        .add(revEventTimestamp)
        .add(eventType)
        .getBytes();
  }

  private static TimelineEvent getEntityEvent(Set<String> eventTypes,
      byte[] key, int offset, byte[] value) throws IOException {
    KeyParser kp = new KeyParser(key, offset);
    long ts = kp.getNextLong();
    String type = kp.getNextString();
    if (eventTypes != null && !eventTypes.contains(type)) {
      return null;
    }
    TimelineEvent event = new TimelineEvent();
    event.setTimestamp(ts);
    event.setEventType(type);
    Object o = GenericObjectMapper.read(value);
    if (o instanceof Map) {
      @SuppressWarnings("unchecked")
      Map<String, Object> m = (Map<String, Object>) o;
      event.setEventInfo(m);
    } else {
      event.setEventInfo(null);
    }
    return event;
  }

  private static byte[] createPrimaryFilterKey(String entityId,
      String entityType, byte[] revStartTime, String name, Object value)
      throws IOException {
    return KeyBuilder.newInstance()
        .add(ENTITY_ENTRY_PREFIX)
        .add(entityType)
        .add(revStartTime)
        .add(entityId)
        .add(PRIMARY_FILTERS_COLUMN)
        .add(name)
        .add(GenericObjectMapper.write(value))
        .getBytes();
  }

  private static void addPrimaryFilter(TimelineEntity entity, byte[] key,
      int offset) throws IOException {
    KeyParser kp = new KeyParser(key, offset);
    String name = kp.getNextString();
    Object value = GenericObjectMapper.read(key, kp.getOffset());
    entity.addPrimaryFilter(name, value);
  }

  private static byte[] createOtherInfoKey(String entityId, String entityType,
      byte[] revStartTime, String name) throws IOException {
    return KeyBuilder.newInstance()
        .add(ENTITY_ENTRY_PREFIX)
        .add(entityType)
        .add(revStartTime)
        .add(entityId)
        .add(OTHER_INFO_COLUMN)
        .add(name)
        .getBytes();
  }

  private static String parseRemainingKey(byte[] b, int offset) {
    return new String(b, offset, b.length - offset, Charset.forName("UTF-8"));
  }

  private static byte[] createRelatedEntityKey(String entityId,
      String entityType, byte[] revStartTime, String relatedEntityId,
      String relatedEntityType) throws IOException {
    return KeyBuilder.newInstance()
        .add(ENTITY_ENTRY_PREFIX)
        .add(entityType)
        .add(revStartTime)
        .add(entityId)
        .add(RELATED_ENTITIES_COLUMN)
        .add(relatedEntityType)
        .add(relatedEntityId)
        .getBytes();
  }

  private static void addRelatedEntity(TimelineEntity entity, byte[] key,
      int offset) throws IOException {
    KeyParser kp = new KeyParser(key, offset);
    String type = kp.getNextString();
    String id = kp.getNextString();
    entity.addRelatedEntity(type, id);
  }

  private static byte[] createReverseRelatedEntityKey(String entityId,
      String entityType, byte[] revStartTime, String relatedEntityId,
      String relatedEntityType) throws IOException {
    return KeyBuilder.newInstance()
        .add(ENTITY_ENTRY_PREFIX)
        .add(entityType)
        .add(revStartTime)
        .add(entityId)
        .add(INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN)
        .add(relatedEntityType)
        .add(relatedEntityId)
        .getBytes();
  }

  private static byte[] createDomainIdKey(String entityId,
      String entityType, byte[] revStartTime) throws IOException {
    return KeyBuilder.newInstance()
        .add(ENTITY_ENTRY_PREFIX)
        .add(entityType)
        .add(revStartTime)
        .add(entityId)
        .add(DOMAIN_ID_COLUMN)
        .getBytes();
  }

  @VisibleForTesting
  void clearStartTimeCache() {
    startTimeWriteCache.clear();
    startTimeReadCache.clear();
  }

  @VisibleForTesting
  static int getStartTimeReadCacheSize(Configuration conf) {
    return conf.getInt(YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_READ_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_READ_CACHE_SIZE);
  }

  @VisibleForTesting
  static int getStartTimeWriteCacheSize(Configuration conf) {
    return conf.getInt(YarnConfiguration.TIMELINE_SERVICE_LEVELDB_START_TIME_WRITE_CACHE_SIZE,
        YarnConfiguration.DEFAULT_TIMELINE_SERVICE_LEVELDB_WRITE_CACHE_SIZE);
  }

  @VisibleForTesting
  List<String> getEntityTypes() throws IOException {
    LeveldbIterator iterator = null;
    try {
      iterator = getDbIterator(false);
      List<String> types = new ArrayList<>();
      iterator.seek(ENTITY_ENTRY_PREFIX);
      while (iterator.hasNext()) {
        byte[] key = iterator.peekNext().getKey();
        if (key[0] != ENTITY_ENTRY_PREFIX[0]) {
          break;
        }
        KeyParser kp = new KeyParser(key, ENTITY_ENTRY_PREFIX.length);
        String type = kp.getNextString();
        types.add(type);
        byte[] lookup = KeyBuilder.newInstance()
            .add(ENTITY_ENTRY_PREFIX).add(type).getBytesForLookup();
        lookup[lookup.length - 1] = 0x1;
        iterator.seek(lookup);
      }
      return types;
    } catch (DBException e) {
      throw new IOException(e);
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
  }

  private void deleteKeysWithPrefix(WriteBatch batch, byte[] prefix,
      LeveldbIterator iterator) {
    for (iterator.seek(prefix); iterator.hasNext(); iterator.next()) {
      byte[] key = iterator.peekNext().getKey();
      if (!prefixMatches(prefix, prefix.length, key)) {
        break;
      }
      batch.delete(key);
    }
  }

  @VisibleForTesting
  boolean deleteNextEntity(String entityType, byte[] reverseTimestamp,
      LeveldbIterator iterator, LeveldbIterator pfIterator, boolean seeked) throws IOException {
    try {
      KeyBuilder kb = KeyBuilder.newInstance().add(ENTITY_ENTRY_PREFIX).add(entityType);
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
      int prefixLen = kp.getOffset();
      byte[] deletePrefix = Arrays.copyOf(entityKey, prefixLen);
      WriteBatch batch = db.createWriteBatch();
      LOG.debug("Deleting entity type:" + entityType + " id:" + entityId);
      batch.delete(createStartTimeLookupKey(entityId, entityType));
      EntityIdentifier ei = new EntityIdentifier(entityId, entityType);
      startTimeReadCache.remove(ei);
      startTimeWriteCache.remove(ei);
      while (iterator.hasNext()) {
        byte[] key = iterator.peekNext().getKey();
        if (!prefixMatches(entityKey, prefixLen, key)) {
          break;
        }
        batch.delete(key);
        if (key.length == prefixLen) {
          iterator.next();
          continue;
        }
        byte column = key[prefixLen];
        if (column == PRIMARY_FILTERS_COLUMN[0]) {
          KeyParser pkp = new KeyParser(key, prefixLen + PRIMARY_FILTERS_COLUMN.length);
          String name = pkp.getNextString();
          Object value = GenericObjectMapper.read(key, pkp.getOffset());
          deleteKeysWithPrefix(batch, addPrimaryFilterToKey(name, value, deletePrefix), pfIterator);
          LOG.debug("Deleting entity type:" + entityType + " id:" + entityId + " primary filter entry " + name + " " + value);
        } else if (column == RELATED_ENTITIES_COLUMN[0]) {
          KeyParser rkp = new KeyParser(key, prefixLen + RELATED_ENTITIES_COLUMN.length);
          String type = rkp.getNextString();
          String id = rkp.getNextString();
          byte[] relatedStart = getStartTime(id, type);
          if (relatedStart != null) {
            batch.delete(createReverseRelatedEntityKey(id, type, relatedStart, entityId, entityType));
            LOG.debug("Deleting entity type:" + entityType + " id:" + entityId + " from invisible reverse related entity entry of type:" + type + " id:" + id);
          }
        } else if (column == INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN[0]) {
          KeyParser irkp = new KeyParser(key, prefixLen + INVISIBLE_REVERSE_RELATED_ENTITIES_COLUMN.length);
          String type = irkp.getNextString();
          String id = irkp.getNextString();
          byte[] relatedStart = getStartTime(id, type);
          if (relatedStart != null) {
            batch.delete(createRelatedEntityKey(id, type, relatedStart, entityId, entityType));
            LOG.debug("Deleting entity type:" + entityType + " id:" + entityId + " from related entity entry of type:" + type + " id:" + id);
          }
        }
        iterator.next();
      }
      WriteOptions wo = new WriteOptions();
      wo.sync(true);
      db.write(batch, wo);
      return true;
    } catch (DBException e) {
      throw new IOException(e);
    }
  }

  @VisibleForTesting
  void discardOldEntities(long timestamp) throws IOException, InterruptedException {
    byte[] reverseTimestamp = writeReverseOrderedLong(timestamp);
    long total = 0;
    long start = System.currentTimeMillis();
    List<String> types = getEntityTypes();
    for (String entityType : types) {
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
        while (deleteNextEntity(entityType, reverseTimestamp, iterator, pfIterator, seeked)) {
          typeCount++;
          total++;
          seeked = true;
          if (deletionThread != null && deletionThread.isInterrupted()) {
            throw new InterruptedException();
          }
        }
      } catch (IOException e) {
        LOG.error("Got IOException while deleting entities for type " + entityType, e);
      } finally {
        IOUtils.cleanup(LOG, iterator, pfIterator);
        deleteLock.writeLock().unlock();
        if (typeCount > 0) {
          LOG.info("Deleted " + typeCount + " entities of type " + entityType);
        }
      }
    }
    long end = System.currentTimeMillis();
    LOG.info("Discarded " + total + " entities for timestamp " + timestamp + " and earlier in " + (end - start) / 1000.0 + " seconds");
  }

  @VisibleForTesting
  LeveldbIterator getDbIterator(boolean fillCache) {
    ReadOptions ro = new ReadOptions();
    ro.fillCache(fillCache);
    return new LeveldbIterator(db, ro);
  }

  Version loadVersion() throws IOException {
    try {
      byte[] data = db.get(bytes(TIMELINE_STORE_VERSION_KEY));
      if (data == null || data.length == 0) {
        return getCurrentVersion();
      }
      return new VersionPBImpl(VersionProto.parseFrom(data));
    } catch (DBException e) {
      throw new IOException(e);
    }
  }

  @VisibleForTesting
  void storeVersion(Version state) throws IOException {
    dbStoreVersion(state);
  }

  private void dbStoreVersion(Version state) throws IOException {
    try {
      db.put(bytes(TIMELINE_STORE_VERSION_KEY), ((VersionPBImpl) state).getProto().toByteArray());
    } catch (DBException e) {
      throw new IOException(e);
    }
  }

  Version getCurrentVersion() {
    return CURRENT_VERSION_INFO;
  }

  private void checkVersion() throws IOException {
    Version loaded = loadVersion();
    LOG.info("Loaded timeline store version info " + loaded);
    if (loaded.equals(getCurrentVersion())) {
      return;
    }
    if (loaded.isCompatibleTo(getCurrentVersion())) {
      LOG.info("Storing timeline store version info " + getCurrentVersion());
      dbStoreVersion(CURRENT_VERSION_INFO);
    } else {
      String msg = "Incompatible version for timeline store: expecting version " + getCurrentVersion() + ", but loading version " + loaded;
      LOG.fatal(msg);
      throw new IOException(msg);
    }
  }

  @Override
  public void put(TimelineDomain domain) throws IOException {
    WriteBatch batch = null;
    try {
      batch = db.createWriteBatch();
      validateDomain(domain);
      writeDomainEntry(batch, domain.getId(), DESCRIPTION_COLUMN, domain.getDescription());
      writeDomainEntry(batch, domain.getId(), OWNER_COLUMN, domain.getOwner());
      writeDomainEntry(batch, domain.getId(), READER_COLUMN, domain.getReaders());
      writeDomainEntry(batch, domain.getId(), WRITER_COLUMN, domain.getWriters());
      writeDomainTimestamps(batch, domain);
      db.write(batch);
    } catch (DBException e) {
      throw new IOException(e);
    } finally {
      IOUtils.cleanup(LOG, batch);
    }
  }

  private void validateDomain(TimelineDomain domain) {
    if (domain.getId() == null || domain.getId().isEmpty()) {
      throw new IllegalArgumentException("Domain doesn't have an ID");
    }
    if (domain.getOwner() == null || domain.getOwner().isEmpty()) {
      throw new IllegalArgumentException("Domain doesn't have an owner.");
    }
  }

  private void writeDomainEntry(WriteBatch batch, String domainId,
      byte[] column, String value) throws IOException {
    byte[] entryKey = createDomainEntryKey(domainId, column);
    byte[] lookupKey = createOwnerLookupKey(domain.getOwner(), domainId, column);
    byte[] bytes = value != null ? value.getBytes(Charset.forName("UTF-8")) : EMPTY_BYTES;
    batch.put(entryKey, bytes);
    batch.put(lookupKey, bytes);
  }

  private void writeDomainTimestamps(WriteBatch batch, TimelineDomain domain) throws IOException {
    byte[] entryKey = createDomainEntryKey(domain.getId(), TIMESTAMP_COLUMN);
    byte[] lookupKey = createOwnerLookupKey(domain.getOwner(), domain.getId(), TIMESTAMP_COLUMN);
    long now = System.currentTimeMillis();
    byte[] timestamps = db.get(entryKey);
    if (timestamps == null) {
      timestamps = new byte[16];
      writeReverseOrderedLong(now, timestamps, 0);
      writeReverseOrderedLong(now, timestamps, 8);
    } else {
      writeReverseOrderedLong(now, timestamps, 8);
    }
    batch.put(entryKey, timestamps);
    batch.put(lookupKey, timestamps);
  }

  private static byte[] createDomainEntryKey(String domainId,
      byte[] columnName) throws IOException {
    return KeyBuilder.newInstance()
        .add(DOMAIN_ENTRY_PREFIX)
        .add(domainId)
        .add(columnName)
        .getBytes();
  }

  private static byte[] createOwnerLookupKey(String owner,
      String domainId, byte[] columnName) throws IOException {
    return KeyBuilder.newInstance()
        .add(OWNER_LOOKUP_PREFIX)
        .add(owner)
        .add(domainId)
        .add(columnName)
        .getBytes();
  }

  @Override
  public TimelineDomain getDomain(String domainId) throws IOException {
    LeveldbIterator iterator = null;
    try {
      byte[] prefix = KeyBuilder.newInstance()
          .add(DOMAIN_ENTRY_PREFIX)
          .add(domainId)
          .getBytesForLookup();
      iterator = new LeveldbIterator(db);
      iterator.seek(prefix);
      return readDomain(iterator, domainId, prefix);
    } catch (DBException e) {
      throw new IOException(e);
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
  }

  @Override
  public TimelineDomains getDomains(String owner) throws IOException {
    LeveldbIterator iterator = null;
    try {
      byte[] prefix = KeyBuilder.newInstance()
          .add(OWNER_LOOKUP_PREFIX)
          .add(owner)
          .getBytesForLookup();
      List<TimelineDomain> list = new ArrayList<>();
      iterator = new LeveldbIterator(db);
      for (iterator.seek(prefix); iterator.hasNext(); ) {
        byte[] key = iterator.peekNext().getKey();
        if (!prefixMatches(prefix, prefix.length, key)) {
          break;
        }
        KeyParser kp = new KeyParser(key, prefix.length);
        String domainId = kp.getNextString();
        byte[] extPrefix = KeyBuilder.newInstance()
            .add(OWNER_LOOKUP_PREFIX)
            .add(owner)
            .add(domainId)
            .getBytesForLookup();
        TimelineDomain domain = readDomain(iterator, domainId, extPrefix);
        if (domain != null) {
          list.add(domain);
        }
      }
      list.sort(this::compareDomains);
      TimelineDomains result = new TimelineDomains();
      result.addDomains(list);
      return result;
    } catch (DBException e) {
      throw new IOException(e);
    } finally {
      IOUtils.cleanup(LOG, iterator);
    }
  }

  private int compareDomains(TimelineDomain d1, TimelineDomain d2) {
    int cmp = d2.getCreatedTime().compareTo(d1.getCreatedTime());
    return cmp != 0 ? cmp : d2.getModifiedTime().compareTo(d1.getModifiedTime());
  }

  private static TimelineDomain readDomain(LeveldbIterator iterator,
      String domainId, byte[] prefix) throws IOException {
    TimelineDomain domain = new TimelineDomain();
    domain.setId(domainId);
    boolean empty = true;
    while (iterator.hasNext()) {
      byte[] key = iterator.peekNext().getKey();
      if (!prefixMatches(prefix, prefix.length, key)) {
        break;
      }
      byte[] value = iterator.peekNext().getValue();
      if (value != null && value.length > 0) {
        switch (key[prefix.length]) {
          case 'd':
            domain.setDescription(new String(value, Charset.forName("UTF-8")));
            break;
          case 'o':
            domain.setOwner(new String(value, Charset.forName("UTF-8")));
            break;
          case 'r':
            domain.setReaders(new String(value, Charset.forName("UTF-8")));
            break;
          case 'w':
            domain.setWriters(new String(value, Charset.forName("UTF-8")));
            break;
          case 't':
            domain.setCreatedTime(readReverseOrderedLong(value, 0));
            domain.setModifiedTime(readReverseOrderedLong(value, 8));
            break;
          default:
            LOG.error("Unrecognized domain column: " + key[prefix.length]);
        }
      }
      empty = false;
      iterator.next();
    }
    return empty ? null : domain;
  }
}