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
    modal: NiceModalHandler<Record<string, unknown>>
) => {
    const [isUploading, setUploading] = useState(false);

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
                }
            });
            return;
        }

        if (!data) {
            return;
        }

        const uploadedTheme = data.themes[0];
        const {title, prompt} = buildThemeUploadMessage(uploadedTheme);

        NiceModal.show(ThemeInstalledModal, {
            title,
            prompt,
            installedTheme: uploadedTheme,
            onActivate: onActivate
        });
    };

    return {handleThemeUpload, isUploading, setUploading};
};

const buildThemeUploadMessage = (theme: Theme) => {
    let title = 'Upload successful';
    let prompt = <><strong>{theme.name}</strong> uploaded</>;

    if (!theme.active) {
        prompt = <>{prompt} Do you want to activate it now?</>;
    }

    if (theme?.errors?.length || theme.warnings?.length) {
        const hasErrors = theme?.errors?.length;
        title = `Upload successful with ${hasErrors ? 'errors' : 'warnings'}`;
        prompt = <>
            The theme <strong>&quot;{theme.name}&quot;</strong> was installed but we detected some {hasErrors ? 'errors' : 'warnings'}.
        </>;

        if (!theme.active) {
            prompt = <>
                {prompt}
                You are still able to activate and use the theme but it is recommended to fix these {hasErrors ? 'errors' : 'warnings'} before you do so.
            </>;
        }
    }

    return {title, prompt};
};

const validateThemeUpload = (
    fileName: string,
    existingThemeNames: string[]
): {isValid: boolean; reason?: string} => {
    if (isDefaultOrLegacyTheme({name: fileName})) {
        return {isValid: false, reason: 'default'};
    }
    if (existingThemeNames.includes(fileName)) {
        return {isValid: false, reason: 'exists'};
    }
    return {isValid: true};
};

const showUploadValidationModal = (
    fileName: string,
    reason: string,
    onConfirm: () => void
) => {
    if (reason === 'default') {
        NiceModal.show(ConfirmationModal, {
            title: 'Upload failed',
            cancelLabel: 'Cancel',
            okLabel: '',
            prompt: (
                <>
                    <p>The default <strong>{fileName}</strong> theme cannot be overwritten.</p>
                    <p>Rename your zip file and try again.</p>
                </>
            ),
            onOk: async (confirmModal) => {
                confirmModal?.remove();
            }
        });
    } else if (reason === 'exists') {
        NiceModal.show(ConfirmationModal, {
            title: 'Overwrite theme',
            prompt: (
                <>
                    The theme <strong>{fileName}</strong> already exists.
                    Do you want to overwrite it?
                </>
            ),
            okLabel: 'Overwrite',
            cancelLabel: 'Cancel',
            okRunningLabel: 'Overwriting...',
            okColor: 'red',
            onOk: async (confirmModal) => {
                confirmModal?.remove();
                onConfirm();
            }
        });
    }
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
    const {handleThemeUpload, isUploading, setUploading} = useThemeUploadHandler(uploadTheme, handleError, modal);

    const onClose = () => {
        updateRoute('/');
    };

    const onThemeUpload = async (file: File) => {
        const themeFileName = file?.name.replace(/\.zip$/, '');
        const existingThemeNames = themes.map(t => t.name);
        const validation = validateThemeUpload(themeFileName, existingThemeNames);

        if (!validation.isValid && validation.reason) {
            showUploadValidationModal(themeFileName, validation.reason, async () => {
                setUploading(true);
                const index = existingThemeNames.indexOf(themeFileName);
                themes.splice(index, 1);
                await handleThemeUpload({file, onActivate: onClose});
                setUploading(false);
                setCurrentTab('installed');
            });
        } else {
            setCurrentTab('installed');
            handleThemeUpload({file, onActivate: onClose});
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

const useThemeInstallation = (
    installTheme: (ref: string) => Promise<ThemesInstallResponseType>,
    activateTheme: (name: string) => Promise<void>,
    handleError: (error: unknown) => void,
    updateRoute: (route: string) => void,
    checkThemeLimitError: (name: string) => Promise<string | null>,
    themes: Theme[] | undefined,
    modal: NiceModalHandler<Record<string, unknown>>
) => {
    const [installationState, setInstallationState] = useState<ThemeInstallationState>({
        isInstalling: false,
        installedFromMarketplace: false,
        isMounted: false
    });

    useEffect(() => {
        setInstallationState(prev => ({...prev, isMounted: true}));
    }, []);

    const performInstallation = async (selectedTheme: OfficialTheme, installedTheme: Theme | InstalledTheme | undefined) => {
        let title = 'Success';
        let prompt = <></>;

        if (isDefaultOrLegacyTheme(selectedTheme)) {
            title = 'Activate theme';
            prompt = <>By clicking below, <strong>{selectedTheme.name}</strong> will automatically be activated as the theme for your site.</>;
        } else {
            setInstallationState(prev => ({...prev, isInstalling: true}));
            let data: ThemesInstallResponseType | undefined;
            try {
                data = await installTheme(selectedTheme.ref);
            } catch (e) {
                handleError(e);
            } finally {
                setInstallationState(prev => ({...prev, isInstalling: false}));
            }

            if (!data) {
                return;
            }

            const newlyInstalledTheme = data.themes[0];
            const {title: msgTitle, prompt: msgPrompt} = buildThemeInstallMessage(newlyInstalledTheme);
            title = msgTitle;
            prompt = msgPrompt;
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

    const handleUrlInstallation = async (source: string | null, themeRef: string | null) => {
        if (!source || !themeRef || installationState.installedFromMarketplace || !installationState.isMounted) {
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

        const prompt = buildUrlInstallPrompt(themeName, willOverwrite, themeToOverwrite);

        NiceModal.show(ConfirmationModal, {
            title: 'Install Theme',
            prompt,
            okLabel: 'Install',
            cancelLabel: 'Cancel',
            okRunningLabel: 'Installing...',
            okColor: 'black',
            onOk: async (confirmModal) => {
                setInstallationState(prev => ({...prev, installedFromMarketplace: true}));
                try {