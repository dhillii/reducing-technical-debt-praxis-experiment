Here's the refactored code with reduced complexity through component extraction, custom hooks, and helper utilities:

```typescript
// hooks/useNewsletterForm.ts
import validator from 'validator';
import {useForm, useHandleError} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter, useEditNewsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {hasSendingDomain, sendingDomain} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../../../providers/global-data-provider';
import {showToast} from '@tryghost/admin-x-design-system';
import {useEffect} from 'react';

export const useNewsletterForm = (newsletter: Newsletter) => {
    const {config} = useGlobalData();
    const {mutateAsync: editNewsletter} = useEditNewsletter();
    const handleError = useHandleError();

    const validateForm = (formState: Newsletter) => {
        const newErrors: Record<string, string> = {};

        if (!formState.name) {
            newErrors.name = 'A name is required for your newsletter';
        }

        if (formState.sender_email) {
            if (!validator.isEmail(formState.sender_email)) {
                newErrors.sender_email = 'Enter a valid email address';
            } else if (hasSendingDomain(config) && formState.sender_email.split('@')[1] !== sendingDomain(config)) {
                newErrors.sender_email = `Email address must end with @${sendingDomain(config)}`;
            }
        }

        if (formState.sender_reply_to &&
            !validator.isEmail(formState.sender_reply_to) &&
            !['newsletter', 'support'].includes(formState.sender_reply_to)) {
            newErrors.sender_reply_to = 'Enter a valid email address';
        }

        return newErrors;
    };

    const handleSaveSuccess = async (formState: Newsletter) => {
        const {meta: {sent_email_verification: [emailToVerify] = []} = {}} = await editNewsletter(formState);

        if (emailToVerify && ['sender_email', 'sender_reply_to'].includes(emailToVerify)) {
            showToast({
                icon: 'email',
                message: <div>We&lsquo;ve sent a confirmation email to the new address.</div>,
                type: 'info'
            });
        }
    };

    const form = useForm({
        initialState: newsletter,
        savingDelay: 500,
        onSave: () => handleSaveSuccess(form.formState),
        onSaveError: handleError,
        onValidate: () => validateForm(form.formState)
    });

    useEffect(() => {
        form.setFormState(() => newsletter);
    }, [newsletter]);

    const updateNewsletter = (fields: Partial<Newsletter>) => {
        form.updateForm(state => ({...state, ...fields}));
    };

    return {...form, updateNewsletter};
};
```

```typescript
// hooks/useNewsletterStatus.ts
import NiceModal from '@ebay/nice-modal-react';
import {ConfirmationModal, LimitModal, showToast} from '@tryghost/admin-x-design-system';
import {type Newsletter, useEditNewsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {useRouting} from '@tryghost/admin-x-framework/routing';
import {HostLimitError, useLimiter} from '../../../../hooks/use-limiter';
import {useHandleError} from '@tryghost/admin-x-framework/hooks';

export const useNewsletterStatus = (newsletter: Newsletter) => {
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
    };

    const reactivateNewsletter = () => {
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

    const checkReactivationLimit = async () => {
        try {
            await limiter?.errorIfWouldGoOverLimit('newsletters');
            return true;
        } catch (error) {
            if (error instanceof HostLimitError) {
                NiceModal.show(LimitModal, {
                    prompt: error.message || `Your current plan doesn't support more newsletters.`,
                    onOk: () => updateRoute({route: '/pro', isExternal: true})
                });
                return false;
            }
            throw error;
        }
    };

    const confirmStatusChange = async () => {
        if (newsletter.status === 'active') {
            archiveNewsletter();
        } else {
            const canReactivate = await checkReactivationLimit();
            if (canReactivate) {
                reactivateNewsletter();
            }
        }
    };

    return {confirmStatusChange};
};
```

```typescript
// hooks/useFontOptions.ts
import {type SelectOption} from '@tryghost/admin-x-design-system';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';

export const FONT_OPTIONS: SelectOption[] = [
    {value: 'serif', label: 'Elegant serif', className: 'font-serif'},
    {value: 'sans_serif', label: 'Clean sans-serif'}
];

export const FONT_WEIGHT_OPTIONS: Record<string, {options: SelectOption[], map?: Record<string, string>}> = {
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

export const useFontOptions = (newsletter: Newsletter, updateNewsletter: (fields: Partial<Newsletter>) => void) => {
    const category = newsletter.title_font_category || 'sans_serif';
    const headingFontWeightOptions = FONT_WEIGHT_OPTIONS[category].options;

    const getSelectedFontWeightOption = () => {
        const fontWeight = newsletter.title_font_weight;
        const weightMap = FONT_WEIGHT_OPTIONS[category].map;
        const mappedWeight = weightMap ? (weightMap[fontWeight] || fontWeight) : fontWeight;
        return headingFontWeightOptions.find(o => o.value === mappedWeight) || headingFontWeightOptions[0];
    };

    const changeSelectedTitleFont = (option: SelectOption | null) => {
        const categoryValue = option?.value || 'sans_serif';
        const currentWeight = newsletter.title_font_weight;
        let newWeight = currentWeight;

        if (!FONT_WEIGHT_OPTIONS[categoryValue].options.find(o => o.value === currentWeight)) {
            newWeight = FONT_WEIGHT_OPTIONS[categoryValue].map?.[currentWeight] || 'bold';
        }

        updateNewsletter({title_font_category: categoryValue, title_font_weight: newWeight});
    };

    return {headingFontWeightOptions, getSelectedFontWeightOption, changeSelectedTitleFont};
};
```

```typescript
// components/sidebar/SenderEmailField.tsx
import React from 'react';
import {TextField} from '@tryghost/admin-x-design-system';
import {type ErrorMessages} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {hasSendingDomain, isManagedEmail} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../../../../providers/global-data-provider';
import {renderSenderEmail} from '../../../../utils/newsletter-emails';
import {getSettingValues} from '@tryghost/admin-x-framework/api/settings';

interface SenderEmailFieldProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
}

export const SenderEmailField: React.FC<SenderEmailFieldProps> = ({newsletter, updateNewsletter, errors, clearError}) => {
    const {settings, config} = useGlobalData();
    const [defaultEmailAddress] = getSettingValues<string>(settings, ['default_email_address']);
    const newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);

    if (isManagedEmail(config) && !hasSendingDomain(config)) {
        return null;
    }

    return (
        <TextField
            error={Boolean(errors.sender_email)}
            hint={errors.sender_email}
            maxLength={hasSendingDomain(config) ? 191 : undefined}
            placeholder={hasSendingDomain(config) ? defaultEmailAddress : (newsletterAddress || '')}
            title="Sender email address"
            value={newsletter.sender_email || ''}
            onChange={e => updateNewsletter({sender_email: e.target.value})}
            onKeyDown={() => clearError('sender_email')}
        />
    );
};
```

```typescript
// components/sidebar/ReplyToEmailField.tsx
import React, {useCallback, useState} from 'react';
import {TextField} from '@tryghost/admin-x-design-system';
import {type ErrorMessages} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {renderReplyToEmail, renderSenderEmail} from '../../../../utils/newsletter-emails';
import {useGlobalData} from '../../../../providers/global-data-provider';

interface ReplyToEmailFieldProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    validate: () => void;
    clearError: (field: string) => void;
}

export const ReplyToEmailField: React.FC<ReplyToEmailFieldProps> = ({newsletter, updateNewsletter, errors, clearError}) => {
    const {settings, config} = useGlobalData();
    const [defaultEmailAddress, supportEmailAddress] = getSettingValues<string>(settings, ['default_email_address', 'support_email_address']);
    const [senderReplyTo, setSenderReplyTo] = useState(
        renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || ''
    );

    const newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);

    const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSenderReplyTo(e.target.value);
        updateNewsletter({sender_reply_to: e.target.value || 'newsletter'});
    }, [updateNewsletter]);

    const onBlur = () => {
        setSenderReplyTo(renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || '');
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
```

```typescript
// components/sidebar/tabs/GeneralSettingsTab.tsx
import React from 'react';
import {Button, Form, TextArea, TextField, Toggle} from '@tryghost/admin-x-design-system';
import {type ErrorMessages} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {useGlobalData} from '../../../../providers/global-data-provider';
import useSettingGroup from '../../../../../hooks/use-setting-group';
import {SenderEmailField} from '../SenderEmailField';
import {ReplyToEmailField} from '../ReplyToEmailField';

interface GeneralSettingsTabProps {
    newsletter: Newsletter;
    onlyOne: boolean;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    validate: () => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
    activeNewslettersCount: number;
    onStatusChange: () => void;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
    newsletter,
    onlyOne,
    updateNewsletter,
    validate,
    errors,
    clearError,
    activeNewslettersCount,
    onStatusChange
}) => {
    const {localSettings} = useSettingGroup();
    const [siteTitle] = getSettingValues(localSettings, ['title']) as string[];

    const statusButton = newsletter.status === 'active'
        ? !onlyOne && (
            <Button
                color='red'
                disabled={activeNewslettersCount === 1}
                label='Archive newsletter'
                link
                onClick={onStatusChange}
            />
        )
        : <Button color='green' label='Reactivate newsletter' link onClick={onStatusChange} />;

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
                <SenderEmailField clearError={clearError} errors={errors} newsletter={newsletter} updateNewsletter={updateNewsletter} />
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
            <div className='mb-5 mt-10'>{statusButton}</div>
        </>
    );
};
```

```typescript
// components/sidebar/tabs/ContentTab.tsx
import React from 'react';
import {Form, Heading, Hint, HtmlField, Icon, ImageUpload, Separator, Toggle, ToggleGroup} from '@tryghost/admin-x-design-system';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {getSettingValue, getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {getImageUrl, useUploadImage} from '@tryghost/admin-x-framework/api/images';
import {useGlobalData} from '../../../../providers/global-data-provider';
import {useHandleError} from '@tryghost/admin-x-framework/hooks';

interface ContentTabProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}

export const ContentTab: React.FC<ContentTabProps> = ({newsletter, updateNewsletter}) => {
    const {settings} = useGlobalData();
    const [icon] = getSettingValues<string>(settings, ['icon']);
    const {mutateAsync: uploadImage} = useUploadImage();
    const handleError = useHandleError();
    const commentsEnabled = ['all', 'paid'].includes(getSettingValue(settings, 'comments_enabled') || '');

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
```

```typescript
// components/sidebar/tabs/DesignTab.tsx
import React from 'react';
import {ButtonGroup, ColorPickerField, Form, Select, type SelectOption} from '@tryghost/admin-x-design-system';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {textColorForBackgroundColor} from '@tryghost/color-utils';
import {useGlobalData} from '../../../../providers/global-data-provider';
import {FONT_OPTIONS, useFontOptions} from '../../../hooks/useFontOptions';

interface DesignTabProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}

const createButtonGroupConfig = (
    items: Array<{key: string; icon: string; label: string; tooltip: string; onClick: () => void; disabled?: boolean}>
) => items.map(item => ({
    ...item,
    iconSize: 14,
    hideLabel: true,
    link: false,
    size: 'sm' as const
}));

export const DesignTab: React.FC<DesignTabProps> = ({newsletter, updateNewsletter}) => {
    const {siteData} = useGlobalData();
    const {headingFontWeightOptions, getSelectedFontWeightOption, changeSelectedTitleFont} = useFontOptions(newsletter, updateNewsletter);

    const backgroundColorIsDark = newsletter.background_color !== 'light' &&
        textColorForBackgroundColor(newsletter.background_color).hex().toLowerCase() === '#ffffff';

    const autoColorSwatch = {
        value: null,
        title: 'Auto',
        hex: backgroundColorIsDark ? '#ffffff' : '#000000'
    };

    const accentSwatch = {value: 'accent', title: 'Accent', hex: siteData.accent_color};

    const titleAlignmentButtons = createButtonGroupConfig([
        {
            key: 'left',
            icon: 'align-left',
            label: 'Align left',
            tooltip: 'Left',
            onClick: () => updateNewsletter({title_alignment: 'left'}),
            disabled: !newsletter.show_post_title_section
        },
        {
            key: 'center',
            icon: 'align-center',
            label: 'Align center',
            tooltip: 'Center',
            onClick: () => updateNewsletter({title_alignment: 'center'}),
            disabled: !newsletter.show_post_title_section
        }
    ]);

    const buttonStyleButtons = createButtonGroupConfig([
        {key: 'fill', icon: 'squircle-fill', label: 'Fill', tooltip: 'Fill', onClick: () => updateNewsletter({button_style: 'fill'})},
        {key: 'outline', icon: 'squircle', label: 'Outline', tooltip: 'Outline', onClick: () => updateNewsletter({button_style: 'outline'})}
    ]);

    const buttonCornerButtons = createButtonGroupConfig([
        {key: 'square', icon: 'square', label: 'Square', tooltip: 'Squared', onClick: () => updateNewsletter({button_corners: 'square'})},
        {key: 'rounded', icon: 'squircle', label: 'Rounded', tooltip: 'Rounded', onClick: () => updateNewsletter({button_corners: 'rounded'})},
        {key: 'pill', icon: 'circle', label: 'Pill', tooltip: 'Pill', onClick: () => updateNewsletter({button_corners: 'pill'})}
    ]);

    const linkStyleButtons = createButtonGroupConfig([
        {key: 'underline', icon: 'text-underline', label: 'Underline', tooltip: 'Underline', onClick: () => updateNewsletter({link_style: 'underline'})},
        {key: 'regular', icon: 'text-regular', label: 'Regular', tooltip: 'Regular', onClick: () => updateNewsletter({link_style: 'regular'})},
        {key: 'bold', icon: 'text-bold', label: 'Bold', tooltip: 'Bold', onClick: () => updateNewsletter({link_style: 'bold'})}
    ]);

    const imageCornerButtons = createButtonGroupConfig([
        {key: 'square', icon: 'square', label: 'Square', tooltip: 'Squared', onClick: () => updateNewsletter({image_corners: 'square'})},
        {key: 'rounded', icon: 'squircle', label: 'Rounded', tooltip: 'Rounded', onClick: () => updateNewsletter({image_corners: 'rounded'})}
    ]);

    const renderFontSelect = (label: string, value: string | undefined, onSelect: (option: SelectOption | null) => void, testId?: string) => (
        <div className='flex w-full items-center justify-between gap-2'>
            <div className='shrink-0'>{label}</div>
            <Select
                containerClassName='max-w-[200px]'
                options={FONT_OPTIONS}
                selectedOption={FONT_OPTIONS.find(option => option.value === value)}
                testId={testId}
                onSelect={onSelect}
            />
        </div>
    );

    const renderButtonGroup = (label: string, activeKey: string, buttons: ReturnType<typeof createButtonGroupConfig>) => (
        <div className='flex w-full justify-between'>
            <div>{label}</div>
            <ButtonGroup activeKey={activeKey} buttons={buttons} clearBg={false} />
        </div>
    );

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
                {renderFontSelect('Heading font', newsletter.title_font_category, changeSelectedTitleFont)}
                <div className='flex w-full items-center justify-between gap-2'>
                    <div className='shrink-0'>Heading weight</div>
                    <Select
                        containerClassName='max-w-[200px]'
                        options={headingFontWeightOptions}
                        selectedOption={getSelectedFontWeightOption()}
                        onSelect={option => updateNewsletter({title_font_weight: option?.value})}
                    />
                </div>
                {renderFontSelect('Body font', newsletter.body_font_category, option => updateNewsletter({body_font_category: option?.value}), 'body-font-select')}
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
                        swatches={[autoColorSwatch, accentSwatch]}
                        title='Post title color'
                        value={newsletter.post_title_color}
                        onChange={color => updateNewsletter({post_title_color: color})}
                    />
                </div>
                {renderButtonGroup('Title alignment', newsletter.title_alignment, titleAlignmentButtons)}
            </Form>

            <Form className='mt-6' gap='xs' margins='lg' title='Body'>
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={[autoColorSwatch, accentSwatch]}
                        title='Section title color'
                        value={newsletter.section_title_color}
                        onChange={color => updateNewsletter({section_title_color: color})}
                    />
                </div>
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={[accentSwatch, autoColorSwatch]}
                        title='Button color'
                        value={newsletter.button_color}
                        onChange={color => updateNewsletter({button_color: color})}
                    />
                </div>
                {renderButtonGroup('Button style', newsletter.button_style || 'fill', buttonStyleButtons)}
                {renderButtonGroup('Button corners', newsletter.button_corners || 'rounded', buttonCornerButtons)}
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={[accentSwatch, autoColorSwatch]}
                        title='Link color'
                        value={newsletter.link_color}
                        onChange={color => updateNewsletter({link_color: color})}
                    />
                </div>
                {renderButtonGroup('Link style', newsletter.link_style || 'underline', linkStyleButtons)}
                {renderButtonGroup('Image corners', newsletter.image_corners || 'square', imageCornerButtons)}
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={[
                            {value: 'light', title: 'Light', hex: '#e0e7eb'},
                            accentSwatch
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
```

```typescript
// NewsletterDetailModal.tsx (main file - refactored)
import NewsletterPreview from './newsletter-preview';
import NiceModal from '@ebay/nice-modal-react';
import React, {useEffect, useState} from 'react';
import {type Tab, TabView, PreviewModalContent} from '@tryghost/admin-x-design-system';
import {type Newsletter, useBrowseNewsletters} from '@tryghost/admin-x-framework/api/newsletters';
import {type RoutingModalProps, useRouting} from '@tryghost/admin-x-framework/routing';
import {GeneralSettingsTab} from './sidebar/tabs/GeneralSettingsTab';
import {ContentTab} from './sidebar/tabs/ContentTab';
import {DesignTab} from './sidebar/tabs/DesignTab';
import {useNewsletterForm} from './hooks/useNewsletterForm';
import {useNewsletterStatus} from './hooks/useNewsletterStatus';

// Sidebar Component
const Sidebar: React.FC<{
    newsletter: Newsletter;
    onlyOne: boolean;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    validate: () => void;
    errors: Record<string, string>;
    clearError: (field: string) => void;
}> = ({newsletter, onlyOne, updateNewsletter, validate, errors, clearError}) => {
    const [selectedTab, setSelectedTab] = useState('generalSettings');
    const {confirmStatusChange} = useNewsletterStatus(newsletter);
    const {data: {newsletters: apiNewsletters} = {}} = useBrowseNewsletters();
    const [newsletters, setNewsletters] = useState<Newsletter[]>(apiNewsletters || []);

    useEffect(() => {
        setNewsletters(apiNewsletters || []);
    }, [apiNewsletters]);

    const activeNewslettersCount = newsletters.filter(n => n.status === 'active').length;

    const tabs: Tab[] = [
        {
            id: 'generalSettings',
            title: 'General',
            contents: (
                <GeneralSettingsTab
                    activeNewslettersCount={activeNewslettersCount}
                    clearError={clearError}
                    errors={errors}
                    newsletter={newsletter}
                    onlyOne={onlyOne}
                    onStatusChange={confirmStatusChange}
                    updateNewsletter={updateNewsletter}
                    validate={validate}
                />
            )
        },
        {
            id: 'content',
            title: 'Content',
            contents: <ContentTab newsletter={newsletter} updateNewsletter={updateNewsletter} />
        },
        {
            id: 'design',
            title: 'Design',
            contents: <DesignTab newsletter={newsletter} updateNewsletter={updateNewsletter} />
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

// Modal Content Component
const NewsletterDetailModalContent: React.FC<{newsletter: Newsletter; onlyOne: boolean}> = ({newsletter, onlyOne}) => {
    const {updateRoute} = useRouting();
    const {formState, saveState, handleSave, validate, errors, clearError, okProps, updateNewsletter} = useNewsletterForm(newsletter);

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
            onOk={() => handleSave({fakeWhenUnchanged: true})}
        />
    );
};

// Root Modal Component
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

The key refactoring improvements are:

1. **Custom Hooks Extraction**: Moved form logic (`useNewsletterForm`), status management (`useNewsletterStatus`), and font options (`useFontOptions`) into dedicated hooks, each with a single responsibility.

2. **Component Decomposition**: Split the monolithic `Sidebar` into focused tab components (`GeneralSettingsTab`, `ContentTab`, `DesignTab`) and extracted `SenderEmailField` and `ReplyToEmailField` into standalone components.

3. **Eliminated Duplication**: The `createButtonGroupConfig` helper removes repetitive button configuration objects in `DesignTab`, and `renderFontSelect`/`renderButtonGroup` helpers reduce JSX repetition.

4. **Simplified Conditionals**: `SenderEmailField` consolidates the three-branch rendering logic into a cleaner early-return pattern. The `backgroundColorIsDark` function became a simple boolean expression.

5. **Constants Extraction**: Font options moved to a shared constants file (`useFontOptions.ts`) to avoid recreation on each render.

6. **Reduced Nesting**: Each component now has a clear, focused purpose with manageable JSX depth.