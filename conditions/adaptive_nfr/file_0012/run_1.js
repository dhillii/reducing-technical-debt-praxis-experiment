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

interface UploadConfig {
    enabled: boolean;
    error?: string;
}

interface ThemeInstallationState {
    isInstalling: boolean;
    installedFromMarketplace: boolean;
    isMounted: boolean;
}

const TABS = [
    {id: 'official', title: 'Official themes'},
    {id: 'installed', title: 'Installed'}
] as const;

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

const useUploadConfig = (isThemeLimited: boolean, checkThemeLimitError: (name: string) => Promise<string | null>) => {
    const [uploadConfig, setUploadConfig] = useState<UploadConfig | undefined>();

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

    return uploadConfig;
};

const useThemeUploadHandler = (
    uploadTheme: (file: File) => Promise<ThemesInstallResponseType>,
    handleError: (error: unknown) => void,
    setCurrentTab: (tab: string) => void,
    onClose: () => void,
    modal: NiceModalHandler<Record<string, unknown>>
) => {
    const [isUploading, setUploading] = useState(false);

    const showInvalidThemeModal = (fatalErrors: FatalErrors) => {
        NiceModal.show(InvalidThemeModal, {
            title: 'Invalid Theme',
            prompt: <>This theme is invalid and cannot be activated. Fix the following errors and re-upload the theme</>,
            fatalErrors,
            onRetry: () => {
                modal?.remove();
                handleThemeUpload({file: new File([], '')});
            }
        });
    };

    const showThemeInstalledModal = (uploadedTheme: Theme, hasErrors: boolean, hasWarnings: boolean) => {
        const title = uploadedTheme.errors?.length || uploadedTheme.warnings?.length
            ? `Upload successful with ${uploadedTheme.errors?.length ? 'errors' : 'warnings'}`
            : 'Upload successful';

        let prompt = <><strong>{uploadedTheme.name}</strong> uploaded</>;

        if (uploadedTheme.errors?.length || uploadedTheme.warnings?.length) {
            const issueType = uploadedTheme.errors?.length ? 'errors' : 'warnings';
            prompt = <>
                The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {issueType}.
            </>;

            if (!uploadedTheme.active) {
                prompt = <>
                    {prompt}
                    You are still able to activate and use the theme but it is recommended to fix these {issueType} before you do so.
                </>;
            }
        } else if (!uploadedTheme.active) {
            prompt = <>
                {prompt}{' '}
                Do you want to activate it now?
            </>;
        }

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate: onClose
        });
    };

    const handleThemeUpload = async ({file, onActivate}: {file: File; onActivate?: () => void}) => {
        let data: ThemesInstallResponseType | undefined;
        let fatalErrors: FatalErrors | null = null;

        try {
            setUploading(true);
            data = await uploadTheme(file);
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
            showInvalidThemeModal(fatalErrors);
            return;
        }

        if (!data) {
            return;
        }

        const uploadedTheme = data.themes[0];
        showThemeInstalledModal(uploadedTheme, !!uploadedTheme.errors?.length, !!uploadedTheme.warnings?.length);
    };

    return {isUploading, handleThemeUpload};
};

const ThemeToolbar: React.FC<ThemeToolbarProps> = ({
    currentTab,
    setCurrentTab,
    themes,
    modal
}) => {
    const {updateRoute} = useRouting();
    const {mutateAsync: uploadTheme} = useUploadTheme();
    const {checkThemeLimitError, isThemeLimited} = useCheckThemeLimitError();
    const handleError = useHandleError();

    const uploadConfig = useUploadConfig(isThemeLimited, checkThemeLimitError);
    const {isUploading, handleThemeUpload} = useThemeUploadHandler(
        uploadTheme,
        handleError,
        setCurrentTab,
        () => updateRoute('/'),
        modal
    );

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
                onOk: async (confirmModal) => {
                    confirmModal?.remove();
                }
            });
            return;
        }

        if (existingThemeNames.includes(themeFileName)) {
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
                    const index = existingThemeNames.indexOf(themeFileName);
                    themes.splice(index, 1);
                    await handleThemeUpload({file});
                    setCurrentTab('installed');
                    confirmModal?.remove();
                }
            });
        } else {
            setCurrentTab('installed');
            handleThemeUpload({file});
        }
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

    const left = (
        <div className='hidden md:!visible md:!block'>
            <TabView
                border={false}
                selectedTab={currentTab}
                tabs={TABS}
                onTabChange={setCurrentTab}
            />
        </div>
    );

    const right = (
        <div className='flex items-center gap-14'>
            <div className='flex items-center gap-3'>
                <Button label='Close' onClick={() => {
                    modal.remove();
                    updateRoute('/');
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
                    tabs={TABS}
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

const useUrlThemeInstallation = (
    source: string | null | undefined,
    themeRef: string | null | undefined,
    themes: Theme[] | undefined,
    installTheme: (ref: string) => Promise<ThemesInstallResponseType>,
    activateTheme: (name: string) => Promise<void>,
    checkThemeLimitError: (name: string) => Promise<string | null>,
    handleError: (error: unknown) => void,
    updateRoute: (route: string) => void,
    modal: NiceModalHandler<Record<string, unknown>>,
    isMounted: boolean,
    installedFromMarketplace: boolean,
    setInstalledFromMarketplace: (value: boolean) => void
) => {
    useEffect(() => {
        const handleUrlInstallation = async () => {
            if (!source || !themeRef || installedFromMarketplace || !isMounted) {
                return;
            }

            const themeName = themeRef.split('/')[1];
            const limitError = await checkThemeLimitError(themeName);

            if (limitError) {
                modal.remove();
                return;
            }

            const existingThemeNames = themes?.map(t => t.name) || [];
            const willOverwrite = existingThemeNames.includes(themeName.toLowerCase());
            const index = existingThemeNames.indexOf(themeName.toLowerCase());
            const themeToOverwrite = themes?.[index];

            let prompt = <>By clicking below, <strong>{themeName}</strong> will automatically be activated as the theme for your site.
                {willOverwrite && (
                    <>
                        <br/>
                        <br/>
                        This will overwrite your existing version of <strong>{themeName}</strong>{themeToOverwrite?.active ? ' which is your active theme' : ''}. All custom changes will be lost.
                    </>
                )}
            </>;

            NiceModal.show(ConfirmationModal, {
                title: 'Install Theme',
                prompt,
                okLabel: 'Install',
                cancelLabel: 'Cancel',
                okRunningLabel: 'Installing...',
                okColor: 'black',
                onOk: async (confirmModal) => {
                    setInstalledFromMarketplace(true);
                    try {
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
                    } catch (e) {
                        handleError(e);
                    }
                }
            });
        };

        handleUrlInstallation();
    }, [themeRef, source, installTheme, handleError, activateTheme, updateRoute, themes, installedFromMarketplace, checkThemeLimitError, modal, isMounted, setInstalledFromMarketplace]);
};

const useThemeInstallation = (
    selectedTheme: OfficialTheme | null,
    themes: Theme[] | undefined,
    installTheme: (ref: string) => Promise<ThemesInstallResponseType>,
    activateTheme: (name: string) => Promise<void>,
    checkThemeLimitError: (name: string) => Promise<string | null>,
    handleError: (error: unknown) => void,
    updateRoute: (route: string) => void
) => {
    const [isInstalling, setInstalling] = useState(false);

    const performInstallation = async (): Promise<Theme | InstalledTheme | undefined> => {
        if (!selectedTheme) return undefined;

        if (isDefaultOrLegacyTheme(selectedTheme)) {