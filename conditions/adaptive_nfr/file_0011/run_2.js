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

/** Font name to Tailwind CSS class mapping with weight variants */
const FONT_CLASS_MAP: Record<string, {base: string; headingWeight: string; bodyWeight: string}> = {
    'Cardo': {base: 'font-cardo', headingWeight: 'font-bold', bodyWeight: ''},
    'Manrope': {base: 'font-manrope', headingWeight: 'font-bold', bodyWeight: ''},
    'Merriweather': {base: 'font-merriweather', headingWeight: 'font-bold', bodyWeight: ''},
    'Nunito': {base: 'font-nunito', headingWeight: 'font-semibold', bodyWeight: ''},
    'Old Standard TT': {base: 'font-old-standard-tt', headingWeight: 'font-bold', bodyWeight: ''},
    'Prata': {base: 'font-prata', headingWeight: 'font-normal', bodyWeight: ''},
    'Roboto': {base: 'font-roboto', headingWeight: 'font-bold', bodyWeight: ''},
    'Rufina': {base: 'font-rufina', headingWeight: 'font-bold', bodyWeight: ''},
    'Tenor Sans': {base: 'font-tenor-sans', headingWeight: 'font-normal', bodyWeight: ''},
    'Chakra Petch': {base: 'font-chakra-petch', headingWeight: 'font-normal', bodyWeight: ''},
    'Fira Mono': {base: 'font-fira-mono', headingWeight: 'font-bold', bodyWeight: ''},
    'Fira Sans': {base: 'font-fira-sans', headingWeight: 'font-bold', bodyWeight: ''},
    'IBM Plex Serif': {base: 'font-ibm-plex-serif', headingWeight: 'font-bold', bodyWeight: ''},
    'Inter': {base: 'font-inter', headingWeight: 'font-bold', bodyWeight: ''},
    'JetBrains Mono': {base: 'font-jetbrains-mono', headingWeight: 'font-bold', bodyWeight: ''},
    'Lora': {base: 'font-lora', headingWeight: 'font-bold', bodyWeight: ''},
    'Noto Sans': {base: 'font-noto-sans', headingWeight: 'font-bold', bodyWeight: ''},
    'Noto Serif': {base: 'font-noto-serif', headingWeight: 'font-bold', bodyWeight: ''},
    'Poppins': {base: 'font-poppins', headingWeight: 'font-bold', bodyWeight: ''},
    'Space Grotesk': {base: 'font-space-grotesk', headingWeight: 'font-bold', bodyWeight: ''},
    'Space Mono': {base: 'font-space-mono', headingWeight: 'font-bold', bodyWeight: ''}
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

/** Get Tailwind CSS class name for a font, optionally with heading weight */
const getFontClassName = (fontName: string, isHeading: boolean = true): string => {
    const fontConfig = FONT_CLASS_MAP[fontName];
    if (!fontConfig) {
        return '';
    }
    const weight = isHeading ? fontConfig.headingWeight : fontConfig.bodyWeight;
    return clsx(fontConfig.base, weight);
};

/** Check if font is the default theme font */
const isDefaultFont = (fontName: string): boolean => fontName === DEFAULT_FONT;

/** Handle image upload with error handling for unsupported file types */
const handleImageUpload = async (
    file: File,
    uploadImage: (params: {file: File}) => Promise<string>,
    updateSetting: (key: string, value: SettingValue) => void,
    settingKey: string,
    handleError: (error: Error) => void
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

/** Create font option objects from custom fonts list */
const createFontOptions = (
    fonts: Array<{name: string; creator: string}>,
    themeNameVersion: string,
    isHeading: boolean
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

/** Handle font selection and update state and settings */
const handleFontSelect = (
    option: FontSelectOption | undefined,
    isHeading: boolean,
    themeNameVersion: string,
    setFont: (font: {name: string; creator: string}) => void,
    updateSetting: (key: string, value: SettingValue) => void
): void => {
    const settingKey = isHeading ? 'heading_font' : 'body_font';
    const fontList = isHeading ? CUSTOM_FONTS.heading : CUSTOM_FONTS.body;

    if (option?.value === DEFAULT_FONT) {
        setFont({name: DEFAULT_FONT, creator: themeNameVersion});
        updateSetting(settingKey, '');
    } else {
        const selectedFont = fontList.find(f => f.name === option?.value);
        setFont({
            name: option?.value || '',
            creator: selectedFont?.creator || ''
        });
        updateSetting(settingKey, option?.value || '');
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
    const [bodyFont, setBodyFont] = useState(CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) || {name: DEFAULT_FONT, creator: themeNameVersion});

    const customHeadingFonts = createFontOptions(CUSTOM_FONTS.heading, themeNameVersion, true) as HeadingFontOption[];
    const customBodyFonts = createFontOptions(CUSTOM_FONTS.body, themeNameVersion, false) as BodyFontOption[];

    const selectFont = (fontName: string, isHeading: boolean): string => {
        return isDefaultFont(fontName) ? '' : getFontClassName(fontName, isHeading);
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
                                await handleImageUpload(file, uploadImage, updateSetting, 'icon', handleError);
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
                                await handleImageUpload(file, uploadImage, updateSetting, 'logo', handleError);
                            }}
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
                        pintura={
                            {
                                isEnabled: editor.isEnabled,
                                openEditor: async