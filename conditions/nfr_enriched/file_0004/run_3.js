# Refactored Newsletter Detail Modal

Here's the refactored code with reduced complexity through component extraction, custom hooks, and utility functions:

## Custom Hooks

```typescript
// hooks/useNewsletterFonts.ts
import {type SelectOption} from '@tryghost/admin-x-design-system';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';

export const FONT_OPTIONS: SelectOption[] = [
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
        map: {medium: 'normal', semibold: 'bold'}
    }
};

export const useNewsletterFonts = (newsletter: Newsletter, updateNewsletter: (fields: Partial<Newsletter>) => void) => {
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
// hooks/useNewsletterStatus.ts
import NiceModal from '@ebay/nice-modal-react';
import {ConfirmationModal, LimitModal, showToast} from '@tryghost/admin-x-design-system';
import {type Newsletter, useEditNewsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {useRouting} from '@tryghost/admin-x-framework/routing';
import {useHandleError} from '@tryghost/admin-x-framework/hooks';
import {HostLimitError, useLimiter} from './use-limiter';

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
```

```typescript
// hooks/useNewsletterForm.ts
import {useEffect} from 'react';
import validator from 'validator';
import {type Newsletter, useEditNewsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {useForm, useHandleError} from '@tryghost/admin-x-framework/hooks';
import {hasSendingDomain, sendingDomain} from '@tryghost/admin-x-framework/api/config';
import {showToast} from '@tryghost/admin-x-design-system';
import {useGlobalData} from '../providers/global-data-provider';

export const useNewsletterForm = (newsletter: Newsletter) => {
    const {config} = useGlobalData();
    const {mutateAsync: editNewsletter} = useEditNewsletter();
    const handleError = useHandleError();

    const validateNewsletter = (formState: Newsletter) => {
        const newErrors: Record<string, string> = {};

        if (!formState.name) {
            newErrors.name = 'A name is required for your newsletter';
        }

        if (formState.sender_email && !validator.isEmail(formState.sender_email)) {
            newErrors.sender_email = 'Enter a valid email address';
        } else if (
            formState.sender_email &&
            hasSendingDomain(config) &&
            formState.sender_email.split('@')[1] !== sendingDomain(config)
        ) {
            newErrors.sender_email = `Email address must end with @${sendingDomain(config)}`;
        }

        if (
            formState.sender_reply_to &&
            !validator.isEmail(formState.sender_reply_to) &&
            !['newsletter', 'support'].includes(formState.sender_reply_to)
        ) {
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
        onSave: async () => handleSaveSuccess(form.formState),
        onSaveError: handleError,
        onValidate: () => validateNewsletter(form.formState)
    });

    useEffect(() => {
        form.setFormState(() => newsletter);
    }, [newsletter]); // eslint-disable-line react-hooks/exhaustive-deps

    const updateNewsletter = (fields: Partial<Newsletter>) => {
        form.updateForm(state => ({...state, ...fields}));
    };

    return {...form, updateNewsletter};
};
```

## Extracted Sub-components

```typescript
// components/SenderEmailField.tsx
import React from 'react';
import {TextField} from '@tryghost/admin-x-design-system';
import {type ErrorMessages} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {hasSendingDomain, isManagedEmail} from '@tryghost/admin-x-framework/api/config';
import {renderSenderEmail} from '../../../../utils/newsletter-emails';
import {useGlobalData} from '../../../providers/global-data-provider';
import {getSettingValues} from '@tryghost/admin-x-framework/api/settings';

interface SenderEmailFieldProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
}

export const SenderEmailField: React.FC<SenderEmailFieldProps> = ({
    newsletter,
    updateNewsletter,
    errors,
    clearError
}) => {
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
// components/ReplyToEmailField.tsx
import React, {useCallback, useState} from 'react';
import {TextField} from '@tryghost/admin-x-design-system';
import {type ErrorMessages} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {renderReplyToEmail, renderSenderEmail} from '../../../../utils/newsletter-emails';
import {useGlobalData} from '../../../providers/global-data-provider';
import {getSettingValues} from '@tryghost/admin-x-framework/api/settings';

interface ReplyToEmailFieldProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
}

export const ReplyToEmailField: React.FC<ReplyToEmailFieldProps> = ({
    newsletter,
    updateNewsletter,
    errors,
    clearError
}) => {
    const {settings, config} = useGlobalData();
    const [defaultEmailAddress, supportEmailAddress] = getSettingValues<string>(
        settings,
        ['default_email_address', 'support_email_address']
    );

    const [senderReplyTo, setSenderReplyTo] = useState(
        renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || ''
    );

    const newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);

    const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSenderReplyTo(e.target.value);
        updateNewsletter({sender_reply_to: e.target.value || 'newsletter'});
    }, [updateNewsletter]);

    const onBlur = () => {
        setSenderReplyTo(
            renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || ''
        );
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
// components/sidebar-tabs/GeneralSettingsTab.tsx
import React from 'react';
import {Button, Form, TextArea, TextField, Toggle} from '@tryghost/admin-x-design-system';
import {type ErrorMessages} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {useBrowseNewsletters} from '@tryghost/admin-x-framework/api/newsletters';
import {getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {ReplyToEmailField} from '../ReplyToEmailField';
import {SenderEmailField} from '../SenderEmailField';
import {useNewsletterStatus} from '../../hooks/useNewsletterStatus';
import useSettingGroup from '../../../../../hooks/use-setting-group';
import {useGlobalData} from '../../../../providers/global-data-provider';

interface GeneralSettingsTabProps {
    newsletter: Newsletter;
    onlyOne: boolean;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    validate: () => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
    newsletter,
    onlyOne,
    updateNewsletter,
    validate,
    errors,
    clearError
}) => {
    const {settings} = useGlobalData();
    const {localSettings} = useSettingGroup();
    const [siteTitle] = getSettingValues(localSettings, ['title']) as string[];
    const {confirmStatusChange} = useNewsletterStatus(newsletter);
    const {data: {newsletters} = {}} = useBrowseNewsletters();
    const activeNewsletters = (newsletters || []).filter(n => n.status === 'active');

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
                    errors={errors}
                    newsletter={newsletter}
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
                    ? !onlyOne && (
                        <Button
                            color='red'
                            disabled={activeNewsletters.length === 1}
                            label='Archive newsletter'
                            link
                            onClick={confirmStatusChange}
                        />
                    )
                    : <Button color='green' label='Reactivate newsletter' link onClick={confirmStatusChange} />
                }
            </div>
        </>
    );
};
```

```typescript
// components/sidebar-tabs/ContentTab.tsx
import React from 'react';
import {Form, Heading, Hint, HtmlField, Icon, ImageUpload, Separator, Toggle, ToggleGroup} from '@tryghost/admin-x-design-system';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {getImageUrl, useUploadImage} from '@tryghost/admin-x-framework/api/images';
import {getSettingValue, getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {useHandleError} from '@tryghost/admin-x-framework/hooks';
import {useGlobalData} from '../../../../providers/global-data-provider';

interface ContentTabProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}

export const ContentTab: React.FC<ContentTabProps> = ({newsletter, updateNewsletter}) => {
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
```

```typescript
// components/sidebar-tabs/DesignTab.tsx
import React from 'react';
import {ButtonGroup, ColorPickerField, Form, Select} from '@tryghost/admin-x-design-system';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {textColorForBackgroundColor} from '@tryghost/color-utils';
import {useGlobalData} from '../../../../providers/global-data-provider';
import {FONT_OPTIONS, useNewsletterFonts} from '../../hooks/useNewsletterFonts';

interface DesignTabProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}

const createAlignmentButtons = (
    newsletter: Newsletter,
    updateNewsletter: (fields: Partial<Newsletter>) => void
) => [
    {
        key: 'left',
        icon: 'align-left',
        iconSize: 14,
        label: 'Align left',
        tooltip: 'Left',
        hideLabel: true,
        link: false,
        size: 'sm' as const,
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
        size: 'sm' as const,
        onClick: () => updateNewsletter({title_alignment: 'center'}),
        disabled: !newsletter.show_post_title_section
    }
];

const createStyleButtons = <T extends string>(
    buttons: Array<{key: T; icon: string; label: string; tooltip: string}>,
    onClick: (key: T) => void
) => buttons.map(({key, icon, label, tooltip}) => ({
    key,
    icon,
    iconSize: 14,
    label,
    tooltip,
    hideLabel: true,
    link: false,
    size: 'sm' as const,
    onClick: () => onClick(key)
}));

export const DesignTab: React.FC<DesignTabProps> = ({newsletter, updateNewsletter}) => {
    const {siteData} = useGlobalData();
    const {headingFontWeightOptions, getSelectedFontWeightOption, changeSelectedTitleFont} =
        useNewsletterFonts(newsletter, updateNewsletter);

    const backgroundColorIsDark = () => {
        if (newsletter.background_color === 'light') {
            return false;
        }
        return textColorForBackgroundColor(newsletter.background_color).hex().toLowerCase() === '#ffffff';
    };

    const autoColorSwatch = {
        value: null,
        title: 'Auto',
        hex: backgroundColorIsDark() ? '#ffffff' : '#000000'
    };

    const accentColorSwatch = {value: 'accent', title: 'Accent', hex: siteData.accent_color};

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
                        selectedOption={getSelectedFontWeightOption()}
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
                        swatches={[autoColorSwatch, accentColorSwatch]}
                        title='Post title color'
                        value={newsletter.post_title_color}
                        onChange={color => updateNewsletter({post_title_color: color})}
                    />
                </div>
                <div className='flex w-full justify-between'>
                    <div>Title alignment</div>
                    <ButtonGroup
                        activeKey={newsletter.title_alignment}
                        buttons={createAlignmentButtons(newsletter, updateNewsletter)}
                        clearBg={false}
                    />
                </div>
            </Form>

            <Form className='mt-6' gap='xs' margins='lg' title='Body'>
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={[autoColorSwatch, accentColorSwatch]}
                        title='Section title color'
                        value={newsletter.section_title_color}
                        onChange={color => updateNewsletter({section_title_color: color})}
                    />
                </div>
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={[accentColorSwatch, autoColorSwatch]}
                        title='Button color'
                        value={newsletter.button_color}
                        onChange={color => updateNewsletter({button_color: color})}
                    />
                </div>
                <div className='flex w-full justify-between'>
                    <div>Button style</div>
                    <ButtonGroup
                        activeKey={newsletter.button_style || 'fill'}
                        buttons={createStyleButtons(
                            [
                                {key: 'fill', icon: 'squircle-fill', label: 'Fill', tooltip: 'Fill'},
                                {key: 'outline', icon: 'squircle', label: 'Outline', tooltip: 'Outline'}
                            ],
                            key => updateNewsletter({button_style: key})
                        )}
                        clearBg={false}
                    />
                </div>
                <div className='flex w-full justify-between'>
                    <div>Button corners</div>
                    <ButtonGroup
                        activeKey={newsletter.button_corners || 'rounded'}
                        buttons={createStyleButtons(
                            [
                                {key: 'square', icon: 'square', label: 'Square', tooltip: 'Squared'},
                                {key: 'rounded', icon: 'squircle', label: 'Rounded', tooltip: 'Rounded'},
                                {key: 'pill', icon: 'circle', label: 'Pill', tooltip: 'Pill'}
                            ],
                            key => updateNewsletter({button_corners: key})
                        )}
                        clearBg={false}
                    />
                </div>
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={[accentColorSwatch, autoColorSwatch]}
                        title='Link color'
                        value={newsletter.link_color}
                        onChange={color => updateNewsletter({link_color: color})}
                    />
                </div>
                <div className='flex w-full justify-between'>
                    <div>Link style</div>
                    <ButtonGroup
                        activeKey={newsletter.link_style || 'underline'}
                        buttons={createStyleButtons(
                            [
                                {key: 'underline', icon: 'text-underline', label: 'Underline', tooltip: 'Underline'},
                                {key: 'regular', icon: 'text-regular', label: 'Regular', tooltip: 'Regular'},
                                {key: 'bold', icon: 'text-bold', label: 'Bold', tooltip: 'Bold'}
                            ],
                            key => updateNewsletter({link_style: key})
                        )}
                        clearBg={false}
                    />
                </div>
                <div className='flex w-full justify-between'>
                    <div>Image corners</div>
                    <ButtonGroup
                        activeKey={newsletter.image_corners || 'square'}
                        buttons={createStyleButtons(
                            [
                                {key: 'square', icon: 'square', label: 'Square', tooltip: 'Squared'},
                                {key: 'rounded', icon: 'squircle', label: 'Rounded', tooltip: 'Rounded'}
                            ],
                            key => updateNewsletter({image_corners: key})
                        )}
                        clearBg={false}
                    />
                </div>
                <div className='mb-1'>
                    <ColorPickerField
                        direction='rtl'
                        eyedropper={true}
                        swatches={[
                            {value: 'light', title: 'Light', hex: '#e0e7eb'},
                            accentColorSwatch
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

## Refactored Main File

```typescript
// newsletter-detail-modal.tsx
import NewsletterPreview from './newsletter-preview';
import NiceModal from '@ebay/nice-modal-react';
import React, {useState, useEffect} from 'react';
import {PreviewModalContent, type Tab, TabView} from '@tryghost/admin-x-design-system';
import {type Newsletter, useBrowseNewsletters} from '@tryghost/admin-x-framework/api/newsletters';
import {type RoutingModalProps, useRouting} from '@tryghost/admin-x-framework/routing';
import {ContentTab} from './sidebar-tabs/ContentTab';
import {DesignTab} from './sidebar-tabs/DesignTab';
import {GeneralSettingsTab} from './sidebar-tabs/GeneralSettingsTab';
import {useNewsletterForm} from '../hooks/useNewsletterForm';

const SIDEBAR_TABS = (
    newsletter: Newsletter,
    onlyOne: boolean,
    updateNewsletter: (fields: Partial<Newsletter>) => void,
    validate: () => void,
    errors: Record<string, string>,
    clearError: (field: string) => void
): Tab[] => [
    {
        id: 'generalSettings',
        title: 'General',
        contents: (
            <GeneralSettingsTab
                clearError={clearError}
                errors={errors}
                newsletter={newsletter}
                onlyOne={onlyOne}
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

const Sidebar: React.FC<{
    newsletter: Newsletter;
    onlyOne: boolean;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    validate: () => void;
    errors: Record<string, string>;
    clearError: (field: string) => void;
}> = ({newsletter, onlyOne, updateNewsletter, validate, errors, clearError}) => {
    const [selectedTab, setSelectedTab] = useState('generalSettings');

    const tabs = SIDEBAR_TABS(newsletter, onlyOne, updateNewsletter, validate, errors, clearError);

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

const NewsletterDetailModalContent: React.FC<{
    newsletter: Newsletter;
    onlyOne: boolean;
}> = ({newsletter, onlyOne}) => {
    const {updateRoute} = useRouting();
    const {formState, saveState, updateNewsletter, handleSave, validate, errors, clearError, okProps} =
        useNewsletterForm(newsletter);

    const preview = <NewsletterPreview newsletter={formState} />;
    const sidebar = (
        <Sidebar
            clearError={clearError}
            errors={errors}
            newsletter={formState}
            onlyOne={onlyOne}
            updateNewsletter={updateNewsletter}
            validate={validate}
        />
    );

    return (
        <PreviewModalContent
            afterClose={() => updateRoute('newsletters')}
            buttonsDisabled={okProps.disabled}
            cancelLabel='Close'
            deviceSelector={false}
            dirty={saveState === 'unsaved'}
            okColor={okProps.color}
            okLabel={okProps.label || 'Save'}
            preview={preview}
            previewBgColor='grey'
            previewToolbar={false}
            sidebar={sidebar}
            sidebarPadding={false}
            testId='newsletter-modal'
            title='Newsletter'
            onOk={async () => handleSave({fakeWhenUnchanged: true})}
        />
    );
};

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

    return (
        <NewsletterDetailModalContent
            newsletter={newsletter}
            onlyOne={newsletters!.length === 1}
        />
    );
};

export default NiceModal.create(NewsletterDetailModal);
```

## Key Refactoring Improvements

| Issue | Solution |
|-------|----------|
| **Single 600+ line file** | Split into 7 focused files |
| **Mixed concerns in `Sidebar`** | Extracted `GeneralSettingsTab`, `ContentTab`, `DesignTab` |
| **Inline business logic** | Moved to `useNewsletterForm`, `useNewsletterStatus`, `useNewsletterFonts` hooks |
| **Duplicated `SenderEmailField` logic** | Extracted into standalone component with unified conditional rendering |
| **Repeated `ButtonGroup` button definitions** | Created `createStyleButtons` factory function |
| **Duplicated color swatches** | Extracted `autoColorSwatch` and `accentColorSwatch` variables |
| **`confirmStatusChange` mixed with UI** | Separated into `useNewsletterStatus` hook with `archiveNewsletter`/`reactivateNewsletter` helpers |
| **Validation inline in form config** | Extracted `validateNewsletter` pure function |
| **Redundant `setSenderReplyTo` in `useCallback` deps** | Removed (stable setter reference) |