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

// ============================================================================
// Constants
// ============================================================================

const FONT_OPTIONS: SelectOption[] = [
    {value: 'serif', label: 'Elegant serif', className: 'font-serif'},
    {value: 'sans_serif', label: 'Clean sans-serif'}
];

const FONT_WEIGHT_OPTIONS: Record<string, {options: SelectOption[], map?: Record<string, string>}> = {
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

// ============================================================================
// Utility Functions
// ============================================================================

const getBackgroundColorIsDark = (backgroundColor: string): boolean => {
    if (backgroundColor === 'light') {
        return false;
    }
    return textColorForBackgroundColor(backgroundColor).hex().toLowerCase() === '#ffffff';
};

const getSelectedFontWeightOption = (
    newsletter: Newsletter,
    headingFontWeightOptions: SelectOption[]
): SelectOption => {
    const category = newsletter.title_font_category || 'sans_serif';
    const fontWeight = newsletter.title_font_weight;
    const weightMap = FONT_WEIGHT_OPTIONS[category].map;
    const mappedWeight = weightMap ? (weightMap[fontWeight] || fontWeight) : fontWeight;
    const option = headingFontWeightOptions.find(o => o.value === mappedWeight);
    return option || headingFontWeightOptions[0];
};

const validateNewsletter = (formState: Newsletter, config: any): Record<string, string> => {
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
};

// ============================================================================
// ReplyToEmailField Component
// ============================================================================

const ReplyToEmailField: React.FC<{
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
}> = ({newsletter, updateNewsletter, errors, clearError}) => {
    const {settings, config} = useGlobalData();
    const [defaultEmailAddress, supportEmailAddress] = getSettingValues<string>(settings, ['default_email_address', 'support_email_address']);
    const [senderReplyTo, setSenderReplyTo] = useState(renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || '');
    const newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);

    const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSenderReplyTo(e.target.value);
        updateNewsletter({sender_reply_to: e.target.value || 'newsletter'});
    }, [updateNewsletter]);

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

// ============================================================================
// SenderEmailField Component
// ============================================================================

const SenderEmailField: React.FC<{
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
}> = ({newsletter, updateNewsletter, errors, clearError}) => {
    const {settings, config} = useGlobalData();
    const [defaultEmailAddress] = getSettingValues<string>(settings, ['default_email_address']);
    const newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);

    if (!isManagedEmail(config)) {
        return (
            <TextField
                error={Boolean(errors.sender_email)}
                hint={errors.sender_email}
                placeholder={newsletterAddress || ''}
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

    return null;
};

// ============================================================================
// Form Sections
// ============================================================================

const GeneralSettingsTab: React.FC<{
    newsletter: Newsletter;
    onlyOne: boolean;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
    siteTitle: string;
    activeNewsletters: Newsletter[];
    confirmStatusChange: () => void;
}> = ({newsletter, onlyOne, updateNewsletter, errors, clearError, siteTitle, activeNewsletters, confirmStatusChange}) => {
    return (
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
                <SenderEmailField clearError={clearError} errors={errors} newsletter={newsletter} updateNewsletter={updateNewsletter} />
                <ReplyToEmailField clearError={clearError} errors={errors} newsletter={newsletter} updateNewsletter={updateNewsletter} />
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
};

const ContentTab: React.FC<{
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    handleError: (error: any) => void;
    icon: string;
    commentsEnabled: boolean;
    uploadImage: (file: any) => Promise<any>;
}> = ({newsletter, updateNewsletter, handleError, icon, commentsEnabled, uploadImage}) => {
    return (
        <>
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

            <Form className='mt-6' gap='sm' margins='lg' title='Footer'>
                <ToggleGroup gap='lg'>
                    <Toggle
                        checked={newsletter.feedback_enabled}
                        direction="rtl"
                        label='Ask your readers for feedback'
                        onChange={e => updateNewsletter({feedback_enabled: e.target.checked})}
                    />
                    {commentsEnabled && <Toggle
                        checked={newsletter.show_comment_cta}
                        direction="rtl"
                        label='Add a link to your comments'
                        onChange={e => updateNewsletter({show_comment_cta: e.target.checked})}
                    />}
                    <Toggle
                        checked={newsletter.show_latest_posts}
                        direction="rtl"
                        label='Share your latest posts'
                        onChange={e => updateNewsletter({show_latest_posts: e.target.checked})}
                    />
                    <Toggle
                        checked={newsletter.show_subscription_details}
                        direction="rtl"
                        label='Show subscription details'
                        onChange={e => updateNewsletter({show_subscription_details: e.target.checked})}
                    />
                </ToggleGroup>
                <HtmlField
                    hint='Any extra information or legal text'
                    nodes='MINIMAL_NODES'
                    placeholder=' '
                    title='Email footer'
                    value={newsletter.footer_content || ''}
                    onChange={html => updateNewsletter({footer_content: html})}
                />
            </Form>
            <Separator />
            <div className='my-5 flex w-full items-start'>
                <span>
                    <Icon className='mr-2 mt-[-1px]' colorClass='text-red' name='heart'/>
                </span>
                <Form marginBottom={false}>
                    <Toggle