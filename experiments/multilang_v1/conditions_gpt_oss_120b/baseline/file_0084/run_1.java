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
 * either express or implied.  See the License for the specific
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

  private FileSystem stagingDirFS;
  private FileSystem doneDirFS;

  private Path stagingDirPath = null;
  private Path doneDirPrefixPath = null;

  private int maxUnflushedCompletionEvents;
  private int postJobCompletionMultiplier;
  private long flushTimeout;
  private int minQueueSizeForBatchingFlushes;

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
      Collections.<JobId, MetaInfo>synchronizedMap(new HashMap<JobId, MetaInfo>());

  protected volatile boolean forceJobCompletion = false;

  protected TimelineClient timelineClient;

  private static final String MAPREDUCE_JOB_ENTITY_TYPE = "MAPREDUCE_JOB";
  private static final String MAPREDUCE_TASK_ENTITY_TYPE = "MAPREDUCE_TASK";

  public JobHistoryEventHandler(AppContext context, int startCount) {
    super("JobHistoryEventHandler");
    this.context = context;
    this.startCount = startCount;
  }

  @Override
  protected void serviceInit(Configuration conf) throws Exception {
    String jobId = TypeConverter.fromYarn(context.getApplicationID()).toString();

    String stagingDirStr;
    String doneDirStr;
    String userDoneDirStr;
    try {
      stagingDirStr = JobHistoryUtils.getConfiguredHistoryStagingDirPrefix(conf,
          jobId);
      doneDirStr = JobHistoryUtils.getConfiguredHistoryIntermediateDoneDirPrefix(conf);
      userDoneDirStr = JobHistoryUtils.getHistoryIntermediateDoneDirForUser(conf);
    } catch (IOException e) {
      LOG.error("Failed while getting the configured log directories", e);
      throw new YarnRuntimeException(e);
    }

    initStagingDir(conf, stagingDirStr);
    initDoneDir(conf, doneDirStr);
    initUserDoneDir(conf, userDoneDirStr);

    maxUnflushedCompletionEvents = conf.getInt(
        MRJobConfig.MR_AM_HISTORY_MAX_UNFLUSHED_COMPLETE_EVENTS,
        MRJobConfig.DEFAULT_MR_AM_HISTORY_MAX_UNFLUSHED_COMPLETE_EVENTS);
    postJobCompletionMultiplier = conf.getInt(
        MRJobConfig.MR_AM_HISTORY_JOB_COMPLETE_UNFLUSHED_MULTIPLIER,
        MRJobConfig.DEFAULT_MR_AM_HISTORY_JOB_COMPLETE_UNFLUSHED_MULTIPLIER);
    flushTimeout = conf.getLong(
        MRJobConfig.MR_AM_HISTORY_COMPLETE_EVENT_FLUSH_TIMEOUT_MS,
        MRJobConfig.DEFAULT_MR_AM_HISTORY_COMPLETE_EVENT_FLUSH_TIMEOUT_MS);
    minQueueSizeForBatchingFlushes = conf.getInt(
        MRJobConfig.MR_AM_HISTORY_USE_BATCHED_FLUSH_QUEUE_SIZE_THRESHOLD,
        MRJobConfig.DEFAULT_MR_AM_HISTORY_USE_BATCHED_FLUSH_QUEUE_SIZE_THRESHOLD);

    initTimelineClient(conf);
    super.serviceInit(conf);
  }

  private void initStagingDir(Configuration conf, String stagingDirStr) throws IOException {
    stagingDirPath = FileContext.getFileContext(conf).makeQualified(new Path(stagingDirStr));
    stagingDirFS = FileSystem.get(stagingDirPath.toUri(), conf);
    mkdir(stagingDirFS, stagingDirPath,
        new FsPermission(JobHistoryUtils.HISTORY_STAGING_DIR_PERMISSIONS));
  }

  private void initDoneDir(Configuration conf, String doneDirStr) throws IOException {
    Path doneDirPath = FileContext.getFileContext(conf).makeQualified(new Path(doneDirStr));
    doneDirFS = FileSystem.get(doneDirPath.toUri(), conf);
    if (!doneDirFS.exists(doneDirPath)) {
      if (JobHistoryUtils.shouldCreateNonUserDirectory(conf)) {
        LOG.info("Creating intermediate history logDir: [" + doneDirPath + "]");
        mkdir(doneDirFS, doneDirPath,
            new FsPermission(JobHistoryUtils.HISTORY_INTERMEDIATE_DONE_DIR_PERMISSIONS
                .toShort()));
      } else {
        String msg = "Not creating intermediate history logDir: [" + doneDirPath
            + "] based on conf: " + MRJobConfig.MR_AM_CREATE_JH_INTERMEDIATE_BASE_DIR;
        LOG.error(msg);
        throw new YarnRuntimeException(msg);
      }
    }
  }

  private void initUserDoneDir(Configuration conf, String userDoneDirStr) throws IOException {
    doneDirPrefixPath = FileContext.getFileContext(conf).makeQualified(new Path(userDoneDirStr));
    mkdir(doneDirFS, doneDirPrefixPath,
        new FsPermission(JobHistoryUtils.HISTORY_INTERMEDIATE_USER_DIR_PERMISSIONS));
  }

  private void initTimelineClient(Configuration conf) {
    if (conf.getBoolean(MRJobConfig.MAPREDUCE_JOB_EMIT_TIMELINE_DATA,
        MRJobConfig.DEFAULT_MAPREDUCE_JOB_EMIT_TIMELINE_DATA)
        && conf.getBoolean(YarnConfiguration.TIMELINE_SERVICE_ENABLED,
            YarnConfiguration.DEFAULT_TIMELINE_SERVICE_ENABLED)) {
      timelineClient = TimelineClient.createTimelineClient();
      timelineClient.init(conf);
      LOG.info("Timeline service is enabled");
      LOG.info("Emitting job history data to the timeline server is enabled");
    } else {
      LOG.info("Timeline service or emission not enabled");
    }
  }

  private void mkdir(FileSystem fs, Path path, FsPermission fsp) throws IOException {
    if (!fs.exists(path)) {
      try {
        fs.mkdirs(path, fsp);
        FileStatus status = fs.getFileStatus(path);
        LOG.info("Perms after creating " + status.getPermission().toShort()
            + ", Expected: " + fsp.toShort());
        if (status.getPermission().toShort() != fsp.toShort()) {
          LOG.info("Explicitly setting permissions to : " + fsp.toShort());
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
    eventHandlingThread = new Thread(this::runEventLoop, "eventHandlingThread");
    eventHandlingThread.start();
    super.serviceStart();
  }

  private void runEventLoop() {
    while (!stopped && !Thread.currentThread().isInterrupted()) {
      if (eventCounter != 0 && eventCounter % 1000 == 0) {
        eventCounter = 0;
        LOG.info("Size of the JobHistory event queue is " + eventQueue.size());
      } else {
        eventCounter++;
      }

      JobHistoryEvent event;
      try {
        event = eventQueue.take();
      } catch (InterruptedException e) {
        LOG.info("EventQueue take interrupted. Returning");
        return;
      }

      synchronized (lock) {
        boolean wasInterrupted = Thread.interrupted();
        handleEvent(event);
        if (wasInterrupted) {
          LOG.debug("Event handling interrupted");
          Thread.currentThread().interrupt();
        }
      }
    }
  }

  @Override
  protected void serviceStop() throws Exception {
    LOG.info("Stopping JobHistoryEventHandler. Size of the outstanding queue is "
        + eventQueue.size());
    stopped = true;
    synchronized (lock) {
      if (eventHandlingThread != null) {
        LOG.debug("Interrupting Event Handling thread");
        eventHandlingThread.interrupt();
      }
    }

    try {
      if (eventHandlingThread != null) {
        LOG.debug("Waiting for Event Handling thread to complete");
        eventHandlingThread.join();
      }
    } catch (InterruptedException ie) {
      LOG.info("Interrupted while stopping", ie);
    }

    shutdownAllTimers();
    drainRemainingEvents();
    processForceJobCompletion();
    closeAllWriters();

    if (timelineClient != null) {
      timelineClient.stop();
    }
    LOG.info("Stopped JobHistoryEventHandler. super.stop()");
    super.serviceStop();
  }

  private void shutdownAllTimers() {
    for (MetaInfo mi : fileMap.values()) {
      try {
        LOG.debug("Shutting down timer for " + mi);
        mi.shutDownTimer();
      } catch (IOException e) {
        LOG.info("Exception while cancelling delayed flush timer. Likely caused by a failed flush "
            + e.getMessage());
      }
    }
  }

  private void drainRemainingEvents() {
    Iterator<JobHistoryEvent> it = eventQueue.iterator();
    while (it.hasNext()) {
      JobHistoryEvent ev = it.next();
      LOG.info("In stop, writing event " + ev.getType());
      handleEvent(ev);
    }
  }

  private void processForceJobCompletion() {
    if (!forceJobCompletion) {
      return;
    }
    for (Map.Entry<JobId, MetaInfo> entry : fileMap.entrySet()) {
      JobId jobId = entry.getKey();
      MetaInfo mi = entry.getValue();
      if (mi != null && mi.isWriterActive()) {
        LOG.warn("Found jobId " + jobId + " not closed. Will close");
        Job job = context.getJob(jobId);
        JobUnsuccessfulCompletionEvent jucEvent = new JobUnsuccessfulCompletionEvent(
            TypeConverter.fromYarn(jobId), System.currentTimeMillis(),
            job.getCompletedMaps(), job.getCompletedReduces(),
            createJobStateForJobUnsuccessfulCompletionEvent(mi.getForcedJobStateOnShutDown()),
            job.getDiagnostics());
        JobHistoryEvent jhe = new JobHistoryEvent(jobId, jucEvent);
        handleEvent(jhe);
      }
    }
  }

  private void closeAllWriters() {
    for (MetaInfo mi : fileMap.values()) {
      try {
        mi.closeWriter();
      } catch (IOException e) {
        LOG.info("Exception while closing file " + e.getMessage());
      }
    }
  }

  protected EventWriter createEventWriter(Path historyFilePath) throws IOException {
    FSDataOutputStream out = stagingDirFS.create(historyFilePath, true);
    return new EventWriter(out);
  }

  protected void setupEventWriter(JobId jobId, AMStartedEvent amStartedEvent) throws IOException {
    if (stagingDirPath == null) {
      LOG.error("Log Directory is null, returning");
      throw new IOException("Missing Log Directory for History");
    }

    MetaInfo oldInfo = fileMap.get(jobId);
    Configuration conf = getConfig();

    Path historyFile = JobHistoryUtils.getStagingJobHistoryFile(
        stagingDirPath, jobId, startCount);
    String user = UserGroupInformation.getCurrentUser().getShortUserName();
    if (user == null) {
      throw new IOException("User is null while setting up jobhistory eventwriter");
    }

    String jobName = context.getJob(jobId).getName();
    EventWriter writer = (oldInfo == null) ? null : oldInfo.writer;
    Path confPath = JobHistoryUtils.getStagingConfFile(stagingDirPath, jobId, startCount);

    if (writer == null) {
      writer = createEventWriter(historyFile);
      LOG.info("Event Writer setup for JobId: " + jobId + ", File: " + historyFile);
      writeJobConf(conf, confPath);
    }

    String queueName = (conf != null) ? conf.get(MRJobConfig.QUEUE_NAME, JobConf.DEFAULT_QUEUE_NAME)
        : JobConf.DEFAULT_QUEUE_NAME;

    MetaInfo fi = new MetaInfo(historyFile, confPath, writer, user, jobName, jobId,
        amStartedEvent.getForcedJobStateOnShutDown(), queueName);
    fi.getJobSummary().setJobId(jobId);
    fi.getJobSummary().setJobLaunchTime(amStartedEvent.getStartTime());
    fi.getJobSummary().setJobSubmitTime(amStartedEvent.getSubmitTime());
    fi.getJobIndexInfo().setJobStartTime(amStartedEvent.getStartTime());
    fi.getJobIndexInfo().setSubmitTime(amStartedEvent.getSubmitTime());
    fileMap.put(jobId, fi);
  }

  private void writeJobConf(Configuration conf, Path confPath) throws IOException {
    if (conf == null || confPath == null) {
      return;
    }
    FSDataOutputStream out = null;
    try {
      out = stagingDirFS.create(confPath, true);
      conf.writeXml(out);
    } finally {
      if (out != null) {
        out.close();
      }
    }
  }

  public void closeWriter(JobId id) throws IOException {
    MetaInfo mi = fileMap.get(id);
    if (mi != null) {
      mi.closeWriter();
    }
  }

  @Override
  public void handle(JobHistoryEvent event) {
    try {
      if (isJobCompletionEvent(event.getHistoryEvent())) {
        maxUnflushedCompletionEvents *= postJobCompletionMultiplier;
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
      HistoryEvent he = event.getHistoryEvent();
      EventType type = he.getEventType();

      if (type == EventType.AM_STARTED) {
        handleAmStarted(event);
        return;
      }

      MetaInfo mi = fileMap.get(event.getJobID());
      try {
        if (!(he instanceof NormalizedResourceEvent)) {
          mi.writeEvent(he);
        }
        processEventForJobSummary(he, mi.getJobSummary(), event.getJobID());
        if (timelineClient != null) {
          processEventForTimelineServer(he, event.getJobID(), event.getTimestamp());
        }
        LOG.debug("Processed event " + type);
      } catch (IOException e) {
        LOG.error("Error writing History Event: " + he, e);
        throw new YarnRuntimeException(e);
      }

      switch (type) {
        case JOB_SUBMITTED:
          handleJobSubmitted(he, mi);
          break;
        case JOB_INITED:
          handleJobInited(he, mi);
          break;
        case JOB_QUEUE_CHANGED:
          handleJobQueueChanged(he, mi);
          break;
        case JOB_FINISHED:
          handleJobFinished(event.getJobID(), (JobFinishedEvent) he);
          break;
        case JOB_ERROR:
          handleJobError(event.getJobID(), (JobUnsuccessfulCompletionEvent) he);
          break;
        case JOB_FAILED:
        case JOB_KILLED:
          handleJobFailedOrKilled(event.getJobID(), (JobUnsuccessfulCompletionEvent) he);
          break;
        default:
          // no additional handling required
          break;
      }
    }
  }

  private void handleAmStarted(JobHistoryEvent event) {
    AMStartedEvent amStarted = (AMStartedEvent) event.getHistoryEvent();
    try {
      setupEventWriter(event.getJobID(), amStarted);
    } catch (IOException ioe) {
      LOG.error("Error in handleAmStarted for event: " + event, ioe);
      throw new YarnRuntimeException(ioe);
    }
  }

  private void handleJobSubmitted(HistoryEvent he, MetaInfo mi) {
    JobSubmittedEvent jse = (JobSubmittedEvent) he;
    mi.getJobIndexInfo().setSubmitTime(jse.getSubmitTime());
    mi.getJobIndexInfo().setQueueName(jse.getJobQueueName());
  }

  private void handleJobInited(HistoryEvent he, MetaInfo mi) {
    JobInitedEvent jie = (JobInitedEvent) he;
    mi.getJobIndexInfo().setJobStartTime(jie.getLaunchTime());
  }

  private void handleJobQueueChanged(HistoryEvent he, MetaInfo mi) {
    JobQueueChangeEvent jq = (JobQueueChangeEvent) he;
    mi.getJobIndexInfo().setQueueName(jq.getJobQueueName());
  }

  private void handleJobFinished(JobId jobId, JobFinishedEvent jfe) throws IOException {
    MetaInfo mi = fileMap.get(jobId);
    mi.getJobIndexInfo().setFinishTime(jfe.getFinishTime());
    mi.getJobIndexInfo().setNumMaps(jfe.getFinishedMaps());
    mi.getJobIndexInfo().setNumReduces(jfe.getFinishedReduces());
    mi.getJobIndexInfo().setJobStatus(JobState.SUCCEEDED.toString());
    closeEventWriter(jobId);
    processDoneFiles(jobId);
  }

  private void handleJobError(JobId jobId, JobUnsuccessfulCompletionEvent juc) throws IOException {
    MetaInfo mi = fileMap.get(jobId);
    mi.getJobIndexInfo().setFinishTime(juc.getFinishTime());
    mi.getJobIndexInfo().setNumMaps(juc.getFinishedMaps());
    mi.getJobIndexInfo().setNumReduces(juc.getFinishedReduces());
    mi.getJobIndexInfo().setJobStatus(juc.getStatus());
    closeEventWriter(jobId);
    if (context.isLastAMRetry()) {
      processDoneFiles(jobId);
    }
  }

  private void handleJobFailedOrKilled(JobId jobId, JobUnsuccessfulCompletionEvent juc) throws IOException {
    MetaInfo mi = fileMap.get(jobId);
    mi.getJobIndexInfo().setFinishTime(juc.getFinishTime());
    mi.getJobIndexInfo().setNumMaps(juc.getFinishedMaps());
    mi.getJobIndexInfo().setNumReduces(juc.getFinishedReduces());
    mi.getJobIndexInfo().setJobStatus(juc.getStatus());
    closeEventWriter(jobId);
    processDoneFiles(jobId);
  }

  public void processEventForJobSummary(HistoryEvent event, JobSummary summary,
      JobId jobId) {
    switch (event.getEventType()) {
      case JOB_SUBMITTED:
        JobSubmittedEvent jse = (JobSubmittedEvent) event;
        summary.setUser(jse.getUserName());
        summary.setQueue(jse.getJobQueueName());
        summary.setJobSubmitTime(jse.getSubmitTime());
        summary.setJobName(jse.getJobName());
        break;
      case NORMALIZED_RESOURCE:
        NormalizedResourceEvent nre = (NormalizedResourceEvent) event;
        if (nre.getTaskType() == TaskType.MAP) {
          summary.setResourcesPerMap(nre.getMemory());
        } else if (nre.getTaskType() == TaskType.REDUCE) {
          summary.setResourcesPerReduce(nre.getMemory());
        }
        break;
      case JOB_INITED:
        JobInitedEvent jie = (JobInitedEvent) event;
        summary.setJobLaunchTime(jie.getLaunchTime());
        break;
      case MAP_ATTEMPT_STARTED:
        TaskAttemptStartedEvent mtase = (TaskAttemptStartedEvent) event;
        if (summary.getFirstMapTaskLaunchTime() == 0) {
          summary.setFirstMapTaskLaunchTime(mtase.getStartTime());
        }
        break;
      case REDUCE_ATTEMPT_STARTED:
        TaskAttemptStartedEvent rtase = (TaskAttemptStartedEvent) event;
        if (summary.getFirstReduceTaskLaunchTime() == 0) {
          summary.setFirstReduceTaskLaunchTime(rtase.getStartTime());
        }
        break;
      case JOB_FINISHED:
        JobFinishedEvent jfe = (JobFinishedEvent) event;
        summary.setJobFinishTime(jfe.getFinishTime());
        summary.setNumFinishedMaps(jfe.getFinishedMaps());
        summary.setNumFailedMaps(jfe.getFailedMaps());
        summary.setNumFinishedReduces(jfe.getFinishedReduces());
        summary.setNumFailedReduces(jfe.getFailedReduces());
        if (summary.getJobStatus() == null) {
          summary.setJobStatus(org.apache.hadoop.mapreduce.JobStatus.State.SUCCEEDED
              .toString());
        }
        setSummarySlotSeconds(summary, jfe.getTotalCounters());
        break;
      case JOB_FAILED:
      case JOB_KILLED:
        JobUnsuccessfulCompletionEvent juce = (JobUnsuccessfulCompletionEvent) event;
        summary.setJobStatus(juce.getStatus());
        summary.setNumFinishedMaps(context.getJob(jobId).getTotalMaps());
        summary.setNumFinishedReduces(context.getJob(jobId).getTotalReduces());
        summary.setJobFinishTime(juce.getFinishTime());
        setSummarySlotSeconds(summary, context.getJob(jobId).getAllCounters());
        break;
      default:
        break;
    }
  }

  private void processEventForTimelineServer(HistoryEvent event, JobId jobId,
      long timestamp) {
    TimelineEvent tEvent = new TimelineEvent();
    tEvent.setEventType(StringUtils.toUpperCase(event.getEventType().name()));
    tEvent.setTimestamp(timestamp);
    TimelineEntity tEntity = new TimelineEntity();

    switch (event.getEventType()) {
      case JOB_SUBMITTED:
        JobSubmittedEvent jse = (JobSubmittedEvent) event;
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
        tEvent.addEventInfo("WORKFLOW_ADJACENCIES", jse.getWorkflowAdjacencies());
        tEvent.addEventInfo("WORKFLOW_TAGS", jse.getWorkflowTags());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(jobId.toString());
        tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
        break;
      case JOB_STATUS_CHANGED:
        JobStatusChangedEvent jsce = (JobStatusChangedEvent) event;
        tEvent.addEventInfo("STATUS", jsce.getStatus());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(jobId.toString());
        tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
        break;
      case JOB_INFO_CHANGED:
        JobInfoChangeEvent jice = (JobInfoChangeEvent) event;
        tEvent.addEventInfo("SUBMIT_TIME", jice.getSubmitTime());
        tEvent.addEventInfo("LAUNCH_TIME", jice.getLaunchTime());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(jobId.toString());
        tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
        break;
      case JOB_INITED:
        JobInitedEvent jie = (JobInitedEvent) event;
        tEvent.addEventInfo("START_TIME", jie.getLaunchTime());
        tEvent.addEventInfo("STATUS", jie.getStatus());
        tEvent.addEventInfo("TOTAL_MAPS", jie.getTotalMaps());
        tEvent.addEventInfo("TOTAL_REDUCES", jie.getTotalReduces());
        tEvent.addEventInfo("UBERIZED", jie.getUberized());
        tEntity.setStartTime(jie.getLaunchTime());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(jobId.toString());
        tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
        break;
      case JOB_PRIORITY_CHANGED:
        JobPriorityChangeEvent jpce = (JobPriorityChangeEvent) event;
        tEvent.addEventInfo("PRIORITY", jpce.getPriority().toString());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(jobId.toString());
        tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
        break;
      case JOB_QUEUE_CHANGED:
        JobQueueChangeEvent jqe = (JobQueueChangeEvent) event;
        tEvent.addEventInfo("QUEUE_NAMES", jqe.getJobQueueName());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(jobId.toString());
        tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
        break;
      case JOB_FAILED:
      case JOB_KILLED:
      case JOB_ERROR:
        JobUnsuccessfulCompletionEvent juce = (JobUnsuccessfulCompletionEvent) event;
        tEvent.addEventInfo("FINISH_TIME", juce.getFinishTime());
        tEvent.addEventInfo("NUM_MAPS", juce.getFinishedMaps());
        tEvent.addEventInfo("NUM_REDUCES", juce.getFinishedReduces());
        tEvent.addEventInfo("JOB_STATUS", juce.getStatus());
        tEvent.addEventInfo("DIAGNOSTICS", juce.getDiagnostics());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(jobId.toString());
        tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
        break;
      case JOB_FINISHED:
        JobFinishedEvent jfe = (JobFinishedEvent) event;
        tEvent.addEventInfo("FINISH_TIME", jfe.getFinishTime());
        tEvent.addEventInfo("NUM_MAPS", jfe.getFinishedMaps());
        tEvent.addEventInfo("NUM_REDUCES", jfe.getFinishedReduces());
        tEvent.addEventInfo("FAILED_MAPS", jfe.getFailedMaps());
        tEvent.addEventInfo("FAILED_REDUCES", jfe.getFailedReduces());
        tEvent.addEventInfo("MAP_COUNTERS_GROUPS", countersToJSON(jfe.getTotalCounters()));
        tEvent.addEventInfo("REDUCE_COUNTERS_GROUPS", countersToJSON(jfe.getReduceCounters()));
        tEvent.addEventInfo("TOTAL_COUNTERS_GROUPS", countersToJSON(jfe.getTotalCounters()));
        tEvent.addEventInfo("JOB_STATUS", JobState.SUCCEEDED.toString());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(jobId.toString());
        tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
        break;
      case TASK_STARTED:
        TaskStartedEvent tse = (TaskStartedEvent) event;
        tEvent.addEventInfo("TASK_TYPE", tse.getTaskType().toString());
        tEvent.addEventInfo("START_TIME", tse.getStartTime());
        tEvent.addEventInfo("SPLIT_LOCATIONS", tse.getSplitLocations());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(tse.getTaskId().toString());
        tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
        tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
        break;
      case TASK_FAILED:
        TaskFailedEvent tfe = (TaskFailedEvent) event;
        tEvent.addEventInfo("TASK_TYPE", tfe.getTaskType().toString());
        tEvent.addEventInfo("STATUS", TaskStatus.State.FAILED.toString());
        tEvent.addEventInfo("FINISH_TIME", tfe.getFinishTime());
        tEvent.addEventInfo("ERROR", tfe.getError());
        tEvent.addEventInfo("FAILED_ATTEMPT_ID",
            tfe.getFailedAttemptID() == null ? "" : tfe.getFailedAttemptID().toString());
        tEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(tfe.getCounters()));
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(tfe.getTaskId().toString());
        tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
        tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
        break;
      case TASK_UPDATED:
        TaskUpdatedEvent tue = (TaskUpdatedEvent) event;
        tEvent.addEventInfo("FINISH_TIME", tue.getFinishTime());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(tue.getTaskId().toString());
        tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
        tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
        break;
      case TASK_FINISHED:
        TaskFinishedEvent tfe2 = (TaskFinishedEvent) event;
        tEvent.addEventInfo("TASK_TYPE", tfe2.getTaskType().toString());
        tEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(tfe2.getCounters()));
        tEvent.addEventInfo("FINISH_TIME", tfe2.getFinishTime());
        tEvent.addEventInfo("STATUS", TaskStatus.State.SUCCEEDED.toString());
        tEvent.addEventInfo("SUCCESSFUL_TASK_ATTEMPT_ID",
            tfe2.getSuccessfulTaskAttemptId() == null ? "" : tfe2.getSuccessfulTaskAttemptId().toString());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(tfe2.getTaskId().toString());
        tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
        tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
        break;
      case MAP_ATTEMPT_STARTED:
      case CLEANUP_ATTEMPT_STARTED:
      case REDUCE_ATTEMPT_STARTED:
      case SETUP_ATTEMPT_STARTED:
        TaskAttemptStartedEvent tase = (TaskAttemptStartedEvent) event;
        tEvent.addEventInfo("TASK_TYPE", tase.getTaskType().toString());
        tEvent.addEventInfo("TASK_ATTEMPT_ID", tase.getTaskAttemptId().toString());
        tEvent.addEventInfo("START_TIME", tase.getStartTime());
        tEvent.addEventInfo("HTTP_PORT", tase.getHttpPort());
        tEvent.addEventInfo("TRACKER_NAME", tase.getTrackerName());
        tEvent.addEventInfo("SHUFFLE_PORT", tase.getShufflePort());
        tEvent.addEventInfo("CONTAINER_ID", tase.getContainerId() == null ? "" : tase.getContainerId().toString());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(tase.getTaskId().toString());
        tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
        tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
        break;
      case MAP_ATTEMPT_FAILED:
      case CLEANUP_ATTEMPT_FAILED:
      case REDUCE_ATTEMPT_FAILED:
      case SETUP_ATTEMPT_FAILED:
      case MAP_ATTEMPT_KILLED:
      case CLEANUP_ATTEMPT_KILLED:
      case REDUCE_ATTEMPT_KILLED:
      case SETUP_ATTEMPT_KILLED:
        TaskAttemptUnsuccessfulCompletionEvent tauce = (TaskAttemptUnsuccessfulCompletionEvent) event;
        tEvent.addEventInfo("TASK_TYPE", tauce.getTaskType().toString());
        tEvent.addEventInfo("TASK_ATTEMPT_ID",
            tauce.getTaskAttemptId() == null ? "" : tauce.getTaskAttemptId().toString());
        tEvent.addEventInfo("FINISH_TIME", tauce.getFinishTime());
        tEvent.addEventInfo("ERROR", tauce.getError());
        tEvent.addEventInfo("STATUS", tauce.getTaskStatus());
        tEvent.addEventInfo("HOSTNAME", tauce.getHostname());
        tEvent.addEventInfo("PORT", tauce.getPort());
        tEvent.addEventInfo("RACK_NAME", tauce.getRackName());
        tEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(tauce.getCounters()));
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(tauce.getTaskId().toString());
        tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
        tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
        break;
      case MAP_ATTEMPT_FINISHED:
        MapAttemptFinishedEvent mafe = (MapAttemptFinishedEvent) event;
        tEvent.addEventInfo("TASK_TYPE", mafe.getTaskType().toString());
        tEvent.addEventInfo("FINISH_TIME", mafe.getFinishTime());
        tEvent.addEventInfo("STATUS", mafe.getTaskStatus());
        tEvent.addEventInfo("STATE", mafe.getState());
        tEvent.addEventInfo("MAP_FINISH_TIME", mafe.getMapFinishTime());
        tEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(mafe.getCounters()));
        tEvent.addEventInfo("HOSTNAME", mafe.getHostname());
        tEvent.addEventInfo("PORT", mafe.getPort());
        tEvent.addEventInfo("RACK_NAME", mafe.getRackName());
        tEvent.addEventInfo("ATTEMPT_ID", mafe.getAttemptId() == null ? "" : mafe.getAttemptId().toString());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(mafe.getTaskId().toString());
        tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
        tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
        break;
      case REDUCE_ATTEMPT_FINISHED:
        ReduceAttemptFinishedEvent rafe = (ReduceAttemptFinishedEvent) event;
        tEvent.addEventInfo("TASK_TYPE", rafe.getTaskType().toString());
        tEvent.addEventInfo("ATTEMPT_ID", rafe.getAttemptId() == null ? "" : rafe.getAttemptId().toString());
        tEvent.addEventInfo("FINISH_TIME", rafe.getFinishTime());
        tEvent.addEventInfo("STATUS", rafe.getTaskStatus());
        tEvent.addEventInfo("STATE", rafe.getState());
        tEvent.addEventInfo("SHUFFLE_FINISH_TIME", rafe.getShuffleFinishTime());
        tEvent.addEventInfo("SORT_FINISH_TIME", rafe.getSortFinishTime());
        tEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(rafe.getCounters()));
        tEvent.addEventInfo("HOSTNAME", rafe.getHostname());
        tEvent.addEventInfo("PORT", rafe.getPort());
        tEvent.addEventInfo("RACK_NAME", rafe.getRackName());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(rafe.getTaskId().toString());
        tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
        tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
        break;
      case SETUP_ATTEMPT_FINISHED:
      case CLEANUP_ATTEMPT_FINISHED:
        TaskAttemptFinishedEvent tafe = (TaskAttemptFinishedEvent) event;
        tEvent.addEventInfo("TASK_TYPE", tafe.getTaskType().toString());
        tEvent.addEventInfo("ATTEMPT_ID", tafe.getAttemptId() == null ? "" : tafe.getAttemptId().toString());
        tEvent.addEventInfo("FINISH_TIME", tafe.getFinishTime());
        tEvent.addEventInfo("STATUS", tafe.getTaskStatus());
        tEvent.addEventInfo("STATE", tafe.getState());
        tEvent.addEventInfo("COUNTERS_GROUPS", countersToJSON(tafe.getCounters()));
        tEvent.addEventInfo("HOSTNAME", tafe.getHostname());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(tafe.getTaskId().toString());
        tEntity.setEntityType(MAPREDUCE_TASK_ENTITY_TYPE);
        tEntity.addRelatedEntity(MAPREDUCE_JOB_ENTITY_TYPE, jobId.toString());
        break;
      case AM_STARTED:
        AMStartedEvent ase = (AMStartedEvent) event;
        tEvent.addEventInfo("APPLICATION_ATTEMPT_ID",
            ase.getAppAttemptId() == null ? "" : ase.getAppAttemptId().toString());
        tEvent.addEventInfo("CONTAINER_ID",
            ase.getContainerId() == null ? "" : ase.getContainerId().toString());
        tEvent.addEventInfo("NODE_MANAGER_HOST", ase.getNodeManagerHost());
        tEvent.addEventInfo("NODE_MANAGER_PORT", ase.getNodeManagerPort());
        tEvent.addEventInfo("NODE_MANAGER_HTTP_PORT", ase.getNodeManagerHttpPort());
        tEvent.addEventInfo("START_TIME", ase.getStartTime());
        tEvent.addEventInfo("SUBMIT_TIME", ase.getSubmitTime());
        tEntity.addEvent(tEvent);
        tEntity.setEntityId(jobId.toString());
        tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
        break;
      default:
        break;
    }

    try {
      timelineClient.putEntities(tEntity);
    } catch (IOException | YarnException ex) {
      LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
    }
  }

  @Private
  public JsonNode countersToJSON(Counters counters) {
    ObjectMapper mapper = new ObjectMapper();
    ArrayNode nodes = mapper.createArrayNode();
    if (counters != null) {
      for (CounterGroup group : counters) {
        ObjectNode groupNode = nodes.addObject();
        groupNode.put("NAME", group.getName());
        groupNode.put("DISPLAY_NAME", group.getDisplayName());
        ArrayNode countersNode = groupNode.putArray("COUNTERS");
        for (Counter counter : group) {
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
    Counter mapCounter = allCounters.findCounter(JobCounter.SLOTS_MILLIS_MAPS);
    if (mapCounter != null) {
      summary.setMapSlotSeconds(mapCounter.getValue() / 1000);
    }
    Counter reduceCounter = allCounters.findCounter(JobCounter.SLOTS_MILLIS_REDUCES);
    if (reduceCounter != null) {
      summary.setReduceSlotSeconds(reduceCounter.getValue() / 1000);
    }
  }

  protected void closeEventWriter(JobId jobId) throws IOException {
    MetaInfo mi = fileMap.get(jobId);
    if (mi == null) {
      throw new IOException("No MetaInfo found for JobId: [" + jobId + "]");
    }
    if (!mi.isWriterActive()) {
      throw new IOException("Inactive Writer: Likely received multiple JobFinished / JobUnsuccessful events for JobId: [" + jobId + "]");
    }
    try {
      mi.closeWriter();
    } catch (IOException e) {
      LOG.error("Error closing writer for JobID: " + jobId);
      throw e;
    }
  }

  protected void processDoneFiles(JobId jobId) throws IOException {
    MetaInfo mi = fileMap.get(jobId);
    if (mi == null) {
      throw new IOException("No MetaInfo found for JobId: [" + jobId + "]");
    }

    if (mi.getHistoryFile() == null) {
      LOG.warn("No file for job-history with " + jobId + " found in cache!");
    }
    if (mi.getConfFile() == null) {
      LOG.warn("No file for jobconf with " + jobId + " found in cache!");
    }

    Path summaryTmp = writeSummaryTmpFile(mi, jobId);
    Path historyTmp = moveHistoryToDone(mi);
    Path confTmp = moveConfToDone(mi, jobId);

    moveTmpToDone(summaryTmp);
    moveTmpToDone(confTmp);
    moveTmpToDone(historyTmp);
  }

  private Path writeSummaryTmpFile(MetaInfo mi, JobId jobId) throws IOException {
    String tmpName = getTempFileName(JobHistoryUtils.getIntermediateSummaryFileName(jobId));
    Path tmpPath = doneDirFS.makeQualified(new Path(doneDirPrefixPath, tmpName));
    try (FSDataOutputStream out = doneDirFS.create(tmpPath, true)) {
      out.writeUTF(mi.getJobSummary().getJobSummaryString());
    }
    doneDirFS.setPermission(tmpPath, new FsPermission(JobHistoryUtils.HISTORY_INTERMEDIATE_FILE_PERMISSIONS));
    return tmpPath;
  }

  private Path moveHistoryToDone(MetaInfo mi) throws IOException {
    if (mi.getHistoryFile() == null) {
      return null;
    }
    Path src = stagingDirFS.makeQualified(mi.getHistoryFile());
    String doneName = getTempFileName(FileNameIndexUtils.getDoneFileName(mi.getJobIndexInfo()));
    Path dst = doneDirFS.makeQualified(new Path(doneDirPrefixPath, doneName));
    moveToDoneNow(src, dst);
    return dst;
  }

  private Path moveConfToDone(MetaInfo mi, JobId jobId) throws IOException {
    if (mi.getConfFile() == null) {
      return null;
    }
    Path src = stagingDirFS.makeQualified(mi.getConfFile());
    String doneName = getTempFileName(JobHistoryUtils.getIntermediateConfFileName(jobId));
    Path dst = doneDirFS.makeQualified(new Path(doneDirPrefixPath, doneName));
    moveToDoneNow(src, dst);
    return dst;
  }

  private class FlushTimerTask extends TimerTask {
    private final MetaInfo metaInfo;
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
          if (!metaInfo.isTimerShutDown() && shouldRun) {
            metaInfo.flush();
          }
        } catch (IOException e) {
          ioe = e;
        }
      }
    }

    IOException getException() {
      return ioe;
    }

    void stop() {
      shouldRun = false;
      cancel();
    }
  }

  protected class MetaInfo {
    private final Path historyFile;
    private final Path confFile;
    private EventWriter writer;
    private final JobIndexInfo jobIndexInfo;
    private final JobSummary jobSummary;
    private final Timer flushTimer;
    private FlushTimerTask flushTimerTask;
    private boolean isTimerShutDown = false;
    private final String forcedJobStateOnShutDown;

    MetaInfo(Path historyFile, Path conf, EventWriter writer, String user,
        String jobName, JobId jobId, String forcedJobStateOnShutDown,
        String queueName) {
      this.historyFile = historyFile;
      this.confFile = conf;
      this.writer = writer;
      this.jobIndexInfo = new JobIndexInfo(-1, -1, user, jobName, jobId, -1, -1, null,
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
      return "Job MetaInfo for " + jobSummary.getJobId() + " history file " + historyFile;
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

    private void processEventForFlush(HistoryEvent historyEvent) throws IOException {
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

    private void maybeFlush(HistoryEvent historyEvent) throws IOException {
      if ((eventQueue.size() < minQueueSizeForBatchingFlushes && numUnflushedCompletionEvents > 0)
          || numUnflushedCompletionEvents >= maxUnflushedCompletionEvents
          || isJobCompletionEvent(historyEvent)) {
        flush();
      }
    }

    void flush() throws IOException {
      LOG.debug("Flushing " + toString());
      synchronized (lock) {
        if (numUnflushedCompletionEvents != 0) {
          writer.flush();
          numUnflushedCompletionEvents = 0;
          resetFlushTimer();
        }
      }
    }

    void shutDownTimer() throws IOException {
      LOG.debug("Shutting down timer " + toString());
      synchronized (lock) {
        isTimerShutDown = true;
        flushTimer.cancel();
        if (flushTimerTask != null && flushTimerTask.getException() != null) {
          throw flushTimerTask.getException();
        }
      }
    }

    private void resetFlushTimer() throws IOException {
      if (flushTimerTask != null) {
        IOException ex = flushTimerTask.getException();
        flushTimerTask.stop();
        if (ex != null) {
          throw ex;
        }
        flushTimerTask = null;
      }
      isTimerActive = false;
    }
  }

  private void moveTmpToDone(Path tmpPath) throws IOException {
    if (tmpPath == null) {
      return;
    }
    String fileName = getFileNameFromTmpFN(tmpPath.getName());
    Path finalPath = new Path(tmpPath.getParent(), fileName);
    doneDirFS.rename(tmpPath, finalPath);
    LOG.info("Moved tmp to done: " + tmpPath + " to " + finalPath);
  }

  private void moveToDoneNow(Path fromPath, Path toPath) throws IOException {
    if (!stagingDirFS.exists(fromPath)) {
      return;
    }
    LOG.info("Copying " + fromPath + " to " + toPath);
    if (doneDirFS.exists(toPath)) {
      doneDirFS.delete(toPath, true);
    }
    boolean copied = FileUtil.copy(stagingDirFS, fromPath, doneDirFS, toPath,
        false, getConfig());
    if (copied) {
      LOG.info("Copied to done location: " + toPath);
    } else {
      LOG.info("Copy failed");
    }
    doneDirFS.setPermission(toPath, new FsPermission(JobHistoryUtils.HISTORY_INTERMEDIATE_FILE_PERMISSIONS));
  }

  private String getTempFileName(String srcFile) {
    return srcFile + "_tmp";
  }

  private String getFileNameFromTmpFN(String tmpFileName) {
    return tmpFileName.substring(0, tmpFileName.length() - 4);
  }

  public void setForcejobCompletion(boolean forceJobCompletion) {
    this.forceJobCompletion = forceJobCompletion;
    LOG.info("JobHistoryEventHandler notified that forceJobCompletion is " + forceJobCompletion);
  }

  private String createJobStateForJobUnsuccessfulCompletionEvent(String forcedJobStateOnShutDown) {
    if (forcedJobStateOnShutDown == null || forcedJobStateOnShutDown.isEmpty()) {
      return JobState.KILLED.toString();
    }
    if (forcedJobStateOnShutDown.equals(JobStateInternal.ERROR.toString())
        || forcedJobStateOnShutDown.equals(JobStateInternal.FAILED.toString())) {
      return JobState.FAILED.toString();
    }
    if (forcedJobStateOnShutDown.equals(JobStateInternal.SUCCEEDED.toString())) {
      return JobState.SUCCEEDED.toString();
    }
    return JobState.KILLED.toString();
  }

  @VisibleForTesting
  boolean getFlushTimerStatus() {
    return isTimerActive;
  }
}