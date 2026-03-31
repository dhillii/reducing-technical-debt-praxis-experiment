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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function useBackgroundColorIsDark(newsletter: Newsletter) {
    if (newsletter.background_color === 'light') {
        return false;
    }
    return textColorForBackgroundColor(newsletter.background_color).hex().toLowerCase() === '#ffffff';
}

function getSelectedFontWeightOption(newsletter: Newsletter) {
    const category = newsletter.title_font_category || 'sans_serif';
    const fontWeight = newsletter.title_font_weight;
    const {options, map} = FONT_WEIGHT_OPTIONS[category];
    const mappedWeight = map ? (map[fontWeight] ?? fontWeight) : fontWeight;
    return options.find(o => o.value === mappedWeight) ?? options[0];
}

function resolveNewTitleFontWeight(categoryValue: string, currentWeight: string): string {
    const {options, map} = FONT_WEIGHT_OPTIONS[categoryValue];
    if (options.find(o => o.value === currentWeight)) {
        return currentWeight;
    }
    return map?.[currentWeight] ?? 'bold';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

// ─── Sidebar Tab Contents ─────────────────────────────────────────────────────

interface GeneralSettingsTabProps extends NewsletterFieldProps {
    siteTitle: string;
    onlyOne: boolean;
    activeNewslettersCount: number;
    onStatusChange: () => void;
    newsletterStatus: string;
    renderSenderEmailField: () => React.ReactNode;
}

const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
    newsletter,
    updateNewsletter,
    errors,
    clearError,
    validate,
    siteTitle,
    onlyOne,
    activeNewslettersCount,
    onStatusChange,
    newsletterStatus,
    renderSenderEmailField
}) => (
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
            {renderSenderEmailField()}
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
            {newsletterStatus === 'active'
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

interface ContentTabProps extends Pick<NewsletterFieldProps, 'newsletter' | 'updateNewsletter'> {
    icon: string | undefined;
    commentsEnabled: boolean;
    onImageUpload: (file: File) => Promise<void>;
}

const ContentTab: React.FC<ContentTabProps> = ({newsletter, updateNewsletter, icon, commentsEnabled, onImageUpload}) => (
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
                        onUpload={onImageUpload}
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
                    onChange={e => updateNewsletter({show_badge: e.target.checked})}
                />
            </Form>
        </div>
    </>
);

interface DesignTabProps extends Pick<NewsletterFieldProps, 'newsletter' | 'updateNewsletter'> {
    accentColor: string;
    backgroundColorIsDark: boolean;
    headingFontWeightOptions: SelectOption[];
    onTitleFontChange: (option: SelectOption | null) => void;
}

const DesignTab: React.FC<DesignTabProps> = ({
    newsletter,
    updateNewsletter,
    accentColor,
    backgroundColorIsDark,
    headingFontWeightOptions,
    onTitleFontChange
}) => {
    const autoColorSwatch = {
        value: null,
        title: 'Auto',
        hex: backgroundColorIsDark ? '#ffffff' : '#000000'
    };
    const accentSwatch = {value: 'accent', title: 'Accent', hex: accentColor};

    return (
        <>
            <Form className='mt-6' gap='xs' margins='lg' title='Global'>
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={[{hex: '#ffffff', value: 'light', title: 'White'}]}
                        title='Background color'
                        value={newsletter.background_color || 'light'}
                        onChange={color => updateNewsletter({background_color: color!})}
                    />
                </div>
                <FontSelectRow
                    label="Heading font"
                    options={FONT_OPTIONS}
                    selectedValue={newsletter.title_font