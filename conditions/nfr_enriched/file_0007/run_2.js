```typescript
import EmailNotificationsTab from './users/email-notifications-tab';
import NiceModal, {useModal} from '@ebay/nice-modal-react';
import ProfileTab from './users/profile-tab';
import React, {useCallback, useMemo, useState} from 'react';
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

// Validation utilities
const createStringValidator = (maxLength: number, fieldName: string) => ({[fieldName]: (data: Partial<User>) => {
    const value = data[fieldName as keyof User] as string | undefined;
    if (!value) return '';
    return value.length > maxLength ? `${fieldName} is too long` : '';
}});

const createUrlValidator = (fieldName: string, validateFn?: (url: string) => void) => ({[fieldName]: ({[fieldName]: value}: Partial<User>) => {
    if (!value) return '';
    try {
        if (validateFn) {
            validateFn(value as string);
        }
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
        return validator.isEmail(email || '') ? '' : 'Enter a valid email address';
    },
    url: ({url}) => {
        const valid = !url || validator.isURL(url, {require_tld: false});
        return valid ? '' : 'Enter a valid URL';
    },
    bio: ({bio}) => {
        return !bio || bio.length <= 250 ? '' : 'Bio is too long';
    },
    location: ({location}) => {
        return !location || location.length <= 150 ? '' : 'Location is too long';
    },
    website: ({website}) => {
        const valid = !website || (validator.isURL(website) && website.length <= 2000);
        return valid ? '' : 'Enter a valid URL';
    },
    facebook: ({facebook}) => createUrlValidator('facebook', validateFacebookUrl).facebook({facebook}),
    twitter: ({twitter}) => createUrlValidator('twitter', validateTwitterUrl).twitter({twitter}),
    threads: ({threads}) => createUrlValidator('threads', validateThreadsUrl).threads({threads}),
    bluesky: ({bluesky}) => createUrlValidator('bluesky', validateBlueskyUrl).bluesky({bluesky}),
    linkedin: ({linkedin}) => createUrlValidator('linkedin', validateLinkedInUrl).linkedin({linkedin}),
    instagram: ({instagram}) => createUrlValidator('instagram', validateInstagramUrl).instagram({instagram}),
    youtube: ({youtube}) => createUrlValidator('youtube', validateYouTubeUrl).youtube({youtube}),
    tiktok: ({tiktok}) => createUrlValidator('tiktok', validateTikTokUrl).tiktok({tiktok}),
    mastodon: ({mastodon}) => createUrlValidator('mastodon', validateMastodonUrl).mastodon({mastodon})
};

export interface UserDetailProps {
    user: User;
    setUserData: (user: User) => void;
    errors: {[key in keyof User]?: string};
    validateField: <K extends keyof User>(key: K, value: User[K]) => boolean;
    clearError: (key: keyof User) => void;
}

// Modal confirmation helpers
const showSuspendConfirmation = async (
    user: User,
    onConfirm: (modal: any) => Promise<void>
) => {
    const isSuspended = user.status === 'inactive';
    const warningText = isSuspended
        ? 'This user will be able to log in again and will have the same permissions they had previously.'
        : 'This user will no longer be able to log in but their posts will be kept.';

    NiceModal.show(ConfirmationModal, {
        title: 'Are you sure you want to suspend this user?',
        prompt: (
            <>
                <strong>WARNING:</strong> {warningText}
            </>
        ),
        okLabel: isSuspended ? 'Un-suspend' : 'Suspend',
        okRunningLabel: isSuspended ? 'Un-suspending...' : 'Suspending...',
        okColor: 'red',
        onOk: onConfirm
    });
};

const showDeleteConfirmation = (
    user: User,
    owner: User,
    onConfirm: (modal: any) => Promise<void>
) => {
    NiceModal.show(ConfirmationModal, {
        title: 'Are you sure you want to delete this user?',
        prompt: (
            <>
                <p className='mb-3'><span className='font-bold'>{user.name || user.email}</span> will be permanently deleted and all their posts will be automatically assigned to the <span className='font-bold'>{owner.name}</span>.</p>
                <p>To make these easy to find in the future, each post will be given an internal tag of <span className='font-bold'>#{user.slug}</span></p>
            </>
        ),
        okLabel: 'Delete user',
        okColor: 'red',
        onOk: onConfirm
    });
};

const showMakeOwnerConfirmation = (onConfirm: (modal: any) => Promise<void>) => {
    NiceModal.show(ConfirmationModal, {
        title: 'Transfer Ownership',
        prompt: 'Are you sure you want to transfer the ownership of this blog? You will not be able to undo this action.',
        okLabel: 'Yep — I\'m sure',
        okColor: 'red',
        onOk: onConfirm
    });
};

// Image handling utilities
const handleImageUploadHelper = async (
    imageType: 'cover_image' | 'profile_image',
    file: File,
    uploadImage: (data: {file: File}) => Promise<any>,
    updateForm: (fn: (user: User) => User) => void,
    handleError: (error: any) => void
) => {
    try {
        const imageUrl = getImageUrl(await uploadImage({file}));
        updateForm((user) => ({...user, [imageType]: imageUrl}));
    } catch (e) {
        const error = e as APIError;
        if (error.response?.status === 415) {
            error.message = 'Unsupported file type';
        }
        handleError(error);
    }
};

const handleImageDeleteHelper = (
    imageType: 'cover_image' | 'profile_image',
    updateForm: (fn: (user: User) => User) => void
) => {
    updateForm((user) => ({...user, [imageType]: ''}));
};

// Menu building utilities
const buildMenuItems = (
    currentUser: User,
    formState: User,
    user: User,
    ownerUser: User,
    onMakeOwner: () => void,
    onSuspend: () => void,
    onDelete: () => void,
    onViewActivity: () => void
): MenuItem[] => {
    const items: MenuItem[] = [];

    if (isOwnerUser(currentUser) && isAdminUser(formState) && formState.status !== 'inactive') {
        items.push({
            id: 'make-owner',
            label: 'Make owner',
            onClick: onMakeOwner
        });
    }

    if (formState.id !== currentUser.id && (
        (hasAdminAccess(currentUser) && !isOwnerUser(user)) ||
        (isEditorUser(currentUser) && isAuthorOrContributor(user))
    )) {
        items.push({
            id: 'delete-user',
            label: 'Delete user',
            onClick: onDelete
        }, {
            id: 'suspend-user',
            label: formState.status === 'inactive' ? 'Un-suspend user' : 'Suspend user',
            onClick: onSuspend
        });
    }

    items.push({
        id: 'view-user-activity',
        label: 'View user activity',
        onClick: onViewActivity
    });

    return items;
};

// CSS class utilities
const getCoverImageButtonClasses = (hasCoverImage: boolean) => {
    return hasCoverImage
        ? 'flex flex-nowrap items-center justify-center px-3 h-8 opacity-80 hover:opacity-100 bg-[rgba(0,0,0,0.75)] rounded text-sm text-white transition-all cursor-pointer font-medium nowrap'
        : 'rounded text-sm flex flex-nowrap items-center justify-center px-3 h-8 transition-all cursor-pointer font-medium border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white';
};

const getMenuButtonClasses = (hasCoverImage: boolean) => {
    return clsx(
        'flex h-8 cursor-pointer items-center justify-center rounded px-3',
        hasCoverImage
            ? 'bg-[rgba(0,0,0,0.75)] opacity-80 hover:opacity-100'
            : 'border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white'
    );
};

const UserDetailModalContent: React.FC<{user: User}> = ({user}) => {
    const {updateRoute, route} = useRouting();
    const {ownerUser} = useStaffUsers();
    const {currentUser} = useGlobalData();
    const handleError = useHandleError();
    const mainModal = useModal();
    const {mutateAsync: uploadImage} = useUploadImage();
    const {mutateAsync: updateUser} = useEditUser();
    const {mutateAsync: deleteUser} = useDeleteUser();
    const {mutateAsync: makeOwner} = useMakeOwner();
    const limiter = useLimiter();
    const editor = usePinturaEditor();

    const {formState, setFormState, saveState, handleSave, updateForm, errors, setErrors, clearError, okProps} = useForm({
        initialState: user,
        savingDelay: 500,
        savedDelay: 500,
        onValidate: (values) => {
            return Object.entries(validators).reduce<ErrorMessages>((newErrors, [key, validate]) => {
                const error = validate(values);
                if (error) {
                    newErrors[key] = error;
                }
                return newErrors;
            }, {});
        },
        onSave: async (values) => {
            await updateUser?.(values);
        },
        onSaveError: handleError
    });

    const setUserData = useCallback((newData: User) => updateForm(() => newData), [updateForm]);

    const validateField = useCallback(<K extends keyof User>(key: K, value: User[K]) => {
        const error = validators[key]?.({[key]: value});
        if (error) {
            setErrors({...errors, [key]: error});
            return false;
        } else {
            clearError(key);
            return true;
        }
    }, [errors, setErrors, clearError]);

    const navigateOnClose = useCallback(() => {
        if (canAccessSettings(currentUser)) {
            updateRoute('staff');
        } else {
            updateRoute({isExternal: true, route: ''});
        }
    }, [currentUser, updateRoute]);

    const getTabFromPath = useCallback((path: string): string => {
        const lastSegment = path.split('/').pop() || '';
        return (lastSegment === 'social-links' || lastSegment === 'email-notifications') ? lastSegment : 'profile';
    }, []);

    const initialTab = useMemo(() => getTabFromPath(route), [route, getTabFromPath]);
    const [selectedTab, setSelectedTab] = useState<string>(initialTab);

    const handleTabChange = useCallback((newTabId: string) => {
        const urlSegment = newTabId === 'profile' ? '' : `/${newTabId}`;
        updateRoute(`staff/${user.slug}${urlSegment}`);
        setSelectedTab(newTabId);
    }, [user.slug, updateRoute]);

    const confirmSuspend = useCallback(async (_user: User) => {
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

        showSuspendConfirmation(_user, async (modal) => {
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
        });
    }, [limiter, updateRoute, updateUser, setFormState, handleError]);

    const confirmDelete = useCallback((_user: User) => {
        showDeleteConfirmation(_user, ownerUser, async (modal) => {
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
        });
    }, [ownerUser, deleteUser, mainModal, navigateOnClose, handleError]);

    const confirmMakeOwner = useCallback(() => {
        showMakeOwnerConfirmation(async (modal) => {
            try {
                await makeOwner(user.id);