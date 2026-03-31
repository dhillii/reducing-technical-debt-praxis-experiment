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
    return value.length <= maxLength ? '' : `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is too long`;
}});

const createUrlValidator = (fieldName: string, validateFn?: (url: string) => void) => ({[fieldName]: (data: Partial<User>) => {
    const value = data[fieldName as keyof User] as string | undefined;
    if (!value) return '';
    
    if (validateFn) {
        try {
            validateFn(value);
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : '';
        }
    }
    
    const valid = validator.isURL(value, {require_tld: false});
    return valid ? '' : 'Enter a valid URL';
}});

const validators: Record<string, (u: Partial<User>) => string> = {
    name: ({name}) => {
        if (!name) return 'Name is required';
        return name.length > 191 ? 'Name is too long' : '';
    },
    email: ({email}) => validator.isEmail(email || '') ? '' : 'Enter a valid email address',
    url: ({url}) => !url || validator.isURL(url, {require_tld: false}) ? '' : 'Enter a valid URL',
    bio: ({bio}) => !bio || bio.length <= 250 ? '' : 'Bio is too long',
    location: ({location}) => !location || location.length <= 150 ? '' : 'Location is too long',
    website: ({website}) => !website || (validator.isURL(website) && website.length <= 2000) ? '' : 'Enter a valid URL',
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

    const getTabFromPath = useCallback((path: string): string => {
        const lastSegment = path.split('/').pop() || '';
        return (lastSegment === 'social-links' || lastSegment === 'email-notifications') ? lastSegment : 'profile';
    }, []);

    const initialTab = getTabFromPath(route);
    const [selectedTab, setSelectedTab] = useState<string>(initialTab);

    const handleTabChange = (newTabId: string) => {
        const urlSegment = newTabId === 'profile' ? '' : `/${newTabId}`;
        updateRoute(`staff/${user.slug}${urlSegment}`);
        setSelectedTab(newTabId);
    };

    const showConfirmationModal = (title: string, prompt: React.ReactNode, okLabel: string, okColor: 'red' | 'green', onOk: (modal: any) => Promise<void>) => {
        NiceModal.show(ConfirmationModal, {
            title,
            prompt,
            okLabel,
            okColor,
            onOk
        });
    };

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

        const warningText = _user.status === 'inactive'
            ? 'This user will be able to log in again and will have the same permissions they had previously.'
            : 'This user will no longer be able to log in but their posts will be kept.';

        showConfirmationModal(
            'Are you sure you want to suspend this user?',
            <><strong>WARNING:</strong> {warningText}</>,
            _user.status === 'inactive' ? 'Un-suspend' : 'Suspend',
            'red',
            async (modal) => {
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
        );
    };

    const confirmDelete = (_user: User, {owner}: {owner: User}) => {
        showConfirmationModal(
            'Are you sure you want to delete this user?',
            <>
                <p className='mb-3'><span className='font-bold'>{_user.name || _user.email}</span> will be permanently deleted and all their posts will be automatically assigned to the <span className='font-bold'>{owner.name}</span>.</p>
                <p>To make these easy to find in the future, each post will be given an internal tag of <span className='font-bold'>#{user.slug}</span></p>
            </>,
            'Delete user',
            'red',
            async (modal) => {
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
        );
    };

    const confirmMakeOwner = () => {
        showConfirmationModal(
            'Transfer Ownership',
            'Are you sure you want to transfer the ownership of this blog? You will not be able to undo this action.',
            'Yep — I\'m sure',
            'red',
            async (modal) => {
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
        );
    };

    const handleImageUpload = async (image: string, file: File) => {
        try {
            const imageUrl = getImageUrl(await uploadImage({file}));
            updateForm((_user) => ({
                ..._user,
                [image]: imageUrl
            }));
        } catch (e) {
            const error = e as APIError;
            if (error.response!.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    };

    const handleImageDelete = (image: string) => {
        updateForm((_user) => ({
            ..._user,
            [image]: ''
        }));
    };

    const showMenu = hasAdminAccess(currentUser) || (isEditorUser(currentUser) && isAuthorOrContributor(user));

    const menuItems: MenuItem[] = useMemo(() => {
        const items: MenuItem[] = [];

        if (isOwnerUser(currentUser) && isAdminUser(formState) && formState.status !== 'inactive') {
            items.push({
                id: 'make-owner',
                label: 'Make owner',
                onClick: confirmMakeOwner
            });
        }

        if (formState.id !== currentUser.id && (
            (hasAdminAccess(currentUser) && !isOwnerUser(user)) ||
            (isEditorUser(currentUser) && isAuthorOrContributor(user))
        )) {
            items.push({
                id: 'delete-user',
                label: 'Delete user',
                onClick: () => confirmDelete(user, {owner: ownerUser})
            }, {
                id: 'suspend-user',
                label: formState.status === 'inactive' ? 'Un-suspend user' : 'Suspend user',
                onClick: () => confirmSuspend(formState)
            });
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
    }, [currentUser, formState, user, ownerUser, mainModal, updateRoute]);

    const noCoverButtonClasses = 'rounded text-sm flex flex-nowrap items-center justify-center px-3 h-8 transition-all cursor-pointer font-medium border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white';
    const coverButtonClasses = 'flex flex-nowrap items-center justify-center px-3 h-8 opacity-80 hover:opacity-100 bg-[rgba(0,0,0,0.75)] rounded text-sm text-white transition-all cursor-pointer font-medium nowrap';
    const suspendedText = formState.status === 'inactive' ? ' (Suspended)' : '';

    const tabs = useMemo(() => [
        {
            id: 'profile',
            title: 'Profile',
            contents: <ProfileTab clearError={clearError} errors={errors} setUserData={setUserData} user={formState} validateField={validateField} />
        },
        {
            id: 'social-links',
            title: 'Social Links',
            contents: <SocialLinksTab clearError={clearError} errors={errors} setUserData={setUserData} user={formState} validateField={validateField} />
        },
        {
            id: 'email-notifications',
            title: 'Email Notifications',
            contents: <EmailNotificationsTab setUserData={setUserData} user={formState} />
        }
    ], [formState, errors, clearError, setUserData, validateField]);

    const userCanAccess = canAccessSettings(currentUser);

    return (
        <Modal
            afterClose={navigateOnClose}
            animate={userCanAccess}
            backDrop={userCanAccess}
            buttonsDisabled={okProps.disabled}
            cancelLabel='Close'
            dirty={saveState === 'unsaved'}
            okColor={okProps.color}
            okLabel={okProps.label || 'Save'}
            size={userCanAccess ? 'md' : 'bleed'}
            stickyFooter={true}
            testId='user-detail-modal'