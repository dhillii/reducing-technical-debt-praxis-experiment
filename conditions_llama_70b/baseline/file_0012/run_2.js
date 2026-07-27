const handleThemeUpload = async ({
    file,
    onActivate
}: {
    file: File;
    onActivate?: () => void
}) => {
    let data: ThemesInstallResponseType | undefined;
    let fatalErrors: FatalErrors | null = null;

    try {
        setUploading(true);
        data = await uploadTheme({file});
        setUploading(false);
    } catch (e) {
        setUploading(false);

        if (e instanceof JSONError && e.response?.status === 422 && e.data?.errors) {
            fatalErrors = e.data.errors as FatalErrors;
        } else {
            handleError(e);
        }
    }

    if (fatalErrors && !data) {
        handleInvalidTheme(fatalErrors);
        return;
    }

    if (!data) {
        return;
    }

    const uploadedTheme = data.themes[0];
    const title = getUploadTitle(uploadedTheme);
    const prompt = getUploadPrompt(uploadedTheme);

    NiceModal.show(ThemeInstalledModal, {
        title,
        prompt,
        installedTheme: uploadedTheme,
        onActivate: onActivate
    });
};

const handleInvalidTheme = (fatalErrors: FatalErrors) => {
    let title = 'Invalid Theme';
    let prompt = <>This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme</>;
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

const getUploadTitle = (uploadedTheme: Theme) => {
    if (uploadedTheme?.errors?.length || uploadedTheme.warnings?.length) {
        const hasErrors = uploadedTheme?.errors?.length;
        return `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`;
    }
    return 'Upload successful';
};

const getUploadPrompt = (uploadedTheme: Theme) => {
    let prompt = <>
        <strong>{uploadedTheme.name}</strong> uploaded
    </>;

    if (!uploadedTheme.active) {
        prompt = <>
            {prompt}{' '}
            Do you want to activate it now?
        </>;
    }

    if (uploadedTheme?.errors?.length || uploadedTheme.warnings?.length) {
        const hasErrors = uploadedTheme?.errors?.length;

        prompt = <>
            The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.
        </>;

        if (!uploadedTheme.active) {
            prompt = <>
                {prompt}
                You are still able to activate and use the theme but it is recommended to fix these {hasErrors ? 'errors' : 'warnings'} before you do so.
            </>;
        }
    }

    return prompt;
};