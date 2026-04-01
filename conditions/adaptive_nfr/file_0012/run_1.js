```typescript
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

    /** Check if theme is a default or legacy theme */
    const isProtectedTheme = (themeFileName: string): boolean => {
        return isDefaultOrLegacyTheme({name: themeFileName});
    };

    /** Check if theme already exists in installed themes */
    const themeExists = (themeFileName: string, existingNames: string[]): boolean => {
        return existingNames.includes(themeFileName);
    };

    const showProtectedThemeError = (themeFileName: string) => {
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

        if (isProtectedTheme(themeFileName)) {
            showProtectedThemeError(themeFileName);
            return;
        }

        if (themeExists(themeFileName, existingThemeNames)) {
            showOverwriteConfirmation(themeFileName, async () => {
                const index = existingThemeNames.indexOf(themeFileName);
                themes.splice(index, 1);
                await handleThemeUpload({file, onActivate: onClose});
            });
            return;
        }

        setCurrentTab('installed');
        handleThemeUpload({file, onActivate: onClose});
    };

    /** Build error message for invalid theme */
    const buildInvalidThemeMessage = (): {title: string; prompt: JSX.Element} => {
        return {
            title: 'Invalid Theme',
            prompt: <>This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme</>
        };
    };

    /** Build success message for uploaded theme */
    const buildUploadSuccessMessage = (uploadedTheme: Theme): {title: string; prompt: JSX.Element} => {
        const hasErrors = uploadedTheme?.errors?.length;
        const hasIssues = uploadedTheme?.errors?.length || uploadedTheme.warnings?.length;

        if (hasIssues) {
            return {
                title: `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`,
                prompt: buildThemeIssuePrompt(uploadedTheme, hasErrors)
            };
        }

        return {
            title: 'Upload successful',
            prompt: buildBasicUploadPrompt(uploadedTheme)
        };
    };

    /** Build prompt for theme with issues */
    const buildThemeIssuePrompt = (uploadedTheme: Theme, hasErrors: boolean): JSX.Element => {
        const issueType = hasErrors ? 'errors' : 'warnings';
        const basePrompt = <>
            The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {issueType}.
        </>;

        if (uploadedTheme.active) {
            return basePrompt;
        }

        return <>
            {basePrompt}
            You are still able to activate and use the theme but it is recommended to fix these {issueType} before you do so.
        </>;
    };

    /** Build basic upload success prompt */
    const buildBasicUploadPrompt = (uploadedTheme: Theme): JSX.Element => {
        const basePrompt = <>
            <strong>{uploadedTheme.name}</strong> uploaded
        </>;

        if (uploadedTheme.active) {
            return basePrompt;
        }

        return <>
            {basePrompt}{' '}
            Do you want to activate it now?
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
            const {title, prompt} = buildInvalidThemeMessage();
            NiceModal.show(InvalidThemeModal, {
                title,
                prompt,
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
        const {title, prompt} = buildUploadSuccessMessage(uploadedTheme);

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
        return Boolean(source && themeRef && !installedFromMarketplace && isMounted);
    };

    /** Extract theme name from ref */
    const getThemeNameFromRef = (ref: string): string => {
        return ref.split('/')[1];
    };

    /** Find theme index in existing themes */
    const findThemeIndex = (themeName: string, existingNames: string[]): number => {
        return existingNames.indexOf(themeName.toLowerCase());
    };

    /** Check if theme will overwrite existing */
    const willThemeOverwrite = (themeName: string, existingNames: string[]): boolean => {
        return existingNames.includes(themeName.toLowerCase());
    };

    /** Build overwrite warning message */
    const buildOverwriteWarning = (themeName: string, themeToOverwrite: Theme | undefined): JSX.Element => {
        if (!themeToOverwrite) {
            return <></>;
        }

        return <>
            <br/>
            <br/>
            This will overwrite your existing version of <strong>{themeName}</strong>{themeToOverwrite?.active ? ' which is your active theme' : ''}. All custom changes will be lost.
        </>;
    };

    /** Build installation prompt */
    const buildInstallationPrompt = (themeName: string, willOverwrite: boolean, themeToOverwrite: Theme | undefined): JSX.Element => {
        const basePrompt = <>By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.</>;

        if (!willOverwrite) {
            return basePrompt;
        }

        return <>
            {basePrompt}
            {buildOverwriteWarning(themeName, themeToOverwrite)}
        </>;
    };

    /** Handle theme installation from marketplace */
    const performMarketplaceInstallation = async (themeName: string, willOverwrite: boolean, index: number) => {
        let data: ThemesInstallResponseType | undefined;
        setInstalledFromMarketplace(true);

        try {
            if (willOverwrite && themes) {
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

            const existingThemeNames = themes?.map(t => t.name) || [];
            const willOverwrite = willThemeOverwrite(themeName, existingThemeNames);
            const index = findThemeIndex(themeName, existingThemeNames);
            const themeToOverwrite = themes?.[index];

            const prompt = buildInstallationPrompt(themeName, willOverwrite, themeToOverwrite);

            NiceModal.show(ConfirmationModal, {
                title: 'Install Theme',
                prompt,
                okLabel: 'Install',
                cancelLabel: 'Cancel',
                okRunningLabel: 'Installing...',
                okColor: 'black',
                onOk: async (confirmModal) => {
                    await performMarketplaceInstallation(themeName, willOverwrite, index);
                    confirmModal?.remove();
                }
            });
        };

        handleUrlInstallation();
    }, [themeRef, source, installTheme, handleError, activateTheme, updateRoute, themes, installedFromMarketplace, checkThemeLimitError, modal, isMounted]);

    if (!themes) {
        return;
    }

    let installedTheme: Theme|InstalledTheme|undefined;
    let onInstall;

    if (selectedTheme) {
        installedTheme = themes.find(theme => theme.name.toLowerCase() === selectedTheme!.name.toLowerCase());

        /** Check if theme is already installed */
        const isThemeInstalled = (): boolean => {
            return Boolean(installedTheme && !isDefaultOrLegacyTheme(selectedTheme));
        };

        /** Show limit error modal */
        const showLimitError = async (limitError: string) => {
            NiceModal.show(LimitModal, {
                prompt: limitError,
                onOk: () => updateRoute({route: '/pro', isExternal: true})
            });
        };

        /** Show overwrite confirmation */
        const showOverwriteConfirmationModal = (onConfirm: () => Promise<void>): Promise<void> => {
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
                    onOk: async (confirmModal) => {
                        confirmModal?.remove();
                        await onConfirm();
                        resolve();
                    }
                });
            });
        };

        /** Build success message for installation */
        const buildInstallSuccessMessage = (newlyInstalledTheme: Theme): {title: string; prompt: JSX.Element} => {
            const hasErrors = newlyInstalledTheme.errors?.length;
            const hasIssues = newlyInstalledTheme.errors?.length || newlyInstalledTheme.warnings?.length;

            if (hasIssues) {
                return {
                    title: `Installed with ${hasErrors ? 'errors' : 'warnings'}`,
                    prompt: buildInstallIssuePrompt(newlyInstalledTheme, hasErrors)
                };
            }

            return {
                title: 'Success',
                prompt: buildBasicInstallPrompt(newlyInstalledTheme)
            };
        };

        /** Build prompt for installation with issues */
        const buildInstallIssuePrompt = (newlyInstalledTheme: Theme, hasErrors: boolean): JSX.Element => {
            const issueType = hasErrors ? 'errors' : 'warnings';
            const basePrompt = <>
                The theme <strong>&quot;{newlyInstalledTheme.name}&quot;</strong> was installed successfully but we detected some {issueType}.
            </>;

            if (newlyInstalledTheme.active) {
                return basePrompt;
            }

            return <>
                {basePrompt}
                You are still able to activate and use the theme but it is recommended to contact the theme developer fix these {issueType} before you do so.
            </>;
        };

        /** Build basic installation success prompt */
        const buildBasicInstallPrompt = (newlyInstalledTheme: Theme): JSX.Element => {
            const basePrompt = <>
                <strong>{newlyInstalledTheme.name}</strong> has been successfully installed.
            </>;

            if (newlyInstalledTheme.active) {
                return basePrompt;
            }

            return <>
                {basePrompt}{' '}
                Do you want to activate it now?
            </>;
        };

        const performInstallation = async () => {
            if (isDefaultOrLegacyTheme(selectedTheme)) {
                NiceModal.show(ThemeInstalledModal, {
                    title: 'Activate theme',
                    prompt: <>By clicking below, <strong>{selectedTheme.name}</strong> will automatically be activated as the theme for your site.</>,
                    installedTheme: selectedTheme as unknown as InstalledTheme,
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
            const {title, prompt} = buildInstallSuccessMessage(newlyInstalledTheme);
            installedTheme = newlyInstalledTheme;

            NiceModal.show(ThemeInstalledModal, {
                title,
                prompt,
                installedTheme: installedTheme!,
                onActivate: () => {
                    updateRoute('');
                }
            });
        };

        onInstall = async () => {
            const limitError = await checkThemeLimitError(selectedTheme.name);

            if (limitError) {
                await showLimitError(limitError);
                return;
            }

            if (isThemeInstalled()) {
                await showOverwriteConfirmationModal(performInstallation);
                return;
            }

            return performInstallation();
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
```