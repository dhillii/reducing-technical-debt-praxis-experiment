```typescript
import EmailNotificationsTab from './users/email-notifications-tab';
import NiceModal, {useModal} from '@ebay/nice-modal-react';
import ProfileTab from './users/profile-tab';
import React, {useCallback, useState} from 'react';
import SocialLinksTab from './users/social-links-tab';
import clsx from 'clsx';
import usePinturaEditor from '../../../hooks/use-pintura-editor';
import useStaffUsers from '../../../hooks/use-staff-users';
import validator from 'validator';
import {APIError} from '@tryghost/admin-x-framework/errors';
import {ConfirmationModal, Heading, Icon, ImageUpload, LimitModal, Menu, type MenuItem, Modal, TabView, showToast} from '@tryghost/admin-x-design-system';
import {type ErrorMessages, useForm, useHandleError} from '@tryghost/admin-x-framework/hooks';
import {HostLimitError, useLimiter} from '../../../hooks/use-limiter';
import {type RoutingModalProps, useRouting} from '@tryghost/admin-x-framework/routing';
import {type User, canAccessSettings, hasAdminAccess, isAdminUser, isAuthorOrContributor, isEditorUser, isOwnerUser, useDeleteUser, useEditUser, useGetUserBySlug, useMakeOwner} from '@tryghost/admin-x-framework/api/users';
import {getImageUrl, useUploadImage} from '@tryghost/admin-x-framework/api/images';
import {useGlobalData} from '../../providers/global-data-provider';
import {validateBlueskyUrl, validateFacebookUrl, validateInstagramUrl, validateLinkedInUrl, validateMastodonUrl, validateThreadsUrl, validateTikTokUrl, validateTwitterUrl, validateYouTubeUrl} from '../../../utils/social-urls/index';

// ─── Validators ──────────────────────────────────────────────────────────────

const createSocialValidator = (validateFn: (url: string) => void, field: keyof User) =>
    (user: Partial<User>): string => {
        try {
            validateFn((user[field] as string) || '');
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : '';
        }
    };

const validators: Record<string, (u: Partial<User>) => string> = {
    name: ({name}) => {
        if (!name) return 'Name is required';
        if (name.length > 191) return 'Name is too long';
        return '';
    },
    email: ({email}) =>
        validator.isEmail(email || '') ? '' : 'Enter a valid email address',
    url: ({url}) =>
        !url || validator.isURL(url, {require_tld: false}) ? '' : 'Enter a valid URL',
    bio: ({bio}) =>
        !bio || bio.length <= 250 ? '' : 'Bio is too long',
    location: ({location}) =>
        !location || location.length <= 150 ? '' : 'Location is too long',
    website: ({website}) =>
        !website || (validator.isURL(website) && website.length <= 2000) ? '' : 'Enter a valid URL',
    facebook: createSocialValidator(validateFacebookUrl, 'facebook'),
    twitter: createSocialValidator(validateTwitterUrl, 'twitter'),
    threads: createSocialValidator(validateThreadsUrl, 'threads'),
    bluesky: createSocialValidator(validateBlueskyUrl, 'bluesky'),
    linkedin: createSocialValidator(validateLinkedInUrl, 'linkedin'),
    instagram: createSocialValidator(validateInstagramUrl, 'instagram'),
    youtube: createSocialValidator(validateYouTubeUrl, 'youtube'),
    tiktok: createSocialValidator(validateTikTokUrl, 'tiktok'),
    mastodon: createSocialValidator(validateMastodonUrl, 'mastodon')
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserDetailProps {
    user: User;
    setUserData: (user: User) => void;
    errors: {[key in keyof User]?: string};
    validateField: <K extends keyof User>(key: K, value: User[K]) => boolean;
    clearError: (key: keyof User) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COVER_BUTTON_CLASSES = 'flex flex-nowrap items-center justify-center px-3 h-8 opacity-80 hover:opacity-100 bg-[rgba(0,0,0,0.75)] rounded text-sm text-white transition-all cursor-pointer font-medium nowrap';
const NO_COVER_BUTTON_CLASSES = 'rounded text-sm flex flex-nowrap items-center justify-center px-3 h-8 transition-all cursor-pointer font-medium border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white';

const TAB_DEFINITIONS = [
    {id: 'profile', title: 'Profile'},
    {id: 'social-links', title: 'Social Links'},
    {id: 'email-notifications', title: 'Email Notifications'}
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTabFromPath = (path: string): string => {
    const lastSegment = path.split('/').pop() || '';
    return lastSegment === 'social-links' || lastSegment === 'email-notifications'
        ? lastSegment
        : 'profile';
};

const getTabUrlSegment = (tabId: string) => tabId === 'profile' ? '' : `/${tabId}`;

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CoverAreaProps {
    formState: User;
    user: User;
    suspendedText: string;
    showMenu: boolean;
    menuItems: MenuItem[];
    editor: ReturnType<typeof usePinturaEditor>;
    onImageUpload: (image: string, file: File) => Promise<void>;
    onImageDelete: (image: string) => void;
    canAccess: boolean;
}

const UserCoverArea: React.FC<CoverAreaProps> = ({
    formState,
    user,
    suspendedText,
    showMenu,
    menuItems,
    editor,
    onImageUpload,
    onImageDelete,
    canAccess
}) => {
    const hasCover = Boolean(formState.cover_image);
    const textColorClass = hasCover ? 'text-white' : 'text-black dark:text-white';

    return (
        <div className={`relative ${canAccess ? '-mx-8 -mt-8 rounded-t' : '-mx-10 -mt-10'}`}>
            <div
                className={clsx(
                    'flex flex-wrap items-end justify-between gap-8 p-8',
                    hasCover && 'bg-cover bg-center',
                    !canAccess && 'min-h-[30vmin]'
                )}
                style={{backgroundImage: hasCover ? `url(${formState.cover_image})` : 'none'}}
            >
                <div className='flex w-full flex-col gap-2'>
                    <div className='flex flex-nowrap items-start justify-between gap-3'>
                        <ImageUpload
                            deleteButtonClassName='md:invisible absolute pr-3 -right-2 -top-2 flex h-8 w-10 cursor-pointer items-center justify-end rounded-full bg-[rgba(0,0,0,0.75)] text-white group-hover:!visible'
                            deleteButtonContent={<Icon colorClass='text-white' name='trash' size='sm' />}
                            editButtonClassName='md:invisible absolute right-[22px] -top-2 flex h-8 w-8 cursor-pointer items-center justify-center text-white group-hover:!visible z-20'
                            fileUploadClassName='rounded-full bg-black flex items-center justify-center opacity-80 transition hover:opacity-100 -ml-2 cursor-pointer h-[80px] w-[80px]'
                            fileUploadProps={{dragIndicatorClassName: 'rounded-full'}}
                            id='avatar'
                            imageClassName='w-full h-full object-cover rounded-full shrink-0'
                            imageContainerClassName='relative group bg-cover bg-center -ml-1 h-16 w-16 md:h-18 md:w-18 shrink-0'
                            imageURL={formState.profile_image ?? undefined}
                            pintura={{
                                isEnabled: editor.isEnabled,
                                openEditor: async () => editor.openEditor({
                                    image: formState.profile_image || '',
                                    handleSave: async (file: File) => onImageUpload('profile_image', file)
                                })
                            }}
                            unstyled={true}
                            width='80px'
                            onDelete={() => onImageDelete('profile_image')}
                            onUpload={(file: File) => onImageUpload('profile_image', file)}
                        >
                            <Icon colorClass='black' name='user-add' size='lg' />
                        </ImageUpload>

                        <div className='flex flex-nowrap items-start gap-3'>
                            <ImageUpload
                                buttonContainerClassName='flex items-end gap-4 justify-end flex-nowrap'
                                deleteButtonClassName={COVER_BUTTON_CLASSES}
                                deleteButtonContent='Delete cover image'
                                editButtonClassName={COVER_BUTTON_CLASSES}
                                fileUploadClassName={NO_COVER_BUTTON_CLASSES}
                                id='cover-image'
                                imageClassName='hidden'
                                imageURL={formState.cover_image || ''}
                                pintura={{
                                    isEnabled: editor.isEnabled,
                                    openEditor: async () => editor.openEditor({
                                        image: formState.cover_image || '',
                                        handleSave: async (file: File) => onImageUpload('cover_image', file)
                                    })
                                }}
                                unstyled
                                onDelete={() => onImageDelete('cover_image')}
                                onUpload={(file: File) => onImageUpload('cover_image', file)}
                            >
                                Upload cover image
                            </ImageUpload>

                            {showMenu && (
                                <div className='z-10'>
                                    <Menu
                                        items={menuItems}
                                        position='end'
                                        trigger={
                                            <button
                                                className={clsx(
                                                    'flex h-8 cursor-pointer items-center justify-center rounded px-3',
                                                    hasCover
                                                        ? 'bg-[rgba(0,0,0,0.75)] opacity-80 hover:opacity-100'
                                                        : 'border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white'
                                                )}
                                                type='button'
                                            >
                                                <span className='sr-only'>Actions</span>
                                                <Icon
                                                    colorClass={hasCover ? 'text-white' : undefined}
                                                    name='ellipsis'
                                                    size='md'
                                                />
                                            </button>
                                        }
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <Heading
                            level={3}
                            styles={clsx('break-words md:break-normal', textColorClass)}
                        >
                            {user.name}{suspendedText}
                        </Heading>
                        <span className={clsx('text-md font-medium capitalize', textColorClass)}>
                            {user.roles[0].name.toLowerCase()}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Main Modal Content ───────────────────────────────────────────────────────

const UserDetailModalContent: React.FC<{user: User}> = ({user}) => {
    const {updateRoute, route} = useRouting();
    const {ownerUser} = useStaffUsers();
    const {currentUser} = useGlobalData();
    const handleError = useHandleError();
    const mainModal = useModal();
    const limiter = useLimiter();
    const editor = usePinturaEditor();

    const {mutateAsync: uploadImage} = useUploadImage();
    const {mutateAsync: updateUser} = useEditUser();
    const {mutateAsync: deleteUser} = useDeleteUser();
    const {mutateAsync: makeOwner} = useMakeOwner();

    const canAccess = canAccessSettings(currentUser);

    const {formState, setFormState, saveState, handleSave, updateForm, errors, setErrors, clearError, okProps} = useForm({
        initialState: user,
        savingDelay: 500,
        savedDelay: 500,
        onValidate: (values) =>
            Object.entries(validators).reduce<ErrorMessages>((acc, [key, validate]) => {
                const error = validate(values);
                if (error) acc[key] = error;
                return acc;
            }, {}),
        onSave: async (values) => { await updateUser?.(values); },
        onSaveError: handleError
    });

    const setUserData = (newData: User) => updateForm(() => newData);

    const validateField = <K extends keyof User>(key: K, value: User[K]) => {
        const error = validators[key]?.({[key]: value});
        if (error) {
            setErrors({...errors, [key]: error});
            return false;
        }
        clearError(key);
        return true;
    };

    const navigateOnClose = useCallback(() => {
        canAccess
            ? updateRoute('staff')
            : updateRoute({isExternal: true, route: ''});
    }, [canAccess, updateRoute]);

    // ── Image handlers ──────────────────────────────────────────────────────

    const handleImageUpload = async (image: string, file: File) => {
        try {
            const imageUrl = getImageUrl(await uploadImage({file}));
            updateForm((_user) => ({..._user, [image]: imageUrl}));
        } catch (e) {
            const error = e as APIError;
            if (error.response?.status === 415) error.message = 'Unsupported file type';
            handleError(error);
        }
    };

    const handleImageDelete = (image: string) => {
        updateForm((_user) => ({..._user, [image]: ''}));
    };

    // ── Confirmation modals ─────────────────────────────────────────────────

    const confirmSuspend = async (_user: User) => {
        const isInactive = _user.status === 'inactive';

        if (isInactive && _user.roles[0].name !== 'Contributor') {
            try {
                await limiter?.errorIfWouldGoOverLimit('staff');
            } catch (error) {
                if (error instanceof HostLimitError) {
                    NiceModal.show(LimitModal, {
                        formSheet: true,
                        prompt: error.message || `Your current plan doesn't support more users.`,
                        onOk: () => updateRoute({route: '/pro', isExternal: true})
                    });
                    return;
                }
                throw error;
            }
        }

        const warningText = isInactive
            ? 'This user will be able to log in again and will have the same permissions they had previously.'
            : 'This user will no longer be able to log in but their posts will be kept.';

        NiceModal.show(