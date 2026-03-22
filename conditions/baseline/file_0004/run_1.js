Here's the refactored code with reduced complexity through component extraction, custom hooks, and helper utilities:

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

const isBackgroundColorDark = (newsletter: Newsletter): boolean => {
    if (newsletter.background_color === 'light') {
        return false;
    }
    return textColorForBackgroundColor(newsletter.background_color).hex().toLowerCase() === '#ffffff';
};

const getSelectedFontWeightOption = (newsletter: Newsletter): SelectOption => {
    const category = newsletter.title_font_category || 'sans_serif';
    const fontWeight = newsletter.title_font_weight;
    const {options, map} = FONT_WEIGHT_OPTIONS[category];
    const mappedWeight = map ? (map[fontWeight] ?? fontWeight) : fontWeight;
    return options.find(o => o.value === mappedWeight) ?? options[0];
};

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

interface SenderEmailFieldProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
    newsletterAddress: string | null;
    defaultEmailAddress: string;
}

const SenderEmailField: React.FC<SenderEmailFieldProps> = ({newsletter, updateNewsletter, errors, clearError, newsletterAddress, defaultEmailAddress}) => {
    const {config} = useGlobalData();

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
                onChange={e => updateNewsletter({sender_email: e.target.value})}
                onKeyDown={() => clearError('sender_email')}
            />
        );
    }

    return null;
};

// ─── Custom Hooks ─────────────────────────────────────────────────────────────

const useNewsletterStatus = (newsletter: Newsletter) => {
    const {updateRoute} = useRouting();
    const {mutateAsync: editNewsletter} = useEditNewsletter();
    const limiter = useLimiter();
    const handleError = useHandleError();

    const archiveNewsletter = () => {
        NiceModal.show(ConfirmationModal, {
            title: 'Archive newsletter',
            prompt: (
                <>
                    <div className="mb-6">
                        Your newsletter <strong>{newsletter.name}</strong> will no longer be visible to members or available as an option when publishing new posts.
                    </div>
                    <div>Existing posts previously sent as this newsletter will remain unchanged.</div>
                </>
            ),
            okLabel: 'Archive',
            okColor: 'red',
            onOk: async (modal) => {
                try {
                    await editNewsletter({...newsletter, status: 'archived'});
                    modal?.remove();
                    showToast({type: 'success', message: 'Newsletter archived'});
                } catch (e) {
                    handleError(e);
                }
            }
        });
    };

    const reactivateNewsletter = () => {
        NiceModal.show(ConfirmationModal, {
            title: 'Reactivate newsletter',
            prompt: (
                <>
                    Reactivating <strong>{newsletter.name}</strong> will immediately make it visible to members and re-enable it as an option when publishing new posts.
                </>
            ),
            okLabel: 'Reactivate',
            onOk: async (modal) => {
                await editNewsletter({...newsletter, status: 'active'});
                modal?.remove();
                showToast({type: 'success', message: 'Newsletter reactivated'});
            }
        });
    };

    const confirmStatusChange = async () => {
        if (newsletter.status === 'active') {
            archiveNewsletter();
            return;
        }

        try {
            await limiter?.errorIfWouldGoOverLimit('newsletters');
        } catch (error) {
            if (error instanceof HostLimitError) {
                NiceModal.show(LimitModal, {
                    prompt: error.message || `Your current plan doesn't support more newsletters.`,
                    onOk: () => updateRoute({route: '/pro', isExternal: true})
                });
                return;
            }
            throw error;
        }

        reactivateNewsletter();
    };

    return {confirmStatusChange};
};

// ─── Tab Content Components ───────────────────────────────────────────────────

const GeneralSettingsTab: React.FC<NewsletterFieldProps & {onlyOne: boolean; activeNewslettersCount: number}> = ({
    newsletter, updateNewsletter, errors, clearError, validate, onlyOne, activeNewslettersCount
}) => {
    const {settings, config} = useGlobalData();
    const [defaultEmailAddress] = getSettingValues<string>(settings, ['default_email_address']);
    const {localSettings} = useSettingGroup();
    const [siteTitle] = getSettingValues(localSettings, ['title']) as string[];
    const newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);
    const {confirmStatusChange} = useNewsletterStatus(newsletter);

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
                    defaultEmailAddress={defaultEmailAddress || ''}
                    errors={errors}
                    newsletter={newsletter}
                    newsletterAddress={newsletterAddress}
                    updateNewsletter={updateNewsletter}
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
                            onClick={confirmStatusChange}
                        />
                    ))
                    : <Button color='green' label='Reactivate newsletter' link onClick={confirmStatusChange} />
                }
            </div>
        </>
    );
};

const ContentTab: React.FC<NewsletterFieldProps> = ({newsletter, updateNewsletter}) => {
    const {settings} = useGlobalData();
    const [icon] = getSettingValues<string>(settings, ['icon']);
    const {mutateAsync: uploadImage} = useUploadImage();
    const handleError = useHandleError();
    const commentsEnabled = ['all', 'paid'].includes(getSettingValue(settings, 'comments_enabled') || '');

    return (
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
};

interface ColorSwatchConfig {
    value: string | null;
    title: string;
    hex: string;
}

interface AutoAccentSwatchesProps {
    newsletter: Newsletter;
    accentColor: string;
}

const getAutoAccentSwatches = ({newsletter, accentColor}: AutoAccentSwatchesProps): ColorSwatchConfig[] => [
    {value: null, title: 'Auto', hex: isBackgroundColorDark(newsletter) ? '#ffffff' : '#000000'},
    {value: 'accent', title: 'Accent', hex: accentColor}
];

const getAccentAutoSwatches = ({newsletter, accentColor}: AutoAccentSwatchesProps): ColorSwatchConfig[] => [
    {value: 'accent', title: 'Accent', hex: accentColor},
    {value: null, title: 'Auto', hex: isBackgroundColorDark(newsletter) ? '#ffffff' : '#000000'}
];

const DesignTab: React.FC<NewsletterFieldProps> = ({newsletter, updateNewsletter}) => {
    const {siteData} = useGlobalData();
    const accentColor = siteData.accent_color;
    const backgroundIsDark = isBackgroundColorDark(newsletter);

    const headingFontWeightOptions = FONT_WEIGHT_OPTIONS[newsletter.title_font_category || 'sans_serif'].options;

    const changeSelectedTitleFont = (option: SelectOption | null) => {
        const categoryValue = option?.value || 'sans_serif';
        const currentWeight = newsletter.title_font_weight;
        const weightOptions = FONT_WEIGHT_OPTIONS[categoryValue];
        const newWeight = weightOptions.options.find(o => o.value === currentWeight)
            ? currentWeight
            : (weightOptions.map?.[currentWeight] ?? 'bold');

        updateNewsletter({title_font_category: categoryValue, title_font_weight: newWeight});
    };

    const makeButtonGroupProps = (
        activeKey: string,
        buttons: Array<{key: string; icon: string; label: string; tooltip: string; onClick: () => void; disabled?: boolean}>
    ) => ({
        activeKey,
        clearBg: false,
        buttons: buttons.map(({key, icon, label, tooltip, onClick, disabled}) => ({
            key,
            icon,
            iconSize: 14,
            label,
            tooltip,
            hideLabel: true,
            link: false,
            size: 'sm' as const,
            onClick,
            ...(disabled !== undefined && {disabled})
        }))
    });

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
                <div className='flex w-full items-center justify-between gap-2'>
                    <div className='shrink-0'>Heading font</div>
                    <Select
                        containerClassName='max-w-[200px]'
                        options={FONT_OPTIONS}
                        selectedOption={FONT_OPTIONS.find(o => o.value === newsletter.title_font_category)}
                        onSelect={changeSelectedTitleFont}
                    />
                </div>
                <div className='flex w-full items-center justify-between gap-2'>
                    <div className='shrink-0'>Heading weight</div>
                    <Select
                        containerClassName='max-w-[200px]'
                        options={headingFontWeightOptions}
                        selectedOption={getSelectedFontWeightOption(newsletter)}
                        onSelect={option => updateNewsletter({title_font_weight: option?.value})}
                    />
                </div>
                <div className='flex w-full items-center justify-between gap-2'>
                    <div className='shrink-0'>Body font</div>
                    <Select
                        containerClassName='max-w-[200px]'
                        options={FONT_OPTIONS}
                        selectedOption={FONT_OPTIONS.find(o => o.value === newsletter.body_font_category)}
                        testId='body-font-select'
                        onSelect={option => updateNewsletter({body_font_category: option?.value})}
                    />
                </div>
            </Form>

            <Form className='mt-6' gap='xs' margins='lg' title='Header'>
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={[{value: 'transparent', title: 'Transparent', hex: '#00000000'}]}
                        title='Header background color'
                        value={newsletter.header_background_color || 'transparent'}
                        onChange={color => updateNewsletter({header_background_color: color!})}
                    />
                </div>
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={getAutoAccentSwatches({newsletter, accentColor})}
                        title='Post title color'
                        value={newsletter.post_title_color}
                        onChange={color => updateNewsletter({post_title_color: color})}
                    />
                </div>
                <div className='flex w-full justify-between'>
                    <div>Title alignment</div>
                    <ButtonGroup {...makeButtonGroupProps(newsletter.title_alignment, [
                        {key: 'left', icon: 'align-left', label: 'Align left', tooltip: 'Left', onClick: () => updateNewsletter({title_alignment: 'left'}), disabled: !newsletter.show_post_title_section},
                        {key: 'center', icon: 'align-center', label: 'Align center', tooltip: 'Center', onClick: () => updateNewsletter({title_alignment: 'center'}), disabled: !newsletter.show_post_title_section}
                    ])} />
                </div>
            </Form>

            <Form className='mt-6' gap='xs' margins='lg' title='Body'>
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={getAutoAccentSwatches({newsletter, accentColor})}
                        title='Section title color'
                        value={newsletter.section_title_color}
                        onChange={color => updateNewsletter({section_title_color: color})}
                    />
                </div>
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={getAccentAutoSwatches({newsletter, accentColor})}
                        title='Button color'
                        value={newsletter.button_color}
                        onChange={color => updateNewsletter({button_color: color})}
                    />
                </div>
                <div className='flex w-full justify-between'>
                    <div>Button style</div>
                    <ButtonGroup {...makeButtonGroupProps(newsletter.button_style || 'fill', [
                        {key: 'fill', icon: 'squircle-fill', label: 'Fill', tooltip: 'Fill', onClick: () => updateNewsletter({button_style: 'fill'})},
                        {key: 'outline', icon: 'squircle', label: 'Outline', tooltip: 'Outline', onClick: () => updateNewsletter({button_style: 'outline'})}
                    ])} />
                </div>
                <div className='flex w-full justify-between'>
                    <div>Button corners</div>
                    <ButtonGroup {...makeButtonGroupProps(newsletter.button_corners || 'rounded', [
                        {key: 'square', icon: 'square', label: 'Square', tooltip: 'Squared', onClick: () => updateNewsletter({button_corners: 'square'})},
                        {key: 'rounded', icon: 'squircle', label: 'Rounded', tooltip: 'Rounded', onClick: () => updateNewsletter({button_corners: 'rounded'})},
                        {key: 'pill', icon: 'circle', label: 'Pill', tooltip: 'Pill', onClick: () => updateNewsletter({button_corners: 'pill'})}
                    ])} />
                </div>
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={getAccentAutoSwatches({newsletter, accentColor})}
                        title='Link color'
                        value={newsletter.link_color}
                        onChange={color => updateNewsletter({link_color: color})}
                    />
                </div>
                <div className='flex w-full justify-between'>
                    <div>Link style</div>
                    <ButtonGroup {...makeButtonGroupProps(newsletter.link_style || 'underline', [
                        {key: 'underline', icon: 'text-underline', label: 'Underline', tooltip: 'Underline', onClick: () => updateNewsletter({link_style: 'underline'})},
                        {key: 'regular', icon: 'text-regular', label: 'Regular', tooltip: 'Regular', onClick: () => updateNewsletter({link_style: 'regular'})},
                        {key: 'bold', icon: 'text-bold', label: 'Bold', tooltip: 'Bold', onClick: () => updateNewsletter({link_style: 'bold'})}
                    ])} />
                </div>
                <div className='flex w-full justify-between'>
                    <div>Image corners</div>
                    <ButtonGroup {...makeButtonGroupProps(newsletter.image_corners || 'square', [
                        {key: 'square', icon: 'square', label: 'Square', tooltip: 'Squared', onClick: () => updateNewsletter({image_corners: 'square'})},
                        {key: 'rounded', icon: 'squircle', label: 'Rounded', tooltip: 'Rounded', onClick: () => updateNewsletter({image_corners: 'rounded'})}
                    ])} />
                </div>
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={[
                            {value: 'light', title: 'Light', hex: '#e0e7eb'},
                            {value: 'accent', title: 'Accent', hex: accentColor}
                        ]}
                        title='Divider color'
                        value={newsletter.divider_color || 'light'}
                        onChange={color => updateNewsletter({divider_color: color})}
                    />
                </div>
            </Form>
        </>
    );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps extends NewsletterFieldProps {
    onlyOne: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({newsletter, onlyOne, updateNewsletter, validate, errors, clearError}) => {
    const {data: {newsletters: apiNewsletters} = {}} = useBrowseNewsletters();
    const [newsletters, setNewsletters] = useState<Newsletter[]>(apiNewsletters || []);
    const [selectedTab, setSelectedTab] = useState('generalSettings');

    useEffect(() => {
        setNewsletters(apiNewsletters || []);
    }, [apiNewsletters]);

    const activeNewslettersCount = newsletters.filter(n => n.status === 'active').length;

    const sharedProps: NewsletterFieldProps = {newsletter, updateNewsletter, validate, errors, clearError};

    const tabs: Tab[] = [
        {
            id: 'generalSettings',
            title: 'General',
            contents: (
                <GeneralSettingsTab
                    {...sharedProps}
                    activeNewslettersCount={activeNewslettersCount}
                    onlyOne={onlyOne}
                />
            )
        },
        {
            id: 'content',
            title: 'Content',
            contents: <ContentTab {...sharedProps} />
        },
        {
            id: 'design',
            title: 'Design',
            contents: <DesignTab {...sharedProps} />
        }
    ];

    return (
        <div className='flex flex-col'>
            <div className='px-7 pb-7 pt-0'>
                <TabView
                    selectedTab={selectedTab}
                    stickyHeader={true}
                    tabs={tabs}
                    onTabChange={setSelectedTab}
                />
            </div>
        </div>
    );
};

// ─── Validation ───────────────────────────────────────────────────────────────

const validateNewsletterForm = (formState: Newsletter, config: ReturnType<typeof useGlobalData>['config']): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (!formState.name) {
        errors.name = 'A name is required for your newsletter';
    }

    if (formState.sender_email) {
        if (!validator.isEmail(formState.sender_email)) {
            errors.sender_email = 'Enter a valid email address';
        } else if (hasSendingDomain(config) && formState.sender_email.split('@')[1] !== sendingDomain(config)) {
            errors.sender_email = `Email address must end with @${sendingDomain(config)}`;
        }
    }

    if (formState.sender_reply_to &&
        !validator.isEmail(formState.sender_reply_to) &&
        !['newsletter', 'support'].includes(formState.sender_reply_to)
    ) {
        errors.sender_reply_to = 'Enter a valid email address';
    }

    return errors;
};

const getVerificationToastMessage = (emailToVerify?: string): React.ReactNode | null => {
    if (emailToVerify === 'sender_email' || emailToVerify === 'sender_reply_to') {
        return <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
    }
    return null;
};

// ─── Modal Content ────────────────────────────────────────────────────────────

const NewsletterDetailModalContent: React.FC<{newsletter: Newsletter; onlyOne: boolean}> = ({newsletter, onlyOne}) => {
    const {config} = useGlobalData();
    const {mutateAsync: editNewsletter} = useEditNewsletter();
    const {updateRoute} = useRouting();
    const handleError = useHandleError();

    const {formState, saveState, updateForm, setFormState, handleSave, validate, errors, clearError, okProps} = useForm({
        initialState: newsletter,
        savingDelay: 500,
        onSave: async () => {
            const {meta: {sent_email_verification: [emailToVerify] = []} = {}} = await editNewsletter(formState);
            const toastMessage = getVerificationToastMessage(emailToVerify);

            if (toastMessage) {
                showToast({icon: 'email', message: toastMessage, type: 'info'});
            }
        },
        onSaveError: handleError,
        onValidate: () => validateNewsletterForm(formState, config)
    });

    const updateNewsletter = useCallback((fields: Partial<Newsletter>) => {
        updateForm(state => ({...state, ...fields}));
    }, [updateForm]);

    useEffect(() => {
        setFormState(() => newsletter);
    }, [setFormState, newsletter]);

    return (
        <PreviewModalContent
            afterClose={() => updateRoute('newsletters')}
            buttonsDisabled={okProps.disabled}
            cancelLabel='Close'
            deviceSelector={false}
            dirty={saveState === 'unsaved'}
            okColor={okProps.color}
            okLabel={okProps.label || 'Save'}
            preview={<NewsletterPreview newsletter={formState} />}
            previewBgColor='grey'
            previewToolbar={false}
            sidebar={
                <Sidebar
                    clearError={clearError}
                    errors={errors}
                    newsletter={formState}
                    onlyOne={onlyOne}
                    updateNewsletter={updateNewsletter}
                    validate={validate}
                />
            }
            sidebarPadding={false}
            testId='newsletter-modal'
            title='Newsletter'
            onOk={async () => {
                await handleSave({fakeWhenUnchanged: true});
            }}
        />
    );
};

// ─── Root Modal ───────────────────────────────────────────────────────────────

const NewsletterDetailModal: React.FC<RoutingModalProps> = ({params}) => {
    const {data: {newsletters, isEnd} = {}, fetchNextPage} = useBrowseNewsletters();
    const newsletter = newsletters?.find(({id}) => id === params?.id);

    useEffect(() => {
        if (!newsletter && !isEnd) {
            fetchNextPage();
        }
    }, [fetchNextPage, isEnd, newsletter]);

    if (!newsletter) {
        return null;
    }

    return <NewsletterDetailModalContent newsletter={newsletter} onlyOne={newsletters!.length === 1} />;
};

export default NiceModal.create(NewsletterDetailModal);
```

Key refactoring decisions:

1. **Extracted constants** (`FONT_OPTIONS`, `FONT_WEIGHT_OPTIONS`) to module scope, eliminating recreation on every render.

2. **Extracted pure helper functions** (`isBackgroundColorDark`, `getSelectedFontWeightOption`, `validateNewsletterForm`, `getVerificationToastMessage`) out of components, making them independently testable.

3. **Split the monolithic `Sidebar`** into three focused tab components (`GeneralSettingsTab`, `ContentTab`, `DesignTab`), each with a single responsibility.

4. **Extracted `SenderEmailField`** as a proper component instead of an inline render function, improving readability and testability.

5. **Created `useNewsletterStatus` hook** to encapsulate archive/reactivate logic, removing it from the render tree.

6. **Introduced `makeButtonGroupProps` helper** in `DesignTab` to eliminate the repetitive `ButtonGroup` prop boilerplate across six instances.

7. **Introduced `getAutoAccentSwatches`/`getAccentAutoSwatches` helpers** to deduplicate repeated color swatch configurations.

8. **Added a shared `NewsletterFieldProps` interface** to avoid repeating the same prop signature across components.

9. **Simplified `NewsletterDetailModal`** with an early return guard instead of a ternary.

10. **Added `useCallback`** to `updateNewsletter` in the modal content to stabilise the reference passed to children.