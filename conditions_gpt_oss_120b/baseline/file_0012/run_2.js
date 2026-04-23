import AdvancedThemeSettings from './theme/advanced-theme-settings';
import InvalidThemeModal, {type FatalErrors} from './theme/invalid-theme-modal';
import NiceModal, {type NiceModalHandler, useModal} from '@ebay/nice-modal-react';
import OfficialThemes from './theme/official-themes';
import React, {useEffect, useState, useCallback} from 'react';
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
    selectedTheme: OfficialTheme | null;
    currentTab: string;
    setCurrentTab: (tab: string) => void;
    setSelectedTheme: (theme: OfficialTheme | null) => void;
    modal: NiceModalHandler<Record<string, unknown>>;
    themes: Theme[];
    setPreviewMode: (mode: string) => void;
    previewMode: string;
}

interface ThemeModalContentProps {
    onSelectTheme: (theme: OfficialTheme | null) => void;
    currentTab: string;
    themes: Theme[];
}

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
                setUploadConfig({enabled: false, error: error || "Your current plan doesn't support uploading custom themes."});
            } else {
                setUploadConfig({enabled: true});
            }
        };
        checkUploadLimit();
    }, [checkThemeLimitError, isThemeLimited]);

    const onClose = () => {
        updateRoute('/');
    };

    const confirmOverwrite = useCallback(async (file: File, themeFileName: string) => {
        setUploading(true);
        const index = themes.findIndex(t => t.name === themeFileName);
        if (index !== -1) {
            themes.splice(index, 1);
        }
        await handleThemeUpload({file, onActivate: onClose});
        setUploading(false);
        setCurrentTab('installed');
    }, [themes, handleThemeUpload, onClose, setCurrentTab]);

    const onThemeUpload = async (file: File) => {
        const themeFileName = file?.name.replace(/\.zip$/, '');
        const existingThemeNames = themes.map(t => t.name);
        if (isDefaultOrLegacyTheme({name: themeFileName})) {
            NiceModal.show(ConfirmationModal, {
                title: 'Upload failed',
                cancelLabel: 'Cancel',
                okLabel: '',
                prompt: (
                    <>
                        <p>The default <strong>{themeFileName}</strong> theme cannot be overwritten.</p>
                        <p>Rename your zip file and try again.</p>
                    </>
                ),
                onOk: (confirmModal) => confirmModal?.remove()
            });
        } else if (existingThemeNames.includes(themeFileName)) {
            NiceModal.show(ConfirmationModal, {
                title: 'Overwrite theme',
                prompt: (
                    <>
                        The theme <strong>{themeFileName}</strong> already exists.
                        Do you want to overwrite it?
                    </>
                ),
                okLabel: 'Overwrite',
                cancelLabel: 'Cancel',
                okRunningLabel: 'Overwriting...',
                okColor: 'red',
                onOk: (confirmModal) => {
                    confirmModal?.remove();
                    confirmOverwrite(file, themeFileName);
                }
            });
        } else {
            setCurrentTab('installed');
            await handleThemeUpload({file, onActivate: onClose});
        }
    };

    const handleThemeUpload = async ({
        file,
        onActivate
    }: {
        file: File;
        onActivate?: () => void;
    }) => {
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
                    handleUpload();
                }
            });
            return;
        }

        if (!data) return;

        const uploadedTheme = data.themes[0];
        const {title, prompt} = buildUploadPrompt(uploadedTheme);
        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate
        });
    };

    const buildUploadPrompt = (theme: Theme) => {
        let title = 'Upload successful';
        let prompt = (
            <>
                <strong>{theme.name}</strong> uploaded
            </>
        );

        if (!theme.active) {
            prompt = (
                <>
                    {prompt}{' '}
                    Do you want to activate it now?
                </>
            );
        }

        if (theme.errors?.length || theme.warnings?.length) {
            const hasErrors = !!theme.errors?.length;
            title = `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`;
            prompt = (
                <>
                    The theme <strong>&quot;{theme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.
                </>
            );
            if (!theme.active) {
                prompt = (
                    <>
                        {prompt}
                        You are still able to activate and use the theme but it is recommended to fix these {hasErrors ? 'errors' : 'warnings'} before you do so.
                    </>
                );
            }
        }

        return {title, prompt};
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

    const handleUpload = () => {
        if (!uploadConfig) return;
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

    const right = (
        <div className='flex items-center gap-14'>
            <div className='flex items-center gap-3'>
                <Button label='Close' onClick={() => {
                    modal.remove();
                    onClose();
                }} />
                <Button color='black' label='Upload theme' loading={isUploading} onClick={handleUpload} />
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
        default:
            return null;
    }
};

type ChangeThemeModalProps = {
    source?: string | null;
    themeRef?: string | null;
};

const ChangeThemeModal: React.FC<ChangeThemeModalProps> = ({source, themeRef}) => {
    const [currentTab, setCurrentTab] = useState('official');
    const [selectedTheme, setSelectedTheme] = useState<OfficialTheme | null>(null);
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

    const onSelectTheme = (theme: OfficialTheme | null) => {
        setSelectedTheme(theme);
    };

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        const handleUrlInstallation = async () => {
            if (!source || !themeRef || installedFromMarketplace || !isMounted) return;

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
                <>
                    By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.
                    {willOverwrite && (
                        <>
                            <br />
                            <br />
                            This will overwrite your existing version of <strong>{themeName}</strong>
                            {themeToOverwrite?.active ? ' which is your active theme' : ''}. All custom changes will be lost.
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
                    setInstalledFromMarketplace(true);
                    if (willOverwrite && themes) {
                        themes.splice(index, 1);
                    }
                    try {
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
                    } catch (e) {
                        handleError(e);
                    }
                }
            });
        };
        handleUrlInstallation();
    }, [source, themeRef, installedFromMarketplace, isMounted, themes, checkThemeLimitError, installTheme, activateTheme, handleError, modal, updateRoute]);

    if (!themes) return null;

    let installedTheme: Theme | InstalledTheme | undefined;
    let onInstall: (() => Promise<void>) | undefined;

    if (selectedTheme) {
        installedTheme = themes.find(t => t.name.toLowerCase() === selectedTheme.name.toLowerCase());

        const performInstallation = async () => {
            if (isDefaultOrLegacyTheme(selectedTheme)) {
                NiceModal.show(ThemeInstalledModal, {
                    title: 'Activate theme',
                    prompt: <>By clicking below, <strong>{selectedTheme.name}</strong> will automatically be activated as the theme for your site.</>,
                    installedTheme: selectedTheme,
                    onActivate: () => updateRoute('')
                });
                return;
            }

            setInstalling(true);
            let data: ThemesInstallResponseType | undefined;
            try {
                data = await installTheme(selectedTheme.ref);
            } catch (e) {
                handleError(e);
            } finally {
                setInstalling(false);
            }

            if (!data) return;

            const newlyInstalled = data.themes[0];
            const {title, prompt} = buildInstallPrompt(newlyInstalled);
            installedTheme = newlyInstalled;

            NiceModal.show(ThemeInstalledModal, {
                title,
                prompt,
                installedTheme: newlyInstalled,
                onActivate: () => updateRoute('')
            });
        };

        onInstall = async () => {
            const limitError = await checkThemeLimitError(selectedTheme.name);
            if (limitError) {
                NiceModal.show(LimitModal, {
                    prompt: limitError,
                    onOk: () => updateRoute({route: '/pro', isExternal: true})
                });
                return;
            }

            if (installedTheme && !isDefaultOrLegacyTheme(selectedTheme)) {
                await new Promise<void>((resolve) => {
                    NiceModal.show(ConfirmationModal, {
                        title: 'Overwrite theme',
                        prompt: (
                            <>
                                This will overwrite your existing version of {selectedTheme.name}
                                {installedTheme?.active ? ', which is your active theme' : ''}. All custom changes will be lost.
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
            } else {
                await performInstallation();
            }
        };
    }

    const buildInstallPrompt = (theme: Theme) => {
        let title = 'Success';
        let prompt = <></>;

        if (theme.errors?.length || theme.warnings?.length) {
            const hasErrors = !!theme.errors?.length;
            title = `Installed with ${hasErrors ? 'errors' : 'warnings'}`;
            prompt = (
                <>
                    The theme <strong>&quot;{theme.name}&quot;</strong> was installed successfully but we detected some {hasErrors ? 'errors' : 'warnings'}.
                </>
            );
            if (!theme.active) {
                prompt = (
                    <>
                        {prompt}
                        You are still able to activate and use the theme but it is recommended to contact the theme developer to fix these {hasErrors ? 'errors' : 'warnings'} before you do so.
                    </>
                );
            }
        } else {
            prompt = (
                <>
                    <strong>{theme.name}</strong> has been successfully installed.
                </>
            );
            if (!theme.active) {
                prompt = (
                    <>
                        {prompt}{' '}
                        Do you want to activate it now?
                    </>
                );
            }
        }

        return {title, prompt};
    };

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