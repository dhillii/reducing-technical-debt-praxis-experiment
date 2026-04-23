```typescript
import NewsletterPreview from './newsletter-preview';
import NiceModal from '@ebay/nice-modal-react';
import React, { useCallback, useEffect, useState } from 'react';
import useSettingGroup from '../../../../hooks/use-setting-group';
import validator from 'validator';
import {
    Button,
    ButtonGroup,
    ColorPickerField,
    ConfirmationModal,
    Form,
    Heading,
    Hint,
    HtmlField,
    Icon,
    ImageUpload,
    LimitModal,
    PreviewModalContent,
    Select,
    type SelectOption,
    Separator,
    type Tab,
    TabView,
    TextArea,
    TextField,
    Toggle,
    ToggleGroup,
    showToast
} from '@tryghost/admin-x-design-system';
import { type ErrorMessages, useForm, useHandleError } from '@tryghost/admin-x-framework/hooks';
import { HostLimitError, useLimiter } from '../../../../hooks/use-limiter';
import { type Newsletter, useBrowseNewsletters, useEditNewsletter } from '@tryghost/admin-x-framework/api/newsletters';
import { type RoutingModalProps, useRouting } from '@tryghost/admin-x-framework/routing';
import { getImageUrl, useUploadImage } from '@tryghost/admin-x-framework/api/images';
import { getSettingValue, getSettingValues } from '@tryghost/admin-x-framework/api/settings';
import { hasSendingDomain, isManagedEmail, sendingDomain } from '@tryghost/admin-x-framework/api/config';
import { renderReplyToEmail, renderSenderEmail } from '../../../../utils/newsletter-emails';
import { textColorForBackgroundColor } from '@tryghost/color-utils';
import { useGlobalData } from '../../../providers/global-data-provider';

const ReplyToEmailField: React.FC<{
    newsletter: Newsletter;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    errors: ErrorMessages;
    validate: () => void;
    clearError: (field: string) => void;
}> = ({ newsletter, updateNewsletter, errors, clearError }) => {
    const { settings, config } = useGlobalData();
    const [defaultEmailAddress, supportEmailAddress] = getSettingValues<string>(settings, [
        'default_email_address',
        'support_email_address'
    ]);

    const [senderReplyTo, setSenderReplyTo] = useState(
        renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || ''
    );

    const newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);

    const onChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setSenderReplyTo(e.target.value);
            updateNewsletter({ sender_reply_to: e.target.value || 'newsletter' });
        },
        [updateNewsletter, setSenderReplyTo]
    );

    const onBlur = useCallback(() => {
        const rendered = renderReplyToEmail(newsletter, config, supportEmailAddress, defaultEmailAddress) || '';
        setSenderReplyTo(rendered);
    }, [newsletter, config, supportEmailAddress, defaultEmailAddress, setSenderReplyTo]);

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

const getFontOptions = (): SelectOption[] => [
    { value: 'serif', label: 'Elegant serif', className: 'font-serif' },
    { value: 'sans_serif', label: 'Clean sans-serif' }
];

const getFontWeightOptions = (fontCategory: string): SelectOption[] => {
    const options: SelectOption[] = [];
    if (fontCategory === 'sans_serif') {
        options.push(
            { value: 'normal', label: 'Regular', className: 'font-normal' },
            { value: 'medium', label: 'Medium', className: 'font-medium' },
            { value: 'semibold', label: 'Semi-bold', className: 'font-semibold' },
            { value: 'bold', label: 'Bold', className: 'font-bold' }
        );
    } else {
        options.push(
            { value: 'normal', label: 'Regular', className: 'font-normal' },
            { value: 'bold', label: 'Bold', className: 'font-bold' }
        );
    }
    return options;
};

const getFontWeightMap = (fontCategory: string): Record<string, string> | undefined => {
    if (fontCategory === 'serif') {
        return { medium: 'normal', semibold: 'bold' };
    }
    return undefined;
};

const getSelectedFontWeightOption = (
    fontCategory: string,
    fontWeight: string,
    fontWeightOptions: SelectOption[]
): SelectOption => {
    const weightMap = getFontWeightMap(fontCategory);
    const mappedWeight = weightMap ? (weightMap[fontWeight] || fontWeight) : fontWeight;
    const option = fontWeightOptions.find((o) => o.value === mappedWeight);
    return option || fontWeightOptions[0];
};

const changeSelectedTitleFont = (
    newsletter: Newsletter,
    updateNewsletter: (fields: Partial<Newsletter>) => void,
    option: SelectOption | null
): void => {
    const categoryValue = option?.value || 'sans_serif';
    const currentWeight = newsletter.title_font_weight;
    let newWeight = currentWeight;

    if (!getFontWeightOptions(categoryValue).find((o) => o.value === currentWeight)) {
        const weightMap = getFontWeightMap(categoryValue);
        newWeight = weightMap?.[currentWeight] || 'bold';
    }

    updateNewsletter({ title_font_category: categoryValue, title_font_weight: newWeight });
};

const isBackgroundColorDark = (background_color: string | undefined): boolean => {
    if (background_color === 'light') {
        return false;
    }
    return textColorForBackgroundColor(background_color).hex().toLowerCase() === '#ffffff';
};

const confirmStatusChange = (
    newsletter: Newsletter,
    onlyOne: boolean,
    activeNewsletters: Newsletter[],
    updateNewsletter: (fields: Partial<Newsletter>) => void,
    editNewsletter: (newsletter: Newsletter) => Promise<void>,
    handleError: (error: unknown) => void,
    updateRoute: (route: { route: string; isExternal?: boolean }) => void
): void => {
    if (newsletter.status === 'active') {
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
                    await editNewsletter({ ...newsletter, status: 'archived' });
                    modal?.remove();
                    showToast({ type: 'success', message: 'Newsletter archived' });
                } catch (e) {
                    handleError(e);
                }
            }
        });
    } else {
        try {
            await limiter?.errorIfWouldGoOverLimit('newsletters');
        } catch (error) {
            if (error instanceof HostLimitError) {
                NiceModal.show(LimitModal, {
                    prompt: error.message || `Your current plan doesn't support more newsletters.`,
                    onOk: () => updateRoute({ route: '/pro', isExternal: true })
                });
                return;
            }
            throw error;
        }

        NiceModal.show(ConfirmationModal, {
            title: 'Reactivate newsletter',
            prompt: (
                <>
                    Reactivating <strong>{newsletter.name}</strong> will immediately make it visible to members and re-enable it as an option when publishing new posts.
                </>
            ),
            okLabel: 'Reactivate',
            onOk: async (modal) => {
                await editNewsletter({ ...newsletter, status: 'active' });
                modal?.remove();
                showToast({ type: 'success', message: 'Newsletter reactivated' });
            }
        });
    }
};

const renderSenderEmailField = (
    config: any,
    errors: ErrorMessages,
    newsletter: Newsletter,
    newsletterAddress: string,
    defaultEmailAddress: string,
    updateNewsletter: (fields: Partial<Newsletter>) => void,
    clearError: (field: string) => void
): React.ReactNode | null => {
    if (!isManagedEmail(config)) {
        return (
            <TextField
                error={Boolean(errors.sender_email)}
                hint={errors.sender_email}
                placeholder={newsletterAddress || ''}
                title="Sender email address"
                value={newsletter.sender_email || ''}
                onChange={(e) => updateNewsletter({ sender_email: e.target.value })}
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
                onChange={(e) => updateNewsletter({ sender_email: e.target.value })}
                onKeyDown={() => clearError('sender_email')}
            />
        );
    }

    return null;
};

const Sidebar: React.FC<{
    newsletter: Newsletter;
    onlyOne: boolean;
    updateNewsletter: (fields: Partial<Newsletter>) => void;
    validate: () => void;
    errors: ErrorMessages;
    clearError: (field: string) => void;
}> = ({ newsletter, onlyOne, updateNewsletter, validate, errors, clearError }) => {
    const { updateRoute } = useRouting();
    const { mutateAsync: editNewsletter } = useEditNewsletter();
    const limiter = useLimiter();
    const { settings, config, siteData } = useGlobalData();
    const [icon, defaultEmailAddress] = getSettingValues<string>(settings, ['icon', 'default_email_address']);
    const { mutateAsync: uploadImage } = useUploadImage();
    const [selectedTab, setSelectedTab] = useState('generalSettings');
    const { localSettings } = useSettingGroup();
    const [siteTitle] = getSettingValues(localSettings, ['title']) as string[];
    const handleError = useHandleError();
    const { data: { newsletters: apiNewsletters } = {} } = useBrowseNewsletters();
    const commentsEnabled = ['all', 'paid'].includes(getSettingValue(settings, 'comments_enabled') || '');

    const newsletterAddress = renderSenderEmail(newsletter, config, defaultEmailAddress);
    const [newsletters, setNewsletters] = useState<Newsletter[]>(apiNewsletters || []);
    const activeNewsletters = newsletters.filter((n) => n.status === 'active');

    useEffect(() => {
        setNewsletters(apiNewsletters || []);
    }, [apiNewsletters]);

    const fontOptions = getFontOptions();
    const headingFontWeightOptions = getFontWeightOptions(newsletter.title_font_category || 'sans_serif');

    const handleTabChange = useCallback((id: string) => {
        setSelectedTab(id);
    }, []);

    const handleArchiveNewsletter = useCallback(() => {
        confirmStatusChange(
            newsletter,
            onlyOne,
            activeNewsletters,
            updateNewsletter,
            editNewsletter,
            handleError,
            updateRoute
        );
    }, [newsletter, onlyOne, activeNewsletters, updateNewsletter, editNewsletter, handleError, updateRoute]);

    const handleReactivateNewsletter = useCallback(() => {
        confirmStatusChange(
            newsletter,
            onlyOne,
            activeNewsletters,
            updateNewsletter,
            editNewsletter,
            handleError,
            updateRoute
        );
    }, [newsletter, onlyOne, activeNewsletters, updateNewsletter, editNewsletter, handleError, updateRoute]);

    const handleUploadImage = useCallback(
        async (file: File) => {
            try {
                const imageUrl = getImageUrl(await uploadImage({ file }));
                updateNewsletter({ header_image: imageUrl });
            } catch (e) {
                handleError(e);
            }
        },
        [uploadImage, updateNewsletter, handleError]
    );

    const handleDeleteImage = useCallback(() => {
        updateNewsletter({ header_image: null });
    }, [updateNewsletter]);

    const handleUpdateSenderEmail = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ sender_email: e.target.value });
        },
        [updateNewsletter]
    );

    const handleUpdateSenderName = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ sender_name: e.target.value });
        },
        [updateNewsletter]
    );

    const handleUpdateName = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ name: e.target.value });
        },
        [updateNewsletter]
    );

    const handleUpdateDescription = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            updateNewsletter({ description: e.target.value });
        },
        [updateNewsletter]
    );

    const handleUpdateSubscribeOnSignup = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ subscribe_on_signup: e.target.checked });
        },
        [updateNewsletter]
    );

    const handleUpdateShowHeaderIcon = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ show_header_icon: e.target.checked });
        },
        [updateNewsletter]
    );

    const handleUpdateShowHeaderTitle = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ show_header_title: e.target.checked });
        },
        [updateNewsletter]
    );

    const handleUpdateShowHeaderName = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ show_header_name: e.target.checked });
        },
        [updateNewsletter]
    );

    const handleUpdateShowPostTitleSection = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ show_post_title_section: e.target.checked });
        },
        [updateNewsletter]
    );

    const handleUpdateShowExcerpt = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ show_excerpt: e.target.checked });
        },
        [updateNewsletter]
    );

    const handleUpdateShowFeatureImage = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ show_feature_image: e.target.checked });
        },
        [updateNewsletter]
    );

    const handleUpdateFeedbackEnabled = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ feedback_enabled: e.target.checked });
        },
        [updateNewsletter]
    );

    const handleUpdateShowCommentCta = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ show_comment_cta: e.target.checked });
        },
        [updateNewsletter]
    );

    const handleUpdateShowLatestPosts = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ show_latest_posts: e.target.checked });
        },
        [updateNewsletter]
    );

    const handleUpdateShowSubscriptionDetails = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ show_subscription_details: e.target.checked });
        },
        [updateNewsletter]
    );

    const handleUpdateFooterContent = useCallback(
        (html: string) => {
            updateNewsletter({ footer_content: html });
        },
        [updateNewsletter]
    );

    const handleUpdateShowBadge = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            updateNewsletter({ show_badge: e.target.checked });
        },
        [updateNewsletter]
    );

    const handleUpdateBackgroundColor = useCallback(
        (color: string) => {
            updateNewsletter({ background_color: color });
        },
        [updateNewsletter]
    );

    const handleUpdateTitleFontCategory = useCallback(
        (option: SelectOption) => {
            changeSelectedTitleFont(newsletter, updateNewsletter, option);
        },
        [newsletter, updateNewsletter]
    );

    const handleUpdateTitleFontWeight = useCallback(
        (option: SelectOption) => {
            updateNewsletter({ title_font_weight: option.value });
        },
        [updateNewsletter]
    );

    const handleUpdateBodyFontCategory = useCallback(
        (option: SelectOption) => {
            updateNewsletter({ body_font_category: option.value });
        },
        [updateNewsletter]
    );

    const handleUpdateHeaderBackgroundColor = useCallback(
        (color: string) => {
            updateNewsletter({ header_background_color: color });
        },
        [updateNewsletter]
    );

    const handleUpdatePostTitleColor = useCallback(
        (color: string | null) => {
            updateNewsletter({ post_title_color: color });
        },
        [updateNewsletter]
    );

    const handleUpdateSectionTitleColor = useCallback(
        (color: string) => {
            updateNewsletter({ section_title_color: color });
        },
        [updateNewsletter]
    );

    const handleUpdateButtonColor = useCallback(
        (color: string) => {
            updateNewsletter({ button_color: color });
        },
        [updateNewsletter]
    );

    const handleUpdateTitleAlignment = useCallback(
        (alignment: string) => {
            updateNewsletter({ title_alignment: alignment });
        },
        [updateNewsletter]
    );

    const handleUpdateButtonStyle = useCallback(
        (style: string) => {
            updateNewsletter({ button_style: style });
        },
        [updateNewsletter]
    );

    const handleUpdateButtonCorners = useCallback(
        (corners: string) => {
            updateNewsletter({ button_corners: corners });
        },
        [updateNewsletter]
    );

    const handleUpdateLinkColor = useCallback(
        (color: string) => {
            updateNewsletter({ link_color: color });
        },
        [updateNewsletter]
    );

    const handleUpdateLinkStyle = useCallback(
        (style: string) => {
            updateNewsletter({ link_style: style });
        },
        [updateNewsletter]
    );

    const handleUpdateImageCorners = useCallback(
        (corners: string) => {
            updateNewsletter({ image_corners: corners });
        },
        [updateNewsletter]
    );

    const handleUpdateDividerColor = useCallback(
        (color: string) => {
            updateNewsletter({ divider_color: color });
        },
        [updateNewsletter]
    );

    const generalSettingsTab: Tab = {
        id: 'generalSettings',
        title: 'General',
        contents: (
            <>
                <Form className='mt-6' gap='sm' margins='lg' title='Name and description'>
                    <TextField
                        error={Boolean(errors.name)}
                        hint={errors.name}
                        maxLength={191}
                        placeholder="Weekly Roundup"
                        title="Name"
                        value={newsletter.name || ''}
                        onChange={handleUpdateName}
                        onKeyDown={() => clearError('name')}
                    />
                    <TextArea
                        maxLength={2000}
                        rows={2}
                        title="Description"
                        value={newsletter.description || ''}
                        onChange={handleUpdateDescription}
                    />
                </Form>
                <Form className='mt-6' gap='sm' margins='lg' title='Email info'>
                    <TextField
                        maxLength={191}
                        placeholder={siteTitle}
                        title="Sender name"
                        value={newsletter.sender_name || ''}
                        onChange={handleUpdateSenderName}
                    />
                    {renderSenderEmailField(
                        config,
                        errors,
                        newsletter,
                        newsletterAddress,
                        defaultEmailAddress,
                        handleUpdateSenderEmail,
                        clearError
                    )}
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
                        onChange={handleUpdateSubscribeOnSignup}
                    />
                </Form>
                <div className='mb-5 mt-10'>
                    {newsletter.status === 'active' ? (
                        !onlyOne && <Button color='red' disabled={activeNewsletters.length === 1} label='Archive newsletter' link onClick={handleArchiveNewsletter} />
                    ) : (
                        <Button color='green' label='Reactivate newsletter' link onClick={handleReactivateNewsletter} />
                    )}
                </div>
            </>
        )
    };

    const contentTab: Tab = {
        id: 'content',
        title: 'Content',
        contents: (
            <>
                <Form className='mt-6' gap='sm' margins='lg' title='Header'>
                    <div>
                        <div>
                            <Heading className="mb-2" level={6}>Header image</Heading>
                        </div>
                        <div className='flex-column flex gap-1'>
                            <ImageUpload
                                deleteButtonClassName='!top-1 !right-1'
                                height={newsletter.header_image ? '66px' : '64px'}
                                id='logo'
                                imageURL={newsletter.header_image || undefined}
                                onDelete={handleDeleteImage}
                                onUpload={handleUploadImage}
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
                                onChange={handleUpdateShowHeaderIcon}
                            />
                        )}
                        <Toggle
                            checked={newsletter.show_header_title}
                            direction="rtl"
                            label='Publication title'
                            onChange={handleUpdateShowHeaderTitle}
                        />
                        <Toggle
                            checked={newsletter.show_header_name}
                            direction="rtl"
                            label='Newsletter name'
                            onChange={handleUpdateShowHeaderName}
                        />
                    </ToggleGroup>
                </Form>

                <Form className='mt-6' gap='xs' margins='lg' title='Title section'>
                    <Toggle
                        checked={newsletter.show_post_title_section}
                        direction="rtl"
                        label='Post title'
                        onChange={handleUpdateShowPostTitleSection}
                    />
                    {newsletter.show_post_title_section && (
                        <Toggle
                            checked={newsletter.show_excerpt}
                            direction="rtl"
                            label="Post excerpt"
                            onChange={handleUpdateShowExcerpt}
                        />
                    )}
                    <Toggle
                        checked={newsletter.show_feature_image}
                        direction="rtl"
                        label='Feature image'
                        onChange={handleUpdateShowFeatureImage}
                    />
                </Form>

                <Form className='mt-6' gap='sm' margins='lg' title='Footer'>
                    <ToggleGroup gap='lg'>
                        <Toggle
                            checked={newsletter.feedback_enabled}
                            direction="rtl"
                            label='Ask your readers for feedback'
                            onChange={handleUpdateFeedbackEnabled}
                        />
                        {commentsEnabled && (
                            <Toggle
                                checked={newsletter.show_comment_cta}
                                direction="rtl"
                                label='Add a link to your comments'
                                onChange={handleUpdateShowCommentCta}
                            />
                        )}
                        <Toggle
                            checked={newsletter.show_latest_posts}
                            direction="rtl"
                            label='Share your latest posts'
                            onChange={handleUpdateShowLatestPosts}
                        />
                        <Toggle
                            checked={newsletter.show_subscription_details}
                            direction="rtl"
                            label='Show subscription details'
                            onChange={handleUpdateShowSubscriptionDetails}
                        />
                    </ToggleGroup>
                    <HtmlField
                        hint='Any extra information or legal text'
                        nodes='MINIMAL_NODES'
                        placeholder=' '
                        title='Email footer'
                        value={newsletter.footer_content || ''}
                        onChange={handleUpdateFooterContent}
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
                                    <span className='text-[11px] leading-tight text-grey-700 md:text-xs md:leading-tight'>Show you&apos;re a part of the indie publishing movement with a small badge in the footer</span>
                                </div>
                            }
                            labelStyle='value'
                            onChange={handleUpdateShowBadge}
                        />
                    </Form>
                </div>
            </>
        )
    };

    const designTab: Tab = {
        id: 'design',
        title: 'Design',
        contents: (
            <>
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
                            onChange={handleUpdateBackgroundColor}
                        />
                    </div>
                    <div className='flex w-full items-center justify-between gap-2'>
                        <div className='shrink-0'>Heading font</div>
                        <Select
                            containerClassName='max-w-[200px]'
                            options={fontOptions}
                            selectedOption={fontOptions.find((option) => option.value === newsletter.title_font_category)}
                            onSelect={handleUpdateTitleFontCategory}
                        />
                    </div>
                    <div className='flex w-full items-center justify-between gap-2'>
                        <div className='shrink-0'>Heading weight</div>
                        <Select
                            containerClassName='max-w-[200px]'
                            options={headingFontWeightOptions}
                            selectedOption={getSelectedFontWeightOption(newsletter.title_font_category || 'sans_serif', newsletter.title_font_weight, headingFontWeightOptions)}
                            onSelect={handleUpdateTitleFontWeight}
                        />
                    </div>
                    <div className='flex w-full items-center justify-between gap-2'>
                        <div className='shrink-0'>Body font</div>
                        <Select
                            containerClassName='max-w-[200px]'
                            options={fontOptions}
                            selectedOption={fontOptions.find((option) => option.value === newsletter.body_font_category)}
                            testId='body-font-select'
                            onSelect={handleUpdateBodyFontCategory}
                        />
                    </div>
                </Form>
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
                            onChange={handleUpdateHeaderBackgroundColor}
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
                                    hex: isBackgroundColorDark(newsletter.background_color) ? '#ffffff' : '#000000'
                                },
                                {
                                    value: 'accent',
                                    title: 'Accent',
                                    hex: siteData.accent_color
                                }
                            ]}
                            title='Post title color'
                            value={newsletter.post_title_color}
                            onChange={handleUpdatePostTitleColor}
                        />
                    </div>
                    <div className='flex w-full justify-between'>
                        <div>Title alignment</div>
                        <ButtonGroup
                            activeKey={newsletter.title_alignment}
                            buttons={[
                                {
                                    key: 'left',
                                    icon: 'align-left',
                                    iconSize: 14,
                                    label: 'Align left',
                                    tooltip: 'Left',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: () => handleUpdateTitleAlignment('left'),
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
                                    onClick: () => handleUpdateTitleAlignment('center'),
                                    disabled: !newsletter.show_post_title_section
                                }
                            ]}
                            clearBg={false}
                        />
                    </div>
                </Form>

                <Form className='mt-6' gap='xs' margins='lg' title='Body'>
                    <div className='mb-1'>
                        <ColorPickerField
                            direction='rtl'
                            eyedropper={true}
                            swatches={[
                                {
                                    value: null,
                                    title: 'Auto',
                                    hex: isBackgroundColorDark(newsletter.background_color) ? '#ffffff' : '#000000'
                                },
                                {
                                    value: 'accent',
                                    title: 'Accent',
                                    hex: siteData.accent_color
                                }
                            ]}
                            title='Section title color'
                            value={newsletter.section_title_color}
                            onChange={handleUpdateSectionTitleColor}
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
                                    hex: isBackgroundColorDark(newsletter.background_color) ? '#ffffff' : '#000000'
                                }
                            ]}
                            title='Button color'
                            value={newsletter.button_color}
                            onChange={handleUpdateButtonColor}
                        />
                    </div>
                    <div className='flex w-full justify-between'>
                        <div>Button style</div>
                        <ButtonGroup
                            activeKey={newsletter.button_style || 'fill'}
                            buttons={[
                                {
                                    key: 'fill',
                                    icon: 'squircle-fill',
                                    iconSize: 14,
                                    label: 'Fill',
                                    tooltip: 'Fill',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: () => handleUpdateButtonStyle('fill')
                                },
                                {
                                    key: 'outline',
                                    icon: 'squircle',
                                    iconSize: 14,
                                    label: 'Outline',
                                    tooltip: 'Outline',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: () => handleUpdateButtonStyle('outline')
                                }
                            ]}
                            clearBg={false}
                        />
                    </div>
                    <div className='flex w-full justify-between'>
                        <div>Button corners</div>
                        <ButtonGroup
                            activeKey={newsletter.button_corners || 'rounded'}
                            buttons={[
                                {
                                    key: 'square',
                                    icon: 'square',
                                    iconSize: 14,
                                    label: 'Square',
                                    tooltip: 'Squared',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: () => handleUpdateButtonCorners('square')
                                },
                                {
                                    key: 'rounded',
                                    icon: 'squircle',
                                    iconSize: 14,
                                    label: 'Rounded',
                                    tooltip: 'Rounded',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: () => handleUpdateButtonCorners('rounded')
                                },
                                {
                                    key: 'pill',
                                    icon: 'circle',
                                    iconSize: 14,
                                    label: 'Pill',
                                    tooltip: 'Pill',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: () => handleUpdateButtonCorners('pill')
                                }
                            ]}
                            clearBg={false}
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
                                    hex: isBackgroundColorDark(newsletter.background_color) ? '#ffffff' : '#000000'
                                }
                            ]}
                            title='Link color'
                            value={newsletter.link_color}
                            onChange={handleUpdateLinkColor}
                        />
                    </div>
                    <div className='flex w-full justify-between'>
                        <div>Link style</div>
                        <ButtonGroup
                            activeKey={newsletter.link_style || 'underline'}
                            buttons={[
                                {
                                    key: 'underline',
                                    icon: 'text-underline',
                                    iconSize: 14,
                                    label: 'Underline',
                                    tooltip: 'Underline',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: () => handleUpdateLinkStyle('underline')
                                },
                                {
                                    key: 'regular',
                                    icon: 'text-regular',
                                    iconSize: 14,
                                    label: 'Regular',
                                    tooltip: 'Regular',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: () => handleUpdateLinkStyle('regular')
                                },
                                {
                                    key: 'bold',
                                    icon: 'text-bold',
                                    iconSize: 14,
                                    label: 'Bold',
                                    tooltip: 'Bold',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: () => handleUpdateLinkStyle('bold')
                                }
                            ]}
                            clearBg={false}
                        />
                    </div>
                    <div className='flex w-full justify-between'>
                        <div>Image corners</div>
                        <ButtonGroup
                            activeKey={newsletter.image_corners || 'square'}
                            buttons={[
                                {
                                    key: 'square',
                                    icon: 'square',
                                    iconSize: 14,
                                    label: 'Square',
                                    tooltip: 'Squared',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: () => handleUpdateImageCorners('square')
                                },
                                {
                                    key: 'rounded',
                                    icon: 'squircle',
                                    iconSize: 14,
                                    label: 'Rounded',
                                    tooltip: 'Rounded',
                                    hideLabel: true,
                                    link: false,
                                    size: 'sm',
                                    onClick: () => handleUpdateImageCorners('rounded')
                                }
                            ]}
                            clearBg={false}
                        />
                    </div>
                    <div className='mb-1'>
                        <ColorPickerField
                            direction='rtl'
                            eyedropper={true}
                            swatches={[
                                {
                                    value: 'light',
                                    title: 'Light',
                                    hex: '#e0e7eb'
                                },
                                {
                                    value: 'accent',
                                    title: 'Accent',
                                    hex: siteData.accent_color
                                }
                            ]}
                            title='Divider color'
                            value={newsletter.divider_color || 'light'}
                            onChange={handleUpdateDividerColor}
                        />
                    </div>
                </Form>
            </>
        )
    };

    const tabs: Tab[] = [generalSettingsTab, contentTab, designTab];

    return (
        <div className='flex flex-col'>
            <div className='px-7 pb-7 pt-0'>
                <TabView selectedTab={selectedTab} stickyHeader={true} tabs={tabs} onTabChange={handleTabChange} />
            </div>
        </div>
    );
};

const NewsletterDetailModalContent: React.FC<{ newsletter: Newsletter; onlyOne: boolean; }> = ({ newsletter, onlyOne }) => {
    const { config } = useGlobalData();
    const { mutateAsync: editNewsletter } = useEditNewsletter();
    const { updateRoute } = useRouting();
    const handleError = useHandleError();

    const {
        formState,
        saveState,
        updateForm,
        setFormState,
        handleSave,
        validate,
        errors,
        clearError,
        okProps
    } = useForm({
        initialState: newsletter,
        savingDelay: 500,
        onSave: async () => {
            const { meta: { sent_email_verification: [emailToVerify] = [] } = {} } = await editNewsletter(formState);
            let toastMessage;

            if (emailToVerify && emailToVerify === 'sender_email') {
                toastMessage = <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
            } else if (emailToVerify && emailToVerify === 'sender_reply_to') {
                toastMessage = <div>We&lsquo;ve sent a confirmation email to the new address.</div>;
            }

            if (toastMessage) {
                showToast({
                    icon: 'email',
                    message: toastMessage,
                    type: 'info'
                });
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

    const updateNewsletter = useCallback(
        (fields: Partial<Newsletter>) => {
            updateForm((state) => ({ ...state, ...fields }));
        },
        [updateForm]
    );

    useEffect(() => {
        setFormState(() => newsletter);
    }, [setFormState, newsletter]);

    const preview = <NewsletterPreview newsletter={formState} />;
    const sidebar = <Sidebar clearError={clearError} errors={errors} newsletter={formState} onlyOne={onlyOne} updateNewsletter={updateNewsletter} validate={validate} />;

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
            previewBgColor={'grey'}
            previewToolbar={false}
            sidebar={sidebar}
            sidebarPadding={false}
            testId='newsletter-modal'
            title='Newsletter'
            onOk={async () => {
                await handleSave({ fakeWhenUnchanged: true });
            }}
        />
    );
};

const NewsletterDetailModal: React.FC<RoutingModalProps> = ({ params }) => {
    const { data: { newsletters, isEnd } = {}, fetchNextPage } = useBrowseNewsletters();
    const newsletter = newsletters?.find(({ id }) => id === params?.id);

    useEffect(() => {
        if (!newsletter && !isEnd) {
            fetchNextPage();
        }
    }, [fetchNextPage, isEnd, newsletter]);

    if (newsletter) {
        return <NewsletterDetailModalContent newsletter={newsletter} onlyOne={newsletters!.length === 1} />;
    } else {
        return null;
    }
};

export default NiceModal.create(NewsletterDetailModal);
```