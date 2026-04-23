import React, {useState, useCallback} from 'react';
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

const FONT_CLASS_MAP: Record<string, string> = {
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

const getFontClassName = (fontName: string, heading: boolean): string => {
    const base = FONT_CLASS_MAP[fontName] ?? '';
    const weight = heading ? 'font-bold' : 'font-normal';
    return clsx(base, heading && weight);
};

const SingleValue: React.FC<SingleValueProps<FontOption, false>> = ({children, ...props}) => (
    <components.SingleValue {...props}>
        <div className='group' data-testid='select-current-option' data-value={props.data.value}>
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
        <div className={props.isSelected ? 'relative flex w-full items-center justify-between gap-2' : 'group'} data-testid='select-option' data-value={props.data.value}>
            <div className='flex items-center gap-3'>
                <div className='dark:group-hover:bg-grey-800 flex size-12 items-center justify-center rounded-md bg-grey-150 text-2xl font-bold group-hover:bg-grey-250 dark:bg-grey-900'>Aa</div>
                <div className='flex flex-col'>
                    <span className='text-md'>{children}</span>
                    <span className='font-sans text-xs font-normal text-grey-700 dark:text-grey-600'>{props.data.creator}</span>
                </div>
            </div>
            {props.isSelected && <span><Icon name='check' size={14} /></span>}
        </div>
    </components.Option>
);

const capitalizeWords = (str: string) =>
    str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

type GlobalSettingValues = {
    description: string;
    accentColor: string;
    icon: string | null;
    logo: string | null;
    coverImage: string | null;
    headingFont: string;
    bodyFont: string;
};

type GlobalSettingsProps = {
    values: GlobalSettingValues;
    updateSetting: (key: string, value: SettingValue) => void;
};

const GlobalSettings: React.FC<GlobalSettingsProps> = ({values, updateSetting}) => {
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

    const initFont = (list: {name: string; creator: string}[], key: keyof GlobalSettingValues) => {
        const found = list.find(f => f.name === values[key]);
        return found ? {name: found.name, creator: found.creator} : {name: DEFAULT_FONT, creator: themeLabel};
    };

    const [headingFont, setHeadingFont] = useState(initFont(CUSTOM_FONTS.heading, 'headingFont'));
    const [bodyFont, setBodyFont] = useState(initFont(CUSTOM_FONTS.body, 'bodyFont'));

    const buildOptions = (list: {name: string; creator: string}[], isHeading: boolean) => {
        const options = list.map(x => ({
            label: x.name,
            value: x.name,
            creator: x.creator,
            className: getFontClassName(x.name, isHeading)
        }));
        options.unshift({
            label: DEFAULT_FONT,
            value: DEFAULT_FONT,
            creator: themeLabel,
            className: 'font-sans font-normal'
        });
        return options;
    };

    const headingOptions = buildOptions(CUSTOM_FONTS.heading, true);
    const bodyOptions = buildOptions(CUSTOM_FONTS.body, false);

    const handleUpload = useCallback(
        async (file: File, key: keyof GlobalSettingValues) => {
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

    const handleFontSelect = useCallback(
        (option: FontOption | null, isHeading: boolean) => {
            if (!option) return;
            const key = isHeading ? 'heading_font' : 'body_font';
            const setter = isHeading ? setHeadingFont : setBodyFont;
            const list = isHeading ? CUSTOM_FONTS.heading : CUSTOM_FONTS.body;

            if (option.value === DEFAULT_FONT) {
                setter({name: DEFAULT_FONT, creator: themeLabel});
                updateSetting(key, '');
            } else {
                const creator = list.find(f => f.name === option.value)?.creator || '';
                setter({name: option.value, creator});
                updateSetting(key, option.value);
            }
        },
        [updateSetting, themeLabel]
    );

    const selectedHeading = {label: headingFont.name, value: headingFont.name, creator: headingFont.creator};
    const selectedBody = {label: bodyFont.name, value: bodyFont.name, creator: bodyFont.creator};

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
                            imageBWCheckedBg
                            imageURL={values.icon || ''}
                            width={values.icon ? '66px' : '160px'}
                            onDelete={() => updateSetting('icon', null)}
                            onUpload={file => handleUpload(file, 'icon')}
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
                        imageBWCheckedBg
                        imageFit='contain'
                        imageURL={values.logo || ''}
                        width='160px'
                        onDelete={() => updateSetting('logo', null)}
                        onUpload={file => handleUpload(file, 'logo')}
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
                                        const url = getImageUrl(await uploadImage({file}));
                                        updateSetting('cover_image', url);
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
                        onUpload={file => handleUpload(file, 'cover_image')}
                    >
                        Upload cover
                    </ImageUpload>
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
                    className={getFontClassName(selectedHeading.label, true)}
                    components={{Option, SingleValue}}
                    controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
                    hint=''
                    menuShouldScrollIntoView
                    options={headingOptions}
                    selectedOption={selectedHeading}
                    testId='heading-font-select'
                    title='Heading font'
                    onSelect={option => handleFontSelect(option, true)}
                />
                <Select
                    className={getFontClassName(selectedBody.label, false)}
                    components={{Option, SingleValue}}
                    controlClasses={{control: '!min-h-16 !pl-2', option: '!pl-2'}}
                    hint=''
                    maxMenuHeight={200}
                    menuPosition='fixed'
                    menuShouldScrollIntoView
                    options={bodyOptions}
                    selectedOption={selectedBody}
                    testId='body-font-select'
                    title='Body font'
                    onSelect={option => handleFontSelect(option, false)}
                />
            </Form>
        </>
    );
};

export default GlobalSettings;