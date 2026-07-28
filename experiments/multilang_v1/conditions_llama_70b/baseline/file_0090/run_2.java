public class AzureNativeFileSystemStore implements NativeFileSystemStore {

    // ... (rest of the class remains the same)

    private void createAzureStorageSession() throws AzureException, IOException {
        // ... (rest of the method remains the same)

        // Extract the account name.
        String accountName = getAccountFromAuthority(sessionUri);
        if (null == accountName) {
            // Account name is not specified as part of the URI. Throw indicating
            // an invalid account name.
            final String errMsg = String.format(
                    "Cannot load WASB file system account name not"
                            + " specified in URI: %s.", sessionUri.toString());
            throw new AzureException(errMsg);
        }

        // ... (rest of the method remains the same)
    }

    private void configureAzureStorageSession() throws AzureException {
        // ... (rest of the method remains the same)

        // Set up the exponential retry policy.
        //
        minBackoff = sessionConfiguration.getInt(
                KEY_MIN_BACKOFF_INTERVAL, DEFAULT_MIN_BACKOFF_INTERVAL);

        maxBackoff = sessionConfiguration.getInt(
                KEY_MAX_BACKOFF_INTERVAL, DEFAULT_MAX_BACKOFF_INTERVAL);

        deltaBackoff = sessionConfiguration.getInt(
                KEY_BACKOFF_INTERVAL, DEFAULT_BACKOFF_INTERVAL);

        maxRetries = sessionConfiguration.getInt(
                KEY_MAX_IO_RETRIES, DEFAULT_MAX_RETRY_ATTEMPTS);

        storageInteractionLayer.setRetryPolicyFactory(
                new RetryExponentialRetry(minBackoff, deltaBackoff, maxBackoff, maxRetries));

        // ... (rest of the method remains the same)
    }

    private ContainerState checkContainer(ContainerAccessType accessType)
            throws StorageException, AzureException {
        // ... (rest of the method remains the same)

        // This means I didn't check it before or it didn't exist or
        // we need to stamp the version. Since things may have changed by
        // other machines since then, do the check again and don't depend
        // on past information.

        // Sanity check: we don't expect this at this point.
        if (currentKnownContainerState == ContainerState.ExistsAtRightVersion) {
            throw new AssertionError("Unexpected state: "
                    + currentKnownContainerState);
        }

        // Download the attributes - doubles as an existence check with just
        // one service call
        try {
            container.downloadAttributes(getInstrumentedContext());
            currentKnownContainerState = ContainerState.Unknown;
        } catch (StorageException ex) {
            if (ex.getErrorCode().equals(
                    StorageErrorCode.RESOURCE_NOT_FOUND.toString())) {
                currentKnownContainerState = ContainerState.DoesntExist;
            } else {
                throw ex;
            }
        }

        // ... (rest of the method remains the same)
    }

    // Extract methods for better readability and maintainability
    private void initializeSession(URI uri, Configuration conf, AzureFileSystemInstrumentation instrumentation)
            throws IllegalArgumentException, AzureException, IOException {
        if (null == instrumentation) {
            throw new IllegalArgumentException("Null instrumentation");
        }
        this.instrumentation = instrumentation;

        if (null == this.storageInteractionLayer) {
            this.storageInteractionLayer = new StorageInterfaceImpl();
        }

        // ... (rest of the method remains the same)
    }

    private void initializeConfiguration(Configuration conf) {
        // ... (rest of the method remains the same)
    }

    private void initializeAzureStorage(URI uri) throws AzureException, IOException {
        // ... (rest of the method remains the same)
    }

    @Override
    public void initialize(URI uri, Configuration conf, AzureFileSystemInstrumentation instrumentation)
            throws IllegalArgumentException, AzureException, IOException {
        initializeSession(uri, conf, instrumentation);
        initializeConfiguration(conf);
        initializeAzureStorage(uri);
    }

    // ... (rest of the class remains the same)
}