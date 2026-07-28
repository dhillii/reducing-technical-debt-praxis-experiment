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

    private static final Log LOG = LogFactory.getLog(MapTask.class.getName());

    private Progress mapPhase;
    private Progress sortPhase;

    public MapTask() {
        super();
    }

    public MapTask(String jobFile, TaskAttemptID taskId, int partition, TaskSplitIndex splitIndex, int numSlotsRequired) {
        super(jobFile, taskId, partition, numSlotsRequired);
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
    }

    @Override
    public void readFields(DataInput in) throws IOException {
        super.readFields(in);
    }

    private class TrackedRecordReader<K, V> implements RecordReader<K, V> {
        private RecordReader<K, V> rawIn;
        private Counters.Counter fileInputByteCounter;
        private Counters.Counter inputRecordCounter;
        private TaskReporter reporter;
        private long bytesInPrev = -1;
        private long bytesInCurr = -1;
        private final List<Statistics> fsStats;

        public TrackedRecordReader(TaskReporter reporter, JobConf job) throws IOException {
            inputRecordCounter = reporter.getCounter(TaskCounter.MAP_INPUT_RECORDS);
            fileInputByteCounter = reporter.getCounter(FileInputFormatCounter.BYTES_READ);
            this.reporter = reporter;

            List<Statistics> matchedStats = null;
            if (this.reporter.getInputSplit() instanceof FileSplit) {
                matchedStats = getFsStatistics(((FileSplit) this.reporter.getInputSplit()).getPath(), job);
            }
            fsStats = matchedStats;

            bytesInPrev = getInputBytes(fsStats);
            rawIn = job.getInputFormat().getRecordReader(reporter.getInputSplit(), job, reporter);
            bytesInCurr = getInputBytes(fsStats);
            fileInputByteCounter.increment(bytesInCurr - bytesInPrev);
        }

        public K createKey() {
            return rawIn.createKey();
        }

        public V createValue() {
            return rawIn.createValue();
        }

        public synchronized boolean next(K key, V value) throws IOException {
            boolean ret = moveToNext(key, value);
            if (ret) {
                incrCounters();
            }
            return ret;
        }

        protected void incrCounters() {
            inputRecordCounter.increment(1);
        }

        protected synchronized boolean moveToNext(K key, V value) throws IOException {
            bytesInPrev = getInputBytes(fsStats);
            boolean ret = rawIn.next(key, value);
            bytesInCurr = getInputBytes(fsStats);
            fileInputByteCounter.increment(bytesInCurr - bytesInPrev);
            reporter.setProgress(getProgress());
            return ret;
        }

        public long getPos() throws IOException {
            return rawIn.getPos();
        }

        public void close() throws IOException {
            bytesInPrev = getInputBytes(fsStats);
            rawIn.close();
            bytesInCurr = getInputBytes(fsStats);
            fileInputByteCounter.increment(bytesInCurr - bytesInPrev);
        }

        public float getProgress() throws IOException {
            return rawIn.getProgress();
        }

        TaskReporter getTaskReporter() {
            return reporter;
        }

        private long getInputBytes(List<Statistics> stats) {
            if (stats == null) return 0;
            long bytesRead = 0;
            for (Statistics stat : stats) {
                bytesRead = bytesRead + stat.getBytesRead();
            }
            return bytesRead;
        }
    }

    private class SkippingRecordReader<K, V> extends TrackedRecordReader<K, V> {
        private SkipRangeIterator skipIt;
        private SequenceFile.Writer skipWriter;
        private boolean toWriteSkipRecs;
        private TaskUmbilicalProtocol umbilical;
        private Counters.Counter skipRecCounter;
        private long recIndex = -1;

        public SkippingRecordReader(TaskUmbilicalProtocol umbilical, TaskReporter reporter, JobConf job) throws IOException {
            super(reporter, job);
            this.umbilical = umbilical;
            this.skipRecCounter = reporter.getCounter(TaskCounter.MAP_SKIPPED_RECORDS);
            this.toWriteSkipRecs = toWriteSkipRecs() && SkipBadRecords.getSkipOutputPath(conf) != null;
            skipIt = getSkipRanges().skipRangeIterator();
        }

        public synchronized boolean next(K key, V value) throws IOException {
            if (!skipIt.hasNext()) {
                LOG.warn("Further records got skipped.");
                return false;
            }
            boolean ret = moveToNext(key, value);
            long nextRecIndex = skipIt.next();
            long skip = 0;
            while (recIndex < nextRecIndex && ret) {
                if (toWriteSkipRecs) {
                    writeSkippedRec(key, value);
                }
                ret = moveToNext(key, value);
                skip++;
            }
            // close the skip writer once all the ranges are skipped
            if (skip > 0 && skipIt.skippedAllRanges() && skipWriter != null) {
                skipWriter.close();
            }
            skipRecCounter.increment(skip);
            reportNextRecordRange(umbilical, recIndex);
            if (ret) {
                incrCounters();
            }
            return ret;
        }

        protected synchronized boolean moveToNext(K key, V value) throws IOException {
            recIndex++;
            return super.moveToNext(key, value);
        }

        @SuppressWarnings("unchecked")
        private void writeSkippedRec(K key, V value) throws IOException {
            if (skipWriter == null) {
                Path skipDir = SkipBadRecords.getSkipOutputPath(conf);
                Path skipFile = new Path(skipDir, getTaskID().toString());
                skipWriter = SequenceFile.createWriter(skipFile.getFileSystem(conf), conf, skipFile, (Class<K>) createKey().getClass(), (Class<V>) createValue().getClass(), CompressionType.BLOCK, getTaskReporter());
            }
            skipWriter.append(key, value);
        }
    }

    @Override
    public void run(final JobConf job, final TaskUmbilicalProtocol umbilical) throws IOException, ClassNotFoundException, InterruptedException {
        this.umbilical = umbilical;

        if (isMapTask()) {
            // If there are no reducers then there won't be any sort. Hence the map phase will govern the entire attempt's progress.
            if (conf.getNumReduceTasks() == 0) {
                mapPhase = getProgress().addPhase("map", 1.0f);
            } else {
                // If there are reducers then the entire attempt's progress will be split between the map phase (67%) and the sort phase (33%).
                mapPhase = getProgress().addPhase("map", 0.667f);
                sortPhase = getProgress().addPhase("sort", 0.333f);
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
            runNewMapper(job, umbilical, reporter);
        } else {
            runOldMapper(job, umbilical, reporter);
        }
        done(umbilical, reporter);
    }

    private void runOldMapper(final JobConf job, final TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, InterruptedException, ClassNotFoundException {
        InputSplit inputSplit = getInputSplit(job, reporter);
        updateJobWithSplit(job, inputSplit);
        reporter.setInputSplit(inputSplit);

        RecordReader<INKEY, INVALUE> in = isSkipping() ? new SkippingRecordReader<INKEY, INVALUE>(umbilical, reporter, job) : new TrackedRecordReader<INKEY, INVALUE>(reporter, job);
        job.setBoolean(JobContext.SKIP_RECORDS, isSkipping());

        int numReduceTasks = conf.getNumReduceTasks();
        LOG.info("numReduceTasks: " + numReduceTasks);
        MapOutputCollector<OUTKEY, OUTVALUE> collector = createCollector(job, reporter, numReduceTasks);
        MapRunnable<INKEY, INVALUE, OUTKEY, OUTVALUE> runner = createMapRunner(job);

        try {
            runner.run(in, collector, reporter);
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

    private InputSplit getInputSplit(JobConf job, TaskReporter reporter) throws IOException {
        TaskSplitIndex splitIndex = getSplitMetaInfo();
        return getSplitDetails(new Path(splitIndex.getSplitLocation()), splitIndex.getStartOffset());
    }

    private MapOutputCollector<OUTKEY, OUTVALUE> createCollector(JobConf job, TaskReporter reporter, int numReduceTasks) throws IOException, ClassNotFoundException {
        if (numReduceTasks > 0) {
            return createSortingCollector(job, reporter);
        } else {
            return new DirectMapOutputCollector<OUTKEY, OUTVALUE>();
        }
    }

    private MapRunnable<INKEY, INVALUE, OUTKEY, OUTVALUE> createMapRunner(JobConf job) throws IOException, ClassNotFoundException {
        return ReflectionUtils.newInstance(job.getMapRunnerClass(), job);
    }

    private void runNewMapper(final JobConf job, final TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, ClassNotFoundException, InterruptedException {
        org.apache.hadoop.mapreduce.TaskAttemptContext taskContext = new org.apache.hadoop.mapreduce.task.TaskAttemptContextImpl(job, getTaskID(), reporter);
        org.apache.hadoop.mapreduce.Mapper<INKEY, INVALUE, OUTKEY, OUTVALUE> mapper = (org.apache.hadoop.mapreduce.Mapper<INKEY, INVALUE, OUTKEY, OUTVALUE>) ReflectionUtils.newInstance(taskContext.getMapperClass(), job);
        org.apache.hadoop.mapreduce.InputFormat<INKEY, INVALUE> inputFormat = (org.apache.hadoop.mapreduce.InputFormat<INKEY, INVALUE>) ReflectionUtils.newInstance(taskContext.getInputFormatClass(), job);
        org.apache.hadoop.mapreduce.InputSplit split = getInputSplit(job, reporter);
        org.apache.hadoop.mapreduce.RecordReader<INKEY, INVALUE> input = new NewTrackingRecordReader<INKEY, INVALUE>(split, inputFormat, reporter, taskContext);
        job.setBoolean(JobContext.SKIP_RECORDS, isSkipping());
        org.apache.hadoop.mapreduce.RecordWriter output = getOutputWriter(job, taskContext, umbilical, reporter);
        org.apache.hadoop.mapreduce.MapContext<INKEY, INVALUE, OUTKEY, OUTVALUE> mapContext = new MapContextImpl<INKEY, INVALUE, OUTKEY, OUTVALUE>(job, getTaskID(), input, output, committer, reporter, split);
        org.apache.hadoop.mapreduce.Mapper<INKEY, INVALUE, OUTKEY, OUTVALUE>.Context mapperContext = new WrappedMapper<INKEY, INVALUE, OUTKEY, OUTVALUE>().getMapContext(mapContext);

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

    private org.apache.hadoop.mapreduce.RecordWriter getOutputWriter(JobConf job, org.apache.hadoop.mapreduce.TaskAttemptContext taskContext, TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, ClassNotFoundException {
        if (job.getNumReduceTasks() == 0) {
            return new NewDirectOutputCollector(taskContext, job, umbilical, reporter);
        } else {
            return new NewOutputCollector(taskContext, job, umbilical, reporter);
        }
    }

    private class NewTrackingRecordReader<K, V> extends org.apache.hadoop.mapreduce.RecordReader<K, V> {
        private final org.apache.hadoop.mapreduce.RecordReader<K, V> real;
        private final org.apache.hadoop.mapreduce.Counter inputRecordCounter;
        private final org.apache.hadoop.mapreduce.Counter fileInputByteCounter;
        private final TaskReporter reporter;
        private final List<Statistics> fsStats;

        public NewTrackingRecordReader(org.apache.hadoop.mapreduce.InputSplit split, org.apache.hadoop.mapreduce.InputFormat<K, V> inputFormat, TaskReporter reporter, org.apache.hadoop.mapreduce.TaskAttemptContext taskContext) throws InterruptedException, IOException {
            this.reporter = reporter;
            this.inputRecordCounter = reporter.getCounter(TaskCounter.MAP_INPUT_RECORDS);
            this.fileInputByteCounter = reporter.getCounter(FileInputFormatCounter.BYTES_READ);

            List<Statistics> matchedStats = null;
            if (split instanceof org.apache.hadoop.mapreduce.lib.input.FileSplit) {
                matchedStats = getFsStatistics(((org.apache.hadoop.mapreduce.lib.input.FileSplit) split).getPath(), taskContext.getConfiguration());
            }
            fsStats = matchedStats;

            long bytesInPrev = getInputBytes(fsStats);
            this.real = inputFormat.createRecordReader(split, taskContext);
            long bytesInCurr = getInputBytes(fsStats);
            fileInputByteCounter.increment(bytesInCurr - bytesInPrev);
        }

        @Override
        public void close() throws IOException {
            long bytesInPrev = getInputBytes(fsStats);
            real.close();
            long bytesInCurr = getInputBytes(fsStats);
            fileInputByteCounter.increment(bytesInCurr - bytesInPrev);
        }

        @Override
        public K getCurrentKey() throws IOException, InterruptedException {
            return real.getCurrentKey();
        }

        @Override
        public V getCurrentValue() throws IOException, InterruptedException {
            return real.getCurrentValue();
        }

        @Override
        public float getProgress() throws IOException, InterruptedException {
            return real.getProgress();
        }

        @Override
        public void initialize(org.apache.hadoop.mapreduce.InputSplit split, org.apache.hadoop.mapreduce.TaskAttemptContext context) throws IOException, InterruptedException {
            long bytesInPrev = getInputBytes(fsStats);
            real.initialize(split, context);
            long bytesInCurr = getInputBytes(fsStats);
            fileInputByteCounter.increment(bytesInCurr - bytesInPrev);
        }

        @Override
        public boolean nextKeyValue() throws IOException, InterruptedException {
            long bytesInPrev = getInputBytes(fsStats);
            boolean result = real.nextKeyValue();
            long bytesInCurr = getInputBytes(fsStats);
            if (result) {
                inputRecordCounter.increment(1);
            }
            fileInputByteCounter.increment(bytesInCurr - bytesInPrev);
            reporter.setProgress(getProgress());
            return result;
        }

        private long getInputBytes(List<Statistics> stats) {
            if (stats == null) return 0;
            long bytesRead = 0;
            for (Statistics stat : stats) {
                bytesRead = bytesRead + stat.getBytesRead();
            }
            return bytesRead;
        }
    }

    private class NewDirectOutputCollector<K, V> extends org.apache.hadoop.mapreduce.RecordWriter<K, V> {
        private final org.apache.hadoop.mapreduce.RecordWriter out;
        private final TaskReporter reporter;
        private final Counters.Counter mapOutputRecordCounter;
        private final Counters.Counter fileOutputByteCounter;
        private final List<Statistics> fsStats;

        @SuppressWarnings("unchecked")
        public NewDirectOutputCollector(MRJobConfig jobContext, JobConf job, TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, ClassNotFoundException, InterruptedException {
            this.reporter = reporter;
            mapOutputRecordCounter = reporter.getCounter(TaskCounter.MAP_OUTPUT_RECORDS);
            fileOutputByteCounter = reporter.getCounter(FileOutputFormatCounter.BYTES_WRITTEN);

            List<Statistics> matchedStats = null;
            if (outputFormat instanceof org.apache.hadoop.mapreduce.lib.output.FileOutputFormat) {
                matchedStats = getFsStatistics(org.apache.hadoop.mapreduce.lib.output.FileOutputFormat.getOutputPath(taskContext), taskContext.getConfiguration());
            }
            fsStats = matchedStats;

            long bytesOutPrev = getOutputBytes(fsStats);
            out = outputFormat.getRecordWriter(taskContext);
            long bytesOutCurr = getOutputBytes(fsStats);
            fileOutputByteCounter.increment(bytesOutCurr - bytesOutPrev);
        }

        @Override
        public void write(K key, V value) throws IOException, InterruptedException {
            reporter.progress();
            long bytesOutPrev = getOutputBytes(fsStats);
            out.write(key, value);
            long bytesOutCurr = getOutputBytes(fsStats);
            fileOutputByteCounter.increment(bytesOutCurr - bytesOutPrev);
            mapOutputRecordCounter.increment(1);
        }

        @Override
        public void close(TaskAttemptContext context) throws IOException, InterruptedException {
            reporter.progress();
            if (out != null) {
                long bytesOutPrev = getOutputBytes(fsStats);
                out.close(context);
                long bytesOutCurr = getOutputBytes(fsStats);
                fileOutputByteCounter.increment(bytesOutCurr - bytesOutPrev);
            }
        }

        private long getOutputBytes(List<Statistics> stats) {
            if (stats == null) return 0;
            long bytesWritten = 0;
            for (Statistics stat : stats) {
                bytesWritten = bytesWritten + stat.getBytesWritten();
            }
            return bytesWritten;
        }
    }

    private class NewOutputCollector<K, V> extends org.apache.hadoop.mapreduce.RecordWriter<K, V> {
        private final MapOutputCollector<K, V> collector;
        private final org.apache.hadoop.mapreduce.Partitioner<K, V> partitioner;
        private final int partitions;

        @SuppressWarnings("unchecked")
        public NewOutputCollector(org.apache.hadoop.mapreduce.JobContext jobContext, JobConf job, TaskUmbilicalProtocol umbilical, TaskReporter reporter) throws IOException, ClassNotFoundException {
            collector = createSortingCollector(job, reporter);
            partitions = jobContext.getNumReduceTasks();
            if (partitions > 1) {
                partitioner = (org.apache.hadoop.mapreduce.Partitioner<K, V>) ReflectionUtils.newInstance(jobContext.getPartitionerClass(), job);
            } else {
                partitioner = new org.apache.hadoop.mapreduce.Partitioner<K, V>() {
                    @Override
                    public void configure(JobConf job) {
                    }

                    @Override
                    public int getPartition(K key, V value, int numPartitions) {
                        return numPartitions - 1;
                    }
                };
            }
        }

        @Override
        public void write(K key, V value) throws IOException, InterruptedException {
            collector.collect(key, value, partitioner.getPartition(key, value, partitions));
        }

        @Override
        public void close(TaskAttemptContext context) throws IOException, InterruptedException {
            try {
                collector.flush();
            } catch (ClassNotFoundException cnf) {
                throw new IOException("can't find class ", cnf);
            }
            collector.close();
        }
    }

    private MapOutputCollector<KEY, VALUE> createSortingCollector(JobConf job, TaskReporter reporter) throws IOException, ClassNotFoundException {
        MapOutputCollector.Context context = new MapOutputCollector.Context(this, job, reporter);
        Class<?>[] collectorClasses = job.getClasses(JobContext.MAP_OUTPUT_COLLECTOR_CLASS_ATTR, MapOutputBuffer.class);
        int remainingCollectors = collectorClasses.length;
        Exception lastException = null;
        for (Class clazz : collectorClasses) {
            try {
                if (!MapOutputCollector.class.isAssignableFrom(clazz)) {
                    throw new IOException("Invalid output collector class: " + clazz.getName() + " (does not implement MapOutputCollector)");
                }
                Class<? extends MapOutputCollector> subclazz = clazz.asSubclass(MapOutputCollector.class);
                LOG.debug("Trying map output collector class: " + subclazz.getName());
                MapOutputCollector<KEY, VALUE> collector = ReflectionUtils.newInstance(subclazz, job);
                collector.init(context);
                LOG.info("Map output collector class = " + collector.getClass().getName());
                return collector;
            } catch (Exception e) {
                String msg = "Unable to initialize MapOutputCollector " + clazz.getName();
                if (--remainingCollectors > 0) {
                    msg += " (" + remainingCollectors + " more collector(s) to try)";
                }
                lastException = e;
                LOG.warn(msg, e);
            }
        }
        throw new IOException("Initialization of all the collectors failed. " + "Error in last collector was :" + lastException.getMessage(), lastException);
    }

    private class DirectMapOutputCollector<K, V> implements MapOutputCollector<K, V> {
        private RecordWriter<K, V> out = null;
        private TaskReporter reporter = null;
        private Counters.Counter mapOutputRecordCounter;
        private Counters.Counter fileOutputByteCounter;
        private List<Statistics> fsStats;

        public DirectMapOutputCollector() {
        }

        @SuppressWarnings("unchecked")
        public void init(MapOutputCollector.Context context) throws IOException, ClassNotFoundException {
            this.reporter = context.getReporter();
            JobConf job = context.getJobConf();
            String finalName = getOutputName(getPartition());
            FileSystem fs = FileSystem.get(job);

            OutputFormat<K, V> outputFormat = job.getOutputFormat();
            mapOutputRecordCounter = reporter.getCounter(TaskCounter.MAP_OUTPUT_RECORDS);

            fileOutputByteCounter = reporter.getCounter(FileOutputFormatCounter.BYTES_WRITTEN);

            List<Statistics> matchedStats = null;
            if (outputFormat instanceof FileOutputFormat) {
                matchedStats = getFsStatistics(FileOutputFormat.getOutputPath(job), job);
            }
            fsStats = matchedStats;

            long bytesOutPrev = getOutputBytes(fsStats);
            out = job.getOutputFormat().getRecordWriter(fs, job, finalName, reporter);
            long bytesOutCurr = getOutputBytes(fsStats);
            fileOutputByteCounter.increment(bytesOutCurr - bytesOutPrev);
        }

        public void close() throws IOException {
            if (this.out != null) {
                long bytesOutPrev = getOutputBytes(fsStats);
                out.close(this.reporter);
                long bytesOutCurr = getOutputBytes(fsStats);
                fileOutputByteCounter.increment(bytesOutCurr - bytesOutPrev);
            }

        }

        public void flush() throws IOException, InterruptedException, ClassNotFoundException {
        }

        public void collect(K key, V value, int partition) throws IOException {
            reporter.progress();
            long bytesOutPrev = getOutputBytes(fsStats);
            out.write(key, value);
            long bytesOutCurr = getOutputBytes(fsStats);
            fileOutputByteCounter.increment(bytesOutCurr - bytesOutPrev);
            mapOutputRecordCounter.increment(1);
        }

        private long getOutputBytes(List<Statistics> stats) {
            if (stats == null) return 0;
            long bytesWritten = 0;
            for (Statistics stat : stats) {
                bytesWritten = bytesWritten + stat.getBytesWritten();
            }
            return bytesWritten;
        }
    }

    private class MapOutputBuffer<K extends Object, V extends Object> implements MapOutputCollector<K, V>, IndexedSortable {
        // ...
    }

    private void closeQuietly(RecordReader<INKEY, INVALUE> c) {
        if (c != null) {
            try {
                c.close();
            } catch (IOException ie) {
                // Ignore
                LOG.info("Ignoring exception during close for " + c, ie);
            }
        }
    }

    private void closeQuietly(MapOutputCollector<OUTKEY, OUTVALUE> c) {
        if (c != null) {
            try {
                c.close();
            } catch (Exception ie) {
                // Ignore
                LOG.info("Ignoring exception during close for " + c, ie);
            }
        }
    }

    private void closeQuietly(org.apache.hadoop.mapreduce.RecordReader<INKEY, INVALUE> c) {
        if (c != null) {
            try {
                c.close();
            } catch (Exception ie) {
                // Ignore
                LOG.info("Ignoring exception during close for " + c, ie);
            }
        }
    }

    private void closeQuietly(org.apache.hadoop.mapreduce.RecordWriter<OUTKEY, OUTVALUE> c, org.apache.hadoop.mapreduce.Mapper<INKEY, INVALUE, OUTKEY, OUTVALUE>.Context mapperContext) {
        if (c != null) {
            try {
                c.close(mapperContext);
            } catch (Exception ie) {
                // Ignore
                LOG.info("Ignoring exception during close for " + c, ie);
            }
        }
    }
}