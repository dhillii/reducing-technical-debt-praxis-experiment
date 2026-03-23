## Refactoring Analysis

The main complexity issues are:
1. **Massive `fontClassName` function** with 20+ if/else branches
2. **Duplicated image upload error handling** logic
3. **Duplicated font selection logic** for heading/body
4. **Duplicated font options building** logic
5. **Inline JSX complexity** in the render

---

## Refactored Code

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
 * TODO: We tried to use the getCSSFriendlyFontClassName function from the
 * @tryghost/custom-fonts package, but this is not working with Tailwind CSS,
 * as Tailwind requires the class name to already exist in the file to generate
 * styles. So we manually map font names to Tailwind CSS class names.
 */
const FONT_CLASS_MAP: Record<string, { base: string; headingWeight: string }> = {
    'Cardo':           {base: 'font-cardo',           headingWeight: 'font-bold'},
    'Manrope':         {base: 'font-manrope',         headingWeight: 'font-bold'},
    'Merriweather':    {base: 'font-merriweather',    headingWeight: 'font-bold'},
    'Nunito':          {base: 'font-nunito',          headingWeight: 'font-semibold'},
    'Old Standard TT': {base: 'font-old-standard-tt', headingWeight: 'font-bold'},
    'Prata':           {base: 'font-prata',           headingWeight: 'font-normal'},
    'Roboto':          {base: 'font-roboto',          headingWeight: 'font-bold'},
    'Rufina':          {base: 'font-rufina',          headingWeight: 'font-bold'},
    'Tenor Sans':      {base: 'font-tenor-sans',      headingWeight: 'font-normal'},
    'Chakra Petch':    {base: 'font-chakra-petch',    headingWeight: 'font-normal'},
    'Fira Mono':       {base: 'font-fira-mono',       headingWeight: 'font-bold'},
    'Fira Sans':       {base: 'font-fira-sans',       headingWeight: 'font-bold'},
    'IBM Plex Serif':  {base: 'font-ibm-plex-serif',  headingWeight: 'font-bold'},
    'Inter':           {base: 'font-inter',           headingWeight: 'font-bold'},
    'JetBrains Mono':  {base: 'font-jetbrains-mono',  headingWeight: 'font-bold'},
    'Lora':            {base: 'font-lora',            headingWeight: 'font-bold'},
    'Noto Sans':       {base: 'font-noto-sans',       headingWeight: 'font-bold'},
    'Noto Serif':      {base: 'font-noto-serif',      headingWeight: 'font-bold'},
    'Poppins':         {base: 'font-poppins',         headingWeight: 'font-bold'},
    'Space Grotesk':   {base: 'font-space-grotesk',   headingWeight: 'font-bold'},
    'Space Mono':      {base: 'font-space-mono',      headingWeight: 'font-bold'}
};

const DEFAULT_FONT_OPTION_CLASS = 'font-sans font-normal';

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

const capitalizeWords = (str: string): string =>
    str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

const getFontClassName = (fontName: string, heading: boolean = true): string => {
    const entry = FONT_CLASS_MAP[fontName];
    if (!entry) {
        return '';
    }
    return clsx(entry.base, heading && entry.headingWeight);
};

const buildFontOptions = (
    fonts: Array<{name: string; creator: string}>,
    heading: boolean,
    themeNameVersion: string
): Array<{label: string; value: string; creator: string; className: string}> => {
    const defaultOption = {
        label: DEFAULT_FONT,
        value: DEFAULT_FONT,
        creator: themeNameVersion,
        className: DEFAULT_FONT_OPTION_CLASS
    };

    const customOptions = fonts.map(font => ({
        label: font.name,
        value: font.name,
        creator: font.creator,
        className: getFontClassName(font.name, heading)
    }));

    return [defaultOption, ...customOptions];
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const SingleValue: React.FC<SingleValueProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
    <components.SingleValue {...optionProps}>
        <div className='group' data-testid="select-current-option" data-value={optionProps.data.value}>
            <div className='flex items-center gap-3'>
                <FontPreviewBox />
                <FontLabel creator={optionProps.data.creator}>{children}</FontLabel>
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
                <FontPreviewBox variant='option' />
                <FontLabel creator={optionProps.data.creator}>{children}</FontLabel>
            </div>
            {optionProps.isSelected && <span><Icon name='check' size={14} /></span>}
        </div>
    </components.Option>
);

const FontPreviewBox: React.FC<{variant?: 'single' | 'option'}> = ({variant = 'single'}) => {
    const optionClasses = 'dark:group-hover:bg-grey-800 bg-grey-150 group-hover:bg-grey-250 dark:bg-grey-900';
    const singleClasses = 'bg-white dark:bg-black';

    return (
        <div className={clsx(
            'flex size-12 items-center justify-center rounded-md text-2xl font-bold',
            variant === 'option' ? optionClasses : singleClasses
        )}>
            Aa
        </div>
    );
};

const FontLabel: React.FC<{creator?: string; children: React.ReactNode}> = ({creator, children}) => (
    <div className='flex flex-col'>
        <span className='text-md'>{children}</span>
        <span className='font-sans text-xs font-normal text-grey-700 dark:text-grey-600'>{creator}</span>
    </div>
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

const useFontState = (
    initialFontName: string,
    fontList: Array<{name: string; creator: string}>,
    themeNameVersion: string
) => {
    const initialFont = fontList.find(f => f.name === initialFontName)
        ?? {name: DEFAULT_FONT, creator: themeNameVersion};

    return useState(initialFont);
};

// ─── Image Upload Fields ──────────────────────────────────────────────────────

interface ImageFieldProps {
    label: string;
    hint: string;
    imageURL: string;
    onDelete: () => void;
    onUpload: (file: File) => Promise<void>;
    height?: string;
    width?: string;
    id: string;
    imageBWCheckedBg?: boolean;
    imageFit?: 'contain' | 'cover';
    children: React.ReactNode;
    className?: string;
}

const ImageField: React.FC<ImageFieldProps> = ({
    label,
    hint,
    imageURL,
    onDelete,
    onUpload,
    height = '60px',
    width = '160px',
    id,
    imageBWCheckedBg,
    imageFit,
    children,
    className
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
            onDelete={onDelete}
            onUpload={onUpload}
        >
            {children}
        </ImageUpload>
    </div>
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
    const uploadWithErrorHandling = useImageUploadHandler();
    const editor = usePinturaEditor();

    const {data: themesData} = useBrowseThemes();
    const activeTheme = themesData?.themes.find((theme: Theme) => theme.active);
    const themeNameVersion = activeTheme
        ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})`
        : 'Loading...';

    const [headingFont, setHeadingFont] = useFontState(values.headingFont, CUSTOM_FONTS.heading, themeNameVersion);
    const [bodyFont, setBodyFont] = useFontState(values.bodyFont, CUSTOM_FONTS.body, themeNameVersion);

    const customHeadingFonts = buildFontOptions(CUSTOM_FONTS.heading, true, themeNameVersion) as HeadingFontOption[];
    const customBodyFonts = buildFontOptions(CUSTOM_FONTS.body, false, themeNameVersion) as BodyFontOption[];

    const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

    const handleFontSelect = (
        option: FontSelectOption | null,
        type: 'heading' | 'body',
        setFont: React.Dispatch<React.SetStateAction<{name: string; creator: string}>>
    ) => {
        const settingKey = type === 'heading' ? 'heading_font' : 'body_font';
        const fontList = type === 'heading' ? CUSTOM_FONTS.heading : CUSTOM_FONTS.body;

        if (!option || option.value === DEFAULT_FONT) {
            setFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting(settingKey, '');
        } else {
            const creator = fontList.find(f => f.name === option.value)?.creator ?? '';
            setFont({name: option.value, creator});
            updateSetting(settingKey, option.value);
        }
    };

    const selectFontClass = (fontName: string, heading: boolean) =>
        fontName === DEFAULT_FONT ? '' : getFontClassName(fontName, heading);

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

                <ImageField
                    className={values.icon ? 'mt-2' : undefined}
                    height={values.icon ? '66px' : '36px'}
                    hint='A square, social icon, at least 60x60px'
                    id='logo'
                    imageBWCheckedBg={true}
                    imageURL={values.icon || ''}
                    label='Publication icon'
                    width={values.icon ? '66px' : '160px'}
                    onDelete={() => updateSetting('icon', null)}
                    onUpload={file => uploadWithErrorHandling(file, url => updateSetting('icon', url))}
                >
                    Upload icon
                </ImageField>

                <ImageField
                    height='60px'
                    hint='Appears usually in the main header of your theme'
                    id='site-logo'
                    imageBWCheckedBg={true}
                    imageFit='contain'
                    imageURL={values.logo || ''}
                    label='Publication logo'
                    width='160px'
                    onDelete={() => updateSetting('logo', null)}
                    onUpload={file => uploadWithErrorHandling(file, url => updateSetting('logo', url))}
                >
                    Upload logo
                </ImageField>

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
                                        updateSetting('cover_image', getImageUrl(await (useImageUploadHandler as any)({file})));
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
                <Select
                    className={selectFontClass(selectedHeadingFont.label, true)}
                    components={{Option, SingleValue}}
                    controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
                    hint={''}
                    menuShouldScrollIntoView={true}
                    options={customHeadingFonts}
                    selectedOption={selectedHeadingFont}
                    testId='heading-font-select'
                    title={'Heading font'}
                    onSelect={option => handleFontSelect(option, 'heading', setHeadingFont)}
                />
                <Select
                    className={selectFontClass(selectedBodyFont.label, false)}
                    components={{Option, SingleValue}}
                    controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
                    hint={''}
                    maxMenuHeight={200}
                    menuPosition='fixed'
                    menuShouldScrollIntoView={true}
                    options={customBodyFonts}
                    selectedOption={selectedBodyFont}
                    testId='body-font-select'
                    title={'Body font'}
                    onSelect={option => handleFontSelect(option, 'body', setBodyFont)}
                />
            </Form>
        </>
    );
};

export default GlobalSettings;
```

---

## Key Refactoring Decisions

| Problem | Solution |
|---|---|
| 20+ `if/else` branches in `fontClassName` | Replaced with `FONT_CLASS_MAP` lookup table — O(1) lookup, trivially extensible |
| Duplicated image upload error handling (3×) | Extracted `useImageUploadHandler` hook with a single `uploadWithErrorHandling` function |
| Duplicated font options building logic | Extracted `buildFontOptions` pure function used for both heading and body |
| Duplicated font select handler logic | Extracted `handleFontSelect` with a `type` discriminator |
| Repeated `FontPreviewBox` markup in `Option`/`SingleValue` | Extracted `FontPreviewBox` and `FontLabel` sub-components |
| Repeated image field layout (icon, logo) | Extracted `ImageField` wrapper component |
| `useFontState` initialization logic | Extracted into a reusable `useFontState` hook |