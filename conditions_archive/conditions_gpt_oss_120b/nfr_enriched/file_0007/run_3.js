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
import {
    ConfirmationModal,
    Heading,
    Icon,
    ImageUpload,
    LimitModal,
    Menu,
    type MenuItem,
    Modal,
    TabView,
    showToast
} from '@tryghost/admin-x-design-system';
import {type ErrorMessages, useForm, useHandleError} from '@tryghost/admin-x-framework/hooks';
import {HostLimitError, useLimiter} from '../../../hooks/use-limiter';
import {type RoutingModalProps, useRouting} from '@tryghost/admin-x-framework/routing';
import {
    type User,
    canAccessSettings,
    hasAdminAccess,
    isAdminUser,
    isAuthorOrContributor,
    isEditorUser,
    isOwnerUser,
    useDeleteUser,
    useEditUser,
    useGetUserBySlug,
    useMakeOwner
} from '@tryghost/admin-x-framework/api/users';
import {getImageUrl, useUploadImage} from '@tryghost/admin-x-framework/api/images';
import {useGlobalData} from '../../providers/global-data-provider';
import {
    validateBlueskyUrl,
    validateFacebookUrl,
    validateInstagramUrl,
    validateLinkedInUrl,
    validateMastodonUrl,
    validateThreadsUrl,
    validateTikTokUrl,
    validateTwitterUrl,
    validateYouTubeUrl
} from '../../../utils/social-urls/index';

/* ---------- Validators ---------- */
const validators: Record<string, (u: Partial<User>) => string> = {
    name: ({name}) => (!name ? 'Name is required' : name.length > 191 ? 'Name is too long' : ''),
    email: ({email}) => (validator.isEmail(email || '') ? '' : 'Enter a valid email address'),
    url: ({url}) => (!url || validator.isURL(url, {require_tld: false}) ? '' : 'Enter a valid URL'),
    bio: ({bio}) => (!bio || bio.length <= 250 ? '' : 'Bio is too long'),
    location: ({location}) => (!location || location.length <= 150 ? '' : 'Location is too long'),
    website: ({website}) => (!website || (validator.isURL(website) && website.length <= 2000) ? '' : 'Enter a valid URL'),
    facebook: ({facebook}) => safeValidate(() => validateFacebookUrl(facebook || '')),
    twitter: ({twitter}) => safeValidate(() => validateTwitterUrl(twitter || '')),
    threads: ({threads}) => safeValidate(() => validateThreadsUrl(threads || '')),
    bluesky: ({bluesky}) => safeValidate(() => validateBlueskyUrl(bluesky || '')),
    linkedin: ({linkedin}) => safeValidate(() => validateLinkedInUrl(linkedin || '')),
    instagram: ({instagram}) => safeValidate(() => validateInstagramUrl(instagram || '')),
    youtube: ({youtube}) => safeValidate(() => validateYouTubeUrl(youtube || '')),
    tiktok: ({tiktok}) => safeValidate(() => validateTikTokUrl(tiktok || '')),
    mastodon: ({mastodon}) => safeValidate(() => validateMastodonUrl(mastodon || ''))
};

function safeValidate(fn: () => void): string {
    try {
        fn();
        return '';
    } catch (e) {
        return e instanceof Error ? e.message : '';
    }
}

/* ---------- Helper Functions ---------- */

/** Extract the tab identifier from the current route */
function getInitialTab(route: string): string {
    const last = route.split('/').pop() || '';
    return last === 'social-links' || last === 'email-notifications' ? last : 'profile';
}

/** Build the menu items based on user permissions and status */
function buildMenuItems(
    currentUser: User,
    formState: User,
    ownerUser: User,
    confirmSuspend: (user: User) => void,
    confirmDelete: (user: User, owner: User) => void,
    confirmMakeOwner: () => void,
    mainModal: ReturnType<typeof useModal>,
    updateRoute: (path: string) => void
): MenuItem[] {
    const items: MenuItem[] = [];

    if (isOwnerUser(currentUser) && isAdminUser(formState) && formState.status !== 'inactive') {
        items.push({id: 'make-owner', label: 'Make owner', onClick: confirmMakeOwner});
    }

    const canDeleteOrSuspend =
        formState.id !== currentUser.id &&
        ((hasAdminAccess(currentUser) && !isOwnerUser(formState)) ||
            (isEditorUser(currentUser) && isAuthorOrContributor(formState)));

    if (canDeleteOrSuspend) {
        const suspendLabel = formState.status === 'inactive' ? 'Un-suspend user' : 'Suspend user';
        items.push(
            {
                id: 'delete-user',
                label: 'Delete user',
                onClick: () => confirmDelete(formState, ownerUser)
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
}

/** Navigate back to the staff list after the modal closes */
function useNavigateOnClose(currentUser: User, updateRoute: (path: string) => void) {
    return useCallback(() => {
        if (canAccessSettings(currentUser)) {
            updateRoute('staff');
        } else {
            updateRoute({isExternal: true, route: ''});
        }
    }, [currentUser, updateRoute]);
}

/** Confirm suspension/unsuspension of a user */
function useConfirmSuspend(
    limiter: ReturnType<typeof useLimiter>,
    updateUser: (data: Partial<User>) => Promise<unknown>,
    setFormState: (updater: (prev: User) => User) => void,
    handleError: (e: unknown) => void,
    updateRoute: (path: string) => void
) {
    return useCallback(
        async (target: User) => {
            if (target.status === 'inactive' && target.roles[0].name !== 'Contributor') {
                try {
                    await limiter?.errorIfWouldGoOverLimit('staff');
                } catch (e) {
                    if (e instanceof HostLimitError) {
                        NiceModal.show(LimitModal, {
                            formSheet: true,
                            prompt: e.message || `Your current plan doesn't support more users.`,
                            onOk: () => updateRoute({route: '/pro', isExternal: true})
                        });
                        return;
                    }
                    throw e;
                }
            }

            const warning = target.status === 'inactive'
                ? 'This user will be able to log in again and will have the same permissions they had previously.'
                : 'This user will no longer be able to log in but their posts will be kept.';

            NiceModal.show(ConfirmationModal, {
                title: 'Are you sure you want to suspend this user?',
                prompt: (
                    <>
                        <strong>WARNING:</strong> {warning}
                    </>
                ),
                okLabel: target.status === 'inactive' ? 'Un-suspend' : 'Suspend',
                okRunningLabel: target.status === 'inactive' ? 'Un-suspending...' : 'Suspending...',
                okColor: 'red',
                onOk: async (modal) => {
                    const updated = {...target, status: target.status === 'inactive' ? 'active' : 'inactive'};
                    try {
                        await updateUser(updated);
                        setFormState(() => updated);
                        modal?.remove();
                        showToast({
                            title: target.status === 'inactive' ? 'User un-suspended' : 'User suspended',
                            type: 'success'
                        });
                    } catch (e) {
                        handleError(e);
                    }
                }
            });
        },
        [limiter, updateUser, setFormState, handleError, updateRoute]
    );
}

/** Confirm deletion of a user */
function useConfirmDelete(
    deleteUser: (id: string) => Promise<unknown>,
    mainModal: ReturnType<typeof useModal>,
    navigateOnClose: () => void,
    handleError: (e: unknown) => void
) {
    return useCallback(
        (target: User, owner: User) => {
            NiceModal.show(ConfirmationModal, {
                title: 'Are you sure you want to delete this user?',
                prompt: (
                    <>
                        <p className='mb-3'>
                            <span className='font-bold'>{target.name || target.email}</span> will be permanently
                            deleted and all their posts will be automatically assigned to the{' '}
                            <span className='font-bold'>{owner.name}</span>.
                        </p>
                        <p>
                            To make these easy to find in the future, each post will be given an internal tag of{' '}
                            <span className='font-bold'>#{target.slug}</span>
                        </p>
                    </>
                ),
                okLabel: 'Delete user',
                okColor: 'red',
                onOk: async (modal) => {
                    try {
                        await deleteUser(target.id);
                        modal?.remove();
                        mainModal?.remove();
                        navigateOnClose();
                        showToast({title: 'User deleted', type: 'success'});
                    } catch (e) {
                        handleError(e);
                    }
                }
            });
        },
        [deleteUser, mainModal, navigateOnClose, handleError]
    );
}

/** Confirm ownership transfer */
function useConfirmMakeOwner(makeOwner: (id: string) => Promise<unknown>, handleError: (e: unknown) => void) {
    return useCallback(() => {
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
    }, [makeOwner, handleError]);
}

/** Upload an image (profile or cover) */
function useHandleImageUpload(
    uploadImage: (payload: {file: File}) => Promise<unknown>,
    updateForm: (updater: (prev: User) => User) => void,
    handleError: (e: unknown) => void
) {
    return useCallback(
        async (type: 'cover_image' | 'profile_image', file: File) => {
            try {
                const imageUrl = getImageUrl(await uploadImage({file}));
                updateForm((prev) => ({...prev, [type]: imageUrl}));
            } catch (e) {
                const err = e as APIError;
                if (err.response?.status === 415) {
                    err.message = 'Unsupported file type';
                }
                handleError(err);
            }
        },
        [uploadImage, updateForm, handleError]
    );
}

/** Delete an image (profile or cover) */
function useHandleImageDelete(updateForm: (updater: (prev: User) => User) => void) {
    return useCallback((type: 'cover_image' | 'profile_image') => {
        updateForm((prev) => ({...prev, [type]: ''}));
    }, [updateForm]);
}

/* ---------- Component ---------- */

const UserDetailModalContent: React.FC<{user: User}> = ({user}) => {
    const {updateRoute, route} = useRouting();
    const {ownerUser} = useStaffUsers();
    const {currentUser} = useGlobalData();
    const handleError = useHandleError();

    const {
        formState,
        setFormState,
        saveState,
        handleSave,
        updateForm,
        errors,
        setErrors,
        clearError,
        okProps
    } = useForm({
        initialState: user,
        savingDelay: 500,
        savedDelay: 500,
        onValidate: (values) =>
            Object.entries(validators).reduce<ErrorMessages>((acc, [key, fn]) => {
                const err = fn(values);
                if (err) acc[key] = err;
                return acc;
            }, {}),
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
        }
        clearError(key);
        return true;
    };

    const mainModal = useModal();
    const {mutateAsync: uploadImage} = useUploadImage();
    const {mutateAsync: updateUser} = useEditUser();
    const {mutateAsync: deleteUser} = useDeleteUser();
    const {mutateAsync: makeOwner} = useMakeOwner();
    const limiter = useLimiter();
    const editor = usePinturaEditor();

    const navigateOnClose = useNavigateOnClose(currentUser, updateRoute);
    const confirmSuspend = useConfirmSuspend(limiter, updateUser, setFormState, handleError, updateRoute);
    const confirmDelete = useConfirmDelete(deleteUser, mainModal, navigateOnClose, handleError);
    const confirmMakeOwner = useConfirmMakeOwner(makeOwner, handleError);
    const handleImageUpload = useHandleImageUpload(uploadImage, updateForm, handleError);
    const handleImageDelete = useHandleImageDelete(updateForm);

    const initialTab = getInitialTab(route);
    const [selectedTab, setSelectedTab] = useState<string>(initialTab);

    const handleTabChange = useCallback(
        (newTabId: string) => {
            const segment = newTabId === 'profile' ? '' : `/${newTabId}`;
            updateRoute(`staff/${user.slug}${segment}`);
            setSelectedTab(newTabId);
        },
        [user.slug, updateRoute]
    );

    const showMenu = hasAdminAccess(currentUser) || (isEditorUser(currentUser) && isAuthorOrContributor(user));
    const menuItems = buildMenuItems(
        currentUser,
        formState,
        ownerUser,
        confirmSuspend,
        confirmDelete,
        confirmMakeOwner,
        mainModal,
        updateRoute
    );

    const noCoverButtonClasses =
        'rounded text-sm flex flex-nowrap items-center justify-center px-3 h-8 transition-all cursor-pointer font-medium border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white';
    const coverButtonClasses =
        'flex flex-nowrap items-center justify-center px-3 h-8 opacity-80 hover:opacity-100 bg-[rgba(0,0,0,0.75)] rounded text-sm text-white transition-all cursor-pointer font-medium nowrap';
    const suspendedText = formState.status === 'inactive' ? ' (Suspended)' : '';

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
                    <div
                        className={`flex flex-wrap items-end justify-between gap-8 p-8 ${formState.cover_image ? 'bg-cover bg-center' : ''} ${
                            !canAccessSettings(currentUser) && 'min-h-[30vmin]'
                        }`}
                        style={{
                            backgroundImage: formState.cover_image ? `url(${formState.cover_image})` : 'none'
                        }}
                    >
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
                                        pintura={{
                                            isEnabled: editor.isEnabled,
                                            openEditor: async () =>
                                                editor.openEditor({
                                                    image: formState.profile_image || '',
                                                    handleSave: async (file: File) => {
                                                        await handleImageUpload('profile_image', file);
                                                    }
                                                })
                                        }}
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
                                        pintura={{
                                            isEnabled: editor.isEnabled,
                                            openEditor: async () =>
                                                editor.openEditor({
                                                    image: formState.cover_image || '',
                                                    handleSave: async (file: File) => {
                                                        await handleImageUpload('cover_image', file);
                                                    }
                                                })
                                        }}
                                        unstyled
                                        onDelete={() => handleImageDelete('cover_image')}
                                        onUpload={(file: File) => handleImageUpload('cover_image', file)}
                                    >
                                        Upload cover image
                                    </ImageUpload>
                                    {showMenu && (
                                        <div className='z-10'>
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
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <Heading
                                    level={3}
                                    styles={clsx(
                                        'break-words md:break-normal',
                                        formState.cover_image ? 'text-white' : 'text-black dark:text-white'
                                    )}
                                >
                                    {user.name}
                                    {suspendedText}
                                </Heading>
                                <span
                                    className={clsx(
                                        'text-md font-medium capitalize',
                                        formState.cover_image ? 'text-white' : 'text-black dark:text-white'
                                    )}
                                >
                                    {user.roles[0].name.toLowerCase()}
                                </span>
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
                                contents: (
                                    <ProfileTab
                                        clearError={clearError}
                                        errors={errors}
                                        setUserData={setUserData}
                                        user={formState}
                                        validateField={validateField}
                                    />
                                )
                            },
                            {
                                id: 'social-links',
                                title: 'Social Links',
                                contents: (
                                    <SocialLinksTab
                                        clearError={clearError}
                                        errors={errors}
                                        setUserData={setUserData}
                                        user={formState}
                                        validateField={validateField}
                                    />
                                )
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
    const {data: fetchedUserData} = useGetUserBySlug(params?.slug || '', {
        enabled: !isCurrentUser && !!params?.slug
    });

    const user = isCurrentUser ? currentUser : fetchedUserData?.users?.[0];

    return user ? <UserDetailModalContent user={user} /> : null;
};

export default NiceModal.create(UserDetailModal);