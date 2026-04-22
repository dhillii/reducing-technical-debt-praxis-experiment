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
 * @param {function} props.updateNewsletter - Update newsletter function.
 * @param {ErrorMessages} props.errors - Error messages.
 * @param {function} props.clearError - Clear error function.
 * @param {function} props.validate - Validate function.
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
 * @param {function} props.updateNewsletter - Update newsletter function.
 * @param {ErrorMessages} props.errors - Error messages.
 * @param {function} props.clearError - Clear error function.
 * @param {Object} props.config - Config object.
 * @returns {JSX.Element} Sender email field.
 */
const renderSenderEmailField = ({newsletter, updateNewsletter, errors, clearError, config}) => {
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
 * Render general settings tab.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {function} props.updateNewsletter - Update newsletter function.
 * @param {ErrorMessages} props.errors - Error messages.
 * @param {function} props.clearError - Clear error function.
 * @param {function} props.validate - Validate function.
 * @param {Object} props.config - Config object.
 * @param {boolean} props.onlyOne - Whether there is only one newsletter.
 * @returns {JSX.Element} General settings tab.
 */
const renderGeneralSettingsTab = ({newsletter, updateNewsletter, errors, clearError, validate, config, onlyOne}) => {
    const {settings, siteData} = useGlobalData();
    const [icon, defaultEmailAddress] = getSettingValues<string>(settings, ['icon', 'default_email_address']);

    return (
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
    );
};

/**
 * Render email info tab.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {function} props.updateNewsletter - Update newsletter function.
 * @param {ErrorMessages} props.errors - Error messages.
 * @param {function} props.clearError - Clear error function.
 * @param {function} props.validate - Validate function.
 * @param {Object} props.config - Config object.
 * @param {boolean} props.onlyOne - Whether there is only one newsletter.
 * @returns {JSX.Element} Email info tab.
 */
const renderEmailInfoTab = ({newsletter, updateNewsletter, errors, clearError, validate, config, onlyOne}) => {
    const {settings, siteData} = useGlobalData();
    const [icon, defaultEmailAddress] = getSettingValues<string>(settings, ['icon', 'default_email_address']);

    return (
        <Form className='mt-6' gap='sm' margins='lg' title='Email info'>
            <TextField maxLength={191} placeholder={siteData.title} title="Sender name" value={newsletter.sender_name || ''} onChange={e => updateNewsletter({sender_name: e.target.value})} />
            {renderSenderEmailField({newsletter, updateNewsletter, errors, clearError, config})}
            <ReplyToEmailField clearError={clearError} errors={errors} newsletter={newsletter} updateNewsletter={updateNewsletter} validate={validate} />
        </Form>
    );
};

/**
 * Render member settings tab.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {function} props.updateNewsletter - Update newsletter function.
 * @param {ErrorMessages} props.errors - Error messages.
 * @param {function} props.clearError - Clear error function.
 * @param {function} props.validate - Validate function.
 * @param {Object} props.config - Config object.
 * @param {boolean} props.onlyOne - Whether there is only one newsletter.
 * @returns {JSX.Element} Member settings tab.
 */
const renderMemberSettingsTab = ({newsletter, updateNewsletter, errors, clearError, validate, config, onlyOne}) => {
    return (
        <Form className='mt-6' gap='sm' margins='lg' title='Member settings'>
            <Toggle
                checked={newsletter.subscribe_on_signup}
                direction='rtl'
                label='Subscribe new members on signup'
                labelStyle='value'
                onChange={e => updateNewsletter({subscribe_on_signup: e.target.checked})}
            />
        </Form>
    );
};

/**
 * Render status change button.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {function} props.updateNewsletter - Update newsletter function.
 * @param {ErrorMessages} props.errors - Error messages.
 * @param {function} props.clearError - Clear error function.
 * @param {function} props.validate - Validate function.
 * @param {Object} props.config - Config object.
 * @param {boolean} props.onlyOne - Whether there is only one newsletter.
 * @returns {JSX.Element} Status change button.
 */
const renderStatusChangeButton = ({newsletter, updateNewsletter, errors, clearError, validate, config, onlyOne}) => {
    const {mutateAsync: editNewsletter} = useEditNewsletter();
    const limiter = useLimiter();

    const confirmStatusChange = async () => {
        if (newsletter.status === 'active') {
            NiceModal.show(ConfirmationModal, {
                title: 'Archive newsletter',
                prompt: <>
                    <div className="mb-6">Your newsletter <strong>{newsletter.name}</strong> will no longer be visible to members or available as an option when publishing new posts.</div>
                    <div>Existing posts previously sent as this newsletter will remain unchanged.</div>
                </>,
                okLabel: 'Archive',
                okColor: 'red',
                onOk: async (modal) => {
                    try {
                        await editNewsletter({...newsletter, status: 'archived'});
                        modal?.remove();
                        showToast({
                            type: 'success',
                            message: 'Newsletter archived'
                        });
                    } catch (e) {
                        useHandleError()(e);
                    }
                }
            });
        } else {
            try {
                await limiter?.errorIfWouldGoOverLimit('newsletters');
            } catch (error) {
                if (error instanceof HostLimitError) {
                    NiceModal.show(LimitModal, {
                        prompt: error.message || `Your current plan doesn't support more newsletters.`,
                        onOk: () => useRouting().updateRoute({route: '/pro', isExternal: true})
                    });
                    return;
                } else {
                    throw error;
                }
            }

            NiceModal.show(ConfirmationModal, {
                title: 'Reactivate newsletter',
                prompt: <>
                        Reactivating <strong>{newsletter.name}</strong> will immediately make it visible to members and re-enable it as an option when publishing new posts.
                </>,
                okLabel: 'Reactivate',
                onOk: async (modal) => {
                    await editNewsletter({...newsletter, status: 'active'});
                    modal?.remove();
                    showToast({
                        type: 'success',
                        message: 'Newsletter reactivated'
                    });
                }
            });
        }
    };

    return (
        <div className='mb-5 mt-10'>
            {newsletter.status === 'active' ? (!onlyOne && <Button color='red' disabled={true} label='Archive newsletter' link onClick={confirmStatusChange}/>) : <Button color='green' label='Reactivate newsletter' link onClick={confirmStatusChange} />}
        </div>
    );
};

/**
 * Render content tab.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {function} props.updateNewsletter - Update newsletter function.
 * @param {ErrorMessages} props.errors - Error messages.
 * @param {function} props.clearError - Clear error function.
 * @param {function} props.validate - Validate function.
 * @param {Object} props.config - Config object.
 * @param {boolean} props.onlyOne - Whether there is only one newsletter.
 * @returns {JSX.Element} Content tab.
 */
const renderContentTab = ({newsletter, updateNewsletter, errors, clearError, validate, config, onlyOne}) => {
    const {mutateAsync: uploadImage} = useUploadImage();
    const {settings, siteData} = useGlobalData();
    const [icon, defaultEmailAddress] = getSettingValues<string>(settings, ['icon', 'default_email_address']);

    return (
        <Form className='mt-6' gap='sm' margins='lg' title='Header'>
            <div>
                <div>
                    <Heading className="mb-2" level={6}>Header image</Heading>
                </div>
                <div className='flex-column flex gap-1'>
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
                                useHandleError()(e);
                            }
                        }}
                    >
                        <Icon colorClass='text-grey-700 dark:text-grey-300' name='picture' />
                    </ImageUpload>
                    <Hint>1200×600 recommended. Use a transparent PNG for best results on any background.</Hint>
                </div>
            </div>
            <ToggleGroup>
                {icon && <Toggle
                    checked={newsletter.show_header_icon}
                    direction="rtl"
                    label='Publication icon'
                    onChange={e => updateNewsletter({show_header_icon: e.target.checked})}
                />}
                <Toggle
                    checked={newsletter.show_header_title}
                    direction="rtl"
                    label='Publication title'
                    onChange={e => updateNewsletter({show_header_title: e.target.checked})}
                />
                <Toggle
                    checked={newsletter.show_header_name}
                    direction="rtl"
                    label='Newsletter name'
                    onChange={e => updateNewsletter({show_header_name: e.target.checked})}
                />
            </ToggleGroup>
        </Form>
    );
};

/**
 * Render design tab.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {function} props.updateNewsletter - Update newsletter function.
 * @param {ErrorMessages} props.errors - Error messages.
 * @param {function} props.clearError - Clear error function.
 * @param {function} props.validate - Validate function.
 * @param {Object} props.config - Config object.
 * @param {boolean} props.onlyOne - Whether there is only one newsletter.
 * @returns {JSX.Element} Design tab.
 */
const renderDesignTab = ({newsletter, updateNewsletter, errors, clearError, validate, config, onlyOne}) => {
    const fontOptions: SelectOption[] = [
        {value: 'serif', label: 'Elegant serif', className: 'font-serif'},
        {value: 'sans_serif', label: 'Clean sans-serif'}
    ];

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

    const backgroundColorIsDark = () => {
        if (newsletter.background_color === 'light') {
            return false;
        }
        return textColorForBackgroundColor(newsletter.background_color).hex().toLowerCase() === '#ffffff';
    };

    const headingFontWeightOptions = fontWeightOptions[newsletter.title_font_category || 'sans_serif'].options;

    const getSelectedFontWeightOption = () => {
        const category = newsletter.title_font_category || 'sans_serif';
        const fontWeight = newsletter.title_font_weight;
        const weightMap = fontWeightOptions[category].map;
        const mappedWeight = weightMap ? (weightMap[fontWeight] || fontWeight) : fontWeight;
        const option = headingFontWeightOptions.find(o => o.value === mappedWeight);
        return option || headingFontWeightOptions[0];
    };

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
        <Form className='mt-6' gap='xs' margins='lg' title='Global'>
            <div className='mb-1'>
                <ColorPickerField
                    direction='rtl'
                    eyedropper={true}
                    swatches={[
                        {
                            hex: '#ffffff',
                            value: 'light',
                            title: 'White'
                        }
                    ]}
                    title='Background color'
                    value={newsletter.background_color || 'light'}
                    onChange={color => updateNewsletter({background_color: color!})}
                />
            </div>
            <div className='flex w-full items-center justify-between gap-2'>
                <div className='shrink-0'>Heading font</div>
                <Select
                    containerClassName='max-w-[200px]'
                    options={fontOptions}
                    selectedOption={fontOptions.find(option => option.value === newsletter.title_font_category)}
                    onSelect={changeSelectedTitleFont}
                />
            </div>
            <div className='flex w-full items-center justify-between gap-2'>
                <div className='shrink-0'>Heading weight</div>
                <Select
                    containerClassName='max-w-[200px]'
                    options={headingFontWeightOptions}
                    selectedOption={getSelectedFontWeightOption()}
                    onSelect={option => updateNewsletter({title_font_weight: option?.value})}
                />
            </div>
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
        </Form>
    );
};

/**
 * Render sidebar.
 * @param {Object} props - Component props.
 * @param {Newsletter} props.newsletter - Newsletter object.
 * @param {boolean} props.onlyOne - Whether there is only one newsletter.
 * @param {function} props.updateNewsletter - Update newsletter function.
 * @param {function} props.validate - Validate function.
 * @param {ErrorMessages} props.errors - Error messages.
 * @param {function} props.clearError - Clear error function.
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
    const tabs: Tab[] = [
        {
            id: 'generalSettings',
            title: 'General',
            contents: (
                <>
                    {renderGeneralSettingsTab({newsletter, updateNewsletter, errors, clearError, validate, config: useGlobalData().config, onlyOne})}
                    {renderEmailInfoTab({newsletter, updateNewsletter, errors, clearError, validate, config: useGlobalData().config, onlyOne})}
                    {renderMemberSettingsTab({newsletter, updateNewsletter, errors, clearError, validate, config: useGlobalData().config, onlyOne})}
                    {renderStatusChangeButton({newsletter, updateNewsletter, errors, clearError, validate, config: useGlobalData().config, onlyOne})}
                </>
            )
        },
        {
            id: 'content',
            title: 'Content',
            contents: (
                <>
                    {renderContentTab({newsletter, updateNewsletter, errors, clearError, validate, config: useGlobalData().config, onlyOne})}
                </>
            )
        },
        {
            id: 'design',
            title: 'Design',
            contents: (
                <>
                    {renderDesignTab({newsletter, updateNewsletter, errors, clearError, validate, config: useGlobalData().config, onlyOne})}
                </>
            )
        }
    ];

    const [selectedTab, setSelectedTab] = useState('generalSettings');

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
 * @param {boolean} props.onlyOne - Whether there is only one newsletter.
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
 * @param {Object} props.params - Route parameters.
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