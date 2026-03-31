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

const createSocialValidator = (validateFn: (url: string) => void) =>
    (user: Partial<User>, field: keyof User): string => {
        try {
            validateFn((user[field] as string) || '');
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : '';
        }
    };

const socialValidators: Record<string, (url: string) => void> = {
    facebook: validateFacebookUrl,
    twitter: validateTwitterUrl,
    threads: validateThreadsUrl,
    bluesky: validateBlueskyUrl,
    linkedin: validateLinkedInUrl,
    instagram: validateInstagramUrl,
    youtube: validateYouTubeUrl,
    tiktok: validateTikTokUrl,
    mastodon: validateMastodonUrl
};

const validators: Record<string, (u: Partial<User>) => string> = {
    name: ({name}) => {
        if (!name) {
            return 'Name is required';
        }
        if (name.length > 191) {
            return 'Name is too long';
        }
        return '';
    },
    email: ({email}) => (validator.isEmail(email || '') ? '' : 'Enter a valid email address'),
    url: ({url}) => (!url || validator.isURL(url, {require_tld: false}) ? '' : 'Enter a valid URL'),
    bio: ({bio}) => (!bio || bio.length <= 250 ? '' : 'Bio is too long'),
    location: ({location}) => (!location || location.length <= 150 ? '' : 'Location is too long'),
    website: ({website}) => (!website || (validator.isURL(website) && website.length <= 2000) ? '' : 'Enter a valid URL'),
    ...Object.fromEntries(
        Object.entries(socialValidators).map(([field, validateFn]) => [
            field,
            (user: Partial<User>) => createSocialValidator(validateFn)(user, field as keyof User)
        ])
    )
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserDetailProps {
    user: User;
    setUserData: (user: User) => void;
    errors: {[key in keyof User]?: string};
    validateField: <K extends keyof User>(key: K, value: User[K]) => boolean;
    clearError: (key: keyof User) => void;
}

type ImageField = 'cover_image' | 'profile_image';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTabFromPath = (path: string): string => {
    const lastSegment = path.split('/').pop() || '';
    return ['social-links', 'email-notifications'].includes(lastSegment) ? lastSegment : 'profile';
};

const COVER_BUTTON_CLASSES = 'flex flex-nowrap items-center justify-center px-3 h-8 opacity-80 hover:opacity-100 bg-[rgba(0,0,0,0.75)] rounded text-sm text-white transition-all cursor-pointer font-medium nowrap';
const NO_COVER_BUTTON_CLASSES = 'rounded text-sm flex flex-nowrap items-center justify-center px-3 h-8 transition-all cursor-pointer font-medium border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white';

// ─── Hooks ────────────────────────────────────────────────────────────────────

const useUserActions = (
    user: User,
    formState: User,
    setFormState: (fn: (s: User) => User) => void,
    handleError: ReturnType<typeof useHandleError>
) => {
    const {updateRoute} = useRouting();
    const {currentUser} = useGlobalData();
    const {ownerUser} = useStaffUsers();
    const {mutateAsync: updateUser} = useEditUser();
    const {mutateAsync: deleteUser} = useDeleteUser();
    const {mutateAsync: makeOwner} = useMakeOwner();
    const limiter = useLimiter();
    const mainModal = useModal();

    const navigateOnClose = useCallback(() => {
        if (canAccessSettings(currentUser)) {
            updateRoute('staff');
        } else {
            updateRoute({isExternal: true, route: ''});
        }
    }, [currentUser, updateRoute]);

    const confirmSuspend = async (_user: User) => {
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

        const isInactive = _user.status === 'inactive';
        const warningText = isInactive
            ? 'This user will be able to log in again and will have the same permissions they had previously.'
            : 'This user will no longer be able to log in but their posts will be kept.';

        NiceModal.show(ConfirmationModal, {
            title: 'Are you sure you want to suspend this user?',
            prompt: <><strong>WARNING:</strong> {warningText}</>,
            okLabel: isInactive ? 'Un-suspend' : 'Suspend',
            okRunningLabel: isInactive ? 'Un-suspending...' : 'Suspending...',
            okColor: 'red',
            onOk: async (modal) => {
                const updatedUserData = {..._user, status: isInactive ? 'active' : 'inactive'};
                try {
                    await updateUser(updatedUserData);
                    setFormState(() => updatedUserData);
                    modal?.remove();
                    showToast({title: isInactive ? 'User un-suspended' : 'User suspended', type: 'success'});
                } catch (e) {
                    handleError(e);
                }
            }
        });
    };

    const confirmDelete = (_user: User) => {
        NiceModal.show(ConfirmationModal, {
            title: 'Are you sure you want to delete this user?',
            prompt: (
                <>
                    <p className='mb-3'>
                        <span className='font-bold'>{_user.name || _user.email}</span> will be permanently deleted and all their posts will be automatically assigned to the <span className='font-bold'>{ownerUser.name}</span>.
                    </p>
                    <p>To make these easy to find in the future, each post will be given an internal tag of <span className='font-bold'>#{user.slug}</span></p>
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
                    showToast({title: 'User deleted', type: 'success'});
                } catch (e) {
                    handleError(e);
                }
            }
        });
    };

    const confirmMakeOwner = () => {
        NiceModal.show(ConfirmationModal, {
            title: 'Transfer Ownership',
            prompt: 'Are you sure you want to transfer the ownership of this blog? You will not be able to undo this action.',
            okLabel: "Yep — I'm sure",
            okColor: 'red',
            onOk: async (modal) => {
                try {
                    await makeOwner(user.id);
                    modal?.remove();
                    showToast({title: 'Ownership transferred', type: 'success'});
                } catch (e) {
                    handleError(e);
                }
            }
        });
    };

    const viewUserActivity = () => {
        mainModal.remove();
        updateRoute(`history/view/${formState.id}`);
    };

    return {navigateOnClose, confirmSuspend, confirmDelete, confirmMakeOwner, viewUserActivity, updateUser};
};

const useMenuItems = (
    user: User,
    formState: User,
    currentUser: User,
    actions: {confirmMakeOwner: () => void; confirmDelete: (u: User) => void; confirmSuspend: (u: User) => Promise<void>; viewUserActivity: () => void}
): MenuItem[] => {
    const items: MenuItem[] = [];

    if (isOwnerUser(currentUser) && isAdminUser(formState) && formState.status !== 'inactive') {
        items.push({id: 'make-owner', label: 'Make owner', onClick: actions.confirmMakeOwner});
    }

    const canManageUser =
        formState.id !== currentUser.id &&
        ((hasAdminAccess(currentUser) && !isOwnerUser(user)) ||
            (isEditorUser(currentUser) && isAuthorOrContributor(user)));

    if (canManageUser) {
        items.push(
            {id: 'delete-user', label: 'Delete user', onClick: () => actions.confirmDelete(user)},
            {
                id: 'suspend-user',
                label: formState.status === 'inactive' ? 'Un-suspend user' : 'Suspend user',
                onClick: () => actions.confirmSuspend(formState)
            }
        );
    }

    items.push({id: 'view-user-activity', label: 'View user activity', onClick: actions.viewUserActivity});

    return items;
};

const useImageHandlers = (
    updateForm: (fn: (u: User) => User) => void,
    handleError: ReturnType<typeof useHandleError>
) => {
    const {mutateAsync: uploadImage} = useUploadImage();

    const handleImageUpload = async (image: ImageField, file: File) => {
        try {
            const imageUrl = getImageUrl(await uploadImage({file}));
            updateForm((_user) => ({..._user, [image]: imageUrl}));
        } catch (e) {
            const error = e as APIError;
            if (error.response!.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    };

    const handleImageDelete = (image: ImageField) => {
        updateForm((_user) => ({..._user, [image]: ''}));
    };

    return {handleImageUpload, handleImageDelete};
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CoverAreaProps {
    user: User;
    formState: User;
    currentUser: User;
    editor: ReturnType<typeof usePinturaEditor>;
    menuItems: MenuItem[];
    showMenu: boolean;
    suspendedText: string;
    onImageUpload: (image: ImageField, file: File) => Promise<void>;
    onImageDelete: (image: ImageField) => void;
}

const UserCoverArea: React.FC<CoverAreaProps> = ({
    user,
    formState,
    currentUser,
    editor,
    menuItems,
    showMenu,
    suspendedText,
    onImageUpload,
    onImageDelete
}) => {
    const hasCover = Boolean(formState.cover_image);
    const textColorClass = hasCover ? 'text-white' : 'text-black dark:text-white';

    return (
        <div className={`relative ${canAccessSettings(currentUser) ? '-mx-8 -mt-8 rounded-t' : '-mx-10 -mt-10'}`}>
            <div
                className={`flex flex-wrap items-end justify-between gap-8 p-8 ${hasCover ? 'bg-cover bg-center' : ''} ${!canAccessSettings(currentUser) && 'min-h-[30vmin]'}`}
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
                                    handleSave: async (file: File) => onImageUpload('