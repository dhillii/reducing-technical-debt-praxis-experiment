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

/** Checks if theme is a default or legacy theme */
const isDefaultOrLegacyThemeName = (themeFileName: string): boolean => {
    return isDefaultOrLegacyTheme({name: themeFileName});
};

/** Checks if theme already exists in the installed themes list */
const themeAlreadyExists = (themeFileName: string, existingThemeNames: string[]): boolean => {
    return existingThemeNames.includes(themeFileName);
};

/** Extracts theme file name from uploaded file */
const extractThemeFileName = (file: File): string => {
    return file?.name.replace(/\.zip$/, '');
};

/** Shows confirmation modal for default/legacy theme upload attempt */
const showDefaultThemeError = (themeFileName: string): void => {
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

/** Shows confirmation modal for theme overwrite */
const showOverwriteConfirmation = (
    themeFileName: string,
    onConfirm: (confirmModal: any) => Promise<void>
): void => {
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
        onOk: onConfirm
    });
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
                prompt: <>This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme</>,
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
        const hasErrors = uploadedTheme?.errors?.length;
        const hasIssues = uploadedTheme?.errors?.length || uploadedTheme.warnings?.length;

        let title = 'Upload successful';
        let prompt = <>
            <strong>{uploadedTheme.name}</strong> uploaded
        </>;

        if (!uploadedTheme.active) {
            prompt = <>
                {prompt}{' '}
                Do you want to activate it now?
            </>;
        }

        if (hasIssues) {
            title = `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`;
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

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate: onActivate
        });
    };

    const onThemeUpload = async (file: File) => {
        const themeFileName = extractThemeFileName(file);
        const existingThemeNames = themes.map(t => t.name);

        if (isDefaultOrLegacyThemeName(themeFileName)) {
            showDefaultThemeError(themeFileName);
            return;
        }

        if (themeAlreadyExists(themeFileName, existingThemeNames)) {
            showOverwriteConfirmation(themeFileName, async (confirmModal) => {
                setUploading(true);
                const index = existingThemeNames.indexOf(themeFileName);
                themes.splice(index, 1);
                await handleThemeUpload({file, onActivate: onClose});
                setUploading(false);
                setCurrentTab('installed');
                confirmModal?.remove();
            });
            return;
        }

        setCurrentTab('installed');
        handleThemeUpload({file, onActivate: onClose});
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

/** Checks if URL installation should be triggered */
const shouldHandleUrlInstallation = (
    source: string | null | undefined,
    themeRef: string | null | undefined,
    installedFromMarketplace: boolean,
    isMounted: boolean
): boolean => {
    return !!(source && themeRef && !installedFromMarketplace && isMounted);
};

/** Extracts theme name from theme reference */
const extractThemeNameFromRef = (themeRef: string): string => {
    return themeRef.split('/')[1];
};

/** Finds theme in list by name (case-insensitive) */
const findThemeByName = (themeName: string, themes: Theme[] | undefined): Theme | undefined => {
    return themes?.find(t => t.name.toLowerCase() === themeName.toLowerCase());
};

/** Checks if theme will overwrite existing theme */
const willThemeOverwrite = (themeName: string, themes: Theme[] | undefined): boolean => {
    return !!findThemeByName(themeName, themes);
};

/** Gets index of theme in list by name (case-insensitive) */
const getThemeIndex = (themeName: string, themes: Theme[] | undefined): number => {
    return themes?.findIndex(t => t.name.toLowerCase() === themeName.toLowerCase()) ?? -1;
};

/** Builds prompt for marketplace theme installation */
const buildMarketplaceInstallPrompt = (
    themeName: string,
    willOverwrite: boolean,
    themeToOverwrite: Theme | undefined
): React.ReactNode => {
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

/** Shows marketplace theme installation confirmation */
const showMarketplaceInstallConfirmation = (
    themeName: string,
    willOverwrite: boolean,
    themeToOverwrite: Theme | undefined,
    onConfirm: (confirmModal: any) => Promise<void>
): void => {
    NiceModal.show(ConfirmationModal, {
        title: 'Install Theme',
        prompt: buildMarketplaceInstallPrompt(themeName, willOverwrite, themeToOverwrite),
        okLabel: 'Install',
        cancelLabel: 'Cancel',
        okRunningLabel: 'Installing...',
        okColor: 'black',
        onOk: onConfirm
    });
};

/** Checks if theme has errors or warnings */
const themeHasIssues = (theme: any): boolean => {
    return !!(theme?.errors?.length || theme?.warnings?.length);
};

/** Checks if theme has errors (vs warnings) */
const themeHasErrors = (theme: any): boolean => {
    return !!theme?.errors?.length;
};

/** Builds prompt for installed theme with issues */
const buildInstalledThemeIssuePrompt = (theme: any, isActive: boolean): React.ReactNode => {
    const hasErrors = themeHasErrors(theme);
    const issueType = hasErrors ? 'errors' : 'warnings';

    let prompt = <>
        The theme <strong>&quot;{theme.name}&quot;</strong> was installed successfully but we detected some {issueType}.
    </>;

    if (!isActive) {
        prompt = <>
            {prompt}
            You are still able to activate and use the theme but it is recommended to contact the theme developer fix these {issueType} before you do so.
        </>;
    }

    return prompt;
};

/** Builds title for installed theme result */
const buildInstalledThemeTitle = (theme: any): string => {
    if (!themeHasIssues(theme)) {
        return 'Success';
    }

    const hasErrors = themeHasErrors(theme);
    return `Installed with ${hasErrors ? 'errors' : 'warnings'}`;
};

/** Builds prompt for newly installed theme */
const buildNewlyInstalledPrompt = (theme: any): React.ReactNode => {
    let prompt = <>
        <strong>{theme.name}</strong> has been successfully installed.
    </>;

    if (!theme.active) {
        prompt = <>
            {prompt}{' '}
            Do you want to activate it now?
        </>;
    }

    if (themeHasIssues(theme)) {
        return buildInstalledThemeIssuePrompt(theme, theme.active);
    }

    return prompt;
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

    useEffect(() => {
        const handleUrlInstallation = async () => {
            if (!shouldHandleUrlInstallation(source, themeRef, installedFromMarketplace, isMounted)) {
                return;
            }

            const themeName = extractThemeNameFromRef(themeRef!);
            const limitError = await checkThemeLimitError(themeName);

            if (limitError) {
                modal.remove();
                return;
            }

            const willOverwrite = willThemeOverwrite(themeName, themes);
            const index = getThemeIndex(themeName, themes);
            const themeToOverwrite = themes?.[index];

            showMarketplaceInstallConfirmation(themeName, willOverwrite, themeToOverwrite, async (confirmModal) => {
                let data: ThemesInstallResponseType | undefined;
                setInstalledFromMarketplace(true);

                try {
                    if (willOverwrite && themes) {
                        themes.splice(index, 1);
                    }
                    data = await installTheme(themeRef!);

                    if (!data?.themes[0]) {
                        return;
                    }

                    await activateTheme(data.themes[0].name);
                    showToast({
                        title: 'Theme activated',
                        type: 'success',
                        message: <div><span className='capitalize'>{data.themes[0].name}</span> is now your active theme</div>
                    });
                    confirmModal?.remove();
                    updateRoute('');
                } catch (e) {
                    handleError(e);
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
        installedTheme = findThemeByName(selectedTheme.name, themes);

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
                            await performInstallation();
                            resolve();
                        }
                    });
                });
            }

            return performInstallation();
        };

        const performInstallation = async () => {
            if (isDefaultOrLegacyTheme(selectedTheme)) {
                NiceModal.show(ThemeInstalledModal, {
                    title: 'Activate theme',
                    prompt: <>By clicking below, <strong>{selectedTheme.name}</strong> will automatically be activated as the theme for your site.</>,
                    installedTheme: installedTheme!,
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
            installedTheme = newlyInstalledTheme;

            NiceModal.show(ThemeInstalledModal, {
                title: buildInstalledThemeTitle(newlyInstalledTheme),
                prompt: buildNewlyInstalledPrompt(newlyInstalledTheme),
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
```