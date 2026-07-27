const handleThemeUpload = async ({
    file,
    onActivate
}: {
    file: File;
    onActivate?: () => void
}) => {
    const { mutateAsync: uploadTheme } = useUploadTheme();
    const handleError = useHandleError();

    try {
        setUploading(true);
        const data = await uploadTheme({ file });
        setUploading(false);
        return handleUploadSuccess(data, onActivate);
    } catch (e) {
        setUploading(false);
        return handleUploadError(e);
    }
};

const handleUploadSuccess = (data: ThemesInstallResponseType, onActivate?: () => void) => {
    const uploadedTheme = data.themes[0];
    const title = getUploadSuccessTitle(uploadedTheme);
    const prompt = getUploadSuccessPrompt(uploadedTheme);

    NiceModal.show(ThemeInstalledModal, {
        title,
        prompt,
        installedTheme: uploadedTheme,
        onActivate: onActivate
    });
};

const handleUploadError = (error: any) => {
    const fatalErrors = getFatalErrorsFromError(error);
    if (fatalErrors) {
        return handleFatalErrors(fatalErrors);
    }
    useHandleError()(error);
};

const getFatalErrorsFromError = (error: any): FatalErrors | null => {
    if (error instanceof JSONError && error.response?.status === 422 && error.data?.errors) {
        return error.data.errors as FatalErrors;
    }
    return null;
};

const handleFatalErrors = (fatalErrors: FatalErrors) => {
    const title = 'Invalid Theme';
    const prompt = <>This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme</>;

    NiceModal.show(InvalidThemeModal, {
        title,
        prompt,
        fatalErrors,
        onRetry: async () => {
            modal?.remove();
            handleUpload();
        }
    });
};

const getUploadSuccessTitle = (uploadedTheme: Theme) => {
    if (uploadedTheme.errors?.length || uploadedTheme.warnings?.length) {
        const hasErrors = uploadedTheme.errors?.length;
        return `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`;
    }
    return 'Upload successful';
};

const getUploadSuccessPrompt = (uploadedTheme: Theme) => {
    const hasErrors = uploadedTheme.errors?.length;
    const prompt = <>
        <strong>{uploadedTheme.name}</strong> uploaded
        {uploadedTheme.errors?.length || uploadedTheme.warnings?.length ? (
            <>
                {' '}
                The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.
            </>
        ) : (
            <></>
        )}
        {!uploadedTheme.active ? (
            <>
                {' '}
                Do you want to activate it now?
            </>
        ) : (
            <></>
        )}
    </>;
    return prompt;
};