```typescript
import React, { useState } from 'react';
import UnsplashSelector from '../../../selectors/unsplash-selector';
import clsx from 'clsx';
import usePinturaEditor from '../../../../hooks/use-pintura-editor';
import { APIError } from '@tryghost/admin-x-framework/errors';
import { CUSTOM_FONTS } from '@tryghost/custom-fonts';
import { ColorPickerField, Form, Hint, ImageUpload, Select } from '@tryghost/admin-x-design-system';
import { Icon } from '@tryghost/admin-x-design-system';
import { type OptionProps, type SingleValueProps, components } from 'react-select';
import { type SettingValue, getSettingValues } from '@tryghost/admin-x-framework/api/settings';
import { type Theme, useBrowseThemes } from '@tryghost/admin-x-framework/api/themes';
import { getImageUrl, useUploadImage } from '@tryghost/admin-x-framework/api/images';
import { useFramework } from '@tryghost/admin-x-framework';
import { useGlobalData } from '../../../providers/global-data-provider';
import { useHandleError } from '@tryghost/admin-x-framework/hooks';
import type { BodyFontName, HeadingFontName } from '@tryghost/custom-fonts';

type BodyFontOption = {
    value: BodyFontName | typeof DEFAULT_FONT,
    label: BodyFontName | typeof DEFAULT_FONT,
    creator?: string,
    className?: string
};

type HeadingFontOption = {
    value: HeadingFontName | typeof DEFAULT_FONT,
    label: HeadingFontName | typeof DEFAULT_FONT,
    creator?: string,
    className?: string
};

export interface GlobalSettingValues {
    description: string
    accentColor: string
    icon: string | null
    logo: string | null
    coverImage: string | null
    headingFont: string
    bodyFont: string
}

const DEFAULT_FONT = 'Theme default';

interface FontSelectOption {
    value: string;
    label: string;
    hint?: string;
    key?: string;
    className?: string;
    creator?: string;
}

const SingleValue: React.FC<SingleValueProps<FontSelectOption, false>> = ({ children, ...optionProps }) => (
    <components.SingleValue {...optionProps}>
        <div className='group' data-testid="select-current-option" data-value={optionProps.data.value}>
            <div className='flex items-center gap-3'>
                <div className='flex size-12 items-center justify-center rounded-md bg-white text-2xl font-bold dark:bg-black'>Aa</div>
                <div className='flex flex-col'>
                    <span className='text-md'>{children}</span>
                    <span className='font-sans text-xs font-normal text-grey-700 dark:text-grey-600'>{optionProps.data.creator}</span>
                </div>
            </div>
        </div>
    </components.SingleValue>
);

const Option: React.FC<OptionProps<FontSelectOption, false>> = ({ children, ...optionProps }) => (
    <components.Option {...optionProps}>
        <div className={optionProps.isSelected ? 'relative flex w-full items-center justify-between gap-2' : 'group'} data-testid="select-option" data-value={optionProps.data.value}>
            <div className='flex items-center gap-3'>
                <div className='dark:group-hover:bg-grey-800 flex size-12 items-center justify-center rounded-md bg-grey-150 text-2xl font-bold group-hover:bg-grey-250 dark:bg-grey-900'>Aa</div>
                <div className='flex flex-col'>
                    <span className='text-md'>{children}</span>
                    <span className='font-sans text-xs font-normal text-grey-700 dark:text-grey-600'>{optionProps.data.creator}</span>
                </div>
            </div>
            {optionProps.isSelected && <span><Icon name='check' size={14} /></span>}
        </div>
    </components.Option>
);

const capitalizeWords = (str: string): string => str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const FONT_CLASS_MAP: Record<string, { className: string; fontWeight?: string }> = {
    'Cardo': { className: 'font-cardo', fontWeight: 'font-bold' },
    'Manrope': { className: 'font-manrope', fontWeight: 'font-bold' },
    'Merriweather': { className: 'font-merriweather', fontWeight: 'font-bold' },
    'Nunito': { className: 'font-nunito', fontWeight: 'font-semibold' },
    'Old Standard TT': { className: 'font-old-standard-tt', fontWeight: 'font-bold' },
    'Prata': { className: 'font-prata', fontWeight: 'font-normal' },
    'Roboto': { className: 'font-roboto', fontWeight: 'font-bold' },
    'Rufina': { className: 'font-rufina', fontWeight: 'font-bold' },
    'Tenor Sans': { className: 'font-tenor-sans', fontWeight: 'font-normal' },
    'Chakra Petch': { className: 'font-chakra-petch', fontWeight: 'font-normal' },
    'Fira Mono': { className: 'font-fira-mono', fontWeight: 'font-bold' },
    'Fira Sans': { className: 'font-fira-sans', fontWeight: 'font-bold' },
    'IBM Plex Serif': { className: 'font-ibm-plex-serif', fontWeight: 'font-bold' },
    'Inter': { className: 'font-inter', fontWeight: 'font-bold' },
    'JetBrains Mono': { className: 'font-jetbrains-mono', fontWeight: 'font-bold' },
    'Lora': { className: 'font-lora', fontWeight: 'font-bold' },
    'Noto Sans': { className: 'font-noto-sans', fontWeight: 'font-bold' },
    'Noto Serif': { className: 'font-noto-serif', fontWeight: 'font-bold' },
    'Poppins': { className: 'font-poppins', fontWeight: 'font-bold' },
    'Space Grotesk': { className: 'font-space-grotesk', fontWeight: 'font-bold' },
    'Space Mono': { className: 'font-space-mono', fontWeight: 'font-bold' },
};

const getFontClassName = (fontName: string, heading: boolean = true): string => {
    const fontConfig = FONT_CLASS_MAP[fontName];
    if (!fontConfig) return '';
    
    const parts = [fontConfig.className];
    if (fontConfig.fontWeight) {
        parts.push(heading ? fontConfig.fontWeight : '');
    }
    return clsx(...parts.filter(Boolean));
};

const generateFontOptions = (
    fonts: { name: string; creator?: string }[],
    defaultFont: string,
    themeNameVersion: string,
    isHeading: boolean
): (BodyFontOption | HeadingFontOption)[] => {
    const options = fonts.map((font) => ({
        label: font.name,
        value: font.name,
        creator: font.creator,
        className: getFontClassName(font.name, isHeading)
    }));
    
    options.unshift({
        label: defaultFont,
        value: defaultFont,
        creator: themeNameVersion,
        className: 'font-sans font-normal'
    });
    
    return options;
};

const handleImageUpload = (
    updateSetting: (key: string, value: SettingValue) => void,
    handleError: (error: APIError) => void,
    settingKey: string
): ((file: File) => Promise<void>) => {
    return async (file) => {
        try {
            updateSetting(settingKey, getImageUrl(await uploadImage({ file })));
        } catch (e) {
            const error = e as APIError;
            if (error.response?.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    };
};

const GlobalSettings: React.FC<{ values: GlobalSettingValues, updateSetting: (key: string, value: SettingValue) => void }> = ({ values, updateSetting }) => {
    const { mutateAsync: uploadImage } = useUploadImage();
    const { settings } = useGlobalData();
    const [unsplashEnabled] = getSettingValues<boolean>(settings, ['unsplash']);
    const [showUnsplash, setShowUnsplash] = useState<boolean>(false);
    const { unsplashConfig } = useFramework();
    const handleError = useHandleError();
    const editor = usePinturaEditor();
    const { data: themesData } = useBrowseThemes();
    
    const activeTheme = themesData?.themes.find((theme: Theme) => theme.active);
    const themeNameVersion = activeTheme 
        ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})` 
        : 'Loading...';

    const [headingFont, setHeadingFont] = useState<BodyFontOption | HeadingFontOption>(
        CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) || { name: DEFAULT_FONT, creator: themeNameVersion }
    );
    const [bodyFont, setBodyFont] = useState<BodyFontOption | HeadingFontOption>(
        CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) || { name: DEFAULT_FONT, creator: themeNameVersion }
    );

    const selectedHeadingFont = { label: headingFont.name, value: headingFont.name, creator: headingFont.creator };
    const selectedBodyFont = { label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator };

    const customHeadingFonts = generateFontOptions(CUSTOM_FONTS.heading, DEFAULT_FONT, themeNameVersion, true);
    const customBodyFonts = generateFontOptions(CUSTOM_FONTS.body, DEFAULT_FONT, themeNameVersion, false);

    const handleHeadingFontSelect = (option?: FontSelectOption) => {
        if (option?.value === DEFAULT_FONT) {
            setHeadingFont({ name: DEFAULT_FONT, creator: themeNameVersion });
            updateSetting('heading_font', '');
        } else {
            const font = CUSTOM_FONTS.heading.find(f => f.name === option?.value);
            setHeadingFont({ name: option?.value || '', creator: font?.creator || '' });
            updateSetting('heading_font', option?.value || '');
        }
    };

    const handleBodyFontSelect = (option?: FontSelectOption) => {
        if (option?.value === DEFAULT_FONT) {
            setBodyFont({ name: DEFAULT_FONT, creator: themeNameVersion });
            updateSetting('body_font', '');
        } else {
            const font = CUSTOM_FONTS.body.find(f => f.name === option?.value);
            setBodyFont({ name: option?.value || '', creator: font?.creator || '' });
            updateSetting('body_font', option?.value || '');
        }
    };

    const handleIconUpload = handleImageUpload(updateSetting, handleError, 'icon');
    const handleLogoUpload = handleImageUpload(updateSetting, handleError, 'logo');
    const handleCoverUpload = handleImageUpload(updateSetting, handleError, 'cover_image');

    return (
        <>
            <Form className='mt-6' gap='sm' margins='lg' title=''>
                <ColorPickerField
                    debounceMs={200}
                    direction='rtl'
                    testId='accent-color-picker'
                    title={<div>Accent color</div>}
                    value={values.accentColor}
                    onChange={value => updateSetting('accent_color', value)}
                />
                <div className='flex items-start justify-between'>
                    <div>
                        <div>Publication icon</div>
                        <Hint className='!mt-0 mr-5 max-w-[160px]'>A square, social icon, at least 60x60px</Hint>
                    </div>
                    <div className='flex gap-3'>
                        <ImageUpload
                            deleteButtonClassName='!top-1 !right-1'
                            editButtonClassName='!top-1 !right-1'
                            height={values.icon ? '66px' : '36px'}
                            id='logo'
                            imageBWCheckedBg={true}
                            imageURL={values.icon || ''}
                            width={values.icon ? '66px' : '160px'}
                            onDelete={() => updateSetting('icon', null)}
                            onUpload={handleIconUpload}
                        >
                            Upload icon
                        </ImageUpload>
                    </div>
                </div>
                <div className={`flex items-start justify-between ${values.icon && 'mt-2'}`}>
                    <div>
                        <div>Publication logo</div>
                        <Hint className='!mt-0 mr-5 max-w-[160px]'>Appears usually in the main header of your theme</Hint>
                    </div>
                    <div>
                        <ImageUpload
                            deleteButtonClassName='!top-1 !right-1'
                            height='60px'
                            id='site-logo'
                            imageBWCheckedBg={true}
                            imageFit='contain'
                            imageURL={values.logo || ''}
                            width='160px'
                            onDelete={() => updateSetting('logo', null)}
                            onUpload={handleLogoUpload}
                        >
                            Upload logo
                        </ImageUpload>
                    </div>
                </div>
                <div className='mt-2 flex items-start justify-between' data-testid="publication-cover">
                    <div>
                        <div>Publication cover</div>
                        <Hint className='!mt-0 mr-5 max-w-[160px]'>Usually as a large banner image on your index pages</Hint>
                    </div>
                    <ImageUpload
                        deleteButtonClassName='!top-1 !right-1'
                        editButtonClassName='!top-1 !right-10'
                        height='95px'
                        id='cover'
                        imageURL={values.coverImage || ''}
                        openUnsplash={() => setShowUnsplash(true)}
                        pintura={{
                            isEnabled: editor.isEnabled,
                            openEditor: async () => editor.openEditor({
                                image: values.coverImage || '',
                                handleSave: async (file: File) => {
                                    try {
                                        updateSetting('cover_image', getImageUrl(await uploadImage({ file })));
                                    } catch (e) {
                                        handleError(e);
                                    }
                                }
                            })
                        }}
                        unsplashButtonClassName='!bg-transparent !h-6 !top-1.5 !w-6 !right-1.5 z-50'
                        unsplashEnabled={unsplashEnabled}
                        width='160px'
                        onDelete={() => updateSetting('cover_image', null)}
                        onUpload={handleCoverUpload}
                    >
                        Upload cover
                    </ImageUpload>
                    {showUnsplash && unsplashConfig && unsplashEnabled && (
                        <UnsplashSelector
                            unsplashProviderConfig={unsplashConfig}
                            onClose={() => setShowUnsplash(false)}
                            onImageInsert={(image) => {
                                if (image.src) {
                                    updateSetting('cover_image', image.src);
                                }
                                setShowUnsplash(false);
                            }}
                        />
                    )}
                </div>
            </Form>
            <Form className='-mt-4' gap='sm' margins='lg' title='Typography'>
                <Select
                    className={getFontClassName(selectedHeadingFont.label, true)}
                    components={{ Option, SingleValue }}
                    controlClasses={{ control: '!min-h-16 !pl-2', option: '!pl-2' }}
                    hint={''}
                    menuShouldScrollIntoView={true}
                    options={customHeadingFonts}
                    selectedOption={selectedHeadingFont}
                    testId='heading-font-select'
                    title={'Heading font'}
                    onSelect={handleHeadingFontSelect}
                />
                <Select
                    className={getFontClassName(selectedBodyFont.label, false)}
                    components={{ Option, SingleValue }}
                    controlClasses={{ control: '!min-h-16 !pl-2', option: '!pl-2' }}
                    hint={''}
                    maxMenuHeight={200}
                    menuPosition='fixed'
                    menuShouldScrollIntoView={true}
                    options={customBodyFonts}
                    selectedOption={selectedBodyFont}
                    testId='body-font-select'
                    title={'Body font'}
                    onSelect={handleBodyFontSelect}
                />
            </Form>
        </>
    );
};

export default GlobalSettings;
```