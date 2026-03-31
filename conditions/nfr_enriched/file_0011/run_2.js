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

const DEFAULT_FONT = 'Theme default';

type BodyFontOption = {
    value: BodyFontName | typeof DEFAULT_FONT;
    label: BodyFontName | typeof DEFAULT_FONT;
    creator?: string;
    className?: string;
};

type HeadingFontOption = {
    value: HeadingFontName | typeof DEFAULT_FONT;
    label: HeadingFontName | typeof DEFAULT_FONT;
    creator?: string;
    className?: string;
};

export interface GlobalSettingValues {
    description: string;
    accentColor: string;
    icon: string | null;
    logo: string | null;
    coverImage: string | null;
    headingFont: string;
    bodyFont: string;
}

interface FontSelectOption {
    value: string;
    label: string;
    hint?: string;
    key?: string;
    className?: string;
    creator?: string;
}

// Font name to Tailwind class mapping
// NOTE: Full class names are required (not dynamic) so Tailwind can generate styles
const FONT_CLASS_MAP: Record<string, {base: string; headingWeight: string; bodyWeight: string}> = {
    'Cardo':           {base: 'font-cardo',           headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Manrope':         {base: 'font-manrope',         headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Merriweather':    {base: 'font-merriweather',    headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Nunito':          {base: 'font-nunito',          headingWeight: 'font-semibold',bodyWeight: 'font-semibold'},
    'Old Standard TT': {base: 'font-old-standard-tt', headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Prata':           {base: 'font-prata',           headingWeight: 'font-normal',  bodyWeight: 'font-normal'},
    'Roboto':          {base: 'font-roboto',          headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Rufina':          {base: 'font-rufina',          headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Tenor Sans':      {base: 'font-tenor-sans',      headingWeight: 'font-normal',  bodyWeight: 'font-normal'},
    'Chakra Petch':    {base: 'font-chakra-petch',    headingWeight: 'font-normal',  bodyWeight: 'font-normal'},
    'Fira Mono':       {base: 'font-fira-mono',       headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Fira Sans':       {base: 'font-fira-sans',       headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'IBM Plex Serif':  {base: 'font-ibm-plex-serif',  headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Inter':           {base: 'font-inter',           headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'JetBrains Mono':  {base: 'font-jetbrains-mono',  headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Lora':            {base: 'font-lora',            headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Noto Sans':       {base: 'font-noto-sans',       headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Noto Serif':      {base: 'font-noto-serif',      headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Poppins':         {base: 'font-poppins',         headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Space Grotesk':   {base: 'font-space-grotesk',   headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
    'Space Mono':      {base: 'font-space-mono',      headingWeight: 'font-bold',    bodyWeight: 'font-bold'}
};

const fontClassName = (fontName: string, heading: boolean = true): string => {
    const fontConfig = FONT_CLASS_MAP[fontName];
    if (!fontConfig) {
        return '';
    }
    return clsx(fontConfig.base, heading ? fontConfig.headingWeight : fontConfig.bodyWeight);
};

const selectFont = (fontName: string, heading: boolean): string => {
    if (fontName === DEFAULT_FONT) {
        return '';
    }
    return fontClassName(fontName, heading);
};

const capitalizeWords = (str: string): string => str
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const buildFontOptions = (
    fonts: typeof CUSTOM_FONTS.heading | typeof CUSTOM_FONTS.body,
    heading: boolean,
    themeNameVersion: string
): HeadingFontOption[] | BodyFontOption[] => {
    const options = fonts.map(x => ({
        label: x.name,
        value: x.name,
        creator: x.creator,
        className: fontClassName(x.name, heading)
    }));
    return [{label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion, className: 'font-sans font-normal'}, ...options] as HeadingFontOption[] | BodyFontOption[];
};

// Shared font preview box used in both SingleValue and Option
const FontPreviewBox: React.FC<{bgClassName: string}> = ({bgClassName}) => (
    <div className={clsx('flex size-12 items-center justify-center rounded-md text-2xl font-bold', bgClassName)}>Aa</div>
);

const FontOptionContent: React.FC<{label: React.ReactNode; creator?: string; previewBgClassName: string}> = ({label, creator, previewBgClassName}) => (
    <div className='flex items-center gap-3'>
        <FontPreviewBox bgClassName={previewBgClassName} />
        <div className='flex flex-col'>
            <span className='text-md'>{label}</span>
            <span className='font-sans text-xs font-normal text-grey-700 dark:text-grey-600'>{creator}</span>
        </div>
    </div>
);

const SingleValue: React.FC<SingleValueProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
    <components.SingleValue {...optionProps}>
        <div className='group' data-testid="select-current-option" data-value={optionProps.data.value}>
            <FontOptionContent
                creator={optionProps.data.creator}
                label={children}
                previewBgClassName='bg-white dark:bg-black'
            />
        </div>
    </components.SingleValue>
);

const Option: React.FC<OptionProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
    <components.Option {...optionProps}>
        <div
            className={optionProps.isSelected ? 'relative flex w-full items-center justify-between gap-2' : 'group'}
            data-testid="select-option"
            data-value={optionProps.data.value}
        >
            <FontOptionContent
                creator={optionProps.data.creator}
                label={children}
                previewBgClassName='bg-grey-150 group-hover:bg-grey-250 dark:bg-grey-900 dark:group-hover:bg-grey-800'
            />
            {optionProps.isSelected && <span><Icon name='check' size={14} /></span>}
        </div>
    </components.Option>
);

interface ImageUploadFieldProps {
    label: string;
    hint: string;
    id: string;
    imageURL: string;
    settingKey: string;
    showIcon?: boolean;
    extraClassName?: string;
    uploadImage: (args: {file: File}) => Promise<unknown>;
    updateSetting: (key: string, value: SettingValue) => void;
    handleError: (error: unknown) => void;
    children?: React.ReactNode;
    extraProps?: Record<string, unknown>;
}

const handleImageUpload = async (
    file: File,
    settingKey: string,
    uploadImage: (args: {file: File}) => Promise<unknown>,
    updateSetting: (key: string, value: SettingValue) => void,
    handleError: (error: unknown) => void
) => {
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

const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
    label,
    hint,
    id,
    imageURL,
    settingKey,
    extraClassName = '',
    uploadImage: uploadImageFn,
    updateSetting,
    handleError,
    children,
    extraProps = {}
}) => (
    <div className={clsx('flex items-start justify-between', extraClassName)}>
        <div>
            <div>{label}</div>
            <Hint className='!mt-0 mr-5 max-w-[160px]'>{hint}</Hint>
        </div>
        <ImageUpload
            deleteButtonClassName='!top-1 !right-1'
            id={id}
            imageURL={imageURL}
            onDelete={() => updateSetting(settingKey, null)}
            onUpload={async (file: File) => handleImageUpload(file, settingKey, uploadImageFn, updateSetting, handleError)}
            {...extraProps}
        >
            {children}
        </ImageUpload>
    </div>
);

interface FontSelectProps {
    title: string;
    testId: string;
    selectedFont: FontSelectOption;
    options: HeadingFontOption[] | BodyFontOption[];
    isHeading: boolean;
    themeNameVersion: string;
    fontList: typeof CUSTOM_FONTS.heading | typeof CUSTOM_FONTS.body;
    settingKey: string;
    setFont: (font: {name: string; creator: string}) => void;
    updateSetting: (key: string, value: SettingValue) => void;
    extraProps?: Record<string, unknown>;
}

const FontSelect: React.FC<FontSelectProps> = ({
    title,
    testId,
    selectedFont,
    options,
    isHeading,
    themeNameVersion,
    fontList,
    settingKey,
    setFont,
    updateSetting,
    extraProps = {}
}) => (
    <Select
        className={selectFont(selectedFont.label, isHeading)}
        components={{Option, SingleValue}}
        controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
        hint={''}
        menuShouldScrollIntoView={true}
        options={options}
        selectedOption={selectedFont}
        testId={testId}
        title={title}
        onSelect={(option) => {
            if (option?.value === DEFAULT_FONT) {
                setFont({name: DEFAULT_FONT, creator: themeNameVersion});
                updateSetting(settingKey, '');
            } else {
                setFont({
                    name: option?.value || '',
                    creator: fontList.find(f => f.name === option?.value)?.creator || ''
                });
                updateSetting(settingKey, option?.value || '');
            }
        }}
        {...extraProps}
    />
);

const GlobalSettings: React.FC<{values: GlobalSettingValues; updateSetting: (key: string, value: SettingValue) => void}> = ({values, updateSetting}) => {
    const {mutateAsync: uploadImage} = useUploadImage();
    const {settings} = useGlobalData();
    const [unsplashEnabled] = getSettingValues<boolean>(settings, ['unsplash']);
    const [showUnsplash, setShowUnsplash] = useState<boolean>(false);
    const {unsplashConfig} = useFramework();
    const handleError = useHandleError();
    const editor = usePinturaEditor();

    const {data: themesData} = useBrowseThemes();
    const activeTheme = themesData?.themes.find((theme: Theme) => theme.active);
    const themeNameVersion = activeTheme
        ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})`
        : 'Loading...';

    const [headingFont, setHeadingFont] = useState(
        CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );
    const [bodyFont, setBodyFont] = useState(
        CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );

    const customHeadingFonts = buildFontOptions(CUSTOM_FONTS.heading, true, themeNameVersion) as HeadingFontOption[];
    const customBodyFonts = buildFontOptions(CUSTOM_FONTS.body, false, themeNameVersion) as BodyFontOption[];

    const selectedHeadingFont: FontSelectOption = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont: FontSelectOption = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

    const sharedImageProps = {uploadImage, updateSetting, handleError};

    return (
        <>
            <Form className='mt-6' gap='sm' margins='lg' title=''>
                <ColorPickerField
                    debounceMs={200}
                    direction='rtl'
                    testId='accent-color-picker'
                    title={<div>Accent color</div>}
                    value={values