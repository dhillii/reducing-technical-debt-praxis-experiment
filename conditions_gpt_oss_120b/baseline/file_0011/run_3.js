import React, {useState, useCallback, useMemo} from 'react';
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

type FontOption = {
    value: string;
    label: string;
    creator?: string;
    className?: string;
};

const DEFAULT_FONT = 'Theme default';

const SingleValue: React.FC<SingleValueProps<FontOption, false>> = ({children, ...props}) => (
    <components.SingleValue {...props}>
        <div className='group' data-testid="select-current-option" data-value={props.data.value}>
            <div className='flex items-center gap-3'>
                <div className='flex size-12 items-center justify-center rounded-md bg-white text-2xl font-bold dark:bg-black'>Aa</div>
                <div className='flex flex-col'>
                    <span className='text-md'>{children}</span>
                    <span className='font-sans text-xs font-normal text-grey-700 dark:text-grey-600'>{props.data.creator}</span>
                </div>
            </div>
        </div>
    </components.SingleValue>
);

const Option: React.FC<OptionProps<FontOption, false>> = ({children, ...props}) => (
    <components.Option {...props}>
        <div className={props.isSelected ? 'relative flex w-full items-center justify-between gap-2' : 'group'} data-testid="select-option" data-value={props.data.value}>
            <div className='flex items-center gap-3'>
                <div className='dark:group-hover:bg-grey-800 flex size-12 items-center justify-center rounded-md bg-grey-150 text-2xl font-bold group-hover:bg-grey-250 dark:bg-grey-900'>Aa</div>
                <div className='flex flex-col'>
                    <span className='text-md'>{children}</span>
                    <span className='font-sans text-xs font-normal text-grey-700 dark:text-grey-600'>{props.data.creator}</span>
                </div>
            </div>
            {props.isSelected && <Icon name='check' size={14} />}
        </div>
    </components.Option>
);

const capitalizeWords = (str: string) =>
    str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const fontClassMap: Record<string, string> = {
    Cardo: 'font-cardo',
    Manrope: 'font-manrope',
    Merriweather: 'font-merriweather',
    Nunito: 'font-nunito',
    'Old Standard TT': 'font-old-standard-tt',
    Prata: 'font-prata',
    Roboto: 'font-roboto',
    Rufina: 'font-rufina',
    'Tenor Sans': 'font-tenor-sans',
    'Chakra Petch': 'font-chakra-petch',
    'Fira Mono': 'font-fira-mono',
    'Fira Sans': 'font-fira-sans',
    'IBM Plex Serif': 'font-ibm-plex-serif',
    Inter: 'font-inter',
    'JetBrains Mono': 'font-jetbrains-mono',
    Lora: 'font-lora',
    'Noto Sans': 'font-noto-sans',
    'Noto Serif': 'font-noto-serif',
    Poppins: 'font-poppins',
    'Space Grotesk': 'font-space-grotesk',
    'Space Mono': 'font-space-mono'
};

const getFontClass = (name: string, heading: boolean) => {
    const base = fontClassMap[name] ?? '';
    if (!base) return '';
    const weight = heading ? 'font-bold' : 'font-normal';
    return clsx(base, weight);
};

const GlobalSettings: React.FC<{
    values: {
        description: string;
        accentColor: string;
        icon: string | null;
        logo: string | null;
        coverImage: string | null;
        headingFont: string;
        bodyFont: string;
    };
    updateSetting: (key: string, value: SettingValue) => void;
}> = ({values, updateSetting}) => {
    const {mutateAsync: uploadImage} = useUploadImage();
    const {settings} = useGlobalData();
    const [unsplashEnabled] = getSettingValues<boolean>(settings, ['unsplash']);
    const [showUnsplash, setShowUnsplash] = useState(false);
    const {unsplashConfig} = useFramework();
    const handleError = useHandleError();
    const editor = usePinturaEditor();

    const {data: themesData} = useBrowseThemes();
    const activeTheme = themesData?.themes.find((t: Theme) => t.active);
    const themeLabel = activeTheme ? `${capitalizeWords(activeTheme.name)} (v${activeTheme.package?.version || '1.0'})` : 'Loading...';

    const headingFont = useMemo(() => CUSTOM_FONTS.heading.find(f => f.name === values.headingFont) || {name: DEFAULT_FONT, creator: themeLabel}, [values.headingFont, themeLabel]);
    const bodyFont = useMemo(() => CUSTOM_FONTS.body.find(f => f.name === values.bodyFont) || {name: DEFAULT_FONT, creator: themeLabel}, [values.bodyFont, themeLabel]);

    const headingOptions = useMemo(() => {
        const opts = CUSTOM_FONTS.heading.map(f => ({
            label: f.name,
            value: f.name,
            creator: f.creator,
            className: getFontClass(f.name, true)
        }));
        opts.unshift({label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeLabel, className: 'font-sans font-normal'});
        return opts;
    }, [themeLabel]);

    const bodyOptions = useMemo(() => {
        const opts = CUSTOM_FONTS.body.map(f => ({
            label: f.name,
            value: f.name,
            creator: f.creator,
            className: getFontClass(f.name, false)
        }));
        opts.unshift({label: DEFAULT_FONT, value: DEFAULT_FONT, creator: themeLabel, className: 'font-sans font-normal'});
        return opts;
    }, [themeLabel]);

    const handleUpload = useCallback(
        async (file: File, key: string) => {
            try {
                const url = getImageUrl(await uploadImage({file}));
                updateSetting(key, url);
            } catch (e) {
                const err = e as APIError;
                if (err.response?.status === 415) {
                    err.message = 'Unsupported file type';
                }
                handleError(err);
            }
        },
        [uploadImage, updateSetting, handleError]
    );

    const handleHeadingSelect = useCallback(
        (option: FontOption | null) => {
            if (!option) return;
            if (option.value === DEFAULT_FONT) {
                updateSetting('heading_font', '');
            } else {
                updateSetting('heading_font', option.value);
            }
        },
        [updateSetting]
    );

    const handleBodySelect = useCallback(
        (option: FontOption | null) => {
            if (!option) return;
            if (option.value === DEFAULT_FONT) {
                updateSetting('body_font', '');
            } else {
                updateSetting('body_font', option.value);
            }
        },
        [updateSetting]
    );

    const renderImageUpload = (
        id: string,
        url: string | null,
        label: string,
        hint: string,
        dimensions: {width: string; height: string},
        extraProps: Partial<React.ComponentProps<typeof ImageUpload>> = {}
    ) => (
        <ImageUpload
            deleteButtonClassName='!top-1 !right-1'
            height={dimensions.height}
            id={id}
            imageBWCheckedBg={true}
            imageFit={extraProps.imageFit}
            imageURL={url || ''}
            width={dimensions.width}
            onDelete={() => updateSetting(id, null)}
            onUpload={file => handleUpload(file as File, id)}
            {...extraProps}
        >
            Upload {label}
        </ImageUpload>
    );

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
                        {renderImageUpload('icon', values.icon, 'icon', '', {width: values.icon ? '66px' : '160px', height: values.icon ? '66px' : '36px'})}
                    </div>
                </div>
                <div className={`flex items-start justify-between ${values.icon && 'mt-2'}`}>
                    <div>
                        <div>Publication logo</div>
                        <Hint className='!mt-0 mr-5 max-w-[160px]'>Appears usually in the main header of your theme</Hint>
                    </div>
                    <div>{renderImageUpload('logo', values.logo, 'logo', '', {width: '160px', height: '60px'}, {imageFit: 'contain'})}</div>
                </div>
                <div className='mt-2 flex items-start justify-between' data-testid="publication-cover">
                    <div>
                        <div>Publication cover</div>
                        <Hint className='!mt-0 mr-5 max-w-[160px]'>Usually as a large banner image on your index pages</Hint>
                    </div>
                    {renderImageUpload(
                        'cover_image',
                        values.coverImage,
                        'cover',
                        '',
                        {width: '160px', height: '95px'},
                        {
                            openUnsplash: () => setShowUnsplash(true),
                            unsplashButtonClassName: '!bg-transparent !h-6 !top-1.5 !w-6 !right-1.5 z-50',
                            unsplashEnabled,
                            pintura: {
                                isEnabled: editor.isEnabled,
                                openEditor: async () =>
                                    editor.openEditor({
                                        image: values.coverImage || '',
                                        handleSave: async (file: File) => {
                                            try {
                                                const url = getImageUrl(await uploadImage({file}));
                                                updateSetting('cover_image', url);
                                            } catch (e) {
                                                handleError(e);
                                            }
                                        }
                                    })
                            }
                        }
                    )}
                    {showUnsplash && unsplashConfig && unsplashEnabled && (
                        <UnsplashSelector
                            unsplashProviderConfig={unsplashConfig}
                            onClose={() => setShowUnsplash(false)}
                            onImageInsert={image => {
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
                    className={getFontClass(headingFont.name, true)}
                    components={{Option, SingleValue}}
                    controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
                    hint=''
                    menuShouldScrollIntoView
                    options={headingOptions}
                    selectedOption={{label: headingFont.name, value: headingFont.name, creator: headingFont.creator}}
                    testId='heading-font-select'
                    title='Heading font'
                    onSelect={handleHeadingSelect}
                />
                <Select
                    className={getFontClass(bodyFont.name, false)}
                    components={{Option, SingleValue}}
                    controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
                    hint=''
                    maxMenuHeight={200}
                    menuPosition='fixed'
                    menuShouldScrollIntoView
                    options={bodyOptions}
                    selectedOption={{label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator}}
                    testId='body-font-select'
                    title='Body font'
                    onSelect={handleBodySelect}
                />
            </Form>
        </>
    );
};

export default GlobalSettings;