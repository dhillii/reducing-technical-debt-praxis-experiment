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
 * Maps font names to their Tailwind CSS class names.
 *
 * TODO: We tried to use the getCSSFriendlyFontClassName function from the
 * @tryghost/custom-fonts package, but this is not working with Tailwind CSS,
 * as Tailwind requires class names to be present in the file at build time.
 * So we manually map font names to Tailwind class names here.
 */
const FONT_CLASS_MAP: Record<string, { base: string; headingWeight: string }> = {
    'Cardo':           {base: 'font-cardo',           headingWeight: 'font-bold'},
    'Manrope':         {base: 'font-manrope',         headingWeight: 'font-bold'},
    'Merriweather':    {base: 'font-merriweather',     headingWeight: 'font-bold'},
    'Nunito':          {base: 'font-nunito',           headingWeight: 'font-semibold'},
    'Old Standard TT': {base: 'font-old-standard-tt', headingWeight: 'font-bold'},
    'Prata':           {base: 'font-prata',            headingWeight: 'font-normal'},
    'Roboto':          {base: 'font-roboto',           headingWeight: 'font-bold'},
    'Rufina':          {base: 'font-rufina',           headingWeight: 'font-bold'},
    'Tenor Sans':      {base: 'font-tenor-sans',       headingWeight: 'font-normal'},
    'Chakra Petch':    {base: 'font-chakra-petch',     headingWeight: 'font-normal'},
    'Fira Mono':       {base: 'font-fira-mono',        headingWeight: 'font-bold'},
    'Fira Sans':       {base: 'font-fira-sans',        headingWeight: 'font-bold'},
    'IBM Plex Serif':  {base: 'font-ibm-plex-serif',  headingWeight: 'font-bold'},
    'Inter':           {base: 'font-inter',            headingWeight: 'font-bold'},
    'JetBrains Mono':  {base: 'font-jetbrains-mono',  headingWeight: 'font-bold'},
    'Lora':            {base: 'font-lora',             headingWeight: 'font-bold'},
    'Noto Sans':       {base: 'font-noto-sans',        headingWeight: 'font-bold'},
    'Noto Serif':      {base: 'font-noto-serif',       headingWeight: 'font-bold'},
    'Poppins':         {base: 'font-poppins',          headingWeight: 'font-bold'},
    'Space Grotesk':   {base: 'font-space-grotesk',   headingWeight: 'font-bold'},
    'Space Mono':      {base: 'font-space-mono',       headingWeight: 'font-bold'},
};

const DEFAULT_FONT_CLASS = 'font-sans font-normal';

// ─── Utilities ───────────────────────────────────────────────────────────────

const capitalizeWords = (str: string): string =>
    str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

const getFontClassName = (fontName: string, isHeading: boolean = true): string => {
    const font = FONT_CLASS_MAP[fontName];
    if (!font) {
        return '';
    }
    return clsx(font.base, isHeading && font.headingWeight);
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
        {label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeNameVersion, className: DEFAULT_FONT_CLASS},
        ...options,
    ];
};

// ─── Sub-components ──────────────────────────────────────────────────────────

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

// ─── Hooks ───────────────────────────────────────────────────────────────────

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

// ─── Main Component ──────────────────────────────────────────────────────────

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
    const uploadImage = useImageUploadHandler();

    const {data: themesData} = useBrowseThemes();
    const activeTheme = themesData?.themes.find((theme: Theme) => theme.active);
    const themeNameVersion = activeTheme
        ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})`
        : 'Loading...';

    const [headingFont, setHeadingFont] = useFontState(values.headingFont, CUSTOM_FONTS.heading, themeNameVersion);
    const [bodyFont, setBodyFont] = useFontState(values.bodyFont, CUSTOM_FONTS.body, themeNameVersion);

    const headingFontOptions = buildFontOptions(CUSTOM_FONTS.heading, true, themeNameVersion);
    const bodyFontOptions = buildFontOptions(CUSTOM_FONTS.body, false, themeNameVersion);

    const selectedHeadingFont = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBodyFont = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

    const handleFontSelect = (
        option: FontSelectOption | null,
        isHeading: boolean,
        fontList: Array<{name: string; creator: string}>,
        setFont: React.Dispatch<React.SetStateAction<{name: string; creator: string}>>,
        settingKey: string
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
                    imageURL={values.icon || ''}
                    label='Publication icon'
                    uploadProps={{
                        id: 'logo',
                        imageBWCheckedBg: true,
                        height: values.icon ? '66px' : '36px',
                        width: values.icon ? '66px' : '160px',
                    }}
                    onDelete={() => updateSetting('icon', null)}
                    onUpload={file => uploadImage(file, url => updateSetting('icon', url))}
                >
                    Upload icon
                </PublicationImageField>

                <PublicationImageField
                    className={values.icon ? 'mt-2' : ''}
                    hint='Appears usually in the main header of your theme'
                    imageURL={values.logo || ''}
                    label='Publication logo'
                    uploadProps={{
                        id: 'site-logo',
                        imageBWCheckedBg: true,
                        imageFit: 'contain',
                        height: '60px',
                        width: '160px',
                    }}
                    onDelete={() => updateSetting('logo', null)}
                    onUpload={file => uploadImage(file, url => updateSetting('logo', url))}
                >
                    Upload logo
                </PublicationImageField>

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
                                    await uploadImage(file, url => updateSetting('cover_image', url));
                                },
                            }),
                        }}
                        unsplashButtonClassName='!bg-transparent !h-6 !top-1.5 !w-6 !right-1.5 z-50'
                        unsplashEnabled={unsplashEnabled}
                        width='160px'
                        onDelete={() => updateSetting('cover_image', null)}
                        onUpload={file => uploadImage(file, url => updateSetting('cover_image', url))}
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
                    components={{Option, SingleValue}}
                    controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
                    hint={''}
                    menuShouldScrollIntoView={true}
                    options={headingFontOptions}
                    selectedOption={selectedHeadingFont}
                    testId='heading-font-select'
                    title={'Heading font'}
                    onSelect={option => handleFontSelect(option, true, CUSTOM_FONTS.heading, setHeadingFont, 'heading_font')}
                />
                <Select
                    className={getFontClassName(selectedBodyFont.label, false)}
                    components={{Option, SingleValue}}
                    controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
                    hint={''}
                    maxMenuHeight={200}
                    menuPosition='fixed'
                    menuShouldScrollIntoView={true}
                    options={bodyFontOptions}
                    selectedOption={selectedBodyFont}
                    testId='body-font-select'
                    title={'Body font'}
                    onSelect={option => handleFontSelect(option, false, CUSTOM_FONTS.body, setBodyFont, 'body_font')}
                />
            </Form>
        </>
    );
};

// ─── Helper Sub-component ────────────────────────────────────────────────────

interface PublicationImageFieldProps {
    label: string;
    hint: string;
    imageURL: string;
    className?: string;
    uploadProps: Record<string, unknown>;
    onDelete: () => void;
    onUpload: (file: File) => void;
    children: React.ReactNode;
}

const PublicationImageField: React.FC<PublicationImageFieldProps> = ({
    label,
    hint,
    imageURL,
    className = '',
    uploadProps,
    onDelete,
    onUpload,
    children,
}) => (
    <div className={clsx('flex items-start justify-between', className)}>
        <div>
            <div>{label}</div>
            <Hint className='!mt-0 mr-5 max-w-[160px]'>{hint}</Hint>
        </div>
        <div className='flex gap-3'>
            <ImageUpload
                deleteButtonClassName='!top-1 !right-1'
                editButtonClassName='!top-1 !right-1'
                imageURL={imageURL}
                onDelete={onDelete}
                onUpload={onUpload}
                {...uploadProps}
            >
                {children}
            </ImageUpload>
        </div>
    </div>
);

export default GlobalSettings;
```

---

## Key Refactoring Decisions

| Problem | Solution |
|---|---|
| 20+ `if/else` branches in `fontClassName` | Replaced with `FONT_CLASS_MAP` lookup table — O(1) lookup, trivially extensible |
| Duplicated `try/catch` upload error handling (3×) | Extracted `useImageUploadHandler` hook with a single `uploadWithErrorHandling` function |
| Duplicated font options array building | Extracted `buildFontOptions` utility, eliminating two near-identical blocks |
| Duplicated font select handler logic | Extracted `handleFontSelect` with parameters for heading/body variants |
| Duplicated `useState` font initialization | Extracted `useFontState` hook encapsulating the find-or-default pattern |
| Repeated icon/logo image field JSX structure | Extracted `PublicationImageField` sub-component |
| `selectFont` wrapper was redundant | Replaced with direct `getFontClassName` call (the `DEFAULT_FONT` case naturally returns `''`) |