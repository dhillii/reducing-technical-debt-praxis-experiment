I'll refactor this code to reduce complexity by:

1. Extracting the social URL validator factory function
2. Separating concerns into custom hooks
3. Simplifying the menu items logic
4. Extracting image handling logic
5. Reducing JSX complexity

```typescript
// validators.ts
import validator from 'validator';
import { type User } from '@tryghost/admin-x-framework/api/users';
import {
    validateBlueskyUrl, validateFacebookUrl, validateInstagramUrl,
    validateLinkedInUrl, validateMastodonUrl, validateThreadsUrl,
    validateTikTokUrl, validateTwitterUrl, validateYouTubeUrl
} from '../../../utils/social-urls/index';

type UserValidator = (u: Partial<User>) => string;

const createSocialValidator = (
    field: keyof User,
    validateFn: (url: string) => void
): UserValidator => (user) => {
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
        !url || validator.isURL(url, { require_tld: false }) ? '' : 'Enter a valid URL',
    bio: ({ bio }) =>
        !bio || bio.length <= 250 ? '' : 'Bio is too long',
    location: ({ location }) =>
        !location || location.length <= 150 ? '' : 'Location is too long',
    website: ({ website }) =>
        !website || (validator.isURL(website) && website.length <= 2000) ? '' : 'Enter a valid URL',
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
```

```typescript
// hooks/useUserDetailForm.ts
import { useCallback } from 'react';
import { type ErrorMessages, useForm, useHandleError } from '@tryghost/admin-x-framework/hooks';
import { type User, useEditUser } from '@tryghost/admin-x-framework/api/users';
import { validators } from '../validators';

export const useUserDetailForm = (user: User) => {
    const handleError = useHandleError();
    const { mutateAsync: updateUser } = useEditUser();

    const form = useForm({
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
        onSaveError: handleError,
    });

    const setUserData = useCallback(
        (newData: User) => form.updateForm(() => newData),
        [form]
    );

    const validateField = useCallback(
        <K extends keyof User>(key: K, value: User[K]) => {
            const error = validators[key]?.({ [key]: value });
            if (error) {
                form.setErrors(prev => ({ ...prev, [key]: error }));
                return false;
            }
            form.clearError(key);
            return true;
        },
        [form]
    );

    return { ...form, setUserData, validateField, updateUser, handleError };
};
```

```typescript
// hooks/useUserImageHandlers.ts
import { useHandleError } from '@tryghost/admin-x-framework/hooks';
import { APIError } from '@tryghost/admin-x-framework/errors';
import { getImageUrl, useUploadImage } from '@tryghost/admin-x-framework/api/images';
import { type User } from '@tryghost/admin-x-framework/api/users';

type UpdateFormFn = (updater: (user: User) => User) => void;

const IMAGE_FIELD_MAP: Record<string, keyof User> = {
    cover_image: 'cover_image',
    profile_image: 'profile_image',
};

export const useUserImageHandlers = (updateForm: UpdateFormFn) => {
    const { mutateAsync: uploadImage } = useUploadImage();
    const handleError = useHandleError();

    const handleImageUpload = async (image: string, file: File) => {
        const field = IMAGE_FIELD_MAP[image];
        if (!field) return;

        try {
            const imageUrl = getImageUrl(await uploadImage({ file }));
            updateForm(user => ({ ...user, [field]: imageUrl }));
        } catch (e) {
            const error = e as APIError;
            if (error.response?.status === 415) {
                error.message = 'Unsupported file type';
            }
            handleError(error);
        }
    };

    const handleImageDelete = (image: string) => {
        const field = IMAGE_FIELD_MAP[image];
        if (!field) return;
        updateForm(user => ({ ...user, [field]: '' }));
    };

    return { handleImageUpload, handleImageDelete };
};
```

```typescript
// hooks/useUserMenuItems.ts
import NiceModal from '@ebay/nice-modal-react';
import { ConfirmationModal, LimitModal, showToast, type MenuItem } from '@tryghost/admin-x-design-system';
import {
    type User, hasAdminAccess, isAdminUser, isAuthorOrContributor,
    isEditorUser, isOwnerUser, useDeleteUser, useMakeOwner
} from '@tryghost/admin-x-framework/api/users';
import { HostLimitError, useLimiter } from '../../../hooks/use-limiter';
import { useRouting } from '@tryghost/admin-x-framework/routing';

interface UseUserMenuItemsProps {
    user: User;
    formState: User;
    currentUser: User;
    ownerUser: User;
    mainModalRemove: () => void;
    setFormState: (updater: (s: User) => User) => void;
    handleError: (e: unknown) => void;
    navigateOnClose: () => void;
}

export const useUserMenuItems = ({
    user,
    formState,
    currentUser,
    ownerUser,
    mainModalRemove,
    setFormState,
    handleError,
    navigateOnClose,
}: UseUserMenuItemsProps) => {
    const { updateRoute } = useRouting();
    const { mutateAsync: deleteUser } = useDeleteUser();
    const { mutateAsync: makeOwner } = useMakeOwner();
    const limiter = useLimiter();

    const showMenu = hasAdminAccess(currentUser) ||
        (isEditorUser(currentUser) && isAuthorOrContributor(user));

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
                    showToast({ title: 'Ownership transferred', type: 'success' });
                } catch (e) {
                    handleError(e);
                }
            },
        });
    };

    const confirmDelete = () => {
        NiceModal.show(ConfirmationModal, {
            title: 'Are you sure you want to delete this user?',
            prompt: (
                <>
                    <p className='mb-3'>
                        <span className='font-bold'>{user.name || user.email}</span>
                        {' '}will be permanently deleted and all their posts will be automatically assigned to the{' '}
                        <span className='font-bold'>{ownerUser.name}</span>.
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
                    await deleteUser(user?.id);
                    modal?.remove();
                    mainModalRemove();
                    navigateOnClose();
                    showToast({ title: 'User deleted', type: 'success' });
                } catch (e) {
                    handleError(e);
                }
            },
        });
    };

    const confirmSuspend = async () => {
        const isInactive = formState.status === 'inactive';

        if (isInactive && formState.roles[0].name !== 'Contributor') {
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
                const updatedUserData = { ...formState, status: isInactive ? 'active' : 'inactive' };
                try {
                    await makeOwner(updatedUserData as unknown as string);
                    setFormState(() => updatedUserData as User);
                    modal?.remove();
                    showToast({
                        title: isInactive ? 'User un-suspended' : 'User suspended',
                        type: 'success',
                    });
                } catch (e) {
                    handleError(e);
                }
            },
        });
    };

    const menuItems: MenuItem[] = [];

    if (isOwnerUser(currentUser) && isAdminUser(formState) && formState.status !== 'inactive') {
        menuItems.push({ id: 'make-owner', label: 'Make owner', onClick: confirmMakeOwner });
    }

    const canManageUser = formState.id !== currentUser.id && (
        (hasAdminAccess(currentUser) && !isOwnerUser(user)) ||
        (isEditorUser(currentUser) && isAuthorOrContributor(user))
    );

    if (canManageUser) {
        menuItems.push(
            { id: 'delete-user', label: 'Delete user', onClick: confirmDelete },
            {
                id: 'suspend-user',
                label: formState.status === 'inactive' ? 'Un-suspend user' : 'Suspend user',
                onClick: confirmSuspend,
            }
        );
    }

    menuItems.push({
        id: 'view-user-activity',
        label: 'View user activity',
        onClick: () => {
            mainModalRemove();
            updateRoute(`history/view/${formState.id}`);
        },
    });

    return { showMenu, menuItems };
};
```

```typescript
// components/UserCoverImage.tsx
import React from 'react';
import { Icon, ImageUpload } from '@tryghost/admin-x-design-system';
import usePinturaEditor from '../../../hooks/use-pintura-editor';

interface UserCoverImageProps {
    coverImage: string;
    onUpload: (file: File) => void;
    onDelete: () => void;
}

const COVER_BUTTON_CLASSES = 'flex flex-nowrap items-center justify-center px-3 h-8 opacity-80 hover:opacity-100 bg-[rgba(0,0,0,0.75)] rounded text-sm text-white transition-all cursor-pointer font-medium nowrap';
const NO_COVER_BUTTON_CLASSES = 'rounded text-sm flex flex-nowrap items-center justify-center px-3 h-8 transition-all cursor-pointer font-medium border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white';

export const UserCoverImage: React.FC<UserCoverImageProps> = ({ coverImage, onUpload, onDelete }) => {
    const editor = usePinturaEditor();

    return (
        <ImageUpload
            buttonContainerClassName='flex items-end gap-4 justify-end flex-nowrap'
            deleteButtonClassName={COVER_BUTTON_CLASSES}
            deleteButtonContent='Delete cover image'
            editButtonClassName={COVER_BUTTON_CLASSES}
            fileUploadClassName={NO_COVER_BUTTON_CLASSES}
            id='cover-image'
            imageClassName='hidden'
            imageURL={coverImage}
            pintura={{
                isEnabled: editor.isEnabled,
                openEditor: async () => editor.openEditor({
                    image: coverImage,
                    handleSave: async (file: File) => onUpload(file),
                }),
            }}
            unstyled
            onDelete={onDelete}
            onUpload={onUpload}
        >
            Upload cover image
        </ImageUpload>
    );
};
```

```typescript
// components/UserAvatar.tsx
import React from 'react';
import { Icon, ImageUpload } from '@tryghost/admin-x-design-system';
import usePinturaEditor from '../../../hooks/use-pintura-editor';

interface UserAvatarProps {
    profileImage: string;
    onUpload: (file: File) => void;
    onDelete: () => void;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ profileImage, onUpload, onDelete }) => {
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
            imageURL={profileImage ?? undefined}
            pintura={{
                isEnabled: editor.isEnabled,
                openEditor: async () => editor.openEditor({
                    image: profileImage || '',
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
// UserDetailModal.tsx (main file - refactored)
import EmailNotificationsTab from './users/email-notifications-tab';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import ProfileTab from './users/profile-tab';
import React, { useCallback, useState } from 'react';
import SocialLinksTab from './users/social-links-tab';
import clsx from 'clsx';
import useStaffUsers from '../../../hooks/use-staff-users';
import { Heading, Icon, Menu, Modal, TabView } from '@tryghost/admin-x-design-system';
import { type RoutingModalProps, useRouting } from '@tryghost/admin-x-framework/routing';
import { type User, canAccessSettings, useGetUserBySlug } from '@tryghost/admin-x-framework/api/users';
import { useGlobalData } from '../../providers/global-data-provider';
import { useUserDetailForm } from './hooks/useUserDetailForm';
import { useUserImageHandlers } from './hooks/useUserImageHandlers';
import { useUserMenuItems } from './hooks/useUserMenuItems';
import { UserAvatar } from './components/UserAvatar';
import { UserCoverImage } from './components/UserCoverImage';

export interface UserDetailProps {
    user: User;
    setUserData: (user: User) => void;
    errors: { [key in keyof User]?: string };
    validateField: <K extends keyof User>(key: K, value: User[K]) => boolean;
    clearError: (key: keyof User) => void;
}

const TAB_DEFINITIONS = [
    { id: 'profile', title: 'Profile', Component: ProfileTab },
    { id: 'social-links', title: 'Social Links', Component: SocialLinksTab },
    { id: 'email-notifications', title: 'Email Notifications', Component: EmailNotificationsTab },
];

const getTabFromPath = (path: string): string => {
    const lastSegment = path.split('/').pop() || '';
    return ['social-links', 'email-notifications'].includes(lastSegment) ? lastSegment : 'profile';
};

const UserDetailModalContent: React.FC<{ user: User }> = ({ user }) => {
    const { updateRoute, route } = useRouting();
    const { ownerUser } = useStaffUsers();
    const { currentUser } = useGlobalData();
    const mainModal = useModal();

    const {
        formState, setFormState, saveState, handleSave,
        updateForm, errors, clearError, okProps,
        setUserData, validateField, handleError,
    } = useUserDetailForm(user);

    const { handleImageUpload, handleImageDelete } = useUserImageHandlers(updateForm);

    const navigateOnClose = useCallback(() => {
        if (canAccessSettings(currentUser)) {
            updateRoute('staff');
        } else {
            updateRoute({ isExternal: true, route: '' });
        }
    }, [currentUser, updateRoute]);

    const { showMenu, menuItems } = useUserMenuItems({
        user,
        formState,
        currentUser,
        ownerUser,
        mainModalRemove: mainModal.remove,
        setFormState,
        handleError,
        navigateOnClose,
    });

    const [selectedTab, setSelectedTab] = useState<string>(getTabFromPath(route));

    const handleTabChange = (newTabId: string) => {
        const urlSegment = newTabId === 'profile' ? '' : `/${newTabId}`;
        updateRoute(`staff/${user.slug}${urlSegment}`);
        setSelectedTab(newTabId);
    };

    const canAccess = canAccessSettings(currentUser);
    const suspendedText = formState.status === 'inactive' ? ' (Suspended)' : '';
    const hasImage = Boolean(formState.cover_image);

    const tabProps = { clearError, errors, setUserData, validateField };

    const tabs = TAB_DEFINITIONS.map(({ id, title, Component }) => ({
        id,
        title,
        contents: id === 'email-notifications'
            ? <Component setUserData={setUserData} user={formState} />
            : <Component {...tabProps} user={formState} />,
    }));

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
                <div className={`relative ${canAccess ? '-mx-8 -mt-8 rounded-t' : '-mx-10 -mt-10'}`}>
                    <div
                        className={clsx(
                            'flex flex-wrap items-end justify-between gap-8 p-8',
                            hasImage && 'bg-cover bg-center',
                            !canAccess && 'min-h-[30vmin]'
                        )}
                        style={{ backgroundImage: hasImage ? `url(${formState.cover_image})` : 'none' }}
                    >
                        <div className='flex w-full flex-col gap-2'>
                            <div className='flex flex-nowrap items-start justify-between gap-3'>
                                <UserAvatar
                                    profileImage={formState.profile_image || ''}
                                    onDelete={() => handleImageDelete('profile_image')}
                                    onUpload={(file) => handleImageUpload('profile_image', file)}
                                />
                                <div className='flex flex-nowrap items-start gap-3'>
                                    <UserCoverImage
                                        coverImage={formState.cover_image || ''}
                                        onDelete={() => handleImageDelete('cover_image')}
                                        onUpload={(file) => handleImageUpload('cover_image', file)}
                                    />
                                    {showMenu && (
                                        <div className='z-10'>
                                            <Menu
                                                items={menuItems}
                                                position='end'
                                                trigger={
                                                    <button
                                                        className={clsx(
                                                            'flex h-8 cursor-pointer items-center justify-center rounded px-3',
                                                            hasImage
                                                                ? 'bg-[rgba(0,0,0,0.75)] opacity-80 hover:opacity-100'
                                                                : 'border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white'
                                                        )}
                                                        type='button'
                                                    >
                                                        <span className='sr-only'>Actions</span>
                                                        <Icon
                                                            colorClass={hasImage ? 'text-white' : undefined}
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
                                    styles={clsx('break-words md:break-normal', hasImage ? 'text-white' : 'text-black dark:text-white')}
                                >
                                    {user.name}{suspendedText}
                                </Heading>
                                <span className={clsx('text-md font-medium capitalize', hasImage ? 'text-white' : 'text-black dark:text-white')}>
                                    {user.roles[0].name.toLowerCase()}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className={clsx(!canAccess && 'mx-auto max-w-[536px]', 'mt-6 flex flex-col')}>
                    <TabView selectedTab={selectedTab} tabs={tabs} onTabChange={handleTabChange} />
                </div>
            </div>
        </Modal>
    );
};

const UserDetailModal: React.FC<RoutingModalProps> = ({ params }) => {
    const { currentUser } = useGlobalData();
    const isCurrentUser = currentUser.slug === params?.slug;

    const { data: fetchedUserData } = useGetUserBySlug(
        params?.slug || '',
        { enabled: !isCurrentUser && !!params?.slug }
    );

    const user = isCurrentUser ? currentUser : fetchedUserData?.users?.[0];

    return user ? <UserDetailModalContent user={user} /> : null;
};

export default NiceModal.create(UserDetailModal);
```

Key improvements made:

1. **`createSocialValidator` factory** — eliminated 9 near-identical try/catch blocks with a single reusable factory function
2. **`useUserDetailForm` hook** — extracted form state management, validation, and save logic
3. **`useUserImageHandlers` hook** — extracted image upload/delete logic with a field map instead of switch statements
4. **`useUserMenuItems` hook** — extracted all menu item construction and confirmation modal logic
5. **`UserAvatar` / `UserCoverImage` components** — extracted complex JSX into focused, reusable components
6. **`TAB_DEFINITIONS` constant** — replaced inline tab array with a declarative definition
7. **`getTabFromPath`** — moved to module scope since it has no dependencies
8. **`canAccess` / `hasImage` variables** — reduced repeated `canAccessSettings(currentUser)` and `formState.cover_image` expressions
9. **Replaced string template conditionals** with `clsx` throughout for consistency