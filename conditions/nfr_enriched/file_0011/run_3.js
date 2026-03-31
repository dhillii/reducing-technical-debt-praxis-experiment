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

/**
 * Font name to Tailwind CSS class mapping.
 * All custom fonts are maintained in the @tryghost/custom-fonts package.
 * Tailwind requires class names to be present in the file to generate styles,
 * so we cannot use getCSSFriendlyFontClassName from @tryghost/custom-fonts.
 */
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
    const font = FONT_CLASS_MAP[fontName];
    if (!font) {
        return '';
    }
    return clsx(font.base, heading ? font.headingWeight : font.bodyWeight);
};

const selectFont = (fontName: string, heading: boolean): string => {
    if (fontName === DEFAULT_FONT) {
        return '';
    }
    return fontClassName(fontName, heading);
};

const capitalizeWords = (str: string): string =>
    str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

const buildFontOptions = <T extends HeadingFontOption | BodyFontOption>(
    fonts: {name: string; creator: string}[],
    heading: boolean,
    themeNameVersion: string
): T[] => {
    const options = fonts.map(x => ({
        label: x.name,
        value: x.name,
        creator: x.creator,
        className: fontClassName(x.name, heading)
    })) as T[];

    options.unshift({
        label: DEFAULT_FONT,
        value: DEFAULT_FONT,
        creator: themeNameVersion,
        className: 'font-sans font-normal'
    } as T);

    return options;
};

// ─── Font Select Components ───────────────────────────────────────────────────

const FontPreviewBox: React.FC = () => (
    <div className='flex size-12 items-center justify-center rounded-md bg-white text-2xl font-bold dark:bg-black'>
        Aa
    </div>
);

const FontOptionBox: React.FC = () => (
    <div className='dark:group-hover:bg-grey-800 flex size-12 items-center justify-center rounded-md bg-grey-150 text-2xl font-bold group-hover:bg-grey-250 dark:bg-grey-900'>
        Aa
    </div>
);

const FontLabel: React.FC<{label: React.ReactNode; creator?: string}> = ({label, creator}) => (
    <div className='flex flex-col'>
        <span className='text-md'>{label}</span>
        <span className='font-sans text-xs font-normal text-grey-700 dark:text-grey-600'>{creator}</span>
    </div>
);

const SingleValue: React.FC<SingleValueProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
    <components.SingleValue {...optionProps}>
        <div className='group' data-testid='select-current-option' data-value={optionProps.data.value}>
            <div className='flex items-center gap-3'>
                <FontPreviewBox />
                <FontLabel creator={optionProps.data.creator} label={children} />
            </div>
        </div>
    </components.SingleValue>
);

const Option: React.FC<OptionProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
    <components.Option {...optionProps}>
        <div
            className={optionProps.isSelected ? 'relative flex w-full items-center justify-between gap-2' : 'group'}
            data-testid='select-option'
            data-value={optionProps.data.value}
        >
            <div className='flex items-center gap-3'>
                <FontOptionBox />
                <FontLabel creator={optionProps.data.creator} label={children} />
            </div>
            {optionProps.isSelected && <span><Icon name='check' size={14} /></span>}
        </div>
    </components.Option>
);

// ─── Image Upload ─────────────────────────────────────────────────────────────

const useImageUploadHandler = () => {
    const {mutateAsync: uploadImage} = useUploadImage();
    const handleError = useHandleError();

    const uploadWithErrorHandling = async (
        file: File,
        onSuccess: (url: string) => void
    ) => {
        try {
            onSuccess(getImageUrl(await uploadImage({file})));
        } catch (e) {
            const error = e as APIError;
            if (error.response?.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    };

    return uploadWithErrorHandling;
};

// ─── Publication Image Fields ─────────────────────────────────────────────────

interface PublicationImageFieldProps {
    label: string;
    hint: string;
    imageURL: string;
    onDelete: () => void;
    onUpload: (file: File) => Promise<void>;
    uploadLabel: string;
    height?: string;
    width?: string;
    id: string;
    imageBWCheckedBg?: boolean;
    imageFit?: 'contain' | 'cover';
    className?: string;
}

const PublicationImageField: React.FC<PublicationImageFieldProps> = ({
    label,
    hint,
    imageURL,
    onDelete,
    onUpload,
    uploadLabel,
    height = '60px',
    width = '160px',
    id,
    imageBWCheckedBg,
    imageFit,
    className
}) => (
    <div className={clsx('flex items-start justify-between', className)}>
        <div>
            <div>{label}</div>
            <Hint className='!mt-0 mr-5 max-w-[160px]'>{hint}</Hint>
        </div>
        <div>
            <ImageUpload
                deleteButtonClassName='!top-1 !right-1'
                height={height}
                id={id}
                imageBWCheckedBg={imageBWCheckedBg}
                imageFit={imageFit}
                imageURL={imageURL}
                width={width}
                onDelete={onDelete}
                onUpload={onUpload}
            >
                {uploadLabel}
            </ImageUpload>
        </div>
    </div>
);

// ─── Font Select ──────────────────────────────────────────────────────────────

interface FontSelectProps {
    title: string;
    testId: string;
    options: FontSelectOption[];
    selectedOption: FontSelectOption;
    isHeading: boolean;
    maxMenuHeight?: number;
    menuPosition?: 'fixed' | 'absolute';
    onSelect: (option: FontSelectOption | null) => void;
}

const FontSelect: React.FC<FontSelectProps> = ({
    title,
    testId,
    options,
    selectedOption,
    isHeading,
    maxMenuHeight,
    menuPosition,
    onSelect
}) => (
    <Select
        className={selectFont(selectedOption.label, isHeading)}
        components={{Option, SingleValue}}
        controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
        hint={''}
        maxMenuHeight={maxMenuHeight}
        menuPosition={menuPosition}
        menuShouldScrollIntoView={true}
        options={options}
        selectedOption={selectedOption}
        testId={testId}
        title={title}
        onSelect={onSelect}
    />
);

// ─── Main Component ───────────────────────────────────────────────────────────

const GlobalSettings: React.FC<{
    values: GlobalSettingValues;
    updateSetting: (key: string, value: SettingValue) => void;
}> = ({values, updateSetting}) => {
    const {settings} = useGlobalData();
    const [unsplashEnabled] = getSettingValues<boolean>(settings, ['unsplash']);
    const [showUnsplash, setShowUnsplash] = useState<boolean>(false);
    const {unsplashConfig} = useFramework();
    const handleError = useHandleError();
    const editor = usePinturaEditor();
    const uploadWithErrorHandling = useImageUploadHandler();

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

    const customHeadingFonts = buildFontOptions<HeadingFontOption>(CUSTOM_FONTS.heading, true, themeNameVersion);
    const customBodyFonts = buildFontOptions<BodyFontOption>(CUSTOM_FONTS.body, false, themeNameVersion);

    const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

    const handleFontSelect = (
        option: FontSelectOption | null,
        fontList: {name: string; creator: string}[],
        setFont: React.Dispatch<React.SetStateAction<{name: string; creator: string}>>,
        settingKey: string
    ) => {
        if (option?.value === DEFAULT_FONT || !option) {
            setFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting(settingKey, '');
        } else {
            const creator = fontList.find(f