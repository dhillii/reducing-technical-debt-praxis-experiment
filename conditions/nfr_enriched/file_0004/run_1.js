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
            prompt: <>Reactivating <strong>{newsletter.name}</strong> will immediately make it visible to members and re-enable it as an option when publishing new posts.</>,
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
            reactivateNewsletter();
        } catch (error) {
            if (error instanceof HostLimitError) {
                NiceModal.show(LimitModal, {
                    prompt: error.message || `Your current plan doesn't support more newsletters.`,
                    onOk: () => updateRoute({route: '/pro', isExternal: true})
                });
            } else {
                throw error;
            }
        }
    };

    return {confirmStatusChange};
};
```

```typescript
// hooks/useNewsletterForm.ts
import {useEffect} from 'react';
import validator from 'validator';
import {useForm, useHandleError} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter, useEditNewsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {hasSendingDomain, sendingDomain} from '@tryghost/admin-x-framework/api/config';
import {showToast} from '@tryghost/admin-x-design-system';
import {useGlobalData} from '../components/providers/global-data-provider';

const getVerificationToastMessage = (emailToVerify: string | undefined) => {
    if (emailToVerify === 'sender_email' || emailToVerify === 'sender_reply_to') {
        return <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
    }
    return null;
};

export const useNewsletterForm = (newsletter: Newsletter) => {
    const {config} = useGlobalData();
    const {mutateAsync: editNewsletter} = useEditNewsletter();
    const handleError = useHandleError();

    const form = useForm({
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

    const {formState, setFormState} = form;

    useEffect(() => {
        setFormState(() => newsletter);
    }, [setFormState, newsletter]);

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
import {useGlobalData} from '../providers/global-data-provider';
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

    const commonProps = {
        error: Boolean(errors.sender_email),
        hint: errors.sender_email,
        title: 'Sender email address',
        value: newsletter.sender_email || '',
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => updateNewsletter({sender_email: e.target.value}),
        onKeyDown: () => clearError('sender_email')
    };

    return hasSendingDomain(config) ? (
        <TextField {...commonProps} maxLength={191} placeholder={defaultEmailAddress} />
    ) : (
        <TextField {...commonProps} placeholder={newsletterAddress || ''} />
    );
};
```

```typescript
// components/tabs/GeneralSettingsTab.tsx
import React from 'react';
import {Button, Form, TextArea, TextField, Toggle} from '@tryghost/admin-x-design-system';
import {type ErrorMessages} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {useGlobalData} from '../../providers/global-data-provider';
import useSettingGroup from '../../../../../hooks/use-setting-group';
import {useBrowseNewsletters} from '@tryghost/admin-x-framework/api/newsletters';
import {ReplyToEmailField} from '../ReplyToEmailField';
import {SenderEmailField} from '../SenderEmailField';

interface GeneralSettingsTabProps {
    newsletter: Newsletter;
    onlyOne: boolean;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    validate: () => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
    onStatusChange: () => void;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
    newsletter, onlyOne, updateNewsletter, validate, errors, clearError, onStatusChange
}) => {
    const {localSettings} = useSettingGroup();
    const [siteTitle] = getSettingValues(localSettings, ['title']) as string[];
    const {data: {newsletters: apiNewsletters} = {}} = useBrowseNewsletters();
    const activeNewsletters = (apiNewsletters || []).filter(n => n.status === 'active');

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

            <div className='mb-5 mt-10'>
                {newsletter.status === 'active'
                    ? (!onlyOne && <Button color='red' disabled={activeNewsletters.length === 1} label='Archive newsletter' link onClick={onStatusChange} />)
                    : <Button color='green' label='Reactivate newsletter' link onClick={onStatusChange} />
                }
            </div>
        </>
    );
};
```

```typescript
// components/tabs/ContentTab.tsx
import React from 'react';
import {Form, Heading, Hint, HtmlField, Icon, ImageUpload, Separator, Toggle, ToggleGroup} from '@tryghost/admin-x-design-system';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {getImageUrl, useUploadImage} from '@tryghost/admin-x-framework/api/images';
import {getSettingValue} from '@tryghost/admin-x-framework/api/settings';
import {useGlobalData} from '../../providers/global-data-provider';
import {useHandleError} from '@tryghost/admin-x-framework/hooks';

interface ContentTabProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}

export const ContentTab: React.FC<ContentTabProps> = ({newsletter, updateNewsletter}) => {
    const {settings} = useGlobalData();
    const {mutateAsync: uploadImage} = useUploadImage();
    const handleError = useHandleError();
    const [icon] = [getSettingValue(settings, 'icon')];
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
                    <Toggle checked={newsletter.show_header_title} direction="rtl" label='Publication title' onChange={e => updateNewsletter({show_header_title: e.target.checked})} />
                    <Toggle checked={newsletter.show_header_name} direction="rtl" label='Newsletter name' onChange={e => updateNewsletter({show_header_name: e.target.checked})} />
                </ToggleGroup>
            </Form>

            <Form className='mt-6' gap='xs' margins='lg' title='Title section'>
                <Toggle checked={newsletter.show_post_title_section} direction="rtl" label='Post title' onChange={e => updateNewsletter({show_post_title_section: e.target.checked})} />
                {newsletter.show_post_title_section && (
                    <Toggle checked={newsletter.show_excerpt} direction="rtl" label="Post excerpt" onChange={e => updateNewsletter({show_excerpt: e.target.checked})} />
                )}
                <Toggle checked={newsletter.show_feature_image} direction="rtl" label='Feature image' onChange={e => updateNewsletter({show_feature_image: e.target.checked})} />
            </Form>

            <Form className='mt-6' gap='sm' margins='lg' title='Footer'>
                <ToggleGroup gap='lg'>
                    <Toggle checked={newsletter.feedback_enabled} direction="rtl" label='Ask your readers for feedback' onChange={e => updateNewsletter({feedback_enabled: e.target.checked})} />
                    {commentsEnabled && (
                        <Toggle checked={newsletter.show_comment_cta} direction="rtl" label='Add a link to your comments' onChange={e => updateNewsletter({show_comment_cta: e.target.checked})} />
                    )}
                    <Toggle checked={newsletter.show_latest_posts} direction="rtl" label='Share your latest posts' onChange={e => updateNewsletter({show_latest_posts: e.target.checked})} />
                    <Toggle checked={newsletter.show_subscription_details} direction="rtl" label='Show subscription details' onChange={e => updateNewsletter({show_subscription_details: e.target.checked})} />
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
// components/tabs/DesignTab.tsx
import React from 'react';
import {ButtonGroup, ColorPickerField, Form, Select, type SelectOption} from '@tryghost/admin-x-design-system';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {useGlobalData} from '../../providers/global-data-provider';
import {textColorForBackgroundColor} from '@tryghost/color-utils';
import {FONT_OPTIONS, useNewsletterFonts} from '../../hooks/useNewsletterFonts';

interface DesignTabProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}

const makeButtonGroupConfig = (
    key: string,
    icon: string,
    label: string,
    tooltip: string,
    onClick: () => void,
    disabled?: boolean
) => ({key, icon, iconSize: 14, label, tooltip, hideLabel: true, link: false, size: 'sm' as const, onClick, disabled});

export const DesignTab: React.FC<DesignTabProps> = ({newsletter, updateNewsletter}) => {
    const {siteData} = useGlobalData();
    const {headingFontWeightOptions, getSelectedFontWeightOption, changeSelectedTitleFont} = useNewsletterFonts(newsletter, updateNewsletter);

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
                <FontSelectRow
                    label="Heading font"
                    options={FONT_OPTIONS}
                    selectedOption={FONT_OPTIONS.find(o => o.value === newsletter.title_font_category)}
                    onSelect={changeSelectedTitleFont}
                />
                <FontSelectRow
                    label="Heading weight"
                    options={headingFontWeightOptions}
                    selectedOption={getSelectedFontWeightOption()}
                    onSelect={option => updateNewsletter({title_font_weight: option?.value})}
                />
                <FontSelectRow
                    label="Body font"
                    options={FONT_OPTIONS}
                    selectedOption={FONT_OPTIONS.find(o => o.value === newsletter.body_font_category)}
                    testId='body-font-select'
                    onSelect={option => updateNewsletter({body_font_category: option?.value})}
                />
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
                <AlignmentRow
                    disabled={!newsletter.show_post_title_section}
                    label="Title alignment"
                    value={newsletter.title_alignment}
                    onChange={alignment => updateNewsletter({title_alignment: alignment})}
                />
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
                <StyleRow
                    buttons={[
                        makeButtonGroupConfig('fill', 'squircle-fill', 'Fill', 'Fill', () => updateNewsletter({button_style: 'fill'})),
                        makeButtonGroupConfig('outline', 'squircle', 'Outline', 'Outline', () => updateNewsletter({button_style: 'outline'}))
                    ]}
                    label="Button style"
                    value={newsletter.button_style || 'fill'}
                />
                <StyleRow
                    buttons={[
                        makeButtonGroupConfig('square', 'square', 'Square', 'Squared', () => updateNewsletter({button_corners: 'square'})),
                        makeButtonGroupConfig('rounded', 'squircle', 'Rounded', 'Rounded', () => updateNewsletter({button_corners: 'rounded'})),
                        makeButtonGroupConfig('pill', 'circle', 'Pill', 'Pill', () => updateNewsletter({button_corners: 'pill'}))
                    ]}
                    label="Button corners"
                    value={newsletter.button_corners || 'rounded'}
                />
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
                <StyleRow
                    buttons={[
                        makeButtonGroupConfig('underline', 'text-underline', 'Underline', 'Underline', () => updateNewsletter({link_style: 'underline'})),
                        makeButtonGroupConfig('regular', 'text-regular', 'Regular', 'Regular', () => updateNewsletter({link_style: 'regular'})),
                        makeButtonGroupConfig('bold', 'text-bold', 'Bold', 'Bold', () => updateNewsletter({link_style: 'bold'}))
                    ]}
                    label="Link style"
                    value={newsletter.link_style || 'underline'}
                />
                <StyleRow
                    buttons={[
                        makeButtonGroupConfig('square', 'square', 'Square', 'Squared', () => updateNewsletter({image_corners: 'square'})),
                        makeButtonGroupConfig('rounded', 'squircle', 'Rounded', 'Rounded', () => updateNewsletter({image_corners: 'rounded'}))
                    ]}
                    label="Image corners"
                    value={newsletter.image_corners || 'square'}
                />
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

// Small presentational helpers within DesignTab

const FontSelectRow: React.FC<{
    label: string;
    options: SelectOption[];
    selectedOption: SelectOption | undefined;
    testId?: string;
    onSelect: (option: SelectOption | null) => void;
}> = ({label, options, selectedOption, testId, onSelect}) => (
    <div className='flex w-full items-center justify-between gap-2'>
        <div className='shrink-0'>{label}</div>
        <Select containerClassName='max-w-[200px]' options={options} selectedOption={selectedOption} testId={testId} onSelect={onSelect} />
    </div>
);

const StyleRow: React.FC<{
    label: string;
    value: string;
    buttons: object[];
}> = ({label, value, buttons}) => (
    <div className='flex w-full justify-between'>
        <div>{label}</div>
        <ButtonGroup activeKey={value} buttons={buttons} clearBg={false} />
    </div>
);

const AlignmentRow: React.FC<{
    label: string;
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
}> = ({label, value, disabled, onChange}) => (
    <div className='flex w-full justify-between'>
        <div>{label}</div>
        <ButtonGroup
            activeKey={value}
            buttons={[
                makeButtonGroupConfig('left', 'align-left', 'Align left', 'Left', () => onChange('left'), disabled),
                makeButtonGroupConfig('center', 'align-center', 'Align center', 'Center', () => onChange('center'), disabled)
            ]}
            clearBg={false}
        />
    </div>
);
```

## Refactored Main Components

```typescript
// newsletter-detail-modal.tsx (main file)
import NewsletterPreview from './newsletter-preview';
import NiceModal from '@ebay/nice-modal-react';
import React, {useState} from 'react';
import {PreviewModalContent, type Tab, TabView} from '@tryghost/admin-x-design-system';
import {type Newsletter, useBrowseNewsletters} from '@tryghost/admin-x-framework/api/newsletters';
import {type RoutingModalProps, useRouting} from '@tryghost/admin-x-framework/routing';
import {useEffect} from 'react';
import {useNewsletterForm} from './hooks/useNewsletterForm';
import {useNewsletterStatus} from './hooks/useNewsletterStatus';
import {GeneralSettingsTab} from './components/tabs/GeneralSettingsTab';
import {ContentTab} from './components/tabs/ContentTab';
import {DesignTab} from './components/tabs/DesignTab';
import {ReplyToEmailField} from './components/ReplyToEmailField';

// ReplyToEmailField stays the same as original - already well-structured

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

    const tabs: Tab[] = [
        {
            id: 'generalSettings',
            title: 'General',
            contents: (
                <GeneralSettingsTab
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
                <TabView selectedTab={selectedTab} stickyHeader={true} tabs={tabs} onTabChange={setSelectedTab} />
            </div>
        </div>
    );
};

const NewsletterDetailModalContent: React.FC<{newsletter: Newsletter; onlyOne: boolean}> = ({newsletter, onlyOne}) => {
    const {updateRoute} = useRouting();
    const {formState, saveState, handleSave, validate, errors, clearError, okProps, updateNewsletter} = useNewsletterForm(newsletter);

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

    return <NewsletterDetailModalContent newsletter={newsletter} onlyOne={newsletters!.length === 1} />;
};

export default NiceModal.create(NewsletterDetailModal);
```

## Key Improvements

| Issue | Before | After |
|-------|--------|-------|
| **File size** | ~600 lines in one file | Split into 6 focused files |
| **Sidebar complexity** | Monolithic with 3 inline tab definitions | Delegates to `GeneralSettingsTab`, `ContentTab`, `DesignTab` |
| **Status change logic** | Inline in Sidebar | Extracted to `useNewsletterStatus` hook |
| **Form logic** | Inline in modal content | Extracted to `useNewsletterForm` hook |
| **Font logic** | Inline in Sidebar | Extracted to `useNewsletterFonts` hook |
| **Sender email field** | `renderSenderEmailField()` function inside component | Extracted to `SenderEmailField` component |
| **Repeated button configs** | Verbose inline objects | `makeButtonGroupConfig` factory function |
| **Repeated layout patterns** | Duplicated JSX | `FontSelectRow`, `StyleRow`, `AlignmentRow` helpers |
| **Toast message logic** | Inline conditional chain | `getVerificationToastMessage` pure function |
| **`handleTabChange`** | Wrapper function | Directly passes `setSelectedTab` |