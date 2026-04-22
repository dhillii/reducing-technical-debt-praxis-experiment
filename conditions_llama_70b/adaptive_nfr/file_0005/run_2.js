```javascript
import NewsletterPreview from './newsletter-preview';
import NiceModal from '@ebay/nice-modal-react';
import React, {useCallback, useEffect, useState} from 'react';
import useSettingGroup from '../../../../hooks/use-setting-group';
import validator from 'validator';
import {Button, ButtonGroup, ColorPickerField, ConfirmationModal, Form, Heading, Hint, HtmlField, Icon, ImageUpload, LimitModal, PreviewModalContent, Select, type SelectOption, Separator, type Tab, TabView, TextArea, TextField, Toggle, ToggleGroup, showToast} from '@tryghost/admin-x-design-system';
import {type ErrorMessages, useForm, useHandleError} from '@tryghost/admin-x-framework/hooks';
import {HostLimitError, useLimiter} from '../../../../hooks/use-limiter';
import {type Newsletter, useBrowseNewsletters, useEditNewsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {type RoutingModalProps, useRouting} from '@tryghost/admin-x-framework/routing';
import {getImageUrl, useUploadImage} from '@tryghost/admin-x-framework/api/images';
import {getSettingValue, getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {hasSendingDomain, isManagedEmail, sendingDomain} from '@tryghost/admin-x-framework/api/config';
import {renderReplyToEmail, renderSenderEmail} from '../../../../utils/newsletter-emails';
import {textColorForBackgroundColor} from '@tryghost/color-utils';
import {useGlobalData} from '../../../providers/global-data-provider';

/**
 * Render reply to email field.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {Function} props.updateNewsletter - Update newsletter function.
 * @param {ErrorMessages} props.errors - Error messages.
 * @param {Function} props.clearError - Clear error function.
 * @param {Function} props.validate - Validate function.
 * @returns {JSX.Element} Reply to email field.
 */
const ReplyToEmailField: React.FC<{
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    validate: () => void;
    clearError: (field: string) => void;
}> = ({newsletter, updateNewsletter, errors, clearError, validate}) => {
    const {settings, config} = useGlobalData();
    const [defaultEmailAddress, supportEmailAddress] = getSettingValues<string>(settings, ['default_email_address', 'support_email_address']);

    const [senderReplyTo, setSenderReplyTo] = useState(renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || '');

    const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSenderReplyTo(e.target.value);
        updateNewsletter({sender_reply_to: e.target.value || 'newsletter'});
    }, [updateNewsletter, setSenderReplyTo]);

    const onBlur = () => {
        const rendered = renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || '';
        setSenderReplyTo(rendered);
    };

    return (
        <TextField
            error={Boolean(errors.sender_reply_to)}
            hint={errors.sender_reply_to}
            maxLength={191}
            placeholder={renderSenderEmail(newsletter, config, defaultEmailAddress) || ''}
            title="Reply-to email"
            value={senderReplyTo}
            onBlur={onBlur}
            onChange={onChange}
            onKeyDown={() => clearError('sender_reply_to')}
        />
    );
};

/**
 * Render sender email field.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {Object} props.config - Config object.
 * @param {Function} props.updateNewsletter - Update newsletter function.
 * @param {ErrorMessages} props.errors - Error messages.
 * @param {Function} props.clearError - Clear error function.
 * @returns {JSX.Element} Sender email field.
 */
const renderSenderEmailField = ({newsletter, config, updateNewsletter, errors, clearError}: {
    newsletter: Newsletter;
    config: any;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
}) => {
    if (!isManagedEmail(config)) {
        return (
            <TextField
                error={Boolean(errors.sender_email)}
                hint={errors.sender_email}
                placeholder={renderSenderEmail(newsletter, config, getSettingValue(config, 'default_email_address')) || ''}
                title="Sender email address"
                value={newsletter.sender_email || ''}
                onChange={e => updateNewsletter({sender_email: e.target.value})}
                onKeyDown={() => clearError('sender_email')}
            />
        );
    }

    if (hasSendingDomain(config)) {
        return (
            <TextField
                error={Boolean(errors.sender_email)}
                hint={errors.sender_email}
                maxLength={191}
                placeholder={getSettingValue(config, 'default_email_address')}
                title="Sender email address"
                value={newsletter.sender_email || ''}
                onChange={(e) => {
                    updateNewsletter({sender_email: e.target.value});
                }}
                onKeyDown={() => clearError('sender_email')}
            />
        );
    }

    return null;
};

/**
 * Render font options.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {Function} props.updateNewsletter - Update newsletter function.
 * @returns {JSX.Element} Font options.
 */
const renderFontOptions = ({newsletter, updateNewsletter}: {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}) => {
    const fontOptions: SelectOption[] = [
        {value: 'serif', label: 'Elegant serif', className: 'font-serif'},
        {value: 'sans_serif', label: 'Clean sans-serif'}
    ];

    const changeSelectedTitleFont = (option: SelectOption | null) => {
        const categoryValue = option?.value || 'sans_serif';

        const currentWeight = newsletter.title_font_weight;
        let newWeight = currentWeight;
        if (!fontWeightOptions[categoryValue].options.find(o => o.value === currentWeight)) {
            newWeight = fontWeightOptions[categoryValue].map?.[currentWeight] || 'bold';
        }

        return updateNewsletter({
            title_font_category: categoryValue,
            title_font_weight: newWeight
        });
    };

    return (
        <div className='flex w-full items-center justify-between gap-2'>
            <div className='shrink-0'>Heading font</div>
            <Select
                containerClassName='max-w-[200px]'
                options={fontOptions}
                selectedOption={fontOptions.find(option => option.value === newsletter.title_font_category)}
                onSelect={changeSelectedTitleFont}
            />
        </div>
    );
};

/**
 * Render font weight options.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {Function} props.updateNewsletter - Update newsletter function.
 * @returns {JSX.Element} Font weight options.
 */
const renderFontWeightOptions = ({newsletter, updateNewsletter}: {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}) => {
    const fontWeightOptions: Record<string, {options: SelectOption[], map?: Record<string, string>}> = {
        sans_serif: {
            options: [
                {value: 'normal', label: 'Regular', className: 'font-normal'},
                {value: 'medium', label: 'Medium', className: 'font-medium'},
                {value: 'semibold', label: 'Semi-bold', className: 'font-semibold'},
                {value: 'bold', label: 'Bold', className: 'font-bold'}
            ]
        },
        serif: {
            options: [
                {value: 'normal', label: 'Regular', className: 'font-normal'},
                {value: 'bold', label: 'Bold', className: 'font-bold'}
            ],
            map: {
                medium: 'normal',
                semibold: 'bold'
            }
        }
    };

    const getSelectedFontWeightOption = () => {
        const category = newsletter.title_font_category || 'sans_serif';
        const fontWeight = newsletter.title_font_weight;
        const weightMap = fontWeightOptions[category].map;
        const mappedWeight = weightMap ? (weightMap[fontWeight] || fontWeight) : fontWeight;
        const option = fontWeightOptions[category].options.find(o => o.value === mappedWeight);
        return option || fontWeightOptions[category].options[0];
    };

    return (
        <div className='flex w-full items-center justify-between gap-2'>
            <div className='shrink-0'>Heading weight</div>
            <Select
                containerClassName='max-w-[200px]'
                options={fontWeightOptions[newsletter.title_font_category || 'sans_serif'].options}
                selectedOption={getSelectedFontWeightOption()}
                onSelect={option => updateNewsletter({title_font_weight: option?.value})}
            />
        </div>
    );
};

/**
 * Render body font options.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {Function} props.updateNewsletter - Update newsletter function.
 * @returns {JSX.Element} Body font options.
 */
const renderBodyFontOptions = ({newsletter, updateNewsletter}: {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}) => {
    const fontOptions: SelectOption[] = [
        {value: 'serif', label: 'Elegant serif', className: 'font-serif'},
        {value: 'sans_serif', label: 'Clean sans-serif'}
    ];

    return (
        <div className='flex w-full items-center justify-between gap-2'>
            <div className='shrink-0'>Body font</div>
            <Select
                containerClassName='max-w-[200px]'
                options={fontOptions}
                selectedOption={fontOptions.find(option => option.value === newsletter.body_font_category)}
                testId='body-font-select'
                onSelect={option => updateNewsletter({body_font_category: option?.value})}
            />
        </div>
    );
};

/**
 * Render color picker field.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {Function} props.updateNewsletter - Update newsletter function.
 * @param {string} props.title - Field title.
 * @param {string} props.value - Field value.
 * @param {string} props.swatches - Field swatches.
 * @returns {JSX.Element} Color picker field.
 */
const renderColorPickerField = ({newsletter, updateNewsletter, title, value, swatches}: {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    title: string;
    value: string;
    swatches: any[];
}) => {
    return (
        <ColorPickerField
            direction='rtl'
            eyedropper={true}
            swatches={swatches}
            title={title}
            value={value}
            onChange={color => updateNewsletter({[title.replace(' ', '_').toLowerCase()]: color!})}
        />
    );
};

/**
 * Render button group.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {Function} props.updateNewsletter - Update newsletter function.
 * @param {string} props.title - Field title.
 * @param {string} props.value - Field value.
 * @param {any[]} props.buttons - Field buttons.
 * @returns {JSX.Element} Button group.
 */
const renderButtonGroup = ({newsletter, updateNewsletter, title, value, buttons}: {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    title: string;
    value: string;
    buttons: any[];
}) => {
    return (
        <div className='flex w-full justify-between'>
            <div>{title}</div>
            <ButtonGroup activeKey={value} buttons={buttons} clearBg={false} />
        </div>
    );
};

/**
 * Render toggle group.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {Function} props.updateNewsletter - Update newsletter function.
 * @param {any[]} props.toggles - Field toggles.
 * @returns {JSX.Element} Toggle group.
 */
const renderToggleGroup = ({newsletter, updateNewsletter, toggles}: {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    toggles: any[];
}) => {
    return (
        <ToggleGroup>
            {toggles.map((toggle, index) => (
                <Toggle
                    key={index}
                    checked={toggle.checked}
                    direction="rtl"
                    label={toggle.label}
                    onChange={e => updateNewsletter({[toggle.field]: e.target.checked})}
                />
            ))}
        </ToggleGroup>
    );
};

/**
 * Render html field.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {Function} props.updateNewsletter - Update newsletter function.
 * @param {string} props.title - Field title.
 * @param {string} props.value - Field value.
 * @returns {JSX.Element} Html field.
 */
const renderHtmlField = ({newsletter, updateNewsletter, title, value}: {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    title: string;
    value: string;
}) => {
    return (
        <HtmlField
            hint='Any extra information or legal text'
            nodes='MINIMAL_NODES'
            placeholder=' '
            title={title}
            value={value || ''}
            onChange={html => updateNewsletter({[title.replace(' ', '_').toLowerCase()]: html})}
        />
    );
};

/**
 * Render image upload field.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {Function} props.updateNewsletter - Update newsletter function.
 * @param {Function} props.uploadImage - Upload image function.
 * @returns {JSX.Element} Image upload field.
 */
const renderImageUploadField = ({newsletter, updateNewsletter, uploadImage}: {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    uploadImage: (file: any) => Promise<any>;
}) => {
    return (
        <ImageUpload
            deleteButtonClassName='!top-1 !right-1'
            height={newsletter.header_image ? '66px' : '64px'}
            id='logo'
            imageURL={newsletter.header_image || undefined}
            onDelete={() => {
                updateNewsletter({header_image: null});
            }}
            onUpload={async (file) => {
                try {
                    const imageUrl = getImageUrl(await uploadImage({file}));
                    updateNewsletter({header_image: imageUrl});
                } catch (e) {
                    console.error(e);
                }
            }}
        >
            <Icon colorClass='text-grey-700 dark:text-grey-300' name='picture' />
        </ImageUpload>
    );
};

/**
 * Render sidebar.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {boolean} props.onlyOne - Only one newsletter flag.
 * @param {Function} props.updateNewsletter - Update newsletter function.
 * @param {Function} props.validate - Validate function.
 * @param {ErrorMessages} props.errors - Error messages.
 * @param {Function} props.clearError - Clear error function.
 * @returns {JSX.Element} Sidebar.
 */
const Sidebar: React.FC<{
    newsletter: Newsletter;
    onlyOne: boolean;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    validate: () => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
}> = ({newsletter, onlyOne, updateNewsletter, validate, errors, clearError}) => {
    const {updateRoute} = useRouting();
    const {mutateAsync: editNewsletter} = useEditNewsletter();
    const limiter = useLimiter();
    const {settings, config, siteData} = useGlobalData();
    const [icon, defaultEmailAddress] = getSettingValues<string>(settings, ['icon', 'default_email_address']);
    const {mutateAsync: uploadImage} = useUploadImage();
    const [selectedTab, setSelectedTab] = useState('generalSettings');
    const {localSettings} = useSettingGroup();
    const [siteTitle] = getSettingValues(localSettings, ['title']) as string[];
    const handleError = useHandleError();
    const {data: {newsletters: apiNewsletters} = {}} = useBrowseNewsletters();
    const commentsEnabled = ['all', 'paid'].includes(getSettingValue(settings, 'comments_enabled') || '');

    useEffect(() => {
        setNewsletters(apiNewsletters || []);
    }, [apiNewsletters]);

    const tabs: Tab[] = [
        {
            id: 'generalSettings',
            title: 'General',
            contents: (
                <Form className='mt-6' gap='sm' margins='lg' title='Name and description'>
                    <TextField
                        error={Boolean(errors.name)}
                        hint={errors.name}
                        maxLength={191}
                        placeholder="Weekly Roundup"
                        title="Name"
                        value={newsletter.name || ''}
                        onChange={e => updateNewsletter({name: e.target.value})}
                        onKeyDown={() => clearError('name')}
                    />
                    <TextArea maxLength={2000} rows={2} title="Description" value={newsletter.description || ''} onChange={e => updateNewsletter({description: e.target.value})} />
                </Form>
            )
        },
        {
            id: 'content',
            title: 'Content',
            contents: (
                <Form className='mt-6' gap='sm' margins='lg' title='Header'>
                    {renderImageUploadField({newsletter, updateNewsletter, uploadImage})}
                    {renderToggleGroup({
                        newsletter,
                        updateNewsletter,
                        toggles: [
                            {
                                checked: newsletter.show_header_icon,
                                label: 'Publication icon',
                                field: 'show_header_icon'
                            },
                            {
                                checked: newsletter.show_header_title,
                                label: 'Publication title',
                                field: 'show_header_title'
                            },
                            {
                                checked: newsletter.show_header_name,
                                label: 'Newsletter name',
                                field: 'show_header_name'
                            }
                        ]
                    })}
                </Form>
            )
        },
        {
            id: 'design',
            title: 'Design',
            contents: (
                <Form className='mt-6' gap='xs' margins='lg' title='Global'>
                    {renderColorPickerField({
                        newsletter,
                        updateNewsletter,
                        title: 'Background color',
                        value: newsletter.background_color || 'light',
                        swatches: [
                            {
                                hex: '#ffffff',
                                value: 'light',
                                title: 'White'
                            }
                        ]
                    })}
                    {renderFontOptions({newsletter, updateNewsletter})}
                    {renderFontWeightOptions({newsletter, updateNewsletter})}
                    {renderBodyFontOptions({newsletter, updateNewsletter})}
                </Form>
            )
        }
    ];

    const handleTabChange = (id: string) => {
        setSelectedTab(id);
    };

    return (
        <div className='flex flex-col'>
            <div className='px-7 pb-7 pt-0'>
                <TabView selectedTab={selectedTab} stickyHeader={true} tabs={tabs} onTabChange={handleTabChange} />
            </div>
        </div>
    );
};

/**
 * Render newsletter detail modal content.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {boolean} props.onlyOne - Only one newsletter flag.
 * @returns {JSX.Element} Newsletter detail modal content.
 */
const NewsletterDetailModalContent: React.FC<{newsletter: Newsletter; onlyOne: boolean;}> = ({newsletter, onlyOne}) => {
    const {config} = useGlobalData();
    const {mutateAsync: editNewsletter} = useEditNewsletter();
    const {updateRoute} = useRouting();
    const handleError = useHandleError();

    const {formState, saveState, updateForm, setFormState, handleSave, validate, errors, clearError, okProps} = useForm({
        initialState: newsletter,
        savingDelay: 500,
        onSave: async () => {
            const {meta: {sent_email_verification: [emailToVerify] = []} = {}} = await editNewsletter(formState);
            let toastMessage;

            if (emailToVerify && emailToVerify === 'sender_email') {
                toastMessage = <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
            } else if (emailToVerify && emailToVerify === 'sender_reply_to') {
                toastMessage = <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
            }

            if (toastMessage) {
                showToast({
                    icon: 'email',
                    message: toastMessage,
                    type: 'info'
                });
            }
        },
        onSaveError: handleError,
        onValidate: () => {
            const newErrors: Record<string, string> = {};

            if (!formState.name) {
                newErrors.name = 'A name is required for your newsletter';
            }

            if (formState.sender_email && !validator.isEmail(formState.sender_email)) {
                newErrors.sender_email = 'Enter a valid email address';
            } else if (formState.sender_email && hasSendingDomain(config) && formState.sender_email.split('@')[1] !== sendingDomain(config)) {
                newErrors.sender_email = `Email address must end with @${sendingDomain(config)}`;
            }

            if (formState.sender_reply_to && !validator.isEmail(formState.sender_reply_to) && !['newsletter', 'support'].includes(formState.sender_reply_to)) {
                newErrors.sender_reply_to = 'Enter a valid email address';
            }

            return newErrors;
        }
    });

    const updateNewsletter = (fields: Partial<Newsletter>) => {
        updateForm(state => ({...state, ...fields}));
    };

    useEffect(() => {
        setFormState(() => newsletter);
    }, [setFormState, newsletter]);

    const preview = <NewsletterPreview newsletter={formState} />;
    const sidebar = <Sidebar clearError={clearError} errors={errors} newsletter={formState} onlyOne={onlyOne} updateNewsletter={updateNewsletter} validate={validate} />;

    return <PreviewModalContent
        afterClose={() => updateRoute('newsletters')}
        buttonsDisabled={okProps.disabled}
        cancelLabel='Close'
        deviceSelector={false}
        dirty={saveState === 'unsaved'}
        okColor={okProps.color}
        okLabel={okProps.label || 'Save'}
        preview={preview}
        previewBgColor={'grey'}
        previewToolbar={false}
        sidebar={sidebar}
        sidebarPadding={false}
        testId='newsletter-modal'
        title='Newsletter'
        onOk={async () => {
            await handleSave({fakeWhenUnchanged: true});
        }}
    />;
};

/**
 * Render newsletter detail modal.
 * @param {Object} props - Component props.
 * @param {any} props.params - Modal params.
 * @returns {JSX.Element} Newsletter detail modal.
 */
const NewsletterDetailModal: React.FC<RoutingModalProps> = ({params}) => {
    const {data: {newsletters, isEnd} = {}, fetchNextPage} = useBrowseNewsletters();
    const newsletter = newsletters?.find(({id}) => id === params?.id);

    useEffect(() => {
        if (!newsletter && !isEnd) {
            fetchNextPage();
        }
    }, [fetchNextPage, isEnd, newsletter]);

    if (newsletter) {
        return <NewsletterDetailModalContent newsletter={newsletter} onlyOne={newsletters!.length === 1} />;
    } else {
        return null;
    }
};

export default NiceModal.create(NewsletterDetailModal);
```