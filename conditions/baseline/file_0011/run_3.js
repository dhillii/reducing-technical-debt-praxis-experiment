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

const capitalizeWords = (str: string): string =>
    str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

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
    <div className='flex size-12 items-center justify-center rounded-md bg-white text-2xl font-bold dark:bg-black'>Aa</div>
);

const FontOptionBox: React.FC = () => (
    <div className='dark:group-hover:bg-grey-800 flex size-12 items-center justify-center rounded-md bg-grey-150 text-2xl font-bold group-hover:bg-grey-250 dark:bg-grey-900'>Aa</div>
);

const FontMeta: React.FC<{label: React.ReactNode; creator?: string}> = ({label, creator}) => (
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
                <FontMeta creator={optionProps.data.creator} label={children} />
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
                <FontMeta creator={optionProps.data.creator} label={children} />
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

// ─── Publication Images Section ───────────────────────────────────────────────

interface PublicationImagesProps {
    values: GlobalSettingValues;
    updateSetting: (key: string, value: SettingValue) => void;
    unsplashEnabled: boolean | undefined;
    showUnsplash: boolean;
    setShowUnsplash: (show: boolean) => void;
    uploadWithErrorHandling: (file: File, onSuccess: (url: string) => void) => Promise<void>;
    editor: ReturnType<typeof usePinturaEditor>;
    unsplashConfig: ReturnType<typeof useFramework>['unsplashConfig'];
}

const PublicationImagesForm: React.FC<PublicationImagesProps> = ({
    values,
    updateSetting,
    unsplashEnabled,
    showUnsplash,
    setShowUnsplash,
    uploadWithErrorHandling,
    editor,
    unsplashConfig
}) => (
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
                    onUpload={file => uploadWithErrorHandling(file, url => updateSetting('icon', url))}
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
            <ImageUpload
                deleteButtonClassName='!top-1 !right-1'
                height='60px'
                id='site-logo'
                imageBWCheckedBg={true}
                imageFit='contain'
                imageURL={values.logo || ''}
                width='160px'
                onDelete={() => updateSetting('logo', null)}
                onUpload={file => uploadWithErrorHandling(file, url => updateSetting('logo', url))}
            >
                Upload logo
            </ImageUpload>
        </div>

        <div className='mt-2 flex items-start justify-between' data-testid='publication-cover'>
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
                                updateSetting('cover_image', getImageUrl(await (async () => {
                                    const {mutateAsync: uploadImage} = useUploadImage();
                                    return uploadImage({file});
                                })()));
                            } catch (e) {
                                const handleError = useHandleError();
                                handleError(e);
                            }
                        }
                    })
                }}
                unsplashButtonClassName='!bg-transparent !h-6 !top-1.5 !w-6 !right-1.5 z-50'
                unsplashEnabled={unsplashEnabled}
                width='160px'
                onDelete={() => updateSetting('cover_image', null)}
                onUpload={file => uploadWithErrorHandling(file, url => updateSetting('cover_image', url))}
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
    </Form