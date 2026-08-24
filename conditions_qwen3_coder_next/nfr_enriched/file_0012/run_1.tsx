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
        } catch (e) {
            handleUploadError(e, (errors) => {
                fatalErrors = errors;
            });
        } finally {
            setUploading(false);
        }

        if (fatalErrors && !data) {
            showInvalidThemeModal(fatalErrors, modal, handleUpload);
            return;
        }

        if (!data) {
            return;
        }

        const uploadedTheme = data.themes[0];
        const {
            title,
            prompt,
            installedTheme
        } = prepareSuccessMessage(uploadedTheme, onActivate);

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: installedTheme!,
            onActivate
        });
    };

    const handleUploadError = (error: unknown, onError: (errors: FatalErrors) => void) => {
        if (error instanceof JSONError && error.response?.status === 422 && error.data?.errors) {
            onError(error.data.errors as FatalErrors);
        } else {
            handleError(error);
        }
    };

    const showInvalidThemeModal = (fatalErrors: FatalErrors, modalInstance: NiceModalHandler<Record<string, unknown>>, onRetry: () => void) => {
        NiceModal.show(InvalidThemeModal, {
            title: 'Invalid Theme',
            prompt: <>This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme</>,
            fatalErrors,
            onRetry: async () => {
                modalInstance?.remove();
                onRetry();
            }
        });
    };

    const prepareSuccessMessage = (uploadedTheme: Theme, onActivate?: () => void) => {
        let title = 'Upload successful';
        let prompt = <><strong>{uploadedTheme.name}</strong> uploaded</>;

        if (!uploadedTheme.active) {
            prompt = <>{prompt}{' '}Do you want to activate it now?</>;
        }

        if (uploadedTheme?.errors?.length || uploadedTheme.warnings?.length) {
            const hasErrors = uploadedTheme?.errors?.length;
            title = `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`;
            prompt = <>
                The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.
            </>;

            if (!uploadedTheme.active) {
                prompt = <>{prompt}{' '}You are still able to activate and use the theme but it is recommended to fix these {hasErrors ? 'errors' : 'warnings'} before you do so.</>;
            }
        }

        return {title, prompt, installedTheme: uploadedTheme};
    };

    const left =
    <div className='hidden md:!visible md:!block'>
        <TabView
            border={false}
            selectedTab={currentTab}
            tabs={[
                {id: 'official', title: 'Official themes'},
                {id: 'installed', title: 'Installed'}
            ]}
            onTabChange={(id: string) => {
                setCurrentTab(id);
            }} />
    </div>;

    const handleUpload = () => {
        // Don't do anything if still checking limits
        if (!uploadConfig) {
            return;
        }

        if (uploadConfig.enabled) {
            NiceModal.show(ConfirmationModal, {
                title: 'Upload theme',
                prompt: <UploadModalContent onUpload={onThemeUpload} />,
                okLabel: '',
                formSheet: false
            });
        } else {
            NiceModal.show(LimitModal, {
                title: 'Upgrade to enable custom themes',
                prompt: uploadConfig.error || <>Your current plan only supports official themes. You can install them from the <a href="https://ghost.org/marketplace/">Ghost theme marketplace</a>.</>,
                onOk: () => updateRoute({route: '/pro', isExternal: true})
            });
        }
    };

    const right =
        <div className='flex items-center gap-14'>
            <div className='flex items-center gap-3'>
                <Button label='Close' onClick={() => {
                    modal.remove();
                    onClose();
                }} />
                <Button color='black' label='Upload theme' loading={isUploading} onClick={handleUpload} />
            </div>
        </div>;

    return (<>
        <PageHeader containerClassName='bg-white dark:bg-black' left={left} right={right} />
        <div className='px-[8vmin] md:hidden'>
            <TabView
                border={false}
                selectedTab={currentTab}
                tabs={[
                    {id: 'official', title: 'Official themes'},
                    {id: 'installed', title: 'Installed'}
                ]}
                onTabChange={(id: string) => {
                    setCurrentTab(id);
                }} />
        </div>
    </>);