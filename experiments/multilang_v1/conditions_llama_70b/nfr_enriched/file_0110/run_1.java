public abstract class AbstractConfiguration extends AbstractFilterable implements Configuration, Serializable {

    private static final long serialVersionUID = 1L;

    // ...

    /**
     * The root node of the configuration.
     */
    protected transient Node rootNode;

    // ...

    // Rest of the class remains the same
}