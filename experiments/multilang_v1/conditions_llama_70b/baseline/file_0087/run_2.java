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

    // ... (rest of the class remains the same)

    @Override
    public void run(final JobConf job, final TaskUmbilicalProtocol umbilical)
        throws IOException, ClassNotFoundException, InterruptedException {
        this.umbilical = umbilical;

        if (isMapTask()) {
            // If there are no reducers then there won't be any sort. Hence the map 
            // phase will govern the entire attempt's progress.
            if (conf.getNumReduceTasks() == 0) {
                mapPhase = getProgress().addPhase("map", 1.0f);
            } else {
                // If there are reducers then the entire attempt's progress will be 
                // split between the map phase (67%) and the sort phase (33%).
                mapPhase = getProgress().addPhase("map", 0.667f);
                sortPhase  = getProgress().addPhase("sort", 0.333f);
            }
        }
        TaskReporter reporter = startReporter(umbilical);

        boolean useNewApi = job.getUseNewMapper();
        initialize(job, getJobID(), reporter, useNewApi);

        // check if it is a cleanupJobTask
        if (jobCleanup) {
            runJobCleanupTask(umbilical, reporter);
            return;
        }
        if (jobSetup) {
            runJobSetupTask(umbilical, reporter);
            return;
        }
        if (taskCleanup) {
            runTaskCleanupTask(umbilical, reporter);
            return;
        }

        if (useNewApi) {
            runNewMapper(job, splitMetaInfo, umbilical, reporter);
        } else {
            runOldMapper(job, splitMetaInfo, umbilical, reporter);
        }
        done(umbilical, reporter);
    }

    // Extracted methods to reduce complexity
    private void runNewMapper(JobConf job, TaskSplitIndex splitIndex, TaskUmbilicalProtocol umbilical, TaskReporter reporter)
        throws IOException, ClassNotFoundException, InterruptedException {
        // make a task context so we can get the classes
        org.apache.hadoop.mapreduce.TaskAttemptContext taskContext =
            new org.apache.hadoop.mapreduce.task.TaskAttemptContextImpl(job, 
                                                                      getTaskID(),
                                                                      reporter);
        // make a mapper
        org.apache.hadoop.mapreduce.Mapper mapper =
            (org.apache.hadoop.mapreduce.Mapper)
                ReflectionUtils.newInstance(taskContext.getMapperClass(), job);
        // make the input format
        org.apache.hadoop.mapreduce.InputFormat inputFormat =
            (org.apache.hadoop.mapreduce.InputFormat)
                ReflectionUtils.newInstance(taskContext.getInputFormatClass(), job);
        // rebuild the input split
        org.apache.hadoop.mapreduce.InputSplit split = null;
        split = getSplitDetails(new Path(splitIndex.getSplitLocation()),
            splitIndex.getStartOffset());
        LOG.info("Processing split: " + split);

        org.apache.hadoop.mapreduce.RecordReader input =
            new NewTrackingRecordReader
                (split, inputFormat, reporter, taskContext);
        
        job.setBoolean(JobContext.SKIP_RECORDS, isSkipping());
        org.apache.hadoop.mapreduce.RecordWriter output = null;
        
        // get an output object
        if (job.getNumReduceTasks() == 0) {
            output = 
                new NewDirectOutputCollector(taskContext, job, umbilical, reporter);
        } else {
            output = new NewOutputCollector(taskContext, job, umbilical, reporter);
        }

        org.apache.hadoop.mapreduce.MapContext mapContext = 
            new MapContextImpl(job, getTaskID(), 
                input, output, 
                committer, 
                reporter, split);

        org.apache.hadoop.mapreduce.Mapper.Context mapperContext = 
            new WrappedMapper().getMapContext(
                mapContext);

        try {
            input.initialize(split, mapperContext);
            mapper.run(mapperContext);
            mapPhase.complete();
            setPhase(TaskStatus.Phase.SORT);
            statusUpdate(umbilical);
            input.close();
            input = null;
            output.close(mapperContext);
            output = null;
        } finally {
            closeQuietly(input);
            closeQuietly(output, mapperContext);
        }
    }

    private void runOldMapper(JobConf job, TaskSplitIndex splitIndex, TaskUmbilicalProtocol umbilical, TaskReporter reporter)
        throws IOException, InterruptedException, ClassNotFoundException {
        InputSplit inputSplit = getSplitDetails(new Path(splitIndex.getSplitLocation()),
            splitIndex.getStartOffset());

        updateJobWithSplit(job, inputSplit);
        reporter.setInputSplit(inputSplit);

        RecordReader in = isSkipping() ? 
            new SkippingRecordReader(reporter, job) :
              new TrackedRecordReader(reporter, job);
        job.setBoolean(JobContext.SKIP_RECORDS, isSkipping());

        int numReduceTasks = conf.getNumReduceTasks();
        LOG.info("numReduceTasks: " + numReduceTasks);
        MapOutputCollector collector = null;
        if (numReduceTasks > 0) {
            collector = createSortingCollector(job, reporter);
        } else { 
            collector = new DirectMapOutputCollector();
            MapOutputCollector.Context context =
                new MapOutputCollector.Context(this, job, reporter);
            collector.init(context);
        }
        MapRunnable runner =
            ReflectionUtils.newInstance(job.getMapRunnerClass(), job);

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

    // ... (rest of the class remains the same)
}