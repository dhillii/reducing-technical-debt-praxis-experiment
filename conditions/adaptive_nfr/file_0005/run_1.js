```tsx
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

// ─── Constants ───────────────────────────────────────────────────────────────

const FONT_OPTIONS: SelectOption[] = [
    {value: 'serif', label: 'Elegant serif', className: 'font-serif'},
    {value: 'sans_serif', label: 'Clean sans-serif'}
];

const FONT_WEIGHT_OPTIONS: Record<string, {options: SelectOption[]; map?: Record<string, string>}> = {
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
        map: {medium: 'normal', semibold: 'bold'}
    }
};

// ─── Shared Types ─────────────────────────────────────────────────────────────

interface NewsletterFieldProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    validate: () => void;
    clearError: (field: string) => void;
}

// ─── Small Reusable Components ────────────────────────────────────────────────

const FontSelectRow: React.FC<{
    label: string;
    options: SelectOption[];
    selectedOption: SelectOption | undefined;
    testId?: string;
    onSelect: (option: SelectOption | null) => void;
}> = ({label, options, selectedOption, testId, onSelect}) => (
    <div className='flex w-full items-center justify-between gap-2'>
        <div className='shrink-0'>{label}</div>
        <Select
            containerClassName='max-w-[200px]'
            options={options}
            selectedOption={selectedOption}
            testId={testId}
            onSelect={onSelect}
        />
    </div>
);

const ButtonGroupRow: React.FC<{
    label: string;
    activeKey: string;
    buttons: React.ComponentProps<typeof ButtonGroup>['buttons'];
}> = ({label, activeKey, buttons}) => (
    <div className='flex w-full justify-between'>
        <div>{label}</div>
        <ButtonGroup activeKey={activeKey} buttons={buttons} clearBg={false} />
    </div>
);

const ColorRow: React.FC<{
    title: string;
    value: string | null | undefined;
    swatches: React.ComponentProps<typeof ColorPickerField>['swatches'];
    onChange: (color: string | null) => void;
}> = ({title, value, swatches, onChange}) => (
    <div className='mb-1'>
        <ColorPickerField
            direction='rtl'
            eyedropper={true}
            swatches={swatches}
            title={title}
            value={value}
            onChange={onChange}
        />
    </div>
);

// ─── ReplyToEmailField ────────────────────────────────────────────────────────

const ReplyToEmailField: React.FC<NewsletterFieldProps> = ({newsletter, updateNewsletter, errors, clearError}) => {
    const {settings, config} = useGlobalData();
    const [defaultEmailAddress, supportEmailAddress] = getSettingValues<string>(settings, ['default_email_address', 'support_email_address']);
    const newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);

    const [senderReplyTo, setSenderReplyTo] = useState(
        renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || ''
    );

    const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSenderReplyTo(e.target.value);
        updateNewsletter({sender_reply_to: e.target.value || 'newsletter'});
    }, [updateNewsletter]);

    const onBlur = useCallback(() => {
        setSenderReplyTo(renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || '');
    }, [newsletter, config, supportEmailAddress, defaultEmailAddress]);

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

// ─── SenderEmailField ─────────────────────────────────────────────────────────

const SenderEmailField: React.FC<NewsletterFieldProps & {defaultEmailAddress: string | undefined}> = ({
    newsletter, updateNewsletter, errors, clearError, defaultEmailAddress
}) => {
    const {config} = useGlobalData();
    const newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);

    if (isManagedEmail(config) && !hasSendingDomain(config)) {
        return null;
    }

    const placeholder = hasSendingDomain(config) ? (defaultEmailAddress ?? '') : (newsletterAddress ?? '');

    return (
        <TextField
            error={Boolean(errors.sender_email)}
            hint={errors.sender_email}
            maxLength={hasSendingDomain(config) ? 191 : undefined}
            placeholder={placeholder}
            title="Sender email address"
            value={newsletter.sender_email || ''}
            onChange={e => updateNewsletter({sender_email: e.target.value})}
            onKeyDown={() => clearError('sender_email')}
        />
    );
};

// ─── Tab Content Components ───────────────────────────────────────────────────

const GeneralSettingsTab: React.FC<NewsletterFieldProps & {
    onlyOne: boolean;
    siteTitle: string;
    defaultEmailAddress: string | undefined;
    activeNewslettersCount: number;
    onStatusChange: () => void;
}> = ({newsletter, updateNewsletter, errors, validate, clearError, onlyOne, siteTitle, defaultEmailAddress, activeNewslettersCount, onStatusChange}) => (
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
            <TextArea
                maxLength={2000}
                rows={2}
                title="Description"
                value={newsletter.description || ''}
                onChange={e => updateNewsletter({description: e.target.value})}
            />
        </Form>
        <Form className='mt-6' gap='sm' margins='lg' title='Email info'>
            <TextField
                maxLength={191}
                placeholder={siteTitle}
                title="Sender name"
                value={newsletter.sender_name || ''}
                onChange={e => updateNewsletter({sender_name: e.target.value})}
            />
            <SenderEmailField
                clearError={clearError}
                defaultEmailAddress={defaultEmailAddress}
                errors={errors}
                newsletter={newsletter}
                updateNewsletter={updateNewsletter}
                validate={validate}
            />
            <ReplyToEmailField
                clearError={clearError}
                errors={errors}
                newsletter={newsletter}
                updateNewsletter={updateNewsletter}
                validate={validate}
            />
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
            {newsletter.status === 'active'
                ? (!onlyOne && (
                    <Button
                        color='red'
                        disabled={activeNewslettersCount === 1}
                        label='Archive newsletter'
                        link
                        onClick={onStatusChange}
                    />
                ))
                : <Button color='green' label='Reactivate newsletter' link onClick={onStatusChange} />
            }
        </div>
    </>
);

const ContentTab: React.FC<NewsletterFieldProps & {
    icon: string | undefined;
    commentsEnabled: boolean;
    onUploadImage: (file: File) => Promise<void>;
}> = ({newsletter, updateNewsletter, icon, commentsEnabled, onUploadImage}) => (
    <>
        <Form className='mt-6' gap='sm' margins='lg' title='Header'>
            <div>
                <Heading className="mb-2" level={6}>Header image</Heading>
                <div className='flex-column flex gap-1'>
                    <ImageUpload
                        deleteButtonClassName='!top-1 !right-1'
                        height={newsletter.header_image ? '66px' : '64px'}
                        id='logo'
                        imageURL={newsletter.header_image || undefined}
                        onDelete={() => updateNewsletter({header_image: null})}
                        onUpload={onUploadImage}
                    >
                        <Icon colorClass='text-grey-700 dark:text-grey-300' name='picture' />
                    </ImageUpload>
                    <Hint>1200×600 recommended. Use a transparent PNG for best results on any background.</Hint>
                </div>
            </div>
            <ToggleGroup>
                {icon && (
                    <Toggle
                        checked={newsletter.show_header_icon}
                        direction="rtl"
                        label='Publication icon'
                        onChange={e => updateNewsletter({show_header_icon: e.target.checked})}
                    />
                )}
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
            {newsletter.show_post_title_section && (
                <Toggle
                    checked={newsletter.show_excerpt}
                    direction="rtl"
                    label="Post excerpt"
                    onChange={e => updateNewsletter({show_excerpt: e.target.checked})}
                />
            )}
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
                {commentsEnabled && (
                    <Toggle
                        checked={newsletter.show_comment_cta}
                        direction="rtl"
                        label='Add a link to your comments'
                        onChange={e => updateNewsletter({show_comment_cta: e.target.checked})}
                    />
                )}
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
                <Icon className='mr-2 mt-[-1px]' colorClass='text-red' name='heart' />
            </span>
            <Form marginBottom={false}>
                <Toggle
                    checked={newsletter.show_badge}
                    direction='rtl'
                    label={
                        <div className='flex flex-col gap-0.5'>
                            <span className='text-sm md:text-base'>Promote independent publishing</span>
                            <span className='text-[11px] leading-tight text-grey-700 md:text-xs md:leading-tight'>
                                Show you&apos;re a part of the indie publishing movement with a small badge in the footer
                            </span>
                        </div>
                    }
                    labelStyle='value'
                    onChange={e => updateNewsletter({show_badge: e.target.checked}