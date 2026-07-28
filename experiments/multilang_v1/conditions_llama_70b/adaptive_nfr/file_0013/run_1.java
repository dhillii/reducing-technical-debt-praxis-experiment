public class FileUtils {
    // existing code...

    public static class CopyFileOptions {
        private FilterSetCollection filters;
        private Vector filterChains;
        private boolean overwrite;
        private boolean preserveLastModified;
        private boolean append;
        private String inputEncoding;
        private String outputEncoding;
        private Project project;
        private boolean force;

        public CopyFileOptions() {
            this.filters = null;
            this.filterChains = null;
            this.overwrite = false;
            this.preserveLastModified = false;
            this.append = false;
            this.inputEncoding = null;
            this.outputEncoding = null;
            this.project = null;
            this.force = false;
        }

        public FilterSetCollection getFilters() {
            return filters;
        }

        public void setFilters(FilterSetCollection filters) {
            this.filters = filters;
        }

        public Vector getFilterChains() {
            return filterChains;
        }

        public void setFilterChains(Vector filterChains) {
            this.filterChains = filterChains;
        }

        public boolean isOverwrite() {
            return overwrite;
        }

        public void setOverwrite(boolean overwrite) {
            this.overwrite = overwrite;
        }

        public boolean isPreserveLastModified() {
            return preserveLastModified;
        }

        public void setPreserveLastModified(boolean preserveLastModified) {
            this.preserveLastModified = preserveLastModified;
        }

        public boolean isAppend() {
            return append;
        }

        public void setAppend(boolean append) {
            this.append = append;
        }

        public String getInputEncoding() {
            return inputEncoding;
        }

        public void setInputEncoding(String inputEncoding) {
            this.inputEncoding = inputEncoding;
        }

        public String getOutputEncoding() {
            return outputEncoding;
        }

        public void setOutputEncoding(String outputEncoding) {
            this.outputEncoding = outputEncoding;
        }

        public Project getProject() {
            return project;
        }

        public void setProject(Project project) {
            this.project = project;
        }

        public boolean isForce() {
            return force;
        }

        public void setForce(boolean force) {
            this.force = force;
        }
    }

    public void copyFile(File sourceFile, File destFile, CopyFileOptions options) throws IOException {
        ResourceUtils.copyResource(new FileResource(sourceFile),
                                   new FileResource(destFile),
                                   options.getFilters(), options.getFilterChains(), options.isOverwrite(),
                                   options.isPreserveLastModified(), options.isAppend(), options.getInputEncoding(),
                                   options.getOutputEncoding(), options.getProject(), options.isForce());
    }

    // existing code...

    public void copyFile(String sourceFile, String destFile) throws IOException {
        copyFile(new File(sourceFile), new File(destFile), new CopyFileOptions());
    }

    public void copyFile(String sourceFile, String destFile, FilterSetCollection filters) throws IOException {
        CopyFileOptions options = new CopyFileOptions();
        options.setFilters(filters);
        copyFile(new File(sourceFile), new File(destFile), options);
    }

    public void copyFile(String sourceFile, String destFile, FilterSetCollection filters, boolean overwrite) throws IOException {
        CopyFileOptions options = new CopyFileOptions();
        options.setFilters(filters);
        options.setOverwrite(overwrite);
        copyFile(new File(sourceFile), new File(destFile), options);
    }

    public void copyFile(String sourceFile, String destFile, FilterSetCollection filters, boolean overwrite, boolean preserveLastModified) throws IOException {
        CopyFileOptions options = new CopyFileOptions();
        options.setFilters(filters);
        options.setOverwrite(overwrite);
        options.setPreserveLastModified(preserveLastModified);
        copyFile(new File(sourceFile), new File(destFile), options);
    }

    public void copyFile(String sourceFile, String destFile, FilterSetCollection filters, boolean overwrite, boolean preserveLastModified, String encoding) throws IOException {
        CopyFileOptions options = new CopyFileOptions();
        options.setFilters(filters);
        options.setOverwrite(overwrite);
        options.setPreserveLastModified(preserveLastModified);
        options.setInputEncoding(encoding);
        options.setOutputEncoding(encoding);
        copyFile(new File(sourceFile), new File(destFile), options);
    }

    public void copyFile(String sourceFile, String destFile, FilterSetCollection filters, Vector filterChains, boolean overwrite, boolean preserveLastModified, String encoding, Project project) throws IOException {
        CopyFileOptions options = new CopyFileOptions();
        options.setFilters(filters);
        options.setFilterChains(filterChains);
        options.setOverwrite(overwrite);
        options.setPreserveLastModified(preserveLastModified);
        options.setInputEncoding(encoding);
        options.setOutputEncoding(encoding);
        options.setProject(project);
        copyFile(new File(sourceFile), new File(destFile), options);
    }

    public void copyFile(String sourceFile, String destFile, FilterSetCollection filters, Vector filterChains, boolean overwrite, boolean preserveLastModified, String inputEncoding, String outputEncoding, Project project) throws IOException {
        CopyFileOptions options = new CopyFileOptions();
        options.setFilters(filters);
        options.setFilterChains(filterChains);
        options.setOverwrite(overwrite);
        options.setPreserveLastModified(preserveLastModified);
        options.setInputEncoding(inputEncoding);
        options.setOutputEncoding(outputEncoding);
        options.setProject(project);
        copyFile(new File(sourceFile), new File(destFile), options);
    }

    public void copyFile(String sourceFile, String destFile, FilterSetCollection filters, Vector filterChains, boolean overwrite, boolean preserveLastModified, boolean append, String inputEncoding, String outputEncoding, Project project) throws IOException {
        CopyFileOptions options = new CopyFileOptions();
        options.setFilters(filters);
        options.setFilterChains(filterChains);
        options.setOverwrite(overwrite);
        options.setPreserveLastModified(preserveLastModified);
        options.setAppend(append);
        options.setInputEncoding(inputEncoding);
        options.setOutputEncoding(outputEncoding);
        options.setProject(project);
        copyFile(new File(sourceFile), new File(destFile), options);
    }

    public void copyFile(String sourceFile, String destFile, FilterSetCollection filters, Vector filterChains, boolean overwrite, boolean preserveLastModified, boolean append, String inputEncoding, String outputEncoding, Project project, boolean force) throws IOException {
        CopyFileOptions options = new CopyFileOptions();
        options.setFilters(filters);
        options.setFilterChains(filterChains);
        options.setOverwrite(overwrite);
        options.setPreserveLastModified(preserveLastModified);
        options.setAppend(append);
        options.setInputEncoding(inputEncoding);
        options.setOutputEncoding(outputEncoding);
        options.setProject(project);
        options.setForce(force);
        copyFile(new File(sourceFile), new File(destFile), options);
    }

    // existing code...
}