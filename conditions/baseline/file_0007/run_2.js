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

type ImageField = 'cover_image' | 'profile_image';

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

const validateAllFields = (values: Partial<User>): ErrorMessages =>
    Object.entries(validators).reduce<ErrorMessages>((acc, [key, validate]) => {
        const error = validate(values);
        if (error) acc[key] = error;
        return acc;
    }, {});

// ─── Sub-components ───────────────────────────────────────────────────────────

interface MenuButtonProps {
    hasCoverImage: boolean;
}

const MenuTriggerButton: React.FC<MenuButtonProps> = ({hasCoverImage}) => (
    <button
        className={clsx(
            'flex h-8 cursor-pointer items-center justify-center rounded px-3',
            hasCoverImage
                ? 'bg-[rgba(0,0,0,0.75)] opacity-80 hover:opacity-100'
                : 'border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white'
        )}
        type='button'
    >
        <span className='sr-only'>Actions</span>
        <Icon
            colorClass={hasCoverImage ? 'text-white' : undefined}
            name='ellipsis'
            size='md'
        />
    </button>
);

// ─── Main Component ───────────────────────────────────────────────────────────

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

    const {formState, setFormState, saveState, handleSave, updateForm, errors, setErrors, clearError, okProps} = useForm({
        initialState: user,
        savingDelay: 500,
        savedDelay: 500,
        onValidate: validateAllFields,
        onSave: async (values) => { await updateUser?.(values); },
        onSaveError: handleError
    });

    const setUserData = (newData: User) => updateForm(() => newData);

    const validateField = <K extends keyof User>(key: K, value: User[K]): boolean => {
        const error = validators[key]?.({[key]: value});
        if (error) {
            setErrors({...errors, [key]: error});
            return false;
        }
        clearError(key);
        return true;
    };

    const navigateOnClose = useCallback(() => {
        if (canAccessSettings(currentUser)) {
            updateRoute('staff');
        } else {
            updateRoute({isExternal: true, route: ''});
        }
    }, [currentUser, updateRoute]);

    // ── Image Handlers ──────────────────────────────────────────────────────

    const handleImageUpload = async (imageField: ImageField, file: File) => {
        try {
            const imageUrl = getImageUrl(await uploadImage({file}));
            updateForm((_user) => ({..._user, [imageField]: imageUrl}));
        } catch (e) {
            const error = e as APIError;
            if (error.response?.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    };

    const handleImageDelete = (imageField: ImageField) => {
        updateForm((_user) => ({..._user, [imageField]: ''}));
    };

    // ── Confirmation Modals ─────────────────────────────────────────────────

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

        NiceModal.show(ConfirmationModal, {
            title: 'Are you sure you want to suspend this user?',
            prompt: <><strong>WARNING:</strong> {warningText}</>,
            okLabel: isInactive ? 'Un-suspend' : 'Suspend',
            okRunningLabel: isInactive ? 'Un-suspending...' : 'Suspending...',
            okColor: 'red',
            onOk: async (modal) => {
                try {
                    const updatedUserData = {..._user, status: isInactive ? 'active' : 'inactive'};
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

    const confirmDelete = (_user: User, {owner}: {owner: User}) => {
        NiceModal.show(ConfirmationModal, {
            title: 'Are you sure you want to delete this user?',
            prompt: (
                <>
                    <p className='mb-3'>
                        <span className='font-bold'>{_user.name || _user.email}</span> will be permanently deleted and all their posts will be automatically assigned to the <span className='font-bold'>{owner.name}</span>.
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
            okLabel: 'Yep — I\'m sure',
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

    // ── Menu Items ──────────────────────────────────────────────────────────

    const showMenu = hasAdminAccess(currentUser) || (isEditorUser(currentUser) && isAuthorOrContributor(user));

    const menuItems: MenuItem[] = [];

    if (isOwnerUser(currentUser) && isAdminUser(formState) && formState.status !== 'inactive') {
        menuItems.push({id: 'make-owner', label: 'Make owner', onClick: confirmMakeOwner});
    }

    const canManageUser =
        formState.id !== currentUser.id && (
            (hasAdminAccess(currentUser) && !isOwnerUser(user)) ||
            (isEditorUser(currentUser) && isAuthorOrContributor(user))
        );

    if (canManageUser) {
        menuItems.push(
            {id: 'delete-user', label: 'Delete user', onClick: () => confirmDelete(user, {owner: ownerUser})},
            {
                id: 'suspend-user',
                label: formState.status === 'inactive' ? 'Un-suspend user' : 'Suspend user',
                onClick: () => confirmSuspend(formState)
            }
        );
    }

    menuItems.push({
        id: 'view-user-activity',
        label: 'View user activity',
        onClick: () => {
            mainModal.remove();
            updateRoute(`history/view/${formState.id}`);
        }
    });

    // ── Derived Values ──────────────────────────────────────────────────────

    const canAccess = canAccessSettings(currentUser);
    const hasCoverImage = !!formState.cover_image;
    const suspendedText = formState.status === 'inactive' ? ' (Suspended)' : '';
    const textColorClass = hasCoverImage ? 'text-white' : 'text-black dark:text-white';

    const [selectedTab, setSelectedTab] = useState<string>(getTabFromPath(route));

    const handleTabChange = (newTabId: string) => {
        const urlSegment = newTabId === 'profile' ? '' : `/${newTabId}`;
        updateRoute(`staff/${user.slug}${urlSegment}`);
        setSelectedTab(newTabId);
    };

    const tabProps = {clearError, errors, setUserData, user: formState, validateField};

    const tabs = [
        {
            id: 'profile',
            title: 'Profile',
            contents: <ProfileTab {...tabProps} />
        },
        {
            id: '