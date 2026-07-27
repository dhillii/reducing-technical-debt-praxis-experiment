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

const validators: Record<string, (u: Partial<User>) => string> = {
    name: ({name}) => {
        let error = '';

        if (!name) {
            error = 'Name is required';
        }

        if (name && name.length > 191) {
            error = 'Name is too long';
        }

        return error;
    },
    email: ({email}) => {
        const valid = validator.isEmail(email || '');
        return valid ? '' : 'Enter a valid email address';
    },
    url: ({url}) => {
        // require_tld is automatically true in validator 8+, we set it false here for our default localhost setup
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
    facebook: ({facebook}) => {
        try {
            validateFacebookUrl(facebook || '');
            return '';
        } catch (e) {
            if (e instanceof Error) {
                return e.message;
            }
            return '';
        }
    },
    twitter: ({twitter}) => {
        try {
            validateTwitterUrl(twitter || '');
            return '';
        } catch (e) {
            if (e instanceof Error) {
                return e.message;
            }
            return '';
        }
    },
    threads: ({threads}) => {
        try {
            validateThreadsUrl(threads || '');
            return '';
        } catch (e) {
            if (e instanceof Error) {
                return e.message;
            }
            return '';
        }
    },
    bluesky: ({bluesky}) => {
        try {
            validateBlueskyUrl(bluesky || '');
            return '';
        } catch (e) {
            if (e instanceof Error) {
                return e.message;
            }
            return '';
        }
    },
    linkedin: ({linkedin}) => {
        try {
            validateLinkedInUrl(linkedin || '');
            return '';
        } catch (e) {
            if (e instanceof Error) {
                return e.message;
            }
            return '';
        }
    },
    instagram: ({instagram}) => {
        try {
            validateInstagramUrl(instagram || '');
            return '';
        } catch (e) {
            if (e instanceof Error) {
                return e.message;
            }
            return '';
        }
    },
    youtube: ({youtube}) => {
        try {
            validateYouTubeUrl(youtube || '');
            return '';
        } catch (e) {
            if (e instanceof Error) {
                return e.message;
            }
            return '';
        }
    },
    tiktok: ({tiktok}) => {
        try {
            validateTikTokUrl(tiktok || '');
            return '';
        } catch (e) {
            if (e instanceof Error) {
                return e.message;
            }
            return '';
        }
    },
    mastodon: ({mastodon}) => {
        try {
            validateMastodonUrl(mastodon || '');
            return '';
        } catch (e) {
            if (e instanceof Error) {
                return e.message;
            }
            return '';
        }
    }
};

// Extracted function to get tab from path
const getTabFromPath = (path: string): string => {
    const lastSegment = path.split('/').pop() || '';

    if (lastSegment === 'social-links' || lastSegment === 'email-notifications') {
        return lastSegment;
    }

    return 'profile';
};

// Extracted function to handle image upload
const handleImageUpload = async (image: string, file: File, updateForm: (newData: User) => void, uploadImage: (file: File) => Promise<string>) => {
    try {
        const imageUrl = getImageUrl(await uploadImage({file}));

        switch (image) {
        case 'cover_image':
            updateForm((user) => ({...user, cover_image: imageUrl}));
            break;
        case 'profile_image':
            updateForm((user) => ({...user, profile_image: imageUrl}));
            break;
        }
    } catch (e) {
        const error = e as APIError;
        if (error.response!.status === 415) {
            error.message = 'Unsupported file type';
        }
        // Handle error
    }
};

// Extracted function to handle image delete
const handleImageDelete = (image: string, updateForm: (newData: User) => void) => {
    switch (image) {
    case 'cover_image':
        updateForm((user) => ({...user, cover_image: ''}));
        break;
    case 'profile_image':
        updateForm((user) => ({...user, profile_image: ''}));
        break;
    }
};

// Extracted function to confirm suspend
const confirmSuspend = async (_user: User, updateUser: (user: User) => Promise<void>, setFormState: (newState: User) => void, handleError: (error: Error) => void, limiter: any) => {
    if (_user.status === 'inactive' && _user.roles[0].name !== 'Contributor') {
        try {
            await limiter?.errorIfWouldGoOverLimit('staff');
        } catch (error) {
            if (error instanceof HostLimitError) {
                // Handle limit error
                return;
            } else {
                throw error;
            }
        }
    }

    let warningText = 'This user will no longer be able to log in but their posts will be kept.';
    if (_user.status === 'inactive') {
        warningText = 'This user will be able to log in again and will have the same permissions they had previously.';
    }
    // Show confirmation modal
    const updatedUserData = {
        ..._user,
        status: _user.status === 'inactive' ? 'active' : 'inactive'
    };
    try {
        await updateUser(updatedUserData);
        setFormState(updatedUserData);
        // Show success toast
    } catch (e) {
        handleError(e);
    }
};

// Extracted function to confirm delete
const confirmDelete = (_user: User, ownerUser: User, deleteUser: (id: string) => Promise<void>, navigateOnClose: () => void, handleError: (error: Error) => void) => {
    // Show confirmation modal
    try {
        await deleteUser(_user?.id);
        navigateOnClose();
        // Show success toast
    } catch (e) {
        handleError(e);
    }
};

// Extracted function to confirm make owner
const confirmMakeOwner = (makeOwner: (id: string) => Promise<void>, handleError: (error: Error) => void) => {
    // Show confirmation modal
    try {
        await makeOwner(user.id);
        // Show success toast
    } catch (e) {
        handleError(e);
    }
};

// Extracted function to get menu items
const getMenuItems = (currentUser: User, user: User, ownerUser: User, confirmMakeOwner: () => void, confirmDelete: () => void, confirmSuspend: () => void) => {
    const menuItems: MenuItem[] = [];

    if (isOwnerUser(currentUser) && isAdminUser(user) && user.status !== 'inactive') {
        menuItems.push({
            id: 'make-owner',
            label: 'Make owner',
            onClick: confirmMakeOwner
        });
    }

    if (user.id !== currentUser.id && (
        (hasAdminAccess(currentUser) && !isOwnerUser(user)) ||
        (isEditorUser(currentUser) && isAuthorOrContributor(user))
    )) {
        let suspendUserLabel = user.status === 'inactive' ? 'Un-suspend user' : 'Suspend user';

        menuItems.push({
            id: 'delete-user',
            label: 'Delete user',
            onClick: confirmDelete
        }, {
            id: 'suspend-user',
            label: suspendUserLabel,
            onClick: confirmSuspend
        });
    }

    menuItems.push({
        id: 'view-user-activity',
        label: 'View user activity',
        onClick: () => {
            // Handle view user activity
        }
    });

    return menuItems;
};

const UserDetailModalContent: React.FC<{user: User}> = ({user}) => {
    const {updateRoute, route} = useRouting();

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
            // Handle save
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

    // Pintura integration
    const editor = usePinturaEditor();

    const navigateOnClose = useCallback(() => {
        if (canAccessSettings(currentUser)) {
            updateRoute('staff');
        } else {
            // Contributors can't access settings, exit to let the shell handle navigation
            updateRoute({isExternal: true, route: ''});
        }
    }, [currentUser, updateRoute]);

    const confirmSuspendUser = () => confirmSuspend(formState, updateUser, setFormState, handleError, limiter);
    const confirmDeleteUser = () => confirmDelete(user, ownerUser, deleteUser, navigateOnClose, handleError);
    const confirmMakeOwnerUser = () => confirmMakeOwner(makeOwner, handleError);

    const handleImageUploadWrapper = (image: string, file: File) => handleImageUpload(image, file, updateForm, uploadImage);
    const handleImageDeleteWrapper = (image: string) => handleImageDelete(image, updateForm);

    const showMenu = hasAdminAccess(currentUser) || (isEditorUser(currentUser) && isAuthorOrContributor(user));
    const menuItems = getMenuItems(currentUser, formState, ownerUser, confirmMakeOwnerUser, confirmDeleteUser, confirmSuspendUser);

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
                                                        handleImageUploadWrapper('profile_image', file);
                                                    }
                                                })
                                            }
                                        }
                                        unstyled={true}
                                        width='80px'
                                        onDelete={() => {
                                            handleImageDeleteWrapper('profile_image');
                                        }}
                                        onUpload={(file: File) => {
                                            handleImageUploadWrapper('profile_image', file);
                                        }}
                                    >
                                        <Icon colorClass='black' name='user-add' size='lg' />
                                    </ImageUpload>
                                </div>
                                <div className='flex flex-nowrap items-start gap-3'>
                                    <ImageUpload
                                        buttonContainerClassName='flex items-end gap-4 justify-end flex-nowrap'
                                        deleteButtonClassName='flex flex-nowrap items-center justify-center px-3 h-8 opacity-80 hover:opacity-100 bg-[rgba(0,0,0,0.75)] rounded text-sm text-white transition-all cursor-pointer font-medium nowrap'
                                        deleteButtonContent='Delete cover image'
                                        editButtonClassName='flex flex-nowrap items-center justify-center px-3 h-8 opacity-80 hover:opacity-100 bg-[rgba(0,0,0,0.75)] rounded text-sm text-white transition-all cursor-pointer font-medium nowrap'
                                        fileUploadClassName='rounded text-sm flex flex-nowrap items-center justify-center px-3 h-8 transition-all cursor-pointer font-medium border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white'
                                        id='cover-image'
                                        imageClassName='hidden'
                                        imageURL={formState.cover_image || ''}
                                        pintura={
                                            {
                                                isEnabled: editor.isEnabled,
                                                openEditor: async () => editor.openEditor({
                                                    image: formState.cover_image || '',
                                                    handleSave: async (file:File) => {
                                                        handleImageUploadWrapper('cover_image', file);
                                                    }
                                                })
                                            }
                                        }
                                        unstyled
                                        onDelete={() => {
                                            handleImageDeleteWrapper('cover_image');
                                        }}
                                        onUpload={(file: File) => {
                                            handleImageUploadWrapper('cover_image', file);
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
                                <Heading level={3} styles={clsx('break-words md:break-normal', formState.cover_image ? 'text-white' : 'text-black dark:text-white')}>{user.name}{formState.status === 'inactive' ? ' (Suspended)' : ''}</Heading>
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

    // Skip API call if it's the current user (we already have their data)
    const isCurrentUser = currentUser.slug === params?.slug;

    // Fetch user by slug if it's not the current user
    const {data: fetchedUserData} = useGetUserBySlug(
        params?.slug || '',
        {enabled: !isCurrentUser && !!params?.slug}
    );

    // Use current user data or fetched user data
    const user = isCurrentUser ? currentUser : fetchedUserData?.users?.[0];

    if (user) {
        return <UserDetailModalContent user={user} />;
    } else {
        return null;
    }
};

export default NiceModal.create(UserDetailModal);