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

public class JobHistoryEventHandler extends AbstractService implements EventHandler<JobHistoryEvent> {

    private final AppContext context;
    private final int startCount;

    private int eventCounter;

    private FileSystem stagingDirFS;
    private FileSystem doneDirFS;

    private Path stagingDirPath;
    private Path doneDirPrefixPath;

    private int maxUnflushedCompletionEvents;
    private int postJobCompletionMultiplier;
    private long flushTimeout;
    private int minQueueSizeForBatchingFlushes;

    private int numUnflushedCompletionEvents = 0;
    private boolean isTimerActive;

    protected BlockingQueue<JobHistoryEvent> eventQueue = new LinkedBlockingQueue<>();
    protected Thread eventHandlingThread;
    private volatile boolean stopped;
    private final Object lock = new Object();

    private static final Log LOG = LogFactory.getLog(JobHistoryEventHandler.class);

    protected static final Map<JobId, MetaInfo> fileMap = Collections.synchronizedMap(new HashMap<>());

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

        String stagingDirStr = JobHistoryUtils.getConfiguredHistoryStagingDirPrefix(conf, jobId);
        String doneDirStr = JobHistoryUtils.getConfiguredHistoryIntermediateDoneDirPrefix(conf);
        String userDoneDirStr = JobHistoryUtils.getHistoryIntermediateDoneDirForUser(conf);

        stagingDirPath = FileContext.getFileContext(conf).makeQualified(new Path(stagingDirStr));
        stagingDirFS = FileSystem.get(stagingDirPath.toUri(), conf);
        mkdir(stagingDirFS, stagingDirPath, new FsPermission(JobHistoryUtils.HISTORY_STAGING_DIR_PERMISSIONS));

        Path doneDirPath = FileContext.getFileContext(conf).makeQualified(new Path(doneDirStr));
        doneDirFS = FileSystem.get(doneDirPath.toUri(), conf);
        if (!doneDirFS.exists(doneDirPath)) {
            if (JobHistoryUtils.shouldCreateNonUserDirectory(conf)) {
                mkdir(doneDirFS, doneDirPath, new FsPermission(JobHistoryUtils.HISTORY_INTERMEDIATE_DONE_DIR_PERMISSIONS));
            } else {
                throw new YarnRuntimeException("Not creating intermediate history logDir: [" + doneDirPath + "]");
            }
        }

        doneDirPrefixPath = FileContext.getFileContext(conf).makeQualified(new Path(userDoneDirStr));
        mkdir(doneDirFS, doneDirPrefixPath, new FsPermission(JobHistoryUtils.HISTORY_INTERMEDIATE_USER_DIR_PERMISSIONS));

        maxUnflushedCompletionEvents = conf.getInt(MRJobConfig.MR_AM_HISTORY_MAX_UNFLUSHED_COMPLETE_EVENTS, MRJobConfig.DEFAULT_MR_AM_HISTORY_MAX_UNFLUSHED_COMPLETE_EVENTS);
        postJobCompletionMultiplier = conf.getInt(MRJobConfig.MR_AM_HISTORY_JOB_COMPLETE_UNFLUSHED_MULTIPLIER, MRJobConfig.DEFAULT_MR_AM_HISTORY_JOB_COMPLETE_UNFLUSHED_MULTIPLIER);
        flushTimeout = conf.getLong(MRJobConfig.MR_AM_HISTORY_COMPLETE_EVENT_FLUSH_TIMEOUT_MS, MRJobConfig.DEFAULT_MR_AM_HISTORY_COMPLETE_EVENT_FLUSH_TIMEOUT_MS);
        minQueueSizeForBatchingFlushes = conf.getInt(MRJobConfig.MR_AM_HISTORY_USE_BATCHED_FLUSH_QUEUE_SIZE_THRESHOLD, MRJobConfig.DEFAULT_MR_AM_HISTORY_USE_BATCHED_FLUSH_QUEUE_SIZE_THRESHOLD);

        if (conf.getBoolean(MRJobConfig.MAPREDUCE_JOB_EMIT_TIMELINE_DATA, MRJobConfig.DEFAULT_MAPREDUCE_JOB_EMIT_TIMELINE_DATA)) {
            if (conf.getBoolean(YarnConfiguration.TIMELINE_SERVICE_ENABLED, YarnConfiguration.DEFAULT_TIMELINE_SERVICE_ENABLED)) {
                timelineClient = TimelineClient.createTimelineClient();
                timelineClient.init(conf);
            }
        }

        super.serviceInit(conf);
    }

    private void mkdir(FileSystem fs, Path path, FsPermission fsp) throws IOException {
        if (!fs.exists(path)) {
            fs.mkdirs(path, fsp);
            FileStatus fsStatus = fs.getFileStatus(path);
            if (fsStatus.getPermission().toShort() != fsp.toShort()) {
                fs.setPermission(path, fsp);
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
                while (!stopped && !Thread.currentThread().isInterrupted()) {
                    try {
                        JobHistoryEvent event = eventQueue.take();
                        handleEvent(event);
                    } catch (InterruptedException e) {
                        LOG.info("EventQueue take interrupted. Returning");
                        return;
                    }
                }
            }
        }, "eventHandlingThread");
        eventHandlingThread.start();

        super.serviceStart();
    }

    @Override
    protected void serviceStop() throws Exception {
        LOG.info("Stopping JobHistoryEventHandler. Size of the outstanding queue size is " + eventQueue.size());
        stopped = true;

        if (eventHandlingThread != null) {
            eventHandlingThread.interrupt();
        }

        try {
            if (eventHandlingThread != null) {
                eventHandlingThread.join();
            }
        } catch (InterruptedException ie) {
            LOG.info("Interrupted Exception while stopping", ie);
        }

        for (MetaInfo mi : fileMap.values()) {
            try {
                mi.shutDownTimer();
            } catch (IOException e) {
                LOG.info("Exception while cancelling delayed flush timer. Likely caused by a failed flush " + e.getMessage());
            }
        }

        Iterator<JobHistoryEvent> it = eventQueue.iterator();
        while (it.hasNext()) {
            JobHistoryEvent ev = it.next();
            LOG.info("In stop, writing event " + ev.getType());
            handleEvent(ev);
        }

        if (forceJobCompletion) {
            for (Map.Entry<JobId, MetaInfo> jobIt : fileMap.entrySet()) {
                JobId toClose = jobIt.getKey();
                MetaInfo mi = jobIt.getValue();
                if (mi != null && mi.isWriterActive()) {
                    LOG.warn("Found jobId " + toClose + " to have not been closed. Will close");
                    JobUnsuccessfulCompletionEvent jucEvent = new JobUnsuccessfulCompletionEvent(TypeConverter.fromYarn(toClose), System.currentTimeMillis(), context.getJob(toClose).getCompletedMaps(), context.getJob(toClose).getCompletedReduces(), createJobStateForJobUnsuccessfulCompletionEvent(mi.getForcedJobStateOnShutDown()), context.getJob(toClose).getDiagnostics());
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

    protected EventWriter createEventWriter(Path historyFilePath) throws IOException {
        FSDataOutputStream out = stagingDirFS.create(historyFilePath, true);
        return new EventWriter(out);
    }

    protected void setupEventWriter(JobId jobId, AMStartedEvent amStartedEvent) throws IOException {
        MetaInfo oldFi = fileMap.get(jobId);
        Configuration conf = getConfig();

        Path historyFile = JobHistoryUtils.getStagingJobHistoryFile(stagingDirPath, jobId, startCount);
        String user = UserGroupInformation.getCurrentUser().getShortUserName();

        String jobName = context.getJob(jobId).getName();
        EventWriter writer = (oldFi == null) ? null : oldFi.writer;

        Path logDirConfPath = JobHistoryUtils.getStagingConfFile(stagingDirPath, jobId, startCount);
        if (writer == null) {
            try {
                writer = createEventWriter(historyFile);
                LOG.info("Event Writer setup for JobId: " + jobId + ", File: " + historyFile);
            } catch (IOException ioe) {
                LOG.info("Could not create log file: [" + historyFile + "] + for job [" + jobName + "]");
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

        MetaInfo fi = new MetaInfo(historyFile, logDirConfPath, writer, user, jobName, jobId, amStartedEvent.getForcedJobStateOnShutDown(), queueName);
        fi.getJobSummary().setJobId(jobId);
        fi.getJobSummary().setJobLaunchTime(amStartedEvent.getStartTime());
        fi.getJobSummary().setJobSubmitTime(amStartedEvent.getSubmitTime());
        fi.getJobIndexInfo().setJobStartTime(amStartedEvent.getStartTime());
        fi.getJobIndexInfo().setSubmitTime(amStartedEvent.getSubmitTime());
        fileMap.put(jobId, fi);
    }

    public void closeWriter(JobId id) throws IOException {
        final MetaInfo mi = fileMap.get(id);
        if (mi != null) {
            mi.closeWriter();
        }
    }

    @Override
    public void handle(JobHistoryEvent event) {
        try {
            if (isJobCompletionEvent(event.getHistoryEvent())) {
                maxUnflushedCompletionEvents = maxUnflushedCompletionEvents * postJobCompletionMultiplier;
            }

            eventQueue.put(event);
        } catch (InterruptedException e) {
            throw new YarnRuntimeException(e);
        }
    }

    private boolean isJobCompletionEvent(HistoryEvent historyEvent) {
        return EnumSet.of(EventType.JOB_FINISHED, EventType.JOB_FAILED, EventType.JOB_KILLED).contains(historyEvent.getEventType());
    }

    @Private
    public void handleEvent(JobHistoryEvent event) {
        synchronized (lock) {
            if (event.getHistoryEvent().getEventType() == EventType.AM_STARTED) {
                try {
                    AMStartedEvent amStartedEvent = (AMStartedEvent) event.getHistoryEvent();
                    setupEventWriter(event.getJobID(), amStartedEvent);
                } catch (IOException ioe) {
                    LOG.error("Error JobHistoryEventHandler in handleEvent: " + event, ioe);
                    throw new YarnRuntimeException(ioe);
                }
            }

            MetaInfo mi = fileMap.get(event.getJobID());
            try {
                HistoryEvent historyEvent = event.getHistoryEvent();
                if (!(historyEvent instanceof NormalizedResourceEvent)) {
                    mi.writeEvent(historyEvent);
                }
                processEventForJobSummary(event.getHistoryEvent(), mi.getJobSummary(), event.getJobID());
                if (timelineClient != null) {
                    processEventForTimelineServer(historyEvent, event.getJobID(), event.getTimestamp());
                }
            } catch (IOException e) {
                LOG.error("Error writing History Event: " + event.getHistoryEvent(), e);
                throw new YarnRuntimeException(e);
            }

            if (event.getHistoryEvent().getEventType() == EventType.JOB_FINISHED) {
                try {
                    JobFinishedEvent jFinishedEvent = (JobFinishedEvent) event.getHistoryEvent();
                    mi.getJobIndexInfo().setFinishTime(jFinishedEvent.getFinishTime());
                    mi.getJobIndexInfo().setNumMaps(jFinishedEvent.getFinishedMaps());
                    mi.getJobIndexInfo().setNumReduces(jFinishedEvent.getFinishedReduces());
                    mi.getJobIndexInfo().setJobStatus(JobState.SUCCEEDED.toString());
                    closeEventWriter(event.getJobID());
                    processDoneFiles(event.getJobID());
                } catch (IOException e) {
                    throw new YarnRuntimeException(e);
                }
            } else if (event.getHistoryEvent().getEventType() == EventType.JOB_ERROR) {
                try {
                    JobUnsuccessfulCompletionEvent jucEvent = (JobUnsuccessfulCompletionEvent) event.getHistoryEvent();
                    mi.getJobIndexInfo().setFinishTime(jucEvent.getFinishTime());
                    mi.getJobIndexInfo().setNumMaps(jucEvent.getFinishedMaps());
                    mi.getJobIndexInfo().setNumReduces(jucEvent.getFinishedReduces());
                    mi.getJobIndexInfo().setJobStatus(jucEvent.getStatus());
                    closeEventWriter(event.getJobID());
                    if (context.isLastAMRetry()) {
                        processDoneFiles(event.getJobID());
                    }
                } catch (IOException e) {
                    throw new YarnRuntimeException(e);
                }
            } else if (event.getHistoryEvent().getEventType() == EventType.JOB_FAILED || event.getHistoryEvent().getEventType() == EventType.JOB_KILLED) {
                try {
                    JobUnsuccessfulCompletionEvent jucEvent = (JobUnsuccessfulCompletionEvent) event.getHistoryEvent();
                    mi.getJobIndexInfo().setFinishTime(jucEvent.getFinishTime());
                    mi.getJobIndexInfo().setNumMaps(jucEvent.getFinishedMaps());
                    mi.getJobIndexInfo().setNumReduces(jucEvent.getFinishedReduces());
                    mi.getJobIndexInfo().setJobStatus(jucEvent.getStatus());
                    closeEventWriter(event.getJobID());
                    processDoneFiles(event.getJobID());
                } catch (IOException e) {
                    throw new YarnRuntimeException(e);
                }
            }
        }
    }

    public void processEventForJobSummary(HistoryEvent event, JobSummary summary, JobId jobId) {
        switch (event.getEventType()) {
            case JOB_SUBMITTED:
                JobSubmittedEvent jse = (JobSubmittedEvent) event;
                summary.setUser(jse.getUserName());
                summary.setQueue(jse.getJobQueueName());
                summary.setJobSubmitTime(jse.getSubmitTime());
                summary.setJobName(jse.getJobName());
                break;
            case NORMALIZED_RESOURCE:
                NormalizedResourceEvent normalizedResourceEvent = (NormalizedResourceEvent) event;
                if (normalizedResourceEvent.getTaskType() == TaskType.MAP) {
                    summary.setResourcesPerMap(normalizedResourceEvent.getMemory());
                } else if (normalizedResourceEvent.getTaskType() == TaskType.REDUCE) {
                    summary.setResourcesPerReduce(normalizedResourceEvent.getMemory());
                }
                break;
            case JOB_INITED:
                JobInitedEvent jie = (JobInitedEvent) event;
                summary.setJobLaunchTime(jie.getLaunchTime());
                break;
            case JOB_FINISHED:
                JobFinishedEvent jfe = (JobFinishedEvent) event;
                summary.setJobFinishTime(jfe.getFinishTime());
                summary.setNumFinishedMaps(jfe.getFinishedMaps());
                summary.setNumFailedMaps(jfe.getFailedMaps());
                summary.setNumFinishedReduces(jfe.getFinishedReduces());
                summary.setNumFailedReduces(jfe.getFailedReduces());
                if (summary.getJobStatus() == null) {
                    summary.setJobStatus(org.apache.hadoop.mapreduce.JobStatus.State.SUCCEEDED.toString());
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

    private void processEventForTimelineServer(HistoryEvent event, JobId jobId, long timestamp) {
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
                tEvent.addEventInfo("FINISHED_MAPS", juce.getFinishedMaps());
                tEvent.addEventInfo("FINISHED_REDUCES", juce.getFinishedReduces());
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
                tEvent.addEventInfo("FINISHED_MAPS", jfe.getFinishedMaps());
                tEvent.addEventInfo("FINISHED_REDUCES", jfe.getFinishedReduces());
                tEvent.addEventInfo("MAP_COUNTERS_GROUPS", countersToJSON(jfe.getTotalCounters()));
                tEvent.addEventInfo("REDUCE_COUNTERS_GROUPS", countersToJSON(jfe.getReduceCounters()));
                tEvent.addEventInfo("TOTAL_COUNTERS_GROUPS", countersToJSON(jfe.getTotalCounters()));
                tEvent.addEventInfo("JOB_STATUS", JobState.SUCCEEDED.toString());
                tEntity.addEvent(tEvent);
                tEntity.setEntityId(jobId.toString());
                tEntity.setEntityType(MAPREDUCE_JOB_ENTITY_TYPE);
                break;
            default:
                break;
        }

        try {
            timelineClient.putEntities(tEntity);
        } catch (IOException ex) {
            LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
        } catch (YarnException ex) {
            LOG.error("Error putting entity " + tEntity.getEntityId() + " to TimelineServer", ex);
        }
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
        Counter slotMillisMapCounter = allCounters.findCounter(JobCounter.SLOTS_MILLIS_MAPS);
        if (slotMillisMapCounter != null) {
            summary.setMapSlotSeconds(slotMillisMapCounter.getValue() / 1000);
        }

        Counter slotMillisReduceCounter = allCounters.findCounter(JobCounter.SLOTS_MILLIS_REDUCES);
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
            throw new IOException("Inactive Writer: Likely received multiple JobFinished / JobUnsuccessful events for JobId: [" + jobId + "]");
        }

        mi.closeWriter();
    }

    protected void processDoneFiles(JobId jobId) throws IOException {
        final MetaInfo mi = fileMap.get(jobId);
        if (mi == null) {
            throw new IOException("No MetaInfo found for JobId: [" + jobId + "]");
        }

        Path qualifiedSummaryDoneFile = null;
        FSDataOutputStream summaryFileOut = null;
        try {
            String doneSummaryFileName = getTempFileName(JobHistoryUtils.getIntermediateSummaryFileName(jobId));
            qualifiedSummaryDoneFile = doneDirFS.makeQualified(new Path(doneDirPrefixPath, doneSummaryFileName));
            summaryFileOut = doneDirFS.create(qualifiedSummaryDoneFile, true);
            summaryFileOut.writeUTF(mi.getJobSummary().getJobSummaryString());
            summaryFileOut.close();
            doneDirFS.setPermission(qualifiedSummaryDoneFile, new FsPermission(JobHistoryUtils.HISTORY_INTERMEDIATE_FILE_PERMISSIONS));
        } catch (IOException e) {
            LOG.info("Unable to write out JobSummaryInfo to [" + qualifiedSummaryDoneFile + "]", e);
            throw e;
        }

        try {
            Path qualifiedDoneFile = null;
            if (mi.getHistoryFile() != null) {
                Path historyFile = mi.getHistoryFile();
                Path qualifiedLogFile = stagingDirFS.makeQualified(historyFile);
                String doneJobHistoryFileName = getTempFileName(FileNameIndexUtils.getDoneFileName(mi.getJobIndexInfo()));
                qualifiedDoneFile = doneDirFS.makeQualified(new Path(doneDirPrefixPath, doneJobHistoryFileName));
                moveToDoneNow(qualifiedLogFile, qualifiedDoneFile);
            }

            Path qualifiedConfDoneFile = null;
            if (mi.getConfFile() != null) {
                Path confFile = mi.getConfFile();
                Path qualifiedConfFile = stagingDirFS.makeQualified(confFile);
                String doneConfFileName = getTempFileName(JobHistoryUtils.getIntermediateConfFileName(jobId));
                qualifiedConfDoneFile = doneDirFS.makeQualified(new Path(doneDirPrefixPath, doneConfFileName));
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
        private JobIndexInfo jobIndexInfo;
        private JobSummary jobSummary;
        private Timer flushTimer;
        private FlushTimerTask flushTimerTask;
        private boolean isTimerShutDown = false;
        private String forcedJobStateOnShutDown;

        MetaInfo(Path historyFile, Path conf, EventWriter writer, String user, String jobName, JobId jobId, String forcedJobStateOnShutDown, String queueName) {
            this.historyFile = historyFile;
            this.confFile = conf;
            this.writer = writer;
            this.jobIndexInfo = new JobIndexInfo(-1, -1, user, jobName, jobId, -1, -1, null, queueName);
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
            synchronized (lock) {
                if (writer != null) {
                    writer.close();
                }
                writer = null;
            }
        }

        void writeEvent(HistoryEvent event) throws IOException {
            synchronized (lock) {
                if (writer != null) {
                    writer.write(event);
                    processEventForFlush(event);
                    maybeFlush(event);
                }
            }
        }

        void processEventForFlush(HistoryEvent historyEvent) throws IOException {
            if (EnumSet.of(EventType.MAP_ATTEMPT_FINISHED, EventType.MAP_ATTEMPT_FAILED, EventType.MAP_ATTEMPT_KILLED, EventType.REDUCE_ATTEMPT_FINISHED, EventType.REDUCE_ATTEMPT_FAILED, EventType.REDUCE_ATTEMPT_KILLED, EventType.TASK_FINISHED, EventType.TASK_FAILED, EventType.JOB_FINISHED, EventType.JOB_FAILED, EventType.JOB_KILLED).contains(historyEvent.getEventType())) {
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
            if ((eventQueue.size() < minQueueSizeForBatchingFlushes && numUnflushedCompletionEvents > 0) || numUnflushedCompletionEvents >= maxUnflushedCompletionEvents || isJobCompletionEvent(historyEvent)) {
                this.flush();
            }
        }

        void flush() throws IOException {
            synchronized (lock) {
                if (numUnflushedCompletionEvents != 0) {
                    writer.flush();
                    numUnflushedCompletionEvents = 0;
                    resetFlushTimer();
                }
            }
        }

        void shutDownTimer() throws IOException {
            synchronized (lock) {
                isTimerShutDown = true;
                flushTimer.cancel();
                if (flushTimerTask != null && flushTimerTask.getException() != null) {
                    throw flushTimerTask.getException();
                }
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
            boolean copied = FileUtil.copy(stagingDirFS, fromPath, doneDirFS, toPath, false, getConfig());
            if (copied) {
                LOG.info("Copied to done location: " + toPath);
            } else {
                LOG.info("copy failed");
            }
            doneDirFS.setPermission(toPath, new FsPermission(JobHistoryUtils.HISTORY_INTERMEDIATE_FILE_PERMISSIONS));
        }
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
        } else if (forcedJobStateOnShutDown.equals(JobStateInternal.ERROR.toString()) || forcedJobStateOnShutDown.equals(JobStateInternal.FAILED.toString())) {
            return JobState.FAILED.toString();
        } else if (forcedJobStateOnShutDown.equals(JobStateInternal.SUCCEEDED.toString())) {
            return JobState.SUCCEEDED.toString();
        }
        return JobState.KILLED.toString();
    }

    @VisibleForTesting
    boolean getFlushTimerStatus() {
        return isTimerActive;
    }
}