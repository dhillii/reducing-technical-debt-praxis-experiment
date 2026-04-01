```typescript
import React, {useState} from 'react';
import UnsplashSelector from '../../../selectors/unsplash-selector';
import clsx from 'clsx';
import usePinturaEditor from '../../../../hooks/use-pintura-editor';
import {APIError} from '@tryghost/admin-x-framework/errors';
import {CUSTOM_FONTS} from '@tryghost/custom-fonts';
import {ColorPickerField, Form, Hint, ImageUpload, Select} from '@tryghost/admin-x-design-system';
import {Icon} from '@tryghost/admin-x-design-system';
import {type OptionProps, type SingleValueProps, components} from 'react-select';
import {type SettingValue, getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {type Theme, useBrowseThemes} from '@tryghost/admin-x-framework/api/themes';
import {getImageUrl, useUploadImage} from '@tryghost/admin-x-framework/api/images';
import {useFramework} from '@tryghost/admin-x-framework';
import {useGlobalData} from '../../../providers/global-data-provider';
import {useHandleError} from '@tryghost/admin-x-framework/hooks';
import type {BodyFontName, HeadingFontName} from '@tryghost/custom-fonts';

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

// Font class name mapping for Tailwind CSS
const FONT_CLASS_MAP: Record<string, {base: string, headingWeight: string}> = {
    'Cardo': {base: 'font-cardo', headingWeight: 'font-bold'},
    'Manrope': {base: 'font-manrope', headingWeight: 'font-bold'},
    'Merriweather': {base: 'font-merriweather', headingWeight: 'font-bold'},
    'Nunito': {base: 'font-nunito', headingWeight: 'font-semibold'},
    'Old Standard TT': {base: 'font-old-standard-tt', headingWeight: 'font-bold'},
    'Prata': {base: 'font-prata', headingWeight: 'font-normal'},
    'Roboto': {base: 'font-roboto', headingWeight: 'font-bold'},
    'Rufina': {base: 'font-rufina', headingWeight: 'font-bold'},
    'Tenor Sans': {base: 'font-tenor-sans', headingWeight: 'font-normal'},
    'Chakra Petch': {base: 'font-chakra-petch', headingWeight: 'font-normal'},
    'Fira Mono': {base: 'font-fira-mono', headingWeight: 'font-bold'},
    'Fira Sans': {base: 'font-fira-sans', headingWeight: 'font-bold'},
    'IBM Plex Serif': {base: 'font-ibm-plex-serif', headingWeight: 'font-bold'},
    'Inter': {base: 'font-inter', headingWeight: 'font-bold'},
    'JetBrains Mono': {base: 'font-jetbrains-mono', headingWeight: 'font-bold'},
    'Lora': {base: 'font-lora', headingWeight: 'font-bold'},
    'Noto Sans': {base: 'font-noto-sans', headingWeight: 'font-bold'},
    'Noto Serif': {base: 'font-noto-serif', headingWeight: 'font-bold'},
    'Poppins': {base: 'font-poppins', headingWeight: 'font-bold'},
    'Space Grotesk': {base: 'font-space-grotesk', headingWeight: 'font-bold'},
    'Space Mono': {base: 'font-space-mono', headingWeight: 'font-bold'}
};

const SingleValue: React.FC<SingleValueProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
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

const Option: React.FC<OptionProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
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

/** Maps font name to Tailwind CSS class names for heading or body text */
const getFontClassName = (fontName: string, isHeading: boolean = true): string => {
    const fontConfig = FONT_CLASS_MAP[fontName];
    if (!fontConfig) {
        return '';
    }
    return isHeading ? clsx(fontConfig.base, fontConfig.headingWeight) : fontConfig.base;
};

/** Builds font options array from custom fonts list */
const buildFontOptions = (
    fonts: Array<{name: string, creator: string}>,
    isHeading: boolean,
    themeNameVersion: string
): (HeadingFontOption | BodyFontOption)[] => {
    const options = fonts.map((font) => ({
        label: font.name,
        value: font.name,
        creator: font.creator,
        className: getFontClassName(font.name, isHeading)
    }));
    options.unshift({
        label: DEFAULT_FONT,
        value: DEFAULT_FONT,
        creator: themeNameVersion,
        className: 'font-sans font-normal'
    });
    return options;
};

/** Handles image upload with error handling for unsupported file types */
const handleImageUpload = async (
    file: File,
    uploadImage: (params: {file: File}) => Promise<string>,
    updateSetting: (key: string, value: SettingValue) => void,
    settingKey: string,
    handleError: (error: Error) => void
): Promise<void> => {
    try {
        const uploadedUrl = await uploadImage({file});
        updateSetting(settingKey, getImageUrl(uploadedUrl));
    } catch (e) {
        const error = e as APIError;
        if (error.response?.status === 415) {
            error.message = 'Unsupported file type';
        }
        handleError(error);
    }
};

/** Handles font selection and updates both state and settings */
const handleFontSelect = (
    option: FontSelectOption | null,
    isHeading: boolean,
    themeNameVersion: string,
    setFont: (font: {name: string, creator: string}) => void,
    updateSetting: (key: string, value: SettingValue) => void
): void => {
    const fontList = isHeading ? CUSTOM_FONTS.heading : CUSTOM_FONTS.body;
    const settingKey = isHeading ? 'heading_font' : 'body_font';

    if (option?.value === DEFAULT_FONT) {
        setFont({name: DEFAULT_FONT, creator: themeNameVersion});
        updateSetting(settingKey, '');
    } else {
        const fontCreator = fontList.find(f => f.name === option?.value)?.creator || '';
        setFont({name: option?.value || '', creator: fontCreator});
        updateSetting(settingKey, option?.value || '');
    }
};

interface AccentColorSectionProps {
    accentColor: string;
    updateSetting: (key: string, value: SettingValue) => void;
}

/** Renders the accent color picker section */
const AccentColorSection: React.FC<AccentColorSectionProps> = ({accentColor, updateSetting}) => (
    <ColorPickerField
        debounceMs={200}
        direction='rtl'
        testId='accent-color-picker'
        title={<div>Accent color</div>}
        value={accentColor}
        onChange={value => updateSetting('accent_color', value)}
    />
);

interface IconUploadSectionProps {
    icon: string | null;
    uploadImage: (params: {file: File}) => Promise<string>;
    updateSetting: (key: string, value: SettingValue) => void;
    handleError: (error: Error) => void;
}

/** Renders the publication icon upload section */
const IconUploadSection: React.FC<IconUploadSectionProps> = ({icon, uploadImage, updateSetting, handleError}) => (
    <div className='flex items-start justify-between'>
        <div>
            <div>Publication icon</div>
            <Hint className='!mt-0 mr-5 max-w-[160px]'>A square, social icon, at least 60x60px</Hint>
        </div>
        <div className='flex gap-3'>
            <ImageUpload
                deleteButtonClassName='!top-1 !right-1'
                editButtonClassName='!top-1 !right-1'
                height={icon ? '66px' : '36px'}
                id='logo'
                imageBWCheckedBg={true}
                imageURL={icon || ''}
                width={icon ? '66px' : '160px'}
                onDelete={() => updateSetting('icon', null)}
                onUpload={async (file) => {
                    await handleImageUpload(file, uploadImage, updateSetting, 'icon', handleError);
                }}
            >
                Upload icon
            </ImageUpload>
        </div>
    </div>
);

interface LogoUploadSectionProps {
    logo: string | null;
    icon: string | null;
    uploadImage: (params: {file: File}) => Promise<string>;
    updateSetting: (key: string, value: SettingValue) => void;
    handleError: (error: Error) => void;
}

/** Renders the publication logo upload section */
const LogoUploadSection: React.FC<LogoUploadSectionProps> = ({logo, icon, uploadImage, updateSetting, handleError}) => (
    <div className={`flex items-start justify-between ${icon && 'mt-2'}`}>
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
                imageURL={logo || ''}
                width='160px'
                onDelete={() => updateSetting('logo', null)}
                onUpload={async (file) => {
                    await handleImageUpload(file, uploadImage, updateSetting, 'logo', handleError);
                }}
            >
                Upload logo
            </ImageUpload>
        </div>
    </div>
);

interface CoverUploadSectionProps {
    coverImage: string | null;
    unsplashEnabled: boolean;
    unsplashConfig: any;
    uploadImage: (params: {file: File}) => Promise<string>;
    updateSetting: (key: string, value: SettingValue) => void;
    handleError: (error: Error) => void;
    editor: any;
    showUnsplash: boolean;
    setShowUnsplash: (show: boolean) => void;
}

/** Renders the publication cover image upload section with Unsplash integration */
const CoverUploadSection: React.FC<CoverUploadSectionProps> = ({
    coverImage,
    unsplashEnabled,
    unsplashConfig,
    uploadImage,
    updateSetting,
    handleError,
    editor,
    showUnsplash,
    setShowUnsplash
}) => (
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
            imageURL={coverImage || ''}
            openUnsplash={() => setShowUnsplash(true)}
            pintura={{
                isEnabled: editor.isEnabled,
                openEditor: async () => editor.openEditor({
                    image: coverImage || '',
                    handleSave: async (file: File) => {
                        await handleImageUpload(file, uploadImage, updateSetting, 'cover_image', handleError);
                    }
                })
            }}
            unsplashButtonClassName='!bg-transparent !h-6 !top-1.5 !w-6 !right-1.5 z-50'
            unsplashEnabled={unsplashEnabled}
            width='160px'
            onDelete={() => updateSetting('cover_image', null)}
            onUpload={async (file: any) => {
                await handleImageUpload(file, uploadImage, updateSetting, 'cover_image', handleError);
            }}
        >
            Upload cover
        </ImageUpload>
        {showUnsplash && unsplashConfig && unsplashEnabled && (
            <UnsplashSelector
                unsplashProviderConfig={unsplashConfig}