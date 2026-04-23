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

    /** Check if theme is default or legacy */
    const isDefaultOrLegacyThemeName = (name: string): boolean => {
        return isDefaultOrLegacyTheme({name});
    };

    /** Check if theme already exists in installed themes */
    const themeExists = (name: string, existingNames: string[]): boolean => {
        return existingNames.includes(name);
    };

    const showDefaultThemeError = (themeFileName: string) => {
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
            onOk: async (confirmModal) => {
                confirmModal?.remove();
            }
        });
    };

    const showOverwriteConfirmation = (themeFileName: string, onConfirm: () => Promise<void>) => {
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
            onOk: async (confirmModal) => {
                setUploading(true);
                const existingThemeNames = themes.map(t => t.name);
                const index = existingThemeNames.indexOf(themeFileName);
                themes.splice(index, 1);
                await onConfirm();
                setUploading(false);
                setCurrentTab('installed');
                confirmModal?.remove();
            }
        });
    };

    const onThemeUpload = async (file: File) => {
        const themeFileName = file?.name.replace(/\.zip$/, '');
        const existingThemeNames = themes.map(t => t.name);

        if (isDefaultOrLegacyThemeName(themeFileName)) {
            showDefaultThemeError(themeFileName);
            return;
        }

        if (themeExists(themeFileName, existingThemeNames)) {
            showOverwriteConfirmation(themeFileName, () => handleThemeUpload({file, onActivate: onClose}));
            return;
        }

        setCurrentTab('installed');
        handleThemeUpload({file, onActivate: onClose});
    };

    const buildInvalidThemePrompt = (): React.ReactNode => {
        return <>This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme</>;
    };

    const buildSuccessPrompt = (uploadedTheme: Theme): React.ReactNode => {
        return <>
            <strong>{uploadedTheme.name}</strong> uploaded
        </>;
    };

    const buildSuccessWithActivationPrompt = (uploadedTheme: Theme): React.ReactNode => {
        return <>
            {buildSuccessPrompt(uploadedTheme)}{' '}
            Do you want to activate it now?
        </>;
    };

    /** Check if theme has errors or warnings */
    const hasThemeIssues = (theme: Theme): boolean => {
        return !!(theme?.errors?.length || theme.warnings?.length);
    };

    /** Get issue type string */
    const getIssueType = (theme: Theme): string => {
        return theme?.errors?.length ? 'errors' : 'warnings';
    };

    const buildIssuePrompt = (uploadedTheme: Theme): React.ReactNode => {
        const issueType = getIssueType(uploadedTheme);
        return <>
            The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {issueType}.
        </>;
    };

    const buildIssueWithActivationPrompt = (uploadedTheme: Theme): React.ReactNode => {
        const issueType = getIssueType(uploadedTheme);
        return <>
            {buildIssuePrompt(uploadedTheme)}
            You are still able to activate and use the theme but it is recommended to fix these {issueType} before you do so.
        </>;
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
            NiceModal.show(InvalidThemeModal, {
                title: 'Invalid Theme',
                prompt: buildInvalidThemePrompt(),
                fatalErrors,
                onRetry: async () => {
                    modal?.remove();
                    handleUpload();
                }
            });
            return;
        }

        if (!data) {
            return;
        }

        const uploadedTheme = data.themes[0];
        const isActive = uploadedTheme.active;
        const hasIssues = hasThemeIssues(uploadedTheme);

        let title = 'Upload successful';
        let prompt: React.ReactNode = buildSuccessPrompt(uploadedTheme);

        if (!isActive) {
            prompt = buildSuccessWithActivationPrompt(uploadedTheme);
        }

        if (hasIssues) {
            const issueType = getIssueType(uploadedTheme);
            title = `Upload successful with ${issueType}`;
            prompt = buildIssuePrompt(uploadedTheme);

            if (!isActive) {
                prompt = buildIssueWithActivationPrompt(uploadedTheme);
            }
        }

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate: onActivate
        });
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
            return;
        }

        NiceModal.show(LimitModal, {
            title: 'Upgrade to enable custom themes',
            prompt: uploadConfig.error || <>Your current plan only supports official themes. You can install them from the <a href="https://ghost.org/marketplace/">Ghost theme marketplace</a>.</>,
            onOk: () => updateRoute({route: '/pro', isExternal: true})
        });
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
};

const ThemeModalContent: React.FC<ThemeModalContentProps> = ({
    currentTab,
    onSelectTheme,
    themes
}) => {
    switch (currentTab) {
    case 'official':
        return (
            <OfficialThemes onSelectTheme={onSelectTheme} />
        );
    case 'installed':
        return (
            <AdvancedThemeSettings themes={themes} />
        );
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

    const onSelectTheme = (theme: OfficialTheme|null) => {
        setSelectedTheme(theme);
    };

    useEffect(() => {
        setIsMounted(true);
    }, []);

    /** Check if URL installation should be triggered */
    const shouldHandleUrlInstallation = (): boolean => {
        return !!(source && themeRef && !installedFromMarketplace && isMounted);
    };

    /** Get theme name from ref */
    const getThemeNameFromRef = (ref: string): string => {
        return ref.split('/')[1];
    };

    /** Find theme index by name */
    const findThemeIndex = (name: string, themeList: Theme[] | undefined): number => {
        const existingNames = themeList?.map(t => t.name.toLowerCase()) || [];
        return existingNames.indexOf(name.toLowerCase());
    };

    /** Check if theme will be overwritten */
    const willThemeBeOverwritten = (name: string, themeList: Theme[] | undefined): boolean => {
        const index = findThemeIndex(name, themeList);
        return index !== -1;
    };

    /** Get theme to be overwritten */
    const getThemeToOverwrite = (name: string, themeList: Theme[] | undefined): Theme | undefined => {
        const index = findThemeIndex(name, themeList);
        return index !== -1 ? themeList?.[index] : undefined;
    };

    const buildUrlInstallPrompt = (themeName: string, willOverwrite: boolean, themeToOverwrite: Theme | undefined): React.ReactNode => {
        const basePrompt = <>By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.</>;

        if (!willOverwrite) {
            return basePrompt;
        }

        return <>
            {basePrompt}
            <br/>
            <br/>
            This will overwrite your existing version of <strong>{themeName}</strong>{themeToOverwrite?.active ? ' which is your active theme' : ''}. All custom changes will be lost.
        </>;
    };

    const performUrlInstallation = async (themeName: string, confirmModal: any) => {
        let data: ThemesInstallResponseType | undefined;
        setInstalledFromMarketplace(true);

        try {
            const willOverwrite = willThemeBeOverwritten(themeName, themes);
            if (willOverwrite && themes) {
                const index = findThemeIndex(themeName, themes);
                themes.splice(index, 1);
            }

            data = await installTheme(themeRef!);

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
    };

    useEffect(() => {
        const handleUrlInstallation = async () => {
            if (!shouldHandleUrlInstallation()) {
                return;
            }

            const themeName = getThemeNameFromRef(themeRef!);
            const limitError = await checkThemeLimitError(themeName);

            if (limitError) {
                modal.remove();
                return;
            }

            const willOverwrite = willThemeBeOverwritten(themeName, themes);
            const themeToOverwrite = getThemeToOverwrite(themeName, themes);

            NiceModal.show(ConfirmationModal, {
                title: 'Install Theme',
                prompt: buildUrlInstallPrompt(themeName, willOverwrite, themeToOverwrite),
                okLabel: 'Install',
                cancelLabel: 'Cancel',
                okRunningLabel: 'Installing...',
                okColor: 'black',
                onOk: async (confirmModal) => {
                    await performUrlInstallation(themeName, confirmModal);
                }
            });
        };

        handleUrlInstallation();
    }, [themeRef, source, installTheme, handleError, activateTheme, updateRoute, themes, installedFromMarketplace, checkThemeLimitError, modal, isMounted]);

    if (!themes) {
        return;
    }

    /** Check if selected theme is already installed */
    const isThemeInstalled = (theme: OfficialTheme): boolean => {
        return !!themes.find(t => t.name.toLowerCase() === theme.name.toLowerCase());
    };

    /** Check if theme should show overwrite confirmation */
    const shouldShowOverwriteConfirmation = (theme: OfficialTheme, installed: Theme | InstalledTheme | undefined): boolean => {
        return !!(installed && !isDefaultOrLegacyTheme(theme));
    };

    const buildOverwritePrompt = (theme: OfficialTheme, installed: Theme | InstalledTheme | undefined): React.ReactNode => {
        return <>
            This will overwrite your existing version of {theme.name}{installed?.active ? ', which is your active theme' : ''}. All custom changes will be lost.
        </>;
    };

    /** Check if newly installed theme has issues */
    const hasInstalledThemeIssues = (theme: Theme): boolean => {
        return !!(theme.errors?.length || theme.warnings?.length);
    };

    /** Get issue type for installed theme */
    const getInstalledThemeIssueType = (theme: Theme): string => {
        return theme.errors?.length ? 'errors' : 'warnings';
    };

    const buildInstalledThemePrompt = (theme: Theme): React.ReactNode => {
        return <>
            <strong>{theme.name}</strong> has been successfully installed.
        </>;
    };

    const buildInstalledThemeWithActivationPrompt = (theme: Theme): React.ReactNode => {
        return <>
            {buildInstalledThemePrompt(theme)}{' '}
            Do you want to activate it now?
        </>;
    };

    const buildInstalledThemeIssuePrompt = (theme: Theme): React.ReactNode => {
        const issueType = getInstalledThemeIssueType(theme);
        return <>
            The theme <strong>&quot;{theme.name}&quot;</strong> was installed successfully but we detected some {issueType}.
        </>;
    };

    const buildInstalledThemeIssueWithActivationPrompt = (theme: Theme): React.ReactNode => {
        const issueType = getInstalledThemeIssueType(theme);
        return <>
            {buildInstalledThemeIssuePrompt(theme)}
            You are still able to activate and use the theme but it is recommended to contact the theme developer fix these {issueType} before you do so.
        </>;
    };

    const performInstallation = async (): Promise<void> => {
        if (!selectedTheme) {
            return;
        }

        if (isDefaultOrLegacyTheme(selectedTheme)) {
            NiceModal.show(ThemeInstalledModal, {
                title: 'Activate theme',
                prompt: <>By clicking below, <strong>{selectedTheme.name}</strong> will automatically be activated as the theme for your site.</>,
                installedTheme: selectedTheme as any,
                onActivate: () => {
                    updateRoute('');
                }
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

        if (!data) {
            return;
        }

        const newlyInstalledTheme = data.themes[0];
        const isActive = newlyInstalledTheme.active;
        const hasIssues = hasInstalledThemeIssues(newlyInstalledTheme);

        let title = 'Success';
        let prompt: React.ReactNode = buildInstalledThemePrompt(newlyInstalledTheme);

        if (!isActive) {
            prompt = buildInstalledThemeWithActivationPrompt(newlyInstalledTheme);
        }

        if (hasIssues) {
            const issueType = getInstalledThemeIssueType(newlyInstalledTheme);
            title = `Installed with ${issueType}`;
            prompt = buildInstalledThemeIssuePrompt(newlyInstalledTheme);

            if (!isActive) {
                prompt = buildInstalledThemeIssueWithActivationPrompt(newlyInstalledTheme);
            }
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

    let installedTheme: Theme|InstalledTheme|undefined;
    let onInstall: (() => Promise<void>) | undefined;

    if (selectedTheme) {
        installedTheme = themes.find(theme => theme.name.toLowerCase() === selectedTheme!.name.toLowerCase());

        onInstall = async () => {
            const limitError = await checkThemeLimitError(selectedTheme.name);

            if (limitError) {
                NiceModal.show(LimitModal, {
                    prompt: limitError,
                    onOk: () => updateRoute({route: '/pro', isExternal: true})
                });
                return;
            }

            if (!shouldShowOverwriteConfirmation(selectedTheme, installedTheme)) {
                return performInstallation();
            }

            return new Promise<void>((resolve) => {
                NiceModal.show(ConfirmationModal, {
                    title: 'Overwrite theme',
                    prompt: buildOverwritePrompt(selectedTheme, installedTheme),
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