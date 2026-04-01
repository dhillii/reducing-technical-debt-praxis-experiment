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

const validateSocialUrl = (url: string, validator: (u: string) => void): string => {
    try {
        validator(url || '');
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
    facebook: ({facebook}) => validateSocialUrl(facebook || '', validateFacebookUrl),
    twitter: ({twitter}) => validateSocialUrl(twitter || '', validateTwitterUrl),
    threads: ({threads}) => validateSocialUrl(threads || '', validateThreadsUrl),
    bluesky: ({bluesky}) => validateSocialUrl(bluesky || '', validateBlueskyUrl),
    linkedin: ({linkedin}) => validateSocialUrl(linkedin || '', validateLinkedInUrl),
    instagram: ({instagram}) => validateSocialUrl(instagram || '', validateInstagramUrl),
    youtube: ({youtube}) => validateSocialUrl(youtube || '', validateYouTubeUrl),
    tiktok: ({tiktok}) => validateSocialUrl(tiktok || '', validateTikTokUrl),
    mastodon: ({mastodon}) => validateSocialUrl(mastodon || '', validateMastodonUrl)
};

export interface UserDetailProps {
    user: User;
    setUserData: (user: User) => void;
    errors: {[key in keyof User]?: string};
    validateField: <K extends keyof User>(key: K, value: User[K]) => boolean;
    clearError: (key: keyof User) => void;
}

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

    const setUserData = (newData: User) => updateForm(() => newData);
    const validateField = <K extends keyof User>(key: K, value: User[K]) => {
        const error = validators[key]?.({[key]: value});
        if (error) {
            setErrors({...errors, [key]: error});
            return false;
        } else {
            clearError(key);
            return true;
        }
    };

    const navigateOnClose = useCallback(() => {
        if (canAccessSettings(currentUser)) {
            updateRoute('staff');
        } else {
            updateRoute({isExternal: true, route: ''});
        }
    }, [currentUser, updateRoute]);

    const handleSuspendLimitCheck = async (_user: User): Promise<boolean> => {
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
                    return false;
                }
                throw error;
            }
        }
        return true;
    };

    const confirmSuspend = async (_user: User) => {
        const canProceed = await handleSuspendLimitCheck(_user);
        if (!canProceed) return;

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

    const confirmDelete = (_user: User, {owner}: {owner: User}) => {
        NiceModal.show(ConfirmationModal, {
            title: 'Are you sure you want to delete this user?',
            prompt: (
                <>
                    <p className='mb-3'><span className='font-bold'>{_user.name || _user.email}</span> will be permanently deleted and all their posts will be automatically assigned to the <span className='font-bold'>{owner.name}</span>.</p>
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

    const updateImageField = (imageType: 'cover_image' | 'profile_image', imageUrl: string) => {
        updateForm((_user) => ({..._user, [imageType]: imageUrl}));
    };

    const handleImageUpload = async (image: string, file: File) => {
        try {
            const imageUrl = getImageUrl(await uploadImage({file}));
            updateImageField(image as 'cover_image' | 'profile_image', imageUrl);
        } catch (e) {
            const error = e as APIError;
            if (error.response!.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    };

    const handleImageDelete = (image: string) => {
        updateImageField(image as 'cover_image' | 'profile_image', '');
    };

    const buildMenuItems = (): MenuItem[] => {
        const items: MenuItem[] = [];

        if (isOwnerUser(currentUser) && isAditorUser(formState) && formState.status !== 'inactive') {
            items.push({
                id: 'make-owner',
                label: 'Make owner',
                onClick: confirmMakeOwner
            });
        }

        const canModifyUser = formState.id !== currentUser.id && (
            (hasAdminAccess(currentUser) && !isOwnerUser(user)) ||
            (isEditorUser(currentUser) && isAuthorOrContributor(user))
        );

        if (canModifyUser) {
            const suspendUserLabel = formState.status === 'inactive' ? 'Un-suspend user' : 'Suspend user';
            items.push(
                {
                    id: 'delete-user',
                    label: 'Delete user',
                    onClick: () => confirmDelete(user, {owner: ownerUser})
                },
                {
                    id: 'suspend-user',
                    label: suspendUserLabel,
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

    const getTabFromPath = (path: string): string => {
        const lastSegment = path.split('/').pop() || '';
        return (lastSegment === 'social-links' || lastSegment === 'email-notifications') ? lastSegment : 'profile';
    };

    const showMenu = hasAdminAccess(currentUser) || (isEditorUser(currentUser) && isAuthorOrContributor(user));
    const menuItems = buildMenuItems();
    const noCoverButtonClasses = 'rounded text-sm flex flex-nowrap items-center justify-center px-3 h-8 transition-all cursor-pointer font-medium border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white';
    const coverButtonClasses = 'flex flex-nowrap items-center justify-center px-3 h-8 opacity-80 hover:opacity-100 bg-[rgba(0,0,0,0.75)] rounded text-sm text-white transition-all cursor-pointer font-medium nowrap';
    const suspendedText = formState.status === 'inactive' ? ' (Suspended)' : '';
    const initialTab = getTabFromPath(route);
    const [selectedTab, setSelectedTab] = useState<string>(initialTab);

    const handleTabChange = (newTabId: string) => {
        const urlSegment = newTabId === 'profile' ? '' : `/${newTabId}`;
        updateRoute(`staff/${user.slug}${urlSegment}`);
        setSelectedTab(newTabId);
    };

    return (
        <Modal
            afterClose={navigateOnClose}
            animate={canAccessSettings(currentUser)}
            backDrop={canAccessSettings(currentUser)}
            buttonsDisabled={okProps.disabled}
            cancelLabel='Close'
            dirty={saveState === 'unsaved'}
            okColor={okProps.color}
            okLabel={okProps.label || 'Save'}
            size={canAccessSettings(currentUser) ? 'md' : 'bleed'}
            stickyFooter={true}
            testId='user-detail-modal'
            width={canAccessSettings(currentUser) ? 600 : 'full'}
            onOk={async () => {
                await handleSave({fakeWhenUnchanged: true});
            }}
        >
            <div>
                <div className={`relative ${canAccessSettings(currentUser) ? '-mx-8 -mt-8 rounded-t' : '-mx-10 -mt-10'}`}>
                    <div className={`flex flex-wrap items-end justify-between gap-8 p-8 ${formState.cover_image ? 'bg-cover bg-center' : ''} ${!canAccessSettings(currentUser) && 'min-h-[30vmin]'}`}
                        style={{
                            backgroundImage: formState.cover_image ? `url(${formState.cover_image})` : 'none'
                        }}>
                        <div className='flex w-full flex-col gap-2'>
                            <div className='flex flex-