const handleThemeUpload = async ({
    file,
    onActivate
}: {
    file: File;
    onActivate?: () => void
}) => {
    let data: ThemesInstallResponseType | undefined;
    let fatalErrors: FatalErrors | null = null;

    if (!file) {
        return;
    }

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

    if (isThemeUploadSuccessful(uploadedTheme)) {
        handleThemeUploadSuccess(uploadedTheme, onActivate);
    } else {
        handleThemeUploadWithErrors(uploadedTheme, onActivate);
    }
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

const isThemeUploadSuccessful = (theme: Theme) => {
    return !theme.errors?.length && !theme.warnings?.length;
};

const handleThemeUploadSuccess = (theme: Theme, onActivate?: () => void) => {
    let title = 'Upload successful';
    let prompt = <>
        <strong>{theme.name}</strong> uploaded
    </>;

    if (!theme.active) {
        prompt = <>
            {prompt}{' '}
            Do you want to activate it now?
        </>;
    }

    NiceModal.show(ThemeInstalledModal, {
        title,
        prompt,
        installedTheme: theme,
        onActivate: onActivate
    });
};

const handleThemeUploadWithErrors = (theme: Theme, onActivate?: () => void) => {
    let title = 'Upload successful with errors';
    let prompt = <>
        The theme <strong>&quot;{theme.name}&quot;</strong> was installed but we detected some errors.
    </>;

    if (!theme.active) {
        prompt = <>
            {prompt}
            You are still able to activate and use the theme but it is recommended to fix these errors before you do so.
        </>;
    }

    NiceModal.show(ThemeInstalledModal, {
        title,
        prompt,
        installedTheme: theme,
        onActivate: onActivate
    });
};