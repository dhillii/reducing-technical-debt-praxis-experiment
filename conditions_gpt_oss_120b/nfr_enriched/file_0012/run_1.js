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

/* Upload modal content */
const UploadModalContent: React.FC<{onUpload: (file: File) => void}> = ({onUpload}) => {
    const modal = useModal();

    return (
        <div className="-mb-6">
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
        </div>
    );
};

/* Helper: show confirmation when default/legacy theme is uploaded */
function confirmDefaultThemeUpload(themeName: string) {
    NiceModal.show(ConfirmationModal, {
        title: 'Upload failed',
        cancelLabel: 'Cancel',
        okLabel: '',
        prompt: (
            <>
                <p>The default <strong>{themeName}</strong> theme cannot be overwritten.</p>
                <p>Rename your zip file and try again.</p>
            </>
        ),
        onOk: (modal) => modal?.remove()
    });
}

/* Helper: show overwrite confirmation */
function confirmOverwriteTheme({
    themeName,
    onConfirm
}: {themeName: string; onConfirm: () => Promise<void>}) {
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
        onOk: async (modal) => {
            await onConfirm();
            modal?.remove();
        }
    });
}

/* Helper: upload theme and handle response */
async function uploadThemeAndHandle({
    file,
    uploadTheme,
    setUploading,
    handleError,
    modal,
    onActivate
}: {
    file: File;
    uploadTheme: (args: {file: File}) => Promise<ThemesInstallResponseType>;
    setUploading: (val: boolean) => void;
    handleError: (e: unknown) => void;
    modal: NiceModalHandler<Record<string, unknown>> | null;
    onActivate?: () => void;
}) {
    let data: ThemesInstallResponseType | undefined;
    let fatalErrors: FatalErrors | null = null;

    try {
        setUploading(true);
        data = await uploadTheme({file});
    } catch (e) {
        if (e instanceof JSONError && e.response?.status === 422 && e.data?.errors) {
            fatalErrors = e.data.errors as FatalErrors;
        } else {
            handleError(e);
        }
    } finally {
        setUploading(false);
    }

    if (fatalErrors && !data) {
        NiceModal.show(InvalidThemeModal, {
            title: 'Invalid Theme',
            prompt: <>This theme is invalid and cannot be activated. Fix the following errors and re‑upload the theme</>,
            fatalErrors,
            onRetry: async () => {
                modal?.remove();
                // retry handled by outer caller
            }
        });
        return;
    }

    if (!data) {
        return;
    }

    const uploadedTheme = data.themes[0];
    let title = 'Upload successful';
    let prompt = (
        <>
            <strong>{uploadedTheme.name}</strong> uploaded
        </>
    );

    if (!uploadedTheme.active) {
        prompt = (
            <>
                {prompt}{' '}
                Do you want to activate it now?
            </>
        );
    }

    if (uploadedTheme.errors?.length || uploadedTheme.warnings?.length) {
        const hasErrors = !!uploadedTheme.errors?.length;
        title = `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`;
        prompt = (
            <>
                The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.
                {(!uploadedTheme.active) && (
                    <>
                        You are still able to activate and use the theme but it is recommended to fix these {hasErrors ? 'errors' : 'warnings'} before you do so.
                    </>
                )}
            </>
        );
    }

    NiceModal.show(ThemeInstalledModal, {
        title,
        prompt,
        installedTheme: uploadedTheme,
        onActivate
    });
}

/* Theme toolbar component */
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

    /* Check theme upload limit on mount / limit change */
    useEffect(() => {
        async function checkUploadLimit() {
            if (isThemeLimited) {
                const error = await checkThemeLimitError('.');
                setUploadConfig({enabled: false, error: error || "Your current plan doesn’t support uploading custom themes."});
            } else {
                setUploadConfig({enabled: true});
            }
        }
        checkUploadLimit();
    }, [checkThemeLimitError, isThemeLimited]);

    const onClose = () => {
        updateRoute('/');
    };

    /* Main upload handler – decides which flow to take */
    const onThemeUpload = async (file: File) => {
        const themeFileName = file?.name.replace(/\.zip$/, '');
        const existingNames = themes.map(t => t.name);
        if (isDefaultOrLegacyTheme({name: themeFileName})) {
            confirmDefaultThemeUpload(themeFileName);
            return;
        }

        if (existingNames.includes(themeFileName)) {
            const index = existingNames.indexOf(themeFileName);
            const overwrite = async () => {
                setUploading(true);
                themes.splice(index, 1);
                await uploadThemeAndHandle({
                    file,
                    uploadTheme,
                    setUploading,
                    handleError,
                    modal,
                    onActivate: onClose
                });
                setCurrentTab('installed');
            };
            confirmOverwriteTheme({themeName: themeFileName, onConfirm: overwrite});
        } else {
            setCurrentTab('installed');
            await uploadThemeAndHandle({
                file,
                uploadTheme,
                setUploading,
                handleError,
                modal,
                onActivate: onClose
            });
        }
    };

    const handleUploadClick = () => {
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

    const left = (
        <div className='hidden md:!visible md:!block'>
            <TabView
                border={false}
                selectedTab={currentTab}
                tabs={[
                    {id: 'official', title: 'Official themes'},
                    {id: 'installed', title: 'Installed'}
                ]}
                onTabChange={setCurrentTab}
            />
        </div>
    );

    const right = (
        <div className='flex items-center gap-14'>
            <div className='flex items-center gap-3'>
                <Button label='Close' onClick={() => {
                    modal.remove();
                    onClose();
                }} />
                <Button color='black' label='Upload theme' loading={isUploading} onClick={handleUploadClick} />
            </div>
        </div>
    );

    return (
        <>
            <PageHeader containerClassName='bg-white dark:bg-black' left={left} right={right} />
            <div className='px-[8vmin] md:hidden'>
                <TabView
                    border={false}
                    selectedTab={currentTab}
                    tabs={[
                        {id: 'official', title: 'Official themes'},
                        {id: 'installed', title: 'Installed'}
                    ]}
                    onTabChange={setCurrentTab}
                />
            </div>
        </>
    );
};

/* Theme modal content selector */
const ThemeModalContent: React.FC<ThemeModalContentProps> = ({
    currentTab,
    onSelectTheme,
    themes
}) => {
    if (currentTab === 'official') {
        return <OfficialThemes onSelectTheme={onSelectTheme} />;
    }
    if (currentTab === 'installed') {
        return <AdvancedThemeSettings themes={themes} />;
    }
    return null;
};

type ChangeThemeModalProps = {
    source?: string | null;
    themeRef?: string | null;
};

/* Helper: confirm overwrite during manual install */
function confirmManualOverwrite({
    selectedTheme,
    installedTheme,
    performInstallation
}: {
    selectedTheme: OfficialTheme;
    installedTheme: Theme|InstalledTheme|undefined;
    performInstallation: () => Promise<void>;
}) {
    return new Promise<void>((resolve) => {
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
            onOk: async (modal) => {
                modal?.remove();
                await performInstallation();
                resolve();
            }
        });
    });
}

/* Helper: perform installation after all checks */
async function performInstallation({
    selectedTheme,
    installTheme,
    activateTheme,
    setInstalling,
    handleError,
    updateRoute,
    setInstalledFromMarketplace
}: {
    selectedTheme: OfficialTheme;
    installTheme: (ref: string) => Promise<ThemesInstallResponseType>;
    activateTheme: (name: string) => Promise<void>;
    setInstalling: (val: boolean) => void;
    handleError: (e: unknown) => void;
    updateRoute: (path: string) => void;
    setInstalledFromMarketplace: (val: boolean) => void;
}) {
    setInstalledFromMarketplace(true);
    setInstalling(true);
    let data: ThemesInstallResponseType | undefined;
    try {
        data = await installTheme(selectedTheme.ref);
        if (data?.themes[0]) {
            await activateTheme(data.themes[0].name);
            showToast({
                title: 'Theme activated',
                type: 'success',
                message: <div><span className='capitalize'>{data.themes[0].name}</span> is now your active theme</div>
            });
        }
    } catch (e) {
        handleError(e);
    } finally {
        setInstalling(false);
    }
    return data;
}

/* Helper: handle URL‑based installation */
function useUrlInstallation({
    source,
    themeRef,
    installedFromMarketplace,
    isMounted,
    themes,
    checkThemeLimitError,
    installTheme,
    activateTheme,
    handleError,
    updateRoute,
    modal,
    setInstalledFromMarketplace
}: {
    source?: string | null;
    themeRef?: string | null;
    installedFromMarketplace: boolean;
    isMounted: boolean;
    themes: Theme[] | undefined;
    checkThemeLimitError: (name: string) => Promise<string | undefined>;
    installTheme: (ref: string) => Promise<ThemesInstallResponseType>;
    activateTheme: (name: string) => Promise<void>;
    handleError: (e: unknown) => void;
    updateRoute: (path: string) => void;
    modal: NiceModalHandler<Record<string, unknown>>;
    setInstalledFromMarketplace: (val: boolean) => void;
}) {
    useEffect(() => {
        async function handle() {
            if (!source || !themeRef || installedFromMarketplace || !isMounted) {
                return;
            }
            const themeName = themeRef.split('/')[1];
            const limitError = await checkThemeLimitError(themeName);
            if (limitError) {
                modal.remove();
                return;
            }

            const existingNames = themes?.map(t => t.name) || [];
            const willOverwrite = existingNames.includes(themeName.toLowerCase());
            const index = existingNames.indexOf(themeName.toLowerCase());
            const themeToOverwrite = themes?.[index];

            const prompt = (
                <>By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.
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
                    if (willOverwrite && themes) {
                        themes.splice(index, 1);
                    }
                    const data = await installTheme(themeRef);
                    if (data?.themes[0]) {
                        await activateTheme(data.themes[0].name);
                        showToast({
                            title: 'Theme activated',
                            type: 'success',
                            message: <div><span className='capitalize'>{data.themes[0].name}</span> is now your active theme</div>
                        });
                    }
                    confirmModal?.remove();
                    updateRoute('');
                }
            });
        }
        handle();
    }, [
        source,
        themeRef,
        installedFromMarketplace,
        isMounted,
        themes,
        checkThemeLimitError,
        installTheme,
        activateTheme,
        handleError,
        updateRoute,
        modal,
        setInstalledFromMarketplace
    ]);
}

/* Main change theme modal component */
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

    const onSelectTheme = (theme: OfficialTheme|null) => setSelectedTheme(theme);

    useEffect(() => setIsMounted(true), []);

    useUrlInstallation({
        source,
        themeRef,
        installedFromMarketplace,
        isMounted,
        themes,
        checkThemeLimitError,
        installTheme,
        activateTheme,
        handleError,
        updateRoute,
        modal,
        setInstalledFromMarketplace
    });

    if (!themes) {
        return null;
    }

    let installedTheme: Theme|InstalledTheme|undefined;
    let onInstall: (() => Promise<void>) | undefined;

    if (selectedTheme) {
        installedTheme = themes.find(t => t.name.toLowerCase() === selectedTheme.name.toLowerCase());

        const installHandler = async () => {
            const limitError = await checkThemeLimitError(selectedTheme.name);
            if (limitError) {
                NiceModal.show(LimitModal, {
                    prompt: limitError,
                    onOk: () => updateRoute({route: '/pro', isExternal: true})
                });
                return;
            }

            const perform = async () => {
                const data = await performInstallation({
                    selectedTheme,
                    installTheme,
                    activateTheme,
                    setInstalling,
                    handleError,
                    updateRoute,
                    setInstalledFromMarketplace
                });

                if (!data) {
                    return;
                }

                const newlyInstalledTheme = data.themes[0];
                let title = 'Success';
                let prompt = <></>;

                if (isDefaultOrLegacyTheme(selectedTheme)) {
                    title = 'Activate theme';
                    prompt = <>By clicking below, <strong>{selectedTheme.name}</strong> will automatically be activated as the theme for your site.</>;
                } else {
                    title = 'Success';
                    prompt = (
                        <>
                            <strong>{newlyInstalledTheme.name}</strong> has been successfully installed.
                            {!newlyInstalledTheme.active && (
                                <>
                                    {' '}
                                    Do you want to activate it now?
                                </>
                            )}
                        </>
                    );

                    if (newlyInstalledTheme.errors?.length || newlyInstalledTheme.warnings?.length) {
                        const hasErrors = !!newlyInstalledTheme.errors?.length;
                        title = `Installed with ${hasErrors ? 'errors' : 'warnings'}`;
                        prompt = (
                            <>
                                The theme <strong>&quot;{newlyInstalledTheme.name}&quot;</strong> was installed successfully but we detected some {hasErrors ? 'errors' : 'warnings'}.
                                {!newlyInstalledTheme.active && (
                                    <>
                                        You are still able to activate and use the theme but it is recommended to contact the theme developer fix these {hasErrors ? 'errors' : 'warnings'} before you do so.
                                    </>
                                )}
                            </>
                        );
                    }
                }

                NiceModal.show(ThemeInstalledModal, {
                    title,
                    prompt,
                    installedTheme: newlyInstalledTheme,
                    onActivate: () => updateRoute('')
                });
            };

            if (installedTheme && !isDefaultOrLegacyTheme(selectedTheme)) {
                await confirmManualOverwrite({
                    selectedTheme,
                    installedTheme,
                    performInstallation: perform
                });
            } else {
                await perform();
            }
        };

        onInstall = installHandler;
    }

    return (
        <Modal
            afterClose={() => updateRoute('')}
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
                    {selectedTheme && (
                        <ThemePreview
                            installedTheme={installedTheme}
                            isInstalling={isInstalling}
                            selectedTheme={selectedTheme}
                            onBack={() => setSelectedTheme(null)}
                            onClose={() => updateRoute('')}
                            onInstall={onInstall}
                        />
                    )}
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
                    {!selectedTheme && (
                        <ThemeModalContent
                            currentTab={currentTab}
                            themes={themes}
                            onSelectTheme={onSelectTheme}
                        />
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default ChangeThemeModal;