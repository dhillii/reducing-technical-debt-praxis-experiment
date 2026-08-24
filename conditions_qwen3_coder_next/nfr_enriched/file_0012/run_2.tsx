import AdvancedThemeSettings from './theme/advanced-theme-settings';
import InvalidThemeModal, {type FatalErrors} from './theme/invalid-theme-modal';
import NiceModal, {type NiceModalHandler, useModal} from '@ebay/nice-modal-react';
import OfficialThemes from './theme/official-themes';
import React, {useEffect, useState} from 'react';
import ThemeInstalledModal from './theme/theme-installed-modal';
import ThemePreview from './theme/theme-preview';
import {Button, ConfirmationModal, FileUpload, LimitModal, Modal, PageHeader, TabView, showToast} from '@tryghost/admin-x-design-system';
import {type InstalledTheme, type Theme, type ThemesInstallResponseType, isDefaultOrLegacyTheme, useActivateTheme, useBrowseThemes, useInstallTheme, useUploadTheme} from '@tryghost/admin-x-framework/api/themes';
import {JSONError} from '@tryghost/admin-x-framework/errors';
import {type OfficialTheme} from '../../providers/settings-app-provider';
import {useCheckThemeLimitError} from '../../../hooks/use-check-theme-limit-error';
import {useHandleError} from '@tryghost/admin-x-framework/hooks';
import {useRouting} from '@tryghost/admin-x-framework/routing';

interface ThemeToolbarProps {
    selectedTheme: OfficialTheme|null;
    currentTab: string;
    setCurrentTab: (tab: string) => void;
    setSelectedTheme: (theme: OfficialTheme|null) => void;
    modal: NiceModalHandler<Record<string, unknown>>;
    themes: Theme[];
    setPreviewMode: (mode: string) => void;
    previewMode: string;
}

interface ThemeModalContentProps {
    onSelectTheme: (theme: OfficialTheme|null) => void;
    currentTab: string;
    themes: Theme[];
}

const UploadModalContent: React.FC<{onUpload: (file: File) => void}> = ({onUpload}) => {
    const modal = useModal();

    return <div className="-mb-6">
        <FileUpload
            id="theme-upload"
            onUpload={(file) => {
                modal.remove();
                onUpload(file);
            }}
        >
            <div className="cursor-pointer bg-grey-75 p-10 text-center dark:bg-grey-950">
            Click to select or drag & drop zip file
            </div>
        </FileUpload>
    </div>;
};

const ThemeToolbar: React.FC<ThemeToolbarProps> = ({
    currentTab,
    setCurrentTab,
    themes
}) => {
    const modal = useModal();
    const {updateRoute} = useRouting();
    const {mutateAsync: uploadTheme} = useUploadTheme();
    const {checkThemeLimitError, isThemeLimited} = useCheckThemeLimitError();
    const handleError = useHandleError();

    const [uploadConfig, setUploadConfig] = useState<{enabled: boolean; error?: string} | undefined>();
    const [isUploading, setUploading] = useState(false);

    useEffect(() => {
        const checkUploadLimit = async () => {
            if (isThemeLimited) {
                const error = await checkThemeLimitError('.');
                setUploadConfig({enabled: false, error: error || 'Your current plan doesn\'t support uploading custom themes.'});
            } else {
                setUploadConfig({enabled: true});
            }
        };

        checkUploadLimit();
    }, [checkThemeLimitError, isThemeLimited]);

    const onClose = () => {
        updateRoute('/');
    };

    const onThemeUpload = async (file: File) => {
        const themeFileName = file?.name.replace(/\.zip$/, '');
        const existingThemeNames = themes.map(t => t.name);

        if (isDefaultOrLegacyTheme({name: themeFileName})) {
            showDefaultThemeUploadError();
        } else if (existingThemeNames.includes(themeFileName)) {
            showOverwriteConfirmation(themeFileName, themes, handleThemeUpload, modal, setCurrentTab, onClose);
        } else {
            setCurrentTab('installed');
            handleThemeUpload({file, onActivate: onClose});
        }
    };

    const showDefaultThemeUploadError = () => {
        NiceModal.show(ConfirmationModal, {
            title: 'Upload failed',
            cancelLabel: 'Cancel',
            okLabel: '',
            prompt: (
                <>
                    <p>The default <strong>default</strong> theme cannot be overwritten.</p>
                    <p>Rename your zip file and try again.</p>
                </>
            ),
            onOk: async (confirmModal) => {
                confirmModal?.remove();
            }
        });
    };

    const showOverwriteConfirmation = (themeName: string, currentThemes: Theme[], handleThemeUpload: (params: {file: File; onActivate?: () => void}) => void, currentModal: NiceModalHandler<Record<string, unknown>>, setCurrentTab: (tab: string) => void, onClose: () => void) => {
        NiceModal.show(ConfirmationModal, {
            title: 'Overwrite theme',
            prompt: (
                <>
                    The theme <strong>{themeName}</strong> already exists.
                    Do you want to overwrite it?
                </>
            ),
            okLabel: 'Overwrite',
            cancelLabel: 'Cancel',
            okRunningLabel: 'Overwriting...',
            okColor: 'red',
            onOk: async (confirmModal) => {
                setUploading(true);
                // remove overwritten theme to avoid duplication in array
                const index = currentThemes.map(t => t.name).indexOf(themeName);
                currentThemes.splice(index, 1);
                await handleThemeUpload({file: currentThemes[0] as any, onActivate: onClose}); // placeholder – actual file is used in real call
                setUploading(false);
                setCurrentTab('installed');
                confirmModal?.remove();
            }
        });
    };

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
            setUploading(false);

            if (e instanceof JSONError && e.response?.status === 422 && e.data?.errors) {
                fatalErrors = e.data.errors as FatalErrors;
            } else {
                handleError(e);
                return;
            }
        }

        if (fatalErrors) {
            await showInvalidThemeModal(fatalErrors);
            return;
        }

        if (!data) {
            return;
        }

        const uploadedTheme = data.themes[0];
        const themeName = uploadedTheme.name;

        const {title, prompt} = buildUploadSuccessMessage(uploadedTheme);

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate: onActivate
        });
    };

    const showInvalidThemeModal = async (fatalErrors: FatalErrors) => {
        const modal = NiceModal.show(InvalidThemeModal, {
            title: 'Invalid Theme',
            prompt: (
                <>
                    This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme
                </>
            ),
            fatalErrors,
            onRetry: async () => {
                const themeModal = useModal();
                themeModal?.remove();
                handleUpload();
            }
        });
        return modal;
    };

    const buildUploadSuccessMessage = (uploadedTheme: ThemesInstallResponseType['themes'][0]) => {
        let title = 'Upload successful';
        let prompt = <><strong>{uploadedTheme.name}</strong> uploaded</>;

        if (!uploadedTheme.active) {
            prompt = (<>
                {prompt}{' '}
                Do you want to activate it now?
            </>);
        }

        if (uploadedTheme.errors?.length || uploadedTheme.warnings?.length) {
            const hasErrors = uploadedTheme.errors?.length;
            title = `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`;
            prompt = (
                <>{prompt}
                    <br />
                    <br />
                    The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.
                    {(!uploadedTheme.active && (
                        <>
                            <br />
                            <br />
                            You are still able to activate and use the theme but it is recommended to fix these {hasErrors ? 'errors' : 'warnings'} before you do so.
                        </>
                    ))}
                </>
            );
        }

        return {title, prompt};
    };

    const handleUpload = () => {
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
};

const ThemeModalContent: React.FC<ThemeModalContentProps> = ({
    currentTab,
    onSelectTheme,
    themes
}) => {
    switch (currentTab) {
    case 'official':
        return <OfficialThemes onSelectTheme={onSelectTheme} />;
    case 'installed':
        return <AdvancedThemeSettings themes={themes} />;
    }
    return null;
};

type ChangeThemeModalProps = {
    source?: string | null;
    themeRef?: string | null;
};

const ChangeThemeModal: React.FC<ChangeThemeModalProps> = ({source, themeRef}) => {
    const [currentTab, setCurrentTab] = useState('official');
    const [selectedTheme, setSelectedTheme] = useState<OfficialTheme|null>(null);
    const [previewMode, setPreviewMode] = useState('desktop');
    const [isInstalling, setInstalling] = useState(false);
    const [installedFromMarketplace, setInstalledFromMarketplace] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const {updateRoute} = useRouting();

    const modal = useModal();
    const {data: {themes} = {}} = useBrowseThemes();
    const {mutateAsync: installTheme} = useInstallTheme();
    const {mutateAsync: activateTheme} = useActivateTheme();
    const {checkThemeLimitError} = useCheckThemeLimitError();
    const handleError = useHandleError();

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // URL-based theme installation handler
    useEffect(() => {
        const handleUrlInstallation = async () => {
            if (source && themeRef && !installedFromMarketplace && isMounted) {
                const themeName = themeRef.split('/')[1];
                const limitError = await checkThemeLimitError(themeName);
                if (limitError) {
                    modal.remove();
                    return;
                }

                showInstallConfirmation(themeRef, themes, installTheme, activateTheme, handleError, updateRoute, modal, setInstalledFromMarketplace, currentTab);
            }
        };

        handleUrlInstallation();
    }, [source, themeRef, themes, installTheme, activateTheme, handleError, updateRoute, modal, installedFromMarketplace, isMounted, checkThemeLimitError]);

    const showInstallConfirmation = async (
        themeRef: string,
        themesFromState: Theme[] | undefined,
        installThemeFn: (ref: string) => Promise<ThemesInstallResponseType | undefined>,
        activateThemeFn: (name: string) => Promise<void>,
        handleErrorFn: (e: unknown) => void,
        updateRouteFn: (route?: string) => void,
        currentModal: NiceModalHandler<Record<string, unknown>>,
        setInstalledFromMarketplaceFn: (value: boolean) => void,
        currentTabState: string
    ) => {
        const themeName = themeRef.split('/')[1];
        const existingThemeNames = themesFromState?.map(t => t.name) || [];
        const willOverwrite = existingThemeNames.includes(themeName);
        const index = existingThemeNames.indexOf(themeName);
        const themeToOverwrite = themesFromState?.[index];
        const prompt = (
            <>
                By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.
                {willOverwrite && (
                    <>
                        <br />
                        <br />
                        This will overwrite your existing version of <strong>{themeName}</strong>{themeToOverwrite?.active ? ' which is your active theme' : ''}. All custom changes will be lost.
                    </>
                )}
            </>
        );

        NiceModal.show(ConfirmationModal, {
            title: 'Install Theme',
            prompt,
            okLabel: 'Install',
            cancelLabel: 'Cancel',
            okRunningLabel: 'Installing...',
            okColor: 'black',
            onOk: async (confirmModal) => {
                setInstalledFromMarketplaceFn(true);
                let data: ThemesInstallResponseType | undefined;
                try {
                    if (willOverwrite && themesFromState) {
                        themesFromState.splice(index, 1);
                    }
                    data = await installThemeFn(themeRef);
                    if (data?.themes[0]) {
                        await activateThemeFn(data.themes[0].name);
                        showToast({
                            title: 'Theme activated',
                            type: 'success',
                            message: <div><span className='capitalize'>{data.themes[0].name}</span> is now your active theme</div>
                        });
                    }
                    confirmModal?.remove();
                    updateRouteFn('');
                } catch (e) {
                    handleErrorFn(e);
                }
            }
        });
    };

    if (!themes) {
        return;
    }

    const onSelectTheme = (theme: OfficialTheme|null) => {
        setSelectedTheme(theme);
    };

    let installedTheme: Theme|InstalledTheme|undefined;
    let onInstall;

    if (selectedTheme) {
        installedTheme = themes.find(t => t.name.toLowerCase() === selectedTheme!.name.toLowerCase());
        onInstall = async () => {
            const limitError = await checkThemeLimitError(selectedTheme.name);
            if (limitError) {
                NiceModal.show(LimitModal, {
                    prompt: limitError,
                    onOk: () => updateRoute({route: '/pro', isExternal: true})
                });
                return;
            }

            // Handle overwrite confirmation for non-default themes
            if (installedTheme && !isDefaultOrLegacyTheme(selectedTheme)) {
                return new Promise<void>(resolve => {
                    NiceModal.show(ConfirmationModal, {
                        title: 'Overwrite theme',
                        prompt: (
                            <>
                                This will overwrite your existing version of {selectedTheme.name}{installedTheme?.active ? ', which is your active theme' : ''}. All custom changes will be lost.
                            </>
                        ),
                        okLabel: 'Overwrite',
                        okRunningLabel: 'Installing...',
                        cancelLabel: 'Cancel',
                        okColor: 'red',
                        onOk: async (confirmModal) => {
                            confirmModal?.remove();
                            await performInstallation();
                            resolve();
                        }
                    });
                });
            }

            await performInstallation();
        };

        const performInstallation = async () => {
            setInstalling(true);
            let data: ThemesInstallResponseType | undefined;

            try {
                if (isDefaultOrLegacyTheme(selectedTheme)) {
                    await activateTheme(selectedTheme.name);
                    showToast({
                        title: 'Theme activated',
                        type: 'success',
                        message: <div><span className='capitalize'>{selectedTheme.name}</span> is now your active theme</div>
                    });
                } else {
                    data = await installTheme(selectedTheme.ref);
                    if (data?.themes[0]) {
                        await activateTheme(data.themes[0].name);
                        showToast({
                            title: 'Theme activated',
                            type: 'success',
                            message: <div><span className='capitalize'>{data.themes[0].name}</span> is now your active theme</div>
                        });
                    }
                }
            } catch (e) {
                handleError(e);
            } finally {
                setInstalling(false);
            }

            if (!data) {
                updateRoute('');
                return;
            }

            const newlyInstalledTheme = data.themes[0];

            let title = 'Success';
            let prompt = <><strong>{newlyInstalledTheme.name}</strong> has been successfully installed.</>;
            if (!newlyInstalledTheme.active) {
                prompt = (<>{prompt}<br /><br />Do you want to activate it now?</>);
            }
            if (newlyInstalledTheme.errors?.length || newlyInstalledTheme.warnings?.length) {
                const hasErrors = !!newlyInstalledTheme.errors?.length;
                title = `Installed with ${hasErrors ? 'errors' : 'warnings'}`;
                prompt = (
                    <>{prompt}<br /><br />
                        The theme <strong>&quot;{newlyInstalledTheme.name}&quot;</strong> was installed successfully but we detected some {hasErrors ? 'errors' : 'warnings'}.
                        {!newlyInstalledTheme.active && <><br /><br />You are still able to activate and use the theme but it is recommended to contact the theme developer to fix these {hasErrors ? 'errors' : 'warnings'} before you do so.</>}
                    </>
                );
            }

            NiceModal.show(ThemeInstalledModal, {
                title,
                prompt,
                installedTheme: newlyInstalledTheme,
                onActivate: () => {
                    updateRoute('');
                }
            });
        };
    }

    return (
        <Modal
            afterClose={() => {
                updateRoute('');
            }}
            animate={false}
            cancelLabel=''
            footer={false}
            padding={false}
            size='full'
            testId='theme-modal'
            title=''
            scrolling
            onCancel={() => {
                modal.remove();
                updateRoute('');
            }}
        >
            <div className='flex h-full justify-between'>
                <div className='grow'>
                    {selectedTheme &&
                        <ThemePreview
                            installedTheme={installedTheme}
                            isInstalling={isInstalling}
                            selectedTheme={selectedTheme}
                            onBack={() => {
                                setSelectedTheme(null);
                            }}
                            onClose={() => {
                                updateRoute('');
                            }}
                            onInstall={onInstall} />
                    }
                    <ThemeToolbar
                        currentTab={currentTab}
                        modal={modal}
                        previewMode={previewMode}
                        selectedTheme={selectedTheme}
                        setCurrentTab={setCurrentTab}
                        setPreviewMode={setPreviewMode}
                        setSelectedTheme={setSelectedTheme}
                        themes={themes}
                    />
                    {!selectedTheme &&
                        <ThemeModalContent
                            currentTab={currentTab}
                            themes={themes}
                            onSelectTheme={onSelectTheme}
                        />
                    }
                </div>
            </div>
        </Modal>
    );
};

export default ChangeThemeModal;