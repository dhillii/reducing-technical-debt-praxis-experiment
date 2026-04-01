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

/** Font class name mapping strategy */
interface FontClassStrategy {
    baseClass: string;
    headingWeight: string;
    bodyWeight: string;
}

/** Lookup table for font to class mappings */
const FONT_CLASS_MAP: Record<string, FontClassStrategy> = {
    'Cardo': {baseClass: 'font-cardo', headingWeight: 'font-bold', bodyWeight: ''},
    'Manrope': {baseClass: 'font-manrope', headingWeight: 'font-bold', bodyWeight: ''},
    'Merriweather': {baseClass: 'font-merriweather', headingWeight: 'font-bold', bodyWeight: ''},
    'Nunito': {baseClass: 'font-nunito', headingWeight: 'font-semibold', bodyWeight: ''},
    'Old Standard TT': {baseClass: 'font-old-standard-tt', headingWeight: 'font-bold', bodyWeight: ''},
    'Prata': {baseClass: 'font-prata', headingWeight: 'font-normal', bodyWeight: ''},
    'Roboto': {baseClass: 'font-roboto', headingWeight: 'font-bold', bodyWeight: ''},
    'Rufina': {baseClass: 'font-rufina', headingWeight: 'font-bold', bodyWeight: ''},
    'Tenor Sans': {baseClass: 'font-tenor-sans', headingWeight: 'font-normal', bodyWeight: ''},
    'Chakra Petch': {baseClass: 'font-chakra-petch', headingWeight: 'font-normal', bodyWeight: ''},
    'Fira Mono': {baseClass: 'font-fira-mono', headingWeight: 'font-bold', bodyWeight: ''},
    'Fira Sans': {baseClass: 'font-fira-sans', headingWeight: 'font-bold', bodyWeight: ''},
    'IBM Plex Serif': {baseClass: 'font-ibm-plex-serif', headingWeight: 'font-bold', bodyWeight: ''},
    'Inter': {baseClass: 'font-inter', headingWeight: 'font-bold', bodyWeight: ''},
    'JetBrains Mono': {baseClass: 'font-jetbrains-mono', headingWeight: 'font-bold', bodyWeight: ''},
    'Lora': {baseClass: 'font-lora', headingWeight: 'font-bold', bodyWeight: ''},
    'Noto Sans': {baseClass: 'font-noto-sans', headingWeight: 'font-bold', bodyWeight: ''},
    'Noto Serif': {baseClass: 'font-noto-serif', headingWeight: 'font-bold', bodyWeight: ''},
    'Poppins': {baseClass: 'font-poppins', headingWeight: 'font-bold', bodyWeight: ''},
    'Space Grotesk': {baseClass: 'font-space-grotesk', headingWeight: 'font-bold', bodyWeight: ''},
    'Space Mono': {baseClass: 'font-space-mono', headingWeight: 'font-bold', bodyWeight: ''}
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

/**
 * Resolves font class name from lookup table
 * @param fontName - Name of the font
 * @param heading - Whether this is for heading (true) or body (false)
 * @returns CSS class string
 */
const resolveFontClassName = (fontName: string, heading: boolean = true): string => {
    const strategy = FONT_CLASS_MAP[fontName];
    if (!strategy) {
        return '';
    }
    const weightClass = heading ? strategy.headingWeight : strategy.bodyWeight;
    return clsx(strategy.baseClass, weightClass);
};

/**
 * Handles image upload with error management
 * @param file - File to upload
 * @param uploadImage - Upload function
 * @param updateSetting - Setting update callback
 * @param handleError - Error handler
 * @param settingKey - Setting key to update
 */
const handleImageUpload = async (
    file: File,
    uploadImage: (params: {file: File}) => Promise<string>,
    updateSetting: (key: string, value: SettingValue) => void,
    handleError: (error: Error) => void,
    settingKey: string
): Promise<void> => {
    try {
        updateSetting(settingKey, getImageUrl(await uploadImage({file})));
    } catch (e) {
        const error = e as APIError;
        if (error.response?.status === 415) {
            error.message = 'Unsupported file type';
        }
        handleError(error);
    }
};

/**
 * Handles font selection with state and setting updates
 * @param option - Selected font option
 * @param isHeading - Whether this is heading font
 * @param setFont - Font state setter
 * @param updateSetting - Setting update callback
 * @param themeNameVersion - Theme name and version
 * @param fontSource - Source array (CUSTOM_FONTS.heading or CUSTOM_FONTS.body)
 */
const handleFontSelection = (
    option: FontSelectOption | undefined,
    isHeading: boolean,
    setFont: (font: {name: string; creator: string}) => void,
    updateSetting: (key: string, value: SettingValue) => void,
    themeNameVersion: string,
    fontSource: Array<{name: string; creator: string}>
): void => {
    const settingKey = isHeading ? 'heading_font' : 'body_font';
    
    if (option?.value === DEFAULT_FONT) {
        setFont({name: DEFAULT_FONT, creator: themeNameVersion});
        updateSetting(settingKey, '');
    } else {
        const fontName = option?.value || '';
        const creator = fontSource.find(f => f.name === fontName)?.creator || '';
        setFont({name: fontName, creator});
        updateSetting(settingKey, fontName);
    }
};

const GlobalSettings: React.FC<{ values: GlobalSettingValues, updateSetting: (key: string, value: SettingValue) => void }> = ({values, updateSetting}) => {
    const {mutateAsync: uploadImage} = useUploadImage();
    const {settings} = useGlobalData();
    const [unsplashEnabled] = getSettingValues<boolean>(settings, ['unsplash']);
    const [showUnsplash, setShowUnsplash] = useState<boolean>(false);
    const {unsplashConfig} = useFramework();
    const handleError = useHandleError();

    const editor = usePinturaEditor();

    const {data: themesData} = useBrowseThemes();
    const activeTheme = themesData?.themes.find((theme: Theme) => theme.active);
    const themeNameVersion = activeTheme ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})` : 'Loading...';

    const [headingFont, setHeadingFont] = useState(CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) || {name: DEFAULT_FONT, creator: themeNameVersion});
    const [bodyFont, setBodyFont] = useState(CUSTOM_FONTS.heading.find(f => f.name === values.bodyFont) || {name: DEFAULT_FONT, creator: themeNameVersion});

    /**
     * Populate the heading and body font options
     */
    const customHeadingFonts: HeadingFontOption[] = CUSTOM_FONTS.heading.map((x) => {
        const className = resolveFontClassName(x.name, true);
        return {label: x.name, value: x.name, creator: x.creator, className};
    });
    customHeadingFonts.unshift({label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion, className: 'font-sans font-normal'});

    const customBodyFonts: BodyFontOption[] = CUSTOM_FONTS.body.map((x) => {
        const className = resolveFontClassName(x.name, false);
        return {label: x.name, value: x.name, creator: x.creator, className};
    });
    customBodyFonts.unshift({label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion, className: 'font-sans font-normal'});

    /**
     * Selects appropriate font class, returns empty string for default font
     */
    const selectFont = (fontName: string, heading: boolean): string => {
        if (fontName === DEFAULT_FONT) {
            return '';
        }
        return resolveFontClassName(fontName, heading);
    };

    const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

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
                            onUpload={async (file) => {
                                await handleImageUpload(file, uploadImage, updateSetting, handleError, 'icon');
                            }}
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
                            onUpload={async (file) => {
                                await handleImageUpload(file, uploadImage, updateSetting, handleError, 'logo');
                            }}
                        >
                        Upload logo
                        </ImageUpload>
                    </div>