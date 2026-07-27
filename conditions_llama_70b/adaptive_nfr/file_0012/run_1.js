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

        if (isJsonErrorWith422Status(e)) {
            fatalErrors = e.data.errors as FatalErrors;
        } else {
            handleError(e);
        }
    }

    if (hasFatalErrorsButNoData(fatalErrors, data)) {
        showInvalidThemeModal(fatalErrors);
        return;
    }

    if (!data) {
        return;
    }

    const uploadedTheme = data.themes[0];
    const title = getModalTitle(uploadedTheme);
    const prompt = getModalPrompt(uploadedTheme);

    NiceModal.show(ThemeInstalledModal, {
        title,
        prompt,
        installedTheme: uploadedTheme,
        onActivate: onActivate
    });
};

const isJsonErrorWith422Status = (error: any): error is JSONError => {
    return error instanceof JSONError && error.response?.status === 422 && error.data?.errors;
};

const hasFatalErrorsButNoData = (fatalErrors: FatalErrors | null, data: ThemesInstallResponseType | undefined): boolean => {
    return fatalErrors !== null && data === undefined;
};

const showInvalidThemeModal = (fatalErrors: FatalErrors) => {
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

const getModalTitle = (uploadedTheme: Theme): string => {
    if (uploadedTheme?.errors?.length || uploadedTheme.warnings?.length) {
        const hasErrors = uploadedTheme?.errors?.length;
        return `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`;
    }
    return 'Upload successful';
};

const getModalPrompt = (uploadedTheme: Theme): JSX.Element => {
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