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
import {type User, canAccessSettings, hasAdminAccess, isAditorUser, isAuthorOrContributor, isEditorUser, isOwnerUser, useDeleteUser, useEditUser, useGetUserBySlug, useMakeOwner} from '@tryghost/admin-x-framework/api/users';
import {getImageUrl, useUploadImage} from '@tryghost/admin-x-framework/api/images';
import {useGlobalData} from '../../providers/global-data-provider';
import {validateBlueskyUrl, validateFacebookUrl, validateInstagramUrl, validateLinkedInUrl, validateMastodonUrl, validateThreadsUrl, validateTikTokUrl, validateTwitterUrl, validateYouTubeUrl} from '../../../utils/social-urls/index';

// Validator helper for social URLs with consistent error handling
const createSocialUrlValidator = (validatorFn: (url: string) => void) => (value: string): string => {
    try {
        validatorFn(value || '');
        return '';
    } catch (e) {
        return e instanceof Error ? e.message : '';
    }
};

const validators: Record<string, (u: Partial<User>) => string> = {
    name: ({name}) => {
        if (!name) {
            return 'Name is required';
        }
        return name.length > 191 ? 'Name is too long' : '';
    },
    email: ({email}) => {
        const valid = validator.isEmail(email || '');
        return valid ? '' : 'Enter a valid email address';
    },
    url: ({url}) => {
        const valid = !url || validator.isURL(url, {require_tld: false});
        return valid ? '' : 'Enter a valid URL';
    },
    bio: ({bio}) => {
        const valid = !bio || bio.length <= 250;
        return valid ? '' : 'Bio is too long';
    },
    location: ({location}) => {
        const valid = !location || location.length <= 150;
        return valid ? '' : 'Location is too long';
    },
    website: ({website}) => {
        const valid = !website || (validator.isURL(website) && website.length <= 2000);
        return valid ? '' : 'Enter a valid URL';
    },
    facebook: ({facebook}) => createSocialUrlValidator(validateFacebookUrl)(facebook || ''),
    twitter: ({twitter}) => createSocialUrlValidator(validateTwitterUrl)(twitter || ''),
    threads: ({threads}) => createSocialUrlValidator(validateThreadsUrl)(threads || ''),
    bluesky: ({bluesky}) => createSocialUrlValidator(validateBlueskyUrl)(bluesky || ''),
    linkedin: ({linkedin}) => createSocialUrlValidator(validateLinkedInUrl)(linkedin || ''),
    instagram: ({instagram}) => createSocialUrlValidator(validateInstagramUrl)(instagram || ''),
    youtube: ({youtube}) => createSocialUrlValidator(validateYouTubeUrl)(youtube || ''),
    tiktok: ({tiktok}) => createSocialUrlValidator(validateTikTokUrl)(tiktok || ''),
    mastodon: ({mastodon}) => createSocialUrlValidator(validateMastodonUrl)(mastodon || '')
};

export interface UserDetailProps {
    user: User;
    setUserData: (user: User) => void;
    errors: {[key in keyof User]?: string};
    validateField: <K extends keyof User>(key: K, value: User[K]) => boolean;
    clearError: (key: keyof User) => void;
}

// Extract tab navigation logic
const getTabFromPath = (path: string): string => {
    const lastSegment = path.split('/').pop() || '';
    return (lastSegment === 'social-links' || lastSegment === 'email-notifications') ? lastSegment : 'profile';
};

// Extract menu item building logic
const buildMenuItems = (
    currentUser: User,
    formState: User,
    user: User,
    ownerUser: User,
    confirmMakeOwner: () => void,
    confirmDelete: (user: User, owner: {owner: User}) => void,
    confirmSuspend: (user: User) => void,
    mainModal: any,
    updateRoute: (route: string | {route: string; isExternal: boolean}) => void
): MenuItem[] => {
    const menuItems: MenuItem[] = [];

    if (isOwnerUser(currentUser) && isAditorUser(formState) && formState.status !== 'inactive') {
        menuItems.push({
            id: 'make-owner',
            label: 'Make owner',
            onClick: confirmMakeOwner
        });
    }

    if (formState.id !== currentUser.id && (
        (hasAdminAccess(currentUser) && !isOwnerUser(user)) ||
        (isEditorUser(currentUser) && isAuthorOrContributor(user))
    )) {
        const suspendUserLabel = formState.status === 'inactive' ? 'Un-suspend user' : 'Suspend user';

        menuItems.push({
            id: 'delete-user',
            label: 'Delete user',
            onClick: () => confirmDelete(user, {owner: ownerUser})
        }, {
            id: 'suspend-user',
            label: suspendUserLabel,
            onClick: () => confirmSuspend(formState)
        });
    }

    menuItems.push({
        id: 'view-user-activity',
        label: 'View user activity',
        onClick: () => {
            mainModal.remove();
            updateRoute(`history/view/${formState.id}`);
        }
    });

    return menuItems;
};

// Extract image handling logic
const handleImageUploadLogic = async (
    image: string,
    file: File,
    uploadImage: (data: {file: File}) => Promise<any>,
    updateForm: (fn: (user: User) => User) => void,
    handleError: (error: any) => void
) => {
    try {
        const imageUrl = getImageUrl(await uploadImage({file}));
        updateForm((_user) => ({
            ..._user,
            [image]: imageUrl
        }));
    } catch (e) {
        const error = e as APIError;
        if (error.response?.status === 415) {
            error.message = 'Unsupported file type';
        }
        handleError(error);
    }
};

// Extract image deletion logic
const handleImageDeleteLogic = (
    image: string,
    updateForm: (fn: (user: User) => User) => void
) => {
    updateForm((_user) => ({
        ..._user,
        [image]: ''
    }));
};

// Extract suspension confirmation logic
const buildSuspendConfirmation = async (
    _user: User,
    limiter: any,
    updateRoute: (route: string | {route: string; isExternal: boolean}) => void,
    updateUser: (user: User) => Promise<any>,
    setFormState: (fn: (user: User) => User) => void,
    handleError: (error: any) => void
) => {
    if (_user.status === 'inactive' && _user.roles[0].name !== 'Contributor') {
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
            } else {
                throw error;
            }
        }
    }

    const warningText = _user.status === 'inactive'
        ? 'This user will be able to log in again and will have the same permissions they had previously.'
        : 'This user will no longer be able to log in but their posts will be kept.';

    return {
        title: 'Are you sure you want to suspend this user?',
        prompt: (
            <>
                <strong>WARNING:</strong> {warningText}
            </>
        ),
        okLabel: _user.status === 'inactive' ? 'Un-suspend' : 'Suspend',
        okRunningLabel: _user.status === 'inactive' ? 'Un-suspending...' : 'Suspending...',
        okColor: 'red' as const,
        onOk: async (modal: any) => {
            const updatedUserData = {
                ..._user,
                status: _user.status === 'inactive' ? 'active' : 'inactive'
            };
            try {
                await updateUser(updatedUserData);
                setFormState(() => updatedUserData);
                modal?.remove();
                showToast({
                    title: _user.status === 'inactive' ? 'User un-suspended' : 'User suspended',
                    type: 'success'
                });
            } catch (e) {
                handleError(e);
            }
        }
    };
};

// Extract header section rendering
const UserDetailHeader: React.FC<{
    formState: User;
    user: User;
    currentUser: User;
    canEdit: boolean;
    noCoverButtonClasses: string;
    coverButtonClasses: string;
    showMenu: boolean;
    menuItems: MenuItem[];
    editor: any;
    handleImageUpload: (image: string, file: File) => void;
    handleImageDelete: (image: string) => void;
}> = ({
    formState,
    user,
    currentUser,
    canEdit,
    noCoverButtonClasses,
    coverButtonClasses,
    showMenu,
    menuItems,
    editor,
    handleImageUpload,
    handleImageDelete
}) => {
    const suspendedText = formState.status === 'inactive' ? ' (Suspended)' : '';

    return (
        <div className={`relative ${canEdit ? '-mx-8 -mt-8 rounded-t' : '-mx-10 -mt-10'}`}>
            <div className={`flex flex-wrap items-end justify-between gap-8 p-8 ${formState.cover_image ? 'bg-cover bg-center' : ''} ${!canEdit && 'min-h-[30vmin]'}`}
                style={{
                    backgroundImage: formState.cover_image ? `url(${formState.cover_image})` : 'none'
                }}>
                <div className='flex w-full flex-col gap-2'>
                    <div className='flex flex-nowrap items-start justify-between gap-3'>
                        <div>
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
                                pintura={
                                    {
                                        isEnabled: editor.isEnabled,
                                        openEditor: async () => editor.openEditor({
                                            image: formState.profile_image || '',
                                            handleSave: async (file: File) => {
                                                handleImageUpload('profile_image', file);
                                            }
                                        })
                                    }
                                }
                                unstyled={true}
                                width='80px'
                                onDelete={() => handleImageDelete('profile_image')}
                                onUpload={(file: File) => handleImageUpload('profile_image', file)}
                            >
                                <Icon colorClass='black' name='user-add' size='lg' />
                            </ImageUpload>
                        </div>
                        <div className='flex flex-nowrap items-start gap-3'>
                            <ImageUpload
                                buttonContainerClassName='flex items-end gap-4 justify-end flex-nowrap'
                                deleteButtonClassName={coverButtonClasses}
                                deleteButtonContent='Delete cover image'
                                editButtonClassName={coverButtonClasses}
                                fileUploadClassName={noCoverButtonClasses}
                                id='cover-image'
                                imageClassName='hidden'
                                imageURL={formState.cover_image || ''}
                                pintura={
                                    {
                                        isEnabled: editor.isEnabled,
                                        openEditor: async () => editor.openEditor({
                                            image: formState.cover_image || '',
                                            handleSave: async (file: File) => {
                                                handleImageUpload('cover_image', file);
                                            }
                                        })
                                    }
                                }
                                unstyled
                                onDelete={() => handleImageDelete('cover_image')}
                                onUpload={(file: File) => handleImageUpload('cover_image', file)}
                            >Upload cover image</ImageUpload>
                            {showMenu && <div className="z-10">
                                <Menu
                                    items={menuItems}
                                    position='end'
                                    trigger={
                                        <button
                                            className={clsx(
                                                'flex h-8 cursor-pointer items-center justify-center rounded px-3',
                                                formState.cover_image
                                                    ? 'bg-[rgba(0,0,0,0.75)] opacity-80 hover:opacity-100'
                                                    : 'border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white'
                                            )}
                                            type='button'
                                        >
                                            <span className='sr-only'>Actions</span>
                                            <Icon
                                                colorClass={formState.cover_image ? 'text-white' : undefined}
                                                name='ellipsis'
                                                size='md'
                                            />
                                        </button>
                                    }
                                />
                            </div>}
                        </div>
                    </div>
                    <div>
                        <Heading level