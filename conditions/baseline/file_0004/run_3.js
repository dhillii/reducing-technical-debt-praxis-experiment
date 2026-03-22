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

## Extracted Sub-components

```typescript
// components/SenderEmailField.tsx
import React from 'react';
import {TextField} from '@tryghost/admin-x-design-system';
import {type ErrorMessages} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {hasSendingDomain, isManagedEmail, sendingDomain} from '@tryghost/admin-x-framework/api/config';
import {renderSenderEmail} from '../../../../utils/newsletter-emails';
import {useGlobalData} from '../../../providers/global-data-provider';
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
// components/sidebar-tabs/GeneralSettingsTab.tsx
import React from 'react';
import {Button, Form, TextArea, TextField, Toggle} from '@tryghost/admin-x-design-system';
import {type ErrorMessages} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {getSettingValues} from '@tryghost/admin-x-framework/api/settings';
import {ReplyToEmailField} from '../ReplyToEmailField';
import {SenderEmailField} from '../SenderEmailField';
import {useSettingGroup} from '../../../../../hooks/use-setting-group';
import {useGlobalData} from '../../../../providers/global-data-provider';

interface GeneralSettingsTabProps {
    newsletter: Newsletter;
    onlyOne: boolean;
    activeNewslettersCount: number;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    validate: () => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
    onStatusChange: () => void;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
    newsletter, onlyOne, activeNewslettersCount, updateNewsletter,
    validate, errors, clearError, onStatusChange
}) => {
    const {settings} = useGlobalData();
    const {localSettings} = useSettingGroup();
    const [siteTitle] = getSettingValues(localSettings, ['title']) as string[];

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
                <NewsletterStatusButton
                    activeNewslettersCount={activeNewslettersCount}
                    newsletter={newsletter}
                    onlyOne={onlyOne}
                    onStatusChange={onStatusChange}
                />
            </div>
        </>
    );
};

const NewsletterStatusButton: React.FC<{
    newsletter: Newsletter;
    onlyOne: boolean;
    activeNewslettersCount: number;
    onStatusChange: () => void;
}> = ({newsletter, onlyOne, activeNewslettersCount, onStatusChange}) => {
    if (newsletter.status === 'active') {
        return !onlyOne ? (
            <Button
                color='red'
                disabled={activeNewslettersCount === 1}
                label='Archive newsletter'
                link
                onClick={onStatusChange}
            />
        ) : null;
    }
    return <Button color='green' label='Reactivate newsletter' link onClick={onStatusChange} />;
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
    const {mutateAsync: uploadImage} = useUploadImage();
    const handleError = useHandleError();
    const [icon] = getSettingValues<string>(settings, ['icon']);
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
            <HeaderSection
                icon={icon}
                newsletter={newsletter}
                onImageUpload={handleImageUpload}
                updateNewsletter={updateNewsletter}
            />
            <TitleSection newsletter={newsletter} updateNewsletter={updateNewsletter} />
            <FooterSection
                commentsEnabled={commentsEnabled}
                newsletter={newsletter}
                updateNewsletter={updateNewsletter}
            />
            <BadgeSection newsletter={newsletter} updateNewsletter={updateNewsletter} />
        </>
    );
};

const HeaderSection: React.FC<{
    newsletter: Newsletter;
    icon: string | undefined;
    onImageUpload: (file: File) => Promise<void>;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}> = ({newsletter, icon, onImageUpload, updateNewsletter}) => (
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
);

const TitleSection: React.FC<{
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}> = ({newsletter, updateNewsletter}) => (
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
);

const FooterSection: React.FC<{
    newsletter: Newsletter;
    commentsEnabled: boolean;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}> = ({newsletter, commentsEnabled, updateNewsletter}) => (
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
);

const BadgeSection: React.FC<{
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}> = ({newsletter, updateNewsletter}) => (
    <>
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
```

```typescript
// components/sidebar-tabs/DesignTab.tsx
import React from 'react';
import {ButtonGroup, ColorPickerField, Form, Select, type SelectOption} from '@tryghost/admin-x-design-system';
import {type Newsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {textColorForBackgroundColor} from '@tryghost/color-utils';
import {useGlobalData} from '../../../../providers/global-data-provider';
import {FONT_OPTIONS, useNewsletterFonts} from '../../hooks/useNewsletterFonts';

interface DesignTabProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}

const useBackgroundColorIsDark = (newsletter: Newsletter) => {
    if (newsletter.background_color === 'light') {
        return false;
    }
    return textColorForBackgroundColor(newsletter.background_color).hex().toLowerCase() === '#ffffff';
};

const createAlignmentButtons = (
    newsletter: Newsletter,
    updateNewsletter: (fields: Partial<Newsletter>) => void
) => [
    {
        key: 'left', icon: 'align-left', iconSize: 14, label: 'Align left',
        tooltip: 'Left', hideLabel: true, link: false, size: 'sm' as const,
        onClick: () => updateNewsletter({title_alignment: 'left'}),
        disabled: !newsletter.show_post_title_section
    },
    {
        key: 'center', icon: 'align-center', iconSize: 14, label: 'Align center',
        tooltip: 'Center', hideLabel: true, link: false, size: 'sm' as const,
        onClick: () => updateNewsletter({title_alignment: 'center'}),
        disabled: !newsletter.show_post_title_section
    }
];

const createStyleButtons = <T extends string>(
    options: Array<{key: T; icon: string; label: string; tooltip: string}>,
    onClick: (key: T) => void
) => options.map(({key, icon, label, tooltip}) => ({
    key, icon, iconSize: 14, label, tooltip,
    hideLabel: true, link: false, size: 'sm' as const,
    onClick: () => onClick(key)
}));

export const DesignTab: React.FC<DesignTabProps> = ({newsletter, updateNewsletter}) => {
    const {siteData} = useGlobalData();
    const backgroundColorIsDark = useBackgroundColorIsDark(newsletter);
    const {headingFontWeightOptions, getSelectedFontWeightOption, changeSelectedTitleFont} = useNewsletterFonts(newsletter, updateNewsletter);

    const autoColorSwatch = {
        value: null,
        title: 'Auto',
        hex: backgroundColorIsDark ? '#ffffff' : '#000000'
    };
    const accentSwatch = {value: 'accent', title: 'Accent', hex: siteData.accent_color};

    return (
        <>
            <GlobalDesignSection
                accentSwatch={accentSwatch}
                autoColorSwatch={autoColorSwatch}
                changeSelectedTitleFont={changeSelectedTitleFont}
                getSelectedFontWeightOption={getSelectedFontWeightOption}
                headingFontWeightOptions={headingFontWeightOptions}
                newsletter={newsletter}
                updateNewsletter={updateNewsletter}
            />
            <HeaderDesignSection
                accentSwatch={accentSwatch}
                autoColorSwatch={autoColorSwatch}
                newsletter={newsletter}
                updateNewsletter={updateNewsletter}
            />
            <BodyDesignSection
                accentSwatch={accentSwatch}
                autoColorSwatch={autoColorSwatch}
                newsletter={newsletter}
                siteData={siteData}
                updateNewsletter={updateNewsletter}
            />
        </>
    );
};

const GlobalDesignSection: React.FC<{
    newsletter: Newsletter;
    headingFontWeightOptions: SelectOption[];
    getSelectedFontWeightOption: () => SelectOption;
    changeSelectedTitleFont: (option: SelectOption | null) => void;
    autoColorSwatch: object;
    accentSwatch: object;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}> = ({newsletter, headingFontWeightOptions, getSelectedFontWeightOption, changeSelectedTitleFont, updateNewsletter}) => (
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
);

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

const HeaderDesignSection: React.FC<{
    newsletter: Newsletter;
    autoColorSwatch: object;
    accentSwatch: object;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}> = ({newsletter, autoColorSwatch, accentSwatch, updateNewsletter}) => (
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
        <div className='flex w-full justify-between'>
            <div>Title alignment</div>
            <ButtonGroup
                activeKey={newsletter.title_alignment}
                buttons={createAlignmentButtons(newsletter, updateNewsletter)}
                clearBg={false}
            />
        </div>
    </Form>
);

const BodyDesignSection: React.FC<{
    newsletter: Newsletter;
    autoColorSwatch: object;
    accentSwatch: object;
    siteData: {accent_color: string};
    updateNewsletter: (fields: Partial<Newsletter>) => void;
}> = ({newsletter, autoColorSwatch, accentSwatch, siteData, updateNewsletter}) => (
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
        <StyleButtonRow
            activeKey={newsletter.button_style || 'fill'}
            label="Button style"
            options={[
                {key: 'fill', icon: 'squircle-fill', label: 'Fill', tooltip: 'Fill'},
                {key: 'outline', icon: 'squircle', label: 'Outline', tooltip: 'Outline'}
            ]}
            onSelect={key => updateNewsletter({button_style: key})}
        />
        <StyleButtonRow
            activeKey={newsletter.button_corners || 'rounded'}
            label="Button corners"
            options={[
                {key: 'square', icon: 'square', label: 'Square', tooltip: 'Squared'},
                {key: 'rounded', icon: 'squircle', label: 'Rounded', tooltip: 'Rounded'},
                {key: 'pill', icon: 'circle', label: 'Pill', tooltip: 'Pill'}
            ]}
            onSelect={key => updateNewsletter({button_corners: key})}
        />
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
        <StyleButtonRow
            activeKey={newsletter.link_style || 'underline'}
            label="Link style"
            options={[
                {key: 'underline', icon: 'text-underline', label: 'Underline', tooltip: 'Underline'},
                {key: 'regular', icon: 'text-regular', label: 'Regular', tooltip: 'Regular'},
                {key: 'bold', icon: 'text-bold', label: 'Bold', tooltip: 'Bold'}
            ]}
            onSelect={key => updateNewsletter({link_style: key})}
        />
        <StyleButtonRow
            activeKey={newsletter.image_corners || 'square'}
            label="Image corners"
            options={[
                {key: 'square', icon: 'square', label: 'Square', tooltip: 'Squared'},
                {key: 'rounded', icon: 'squircle', label: 'Rounded', tooltip: 'Rounded'}
            ]}
            onSelect={key => updateNewsletter({image_corners: key})}
        />
        <div className='mb-1'>
            <ColorPickerField
                direction='rtl'
                eyedropper={true}
                swatches={[
                    {value: 'light', title: 'Light', hex: '#e0e7eb'},
                    {value: 'accent', title: 'Accent', hex: siteData.accent_color}
                ]}
                title='Divider color'
                value={newsletter.divider_color || 'light'}
                onChange={color => updateNewsletter({divider_color: color})}
            />
        </div>
    </Form>
);

const StyleButtonRow: React.FC<{
    label: string;
    activeKey: string;
    options: Array<{key: string; icon: string; label: string; tooltip: string}>;
    onSelect: (key: string) => void;
}> = ({label, activeKey, options, onSelect}) => (
    <div className='flex w-full justify-between'>
        <div>{label}</div>
        <ButtonGroup
            activeKey={activeKey}
            buttons={createStyleButtons(options, onSelect)}
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
import React, {useEffect, useState} from 'react';
import validator from 'validator';
import {PreviewModalContent, type Tab, TabView, showToast} from '@tryghost/admin-x-design-system';
import {type ErrorMessages, useForm, useHandleError} from '@tryghost/admin-x-framework/hooks';
import {type Newsletter, useBrowseNewsletters, useEditNewsletter} from '@tryghost/admin-x-framework/api/newsletters';
import {type RoutingModalProps, useRouting} from '@tryghost/admin-x-framework/routing';
import {hasSendingDomain, sendingDomain} from '@tryghost/admin-x-framework/api/config';
import {useGlobalData} from '../../../providers/global-data-provider';
import {useNewsletterStatus} from './hooks/useNewsletterStatus';
import {ContentTab} from './sidebar-tabs/ContentTab';
import {DesignTab} from './sidebar-tabs/DesignTab';
import {GeneralSettingsTab} from './sidebar-tabs/GeneralSettingsTab';

// ─── ReplyToEmailField ────────────────────────────────────────────────────────

interface ReplyToEmailFieldProps {
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    validate: () => void;
    clearError: (field: string) => void;
}

const ReplyToEmailField: React.FC<ReplyToEmailFieldProps> = ({newsletter, updateNewsletter, errors, clearError}) => {
    const {settings, config} = useGlobalData();
    const [defaultEmailAddress, supportEmailAddress] = getSettingValues<string>(settings, ['default_email_address', 'support_email_address']);
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
            placeholder={renderSenderEmail(newsletter, config, defaultEmailAddress) || ''}
            title="Reply-to email"
            value={senderReplyTo}
            onBlur={onBlur}
            onChange={onChange}
            onKeyDown={() => clearError('sender_reply_to')}
        />
    );
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps {
    newsletter: Newsletter;
    onlyOne: boolean;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    validate: () => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({newsletter, onlyOne, updateNewsletter, validate, errors, clearError}) => {
    const {data: {newsletters: apiNewsletters} = {}} = useBrowseNewsletters();
    const [newsletters, setNewsletters] = useState<Newsletter[]>(apiNewsletters || []);
    const [selectedTab, setSelectedTab] = useState('generalSettings');
    const {confirmStatusChange} = useNewsletterStatus(newsletter);

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
                    onStatusChange={confirmStatusChange}
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

const validateNewsletterForm = (formState: Newsletter, config: ReturnType<typeof useGlobalData>['config']) => {
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

const getVerificationToastMessage = (emailToVerify: string | undefined) => {
    if (emailToVerify === 'sender_email' || emailToVerify === 'sender_reply_to') {
        return <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
    }
    return null;
};

// ─── NewsletterDetailModalContent ────────────────────────────────────────────

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

    const updateNewsletter = (fields: Partial<Newsletter>) => {
        updateForm(state => ({...state, ...fields}));
    };

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

// ─── NewsletterDetailModal ────────────────────────────────────────────────────

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
| **File size** | ~500 lines in one file | Split into 6 focused files |
| **Component complexity** | `Sidebar` had 200+ lines of JSX | Extracted `GeneralSettingsTab`, `ContentTab`, `DesignTab` |
| **Repeated button config** | Inline objects repeated 6+ times | `createStyleButtons` factory function |
| **Status change logic** | Inline in `Sidebar` | `useNewsletterStatus` hook |
| **Font logic** | Inline in `Sidebar` | `useNewsletterFonts` hook |
| **Validation** | Inline in `useForm` | `validateNewsletterForm` pure function |
| **Toast logic** | Inline with if/else | `getVerificationToastMessage` pure function |
| **`SenderEmailField`** | Rendered via method with early returns | Extracted as proper component |
| **`ContentTab` sub-sections** | One large block | `HeaderSection`, `TitleSection`, `FooterSection`, `BadgeSection` |
| **`DesignTab` rows** | Repeated `div+ButtonGroup` patterns | `StyleButtonRow`, `FontSelectRow` components |