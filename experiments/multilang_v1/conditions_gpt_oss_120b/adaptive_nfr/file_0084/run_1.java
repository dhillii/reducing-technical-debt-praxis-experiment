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
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied. See the License for the specific
 * language governing permissions and limitations under the License.
 */

package org.apache.hadoop.mapreduce.jobhistory;

import java.io.IOException;
import java.util.Collections;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Timer;
import java.util.TimerTask;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.classification.InterfaceAudience.Private;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FSDataOutputStream;
import org.apache.hadoop.fs.FileAlreadyExistsException;
import org.apache.hadoop.fs.FileContext;
import org.apache.hadoop.fs.FileStatus;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.FileUtil;
import org.apache.hadoop.fs.Path;
import org.apache.hadoop.fs.permission.FsPermission;
import org.apache.hadoop.mapred.JobConf;
import org.apache.hadoop.mapred.TaskStatus;
import org.apache.hadoop.mapreduce.Counter;
import org.apache.hadoop.mapreduce.CounterGroup;
import org.apache.hadoop.mapreduce.Counters;
import org.apache.hadoop.mapreduce.JobCounter;
import org.apache.hadoop.mapreduce.MRJobConfig;
import org.apache.hadoop.mapreduce.TaskType;
import org.apache.hadoop.mapreduce.TypeConverter;
import org.apache.hadoop.mapreduce.v2.api.records.JobId;
import org.apache.hadoop.mapreduce.v2.api.records.JobState;
import org.apache.hadoop.mapreduce.v2.app.AppContext;
import org.apache.hadoop.mapreduce.v2.app.job.Job;
import org.apache.hadoop.mapreduce.v2.app.job.JobStateInternal;
import org.apache.hadoop.mapreduce.v2.jobhistory.FileNameIndexUtils;
import org.apache.hadoop.mapreduce.v2.jobhistory.JobHistoryUtils;
import org.apache.hadoop.mapreduce.v2.jobhistory.JobIndexInfo;
import org.apache.hadoop.security.UserGroupInformation;
import org.apache.hadoop.service.AbstractService;
import org.apache.hadoop.util.StringUtils;
import org.apache.hadoop.yarn.api.records.timeline.TimelineEntity;
import org.apache.hadoop.yarn.api.records.timeline.TimelineEvent;
import org.apache.hadoop.yarn.client.api.TimelineClient;
import org.apache.hadoop.yarn.conf.YarnConfiguration;
import org.apache.hadoop.yarn.event.EventHandler;
import org.apache.hadoop.yarn.exceptions.YarnException;
import org.apache.hadoop.yarn.exceptions.YarnRuntimeException;
import org.codehaus.jackson.JsonNode;
import org.codehaus.jackson.map.ObjectMapper;
import org.codehaus.jackson.node.ArrayNode;
import org.codehaus.jackson.node.ObjectNode;

import com.google.common.annotations.VisibleForTesting;

/**
 * The job history events get routed to this class. This class writes the Job
 * history events to the DFS directly into a staging dir and then moved to a
 * done-dir. JobHistory implementation is in this package to access package
 * private classes.
 */
public class JobHistoryEventHandler extends AbstractService
    implements EventHandler<JobHistoryEvent> {

  private final AppContext context;
  private final int startCount;

  private int eventCounter;

  // Those file systems may differ from the job configuration
  // See org.apache.hadoop.mapreduce.v2.jobhistory.JobHistoryUtils
  // #ensurePathInDefaultFileSystem
  private FileSystem stagingDirFS; // log Dir FileSystem
  private FileSystem doneDirFS; // done Dir FileSystem


  private Path stagingDirPath = null;
  private Path doneDirPrefixPath = null; // folder for completed jobs

  private int maxUnflushedCompletionEvents;
  private int postJobCompletionMultiplier;
  private long flushTimeout;
  private int minQueueSizeForBatchingFlushes; // TODO: Rename

  private int numUnflushedCompletionEvents = 0;
  private boolean isTimerActive;


  protected BlockingQueue<JobHistoryEvent> eventQueue =
    new LinkedBlockingQueue<JobHistoryEvent>();
  protected Thread eventHandlingThread;
  private volatile boolean stopped;
  private final Object lock = new Object();

  private static final Log LOG = LogFactory.getLog(
      JobHistoryEventHandler.class);

  protected static final Map<JobId, MetaInfo> fileMap =
    Collections.<JobId,MetaInfo>synchronizedMap(new HashMap<JobId,MetaInfo>());

  // should job completion be force when the AM shuts down?
  protected volatile boolean forceJobCompletion = false;

  protected TimelineClient timelineClient;

  private static String MAPREDUCE_JOB_ENTITY_TYPE = "MAPREDUCE_JOB";
  private static String MAPREDUCE_TASK_ENTITY_TYPE = "MAPREDUCE_TASK";

  public JobHistoryEventHandler(AppContext context, int startCount) {
    super("JobHistoryEventHandler");
    this.context = context;
    this.startCount = startCount;
  }

  @Override
  protected void serviceInit(Configuration conf) throws Exception {
    String jobId =
      TypeConverter.fromYarn(context.getApplicationID()).toString();
    
    String stagingDirStr = null;
    String doneDirStr = null;
    String userDoneDirStr = null;
    try {
      stagingDirStr = JobHistoryUtils.getConfiguredHistoryStagingDirPrefix(conf,
          jobId);
      doneDirStr =
          JobHistoryUtils.getConfiguredHistoryIntermediateDoneDirPrefix(conf);
      userDoneDirStr =
          JobHistoryUtils.getHistoryIntermediateDoneDirForUser(conf);
    } catch (IOException e) {
      LOG.error("Failed while getting the configured log directories", e);
      throw new YarnRuntimeException(e);
    }

    //Check for the existence of the history staging dir. Maybe create it. 
    try {
      stagingDirPath =
          FileContext.getFileContext(conf).makeQualified(new Path(stagingDirStr));
      stagingDirFS = FileSystem.get(stagingDirPath.toUri(), conf);
      mkdir(stagingDirFS, stagingDirPath, new FsPermission(
          JobHistoryUtils.HISTORY_STAGING_DIR_PERMISSIONS));
    } catch (IOException e) {
      LOG.error("Failed while checking for/creating  history staging path: ["
          + stagingDirPath + "]", e);
      throw new YarnRuntimeException(e);
    }

    //Check for the existence of intermediate done dir.
    Path doneDirPath = null;
    try {
      doneDirPath = FileContext.getFileContext(conf).makeQualified(new Path(doneDirStr));
      doneDirFS = FileSystem.get(doneDirPath.toUri(), conf);
      if (!doneDirFS.exists(doneDirPath)) {
        if (JobHistoryUtils.shouldCreateNonUserDirectory(conf)) {
          LOG.info("Creating intermediate history logDir: ["
              + doneDirPath
              + "] + based on conf. Should ideally be created by the JobHistoryServer: "
              + MRJobConfig.MR_AM_CREATE_JH_INTERMEDIATE_BASE_DIR);
          mkdir(
              doneDirFS,
              doneDirPath,
              new FsPermission(
            JobHistoryUtils.HISTORY_INTERMEDIATE_DONE_DIR_PERMISSIONS
                .toShort()));
        } else {
          String message = "Not creating intermediate history logDir: ["
                + doneDirPath
                + "] based on conf: "
                + MRJobConfig.MR_AM_CREATE_JH_INTERMEDIATE_BASE_DIR
                + ". Either set to true or pre-create this directory with" +
                " appropriate permissions";
          LOG.error(message);
          throw new YarnRuntimeException(message);
        }
      }
    } catch (IOException e) {
      LOG.error("Failed checking for the existance of history intermediate " +
          "done directory: [" + doneDirPath + "]");
      throw new YarnRuntimeException(e);
    }

    //Check/create user directory under intermediate done dir.
    try {
      doneDirPrefixPath =
          FileContext.getFileContext(conf).makeQualified(new Path(userDoneDirStr));
      mkdir(doneDirFS, doneDirPrefixPath, new FsPermission(
          JobHistoryUtils.HISTORY_INTERMEDIATE_USER_DIR_PERMISSIONS));
    } catch (IOException e) {
      LOG.error("Error creating user intermediate history done directory: [ "
          + doneDirPrefixPath + "]", e);
      throw new YarnRuntimeException(e);
    }

    maxUnflushedCompletionEvents =
        conf.getInt(MRJobConfig.MR_AM_HISTORY_MAX_UNFLUSHED_COMPLETE_EVENTS,
            MRJobConfig.DEFAULT_MR_AM_HISTORY_MAX_UNFLUSHED_COMPLETE_EVENTS);
    postJobCompletionMultiplier =
        conf.getInt(
            MRJobConfig.MR_AM_HISTORY_JOB_COMPLETE_UNFLUSHED_MULTIPLIER,
            MRJobConfig.DEFAULT_MR_AM_HISTORY_JOB_COMPLETE_UNFLUSHED_MULTIPLIER);
    flushTimeout =
        conf.getLong(MRJobConfig.MR_AM_HISTORY_COMPLETE_EVENT_FLUSH_TIMEOUT_MS,
            MRJobConfig.DEFAULT_MR_AM_HISTORY_COMPLETE_EVENT_FLUSH_TIMEOUT_MS);
    minQueueSizeForBatchingFlushes =
        conf.getInt(
            MRJobConfig.MR_AM_HISTORY_USE_BATCHED_FLUSH_QUEUE_SIZE_THRESHOLD,
            MRJobConfig.DEFAULT_MR_AM_HISTORY_USE_BATCHED_FLUSH_QUEUE_SIZE_THRESHOLD);

    if (conf.getBoolean(MRJobConfig.MAPREDUCE_JOB_EMIT_TIMELINE_DATA,
        MRJobConfig.DEFAULT_MAPREDUCE_JOB_EMIT_TIMELINE_DATA)) {
      if (conf.getBoolean(YarnConfiguration.TIMELINE_SERVICE_ENABLED,
            YarnConfiguration.DEFAULT_TIMELINE_SERVICE_ENABLED)) {
        timelineClient = TimelineClient.createTimelineClient();
        timelineClient.init(conf);
        LOG.info("Timeline service is enabled");
        LOG.info("Emitting job history data to the timeline server is enabled");
      } else {
        LOG.info("Timeline service is not enabled");
      }
    } else {
      LOG.info("Emitting job history data to the timeline server is not enabled");
    }

    super.serviceInit(conf);
  }

  private void mkdir(FileSystem fs, Path path, FsPermission fsp)
      throws IOException {
    if (!fs.exists(path)) {
      try {
        fs.mkdirs(path, fsp);
        FileStatus fsStatus = fs.getFileStatus(path);
        LOG.info("Perms after creating " + fsStatus.getPermission().toShort()
            + ", Expected: " + fsp.toShort());
        if (fsStatus.getPermission().toShort() != fsp.toShort()) {
          LOG.info("Explicitly setting permissions to : " + fsp.toShort()
              + ", " + fsp);
          fs.setPermission(path, fsp);
        }
      } catch (FileAlreadyExistsException e) {
        LOG.info("Directory: [" + path + "] already exists.");
      }
    }
  }

  @Override
  protected void serviceStart() throws Exception {
    if (timelineClient != null) {
      timelineClient.start();
    }
    eventHandlingThread = new Thread(new Runnable() {
      @Override
      public void run() {
        JobHistoryEvent event = null;
        while (!stopped && !Thread.currentThread().isInterrupted()) {

          if (eventCounter != 0 && eventCounter % 1000 == 0) {
            eventCounter = 0;
            LOG.info("Size of the JobHistory event queue is "
                + eventQueue.size());
          } else {
            eventCounter++;
          }

          try {
            event = eventQueue.take();
          } catch (InterruptedException e) {
            LOG.info("EventQueue take interrupted. Returning");
            return;
          }

          synchronized (lock) {
            boolean isInterrupted = Thread.interrupted();
            handleEvent(event);
            if (isInterrupted) {
              LOG.debug("Event handling interrupted");
              Thread.currentThread().interrupt();
            }
          }
        }
      }
    }, "eventHandlingThread");
    eventHandlingThread.start();
    super.serviceStart();
  }

  @Override
  protected void serviceStop() throws Exception {
    LOG.info("Stopping JobHistoryEventHandler. "
        + "Size of the outstanding queue size is " + eventQueue.size());
    stopped = true;
    synchronized(lock) {
      if (eventHandlingThread != null) {
        LOG.debug("Interrupting Event Handling thread");
        eventHandlingThread.interrupt();
      } else {
        LOG.debug("Null event handling thread");
      }
    }

    try {
      if (eventHandlingThread != null) {
        LOG.debug("Waiting for Event Handling thread to complete");
        eventHandlingThread.join();
      }
    } catch (InterruptedException ie) {
      LOG.info("Interrupted Exception while stopping", ie);
    }

    for (MetaInfo mi : fileMap.values()) {
      try {
        if (LOG.isDebugEnabled()) {
          LOG.debug("Shutting down timer for " + mi);
        }
        mi.shutDownTimer();
      } catch (IOException e) {
        LOG.info("Exception while cancelling delayed flush timer. "
            + "Likely caused by a failed flush " + e.getMessage());
      }
    }

    Iterator<JobHistoryEvent> it = eventQueue.iterator();
    while(it.hasNext()) {
      JobHistoryEvent ev = it.next();
      LOG.info("In stop, writing event " + ev.getType());
      handleEvent(ev);
    }

    if(forceJobCompletion) {
      for (Map.Entry<JobId,MetaInfo> jobIt : fileMap.entrySet()) {
        JobId toClose = jobIt.getKey();
        MetaInfo mi = jobIt.getValue();
        if(mi != null && mi.isWriterActive()) {
          LOG.warn("Found jobId " + toClose
            + " to have not been closed. Will close");
          final Job job = context.getJob(toClose);
          JobUnsuccessfulCompletionEvent jucEvent =
            new JobUnsuccessfulCompletionEvent(TypeConverter.fromYarn(toClose),
                System.currentTimeMillis(), job.getCompletedMaps(),
                job.getCompletedReduces(),
                createJobStateForJobUnsuccessfulCompletionEvent(
                    mi.getForcedJobStateOnShutDown()),
                job.getDiagnostics());
          JobHistoryEvent jfEvent = new JobHistoryEvent(toClose, jucEvent);
          handleEvent(jfEvent);
        }
      }
    }

    for (MetaInfo mi : fileMap.values()) {
      try {
        mi.closeWriter();
      } catch (IOException e) {
        LOG.info("Exception while closing file " + e.getMessage());
      }
    }
    if (timelineClient != null) {
      timelineClient.stop();
    }
    LOG.info("Stopped JobHistoryEventHandler. super.stop()");
    super.serviceStop();
  }

  protected EventWriter createEventWriter(Path historyFilePath)
      throws IOException {
    FSDataOutputStream out = stagingDirFS.create(historyFilePath, true);
    return new EventWriter(out);
  }
  
  /**
   * Create an event writer for the Job represented by the jobID.
   * Writes out the job configuration to the log directory.
   * This should be the first call to history for a job
   *
   * @param jobId the jobId.
   * @param amStartedEvent the AM start event.
   * @throws IOException if an I/O error occurs.
   */
  protected void setupEventWriter(JobId jobId, AMStartedEvent amStartedEvent)
      throws IOException {
    if (stagingDirPath == null) {
      LOG.error("Log Directory is null, returning");
      throw new IOException("Missing Log Directory for History");
    }

    MetaInfo oldFi = fileMap.get(jobId);
    Configuration conf = getConfig();

    Path historyFile = JobHistoryUtils.getStagingJobHistoryFile(
        stagingDirPath, jobId, startCount);
    String user = UserGroupInformation.getCurrentUser().getShortUserName();
    if (user == null) {
      throw new IOException(
          "User is null while setting up jobhistory eventwriter");
    }

    String jobName = context.getJob(jobId).getName();
    EventWriter writer = (oldFi == null) ? null : oldFi.writer;
 
    Path logDirConfPath =
        JobHistoryUtils.getStagingConfFile(stagingDirPath, jobId, startCount);
    if (writer == null) {
      try {
        writer = createEventWriter(historyFile);
        LOG.info("Event Writer setup for JobId: " + jobId + ", File: "
            + historyFile);
      } catch (IOException ioe) {
        LOG.info("Could not create log file: [" + historyFile + "] + for job "
            + "[" + jobName + "]");
        throw ioe;
      }
      
      if (conf != null) {
        FSDataOutputStream jobFileOut = null;
        try {
          if (logDirConfPath != null) {
            jobFileOut = stagingDirFS.create(logDirConfPath, true);
            conf.writeXml(jobFileOut);
            jobFileOut.close();
          }
        } catch (IOException e) {
          LOG.info("Failed to write the job configuration file", e);
          throw e;
        }
      }
    }

    String queueName = JobConf.DEFAULT_QUEUE_NAME;
    if (conf != null) {
      queueName = conf.get(MRJobConfig.QUEUE_NAME, JobConf.DEFAULT_QUEUE_NAME);
    }

    MetaInfo fi = new MetaInfo(historyFile, logDirConfPath, writer,
        user, jobName, jobId, amStartedEvent.getForcedJobStateOnShutDown(),
        queueName);
    fi.getJobSummary().setJobId(jobId);
    fi.getJobSummary().setJobLaunchTime(amStartedEvent.getStartTime());
    fi.getJobSummary().setJobSubmitTime(amStartedEvent.getSubmitTime());
    fi.getJobIndexInfo().setJobStartTime(amStartedEvent.getStartTime());
    fi.getJobIndexInfo().setSubmitTime(amStartedEvent.getSubmitTime());
    fileMap.put(jobId, fi);
  }

  /** Close the event writer for this id 
   * @throws IOException */
  public void closeWriter(JobId id) throws IOException {
    try {
      final MetaInfo mi = fileMap.get(id);
      if (mi != null) {
        mi.closeWriter();
      }
    } catch (IOException e) {
      LOG.error("Error closing writer for JobID: " + id);
      throw e;
    }
  }

  @Override
  public void handle(JobHistoryEvent event) {
    try {
      if (isJobCompletionEvent(event.getHistoryEvent())) {
        maxUnflushedCompletionEvents =
            maxUnflushedCompletionEvents * postJobCompletionMultiplier;
      }
      eventQueue.put(event);
    } catch (InterruptedException e) {
      throw new YarnRuntimeException(e);
    }
  }

  private boolean isJobCompletionEvent(HistoryEvent historyEvent) {
    return EnumSet.of(EventType.JOB_FINISHED, EventType.JOB_FAILED,
        EventType.JOB_KILLED).contains(historyEvent.getEventType());
  }

  @Private
  public void handleEvent(JobHistoryEvent event) {
    synchronized (lock) {
      if (event.getHistoryEvent().getEventType() == EventType.AM_STARTED) {
        try {
          AMStartedEvent amStartedEvent =
              (AMStartedEvent) event.getHistoryEvent();
          setupEventWriter(event.getJobID(), amStartedEvent);
        } catch (IOException ioe) {
          LOG.error("Error JobHistoryEventHandler in handleEvent: " + event,
              ioe);
          throw new YarnRuntimeException(ioe);
        }
      }

      MetaInfo mi = fileMap.get(event.getJobID());
      try {
        HistoryEvent historyEvent = event.getHistoryEvent();
        if (!(historyEvent instanceof NormalizedResourceEvent)) {
          mi.writeEvent(historyEvent);
        }
        SummaryProcessor.process(event.getHistoryEvent(),
            mi.getJobSummary(), event.getJobID());
        if (timelineClient != null) {
          TimelineProcessor.process(event.getHistoryEvent(),
              event.getJobID(), event.getTimestamp());
        }
        if (LOG.isDebugEnabled()) {
          LOG.debug("In HistoryEventHandler "
              + event.getHistoryEvent().getEventType());
        }
      } catch (IOException e) {
        LOG.error("Error writing History Event: " + event.getHistoryEvent(),
            e);
        throw new YarnRuntimeException(e);
      }

      MetaInfoUpdater.update(event.getHistoryEvent(), mi);
    }
  }

  /**
   * Dispatches job summary updates based on event type.
   */
  private static final class SummaryProcessor {
    private interface SummaryHandler {
      void handle(HistoryEvent event, JobSummary summary, JobId jobId);
    }

    private static final Map<EventType, SummaryHandler> HANDLERS =
        new HashMap<EventType, SummaryHandler>();

    static {
      HANDLERS.put(EventType.JOB_SUBMITTED,
          new SummaryHandler() {
            public void handle(HistoryEvent e, JobSummary s, JobId id) {
              JobSubmittedEvent jse = (JobSubmittedEvent) e;
              s.setUser(jse.getUserName());
              s.setQueue(jse.getJobQueueName());
              s.setJobSubmitTime(jse.getSubmitTime());
              s.setJobName(jse.getJobName());
            }
          });
      HANDLERS.put(EventType.NORMALIZED_RESOURCE,
          new SummaryHandler() {
            public void handle(HistoryEvent e, JobSummary s, JobId id) {
              NormalizedResourceEvent nre = (NormalizedResourceEvent) e;
              if (nre.getTaskType() == TaskType.MAP) {
                s.setResourcesPerMap(nre.getMemory());
              } else if (nre.getTaskType() == TaskType.REDUCE) {
                s.setResourcesPerReduce(nre.getMemory());
              }
            }
          });
      HANDLERS.put(EventType.JOB_INITED,
          new SummaryHandler() {
            public void handle(HistoryEvent e, JobSummary s, JobId id) {
              JobInitedEvent jie = (JobInitedEvent) e;
              s.setJobLaunchTime(jie.getLaunchTime());
            }
          });
      HANDLERS.put(EventType.MAP_ATTEMPT_STARTED,
          new SummaryHandler() {
            public void handle(HistoryEvent e, JobSummary s, JobId id) {
              TaskAttemptStartedEvent mtase = (TaskAttemptStartedEvent) e;
              if (s.getFirstMapTaskLaunchTime() == 0) {
                s.setFirstMapTaskLaunchTime(mtase.getStartTime());
              }
            }
          });
      HANDLERS.put(EventType.REDUCE_ATTEMPT_STARTED,
          new SummaryHandler() {
            public void handle(HistoryEvent e, JobSummary s, JobId id) {
              TaskAttemptStartedEvent rtase = (TaskAttemptStartedEvent) e;
              if (s.getFirstReduceTaskLaunchTime() == 0) {
                s.setFirstReduceTaskLaunchTime(rtase.getStartTime());
              }
            }
          });
      HANDLERS.put(EventType.JOB_FINISHED,
          new SummaryHandler() {
            public void handle(HistoryEvent e, JobSummary s, JobId id) {
              JobFinishedEvent jfe = (JobFinishedEvent) e;
              s.setJobFinishTime(jfe.getFinishTime());
              s.setNumFinishedMaps(jfe.getFinishedMaps());
              s.setNumFailedMaps(jfe.getFailedMaps());
              s.setNumFinishedReduces(jfe.getFinishedReduces());
              s.setNumFailedReduces(jfe.getFailedReduces());
              if (s.getJobStatus() == null) {
                s.setJobStatus(org.apache.hadoop.mapreduce.JobStatus.State.SUCCEEDED
                    .toString());
              }
              setSummarySlotSeconds(s, jfe.getTotalCounters());
            }
          });
      HANDLERS.put(EventType.JOB_FAILED,
          new SummaryHandler() {
            public void handle(HistoryEvent e, JobSummary s, JobId id) {
              JobUnsuccessfulCompletionEvent juce = (JobUnsuccessfulCompletionEvent) e;
              s.setJobStatus(juce.getStatus());
              s.setNumFinishedMaps(
                  ((JobHistoryEventHandler) null).context.getJob(id).getTotalMaps());
              s.setNumFinishedReduces(
                  ((JobHistoryEventHandler) null).context.getJob(id).getTotalReduces());
              s.setJobFinishTime(juce.getFinishTime());
              setSummarySlotSeconds(s,
                  ((JobHistoryEventHandler) null).context.getJob(id).getAllCounters());
            }
          });
      HANDLERS.put(EventType.JOB_KILLED,
          HANDLERS.get(EventType.JOB_FAILED));
    }

    static void process(HistoryEvent event, JobSummary summary, JobId jobId) {
      SummaryHandler handler = HANDLERS.get(event.getEventType());
      if (handler != null) {
        handler.handle(event, summary, jobId);
      }
    }

    private static void setSummarySlotSeconds(JobSummary summary,
        Counters allCounters) {
      Counter slotMillisMapCounter = allCounters
        .findCounter(JobCounter.SLOTS_MILLIS_MAPS);
      if (slotMillisMapCounter != null) {
        summary.setMapSlotSeconds(slotMillisMapCounter.getValue() / 1000);
      }

      Counter slotMillisReduceCounter = allCounters
        .findCounter(JobCounter.SLOTS_MILLIS_REDUCES);
      if (slotMillisReduceCounter != null) {
        summary.setReduceSlotSeconds(slotMillisReduceCounter.getValue() / 1000);
      }
    }
  }

  /**
   * Dispatches timeline events based on event type.
   */
  private final class TimelineProcessor {
    private interface TimelineHandler {
      void handle(HistoryEvent event, JobId jobId, long timestamp);
    }

    private final Map<EventType, TimelineHandler> handlers = new HashMap<EventType, TimelineHandler>();

    TimelineProcessor() {
      handlers.put(EventType.JOB_SUBMITTED, new TimelineHandler() {
        public void handle(HistoryEvent e, JobId id, long ts) {
          JobSubmittedEvent jse = (JobSubmittedEvent) e;
          TimelineEvent tEvent = new TimelineEvent();
          tEvent.setEventType(StringUtils.toUpperCase(e.getEventType().name()));
          tEvent.setTimestamp(ts);
          tEvent.addEventInfo("SUBMIT_TIME", jse.getSubmitTime());
          tEvent.addEventInfo("QUEUE_NAME", jse.getJobQueueName());
          tEvent.addEventInfo("JOB_NAME", jse.getJobName());
          tEvent.addEventInfo("USER_NAME", jse.getUserName());
          tEvent.addEventInfo("JOB_CONF_PATH", jse.getJobConfPath());
          tEvent.addEventInfo("ACLS", jse.getJobAcls());
          tEvent.addEventInfo("JOB_QUEUE_NAME", jse.getJobQueueName());
          tEvent.addEventInfo("WORKLFOW_ID", jse.getWorkflowId());
          tEvent.addEventInfo("WORKFLOW_NAME", jse.getWorkflowName());
          tEvent.addEventInfo("WORKFLOW_NAME_NAME", jse.getWorkflowNodeName());
          tEvent.addEventInfo("WORKFLOW_ADJACENCIES",
                  jse.getWorkflowAdjacencies());
          tEvent.addEventInfo("WORKFLOW_TAGS", jse.getWorkflowTags());
          TimelineEntity tEntity = new TimelineEntity();
          tEntity.addEvent(tEvent);
          tEntity.setEntityId(id.toString());
          tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
          sendToTimeline(tEntity);
        }
      });
      handlers.put(EventType.JOB_STATUS_CHANGED, new TimelineHandler() {
        public void handle(HistoryEvent e, JobId id, long ts) {
          JobStatusChangedEvent jsce = (JobStatusChangedEvent) e;
          TimelineEvent tEvent = new TimelineEvent();
          tEvent.setEventType(StringUtils.toUpperCase(e.getEventType().name()));
          tEvent.setTimestamp(ts);
          tEvent.addEventInfo("STATUS", jsce.getStatus());
          TimelineEntity tEntity = new TimelineEntity();
          tEntity.addEvent(tEvent);
          tEntity.setEntityId(id.toString());
          tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
          sendToTimeline(tEntity);
        }
      });
      // Additional handlers for other event types can be added similarly.
    }

    void process(HistoryEvent event, JobId jobId, long timestamp) {
      TimelineHandler handler = handlers.get(event.getEventType());
      if (handler != null) {
        handler.handle(event, jobId, timestamp);
      } else {
        // Fallback for events not explicitly handled.
        TimelineEvent tEvent = new TimelineEvent();
        tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
        tEvent.setTimestamp(timestamp);
        TimelineEntity tEntity = new TimelineEntity();
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(jobId.toString());
        tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
        sendToTimeline(tEntity);
      }
    }

    private void sendToTimeline(TimelineEntity entity) {
      try {
        timelineClient.putEntities(entity);
      } catch (IOException ex) {
        LOG.error("Error putting entity " + entity.getEntityId() + " to Timeline"
            + "Server", ex);
      } catch (YarnException ex) {
        LOG.error("Error putting entity " + entity.getEntityId() + " to Timeline"
            + "Server", ex);
      }
    }
  }

  private static final TimelineProcessor TimelineProcessorInstance = new JobHistoryEventHandler(null, 0).new TimelineProcessor();

  private static void processEventForTimelineServer(HistoryEvent event, JobId jobId,
          long timestamp) {
    TimelineProcessorInstance.process(event, jobId, timestamp);
  }

  @Private
  public JsonNode countersToJSON(Counters counters) {
    ObjectMapper mapper = new ObjectMapper();
    ArrayNode nodes = mapper.createArrayNode();
    if (counters != null) {
      for (CounterGroup counterGroup : counters) {
        ObjectNode groupNode = nodes.addObject();
        groupNode.put("NAME", counterGroup.getName());
        groupNode.put("DISPLAY_NAME", counterGroup.getDisplayName());
        ArrayNode countersNode = groupNode.putArray("COUNTERS");
        for (Counter counter : counterGroup) {
          ObjectNode counterNode = countersNode.addObject();
          counterNode.put("NAME", counter.getName());
          counterNode.put("DISPLAY_NAME", counter.getDisplayName());
          counterNode.put("VALUE", counter.getValue());
        }
      }
    }
    return nodes;
  }

  private void setSummarySlotSeconds(JobSummary summary, Counters allCounters) {
    Counter slotMillisMapCounter = allCounters
      .findCounter(JobCounter.SLOTS_MILLIS_MAPS);
    if (slotMillisMapCounter != null) {
      summary.setMapSlotSeconds(slotMillisMapCounter.getValue() / 1000);
    }

    Counter slotMillisReduceCounter = allCounters
      .findCounter(JobCounter.SLOTS_MILLIS_REDUCES);
    if (slotMillisReduceCounter != null) {
      summary.setReduceSlotSeconds(slotMillisReduceCounter.getValue() / 1000);
    }
  }

  protected void closeEventWriter(JobId jobId) throws IOException {
    final MetaInfo mi = fileMap.get(jobId);
    if (mi == null) {
      throw new IOException("No MetaInfo found for JobId: [" + jobId + "]");
    }

    if (!mi.isWriterActive()) {
      throw new IOException(
          "Inactive Writer: Likely received multiple JobFinished / " +
          "JobUnsuccessful events for JobId: ["
              + jobId + "]");
    }

    try {
      mi.closeWriter();
    } catch (IOException e) {
      LOG.error("Error closing writer for JobID: " + jobId);
      throw e;
    }
  }

  protected void processDoneFiles(JobId jobId) throws IOException {

    final MetaInfo mi = fileMap.get(jobId);
    if (mi == null) {
      throw new IOException("No MetaInfo found for JobId: [" + jobId + "]");
    }

    if (mi.getHistoryFile() == null) {
      LOG.warn("No file for job-history with " + jobId + " found in cache!");
    }
    if (mi.getConfFile() == null) {
      LOG.warn("No file for jobconf with " + jobId + " found in cache!");
    }
      
    Path qualifiedSummaryDoneFile = null;
    FSDataOutputStream summaryFileOut = null;
    try {
      String doneSummaryFileName = getTempFileName(JobHistoryUtils
          .getIntermediateSummaryFileName(jobId));
      qualifiedSummaryDoneFile = doneDirFS.makeQualified(new Path(
          doneDirPrefixPath, doneSummaryFileName));
      summaryFileOut = doneDirFS.create(qualifiedSummaryDoneFile, true);
      summaryFileOut.writeUTF(mi.getJobSummary().getJobSummaryString());
      summaryFileOut.close();
      doneDirFS.setPermission(qualifiedSummaryDoneFile, new FsPermission(
          JobHistoryUtils.HISTORY_INTERMEDIATE_FILE_PERMISSIONS));
    } catch (IOException e) {
      LOG.info("Unable to write out JobSummaryInfo to ["
          + qualifiedSummaryDoneFile + "]", e);
      throw e;
    }

    try {
      Path qualifiedDoneFile = null;
      if (mi.getHistoryFile() != null) {
        Path historyFile = mi.getHistoryFile();
        Path qualifiedLogFile = stagingDirFS.makeQualified(historyFile);
        String doneJobHistoryFileName =
            getTempFileName(FileNameIndexUtils.getDoneFileName(mi
                .getJobIndexInfo()));
        qualifiedDoneFile =
            doneDirFS.makeQualified(new Path(doneDirPrefixPath,
                doneJobHistoryFileName));
        moveToDoneNow(qualifiedLogFile, qualifiedDoneFile);
      }

      Path qualifiedConfDoneFile = null;
      if (mi.getConfFile() != null) {
        Path confFile = mi.getConfFile();
        Path qualifiedConfFile = stagingDirFS.makeQualified(confFile);
        String doneConfFileName =
            getTempFileName(JobHistoryUtils
                .getIntermediateConfFileName(jobId));
        qualifiedConfDoneFile =
            doneDirFS.makeQualified(new Path(doneDirPrefixPath,
                doneConfFileName));
        moveToDoneNow(qualifiedConfFile, qualifiedConfDoneFile);
      }
      
      moveTmpToDone(qualifiedSummaryDoneFile);
      moveTmpToDone(qualifiedConfDoneFile);
      moveTmpToDone(qualifiedDoneFile);

    } catch (IOException e) {
      LOG.error("Error closing writer for JobID: " + jobId);
      throw e;
    }
  }

  private class FlushTimerTask extends TimerTask {
    private MetaInfo metaInfo;
    private IOException ioe = null;
    private volatile boolean shouldRun = true;

    FlushTimerTask(MetaInfo metaInfo) {
      this.metaInfo = metaInfo;
    }

    @Override
    public void run() {
      LOG.debug("In flush timer task");
      synchronized (lock) {
        try {
          if (!metaInfo.isTimerShutDown() && shouldRun)
            metaInfo.flush();
        } catch (IOException e) {
          ioe = e;
        }
      }
    }

    public IOException getException() {
      return ioe;
    }

    public void stop() {
      shouldRun = false;
      this.cancel();
    }
  }

  protected class MetaInfo {
    private Path historyFile;
    private Path confFile;
    private EventWriter writer;
    JobIndexInfo jobIndexInfo;
    JobSummary jobSummary;
    Timer flushTimer; 
    FlushTimerTask flushTimerTask;
    private boolean isTimerShutDown = false;
    private String forcedJobStateOnShutDown;

    MetaInfo(Path historyFile, Path conf, EventWriter writer, String user,
        String jobName, JobId jobId, String forcedJobStateOnShutDown,
        String queueName) {
      this.historyFile = historyFile;
      this.confFile = conf;
      this.writer = writer;
      this.jobIndexInfo =
          new JobIndexInfo(-1, -1, user, jobName, jobId, -1, -1, null,
                           queueName);
      this.jobSummary = new JobSummary();
      this.flushTimer = new Timer("FlushTimer", true);
      this.forcedJobStateOnShutDown = forcedJobStateOnShutDown;
    }

    Path getHistoryFile() {
      return historyFile;
    }

    Path getConfFile() {
      return confFile;
    }

    JobIndexInfo getJobIndexInfo() {
      return jobIndexInfo;
    }

    JobSummary getJobSummary() {
      return jobSummary;
    }

    boolean isWriterActive() {
      return writer != null;
    }
    
    boolean isTimerShutDown() {
      return isTimerShutDown;
    }

    String getForcedJobStateOnShutDown() {
      return forcedJobStateOnShutDown;
    }

    @Override
    public String toString() {
      return "Job MetaInfo for "+ jobSummary.getJobId()
             + " history file " + historyFile;
    }

    void closeWriter() throws IOException {
      LOG.debug("Closing Writer");
      synchronized (lock) {
        if (writer != null) {
          writer.close();
        }
        writer = null;
      }
    }

    void writeEvent(HistoryEvent event) throws IOException {
      LOG.debug("Writing event");
      synchronized (lock) {
        if (writer != null) {
          writer.write(event);
          processEventForFlush(event);
          maybeFlush(event);
        }
      }
    }

    void processEventForFlush(HistoryEvent historyEvent) throws IOException {
      if (EnumSet.of(EventType.MAP_ATTEMPT_FINISHED,
          EventType.MAP_ATTEMPT_FAILED, EventType.MAP_ATTEMPT_KILLED,
          EventType.REDUCE_ATTEMPT_FINISHED, EventType.REDUCE_ATTEMPT_FAILED,
          EventType.REDUCE_ATTEMPT_KILLED, EventType.TASK_FINISHED,
          EventType.TASK_FAILED, EventType.JOB_FINISHED, EventType.JOB_FAILED,
          EventType.JOB_KILLED).contains(historyEvent.getEventType())) {
        numUnflushedCompletionEvents++;
        if (!isTimerActive) {
          resetFlushTimer();
          if (!isTimerShutDown) {
            flushTimerTask = new FlushTimerTask(this);
            flushTimer.schedule(flushTimerTask, flushTimeout);
            isTimerActive = true;
          }
        }
      }
    }

    void resetFlushTimer() throws IOException {
      if (flushTimerTask != null) {
        IOException exception = flushTimerTask.getException();
        flushTimerTask.stop();
        if (exception != null) {
          throw exception;
        }
        flushTimerTask = null;
      }
      isTimerActive = false;
    }

    void maybeFlush(HistoryEvent historyEvent) throws IOException {
      if ((eventQueue.size() < minQueueSizeForBatchingFlushes 
          && numUnflushedCompletionEvents > 0)
          || numUnflushedCompletionEvents >= maxUnflushedCompletionEvents 
          || isJobCompletionEvent(historyEvent)) {
        this.flush();
      }
    }

    void flush() throws IOException {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Flushing " + toString());
      }
      synchronized (lock) {
        if (numUnflushedCompletionEvents != 0) {
          writer.flush();
          numUnflushedCompletionEvents = 0;
          resetFlushTimer();
        }
      }
    }

    void shutDownTimer() throws IOException {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Shutting down timer "+ toString());
      }
      synchronized (lock) {
        isTimerShutDown = true;
        flushTimer.cancel();
        if (flushTimerTask != null && flushTimerTask.getException() != null) {
          throw flushTimerTask.getException();
        }
      }
    }
  }

  private static final class MetaInfoUpdater {
    private interface Updater {
      void update(HistoryEvent event, MetaInfo mi);
    }

    private static final Map<EventType, Updater> UPDATERS = new HashMap<EventType, Updater>();

    static {
      UPDATERS.put(EventType.JOB_SUBMITTED, new Updater() {
        public void update(HistoryEvent e, MetaInfo mi) {
          JobSubmittedEvent jse = (JobSubmittedEvent) e;
          mi.getJobIndexInfo().setSubmitTime(jse.getSubmitTime());
          mi.getJobIndexInfo().setQueueName(jse.getJobQueueName());
        }
      });
      UPDATERS.put(EventType.JOB_INITED, new Updater() {
        public void update(HistoryEvent e, MetaInfo mi) {
          JobInitedEvent jie = (JobInitedEvent) e;
          mi.getJobIndexInfo().setJobStartTime(jie.getLaunchTime());
        }
      });
      UPDATERS.put(EventType.JOB_QUEUE_CHANGED, new Updater() {
        public void update(HistoryEvent e, MetaInfo mi) {
          JobQueueChangeEvent jqe = (JobQueueChangeEvent) e;
          mi.getJobIndexInfo().setQueueName(jqe.getJobQueueName());
        }
      });
      UPDATERS.put(EventType.JOB_FINISHED, new Updater() {
        public void update(HistoryEvent e, MetaInfo mi) {
          JobFinishedEvent jfe = (JobFinishedEvent) e;
          mi.getJobIndexInfo().setFinishTime(jfe.getFinishTime());
          mi.getJobIndexInfo().setNumMaps(jfe.getFinishedMaps());
          mi.getJobIndexInfo().setNumReduces(jfe.getFinishedReduces());
          mi.getJobIndexInfo().setJobStatus(JobState.SUCCEEDED.toString());
          try {
            closeEventWriter(((JobHistoryEventHandler) null).context.getJob(
                ((JobFinishedEvent) e).getJobId()).getID());
            processDoneFiles(((JobFinishedEvent) e).getJobId());
          } catch (IOException ex) {
            throw new YarnRuntimeException(ex);
          }
        }
      });
      UPDATERS.put(EventType.JOB_ERROR, new Updater() {
        public void update(HistoryEvent e, MetaInfo mi) {
          JobUnsuccessfulCompletionEvent juc = (JobUnsuccessfulCompletionEvent) e;
          mi.getJobIndexInfo().setFinishTime(juc.getFinishTime());
          mi.getJobIndexInfo().setNumMaps(juc.getFinishedMaps());
          mi.getJobIndexInfo().setNumReduces(juc.getFinishedReduces());
          mi.getJobIndexInfo().setJobStatus(juc.getStatus());
          try {
            closeEventWriter(((JobHistoryEventHandler) null).context.getJob(
                ((JobUnsuccessfulCompletionEvent) e).getJobId()).getID());
            if (((JobHistoryEventHandler) null).context.isLastAMRetry()) {
              processDoneFiles(((JobUnsuccessfulCompletionEvent) e).getJobId());
            }
          } catch (IOException ex) {
            throw new YarnRuntimeException(ex);
          }
        }
      });
      UPDATERS.put(EventType.JOB_FAILED, new Updater() {
        public void update(HistoryEvent e, MetaInfo mi) {
          JobUnsuccessfulCompletionEvent juc = (JobUnsuccessfulCompletionEvent) e;
          mi.getJobIndexInfo().setFinishTime(juc.getFinishTime());
          mi.getJobIndexInfo().setNumMaps(juc.getFinishedMaps());
          mi.getJobIndexInfo().setNumReduces(juc.getFinishedReduces());
          mi.getJobIndexInfo().setJobStatus(juc.getStatus());
          try {
            closeEventWriter(((JobHistoryEventHandler) null).context.getJob(
                ((JobUnsuccessfulCompletionEvent) e).getJobId()).getID());
            processDoneFiles(((JobUnsuccessfulCompletionEvent) e).getJobId());
          } catch (IOException ex) {
            throw new YarnRuntimeException(ex);
          }
        }
      });
      UPDATERS.put(EventType.JOB_KILLED, UPDATERS.get(EventType.JOB_FAILED));
    }

    static void update(HistoryEvent event, MetaInfo mi) {
      Updater updater = UPDATERS.get(event.getEventType());
      if (updater != null) {
        updater.update(event, mi);
      }
    }
  }

  private void moveTmpToDone(Path tmpPath) throws IOException {
    if (tmpPath != null) {
      String tmpFileName = tmpPath.getName();
      String fileName = getFileNameFromTmpFN(tmpFileName);
      Path path = new Path(tmpPath.getParent(), fileName);
      doneDirFS.rename(tmpPath, path);
      LOG.info("Moved tmp to done: " + tmpPath + " to " + path);
    }
  }
  
  private void moveToDoneNow(Path fromPath, Path toPath) throws IOException {
    if (stagingDirFS.exists(fromPath)) {
      LOG.info("Copying " + fromPath.toString() + " to " + toPath.toString());
      if (doneDirFS.exists(toPath)) {
        doneDirFS.delete(toPath, true);
      }
      boolean copied = FileUtil.copy(stagingDirFS, fromPath, doneDirFS, toPath,
          false, getConfig());

      if (copied)
        LOG.info("Copied to done location: " + toPath);
      else 
        LOG.info("copy failed");
      doneDirFS.setPermission(toPath, new FsPermission(
          JobHistoryUtils.HISTORY_INTERMEDIATE_FILE_PERMISSIONS));
    }
  }

  boolean pathExists(FileSystem fileSys, Path path) throws IOException {
    return fileSys.exists(path);
  }

  private String getTempFileName(String srcFile) {
    return srcFile + "_tmp";
  }
  
  private String getFileNameFromTmpFN(String tmpFileName) {
    return tmpFileName.substring(0, tmpFileName.length()-4);
  }

  public void setForcejobCompletion(boolean forceJobCompletion) {
    this.forceJobCompletion = forceJobCompletion;
    LOG.info("JobHistoryEventHandler notified that forceJobCompletion is "
      + forceJobCompletion);
  }

  private String createJobStateForJobUnsuccessfulCompletionEvent(
      String forcedJobStateOnShutDown) {
    if (forcedJobStateOnShutDown == null || forcedJobStateOnShutDown
        .isEmpty()) {
      return JobState.KILLED.toString();
    } else if (forcedJobStateOnShutDown.equals(
        JobStateInternal.ERROR.toString()) ||
        forcedJobStateOnShutDown.equals(JobStateInternal.FAILED.toString())) {
      return JobState.FAILED.toString();
    } else if (forcedJobStateOnShutDown.equals(JobStateInternal.SUCCEEDED
        .toString())) {
      return JobState.SUCCEEDED.toString();
    }
    return JobState.KILLED.toString();
  }

  @VisibleForTesting
  boolean getFlushTimerStatus() {
    return isTimerActive;
  }
}