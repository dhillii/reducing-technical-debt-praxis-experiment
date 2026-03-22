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
        const weightOptions = FONT_WEIGHT_OPTIONS[categoryValue];
        const newWeight = weightOptions.options.find(o => o.value === currentWeight)
            ? currentWeight
            : (weightOptions.map?.[currentWeight] || 'bold');

        updateNewsletter({title_font_category: categoryValue, title_font_weight: newWeight});
    };

    return {headingFontWeightOptions, getSelectedFontWeightOption, changeSelectedTitleFont};
};
```

```typescript
// hooks/useNewsletterStatus.ts
import NiceModal from '@ebay/nice-modal-react';
import React from 'react';
import {ConfirmationModal, LimitModal, showToast} from '@tryghost/admin-x-design-system';
import {type Newsletter, useEditNewsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {useRouting} from '@tryghost/admin-x-framework/routing';
import {HostLimitError, useLimiter} from './use-limiter';
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
// hooks/useNewsletterValidation.ts
import validator from 'validator';
import {hasSendingDomain, sendingDomain} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../providers/global-data-provider';

export const useNewsletterValidation = () => {
    const {config} = useGlobalData();

    const validate = (formState: {name?: string; sender_email?: string; sender_reply_to?: string}) => {
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
            !['newsletter', 'support'].includes(formState.sender_reply_to)) {
            errors.sender_reply_to = 'Enter a valid email address';
        }

        return errors;
    };

    return {validate};
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

interface SenderEmailFieldProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
    defaultEmailAddress: string;
}

export const SenderEmailField: React.FC<SenderEmailFieldProps> = ({
    newsletter, updateNewsletter, errors, clearError, defaultEmailAddress
}) => {
    const {config} = useGlobalData();
    const newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);

    if (isManagedEmail(config) && !hasSendingDomain(config)) {
        return null;
    }

    return (
        <TextField
            error={Boolean(errors.sender_email)}
            hint={errors.sender_email}
            maxLength={isManagedEmail(config) ? 191 : undefined}
            placeholder={isManagedEmail(config) ? defaultEmailAddress : (newsletterAddress || '')}
            title="Sender email address"
            value={newsletter.sender_email || ''}
            onChange={e => updateNewsletter({sender_email: e.target.value})}
            onKeyDown={() => clearError('sender_email')}
        />
    );
};
```

```typescript
// components/NewsletterStatusButton.tsx
import React from 'react';
import {Button} from '@tryghost/admin-x-design-system';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';

interface NewsletterStatusButtonProps {
    newsletter: Newsletter;
    onlyOne: boolean;
    activeNewslettersCount: number;
    onConfirmStatusChange: () => void;
}

export const NewsletterStatusButton: React.FC<NewsletterStatusButtonProps> = ({
    newsletter, onlyOne, activeNewslettersCount, onConfirmStatusChange
}) => {
    if (newsletter.status === 'active') {
        if (onlyOne) return null;
        return (
            <Button
                color='red'
                disabled={activeNewslettersCount === 1}
                label='Archive newsletter'
                link
                onClick={onConfirmStatusChange}
            />
        );
    }

    return (
        <Button
            color='green'
            label='Reactivate newsletter'
            link
            onClick={onConfirmStatusChange}
        />
    );
};
```

```typescript
// components/ColorPickerRow.tsx
import React from 'react';
import {ColorPickerField} from '@tryghost/admin-x-design-system';

interface Swatch {
    value: string | null;
    title: string;
    hex: string;
}

interface ColorPickerRowProps {
    title: string;
    value: string | null | undefined;
    swatches: Swatch[];
    onChange: (color: string | null) => void;
}

export const ColorPickerRow: React.FC<ColorPickerRowProps> = ({title, value, swatches, onChange}) => (
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
```

```typescript
// components/ButtonStyleRow.tsx
import React from 'react';
import {ButtonGroup, type ButtonGroupButton} from '@tryghost/admin-x-design-system';

interface ButtonStyleRowProps {
    label: string;
    activeKey: string;
    buttons: ButtonGroupButton[];
}

export const ButtonStyleRow: React.FC<ButtonStyleRowProps> = ({label, activeKey, buttons}) => (
    <div className='flex w-full justify-between'>
        <div>{label}</div>
        <ButtonGroup activeKey={activeKey} buttons={buttons} clearBg={false} />
    </div>
);
```

## Refactored Tab Content Components

```typescript
// components/tabs/GeneralSettingsTab.tsx
import React from 'react';
import {Form, TextArea, TextField, Toggle} from '@tryghost/admin-x-design-system';
import {type ErrorMessages} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {ReplyToEmailField} from '../ReplyToEmailField';
import {SenderEmailField} from '../SenderEmailField';
import {NewsletterStatusButton} from '../NewsletterStatusButton';

interface GeneralSettingsTabProps {
    newsletter: Newsletter;
    onlyOne: boolean;
    siteTitle: string;
    defaultEmailAddress: string;
    activeNewslettersCount: number;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    validate: () => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
    onConfirmStatusChange: () => void;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
    newsletter, onlyOne, siteTitle, defaultEmailAddress, activeNewslettersCount,
    updateNewsletter, validate, errors, clearError, onConfirmStatusChange
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
            <SenderEmailField
                clearError={clearError}
                defaultEmailAddress={defaultEmailAddress}
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
            <NewsletterStatusButton
                activeNewslettersCount={activeNewslettersCount}
                newsletter={newsletter}
                onlyOne={onlyOne}
                onConfirmStatusChange={onConfirmStatusChange}
            />
        </div>
    </>
);
```

```typescript
// components/tabs/ContentTab.tsx
import React from 'react';
import {Form, Heading, Hint, HtmlField, Icon, ImageUpload, Separator, Toggle, ToggleGroup} from '@tryghost/admin-x-design-system';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {getImageUrl, useUploadImage} from '@tryghost/admin-x-framework/api/images';
import {useHandleError} from '@tryghost/admin-x-framework/hooks';

interface ContentTabProps {
    newsletter: Newsletter;
    icon: string;
    commentsEnabled: boolean;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}

export const ContentTab: React.FC<ContentTabProps> = ({newsletter, icon, commentsEnabled, updateNewsletter}) => {
    const {mutateAsync: uploadImage} = useUploadImage();
    const handleError = useHandleError();

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
// components/tabs/DesignTab.tsx
import React from 'react';
import {ButtonGroup, Form, Select} from '@tryghost/admin-x-design-system';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {type SelectOption} from '@tryghost/admin-x-design-system';
import {ColorPickerRow} from '../ColorPickerRow';
import {ButtonStyleRow} from '../ButtonStyleRow';
import {FONT_OPTIONS, useNewsletterFonts} from '../../hooks/useNewsletterFonts';
import {textColorForBackgroundColor} from '@tryghost/color-utils';

interface DesignTabProps {
    newsletter: Newsletter;
    accentColor: string;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}

const useBackgroundColorIsDark = (newsletter: Newsletter) => {
    if (newsletter.background_color === 'light') return false;
    return textColorForBackgroundColor(newsletter.background_color).hex().toLowerCase() === '#ffffff';
};

export const DesignTab: React.FC<DesignTabProps> = ({newsletter, accentColor, updateNewsletter}) => {
    const isDark = useBackgroundColorIsDark(newsletter);
    const autoColor = isDark ? '#ffffff' : '#000000';
    const {headingFontWeightOptions, getSelectedFontWeightOption, changeSelectedTitleFont} = useNewsletterFonts(newsletter, updateNewsletter);

    const accentSwatch = {value: 'accent', title: 'Accent', hex: accentColor};
    const autoSwatch = {value: null, title: 'Auto', hex: autoColor};

    return (
        <>
            <Form className='mt-6' gap='xs' margins='lg' title='Global'>
                <ColorPickerRow
                    swatches={[{hex: '#ffffff', value: 'light', title: 'White'}]}
                    title='Background color'
                    value={newsletter.background_color || 'light'}
                    onChange={color => updateNewsletter({background_color: color!})}
                />
                <FontSelectRow
                    label='Heading font'
                    options={FONT_OPTIONS}
                    selectedValue={newsletter.title_font_category}
                    onSelect={changeSelectedTitleFont}
                />
                <FontSelectRow
                    label='Heading weight'
                    options={headingFontWeightOptions}
                    selectedOption={getSelectedFontWeightOption()}
                    onSelect={option => updateNewsletter({title_font_weight: option?.value})}
                />
                <FontSelectRow
                    label='Body font'
                    options={FONT_OPTIONS}
                    selectedValue={newsletter.body_font_category}
                    testId='body-font-select'
                    onSelect={option => updateNewsletter({body_font_category: option?.value})}
                />
            </Form>

            <Form className='mt-6' gap='xs' margins='lg' title='Header'>
                <ColorPickerRow
                    swatches={[{value: 'transparent', title: 'Transparent', hex: '#00000000'}]}
                    title='Header background color'
                    value={newsletter.header_background_color || 'transparent'}
                    onChange={color => updateNewsletter({header_background_color: color!})}
                />
                <ColorPickerRow
                    swatches={[autoSwatch, accentSwatch]}
                    title='Post title color'
                    value={newsletter.post_title_color}
                    onChange={color => updateNewsletter({post_title_color: color})}
                />
                <ButtonStyleRow
                    activeKey={newsletter.title_alignment}
                    buttons={[
                        {key: 'left', icon: 'align-left', iconSize: 14, label: 'Align left', tooltip: 'Left', hideLabel: true, link: false, size: 'sm', onClick: () => updateNewsletter({title_alignment: 'left'}), disabled: !newsletter.show_post_title_section},
                        {key: 'center', icon: 'align-center', iconSize: 14, label: 'Align center', tooltip: 'Center', hideLabel: true, link: false, size: 'sm', onClick: () => updateNewsletter({title_alignment: 'center'}), disabled: !newsletter.show_post_title_section}
                    ]}
                    label='Title alignment'
                />
            </Form>

            <Form className='mt-6' gap='xs' margins='lg' title='Body'>
                <ColorPickerRow
                    swatches={[autoSwatch, accentSwatch]}
                    title='Section title color'
                    value={newsletter.section_title_color}
                    onChange={color => updateNewsletter({section_title_color: color})}
                />
                <ColorPickerRow
                    swatches={[accentSwatch, autoSwatch]}
                    title='Button color'
                    value={newsletter.button_color}
                    onChange={color => updateNewsletter({button_color: color})}
                />
                <ButtonStyleRow
                    activeKey={newsletter.button_style || 'fill'}
                    buttons={[
                        {key: 'fill', icon: 'squircle-fill', iconSize: 14, label: 'Fill', tooltip: 'Fill', hideLabel: true, link: false, size: 'sm', onClick: () => updateNewsletter({button_style: 'fill'})},
                        {key: 'outline', icon: 'squircle', iconSize: 14, label: 'Outline', tooltip: 'Outline', hideLabel: true, link: false, size: 'sm', onClick: () => updateNewsletter({button_style: 'outline'})}
                    ]}
                    label='Button style'
                />
                <ButtonStyleRow
                    activeKey={newsletter.button_corners || 'rounded'}
                    buttons={[
                        {key: 'square', icon: 'square', iconSize: 14, label: 'Square', tooltip: 'Squared', hideLabel: true, link: false, size: 'sm', onClick: () => updateNewsletter({button_corners: 'square'})},
                        {key: 'rounded', icon: 'squircle', iconSize: 14, label: 'Rounded', tooltip: 'Rounded', hideLabel: true, link: false, size: 'sm', onClick: () => updateNewsletter({button_corners: 'rounded'})},
                        {key: 'pill', icon: 'circle', iconSize: 14, label: 'Pill', tooltip: 'Pill', hideLabel: true, link: false, size: 'sm', onClick: () => updateNewsletter({button_corners: 'pill'})}
                    ]}
                    label='Button corners'
                />
                <ColorPickerRow
                    swatches={[accentSwatch, autoSwatch]}
                    title='Link color'
                    value={newsletter.link_color}
                    onChange={color => updateNewsletter({link_color: color})}
                />
                <ButtonStyleRow
                    activeKey={newsletter.link_style || 'underline'}
                    buttons={[
                        {key: 'underline', icon: 'text-underline', iconSize: 14, label: 'Underline', tooltip: 'Underline', hideLabel: true, link: false, size: 'sm', onClick: () => updateNewsletter({link_style: 'underline'})},
                        {key: 'regular', icon: 'text-regular', iconSize: 14, label: 'Regular', tooltip: 'Regular', hideLabel: true, link: false, size: 'sm', onClick: () => updateNewsletter({link_style: 'regular'})},
                        {key: 'bold', icon: 'text-bold', iconSize: 14, label: 'Bold', tooltip: 'Bold', hideLabel: true, link: false, size: 'sm', onClick: () => updateNewsletter({link_style: 'bold'})}
                    ]}
                    label='Link style'
                />
                <ButtonStyleRow
                    activeKey={newsletter.image_corners || 'square'}
                    buttons={[
                        {key: 'square', icon: 'square', iconSize: 14, label: 'Square', tooltip: 'Squared', hideLabel: true, link: false, size: 'sm', onClick: () => updateNewsletter({image_corners: 'square'})},
                        {key: 'rounded', icon: 'squircle', iconSize: 14, label: 'Rounded', tooltip: 'Rounded', hideLabel: true, link: false, size: 'sm', onClick: () => updateNewsletter({image_corners: 'rounded'})}
                    ]}
                    label='Image corners'
                />
                <ColorPickerRow
                    swatches={[{value: 'light', title: 'Light', hex: '#e0e7eb'}, accentSwatch]}
                    title='Divider color'
                    value={newsletter.divider_color || 'light'}
                    onChange={color => updateNewsletter({divider_color: color})}
                />
            </Form>
        </>
    );
};

// Small helper to reduce repetition in font selects
const FontSelectRow: React.FC<{
    label: string;
    options: SelectOption[];
    selectedValue?: string;
    selectedOption?: SelectOption;
    testId?: string;
    onSelect: (option: SelectOption | null) => void;
}> = ({label, options, selectedValue, selectedOption, testId, onSelect}) => (
    <div className='flex w-full items-center justify-between gap-2'>
        <div className='shrink-0'>{label}</div>
        <Select
            containerClassName='max-w-[200px]'
            options={options}
            selectedOption={selectedOption ?? options.find(o => o.value === selectedValue)}
            testId={testId}
            onSelect={onSelect}
        />
    </div>
);
```

## Refactored Main Components

```typescript
// newsletter-detail-modal.tsx
import NewsletterPreview from './newsletter-preview';
import NiceModal from '@ebay/nice-modal-react';
import React, {useCallback, useEffect, useState} from 'react';
import useSettingGroup from '../../../../hooks/use-setting-group';
import {PreviewModalContent, TabView, type Tab, showToast} from '@tryghost/admin-x-design-system';
import {type ErrorMessages, useForm, useHandleError} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter, useBrowseNewsletters, useEditNewsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {type RoutingModalProps, useRouting} from '@tryghost/admin-x-framework/routing';
import {getSettingValue, getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {renderReplyToEmail, renderSenderEmail} from '../../../../utils/newsletter-emails';
import {useGlobalData} from '../../../providers/global-data-provider';
import {useNewsletterStatus} from './hooks/useNewsletterStatus';
import {useNewsletterValidation} from './hooks/useNewsletterValidation';
import {GeneralSettingsTab} from './tabs/GeneralSettingsTab';
import {ContentTab} from './tabs/ContentTab';
import {DesignTab} from './tabs/DesignTab';

// ─── ReplyToEmailField ────────────────────────────────────────────────────────

const ReplyToEmailField: React.FC<{
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    validate: () => void;
    clearError: (field: string) => void;
}> = ({newsletter, updateNewsletter, errors, clearError}) => {
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

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const Sidebar: React.FC<{
    newsletter: Newsletter;
    onlyOne: boolean;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    validate: () => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
}> = ({newsletter, onlyOne, updateNewsletter, validate, errors, clearError}) => {
    const {settings, siteData} = useGlobalData();
    const [icon, defaultEmailAddress] = getSettingValues<string>(settings, ['icon', 'default_email_address']);
    const [selectedTab, setSelectedTab] = useState('generalSettings');
    const {localSettings} = useSettingGroup();
    const [siteTitle] = getSettingValues(localSettings, ['title']) as string[];
    const {data: {newsletters: apiNewsletters} = {}} = useBrowseNewsletters();
    const [newsletters, setNewsletters] = useState<Newsletter[]>(apiNewsletters || []);
    const commentsEnabled = ['all', 'paid'].includes(getSettingValue(settings, 'comments_enabled') || '');
    const activeNewsletters = newsletters.filter(n => n.status === 'active');
    const {confirmStatusChange} = useNewsletterStatus(newsletter);

    useEffect(() => {
        setNewsletters(apiNewsletters || []);
    }, [apiNewsletters]);

    const tabs: Tab[] = [
        {
            id: 'generalSettings',
            title: 'General',
            contents: (
                <GeneralSettingsTab
                    activeNewslettersCount={activeNewsletters.length}
                    clearError={clearError}
                    defaultEmailAddress={defaultEmailAddress}
                    errors={errors}
                    newsletter={newsletter}
                    onConfirmStatusChange={confirmStatusChange}
                    onlyOne={onlyOne}
                    siteTitle={siteTitle}
                    updateNewsletter={updateNewsletter}
                    validate={validate}
                />
            )
        },
        {
            id: 'content',
            title: 'Content',
            contents: (
                <ContentTab
                    commentsEnabled={commentsEnabled}
                    icon={icon}
                    newsletter={newsletter}
                    updateNewsletter={updateNewsletter}
                />
            )
        },
        {
            id: 'design',
            title: 'Design',
            contents: (
                <DesignTab
                    accentColor={siteData.accent_color}
                    newsletter={newsletter}
                    updateNewsletter={updateNewsletter}
                />
            )
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

// ─── NewsletterDetailModalContent ─────────────────────────────────────────────

const useEmailVerificationToast = () => {
    const showVerificationToast = (emailToVerify?: string) => {
        if (emailToVerify && ['sender_email', 'sender_reply_to'].includes(emailToVerify)) {
            showToast({
                icon: 'email',
                message: <div>We&lsquo;ve sent a confirmation email to the new address.</div>,
                type: 'info'
            });
        }
    };
    return {showVerificationToast};
};

const NewsletterDetailModalContent: React.FC<{newsletter: Newsletter; onlyOne: boolean}> = ({newsletter, onlyOne}) => {
    const {mutateAsync: editNewsletter} = useEditNewsletter();
    const {updateRoute} = useRouting();
    const handleError = useHandleError();
    const {validate: validateNewsletter} = useNewsletterValidation();
    const {showVerificationToast} = useEmailVerificationToast();

    const {formState, saveState, updateForm, setFormState, handleSave, validate, errors, clearError, okProps} = useForm({
        initialState: newsletter,
        savingDelay: 500,
        onSave: async () => {
            const {meta: {sent_email_verification: [emailToVerify] = []} = {}} = await editNewsletter(formState);
            showVerificationToast(emailToVerify);
        },
        onSaveError: handleError,
        onValidate: () => validateNewsletter(formState)
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
                    validate={validate}
                />
            }
            sidebarPadding={false}
            testId='newsletter-modal'
            title='Newsletter'
            onOk={async () => handleSave({fakeWhenUnchanged: true})}
        />
    );
};

// ─── NewsletterDetailModal ────────────────────────────────────────────────────

const NewsletterDetailModal: React.FC<RoutingModalProps> = ({params}) => {
    const {data: {newsletters, isEnd} = {}, fetchNextPage} = useBrowseNewsletters();
    const newsletter = newsletters?.find(({id}) => id === params?.id);

    useEffect(() => {
        if (!newsletter && !isEnd) {
            fetchNextPage();
        }
    }, [fetchNextPage, isEnd, newsletter]);

    if (!newsletter) return null;

    return (
        <NewsletterDetailModalContent
            newsletter={newsletter}
            onlyOne={newsletters!.length === 1}
        />
    );
};

export default NiceModal.create(NewsletterDetailModal);
```

## Key Improvements

| Area | Before | After |
|------|--------|-------|
| **File size** | ~600 lines in one file | Split into 8 focused files |
| **Component responsibility** | `Sidebar` handled fonts, status, tabs, rendering | Each concern in its own component/hook |
| **Duplication** | `ColorPickerField` repeated 8× with same props | `ColorPickerRow` wrapper eliminates repetition |
| **Duplication** | `ButtonGroup` rows repeated 6× | `ButtonStyleRow` wrapper eliminates repetition |
| **Font logic** | Inline in `Sidebar` | Extracted to `useNewsletterFonts` hook |
| **Status logic** | `confirmStatusChange` with nested conditionals | Split into `archiveNewsletter`/`reactivateNewsletter` via `useNewsletterStatus` |
| **Validation** | Inline in `useForm` | Extracted to `useNewsletterValidation` hook |
| **Toast logic** | Duplicated `if` branches for same message | `useEmailVerificationToast` with single message |
| **`SenderEmailField`** | `renderSenderEmailField()` function returning JSX | Proper React component |
| **Early return** | `if/else` in `NewsletterDetailModal` | Guard clause `if (!newsletter) return null` |