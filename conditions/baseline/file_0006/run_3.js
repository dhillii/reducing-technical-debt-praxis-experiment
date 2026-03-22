I'll refactor this code to reduce complexity by:

1. Extracting the social URL validators into a reusable factory function
2. Splitting large components into smaller, focused ones
3. Extracting hooks and handlers into custom hooks
4. Simplifying conditional logic

```typescript
// validators.ts
import validator from 'validator';
import { type User } from '@tryghost/admin-x-framework/api/users';
import { type ErrorMessages } from '@tryghost/admin-x-framework/hooks';
import {
    validateBlueskyUrl,
    validateFacebookUrl,
    validateInstagramUrl,
    validateLinkedInUrl,
    validateMastodonUrl,
    validateThreadsUrl,
    validateTikTokUrl,
    validateTwitterUrl,
    validateYouTubeUrl,
} from '../../../utils/social-urls/index';

type UserValidator = (u: Partial<User>) => string;

const createSocialValidator = (
    field: keyof User,
    validateFn: (url: string) => void
): UserValidator =>
    (user) => {
        try {
            validateFn((user[field] as string) || '');
            return '';
        } catch (e) {
            return e instanceof Error ? e.message : '';
        }
    };

export const validators: Record<string, UserValidator> = {
    name: ({ name }) => {
        if (!name) return 'Name is required';
        if (name.length > 191) return 'Name is too long';
        return '';
    },
    email: ({ email }) =>
        validator.isEmail(email || '') ? '' : 'Enter a valid email address',
    url: ({ url }) =>
        !url || validator.isURL(url, { require_tld: false })
            ? ''
            : 'Enter a valid URL',
    bio: ({ bio }) =>
        !bio || bio.length <= 250 ? '' : 'Bio is too long',
    location: ({ location }) =>
        !location || location.length <= 150 ? '' : 'Location is too long',
    website: ({ website }) =>
        !website || (validator.isURL(website) && website.length <= 2000)
            ? ''
            : 'Enter a valid URL',
    facebook: createSocialValidator('facebook', validateFacebookUrl),
    twitter: createSocialValidator('twitter', validateTwitterUrl),
    threads: createSocialValidator('threads', validateThreadsUrl),
    bluesky: createSocialValidator('bluesky', validateBlueskyUrl),
    linkedin: createSocialValidator('linkedin', validateLinkedInUrl),
    instagram: createSocialValidator('instagram', validateInstagramUrl),
    youtube: createSocialValidator('youtube', validateYouTubeUrl),
    tiktok: createSocialValidator('tiktok', validateTikTokUrl),
    mastodon: createSocialValidator('mastodon', validateMastodonUrl),
};

export const validateAll = (values: Partial<User>): ErrorMessages =>
    Object.entries(validators).reduce<ErrorMessages>((acc, [key, validate]) => {
        const error = validate(values);
        if (error) acc[key] = error;
        return acc;
    }, {});
```

```typescript
// hooks/useUserDetailForm.ts
import { useCallback } from 'react';
import { type User } from '@tryghost/admin-x-framework/api/users';
import { type ErrorMessages, useForm, useHandleError } from '@tryghost/admin-x-framework/hooks';
import { validators, validateAll } from '../validators';

export const useUserDetailForm = (user: User, updateUser: (values: User) => Promise<void>) => {
    const handleError = useHandleError();

    const form = useForm({
        initialState: user,
        savingDelay: 500,
        savedDelay: 500,
        onValidate: validateAll,
        onSave: async (values) => { await updateUser(values); },
        onSaveError: handleError,
    });

    const { errors, setErrors, clearError, updateForm } = form;

    const setUserData = useCallback(
        (newData: User) => updateForm(() => newData),
        [updateForm]
    );

    const validateField = useCallback(
        <K extends keyof User>(key: K, value: User[K]): boolean => {
            const error = validators[key]?.({ [key]: value });
            if (error) {
                setErrors((prev: ErrorMessages) => ({ ...prev, [key]: error }));
                return false;
            }
            clearError(key);
            return true;
        },
        [errors, setErrors, clearError]
    );

    return { ...form, setUserData, validateField, handleError };
};
```

```typescript
// hooks/useUserActions.ts
import NiceModal from '@ebay/nice-modal-react';
import { useCallback } from 'react';
import { ConfirmationModal, LimitModal, showToast } from '@tryghost/admin-x-design-system';
import { type User, canAccessSettings } from '@tryghost/admin-x-framework/api/users';
import { useRouting } from '@tryghost/admin-x-framework/routing';
import { HostLimitError, useLimiter } from '../../../hooks/use-limiter';
import { useGlobalData } from '../../providers/global-data-provider';

interface UseUserActionsProps {
    user: User;
    updateUser: (user: User) => Promise<void>;
    deleteUser: (id: string) => Promise<void>;
    makeOwner: (id: string) => Promise<void>;
    setFormState: (updater: (state: User) => User) => void;
    onModalRemove: () => void;
    handleError: (e: unknown) => void;
}

export const useUserActions = ({
    user,
    updateUser,
    deleteUser,
    makeOwner,
    setFormState,
    onModalRemove,
    handleError,
}: UseUserActionsProps) => {
    const { updateRoute } = useRouting();
    const { currentUser } = useGlobalData();
    const limiter = useLimiter();

    const navigateOnClose = useCallback(() => {
        if (canAccessSettings(currentUser)) {
            updateRoute('staff');
        } else {
            updateRoute({ isExternal: true, route: '' });
        }
    }, [currentUser, updateRoute]);

    const confirmSuspend = useCallback(async (_user: User) => {
        const isReactivating = _user.status === 'inactive';

        if (isReactivating && _user.roles[0].name !== 'Contributor') {
            try {
                await limiter?.errorIfWouldGoOverLimit('staff');
            } catch (error) {
                if (error instanceof HostLimitError) {
                    NiceModal.show(LimitModal, {
                        formSheet: true,
                        prompt: error.message || `Your current plan doesn't support more users.`,
                        onOk: () => updateRoute({ route: '/pro', isExternal: true }),
                    });
                    return;
                }
                throw error;
            }
        }

        const warningText = isReactivating
            ? 'This user will be able to log in again and will have the same permissions they had previously.'
            : 'This user will no longer be able to log in but their posts will be kept.';

        NiceModal.show(ConfirmationModal, {
            title: 'Are you sure you want to suspend this user?',
            prompt: <><strong>WARNING:</strong> {warningText}</>,
            okLabel: isReactivating ? 'Un-suspend' : 'Suspend',
            okRunningLabel: isReactivating ? 'Un-suspending...' : 'Suspending...',
            okColor: 'red',
            onOk: async (modal) => {
                const updatedUserData = {
                    ..._user,
                    status: isReactivating ? 'active' : 'inactive',
                };
                try {
                    await updateUser(updatedUserData);
                    setFormState(() => updatedUserData);
                    modal?.remove();
                    showToast({
                        title: isReactivating ? 'User un-suspended' : 'User suspended',
                        type: 'success',
                    });
                } catch (e) {
                    handleError(e);
                }
            },
        });
    }, [limiter, updateRoute, updateUser, setFormState, handleError]);

    const confirmDelete = useCallback((_user: User, { owner }: { owner: User }) => {
        NiceModal.show(ConfirmationModal, {
            title: 'Are you sure you want to delete this user?',
            prompt: (
                <>
                    <p className='mb-3'>
                        <span className='font-bold'>{_user.name || _user.email}</span>
                        {' '}will be permanently deleted and all their posts will be automatically assigned to the{' '}
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
                    onModalRemove();
                    navigateOnClose();
                    showToast({ title: 'User deleted', type: 'success' });
                } catch (e) {
                    handleError(e);
                }
            },
        });
    }, [user.slug, deleteUser, onModalRemove, navigateOnClose, handleError]);

    const confirmMakeOwner = useCallback(() => {
        NiceModal.show(ConfirmationModal, {
            title: 'Transfer Ownership',
            prompt: 'Are you sure you want to transfer the ownership of this blog? You will not be able to undo this action.',
            okLabel: "Yep — I'm sure",
            okColor: 'red',
            onOk: async (modal) => {
                try {
                    await makeOwner(user.id);
                    modal?.remove();
                    showToast({ title: 'Ownership transferred', type: 'success' });
                } catch (e) {
                    handleError(e);
                }
            },
        });
    }, [user.id, makeOwner, handleError]);

    return { navigateOnClose, confirmSuspend, confirmDelete, confirmMakeOwner };
};
```

```typescript
// hooks/useImageHandlers.ts
import { useCallback } from 'react';
import { APIError } from '@tryghost/admin-x-framework/errors';
import { getImageUrl, useUploadImage } from '@tryghost/admin-x-framework/api/images';
import { type User } from '@tryghost/admin-x-framework/api/users';

type ImageField = 'cover_image' | 'profile_image';

interface UseImageHandlersProps {
    updateForm: (updater: (user: User) => User) => void;
    handleError: (e: unknown) => void;
}

export const useImageHandlers = ({ updateForm, handleError }: UseImageHandlersProps) => {
    const { mutateAsync: uploadImage } = useUploadImage();

    const handleImageUpload = useCallback(async (image: ImageField, file: File) => {
        try {
            const imageUrl = getImageUrl(await uploadImage({ file }));
            updateForm((_user) => ({ ..._user, [image]: imageUrl }));
        } catch (e) {
            const error = e as APIError;
            if (error.response?.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    }, [uploadImage, updateForm, handleError]);

    const handleImageDelete = useCallback((image: ImageField) => {
        updateForm((_user) => ({ ..._user, [image]: '' }));
    }, [updateForm]);

    return { handleImageUpload, handleImageDelete };
};
```

```typescript
// hooks/useMenuItems.ts
import { type MenuItem } from '@tryghost/admin-x-design-system';
import { type User, hasAdminAccess, isAdminUser, isAuthorOrContributor, isEditorUser, isOwnerUser } from '@tryghost/admin-x-framework/api/users';
import { useRouting } from '@tryghost/admin-x-framework/routing';
import useStaffUsers from '../../../hooks/use-staff-users';
import { useGlobalData } from '../../providers/global-data-provider';

interface UseMenuItemsProps {
    user: User;
    formState: User;
    onModalRemove: () => void;
    confirmMakeOwner: () => void;
    confirmDelete: (user: User, options: { owner: User }) => void;
    confirmSuspend: (user: User) => void;
}

export const useMenuItems = ({
    user,
    formState,
    onModalRemove,
    confirmMakeOwner,
    confirmDelete,
    confirmSuspend,
}: UseMenuItemsProps) => {
    const { currentUser } = useGlobalData();
    const { ownerUser } = useStaffUsers();
    const { updateRoute } = useRouting();

    const showMenu =
        hasAdminAccess(currentUser) ||
        (isEditorUser(currentUser) && isAuthorOrContributor(user));

    const menuItems: MenuItem[] = [];

    if (isOwnerUser(currentUser) && isAdminUser(formState) && formState.status !== 'inactive') {
        menuItems.push({
            id: 'make-owner',
            label: 'Make owner',
            onClick: confirmMakeOwner,
        });
    }

    const canManageUser =
        formState.id !== currentUser.id &&
        ((hasAdminAccess(currentUser) && !isOwnerUser(user)) ||
            (isEditorUser(currentUser) && isAuthorOrContributor(user)));

    if (canManageUser) {
        menuItems.push(
            {
                id: 'delete-user',
                label: 'Delete user',
                onClick: () => confirmDelete(user, { owner: ownerUser }),
            },
            {
                id: 'suspend-user',
                label: formState.status === 'inactive' ? 'Un-suspend user' : 'Suspend user',
                onClick: () => confirmSuspend(formState),
            }
        );
    }

    menuItems.push({
        id: 'view-user-activity',
        label: 'View user activity',
        onClick: () => {
            onModalRemove();
            updateRoute(`history/view/${formState.id}`);
        },
    });

    return { showMenu, menuItems };
};
```

```typescript
// components/UserCoverImage.tsx
import React from 'react';
import clsx from 'clsx';
import { Icon, ImageUpload, Menu, type MenuItem } from '@tryghost/admin-x-design-system';
import { type User } from '@tryghost/admin-x-framework/api/users';
import usePinturaEditor from '../../../hooks/use-pintura-editor';

const COVER_BUTTON_CLASSES =
    'flex flex-nowrap items-center justify-center px-3 h-8 opacity-80 hover:opacity-100 bg-[rgba(0,0,0,0.75)] rounded text-sm text-white transition-all cursor-pointer font-medium nowrap';

const NO_COVER_BUTTON_CLASSES =
    'rounded text-sm flex flex-nowrap items-center justify-center px-3 h-8 transition-all cursor-pointer font-medium border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white';

interface UserCoverImageProps {
    formState: User;
    showMenu: boolean;
    menuItems: MenuItem[];
    onUpload: (file: File) => void;
    onDelete: () => void;
}

export const UserCoverImage: React.FC<UserCoverImageProps> = ({
    formState,
    showMenu,
    menuItems,
    onUpload,
    onDelete,
}) => {
    const editor = usePinturaEditor();
    const hasCoverImage = !!formState.cover_image;

    return (
        <div className='flex flex-nowrap items-start gap-3'>
            <ImageUpload
                buttonContainerClassName='flex items-end gap-4 justify-end flex-nowrap'
                deleteButtonClassName={COVER_BUTTON_CLASSES}
                deleteButtonContent='Delete cover image'
                editButtonClassName={COVER_BUTTON_CLASSES}
                fileUploadClassName={NO_COVER_BUTTON_CLASSES}
                id='cover-image'
                imageClassName='hidden'
                imageURL={formState.cover_image || ''}
                pintura={{
                    isEnabled: editor.isEnabled,
                    openEditor: async () =>
                        editor.openEditor({
                            image: formState.cover_image || '',
                            handleSave: async (file: File) => onUpload(file),
                        }),
                }}
                unstyled
                onDelete={onDelete}
                onUpload={onUpload}
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
                        }
                    />
                </div>
            )}
        </div>
    );
};
```

```typescript
// components/UserAvatar.tsx
import React from 'react';
import { Icon, ImageUpload } from '@tryghost/admin-x-design-system';
import { type User } from '@tryghost/admin-x-framework/api/users';
import usePinturaEditor from '../../../hooks/use-pintura-editor';

interface UserAvatarProps {
    formState: User;
    onUpload: (file: File) => void;
    onDelete: () => void;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ formState, onUpload, onDelete }) => {
    const editor = usePinturaEditor();

    return (
        <ImageUpload
            deleteButtonClassName='md:invisible absolute pr-3 -right-2 -top-2 flex h-8 w-10 cursor-pointer items-center justify-end rounded-full bg-[rgba(0,0,0,0.75)] text-white group-hover:!visible'
            deleteButtonContent={<Icon colorClass='text-white' name='trash' size='sm' />}
            editButtonClassName='md:invisible absolute right-[22px] -top-2 flex h-8 w-8 cursor-pointer items-center justify-center text-white group-hover:!visible z-20'
            fileUploadClassName='rounded-full bg-black flex items-center justify-center opacity-80 transition hover:opacity-100 -ml-2 cursor-pointer h-[80px] w-[80px]'
            fileUploadProps={{ dragIndicatorClassName: 'rounded-full' }}
            id='avatar'
            imageClassName='w-full h-full object-cover rounded-full shrink-0'
            imageContainerClassName='relative group bg-cover bg-center -ml-1 h-16 w-16 md:h-18 md:w-18 shrink-0'
            imageURL={formState.profile_image ?? undefined}
            pintura={{
                isEnabled: editor.isEnabled,
                openEditor: async () =>
                    editor.openEditor({
                        image: formState.profile_image || '',
                        handleSave: async (file: File) => onUpload(file),
                    }),
            }}
            unstyled={true}
            width='80px'
            onDelete={onDelete}
            onUpload={onUpload}
        >
            <Icon colorClass='black' name='user-add' size='lg' />
        </ImageUpload>
    );
};
```

```typescript
// components/UserHeader.tsx
import React from 'react';
import clsx from 'clsx';
import { Heading } from '@tryghost/admin-x-design-system';
import { type User, canAccessSettings } from '@tryghost/admin-x-framework/api/users';
import { type MenuItem } from '@tryghost/admin-x-design-system';
import { useGlobalData } from '../../providers/global-data-provider';
import { UserAvatar } from './UserAvatar';
import { UserCoverImage } from './UserCoverImage';

interface UserHeaderProps {
    user: User;
    formState: User;
    showMenu: boolean;
    menuItems: MenuItem[];
    onImageUpload: (image: 'cover_image' | 'profile_image', file: File) => void;
    onImageDelete: (image: 'cover_image' | 'profile_image') => void;
}

export const UserHeader: React.FC<UserHeaderProps> = ({
    user,
    formState,
    showMenu,
    menuItems,
    onImageUpload,
    onImageDelete,
}) => {
    const { currentUser } = useGlobalData();
    const canAccess = canAccessSettings(currentUser);
    const suspendedText = formState.status === 'inactive' ? ' (Suspended)' : '';

    return (
        <div className={`relative ${canAccess ? '-mx-8 -mt-8 rounded-t' : '-mx-10 -mt-10'}`}>
            <div
                className={clsx(
                    'flex flex-wrap items-end justify-between gap-8 p-8',
                    formState.cover_image && 'bg-cover bg-center',
                    !canAccess && 'min-h-[30vmin]'
                )}
                style={{
                    backgroundImage: formState.cover_image
                        ? `url(${formState.cover_image})`
                        : 'none',
                }}
            >
                <div className='flex w-full flex-col gap-2'>
                    <div className='flex flex-nowrap items-start justify-between gap-3'>
                        <UserAvatar
                            formState={formState}
                            onDelete={() => onImageDelete('profile_image')}
                            onUpload={(file) => onImageUpload('profile_image', file)}
                        />
                        <UserCoverImage
                            formState={formState}
                            menuItems={menuItems}
                            showMenu={showMenu}
                            onDelete={() => onImageDelete('cover_image')}
                            onUpload={(file) => onImageUpload('cover_image', file)}
                        />
                    </div>
                    <div>
                        <Heading
                            level={3}
                            styles={clsx(
                                'break-words md:break-normal',
                                formState.cover_image ? 'text-white' : 'text-black dark:text-white'
                            )}
                        >
                            {user.name}{suspendedText}
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
    );
};
```

```typescript
// UserDetailModal.tsx (main file - refactored)
import EmailNotificationsTab from './users/email-notifications-tab';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import ProfileTab from './users/profile-tab';
import React, { useState } from 'react';
import SocialLinksTab from './users/social-links-tab';
import { Modal, TabView } from '@tryghost/admin-x-design-system';
import { type RoutingModalProps, useRouting } from '@tryghost/admin-x-framework/routing';
import { type User, canAccessSettings, useDeleteUser, useEditUser, useGetUserBySlug, useMakeOwner } from '@tryghost/admin-x-framework/api/users';
import { useGlobalData } from '../../providers/global-data-provider';
import { useUserDetailForm } from './hooks/useUserDetailForm';
import { useUserActions } from './hooks/useUserActions';
import { useImageHandlers } from './hooks/useImageHandlers';
import { useMenuItems } from './hooks/useMenuItems';
import { UserHeader } from './components/UserHeader';

export interface UserDetailProps {
    user: User;
    setUserData: (user: User) => void;
    errors: { [key in keyof User]?: string };
    validateField: <K extends keyof User>(key: K, value: User[K]) => boolean;
    clearError: (key: keyof User) => void;
}

const TAB_PATH_MAP: Record<string, string> = {
    'social-links': 'social-links',
    'email-notifications': 'email-notifications',
};

const getTabFromPath = (path: string): string => {
    const lastSegment = path.split('/').pop() || '';
    return TAB_PATH_MAP[lastSegment] ?? 'profile';
};

const UserDetailModalContent: React.FC<{ user: User }> = ({ user }) => {
    const { updateRoute, route } = useRouting();
    const { currentUser } = useGlobalData();
    const mainModal = useModal();

    const { mutateAsync: updateUser } = useEditUser();
    const { mutateAsync: deleteUser } = useDeleteUser();
    const { mutateAsync: makeOwner } = useMakeOwner();

    const {
        formState,
        setFormState,
        saveState,
        handleSave,
        updateForm,
        errors,
        clearError,
        okProps,
        setUserData,
        validateField,
        handleError,
    } = useUserDetailForm(user, updateUser);

    const { navigateOnClose, confirmSuspend, confirmDelete, confirmMakeOwner } = useUserActions({
        user,
        updateUser,
        deleteUser,
        makeOwner,
        setFormState,
        onModalRemove: () => mainModal.remove(),
        handleError,
    });

    const { handleImageUpload, handleImageDelete } = useImageHandlers({
        updateForm,
        handleError,
    });

    const { showMenu, menuItems } = useMenuItems({
        user,
        formState,
        onModalRemove: () => mainModal.remove(),
        confirmMakeOwner,
        confirmDelete,
        confirmSuspend,
    });

    const [selectedTab, setSelectedTab] = useState<string>(getTabFromPath(route));

    const handleTabChange = (newTabId: string) => {
        const urlSegment = newTabId === 'profile' ? '' : `/${newTabId}`;
        updateRoute(`staff/${user.slug}${urlSegment}`);
        setSelectedTab(newTabId);
    };

    const canAccess = canAccessSettings(currentUser);
    const tabProps = { clearError, errors, setUserData, user: formState, validateField };

    const tabs = [
        {
            id: 'profile',
            title: 'Profile',
            contents: <ProfileTab {...tabProps} />,
        },
        {
            id: 'social-links',
            title: 'Social Links',
            contents: <SocialLinksTab {...tabProps} />,
        },
        {
            id: 'email-notifications',
            title: 'Email Notifications',
            contents: <EmailNotificationsTab setUserData={setUserData} user={formState} />,
        },
    ];

    return (
        <Modal
            afterClose={navigateOnClose}
            animate={canAccess}
            backDrop={canAccess}
            buttonsDisabled={okProps.disabled}
            cancelLabel='Close'
            dirty={saveState === 'unsaved'}
            okColor={okProps.color}
            okLabel={okProps.label || 'Save'}
            size={canAccess ? 'md' : 'bleed'}
            stickyFooter={true}
            testId='user-detail-modal'
            width={canAccess ? 600 : 'full'}
            onOk={async () => { await handleSave({ fakeWhenUnchanged: true }); }}
        >
            <div>
                <UserHeader
                    formState={formState}
                    menuItems={menuItems}
                    showMenu={showMenu}
                    user={user}
                    onImageDelete={handleImageDelete}
                    onImageUpload={handleImageUpload}
                />
                <div className={`${!canAccess && 'mx-auto max-w-[536px]'} mt-6 flex flex-col`}>
                    <TabView
                        selectedTab={selectedTab}
                        tabs={tabs}
                        onTabChange={handleTabChange}
                    />
                </div>
            </div>
        </Modal>
    );
};

const UserDetailModal: React.FC<RoutingModalProps> = ({ params }) => {
    const { currentUser } = useGlobalData();
    const isCurrentUser = currentUser.slug === params?.slug;

    const { data: fetchedUserData } = useGetUserBySlug(params?.slug || '', {
        enabled: !isCurrentUser && !!params?.slug,
    });

    const user = isCurrentUser ? currentUser : fetchedUserData?.users?.[0];

    return user ? <UserDetailModalContent user={user} /> : null;
};

export default NiceModal.create(UserDetailModal);
```

## Key Refactoring Decisions

### 1. **Validator Factory Function** (`createSocialValidator`)
Eliminated 9 near-identical social URL validator blocks by creating a factory function, reducing ~90 lines to a single reusable pattern.

### 2. **Custom Hooks Extraction**
- **`useUserDetailForm`** — Encapsulates form state, validation, and field-level error handling
- **`useUserActions`** — Isolates all confirmation modals and async user operations (suspend/delete/transfer)
- **`useImageHandlers`** — Handles image upload/delete logic with error normalization
- **`useMenuItems`** — Derives menu visibility and items from user roles/permissions

### 3. **Component Decomposition**
- **`UserAvatar`** — Profile image upload with Pintura integration
- **`UserCoverImage`** — Cover image upload + actions menu
- **`UserHeader`** — Composes avatar, cover, and user info display

### 4. **Simplified Conditionals**
- Replaced repeated `_user.status === 'inactive'` ternaries with an `isReactivating` boolean
- Extracted `canAccess` and `canManageUser` variables to reduce repeated expressions
- Used a `TAB_PATH_MAP` lookup instead of chained conditionals

### 5. **Shared Tab Props**
Extracted `tabProps` object to avoid repeating the same five props across three tab components.