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

const getBackgroundColorIsDark = (newsletter: Newsletter): boolean => {
    if (newsletter.background_color === 'light') {
        return false;
    }
    return textColorForBackgroundColor(newsletter.background_color).hex().toLowerCase() === '#ffffff';
};

const getSelectedFontWeightOption = (newsletter: Newsletter): SelectOption => {
    const category = newsletter.title_font_category || 'sans_serif';
    const fontWeight = newsletter.title_font_weight;
    const weightMap = FONT_WEIGHT_OPTIONS[category].map;
    const mappedWeight = weightMap ? (weightMap[fontWeight] || fontWeight) : fontWeight;
    const headingFontWeightOptions = FONT_WEIGHT_OPTIONS[category].options;
    const option = headingFontWeightOptions.find(o => o.value === mappedWeight);
    return option || headingFontWeightOptions[0];
};

const getNewFontWeight = (currentWeight: string, newCategory: string): string => {
    if (!FONT_WEIGHT_OPTIONS[newCategory].options.find(o => o.value === currentWeight)) {
        return FONT_WEIGHT_OPTIONS[newCategory].map?.[currentWeight] || 'bold';
    }
    return currentWeight;
};

const validateNewsletterForm = (formState: Newsletter, config: any): Record<string, string> => {
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
    defaultEmailAddress: string;
}> = ({newsletter, updateNewsletter, errors, clearError, defaultEmailAddress}) => {
    const {config} = useGlobalData();
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
// Design Tab Components
// ============================================================================

const DesignGlobalSection: React.FC<{
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    siteData: any;
}> = ({newsletter, updateNewsletter, siteData}) => (
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
                options={FONT_OPTIONS}
                selectedOption={FONT_OPTIONS.find(option => option.value === newsletter.title_font_category)}
                onSelect={option => {
                    const categoryValue = option?.value || 'sans_serif';
                    const newWeight = getNewFontWeight(newsletter.title_font_weight, categoryValue);
                    updateNewsletter({
                        title_font_category: categoryValue,
                        title_font_weight: newWeight
                    });
                }}
            />
        </div>
        <div className='flex w-full items-center justify-between gap-2'>
            <div className='shrink-0'>Heading weight</div>
            <Select
                containerClassName='max-w-[200px]'
                options={FONT_WEIGHT_OPTIONS[newsletter.title_font_category || 'sans_serif'].options}
                selectedOption={getSelectedFontWeightOption(newsletter)}
                onSelect={option => updateNewsletter({title_font_weight: option?.value})}
            />
        </div>
        <div className='flex w-full items-center justify-between gap-2'>
            <div className='shrink-0'>Body font</div>
            <Select
                containerClassName='max-w-[200px]'
                options={FONT_OPTIONS}
                selectedOption={FONT_OPTIONS.find(option => option.value === newsletter.body_font_category)}
                testId='body-font-select'
                onSelect={option => updateNewsletter({body_font_category: option?.value})}
            />
        </div>
    </Form>
);

const DesignHeaderSection: React.FC<{
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    siteData: any;
}> = ({newsletter, updateNewsletter, siteData}) => {
    const isDark = getBackgroundColorIsDark(newsletter);

    return (
        <Form className='mt-6' gap='xs' margins='lg' title='Header'>
            <div className='mb-1'>
                <ColorPickerField
                    direction='rtl'
                    eyedropper={true}
                    swatches={[
                        {
                            value: 'transparent',
                            title: 'Transparent',
                            hex: '#00000000'
                        }
                    ]}
                    title='Header background color'
                    value={newsletter.header_background_color || 'transparent'}
                    onChange={color => updateNewsletter({header_background_color: color!})}
                />
            </div>
            <div className='mb-1'>
                <ColorPickerField
                    direction='rtl'
                    eyedropper={true}
                    swatches={[
                        {
                            value: null,
                            title: 'Auto',
                            hex: isDark ? '#ffffff' : '#000000'
                        },
                        {
                            value: 'accent',
                            title: 'Accent',
                            hex: siteData.accent_color
                        }
                    ]}
                    title='Post title color'
                    value={newsletter.post_title_color}
                    onChange={color => updateNewsletter({post_title_color: color})}
                />
            </div>
            <div className='flex w-full justify-between'>
                <div>Title alignment</div>
                <ButtonGroup activeKey={newsletter.title_alignment} buttons={[
                    {
                        key: 'left',
                        icon: 'align-left',
                        iconSize: 14,
                        label: 'Align left',
                        tooltip: 'Left',
                        hideLabel: true,
                        link: false,
                        size: 'sm',
                        onClick: () => updateNewsletter({title_alignment: 'left'}),
                        disabled: !newsletter.show_post_title_section
                    },
                    {
                        key: 'center',
                        icon: 'align-center',
                        iconSize: 14,
                        label: 'Align center',
                        tooltip: 'Center',
                        hideLabel: true,
                        link: false,
                        size: 'sm',
                        onClick: () => updateNewsletter({title_alignment: 'center'}),
                        disabled: !newsletter.show_post_title_section
                    }
                ]} clearBg={false} />
            </div>
        </Form>
    );
};

const DesignBodySection: React.FC<{
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    siteData: any;
}> = ({newsletter, updateNewsletter, siteData}) => {
    const isDark = getBackgroundColorIsDark(newsletter);

    return (
        <Form className='mt-6' gap='xs' margins='lg' title='Body'>
            <div className='mb-1'>
                <ColorPickerField
                    direction='rtl'
                    eyedropper={true}
                    swatches={[
                        {
                            value: null,
                            title: 'Auto',
                            hex: isDark ? '#ffffff' : '#000000'
                        },
                        {
                            value: 'accent',
                            title: 'Accent',
                            hex: siteData.accent_color
                        }
                    ]}
                    title='Section title color'
                    value={newsletter.section_title_color}
                    onChange={color => updateNewsletter({section_title_color: color})}
                />
            </div>
            <div className='mb-1'>
                <ColorPickerField
                    direction='rtl'
                    eyedropper={true}
                    swatches={[
                        {
                            value: 'accent',
                            title: 'Accent',
                            hex: siteData.accent_color
                        },
                        {
                            value: null,
                            title: 'Auto',
                            hex: isDark ? '#ffffff' : '#000000'
                        }
                    ]}
                    title='Button color'
                    value={newsletter.button_color}
                    onChange={color => updateNewsletter({button_color: color})}
                />
            </div>
            <div className='flex w-full justify-between'>
                <div>Button style</div>
                <ButtonGroup activeKey={newsletter.button_style || 'fill'} buttons={[
                    {
                        key: 'fill',
                        icon: 'squ