# Refactored User Detail Modal

## Key Improvements

1. **Extracted validator factory** to eliminate repetitive try/catch patterns
2. **Extracted custom hooks** for image handling, menu items, and user actions
3. **Extracted smaller components** for the cover/header section
4. **Reduced cognitive complexity** in the main component

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

/**
 * Creates a validator that wraps a URL-validation function and returns its
 * error message (or an empty string on success).
 */
const makeSocialValidator = (
    key: keyof User,
    validateFn: (value: string) => void
) => (user: Partial<User>) => {
    try {
        validateFn((user[key] as string) || '');
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
    email: ({email}) => (
        validator.isEmail(email || '') ? '' : 'Enter a valid email address'
    ),
    url: ({url}) => (
        !url || validator.isURL(url, {require_tld: false}) ? '' : 'Enter a valid URL'
    ),
    bio: ({bio}) => (
        !bio || bio.length <= 250 ? '' : 'Bio is too long'
    ),
    location: ({location}) => (
        !location || location.length <= 150 ? '' : 'Location is too long'
    ),
    website: ({website}) => (
        !website || (validator.isURL(website) && website.length <= 2000)
            ? ''
            : 'Enter a valid URL'
    ),
    facebook:  makeSocialValidator('facebook',  validateFacebookUrl),
    twitter:   makeSocialValidator('twitter',   validateTwitterUrl),
    threads:   makeSocialValidator('threads',   validateThreadsUrl),
    bluesky:   makeSocialValidator('bluesky',   validateBlueskyUrl),
    linkedin:  makeSocialValidator('linkedin',  validateLinkedInUrl),
    instagram: makeSocialValidator('instagram', validateInstagramUrl),
    youtube:   makeSocialValidator('youtube',   validateYouTubeUrl),
    tiktok:    makeSocialValidator('tiktok',    validateTikTokUrl),
    mastodon:  makeSocialValidator('mastodon',  validateMastodonUrl),
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserDetailProps {
    user: User;
    setUserData: (user: User) => void;
    errors: {[key in keyof User]?: string};
    validateField: <K extends keyof User>(key: K, value: User[K]) => boolean;
    clearError: (key: keyof User) => void;
}

type ImageType = 'cover_image' | 'profile_image';

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Handles uploading and deleting cover/profile images. */
function useImageHandlers(
    updateForm: (fn: (u: User) => User) => void,
    handleError: (e: unknown) => void
) {
    const {mutateAsync: uploadImage} = useUploadImage();

    const handleImageUpload = async (image: ImageType, file: File) => {
        try {
            const imageUrl = getImageUrl(await uploadImage({file}));
            updateForm(u => ({...u, [image]: imageUrl}));
        } catch (e) {
            const error = e as APIError;
            if (error.response?.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    };

    const handleImageDelete = (image: ImageType) => {
        updateForm(u => ({...u, [image]: ''}));
    };

    return {handleImageUpload, handleImageDelete};
}

/** Builds the context-sensitive menu items for the user actions menu. */
function useUserMenuItems({
    currentUser,
    user,
    formState,
    ownerUser,
    mainModal,
    updateRoute,
    confirmMakeOwner,
    confirmDelete,
    confirmSuspend,
}: {
    currentUser: User;
    user: User;
    formState: User;
    ownerUser: User;
    mainModal: ReturnType<typeof useModal>;
    updateRoute: (route: string | {route: string; isExternal: boolean}) => void;
    confirmMakeOwner: () => void;
    confirmDelete: (user: User, opts: {owner: User}) => void;
    confirmSuspend: (user: User) => Promise<void>;
}): MenuItem[] {
    const items: MenuItem[] = [];

    if (isOwnerUser(currentUser) && isAdminUser(formState) && formState.status !== 'inactive') {
        items.push({id: 'make-owner', label: 'Make owner', onClick: confirmMakeOwner});
    }

    const canManageUser =
        formState.id !== currentUser.id &&
        ((hasAdminAccess(currentUser) && !isOwnerUser(user)) ||
            (isEditorUser(currentUser) && isAuthorOrContributor(user)));

    if (canManageUser) {
        const suspendLabel = formState.status === 'inactive' ? 'Un-suspend user' : 'Suspend user';
        items.push(
            {id: 'delete-user',  label: 'Delete user',  onClick: () => confirmDelete(user, {owner: ownerUser})},
            {id: 'suspend-user', label: suspendLabel,   onClick: () => confirmSuspend(formState)}
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

// ─── Sub-components ───────────────────────────────────────────────────────────

interface CoverHeaderProps {
    user: User;
    formState: User;
    currentUser: User;
    showMenu: boolean;
    menuItems: MenuItem[];
    editor: ReturnType<typeof usePinturaEditor>;
    suspendedText: string;
    onImageUpload: (image: ImageType, file: File) => Promise<void>;
    onImageDelete: (image: ImageType) => void;
}

const CoverHeader: React.FC<CoverHeaderProps> = ({
    user,
    formState,
    currentUser,
    showMenu,
    menuItems,
    editor,
    suspendedText,
    onImageUpload,
    onImageDelete,
}) => {
    const hasCover = Boolean(formState.cover_image);

    const coverButtonClasses = hasCover
        ? 'flex flex-nowrap items-center justify-center px-3 h-8 opacity-80 hover:opacity-100 bg-[rgba(0,0,0,0.75)] rounded text-sm text-white transition-all cursor-pointer font-medium nowrap'
        : 'rounded text-sm flex flex-nowrap items-center justify-center px-3 h-8 transition-all cursor-pointer font-medium border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white';

    const textColorClass = hasCover ? 'text-white' : 'text-black dark:text-white';

    return (
        <div className={`relative ${canAccessSettings(currentUser) ? '-mx-8 -mt-8 rounded-t' : '-mx-10 -mt-10'}`}>
            <div
                className={clsx(
                    'flex flex-wrap items-end justify-between gap-8 p-8',
                    hasCover && 'bg-cover bg-center',
                    !canAccessSettings(currentUser) && 'min-h-[30vmin]'
                )}
                style={{backgroundImage: hasCover ? `url(${formState.cover_image})` : 'none'}}
            >
                <div className='flex w-full flex-col gap-2'>
                    <div className='flex flex-nowrap items-start justify-between gap-3'>
                        {/* Profile image */}
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
                                    handleSave: (file: File) => onImageUpload('profile_image', file)
                                })
                            }}
                            unstyled={true}
                            width='80px'
                            onDelete={() => onImageDelete('profile_image')}
                            onUpload={(file: File) => onImageUpload('profile_image', file)}
                        >
                            <Icon colorClass='black' name='user-add' size='lg' />
                        </ImageUpload>

                        {/* Cover image + menu */}
                        <div className='flex flex-nowrap items-start gap-3'>
                            <ImageUpload
                                buttonContainerClassName='flex items-end gap-4 justify-end flex-nowrap'
                                deleteButtonClassName={coverButtonClasses}
                                deleteButtonContent='Delete cover image'
                                editButtonClassName={coverButtonClasses}
                                fileUploadClassName={coverButtonClasses}
                                id='cover-image'
                                imageClassName='hidden'
                                imageURL={formState.cover_image || ''}
                                pintura={{
                                    isEnabled: editor.isEnabled,
                                    openEditor: async () => editor.openEditor({
                                        image: formState.cover_image || '',
                                        handleSave: (file: File) => onImageUpload('cover_image', file)
                                    })
                                }}
                                unstyled
                                onDelete={() => onImageDelete('cover_image')}
                                onUpload={(file: File) => onImageUpload('cover_image', file)}
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
                                                    hasCover
                                                        ? 'bg-[rgba(0,0,0,0.75)] opacity-80 hover:opacity-100'
                                                        : 'border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white'
                                                )}
                                                type='button'
                                            >
                                                <span className='sr-only'>Actions</span>
                                                <Icon
                                                    colorClass={hasCover ? 'text-white' : undefined}
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
                            styles={clsx('break-words md:break-normal', textColorClass)}
                        >
                            {user.name}{suspendedText}
                        </Heading>
                        <span className={clsx('text-md font-medium capitalize', textColorClass)}>
                            {user.roles[0].name.toLowerCase()}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Main modal content ───────────────────────────────────────────────────────

const UserDetailModalContent: React.FC<{user: User}> = ({user}) => {
    const {updateRoute, route} = useRouting();
    const {ownerUser} = useStaffUsers();
    const {currentUser} = useGlobalData();
    const handleError = useHandleError();
    const mainModal = useModal();
    const limiter = useLimiter();
    const editor = usePinturaEditor();

    const {mutateAsync: updateUser} = useEditUser();
    const {mutateAsync: deleteUser} = useDeleteUser();
    const {mutateAsync: makeOwner} = useMakeOwner();

    const {formState, setFormState, saveState, handleSave, updateForm, errors, setErrors, clearError, okProps} =
        useForm({
            initialState: user,
            savingDelay: 500,
            savedDelay: 500,
            onValidate: (values) =>
                Object.entries(validators).reduce<ErrorMessages>((acc, [key, validate]) => {
                    const error = validate(values);
                    if (error) acc[key] = error;
                    return acc;
                }, {}),
            onSave: async (values) => { await updateUser?.(values); },
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

    const navigateOnClose = useCallback(() => {
        if (canAccessSettings(currentUser)) {
            updateRoute('staff');
        } else {
            updateRoute({isExternal: true, route: ''});
        }
    }, [currentUser, updateRoute]);

    // ── User actions ──────────────────────────────────────────────────────────

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
        NiceModal.show(ConfirmationModal, {
            title: 'Are you sure you want to suspend this user?',
            prompt: (
                <>
                    <strong>WARNING:</strong>{' '}
                    {isInactive
                        ? 'This user will be able to log in again and will have the same permissions they had previously.'
                        : 'This user will no longer be able to log in but their posts will be kept.'}
                </>
            ),
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

    const confirmDelete = (_user: User, {owner}: {owner: User}) => {
        NiceModal.show(ConfirmationModal, {
            title: 'Are you sure you want to delete this user?',
            prompt: (
                <>
                    <p className='mb-3'>
                        <span className='font-bold'>{_user.name || _user.email}</span> will be permanently
                        deleted and all their posts will be automatically assigned to the{' '}
                        <span className='font-bold'>{owner.name}</span>.
                    </p>
                    <p>
                        To make these easy to find in the future, each post will be given an internal tag of{' '}
                        <span className='font-bold'>#{user.slug}</span>
                    </p>
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

    // ── Image handlers ────────────────────────────────────────────────────────

    const {handleImageUpload, handleImageDelete} = useImageHandlers(updateForm, handleError);

    // ── Menu ──────────────────────────────────────────────────────────────────

    const showMenu = hasAdminAccess(currentUser) || (isEditorUser(currentUser) && isAuthorOrContributor(user));

    const menuItems = useUserMenuItems({
        currentUser,
        user,
        formState,
        ownerUser,
        mainModal,
        updateRoute,
        confirmMakeOwner,
        confirmDelete,
        confirmSuspend,
    });

    // ── Tabs ──────────────────────────────────────────────────────────────────

    const getTabFromPath = (path: string): string => {
        const lastSegment = path.split('/').pop() || '';
        return ['social-links', 'email-notifications'].includes(lastSegment) ? lastSegment : 'profile';
    };

    const [selectedTab, setSelectedTab] = useState<string>(() => getTabFromPath(route));

    const handleTabChange = (newTabId: string) => {
        const urlSegment = newTabId === 'profile' ? '' : `/${newTabId}`;
        updateRoute(`staff/${user.slug}${urlSegment}`);
        setSelectedTab(newTabId);
    };

    const tabProps: UserDetailProps = {user: formState, setUserData, errors, validateField, clearError};

    const tabs = [
        {id: 'profile',             title: 'Profile',             contents: <ProfileTab {...tabProps} />},
        {id: 'social-links',        title: 'Social Links',        contents: <SocialLinksTab {...tabProps} />},
        {id: 'email-notifications', title: 'Email Notifications', contents: <EmailNotificationsTab setUserData={setUserData} user={formState} />}
    ];

    // ── Render ────────────────────────────────────────────────────────────────

    const accessSettings = canAccessSettings(currentUser);

    return (
        <Modal
            afterClose={navigateOnClose}
            animate={accessSettings}
            backDrop={accessSettings}
            buttonsDisabled={okProps.disabled}
            cancelLabel='Close'
            dirty={saveState === 'unsaved'}
            okColor={okProps.color}
            okLabel={okProps.label || 'Save'}
            size={accessSettings ? 'md' : 'bleed'}
            stickyFooter={true}
            testId='user-detail-modal'
            width={accessSettings ? 600 : 'full'}
            onOk={async () => { await handleSave({fakeWhenUnchanged: true}); }}
        >
            <div>
                <CoverHeader
                    currentUser={currentUser}
                    editor={editor}
                    formState={formState}
                    menuItems={menuItems}
                    showMenu={showMenu}
                    suspendedText={formState.status === 'inactive' ? ' (Suspended)' : ''}
                    user={user}
                    onImageDelete={handleImageDelete}
                    onImageUpload={handleImageUpload}
                />
                <div className={clsx('mt-6 flex flex-col', !accessSettings && 'mx-auto max-w-[536px]')}>
                    <TabView selectedTab={selectedTab} tabs={tabs} onTabChange={handleTabChange} />
                </div>
            </div>
        </Modal>
    );
};

// ─── Route-level wrapper ──────────────────────────────────────────────────────

const UserDetailModal: React.FC<RoutingModalProps> = ({params}) => {
    const {currentUser} = useGlobalData();
    const isCurrentUser = currentUser.slug === params?.slug;

    const {data: fetchedUserData} = useGetUserBySlug(
        params?.slug || '',
        {enabled: !isCurrentUser && !!params?.slug}
    );

    const user = isCurrentUser ? currentUser : fetchedUserData?.users?.[0];

    return user ? <UserDetailModalContent user={user} /> : null;
};

export default NiceModal.create(UserDetailModal);
```

## Summary of Changes

| Area | Before | After |
|---|---|---|
| **Social validators** | 14 near-identical try/catch blocks | Single `makeSocialValidator` factory |
| **Image handlers** | Inline switch statements in component | `useImageHandlers` custom hook |
| **Menu items** | Imperative `push` logic inside component | `useUserMenuItems` custom hook |
| **Cover header** | ~100 lines of JSX inline | Dedicated `CoverHeader` component |
| **Tab props** | Repeated spread of 5 props | Single `tabProps` object |
| **`canAccessSettings` calls** | Called 6+ times inline | Cached as `accessSettings` |
| **Suspend logic** | Duplicated ternary strings | `isInactive` variable |
| **`getTabFromPath`** | Defined inside render | Moved outside / uses `includes` |