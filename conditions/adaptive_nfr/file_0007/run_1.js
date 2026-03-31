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
const createLengthValidator = (maxLength: number, fieldName: string) => ({[fieldName]: (data: Partial<User>) => {
    const value = data[fieldName as keyof User] as string | undefined;
    return !value || value.length <= maxLength ? '' : `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is too long`;
}});

const createUrlValidator = (fieldName: string, validateFn?: (url: string) => void) => ({[fieldName]: (data: Partial<User>) => {
    const value = data[fieldName as keyof User] as string | undefined;
    if (!value) return '';
    
    try {
        if (validateFn) {
            validateFn(value);
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
    facebook: ({facebook}) => {
        try {
            validateFacebookUrl(facebook || '');
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : '';
        }
    },
    twitter: ({twitter}) => {
        try {
            validateTwitterUrl(twitter || '');
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : '';
        }
    },
    threads: ({threads}) => {
        try {
            validateThreadsUrl(threads || '');
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : '';
        }
    },
    bluesky: ({bluesky}) => {
        try {
            validateBlueskyUrl(bluesky || '');
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : '';
        }
    },
    linkedin: ({linkedin}) => {
        try {
            validateLinkedInUrl(linkedin || '');
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : '';
        }
    },
    instagram: ({instagram}) => {
        try {
            validateInstagramUrl(instagram || '');
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : '';
        }
    },
    youtube: ({youtube}) => {
        try {
            validateYouTubeUrl(youtube || '');
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : '';
        }
    },
    tiktok: ({tiktok}) => {
        try {
            validateTikTokUrl(tiktok || '');
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : '';
        }
    },
    mastodon: ({mastodon}) => {
        try {
            validateMastodonUrl(mastodon || '');
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : '';
        }
    }
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
    formState: User,
    onConfirm: (updatedUser: User) => Promise<void>,
    limiter?: ReturnType<typeof useLimiter>
) => {
    if (user.status === 'inactive' && user.roles[0].name !== 'Contributor') {
        try {
            await limiter?.errorIfWouldGoOverLimit('staff');
        } catch (error) {
            if (error instanceof HostLimitError) {
                NiceModal.show(LimitModal, {
                    formSheet: true,
                    prompt: error.message || `Your current plan doesn't support more users.`,
                    onOk: () => window.location.href = '/pro'
                });
                return;
            }
            throw error;
        }
    }

    const isInactive = user.status === 'inactive';
    const warningText = isInactive
        ? 'This user will be able to log in again and will have the same permissions they had previously.'
        : 'This user will no longer be able to log in but their posts will be kept.';

    NiceModal.show(ConfirmationModal, {
        title: 'Are you sure you want to suspend this user?',
        prompt: (
            <>
                <strong>WARNING:</strong> {warningText}
            </>
        ),
        okLabel: isInactive ? 'Un-suspend' : 'Suspend',
        okRunningLabel: isInactive ? 'Un-suspending...' : 'Suspending...',
        okColor: 'red',
        onOk: async (modal) => {
            const updatedUserData = {
                ...user,
                status: isInactive ? 'active' : 'inactive'
            };
            await onConfirm(updatedUserData);
            modal?.remove();
            showToast({
                title: isInactive ? 'User un-suspended' : 'User suspended',
                type: 'success'
            });
        }
    });
};

const showDeleteConfirmation = (
    user: User,
    owner: User,
    onConfirm: () => Promise<void>
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
        onOk: async (modal) => {
            await onConfirm();
            modal?.remove();
            showToast({
                title: 'User deleted',
                type: 'success'
            });
        }
    });
};

const showMakeOwnerConfirmation = (onConfirm: () => Promise<void>) => {
    NiceModal.show(ConfirmationModal, {
        title: 'Transfer Ownership',
        prompt: 'Are you sure you want to transfer the ownership of this blog? You will not be able to undo this action.',
        okLabel: 'Yep — I\'m sure',
        okColor: 'red',
        onOk: async (modal) => {
            await onConfirm();
            modal?.remove();
            showToast({
                title: 'Ownership transferred',
                type: 'success'
            });
        }
    });
};

// Image upload handler
const useImageHandler = (updateForm: (fn: (user: User) => User) => void, handleError: (error: Error) => void) => {
    const {mutateAsync: uploadImage} = useUploadImage();

    const handleImageUpload = useCallback(async (imageType: 'cover_image' | 'profile_image', file: File) => {
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
    }, [uploadImage, updateForm, handleError]);

    const handleImageDelete = useCallback((imageType: 'cover_image' | 'profile_image') => {
        updateForm((user) => ({...user, [imageType]: ''}));
    }, [updateForm]);

    return {handleImageUpload, handleImageDelete};
};

// Menu items builder
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

    const canModifyUser = formState.id !== currentUser.id && (
        (hasAdminAccess(currentUser) && !isOwnerUser(user)) ||
        (isEditorUser(currentUser) && isAuthorOrContributor(user))
    );

    if (canModifyUser) {
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

const UserDetailModalContent: React.FC<{user: User}> = ({user}) => {
    const {updateRoute, route} = useRouting();
    const {ownerUser} = useStaffUsers();
    const {currentUser} = useGlobalData();
    const handleError = useHandleError();
    const mainModal = useModal();
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

    const {handleImageUpload, handleImageDelete} = useImageHandler(updateForm, handleError);

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

    const handleTabChange = useCallback((newTabId: string) => {
        const urlSegment = newTabId === 'profile' ? '' : `/${newTabId}`;
        updateRoute(`staff/${user.slug}${urlSegment}`);
    }, [user.slug, updateRoute]);

    const initialTab = useMemo(() => {
        const lastSegment = route.split('/').pop() || '';
        return (lastSegment === 'social-links' || lastSegment === 'email-notifications') ? lastSegment : 'profile';
    }, [route]);

    const [selectedTab, setSelectedTab] = useState<string>(initialTab);

    const showMenu = hasAdminAccess(currentUser) || (isEditorUser(currentUser) && isAuthorOrContributor(user));

    const menuItems = useMemo(() => buildMenuItems(
        currentUser,
        formState,
        user,
        ownerUser,
        () => showMakeOwnerConfirmation(async () => {
            await makeOwner(user.id);
        }),
        () => showSuspendConfirmation(formState, formState, async (updatedUserData) => {
            await updateUser(updatedUserData);
            setFormState(() => updatedUserData);
        }, limiter),
        () => showDeleteConfirmation(user, ownerUser, async () => {
            await deleteUser(user?.id);
            mainModal?.remove();
            navigateOnClose();
        }),
        ()