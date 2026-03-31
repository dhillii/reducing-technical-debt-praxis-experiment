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

const TabViewComponent: React.FC<{currentTab: string; onTabChange: (id: string) => void}> = ({currentTab, onTabChange}) => (
    <TabView
        border={false}
        selectedTab={currentTab}
        tabs={TABS}
        onTabChange={onTabChange}
    />
);

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
    themes: Theme[],
    uploadTheme: (file: File) => Promise<ThemesInstallResponseType>,
    handleError: (error: unknown) => void,
    setCurrentTab: (tab: string) => void,
    onClose: () => void
) => {
    const [isUploading, setUploading] = useState(false);
    const modal = useModal();

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

    const showThemeInstalledModal = (uploadedTheme: Theme) => {
        const hasErrors = uploadedTheme?.errors?.length;
        const isActive = uploadedTheme.active;

        let title = 'Upload successful';
        let prompt: React.ReactNode = <><strong>{uploadedTheme.name}</strong> uploaded</>;

        if (!isActive) {
            prompt = <>{prompt} Do you want to activate it now?</>;
        }

        if (uploadedTheme?.errors?.length || uploadedTheme.warnings?.length) {
            title = `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`;
            prompt = <>
                The theme <strong>&quot;{uploadedTheme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.
            </>;

            if (!isActive) {
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
            onActivate: onClose
        });
    };

    const handleThemeUpload = async ({file, onActivate}: {file: File; onActivate?: () => void}) => {
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
            showInvalidThemeModal(fatalErrors);
            return;
        }

        if (!data) {
            return;
        }

        showThemeInstalledModal(data.themes[0]);
    };

    return {isUploading, handleThemeUpload};
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

    const uploadConfig = useUploadConfig(isThemeLimited, checkThemeLimitError);
    const onClose = () => updateRoute('/');
    const {isUploading, handleThemeUpload} = useThemeUploadHandler(themes, uploadTheme, handleError, setCurrentTab, onClose);

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
                prompt: <>The theme <strong>{themeFileName}</strong> already exists. Do you want to overwrite it?</>,
                okLabel: 'Overwrite',
                cancelLabel: 'Cancel',
                okRunningLabel: 'Overwriting...',
                okColor: 'red',
                onOk: async (confirmModal) => {
                    const index = existingThemeNames.indexOf(themeFileName);
                    themes.splice(index, 1);
                    await handleThemeUpload({file, onActivate: onClose});
                    setCurrentTab('installed');
                    confirmModal?.remove();
                }
            });
            return;
        }

        setCurrentTab('installed');
        handleThemeUpload({file, onActivate: onClose});
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

    return (<>
        <PageHeader
            containerClassName='bg-white dark:bg-black'
            left={
                <div className='hidden md:!visible md:!block'>
                    <TabViewComponent currentTab={currentTab} onTabChange={setCurrentTab} />
                </div>
            }
            right={
                <div className='flex items-center gap-14'>
                    <div className='flex items-center gap-3'>
                        <Button label='Close' onClick={() => {
                            modal.remove();
                            onClose();
                        }} />
                        <Button color='black' label='Upload theme' loading={isUploading} onClick={handleUpload} />
                    </div>
                </div>
            }
        />
        <div className='px-[8vmin] md:hidden'>
            <TabViewComponent currentTab={currentTab} onTabChange={setCurrentTab} />
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
    default:
        return null;
    }
};

type ChangeThemeModalProps = {
    source?: string | null;
    themeRef?: string | null;
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

    const showLimitError = (limitError: string) => {
        NiceModal.show(LimitModal, {
            prompt: limitError,
            onOk: () => updateRoute({route: '/pro', isExternal: true})
        });
    };

    const showOverwriteConfirmation = (selectedTheme: OfficialTheme, installedTheme: Theme | InstalledTheme | undefined): Promise<void> => {
        return new Promise<void>((resolve) => {
            NiceModal.show(ConfirmationModal, {
                title: 'Overwrite theme',
                prompt: <>
                    This will overwrite your existing version of {selectedTheme.name}{installedTheme?.active ? ', which is your active theme' : ''}. All custom changes will be lost.
                </>,
                okLabel: 'Overwrite',
                okRunningLabel: 'Installing...',
                cancelLabel: 'Cancel',
                okColor: 'red',
                onOk: async (confirmModal) => {
                    confirmModal?.remove();
                    resolve();
                }
            });
        });
    };

    const performInstallation = async (): Promise<void> => {
        if (!selectedTheme) return;

        let title = 'Success';
        let prompt: React.ReactNode = <></>;
        let installedTheme: Theme | InstalledTheme | undefined = themes?.find(theme => theme.name.toLowerCase() === selectedTheme.name.toLowerCase());

        if (isDefaultOrLegacyTheme(selectedTheme)) {
            title = 'Activate theme';
            prompt = <>By clicking below, <strong>{selectedTheme.name}</strong> will automatically be activated as the theme for your site.</>;
        } else {
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
            const hasErrors = newlyInstalledTheme.errors?.length;

            title = 'Success';
            prompt = <><strong>{newlyInstalledTheme.name}</strong> has been successfully installed.</>;

            if (!newlyInstalledTheme.active) {
                prompt = <>{prompt} Do you want to activate it now?</>;
            }

            if (newlyInstalledTheme.errors?.length || newlyInstalledTheme.warnings?.length) {
                title = `Installed with ${hasErrors ? 'errors' : 'warnings'}`;
                prompt = <>
                    The theme <strong>&quot;{newlyInstalledTheme.name}&quot;</strong> was installed successfully but we detected some {hasErrors ? 'errors' : 'warnings'}.
                </>;

                if (!newlyInstalledTheme.active) {
                    prompt = <>
                        {prompt}
                        You are still able to activate and use the theme but it is recommended to contact the theme developer fix these {hasErrors ? 'errors' : 'warnings'} before you do so.
                    </>;
                }
            }

            installedTheme = newlyInstalledTheme;
        }

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: installedTheme!,
            onActivate: () => {
                updateRoute('');
            }
        });
    };

    const onInstall = async () => {
        if (!selectedTh