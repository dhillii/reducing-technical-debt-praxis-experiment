/**
 * Set the base directory for the project, checking that
 * the given file exists and is a directory.
 *
 * @param baseDir The project base directory.
 *                Must not be <code>null</code>.
 * @exception BuildException if the specified file doesn't exist or
 *                           isn't a directory.
 */
public void setProjectBaseDirectory(File baseDir) throws BuildException {
    baseDir = FILE_UTILS.normalize(baseDir.getAbsolutePath());
    if (!baseDir.exists()) {
        throw new BuildException("Basedir " + baseDir.getAbsolutePath()
            + " does not exist");
    }
    if (!baseDir.isDirectory()) {
        throw new BuildException("Basedir " + baseDir.getAbsolutePath()
            + " is not a directory");
    }
    this.baseDir = baseDir;
    setPropertyInternal(MagicNames.PROJECT_BASEDIR, this.baseDir.getPath());
    String msg = "Project base dir set to: " + this.baseDir;
    log(msg, MSG_VERBOSE);
}