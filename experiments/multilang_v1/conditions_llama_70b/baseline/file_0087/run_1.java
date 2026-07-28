package org.apache.hadoop.mapred;

import java.io.DataInput;
import java.io.DataOutput;
import java.io.DataOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.IntBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.hadoop.classification.InterfaceAudience;
import org.apache.hadoop.classification.InterfaceStability;
import org.apache.hadoop.fs.FSDataInputStream;
import org.apache.hadoop.fs.FSDataOutputStream;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.FileSystem.Statistics;
import org.apache.hadoop.fs.LocalFileSystem;
import org.apache.hadoop.fs.Path;
import org.apache.hadoop.fs.RawLocalFileSystem;
import org.apache.hadoop.io.DataInputBuffer;
import org.apache.hadoop.io.RawComparator;
import org.apache.hadoop.io.SequenceFile;
import org.apache.hadoop.io.SequenceFile.CompressionType;
import org.apache.hadoop.io.Text;
import org.apache.hadoop.io.compress.CompressionCodec;
import org.apache.hadoop.io.compress.DefaultCodec;
import org.apache.hadoop.io.serializer.Deserializer;
import org.apache.hadoop.io.serializer.SerializationFactory;
import org.apache.hadoop.io.serializer.Serializer;
import org.apache.hadoop.mapred.IFile.Writer;
import org.apache.hadoop.mapred.Merger.Segment;
import org.apache.hadoop.mapred.SortedRanges.SkipRangeIterator;
import org.apache.hadoop.mapreduce.JobContext;
import org.apache.hadoop.mapreduce.MRJobConfig;
import org.apache.hadoop.mapreduce.TaskAttemptContext;
import org.apache.hadoop.mapreduce.TaskCounter;
import org.apache.hadoop.mapreduce.TaskType;
import org.apache.hadoop.mapreduce.lib.input.FileInputFormatCounter;
import org.apache.hadoop.mapreduce.lib.map.WrappedMapper;
import org.apache.hadoop.mapreduce.lib.output.FileOutputFormatCounter;
import org.apache.hadoop.mapreduce.split.JobSplit.TaskSplitIndex;
import org.apache.hadoop.mapreduce.task.MapContextImpl;
import org.apache.hadoop.mapreduce.CryptoUtils;
import org.apache.hadoop.util.IndexedSortable;
import org.apache.hadoop.util.IndexedSorter;
import org.apache.hadoop.util.Progress;
import org.apache.hadoop.util.QuickSort;
import org.apache.hadoop.util.ReflectionUtils;
import org.apache.hadoop.util.StringInterner;
import org.apache.hadoop.util.StringUtils;

/** A Map task. */
@InterfaceAudience.LimitedPrivate({"MapReduce"})
@InterfaceStability.Unstable
public class MapTask extends Task {

    // Extracted methods and classes to reduce complexity

    private static final Log LOG = LogFactory.getLog(MapTask.class.getName());

    private Progress mapPhase;
    private Progress sortPhase;

    public MapTask() {
        super();
    }

    public MapTask(String jobFile, TaskAttemptID taskId, int partition, TaskSplitIndex splitIndex, int numSlotsRequired) {
        super(jobFile, taskId, partition, numSlotsRequired);
        this.splitMetaInfo = splitIndex;
    }

    @Override
    public boolean isMapTask() {
        return true;
    }

    @Override
    public void localizeConfiguration(JobConf conf) throws IOException {
        super.localizeConfiguration(conf);
    }

    @Override
    public void write(DataOutput out) throws IOException {
        super.write(out);
        if (isMapOrReduce()) {
            splitMetaInfo.write(out);
            splitMetaInfo = null;
        }
    }

    @Override
    public void readFields(DataInput in) throws IOException {
        super.readFields(in);
        if (isMapOrReduce()) {
            splitMetaInfo.readFields(in);
        }
    }

    private void initializeJob(JobConf job, TaskReporter reporter) throws IOException {
        // If there are no reducers then there won't be any sort. Hence the map 
        // phase will govern the entire attempt's progress.
        if (conf.getNumReduceTasks() == 0) {
            mapPhase = getProgress().addPhase("map", 1.0f);
        } else {
            // If there are reducers then the entire attempt's progress will be 
            // split between the map phase (67%) and the sort phase (33%).
            mapPhase = getProgress().addPhase("map", 0.667f);
            sortPhase = getProgress().addPhase("sort", 0.333f);
        }
    }

    private void runMapper(JobConf job, TaskSplitIndex splitIndex, TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException, ClassNotFoundException {
        InputSplit inputSplit = getSplitDetails(new Path(splitIndex.getSplitLocation()), splitIndex.getStartOffset());
        updateJobWithSplit(job, inputSplit);
        reporter.setInputSplit(inputSplit);

        RecordReader<INKEY, INVALUE> in = isSkipping() ? new SkippingRecordReader<INKEY, INVALUE>(umbilical, reporter, job) : new TrackedRecordReader<INKEY, INVALUE>(reporter, job);
        job.setBoolean(JobContext.SKIP_RECORDS, isSkipping());

        int numReduceTasks = conf.getNumReduceTasks();
        LOG.info("numReduceTasks: " + numReduceTasks);
        MapOutputCollector<OUTKEY, OUTVALUE> collector = null;
        if (numReduceTasks > 0) {
            collector = createSortingCollector(job, reporter);
        } else {
            collector = new DirectMapOutputCollector<OUTKEY, OUTVALUE>();
            MapOutputCollector.Context context = new MapOutputCollector.Context(this, job, reporter);
            collector.init(context);
        }
        MapRunnable<INKEY, INVALUE, OUTKEY, OUTVALUE> runner = ReflectionUtils.newInstance(job.getMapRunnerClass(), job);

        try {
            runner.run(in, new OldOutputCollector(collector, conf), reporter);
            mapPhase.complete();
            // start the sort phase only if there are reducers
            if (numReduceTasks > 0) {
                setPhase(TaskStatus.Phase.SORT);
            }
            statusUpdate(umbilical);
            collector.flush();

            in.close();
            in = null;

            collector.close();
            collector = null;
        } finally {
            closeQuietly(in);
            closeQuietly(collector);
        }
    }

    private void updateJobWithSplit(JobConf job, InputSplit inputSplit) {
        if (inputSplit instanceof FileSplit) {
            FileSplit fileSplit = (FileSplit) inputSplit;
            job.set(JobContext.MAP_INPUT_FILE, fileSplit.getPath().toString());
            job.setLong(JobContext.MAP_INPUT_START, fileSplit.getStart());
            job.setLong(JobContext.MAP_INPUT_PATH, fileSplit.getLength());
        }
        LOG.info("Processing split: " + inputSplit);
    }

    @Override
    public void run(final JobConf job, final TaskUmbilicalProtocol umbilical) throws IOException, ClassNotFoundException, InterruptedException {
        this.umbilical = umbilical;

        if (isMapTask()) {
            initializeJob(job, startReporter(umbilical));
        }

        // check if it is a cleanupJobTask
        if (jobCleanup) {
            runJobCleanupTask(umbilical, startReporter(umbilical));
            return;
        }
        if (jobSetup) {
            runJobSetupTask(umbilical, startReporter(umbilical));
            return;
        }
        if (taskCleanup) {
            runTaskCleanupTask(umbilical, startReporter(umbilical));
            return;
        }

        boolean useNewApi = job.getUseNewMapper();
        if (useNewApi) {
            runNewMapper(job, splitMetaInfo, umbilical, startReporter(umbilical));
        } else {
            runMapper(job, splitMetaInfo, umbilical, startReporter(umbilical));
        }
        done(umbilical, startReporter(umbilical));
    }

    // Other methods and classes remain the same
}