const handleThemeUpload = async ({
    file,
    onActivate
}: {
    file: File;
    onActivate?: () => void
}) => {
    try {
        const data = await uploadTheme({ file });
        handleUploadSuccess(data, onActivate);
    } catch (e) {
        handleUploadError(e);
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
    if (error instanceof JSONError && error.response?.status === 422 && error.data?.errors) {
        const fatalErrors = error.data.errors as FatalErrors;
        handleFatalErrors(fatalErrors);
    } else {
        handleError(error);
    }
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
    if (uploadedTheme.errors?.length || uploadedTheme.warnings?.length) {
        const hasErrors = uploadedTheme.errors?.length;
        return <>
            The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.
        </>;
    }
    return <>
        <strong>{uploadedTheme.name}</strong> uploaded
    </>;
};