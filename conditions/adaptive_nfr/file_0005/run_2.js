```typescript
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

const ReplyToEmailField: React.FC<{
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    validate: () => void;
    clearError: (field: string) => void;
}> = ({newsletter, updateNewsletter, errors, clearError}) => {
    const {settings, config} = useGlobalData();
    const [defaultEmailAddress, supportEmailAddress] = getSettingValues<string>(settings, ['default_email_address', 'support_email_address']);

    const [senderReplyTo, setSenderReplyTo] = useState(renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || '');

    let newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);

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
            placeholder={newsletterAddress || ''}
            title="Reply-to email"
            value={senderReplyTo}
            onBlur={onBlur}
            onChange={onChange}
            onKeyDown={() => clearError('sender_reply_to')}
        />
    );
};

/**
 * Renders the sender email field based on configuration
 */
const renderSenderEmailField = (
    newsletter: Newsletter,
    config: any,
    defaultEmailAddress: string,
    errors: ErrorMessages,
    updateNewsletter: (fields: Partial<Newsletter>) => void,
    clearError: (field: string) => void
) => {
    if (!isManagedEmail(config)) {
        return (
            <TextField
                error={Boolean(errors.sender_email)}
                hint={errors.sender_email}
                placeholder={renderSenderEmail(newsletter, config, defaultEmailAddress) || ''}
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
                placeholder={defaultEmailAddress}
                title="Sender email address"
                value={newsletter.sender_email || ''}
                onChange={(e) => {
                    updateNewsletter({sender_email: e.target.value});
                }}
                onKeyDown={() => clearError('sender_email')}
            />
        );
    }
};

/**
 * Determines if background color is dark
 */
const backgroundColorIsDark = (newsletter: Newsletter): boolean => {
    if (newsletter.background_color === 'light') {
        return false;
    }
    return textColorForBackgroundColor(newsletter.background_color).hex().toLowerCase() === '#ffffff';
};

/**
 * Gets the selected font weight option for the current newsletter
 */
const getSelectedFontWeightOption = (
    newsletter: Newsletter,
    fontWeightOptions: Record<string, {options: SelectOption[], map?: Record<string, string>}>
): SelectOption => {
    const category = newsletter.title_font_category || 'sans_serif';
    const fontWeight = newsletter.title_font_weight;
    const weightMap = fontWeightOptions[category].map;
    const mappedWeight = weightMap ? (weightMap[fontWeight] || fontWeight) : fontWeight;
    const headingFontWeightOptions = fontWeightOptions[category].options;
    const option = headingFontWeightOptions.find(o => o.value === mappedWeight);
    return option || headingFontWeightOptions[0];
};

/**
 * Handles title font category change with weight mapping
 */
const changeSelectedTitleFont = (
    option: SelectOption | null,
    newsletter: Newsletter,
    fontWeightOptions: Record<string, {options: SelectOption[], map?: Record<string, string>}>,
    updateNewsletter: (fields: Partial<Newsletter>) => void
) => {
    const categoryValue = option?.value || 'sans_serif';
    const currentWeight = newsletter.title_font_weight;
    let newWeight = currentWeight;
    
    if (!fontWeightOptions[categoryValue].options.find(o => o.value === currentWeight)) {
        newWeight = fontWeightOptions[categoryValue].map?.[currentWeight] || 'bold';
    }

    updateNewsletter({
        title_font_category: categoryValue,
        title_font_weight: newWeight
    });
};

/**
 * Handles archiving a newsletter
 */
const handleArchiveNewsletter = async (
    newsletter: Newsletter,
    editNewsletter: (data: Newsletter) => Promise<any>,
    handleError: (error: any) => void
) => {
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
                handleError(e);
            }
        }
    });
};

/**
 * Handles reactivating a newsletter
 */
const handleReactivateNewsletter = async (
    newsletter: Newsletter,
    editNewsletter: (data: Newsletter) => Promise<any>,
    limiter: any,
    updateRoute: (route: any) => void,
    handleError: (error: any) => void
) => {
    try {
        await limiter?.errorIfWouldGoOverLimit('newsletters');
    } catch (error) {
        if (error instanceof HostLimitError) {
            NiceModal.show(LimitModal, {
                prompt: error.message || `Your current plan doesn't support more newsletters.`,
                onOk: () => updateRoute({route: '/pro', isExternal: true})
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
};

/**
 * Handles status change confirmation
 */
const confirmStatusChange = async (
    newsletter: Newsletter,
    editNewsletter: (data: Newsletter) => Promise<any>,
    limiter: any,
    updateRoute: (route: any) => void,
    handleError: (error: any) => void
) => {
    if (newsletter.status === 'active') {
        await handleArchiveNewsletter(newsletter, editNewsletter, handleError);
    } else {
        await handleReactivateNewsletter(newsletter, editNewsletter, limiter, updateRoute, handleError);
    }
};

/**
 * Renders the general settings tab content
 */
const renderGeneralSettingsTab = (
    newsletter: Newsletter,
    onlyOne: boolean,
    activeNewsletters: Newsletter[],
    siteTitle: string,
    errors: ErrorMessages,
    updateNewsletter: (fields: Partial<Newsletter>) => void,
    clearError: (field: string) => void,
    validate: () => void,
    confirmStatusChange: () => Promise<void>
) => (
    <>
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
        <Form className='mt-6' gap='sm' margins='lg' title='Email info'>
            <TextField maxLength={191} placeholder={siteTitle} title="Sender name" value={newsletter.sender_name || ''} onChange={e => updateNewsletter({sender_name: e.target.value})} />
            {renderSenderEmailField(newsletter, {}, siteTitle, errors, updateNewsletter, clearError)}
            <ReplyToEmailField clearError={clearError} errors={errors} newsletter={newsletter} updateNewsletter={updateNewsletter} validate={validate} />
        </Form>
        <Form className='mt-6' gap='sm' margins='lg' title='Member settings'>
            <Toggle
                checked={newsletter.subscribe_on_signup}
                direction='rtl'
                label='Subscribe new members on signup'
                labelStyle='value'
                onChange={e => updateNewsletter({subscribe_on_signup: e.target.checked})}
            />
        </Form>
        <div className='mb-5 mt-10'>
            {newsletter.status === 'active' ? (!onlyOne && <Button color='red' disabled={activeNewsletters.length === 1} label='Archive newsletter' link onClick={confirmStatusChange}/>) : <Button color='green' label='Reactivate newsletter' link onClick={confirmStatusChange} />}
        </div>
    </>
);

/**
 * Renders the header image upload section
 */
const renderHeaderImageSection = (
    newsletter: Newsletter,
    updateNewsletter: (fields: Partial<Newsletter>) => void,
    uploadImage: (data: any) => Promise<any>,
    handleError: (error: any) => void,
    icon: string | undefined
) => (
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
                            handleError(e);
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

/**
 * Renders the title section content
 */
const renderTitleSectionContent = (
    newsletter: Newsletter,
    updateNewsletter: (fields: Partial<Newsletter>) => void
) => (
    <Form className='mt-6' gap='xs' margins='lg' title='Title section'>
        <Toggle
            checked={newsletter.show_post_title_section}
            direction="rtl"
            label='Post title'
            onChange={e => updateNewsletter({show_post_title_section: e.target.checked})}
        />
        {newsletter.show_post_title_section &&
            <Toggle
                checked={newsletter.show_excerpt}
                direction="rtl"
                label="Post excerpt"
                onChange={e => updateNewsletter({show_excerpt: e.target.checked})}
            />
        }
        <Toggle
            checked={newsletter.show_feature_image}
            direction="rtl"
            label='Feature image'
            onChange={e => updateNewsletter({show_feature_image: e.target.checked})}
        />
    </Form>
);

/**
 * Renders the footer section content
 */
const renderFooterSectionContent = (
    newsletter: Newsletter,
    commentsEnabled: boolean,
    updateNewsletter: (fields: Partial<Newsletter>) => void
) => (
    <Form className='mt-6' gap='sm' margins='lg' title='Footer'>
        <ToggleGroup gap='lg'>
            <Toggle
                checked={newsletter.feedback_enabled}
                direction="rtl"