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

// Validator for simple field constraints
const createSimpleValidator = (maxLength: number, fieldName: string) => ({[fieldName]: (user: Partial<User>) => {
    const value = user[fieldName as keyof User] as string | undefined;
    if (!value) return '';
    return value.length <= maxLength ? '' : `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is too long`;
}});

// Validator for social URLs with error handling
const createSocialValidator = (validateFn: (url: string) => void, fieldName: string) => ({[fieldName]: (user: Partial<User>) => {
    try {
        validateFn(user[fieldName as keyof User] as string || '');
        return '';
    } catch (e) {
        return e instanceof Error ? e.message : '';
    }
}});

const validators: Record<string, (u: Partial<User>) => string> = {
    name: ({name}) => {
        if (!name) return 'Name is required';
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
    facebook: createSocialValidator(validateFacebookUrl, 'facebook').facebook,
    twitter: createSocialValidator(validateTwitterUrl, 'twitter').twitter,
    threads: createSocialValidator(validateThreadsUrl, 'threads').threads,
    bluesky: createSocialValidator(validateBlueskyUrl, 'bluesky').bluesky,
    linkedin: createSocialValidator(validateLinkedInUrl, 'linkedin').linkedin,
    instagram: createSocialValidator(validateInstagramUrl, 'instagram').instagram,
    youtube: createSocialValidator(validateYouTubeUrl, 'youtube').youtube,
    tiktok: createSocialValidator(validateTikTokUrl, 'tiktok').tiktok,
    mastodon: createSocialValidator(validateMastodonUrl, 'mastodon').mastodon
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
    confirmSuspend: (user: User) => Promise<void>,
    mainModal: any,
    updateRoute: (route: string) => void
): MenuItem[] => {
    const items: MenuItem[] = [];

    if (isOwnerUser(currentUser) && isAditorUser(formState) && formState.status !== 'inactive') {
        items.push({
            id: 'make-owner',
            label: 'Make owner',
            onClick: confirmMakeOwner
        });
    }

    const canManageUser = formState.id !== currentUser.id && (
        (hasAdminAccess(currentUser) && !isOwnerUser(user)) ||
        (isEditorUser(currentUser) && isAuthorOrContributor(user))
    );

    if (canManageUser) {
        const suspendLabel = formState.status === 'inactive' ? 'Un-suspend user' : 'Suspend user';
        items.push(
            {
                id: 'delete-user',
                label: 'Delete user',
                onClick: () => confirmDelete(user, {owner: ownerUser})
            },
            {
                id: 'suspend-user',
                label: suspendLabel,
                onClick: () => confirmSuspend(formState)
            }
        );
    }

    items.push({
        id: 'view-user-activity',
        label: 'View user activity',
        onClick: () => {
            mainModal.remove();
            updateRoute(`history/view/${formState.id}`);
        }
    });

    return items;
};

// Extract suspension confirmation logic
const handleSuspensionConfirmation = async (
    _user: User,
    limiter: any,
    updateRoute: (route: any) => void,
    updateUser: (user: User) => Promise<void>,
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
            }
            throw error;
        }
    }

    const warningText = _user.status === 'inactive'
        ? 'This user will be able to log in again and will have the same permissions they had previously.'
        : 'This user will no longer be able to log in but their posts will be kept.';

    NiceModal.show(ConfirmationModal, {
        title: 'Are you sure you want to suspend this user?',
        prompt: (
            <>
                <strong>WARNING:</strong> {warningText}
            </>
        ),
        okLabel: _user.status === 'inactive' ? 'Un-suspend' : 'Suspend',
        okRunningLabel: _user.status === 'inactive' ? 'Un-suspending...' : 'Suspending...',
        okColor: 'red',
        onOk: async (modal) => {
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
    });
};

// Extract deletion confirmation logic
const handleDeletionConfirmation = (
    _user: User,
    owner: User,
    userSlug: string,
    deleteUser: (id: string) => Promise<void>,
    mainModal: any,
    navigateOnClose: () => void,
    handleError: (error: any) => void
) => {
    NiceModal.show(ConfirmationModal, {
        title: 'Are you sure you want to delete this user?',
        prompt: (
            <>
                <p className='mb-3'><span className='font-bold'>{_user.name || _user.email}</span> will be permanently deleted and all their posts will be automatically assigned to the <span className='font-bold'>{owner.name}</span>.</p>
                <p>To make these easy to find in the future, each post will be given an internal tag of <span className='font-bold'>#{userSlug}</span></p>
            </>
        ),
        okLabel: 'Delete user',
        okColor: 'red',
        onOk: async (modal) => {
            try {
                await deleteUser(_user?.id);
                modal?.remove();
                mainModal?.remove();
                navigateOnClose();
                showToast({
                    title: 'User deleted',
                    type: 'success'
                });
            } catch (e) {
                handleError(e);
            }
        }
    });
};

// Extract ownership transfer logic
const handleOwnershipTransfer = (
    userId: string,
    makeOwner: (id: string) => Promise<void>,
    handleError: (error: any) => void
) => {
    NiceModal.show(ConfirmationModal, {
        title: 'Transfer Ownership',
        prompt: 'Are you sure you want to transfer the ownership of this blog? You will not be able to undo this action.',
        okLabel: 'Yep — I\'m sure',
        okColor: 'red',
        onOk: async (modal) => {
            try {
                await makeOwner(userId);
                modal?.remove();
                showToast({
                    title: 'Ownership transferred',
                    type: 'success'
                });
            } catch (e) {
                handleError(e);
            }
        }
    });
};

// Extract image handling logic
const updateImageField = (
    updateForm: (fn: (user: User) => User) => void,
    imageType: 'cover_image' | 'profile_image',
    imageUrl: string
) => {
    updateForm((_user) => ({
        ..._user,
        [imageType]: imageUrl
    }));
};

const deleteImageField = (
    updateForm: (fn: (user: User) => User) => void,
    imageType: 'cover_image' | 'profile_image'
) => {
    updateForm((_user) => ({
        ..._user,
        [imageType]: ''
    }));
};

// Extract header section rendering
const renderUserHeader = (
    formState: User,
    user: User,
    currentUser: User,
    editor: any,
    handleImageUpload: (type: string, file: File) => Promise<void>,
    handleImageDelete: (type: string) => void,
    showMenu: boolean,
    menuItems: MenuItem[],
    noCoverButtonClasses: string,
    coverButtonClasses: string,
    suspendedText: string
) => {
    return (
        <div className={`relative ${canAccessSettings(currentUser) ? '-mx-8 -mt-8 rounded-t' : '-mx-10 -mt-10'}`}>
            <div className={`flex flex-wrap items-end justify-between gap-8 p-8 ${formState.cover_image ? 'bg-cover bg-center' : ''} ${!canAccessSettings(currentUser) && 'min-h-[30vmin]'}`}
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
                                            handleSave: async (file:File) => {
                                                handleImageUpload('profile_image', file);
                                            }
                                        })
                                    }
                                }
                                unstyled={true}
                                width='80px'
                                onDelete={() => {
                                    handleImageDelete('profile_image');
                                }}
                                onUpload={(file: File) => {
                                    handleImageUpload('profile_image', file);
                                }}
                            >
                                <Icon colorClass='black' name='user-add' size='lg' />
                            </ImageUpload>
                        </div>
                        <div className='flex flex-nowrap items-start gap-3'>
                            <ImageUpload
                                buttonContainerClassName='flex items-end gap-4 justify-end flex-nowrap'
                                deleteButtonClassName={coverButtonClasses}
                                deleteButtonContent='Delete cover image'
                                editButtonClassName={