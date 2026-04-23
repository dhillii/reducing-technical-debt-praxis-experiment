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

/** Validates a field value and returns error message or empty string */
const createSocialValidator = (validateFn: (url: string) => void) => (user: Partial<User>, key: string) => {
    try {
        validateFn(user[key as keyof User] as string || '');
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
        if (name.length > 191) {
            return 'Name is too long';
        }
        return '';
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
    facebook: (user) => createSocialValidator(validateFacebookUrl)(user, 'facebook'),
    twitter: (user) => createSocialValidator(validateTwitterUrl)(user, 'twitter'),
    threads: (user) => createSocialValidator(validateThreadsUrl)(user, 'threads'),
    bluesky: (user) => createSocialValidator(validateBlueskyUrl)(user, 'bluesky'),
    linkedin: (user) => createSocialValidator(validateLinkedInUrl)(user, 'linkedin'),
    instagram: (user) => createSocialValidator(validateInstagramUrl)(user, 'instagram'),
    youtube: (user) => createSocialValidator(validateYouTubeUrl)(user, 'youtube'),
    tiktok: (user) => createSocialValidator(validateTikTokUrl)(user, 'tiktok'),
    mastodon: (user) => createSocialValidator(validateMastodonUrl)(user, 'mastodon')
};

export interface UserDetailProps {
    user: User;
    setUserData: (user: User) => void;
    errors: {[key in keyof User]?: string};
    validateField: <K extends keyof User>(key: K, value: User[K]) => boolean;
    clearError: (key: keyof User) => void;
}

/** Image update strategies for different image types */
const imageUpdateStrategies: Record<string, (user: User, imageUrl: string) => User> = {
    cover_image: (user, imageUrl) => ({...user, cover_image: imageUrl}),
    profile_image: (user, imageUrl) => ({...user, profile_image: imageUrl})
};

/** Image delete strategies for different image types */
const imageDeleteStrategies: Record<string, (user: User) => User> = {
    cover_image: (user) => ({...user, cover_image: ''}),
    profile_image: (user) => ({...user, profile_image: ''})
};

const UserDetailModalContent: React.FC<{user: User}> = ({user}) => {
    const {updateRoute, route} = useRouting();

    /** Extracts tab name from route path */
    const getTabFromPath = (path: string): string => {
        const lastSegment = path.split('/').pop() || '';
        return (lastSegment === 'social-links' || lastSegment === 'email-notifications') ? lastSegment : 'profile';
    };

    const {ownerUser} = useStaffUsers();
    const {currentUser} = useGlobalData();
    const handleError = useHandleError();
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

    const mainModal = useModal();
    const {mutateAsync: uploadImage} = useUploadImage();
    const {mutateAsync: updateUser} = useEditUser();
    const {mutateAsync: deleteUser} = useDeleteUser();
    const {mutateAsync: makeOwner} = useMakeOwner();
    const limiter = useLimiter();

    const editor = usePinturaEditor();

    const navigateOnClose = useCallback(() => {
        if (canAccessSettings(currentUser)) {
            updateRoute('staff');
        } else {
            updateRoute({isExternal: true, route: ''});
        }
    }, [currentUser, updateRoute]);

    /** Checks if user can be reactivated from suspended state */
    const canReactivateFromSuspend = (_user: User): boolean => {
        return _user.status === 'inactive' && _user.roles[0].name !== 'Contributor';
    };

    /** Gets warning text for suspend/unsuspend action */
    const getSuspendWarningText = (_user: User): string => {
        if (_user.status === 'inactive') {
            return 'This user will be able to log in again and will have the same permissions they had previously.';
        }
        return 'This user will no longer be able to log in but their posts will be kept.';
    };

    const confirmSuspend = async (_user: User) => {
        if (canReactivateFromSuspend(_user)) {
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

        const warningText = getSuspendWarningText(_user);
        const isInactive = _user.status === 'inactive';

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
                    ..._user,
                    status: isInactive ? 'active' : 'inactive'
                };
                try {
                    await updateUser(updatedUserData);
                    setFormState(() => updatedUserData);
                    modal?.remove();
                    showToast({
                        title: isInactive ? 'User un-suspended' : 'User suspended',
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

    const handleImageUpload = async (image: string, file: File) => {
        try {
            const imageUrl = getImageUrl(await uploadImage({file}));
            const strategy = imageUpdateStrategies[image];
            
            if (strategy) {
                updateForm((_user) => strategy(_user, imageUrl));
            }
        } catch (e) {
            const error = e as APIError;
            if (error.response!.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    };

    const handleImageDelete = (image: string) => {
        const strategy = imageDeleteStrategies[image];
        if (strategy) {
            updateForm((_user) => strategy(_user));
        }
    };

    const showMenu = hasAdminAccess(currentUser) || (isEditorUser(currentUser) && isAuthorOrContributor(user));
    let menuItems: MenuItem[] = [];

    if (isOwnerUser(currentUser) && isAdminUser(formState) && formState.status !== 'inactive') {
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
            onClick: () => {
                confirmDelete(user, {owner: ownerUser});
            }
        }, {
            id: 'suspend-user',
            label: suspendUserLabel,
            onClick: () => {
                confirmSuspend(formState);
            }
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
                await (handleSave({fakeWhenUnchanged: true}));
            }}
        >
            <div>
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
                                                    handleSave: async (file:File) => {
                                                        handleImageUpload('cover_image', file);
                                                    }
                                                })
                                            }
                                        }
                                        unstyled
                                        onDelete={() => {
                                            handleImageDelete('cover_image');
                                        }}
                                        onUpload={(file: File) => {
                                            handleImageUpload('cover_image', file);
                                        }}
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
                                <Heading level={3} styles={clsx('break-words md:break-normal', formState.cover_image ? 'text-white' : 'text-black dark:text-white')}>{user.name}{suspendedText}</Heading>
                                <span className={clsx('text-md font-medium capitalize', formState.cover_image ? 'text-white' : 'text-black dark:text-white')}>{user.roles[0].name.toLowerCase()}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className={`${!canAccessSettings(currentUser) && 'mx-auto max-w-[536px]'} mt-6 flex flex-col`}>
                    <TabView
                        selectedTab={selectedTab}
                        tabs={[
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
                        ]}
                        onTabChange={handleTabChange}
                    />
                </div>
            </div>
        </Modal>
    );
};

const UserDetailModal: React.FC<RoutingModalProps> = ({params}) => {
    const {currentUser} = useGlobalData();

    const isCurrentUser = currentUser.slug === params?.slug;

    const {data: fetchedUserData} = useGetUserBySlug(
        params?.slug || '',
        {enabled: !isCurrentUser && !!params?.slug}
    );

    const user = isCurrentUser ? currentUser : fetchedUserData?.users?.[0];

    if (user) {
        return <UserDetailModalContent user={user} />;
    } else {
        return null;
    }
};

export default NiceModal.create(UserDetailModal);
```