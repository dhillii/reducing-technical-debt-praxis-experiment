I'll refactor this code to reduce complexity by:

1. Extracting the social URL validators into a reusable factory function
2. Splitting large functions into smaller, focused ones
3. Extracting components and hooks for better separation of concerns

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
```

```typescript
// hooks/use-user-detail-form.ts
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
            Object.entries(validators).reduce<ErrorMessages>((newErrors, [key, validate]) => {
                const error = validate(values);
                if (error) newErrors[key] = error;
                return newErrors;
            }, {}),
        onSave: async (values) => { await updateUser?.(values); },
        onSaveError: handleError
    });

    const setUserData = (newData: User) => form.updateForm(() => newData);

    const validateField = <K extends keyof User>(key: K, value: User[K]) => {
        const error = validators[key]?.({ [key]: value });
        if (error) {
            form.setErrors({ ...form.errors, [key]: error });
            return false;
        }
        form.clearError(key);
        return true;
    };

    return { ...form, setUserData, validateField, handleError, updateUser };
};
```

```typescript
// hooks/use-user-actions.ts
import NiceModal from '@ebay/nice-modal-react';
import { useModal } from '@ebay/nice-modal-react';
import { ConfirmationModal, LimitModal, showToast } from '@tryghost/admin-x-design-system';
import { type User, useDeleteUser, useMakeOwner } from '@tryghost/admin-x-framework/api/users';
import { useRouting } from '@tryghost/admin-x-framework/routing';
import { HostLimitError, useLimiter } from '../../../hooks/use-limiter';

interface UseUserActionsProps {
    user: User;
    currentUser: User;
    handleError: (e: unknown) => void;
    updateUser: (data: User) => Promise<unknown>;
    setFormState: (fn: () => User) => void;
    navigateOnClose: () => void;
}

export const useUserActions = ({
    user,
    currentUser,
    handleError,
    updateUser,
    setFormState,
    navigateOnClose,
}: UseUserActionsProps) => {
    const mainModal = useModal();
    const { updateRoute } = useRouting();
    const { mutateAsync: deleteUser } = useDeleteUser();
    const { mutateAsync: makeOwner } = useMakeOwner();
    const limiter = useLimiter();

    const confirmSuspend = async (_user: User) => {
        if (_user.status === 'inactive' && _user.roles[0].name !== 'Contributor') {
            try {
                await limiter?.errorIfWouldGoOverLimit('staff');
            } catch (error) {
                if (error instanceof HostLimitError) {
                    NiceModal.show(LimitModal, {
                        formSheet: true,
                        prompt: error.message || `Your current plan doesn't support more users.`,
                        onOk: () => updateRoute({ route: '/pro', isExternal: true })
                    });
                    return;
                }
                throw error;
            }
        }

        const isInactive = _user.status === 'inactive';
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

    const confirmDelete = (_user: User, { owner }: { owner: User }) => {
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
                    mainModal?.remove();
                    navigateOnClose();
                    showToast({ title: 'User deleted', type: 'success' });
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
                    showToast({ title: 'Ownership transferred', type: 'success' });
                } catch (e) {
                    handleError(e);
                }
            }
        });
    };

    const viewUserActivity = () => {
        mainModal.remove();
        updateRoute(`history/view/${user.id}`);
    };

    return { confirmSuspend, confirmDelete, confirmMakeOwner, viewUserActivity };
};
```

```typescript
// hooks/use-image-handlers.ts
import { APIError } from '@tryghost/admin-x-framework/errors';
import { getImageUrl, useUploadImage } from '@tryghost/admin-x-framework/api/images';
import { type User } from '@tryghost/admin-x-framework/api/users';

type ImageField = 'cover_image' | 'profile_image';
type UpdateFormFn = (updater: (user: User) => User) => void;

export const useImageHandlers = (
    updateForm: UpdateFormFn,
    handleError: (e: unknown) => void
) => {
    const { mutateAsync: uploadImage } = useUploadImage();

    const handleImageUpload = async (image: ImageField, file: File) => {
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
    };

    const handleImageDelete = (image: ImageField) => {
        updateForm((_user) => ({ ..._user, [image]: '' }));
    };

    return { handleImageUpload, handleImageDelete };
};
```

```typescript
// hooks/use-menu-items.ts
import {
    type User,
    hasAdminAccess, isAdminUser, isAuthorOrContributor,
    isEditorUser, isOwnerUser
} from '@tryghost/admin-x-framework/api/users';
import { type MenuItem } from '@tryghost/admin-x-design-system';

interface UseMenuItemsProps {
    currentUser: User;
    formState: User;
    user: User;
    ownerUser: User;
    confirmMakeOwner: () => void;
    confirmDelete: (user: User, opts: { owner: User }) => void;
    confirmSuspend: (user: User) => void;
    viewUserActivity: () => void;
}

export const useMenuItems = ({
    currentUser,
    formState,
    user,
    ownerUser,
    confirmMakeOwner,
    confirmDelete,
    confirmSuspend,
    viewUserActivity,
}: UseMenuItemsProps): { showMenu: boolean; menuItems: MenuItem[] } => {
    const showMenu =
        hasAdminAccess(currentUser) ||
        (isEditorUser(currentUser) && isAuthorOrContributor(user));

    const menuItems: MenuItem[] = [];

    if (isOwnerUser(currentUser) && isAdminUser(formState) && formState.status !== 'inactive') {
        menuItems.push({
            id: 'make-owner',
            label: 'Make owner',
            onClick: confirmMakeOwner
        });
    }

    const canManageUser =
        formState.id !== currentUser.id && (
            (hasAdminAccess(currentUser) && !isOwnerUser(user)) ||
            (isEditorUser(currentUser) && isAuthorOrContributor(user))
        );

    if (canManageUser) {
        menuItems.push(
            {
                id: 'delete-user',
                label: 'Delete user',
                onClick: () => confirmDelete(user, { owner: ownerUser })
            },
            {
                id: 'suspend-user',
                label: formState.status === 'inactive' ? 'Un-suspend user' : 'Suspend user',
                onClick: () => confirmSuspend(formState)
            }
        );
    }

    menuItems.push({
        id: 'view-user-activity',
        label: 'View user activity',
        onClick: viewUserActivity
    });

    return { showMenu, menuItems };
};
```

```typescript
// components/UserCoverImage.tsx
import React from 'react';
import { Icon, ImageUpload } from '@tryghost/admin-x-design-system';
import { type User } from '@tryghost/admin-x-framework/api/users';
import usePinturaEditor from '../../../hooks/use-pintura-editor';

const COVER_BUTTON_CLASSES = 'flex flex-nowrap items-center justify-center px-3 h-8 opacity-80 hover:opacity-100 bg-[rgba(0,0,0,0.75)] rounded text-sm text-white transition-all cursor-pointer font-medium nowrap';
const NO_COVER_BUTTON_CLASSES = 'rounded text-sm flex flex-nowrap items-center justify-center px-3 h-8 transition-all cursor-pointer font-medium border border-grey-300 bg-transparent text-black dark:border-grey-800 dark:text-white';

interface UserCoverImageProps {
    coverImage: string;
    onUpload: (file: File) => void;
    onDelete: () => void;
    editor: ReturnType<typeof usePinturaEditor>;
}

export const UserCoverImage: React.FC<UserCoverImageProps> = ({
    coverImage,
    onUpload,
    onDelete,
    editor
}) => (
    <ImageUpload
        buttonContainerClassName='flex items-end gap-4 justify-end flex-nowrap'
        deleteButtonClassName={COVER_BUTTON_CLASSES}
        deleteButtonContent='Delete cover image'
        editButtonClassName={COVER_BUTTON_CLASSES}
        fileUploadClassName={NO_COVER_BUTTON_CLASSES}
        id='cover-image'
        imageClassName='hidden'
        imageURL={coverImage || ''}
        pintura={{
            isEnabled: editor.isEnabled,
            openEditor: async () => editor.openEditor({
                image: coverImage || '',
                handleSave: async (file: File) => onUpload(file)
            })
        }}
        unstyled
        onDelete={onDelete}
        onUpload={onUpload}
    >
        Upload cover image
    </ImageUpload>
);
```

```typescript
// components/UserProfileImage.tsx
import React from 'react';
import { Icon, ImageUpload } from '@tryghost/admin-x-design-system';
import usePinturaEditor from '../../../hooks/use-pintura-editor';

interface UserProfileImageProps {
    profileImage: string | null;
    onUpload: (file: File) => void;
    onDelete: () => void;
    editor: ReturnType<typeof usePinturaEditor>;
}

export const UserProfileImage: React.FC<UserProfileImageProps> = ({
    profileImage,
    onUpload,
    onDelete,
    editor
}) => (
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
                handleSave: async (file: File) => onUpload(file)
            })
        }}
        unstyled={true}
        width='80px'
        onDelete={onDelete}
        onUpload={onUpload}
    >
        <Icon colorClass='black' name='user-add' size='lg' />
    </ImageUpload>
);
```

```typescript
// components/UserActionsMenu.tsx
import React from 'react';
import clsx from 'clsx';
import { Icon, Menu, type MenuItem } from '@tryghost/admin-x-design-system';

interface UserActionsMenuProps {
    menuItems: MenuItem[];
    hasCoverImage: boolean;
}

export const UserActionsMenu: React.FC<UserActionsMenuProps> = ({
    menuItems,
    hasCoverImage
}) => (
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
);
```

```typescript
// UserDetailModal.tsx (main file - now much leaner)
import EmailNotificationsTab from './users/email-notifications-tab';
import NiceModal from '@ebay/nice-modal-react';
import ProfileTab from './users/profile-tab';
import React, { useCallback, useState } from 'react';
import SocialLinksTab from './users/social-links-tab';
import usePinturaEditor from '../../../hooks/use-pintura-editor';
import useStaffUsers from '../../../hooks/use-staff-users';
import { Heading, Modal, TabView } from '@tryghost/admin-x-design-system';
import { type RoutingModalProps, useRouting } from '@tryghost/admin-x-framework/routing';
import { type User, canAccessSettings, useGetUserBySlug } from '@tryghost/admin-x-framework/api/users';
import { useGlobalData } from '../../providers/global-data-provider';
import { useUserDetailForm } from './hooks/use-user-detail-form';
import { useUserActions } from './hooks/use-user-actions';
import { useImageHandlers } from './hooks/use-image-handlers';
import { useMenuItems } from './hooks/use-menu-items';
import { UserCoverImage } from './components/UserCoverImage';
import { UserProfileImage } from './components/UserProfileImage';
import { UserActionsMenu } from './components/UserActionsMenu';
import clsx from 'clsx';

export interface UserDetailProps {
    user: User;
    setUserData: (user: User) => void;
    errors: { [key in keyof User]?: string };
    validateField: <K extends keyof User>(key: K, value: User[K]) => boolean;
    clearError: (key: keyof User) => void;
}

const getTabFromPath = (path: string): string => {
    const lastSegment = path.split('/').pop() || '';
    return ['social-links', 'email-notifications'].includes(lastSegment)
        ? lastSegment
        : 'profile';
};

const UserDetailModalContent: React.FC<{ user: User }> = ({ user }) => {
    const { updateRoute, route } = useRouting();
    const { ownerUser } = useStaffUsers();
    const { currentUser } = useGlobalData();
    const editor = usePinturaEditor();

    const {
        formState, setFormState, saveState, handleSave,
        updateForm, errors, clearError, okProps,
        setUserData, validateField, handleError, updateUser
    } = useUserDetailForm(user);

    const navigateOnClose = useCallback(() => {
        canAccessSettings(currentUser)
            ? updateRoute('staff')
            : updateRoute({ isExternal: true, route: '' });
    }, [currentUser, updateRoute]);

    const { confirmSuspend, confirmDelete, confirmMakeOwner, viewUserActivity } = useUserActions({
        user,
        currentUser,
        handleError,
        updateUser,
        setFormState,
        navigateOnClose,
    });

    const { handleImageUpload, handleImageDelete } = useImageHandlers(updateForm, handleError);

    const { showMenu, menuItems } = useMenuItems({
        currentUser,
        formState,
        user,
        ownerUser,
        confirmMakeOwner,
        confirmDelete,
        confirmSuspend,
        viewUserActivity,
    });

    const [selectedTab, setSelectedTab] = useState<string>(getTabFromPath(route));

    const handleTabChange = (newTabId: string) => {
        const urlSegment = newTabId === 'profile' ? '' : `/${newTabId}`;
        updateRoute(`staff/${user.slug}${urlSegment}`);
        setSelectedTab(newTabId);
    };

    const canAccess = canAccessSettings(currentUser);
    const hasCoverImage = !!formState.cover_image;
    const suspendedText = formState.status === 'inactive' ? ' (Suspended)' : '';

    const tabProps = { clearError, errors, setUserData, validateField };

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
                        className={`flex flex-wrap items-end justify-between gap-8 p-8 ${hasCoverImage ? 'bg-cover bg-center' : ''} ${!canAccess && 'min-h-[30vmin]'}`}
                        style={{ backgroundImage: hasCoverImage ? `url(${formState.cover_image})` : 'none' }}
                    >
                        <div className='flex w-full flex-col gap-2'>
                            <div className='flex flex-nowrap items-start justify-between gap-3'>
                                <UserProfileImage
                                    editor={editor}
                                    profileImage={formState.profile_image ?? null}
                                    onDelete={() => handleImageDelete('profile_image')}
                                    onUpload={(file) => handleImageUpload('profile_image', file)}
                                />
                                <div className='flex flex-nowrap items-start gap-3'>
                                    <UserCoverImage
                                        coverImage={formState.cover_image || ''}
                                        editor={editor}
                                        onDelete={() => handleImageDelete('cover_image')}
                                        onUpload={(file) => handleImageUpload('cover_image', file)}
                                    />
                                    {showMenu && (
                                        <UserActionsMenu
                                            hasCoverImage={hasCoverImage}
                                            menuItems={menuItems}
                                        />
                                    )}
                                </div>
                            </div>
                            <div>
                                <Heading
                                    level={3}
                                    styles={clsx('break-words md:break-normal', hasCoverImage ? 'text-white' : 'text-black dark:text-white')}
                                >
                                    {user.name}{suspendedText}
                                </Heading>
                                <span className={clsx('text-md font-medium capitalize', hasCoverImage ? 'text-white' : 'text-black dark:text-white')}>
                                    {user.roles[0].name.toLowerCase()}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className={`${!canAccess && 'mx-auto max-w-[536px]'} mt-6 flex flex-col`}>
                    <TabView
                        selectedTab={selectedTab}
                        tabs={[
                            {
                                id: 'profile',
                                title: 'Profile',
                                contents: <ProfileTab {...tabProps} user={formState} />
                            },
                            {
                                id: 'social-links',
                                title: 'Social Links',
                                contents: <SocialLinksTab {...tabProps} user={formState} />
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

1. **`createSocialValidator` factory** — eliminated 9 near-identical validator blocks with a single reusable function
2. **`useUserDetailForm` hook** — extracted form logic, validation, and save handling
3. **`useUserActions` hook** — isolated all confirmation modal logic (suspend, delete, transfer ownership)
4. **`useImageHandlers` hook** — extracted image upload/delete logic with cleaner field mapping
5. **`useMenuItems` hook** — extracted menu construction logic with a clear `canManageUser` predicate
6. **`UserCoverImage`, `UserProfileImage`, `UserActionsMenu` components** — decomposed the large JSX block into focused, testable components
7. **`getTabFromPath`** — moved to module scope (pure function, no closure needed)
8. **`canAccess` / `hasCoverImage`** — derived booleans reduce repeated expressions
9. **`tabProps` spread** — eliminates repetitive prop passing to tab components