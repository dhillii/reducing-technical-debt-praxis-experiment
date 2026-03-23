I'll refactor this code to reduce complexity by:
1. Extracting the font class mapping into a data structure
2. Creating reusable hooks and helper functions
3. Splitting large components into smaller ones
4. Reducing repetitive code patterns

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
    'Cardo':          {base: 'font-cardo',          headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Manrope':        {base: 'font-manrope',         headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Merriweather':   {base: 'font-merriweather',    headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Nunito':         {base: 'font-nunito',          headingWeight: 'font-semibold',bodyWeight: 'font-normal'},
    'Old Standard TT':{base: 'font-old-standard-tt', headingWeight: 'font-bold',   bodyWeight: 'font-normal'},
    'Prata':          {base: 'font-prata',           headingWeight: 'font-normal',  bodyWeight: 'font-normal'},
    'Roboto':         {base: 'font-roboto',          headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Rufina':         {base: 'font-rufina',          headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Tenor Sans':     {base: 'font-tenor-sans',      headingWeight: 'font-normal',  bodyWeight: 'font-normal'},
    'Chakra Petch':   {base: 'font-chakra-petch',    headingWeight: 'font-normal',  bodyWeight: 'font-normal'},
    'Fira Mono':      {base: 'font-fira-mono',       headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Fira Sans':      {base: 'font-fira-sans',       headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'IBM Plex Serif': {base: 'font-ibm-plex-serif',  headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Inter':          {base: 'font-inter',           headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'JetBrains Mono': {base: 'font-jetbrains-mono',  headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Lora':           {base: 'font-lora',            headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Noto Sans':      {base: 'font-noto-sans',       headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Noto Serif':     {base: 'font-noto-serif',      headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Poppins':        {base: 'font-poppins',         headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Space Grotesk':  {base: 'font-space-grotesk',   headingWeight: 'font-bold',    bodyWeight: 'font-normal'},
    'Space Mono':     {base: 'font-space-mono',      headingWeight: 'font-bold',    bodyWeight: 'font-normal'}
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const capitalizeWords = (str: string): string =>
    str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

const getFontClassName = (fontName: string, isHeading: boolean = true): string => {
    const fontConfig = FONT_CLASS_MAP[fontName];
    if (!fontConfig) {
        return '';
    }
    return clsx(fontConfig.base, isHeading ? fontConfig.headingWeight : fontConfig.bodyWeight);
};

const buildFontOptions = (
    fonts: Array<{name: string; creator: string}>,
    isHeading: boolean,
    themeNameVersion: string
): Array<HeadingFontOption | BodyFontOption> => {
    const defaultOption = {
        label: DEFAULT_FONT,
        value: DEFAULT_FONT,
        creator: themeNameVersion,
        className: 'font-sans font-normal'
    } as HeadingFontOption | BodyFontOption;

    const customOptions = fonts.map(({name, creator}) => ({
        label: name,
        value: name,
        creator,
        className: getFontClassName(name, isHeading)
    })) as Array<HeadingFontOption | BodyFontOption>;

    return [defaultOption, ...customOptions];
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const SingleValue: React.FC<SingleValueProps<FontSelectOption, false>> = ({children, ...optionProps}) => (
    <components.SingleValue {...optionProps}>
        <div className='group' data-testid='select-current-option' data-value={optionProps.data.value}>
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
            data-testid='select-option'
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

// ─── Image Upload Field ───────────────────────────────────────────────────────

interface ImageFieldProps {
    label: string;
    hint: string;
    id: string;
    imageURL: string;
    settingKey: string;
    height?: string;
    width?: string;
    imageFit?: 'contain' | 'cover';
    imageBWCheckedBg?: boolean;
    dynamicHeight?: boolean;
    updateSetting: (key: string, value: SettingValue) => void;
    uploadImage: (args: {file: File}) => Promise<unknown>;
    handleError: (error: unknown) => void;
    children: React.ReactNode;
    extraProps?: Record<string, unknown>;
    wrapperClassName?: string;
}

const ImageField: React.FC<ImageFieldProps> = ({
    label,
    hint,
    id,
    imageURL,
    settingKey,
    height = '60px',
    width = '160px',
    imageFit,
    imageBWCheckedBg,
    updateSetting,
    uploadImage,
    handleError,
    children,
    extraProps = {},
    wrapperClassName = ''
}) => {
    const handleUpload = async (file: File) => {
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

    return (
        <div className={clsx('flex items-start justify-between', wrapperClassName)}>
            <div>
                <div>{label}</div>
                <Hint className='!mt-0 mr-5 max-w-[160px]'>{hint}</Hint>
            </div>
            <ImageUpload
                deleteButtonClassName='!top-1 !right-1'
                height={height}
                id={id}
                imageBWCheckedBg={imageBWCheckedBg}
                imageFit={imageFit}
                imageURL={imageURL}
                width={width}
                onDelete={() => updateSetting(settingKey, null)}
                onUpload={handleUpload}
                {...extraProps}
            >
                {children}
            </ImageUpload>
        </div>
    );
};

// ─── Font Select ─────────────────────────────────────────────────────────────

interface FontSelectProps {
    title: string;
    testId: string;
    isHeading: boolean;
    selectedFont: {name: string; creator: string};
    fontOptions: Array<HeadingFontOption | BodyFontOption>;
    fontSources: Array<{name: string; creator: string}>;
    settingKey: string;
    defaultCreator: string;
    setFont: (font: {name: string; creator: string}) => void;
    updateSetting: (key: string, value: SettingValue) => void;
    extraSelectProps?: Record<string, unknown>;
}

const FontSelect: React.FC<FontSelectProps> = ({
    title,
    testId,
    isHeading,
    selectedFont,
    fontOptions,
    fontSources,
    settingKey,
    defaultCreator,
    setFont,
    updateSetting,
    extraSelectProps = {}
}) => {
    const selectedOption = {label: selectedFont.name, value: selectedFont.name, creator: selectedFont.creator};
    const selectClassName = selectedFont.name !== DEFAULT_FONT ? getFontClassName(selectedFont.name, isHeading) : '';

    const handleSelect = (option: FontSelectOption | null) => {
        if (!option || option.value === DEFAULT_FONT) {
            setFont({name: DEFAULT_FONT, creator: defaultCreator});
            updateSetting(settingKey, '');
        } else {
            const creator = fontSources.find(f => f.name === option.value)?.creator || '';
            setFont({name: option.value, creator});
            updateSetting(settingKey, option.value);
        }
    };

    return (
        <Select
            className={selectClassName}
            components={{Option, SingleValue}}
            controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
            hint={''}
            menuShouldScrollIntoView={true}
            options={fontOptions}
            selectedOption={selectedOption}
            testId={testId}
            title={title}
            onSelect={handleSelect}
            {...extraSelectProps}
        />
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

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

    const [headingFont, setHeadingFont] = useState(
        CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );
    const [bodyFont, setBodyFont] = useState(
        CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) || {name: DEFAULT_FONT, creator: themeNameVersion}
    );

    const headingFontOptions = buildFontOptions(CUSTOM_FONTS.heading, true, themeNameVersion);
    const bodyFontOptions = buildFontOptions(CUSTOM_FONTS.body, false, themeNameVersion);

    const sharedImageProps = {updateSetting, uploadImage, handleError};

    const handleCoverUpload = async (file: File) => {
        try {
            updateSetting('cover_image', getImageUrl(await uploadImage({file})));
        } catch (e) {
            const error = e as APIError;
            if (error.response?.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
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

                <ImageField
                    hint='A square, social icon, at least 60x60px'
                    id='logo'
                    imageURL={values.icon || ''}
                    imageBWCheckedBg={true}
                    label='Publication icon'
                    settingKey='icon'
                    height={values.icon ? '66px' : '36px'}
                    width={values.icon ? '66px' : '160px'}
                    extraProps={{editButtonClassName: '!top-1 !right-1'}}
                    {...sharedImageProps}
                >
                    Upload icon
                </ImageField>

                <ImageField
                    hint='Appears usually in the main header of your theme'
                    id='site-logo'
                    imageURL={values.logo || ''}
                    imageBWCheckedBg={true}
                    imageFit='contain'
                    label='Publication logo'
                    settingKey='logo'
                    wrapperClassName={values.icon ? 'mt-2' : ''}
                    {...sharedImageProps}
                >
                    Upload logo
                </ImageField>

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
                                        updateSetting('cover_image', getImageUrl(await uploadImage({file})));
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
                </div>
            </Form>

            <Form className='-mt-4' gap='sm' margins='lg' title='Typography'>
                <FontSelect
                    defaultCreator={themeNameVersion}
                    fontOptions={headingFontOptions}
                    fontSources={CUSTOM_FONTS.heading}
                    isHeading={true}
                    selectedFont={headingFont}
                    setFont={setHeadingFont}
                    settingKey='heading_font'
                    testId='heading-font-select'
                    title='Heading font'
                    updateSetting={updateSetting}
                />
                <FontSelect
                    defaultCreator={themeNameVersion}
                    extraSelectProps={{maxMenuHeight: 200, menuPosition: 'fixed'}}
                    fontOptions={bodyFontOptions}
                    fontSources={CUSTOM_FONTS.body}
                    isHeading={false}
                    selectedFont={bodyFont}
                    setFont={setBodyFont}
                    settingKey='body_font'
                    testId='body-font-select'
                    title='Body font'
                    updateSetting={updateSetting}
                />
            </Form>
        </>
    );
};

export default GlobalSettings;
```

Key refactoring improvements:

1. **`FONT_CLASS_MAP` lookup table** — Replaced the long `if/else` chain in `fontClassName` with a data-driven map, reducing ~60 lines to a clean record.

2. **`buildFontOptions` helper** — Extracted the repeated pattern of building heading/body font option arrays into a single reusable function.

3. **`ImageField` component** — Extracted the repeated image upload pattern (label, hint, upload/delete handlers, 415 error handling) into a dedicated component, eliminating ~60 lines of duplication.

4. **`FontSelect` component** — Extracted the repeated font `<Select>` pattern including the `onSelect` handler logic into a reusable component.

5. **`handleCoverUpload`** — Extracted the cover image upload handler to avoid an inline async function with complex logic.

6. **`sharedImageProps`** — Grouped common props passed to all `ImageField` instances to reduce repetition.

7. **`getFontClassName`** — Renamed and simplified `fontClassName`/`selectFont` into a single pure function using the map.