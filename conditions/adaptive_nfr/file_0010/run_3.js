## Refactored Code

Here's the refactored version with reduced complexity through several techniques:

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

export interface GlobalSettingValues {
    description: string;
    accentColor: string;
    icon: string | null;
    logo: string | null;
    coverImage: string | null;
    headingFont: string;
    bodyFont: string;
}

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
 * If you need to change a font, update that package.
 */
const DEFAULT_FONT = 'Theme default';

/**
 * TODO: We tried to use getCSSFriendlyFontClassName from @tryghost/custom-fonts,
 * but Tailwind requires class names to be present at build time.
 * Manual mapping is required until a better solution is found.
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
    'Space Mono':      {base: 'font-space-mono',      headingWeight: 'font-bold',    bodyWeight: 'font-bold'},
};

// ─── Utilities ───────────────────────────────────────────────────────────────

const capitalizeWords = (str: string): string =>
    str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

const getFontClassName = (fontName: string, isHeading: boolean = true): string => {
    const entry = FONT_CLASS_MAP[fontName];
    if (!entry) {
        return '';
    }
    return clsx(entry.base, isHeading ? entry.headingWeight : entry.bodyWeight);
};

const buildFontOptions = (
    fonts: Array<{name: string; creator: string}>,
    isHeading: boolean,
    themeNameVersion: string
): Array<HeadingFontOption | BodyFontOption> => {
    const options = fonts.map(({name, creator}) => ({
        label: name,
        value: name,
        creator,
        className: getFontClassName(name, isHeading),
    }));

    return [
        {label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion, className: 'font-sans font-normal'},
        ...options,
    ] as Array<HeadingFontOption | BodyFontOption>;
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const FontPreviewBox: React.FC = () => (
    <div className='flex size-12 items-center justify-center rounded-md text-2xl font-bold'>
        Aa
    </div>
);

const SingleValue: React.FC<SingleValueProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
    <components.SingleValue {...optionProps}>
        <div className='group' data-testid='select-current-option' data-value={optionProps.data.value}>
            <div className='flex items-center gap-3'>
                <FontPreviewBox />
                <div className='flex flex-col'>
                    <span className='text-md'>{children}</span>
                    <span className='font-sans text-xs font-normal text-grey-700 dark:text-grey-600'>
                        {optionProps.data.creator}
                    </span>
                </div>
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
                <div className='dark:group-hover:bg-grey-800 flex size-12 items-center justify-center rounded-md bg-grey-150 text-2xl font-bold group-hover:bg-grey-250 dark:bg-grey-900'>
                    Aa
                </div>
                <div className='flex flex-col'>
                    <span className='text-md'>{children}</span>
                    <span className='font-sans text-xs font-normal text-grey-700 dark:text-grey-600'>
                        {optionProps.data.creator}
                    </span>
                </div>
            </div>
            {optionProps.isSelected && <span><Icon name='check' size={14} /></span>}
        </div>
    </components.Option>
);

// ─── Hooks ───────────────────────────────────────────────────────────────────

const useImageUploadHandler = (
    settingKey: string,
    uploadImage: (args: {file: File}) => Promise<unknown>,
    updateSetting: (key: string, value: SettingValue) => void,
    handleError: (error: unknown) => void
) => async (file: File) => {
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

const useFontState = (
    initialFontName: string,
    fontList: Array<{name: string; creator: string}>,
    themeNameVersion: string
) => {
    const initialFont = fontList.find(f => f.name === initialFontName)
        ?? {name: DEFAULT_FONT, creator: themeNameVersion};

    return useState(initialFont);
};

// ─── Sub-components (Image Fields) ───────────────────────────────────────────

interface ImageFieldProps {
    label: string;
    hint: string;
    children: React.ReactNode;
    className?: string;
}

const ImageField: React.FC<ImageFieldProps> = ({label, hint, children, className}) => (
    <div className={clsx('flex items-start justify-between', className)}>
        <div>
            <div>{label}</div>
            <Hint className='!mt-0 mr-5 max-w-[160px]'>{hint}</Hint>
        </div>
        {children}
    </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────

const GlobalSettings: React.FC<{
    values: GlobalSettingValues;
    updateSetting: (key: string, value: SettingValue) => void;
}> = ({values, updateSetting}) => {
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

    const [headingFont, setHeadingFont] = useFontState(values.headingFont, CUSTOM_FONTS.heading, themeNameVersion);
    const [bodyFont, setBodyFont] = useFontState(values.bodyFont, CUSTOM_FONTS.body, themeNameVersion);

    const handleIconUpload = useImageUploadHandler('icon', uploadImage, updateSetting, handleError);
    const handleLogoUpload = useImageUploadHandler('logo', uploadImage, updateSetting, handleError);
    const handleCoverUpload = useImageUploadHandler('cover_image', uploadImage, updateSetting, handleError);

    const customHeadingFonts = buildFontOptions(CUSTOM_FONTS.heading, true, themeNameVersion);
    const customBodyFonts = buildFontOptions(CUSTOM_FONTS.body, false, themeNameVersion);

    const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

    const handleFontSelect = (
        option: FontSelectOption | null,
        isHeading: boolean,
        setFont: React.Dispatch<React.SetStateAction<{name: string; creator: string}>>,
        settingKey: string,
        fontList: Array<{name: string; creator: string}>
    ) => {
        if (!option || option.value === DEFAULT_FONT) {
            setFont({name: DEFAULT_FONT, creator: themeNameVersion});
            updateSetting(settingKey, '');
        } else {
            const creator = fontList.find(f => f.name === option.value)?.creator ?? '';
            setFont({name: option.value, creator});
            updateSetting(settingKey, option.value);
        }
    };

    const selectFontClassName = (fontName: string, isHeading: boolean) =>
        fontName === DEFAULT_FONT ? '' : getFontClassName(fontName, isHeading);

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

                <ImageField hint='A square, social icon, at least 60x60px' label='Publication icon'>
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
                </ImageField>

                <ImageField
                    className={values.icon ? 'mt-2' : ''}
                    hint='Appears usually in the main header of your theme'
                    label='Publication logo'
                >
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
                </ImageField>

                <ImageField
                    className='mt-2'
                    hint='Usually as a large banner image on your index pages'
                    label='Publication cover'
                >
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
                                        updateSetting('cover_image', getImageUrl(await uploadImage({file})));
                                    } catch (e) {
                                        handleError(e);
                                    }
                                },
                            }),
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
                </ImageField>
            </Form>

            <Form className='-mt-4' gap='sm' margins='lg' title='Typography'>
                <Select
                    className={selectFontClassName(selectedHeadingFont.label, true)}
                    components={{Option, SingleValue}}
                    controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
                    hint={''}
                    menuShouldScrollIntoView={true}
                    options={customHeadingFonts}
                    selectedOption={selectedHeadingFont}
                    testId='heading-font-select'
                    title={'Heading font'}
                    onSelect={option => handleFontSelect(option, true, setHeadingFont, 'heading_font', CUSTOM_FONTS.heading)}
                />
                <Select
                    className={selectFontClassName(selectedBodyFont.label, false)}
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
                    onSelect={option => handleFontSelect(option, false, setBodyFont, 'body_font', CUSTOM_FONTS.body)}
                />
            </Form>
        </>
    );
};

export default GlobalSettings;
```

---

## Key Refactoring Decisions

### 1. Replaced `fontClassName` chain with a lookup table (`FONT_CLASS_MAP`)
The 21-branch `if/else` was replaced with a plain object lookup. Adding a new font now requires one line instead of three.

### 2. Extracted `buildFontOptions` utility
The duplicated heading/body font array construction (including the `unshift` of the default) is now a single reusable function.

### 3. Extracted `useImageUploadHandler` hook
The identical try/catch upload pattern repeated three times is now a single factory function, eliminating ~30 lines of duplication.

### 4. Extracted `useFontState` hook
The repeated `useState` + `CUSTOM_FONTS.find` initialization pattern is encapsulated, making the initial state logic testable in isolation.

### 5. Extracted `ImageField` layout component
The repeated `flex items-start justify-between` wrapper with label + hint was extracted into a small presentational component, reducing JSX nesting.

### 6. Unified `handleFontSelect`
Both font `onSelect` handlers shared identical branching logic. A single parameterized function now handles both cases.

### 7. Simplified `selectFontClassName`
The `selectFont` function was renamed and inlined to a one-liner that clearly expresses intent.