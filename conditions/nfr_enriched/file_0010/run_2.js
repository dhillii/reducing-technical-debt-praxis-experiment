# Refactored GlobalSettings Component

Here's the refactored code with reduced complexity through several improvements:

## Key Changes
1. **Extracted font class mapping** into a lookup table (eliminates long if-else chain)
2. **Extracted reusable hooks/utilities** (`useImageUpload`, `useFontOptions`)
3. **Extracted sub-components** (`PublicationImageField`, `FontSelect`)
4. **Simplified font selection logic** into a single handler factory

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

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * All custom fonts are maintained in the @tryghost/custom-fonts package.
 * If you need to change a font, you'll need to update the @tryghost/custom-fonts package.
 */
const DEFAULT_FONT = 'Theme default';

/**
 * TODO: We tried to use the getCSSFriendlyFontClassName function from the @tryghost/custom-fonts package,
 * but this is not working with Tailwind CSS, as tailwind requires to have the class name already in the
 * file to be able to generate the styles.
 *
 * So we need to manually map the font names to the corresponding Tailwind CSS class names.
 */
const FONT_CLASS_MAP: Record<string, {base: string; headingWeight: string; bodyWeight: string}> = {
    'Cardo':           {base: 'font-cardo',           headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Manrope':         {base: 'font-manrope',         headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Merriweather':    {base: 'font-merriweather',    headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Nunito':          {base: 'font-nunito',          headingWeight: 'font-semibold',bodyWeight: 'font-normal'},
    'Old Standard TT': {base: 'font-old-standard-tt', headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Prata':           {base: 'font-prata',           headingWeight: 'font-normal',  bodyWeight: 'font-normal'},
    'Roboto':          {base: 'font-roboto',          headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Rufina':          {base: 'font-rufina',          headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Tenor Sans':      {base: 'font-tenor-sans',      headingWeight: 'font-normal',  bodyWeight: 'font-normal'},
    'Chakra Petch':    {base: 'font-chakra-petch',    headingWeight: 'font-normal',  bodyWeight: 'font-normal'},
    'Fira Mono':       {base: 'font-fira-mono',       headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Fira Sans':       {base: 'font-fira-sans',       headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'IBM Plex Serif':  {base: 'font-ibm-plex-serif',  headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Inter':           {base: 'font-inter',           headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'JetBrains Mono':  {base: 'font-jetbrains-mono',  headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Lora':            {base: 'font-lora',            headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Noto Sans':       {base: 'font-noto-sans',       headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Noto Serif':      {base: 'font-noto-serif',      headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Poppins':         {base: 'font-poppins',         headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Space Grotesk':   {base: 'font-space-grotesk',   headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Space Mono':      {base: 'font-space-mono',      headingWeight: 'font-bold',    bodyWeight: 'font-normal'}
};

// ─── Utilities ───────────────────────────────────────────────────────────────

const capitalizeWords = (str: string): string =>
    str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

const getFontClassName = (fontName: string, isHeading: boolean = true): string => {
    const font = FONT_CLASS_MAP[fontName];
    if (!font) {
        return '';
    }
    return clsx(font.base, isHeading ? font.headingWeight : font.bodyWeight);
};

const buildFontOptions = <T extends HeadingFontOption | BodyFontOption>(
    fonts: Array<{name: string; creator: string}>,
    isHeading: boolean,
    themeNameVersion: string
): T[] => {
    const defaultOption = {
        label: DEFAULT_FONT,
        value: DEFAULT_FONT,
        creator: themeNameVersion,
        className: 'font-sans font-normal'
    } as T;

    const options = fonts.map(({name, creator}) => ({
        label: name,
        value: name,
        creator,
        className: getFontClassName(name, isHeading)
    } as T));

    return [defaultOption, ...options];
};

// ─── Custom Select Components ─────────────────────────────────────────────────

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
        <div
            className={optionProps.isSelected ? 'relative flex w-full items-center justify-between gap-2' : 'group'}
            data-testid="select-option"
            data-value={optionProps.data.value}
        >
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

// ─── Hooks ────────────────────────────────────────────────────────────────────

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

const useActiveThemeVersion = (): string => {
    const {data: themesData} = useBrowseThemes();
    const activeTheme = themesData?.themes.find((theme: Theme) => theme.active);
    return activeTheme
        ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})`
        : 'Loading...';
};

const useFontState = (
    initialFontName: string,
    fontList: Array<{name: string; creator: string}>,
    themeNameVersion: string
) => {
    const initialFont = fontList.find(f => f.name === initialFontName)
        || {name: DEFAULT_FONT, creator: themeNameVersion};

    return useState(initialFont);
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface PublicationImageFieldProps {
    label: string;
    hint: string;
    id: string;
    imageURL: string;
    settingKey: string;
    className?: string;
    height?: string;
    width?: string;
    imageFit?: 'contain' | 'cover';
    imageBWCheckedBg?: boolean;
    updateSetting: (key: string, value: SettingValue) => void;
    uploadWithErrorHandling: (file: File, onSuccess: (url: string) => void) => Promise<void>;
}

const PublicationImageField: React.FC<PublicationImageFieldProps> = ({
    label,
    hint,
    id,
    imageURL,
    settingKey,
    className,
    height = '60px',
    width = '160px',
    imageFit,
    imageBWCheckedBg,
    updateSetting,
    uploadWithErrorHandling
}) => (
    <div className={clsx('flex items-start justify-between', className)}>
        <div>
            <div>{label}</div>
            <Hint className='!mt-0 mr-5 max-w-[160px]'>{hint}</Hint>
        </div>
        <ImageUpload
            deleteButtonClassName='!top-1 !right-1'
            editButtonClassName='!top-1 !right-1'
            height={height}
            id={id}
            imageBWCheckedBg={imageBWCheckedBg}
            imageFit={imageFit}
            imageURL={imageURL}
            width={width}
            onDelete={() => updateSetting(settingKey, null)}
            onUpload={file => uploadWithErrorHandling(file, url => updateSetting(settingKey, url))}
        >
            Upload {label.toLowerCase()}
        </ImageUpload>
    </div>
);

interface FontSelectProps {
    title: string;
    testId: string;
    isHeading: boolean;
    selectedFont: {name: string; creator: string};
    fontOptions: HeadingFontOption[] | BodyFontOption[];
    themeNameVersion: string;
    fontList: Array<{name: string; creator: string}>;
    settingKey: string;
    setFont: (font: {name: string; creator: string}) => void;
    updateSetting: (key: string, value: SettingValue) => void;
    maxMenuHeight?: number;
    menuPosition?: 'fixed' | 'absolute';
}

const FontSelect: React.FC<FontSelectProps> = ({
    title,
    testId,
    isHeading,
    selectedFont,
    fontOptions,
    themeNameVersion,
    fontList,
    settingKey,
    setFont,
    updateSetting,
    maxMenuHeight,
    menuPosition
}) => {
    const selectedOption = {
        label: selectedFont.name,
        value: selectedFont.name,
        creator: selectedFont.creator
    };

    const handleSelect = (option: FontSelectOption | null) => {
        if (!option) {
            return;
        }
        if (option.value === DEFAULT_FONT) {
            setFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting(settingKey, '');
        } else {
            const creator = fontList.find(f => f.name === option.value)?.creator || '';
            setFont({name: option.value, creator});
            updateSetting(settingKey, option.value);
        }
    };

    return (
        <Select
            className={selectedFont.name !== DEFAULT_FONT ? getFontClassName(selectedFont.name, isHeading) : ''}
            components={{Option, SingleValue}}
            controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
            hint={''}
            maxMenuHeight={maxMenuHeight}
            menuPosition={menuPosition}
            menuShouldScrollIntoView={true}
            options={fontOptions}
            selectedOption={selectedOption}
            testId={testId}
            title={title}
            onSelect={handleSelect}
        />
    );
};

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
    const themeNameVersion = useActiveThemeVersion();

    const [headingFont, setHeadingFont] = useFontState(values.headingFont, CUSTOM_FONTS.heading, themeNameVersion);
    const [bodyFont, setBodyFont] = useFontState(values.bodyFont, CUSTOM_FONTS.body, themeNameVersion);

    const headingFontOptions = buildFontOptions<HeadingFontOption>(CUSTOM_FONTS.heading, true, themeNameVersion);
    const bodyFontOptions = buildFontOptions<BodyFontOption>(CUSTOM_FONTS.body, false, themeNameVersion);

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

                <PublicationImageField
                    hint='A square, social icon, at least 60x60px'
                    id='logo'
                    imageBWCheckedBg={true}
                    imageURL={values.icon || ''}
                    label='Publication icon'
                    settingKey='icon'
                    updateSetting={updateSetting}
                    uploadWithErrorHandling={uploadWithErrorHandling}
                    height={values.icon ? '66px' : '36px'}
                    width={values.icon ? '66px' : '160px'}
                />

                <PublicationImageField
                    className={values.icon ? 'mt-2' : undefined}
                    hint='Appears usually in the main header of your theme'
                    id='site-logo'
                    imageBWCheckedBg={true}
                    imageFit='contain'
                    imageURL={values.logo || ''}
                    label='Publication logo'
                    settingKey='logo'
                    updateSetting={updateSetting}
                    uploadWithErrorHandling={uploadWithErrorHandling}
                />

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
                                    await uploadWithErrorHandling(
                                        file,
                                        url => updateSetting('cover_image', url)
                                    );
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
            </Form>

            <Form className='-mt-4' gap='sm' margins='lg' title='Typography'>
                <FontSelect
                    fontList={CUSTOM_FONTS.heading}
                    fontOptions={headingFontOptions}
                    isHeading={true}
                    selectedFont={headingFont}
                    setFont={setHeadingFont}
                    settingKey='heading_font'
                    testId='heading-font-select'
                    themeNameVersion={themeNameVersion}
                    title='Heading font'
                    updateSetting={updateSetting}
                />
                <FontSelect
                    fontList={CUSTOM_FONTS.body}
                    fontOptions={bodyFontOptions}
                    isHeading={false}
                    maxMenuHeight={200}
                    menuPosition='fixed'
                    selectedFont={bodyFont}
                    setFont={setBodyFont}
                    settingKey='body_font'
                    testId='body-font-select'
                    themeNameVersion={themeNameVersion}
                    title='Body font'
                    updateSetting={updateSetting}
                />
            </Form>
        </>
    );
};

export default GlobalSettings;
```

## Summary of Refactoring Decisions

| Problem | Solution |
|---|---|
| Long `if-else` chain in `fontClassName` | Replaced with `FONT_CLASS_MAP` lookup table |
| Duplicated image upload error handling | Extracted into `useImageUploadHandler` hook |
| Repeated theme version logic | Extracted into `useActiveThemeVersion` hook |
| Duplicated font state initialization | Extracted into `useFontState` hook |
| Duplicated font options building | Extracted into generic `buildFontOptions` utility |
| Repeated `PublicationImageField` JSX pattern | Extracted into `PublicationImageField` component |
| Duplicated `Select` + font handler logic | Extracted into `FontSelect` component |
| Inconsistent `error.response!.status` (non-null assertion) | Changed to safe `error.response?.status` |