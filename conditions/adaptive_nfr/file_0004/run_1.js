# Refactored Newsletter Detail Modal

## Key Refactoring Strategies Applied

1. **Extract custom hooks** to separate concerns and reduce component complexity
2. **Extract sub-components** for repeated patterns (ColorPicker rows, ButtonGroup rows)
3. **Data-driven configuration** to replace repetitive JSX
4. **Consolidate duplicated logic** in validation and email rendering

---

```typescript
import NewsletterPreview from './newsletter-preview';
import NiceModal from '@ebay/nice-modal-react';
import React, {useCallback, useEffect, useState} from 'react';
import useSettingGroup from '../../../../hooks/use-setting-group';
import validator from 'validator';
import {
    Button, ButtonGroup, ColorPickerField, ConfirmationModal, Form,
    Heading, Hint, HtmlField, Icon, ImageUpload, LimitModal,
    PreviewModalContent, Select, type SelectOption, Separator,
    type Tab, TabView, TextArea, TextField, Toggle, ToggleGroup, showToast
} from '@tryghost/admin-x-design-system';
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

// ---------------------------------------------------------------------------
// Constants / static config
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Shared primitive components
// ---------------------------------------------------------------------------

interface ColorRowProps {
    title: string;
    value: string | null | undefined;
    swatches: {value: string | null; title: string; hex: string}[];
    onChange: (color: string | null) => void;
}

const ColorRow: React.FC<ColorRowProps> = ({title, value, swatches, onChange}) => (
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

interface AlignmentRowProps {
    label: string;
    activeKey: string | undefined;
    disabled?: boolean;
    options: {key: string; icon: string; tooltip: string}[];
    onSelect: (key: string) => void;
}

const AlignmentRow: React.FC<AlignmentRowProps> = ({label, activeKey, disabled = false, options, onSelect}) => (
    <div className='flex w-full justify-between'>
        <div>{label}</div>
        <ButtonGroup
            activeKey={activeKey}
            buttons={options.map(opt => ({
                key: opt.key,
                icon: opt.icon,
                iconSize: 14 as const,
                label: opt.tooltip,
                tooltip: opt.tooltip,
                hideLabel: true,
                link: false,
                size: 'sm' as const,
                disabled,
                onClick: () => onSelect(opt.key)
            }))}
            clearBg={false}
        />
    </div>
);

// ---------------------------------------------------------------------------
// Custom hooks
// ---------------------------------------------------------------------------

function useNewsletterFontWeight(newsletter: Newsletter) {
    const category = newsletter.title_font_category || 'sans_serif';
    const headingOptions = FONT_WEIGHT_OPTIONS[category].options;

    const getSelectedOption = (): SelectOption => {
        const {map} = FONT_WEIGHT_OPTIONS[category];
        const weight = newsletter.title_font_weight;
        const mapped = map ? (map[weight] ?? weight) : weight;
        return headingOptions.find(o => o.value === mapped) ?? headingOptions[0];
    };

    const changeFont = (option: SelectOption | null, updateNewsletter: (f: Partial<Newsletter>) => void) => {
        const categoryValue = option?.value ?? 'sans_serif';
        const currentWeight = newsletter.title_font_weight;
        const weightExists = FONT_WEIGHT_OPTIONS[categoryValue].options.some(o => o.value === currentWeight);
        const newWeight = weightExists
            ? currentWeight
            : (FONT_WEIGHT_OPTIONS[categoryValue].map?.[currentWeight] ?? 'bold');

        updateNewsletter({title_font_category: categoryValue, title_font_weight: newWeight});
    };

    return {headingOptions, getSelectedOption, changeFont};
}

function useNewsletterStatus(newsletter: Newsletter) {
    const {updateRoute} = useRouting();
    const {mutateAsync: editNewsletter} = useEditNewsletter();
    const limiter = useLimiter();
    const handleError = useHandleError();

    const confirmStatusChange = async () => {
        if (newsletter.status === 'active') {
            NiceModal.show(ConfirmationModal, {
                title: 'Archive newsletter',
                prompt: (
                    <>
                        <div className="mb-6">
                            Your newsletter <strong>{newsletter.name}</strong> will no longer be visible
                            to members or available as an option when publishing new posts.
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

        NiceModal.show(ConfirmationModal, {
            title: 'Reactivate newsletter',
            prompt: (
                <>
                    Reactivating <strong>{newsletter.name}</strong> will immediately make it visible
                    to members and re-enable it as an option when publishing new posts.
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

    return {confirmStatusChange};
}

function useNewsletterValidation(config: ReturnType<typeof useGlobalData>['config']) {
    return (formState: Newsletter): Record<string, string> => {
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

        if (
            formState.sender_reply_to &&
            !validator.isEmail(formState.sender_reply_to) &&
            !['newsletter', 'support'].includes(formState.sender_reply_to)
        ) {
            errors.sender_reply_to = 'Enter a valid email address';
        }

        return errors;
    };
}

// ---------------------------------------------------------------------------
// ReplyToEmailField
// ---------------------------------------------------------------------------

interface ReplyToEmailFieldProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
}

const ReplyToEmailField: React.FC<ReplyToEmailFieldProps> = ({newsletter, updateNewsletter, errors, clearError}) => {
    const {settings, config} = useGlobalData();
    const [defaultEmailAddress, supportEmailAddress] = getSettingValues<string>(
        settings, ['default_email_address', 'support_email_address']
    );

    const [senderReplyTo, setSenderReplyTo] = useState(
        () => renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || ''
    );

    const newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);

    const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSenderReplyTo(e.target.value);
        updateNewsletter({sender_reply_to: e.target.value || 'newsletter'});
    }, [updateNewsletter]);

    const onBlur = useCallback(() => {
        setSenderReplyTo(
            renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || ''
        );
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

// ---------------------------------------------------------------------------
// Tab content components
// ---------------------------------------------------------------------------

interface TabContentProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
    validate: () => void;
}

const GeneralSettingsTab: React.FC<TabContentProps & {onlyOne: boolean}> = ({
    newsletter, updateNewsletter, errors, clearError, validate, onlyOne
}) => {
    const {settings, config} = useGlobalData();
    const [defaultEmailAddress] = getSettingValues<string>(settings, ['default_email_address']);
    const {localSettings} = useSettingGroup();
    const [siteTitle] = getSettingValues(localSettings, ['title']) as string[];
    const {data: {newsletters: apiNewsletters} = {}} = useBrowseNewsletters();
    const [newsletters, setNewsletters] = useState<Newsletter[]>(apiNewsletters || []);
    const {confirmStatusChange} = useNewsletterStatus(newsletter);

    useEffect(() => {
        setNewsletters(apiNewsletters || []);
    }, [apiNewsletters]);

    const activeNewsletters = newsletters.filter(n => n.status === 'active');
    const newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);

    const renderSenderEmailField = () => {
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
    };

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
                {newsletter.status === 'active'
                    ? (!onlyOne && (
                        <Button
                            color='red'
                            disabled={activeNewsletters.length === 1}
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

const ContentTab: React.FC<TabContentProps> = ({newsletter, updateNewsletter}) => {
    const {settings} = useGlobalData();
    const [icon] = getSettingValues<string>(settings, ['icon']);
    const {mutateAsync: uploadImage} = useUploadImage();
    const handleError = useHandleError();
    const commentsEnabled = ['all', 'paid'].includes(
        getSettingValue(settings, 'comments_enabled') || ''
    );

    const handleImageUpload = async (file: File) => {
        try {
            const imageUrl = getImageUrl(await uploadImage({file}));
            updateNewsletter({header_image: imageUrl});
        } catch (e) {
            handleError(e);
        }
    };

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
                            onUpload={handleImageUpload}
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

const DesignTab: React.FC<TabContentProps> = ({newsletter, updateNewsletter}) => {
    const {siteData} = useGlobalData();
    const {headingOptions, getSelectedOption, changeFont} = useNewsletterFontWeight(newsletter);

    const backgroundColorIsDark = textColorForBackgroundColor(
        newsletter.background_color === 'light' ? '#ffffff' : newsletter.background_color
    ).hex().toLowerCase() === '#ffffff' && newsletter.background_color !== 'light';

    const autoHex = backgroundColorIsDark ? '#ffffff' : '#000000';

    const accentSwatches = [
        {value: 'accent', title: 'Accent', hex: siteData.accent_color},
        {value: null, title: 'Auto', hex: autoHex}
    ];

    const autoFirstSwatches = [
        {value: null, title: 'Auto', hex: autoHex},
        {value: 'accent', title: 'Accent', hex: siteData.accent_color}
    ];

    return (
        <>
            <Form className='mt-6' gap='xs' margins='lg' title='Global'>
                <ColorRow
                    swatches={[{hex: '#ffffff', value: 'light', title: 'White'}]}
                    title='Background color'
                    value={newsletter.background_color || 'light'}
                    onChange={color => updateNewsletter({background_color: color!})}
                />
                <div className='flex w-full items-center justify-between gap-2'>
                    <div className='shrink-0'>Heading font</div>
                    <Select
                        containerClassName='max-w-[200px]'
                        options={FONT_OPTIONS}
                        selectedOption={FONT_OPTIONS.find(o => o.value === newsletter.title_font_category)}
                        onSelect={option => changeFont(option, updateNewsletter)}
                    />
                </div>
                <div className='flex w-full items-center justify-between gap-2'>
                    <div className='shrink-0'>Heading weight</div>
                    <Select
                        containerClassName='max-w-[200px]'
                        options={headingOptions}
                        selectedOption={getSelectedOption()}
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
                <ColorRow
                    swatches={[{value: 'transparent', title: 'Transparent', hex: '#00000000'}]}
                    title='Header background color'
                    value={newsletter.header_background_color || 'transparent'}
                    onChange={color => updateNewsletter({header_background_color: color!})}
                />
                <ColorRow
                    swatches={autoFirstSwatches}
                    title='Post title color'
                    value={newsletter.post_title_color}
                    onChange={color => updateNewsletter({post_title_color: color})}
                />
                <AlignmentRow
                    activeKey={newsletter.title_alignment}
                    disabled={!newsletter.show_post_title_section}
                    label='Title alignment'
                    options={[
                        {key: 'left', icon: 'align-left', tooltip: 'Left'},
                        {key: 'center', icon: 'align-center', tooltip: 'Center'}
                    ]}
                    onSelect={key => updateNewsletter({title_alignment: key})}
                />
            </Form>

            <Form className='mt-6' gap='xs' margins='lg' title='Body'>
                <ColorRow
                    swatches={autoFirstSwatches}
                    title='Section title color'
                    value={newsletter.section_title_color}
                    onChange={color => updateNewsletter({section_title_color: color})}
                />
                <ColorRow
                    swatches={accentSwatches}
                    title='Button color'
                    value={newsletter.button_color}
                    onChange={color => updateNewsletter({button_color: color})}
                />
                <AlignmentRow
                    activeKey={newsletter.button_style || 'fill'}
                    label='Button style'
                    options={[
                        {key: 'fill', icon: 'squircle-fill', tooltip: 'Fill'},
                        {key: 'outline', icon: 'squircle', tooltip: 'Outline'}
                    ]}
                    onSelect={key => updateNewsletter({button_style: key})}
                />
                <AlignmentRow
                    activeKey={newsletter.button_corners || 'rounded'}
                    label='Button corners'
                    options={[
                        {key: 'square', icon: 'square', tooltip: 'Squared'},
                        {key: 'rounded', icon: 'squircle', tooltip: 'Rounded'},
                        {key: 'pill', icon: 'circle', tooltip: 'Pill'}
                    ]}
                    onSelect={key => updateNewsletter({button_corners: key})}
                />
                <ColorRow
                    swatches={accentSwatches}
                    title='Link color'
                    value={newsletter.link_color}
                    onChange={color => updateNewsletter({link_color: color})}
                />
                <AlignmentRow
                    activeKey={newsletter.link_style || 'underline'}
                    label='Link style'
                    options={[
                        {key: 'underline', icon: 'text-underline', tooltip: 'Underline'},
                        {key: 'regular', icon: 'text-regular', tooltip: 'Regular'},
                        {key: 'bold', icon: 'text-bold', tooltip: 'Bold'}
                    ]}
                    onSelect={key => updateNewsletter({link_style: key})}
                />
                <AlignmentRow
                    activeKey={newsletter.image_corners || 'square'}
                    label='Image corners'
                    options={[
                        {key: 'square', icon: 'square', tooltip: 'Squared'},
                        {key: 'rounded', icon: 'squircle', tooltip: 'Rounded'}
                    ]}
                    onSelect={key => updateNewsletter({image_corners: key})}
                />
                <ColorRow
                    swatches={[
                        {value: 'light', title: 'Light', hex: '#e0e7eb'},
                        {value: 'accent', title: 'Accent', hex: siteData.accent_color}
                    ]}
                    title='Divider color'
                    value={newsletter.divider_color || 'light'}
                    onChange={color => updateNewsletter({divider_color: color})}
                />
            </Form>
        </>
    );
};

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface SidebarProps {
    newsletter: Newsletter;
    onlyOne: boolean;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    validate: () => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({newsletter, onlyOne, updateNewsletter, validate, errors, clearError}) => {
    const [selectedTab, setSelectedTab] = useState('generalSettings');

    const sharedProps = {newsletter, updateNewsletter, errors, clearError, validate};

    const tabs: Tab[] = [
        {
            id: 'generalSettings',
            title: 'General',
            contents: <GeneralSettingsTab {...sharedProps} onlyOne={onlyOne} />
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

// ---------------------------------------------------------------------------
// NewsletterDetailModalContent
// ---------------------------------------------------------------------------

const NewsletterDetailModalContent: React.FC<{newsletter: Newsletter; onlyOne: boolean}> = ({
    newsletter, onlyOne
}) => {
    const {config} = useGlobalData();
    const {mutateAsync: editNewsletter} = useEditNewsletter();
    const {updateRoute} = useRouting();
    const handleError = useHandleError();
    const validate = useNewsletterValidation(config);

    const {formState, saveState, updateForm, setFormState, handleSave, errors, clearError, okProps} = useForm({
        initialState: newsletter,
        savingDelay: 500,
        onSave: async () => {
            const {meta: {sent_email_verification: [emailToVerify] = []} = {}} = await editNewsletter(formState);

            if (emailToVerify && ['sender_email', 'sender_reply_to'].includes(emailToVerify)) {
                showToast({
                    icon: 'email',
                    message: <div>We&lsquo;ve sent a confirmation email to the new address.</div>,
                    type: 'info'
                });
            }
        },
        onSaveError: handleError,
        onValidate: () => validate(formState)
    });

    const updateNewsletter = useCallback(
        (fields: Partial<Newsletter>) => updateForm(state => ({...state, ...fields})),
        [updateForm]
    );

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
                    validate={() => validate(formState)}
                />
            }
            sidebarPadding={false}
            testId='newsletter-modal'
            title='Newsletter'
            onOk={async () => handleSave({fakeWhenUnchanged: true})}
        />
    );
};

// ---------------------------------------------------------------------------
// NewsletterDetailModal (entry point)
// ---------------------------------------------------------------------------

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

---

## Summary of Changes

| Technique | What changed |
|---|---|
| **Extract `ColorRow`** | Replaced 7 near-identical `<div><ColorPickerField …/></div>` blocks with a single reusable component |
| **Extract `AlignmentRow`** | Replaced 6 near-identical `ButtonGroup` rows (button style/corners/alignment/etc.) with a data-driven component |
| **Extract `useNewsletterFontWeight`** | Moved font-weight resolution and font-change logic out of `Sidebar` |
| **Extract `useNewsletterStatus`** | Moved archive/reactivate modal logic into its own hook |
| **Extract `useNewsletterValidation`** | Isolated validation into a pure function-returning hook |
| **Split `Sidebar` into tab components** | `GeneralSettingsTab`, `ContentTab`, `DesignTab` each own their data needs, eliminating the 300-line monolith |
| **Static constants** | `FONT_OPTIONS` / `FONT_WEIGHT_OPTIONS` moved to module scope (no re-creation on render) |
| **Simplified toast logic** | Collapsed duplicate `if (emailToVerify === 'sender_email') … else if (emailToVerify === 'sender_reply_to')` into a single `includes` check |
| **Removed redundant state** | `newsletters` state in `Sidebar` moved to `GeneralSettingsTab` where it's actually used |
| **`useCallback` on `updateNewsletter`** | Prevents unnecessary re-renders of child components |