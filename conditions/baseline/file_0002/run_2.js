# Refactored NewNoteModal

The main improvements focus on:
1. **Extracting custom hooks** to separate concerns
2. **Extracting smaller components** to reduce JSX complexity
3. **Consolidating related state** into logical groups
4. **Eliminating duplicate logic** (e.g., `modalIsOpen` computed multiple times)

---

## Custom Hooks

```typescript
// hooks/use-modal-state.ts
import {useEffect, useState} from 'react';

export const useModalState = (externalOpen?: boolean, onOpenChange?: (open: boolean) => void) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isSticky, setIsSticky] = useState(false);

    const modalIsOpen = externalOpen !== undefined ? externalOpen : isOpen;

    useEffect(() => {
        if (externalOpen !== undefined) {
            setIsOpen(externalOpen);
        }
    }, [externalOpen]);

    useEffect(() => {
        if (modalIsOpen) {
            const timer = setTimeout(() => setIsSticky(true), 300);
            return () => clearTimeout(timer);
        }
        setIsSticky(false);
    }, [modalIsOpen]);

    const handleOpenChange = (open: boolean, onReset: () => void) => {
        if (open) {
            onReset();
        }
        setIsOpen(open);
        onOpenChange?.(open);
    };

    return {isOpen, setIsOpen, isSticky, modalIsOpen, handleOpenChange};
};
```

```typescript
// hooks/use-image-attachment.ts
import {ChangeEvent, useCallback, useRef, useState} from 'react';
import {FILE_SIZE_ERROR_MESSAGE, MAX_FILE_SIZE} from '@utils/image';
import {uploadFile} from '@hooks/use-activity-pub-queries';
import {toast} from 'sonner';

const UPLOAD_ERROR_MESSAGES: Record<number, string> = {
    413: 'Image size exceeds limit.',
    415: 'The file type is not supported.',
};

export const useImageAttachment = () => {
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
    const [altText, setAltText] = useState('');
    const [showAltInput, setShowAltInput] = useState(false);
    const [isImageUploading, setIsImageUploading] = useState(false);

    const clearImage = useCallback(() => {
        if (imagePreview) {
            URL.revokeObjectURL(imagePreview);
        }
        setImagePreview(null);
        setUploadedImageUrl(null);
        setAltText('');
        setShowAltInput(false);
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    }, [imagePreview]);

    const uploadImage = useCallback(async (file: File) => {
        try {
            setIsImageUploading(true);
            const imageUrl = await uploadFile(file);
            setUploadedImageUrl(imageUrl);
        } catch (error) {
            setImagePreview(null);
            const statusCode = error && typeof error === 'object' && 'statusCode' in error
                ? (error as {statusCode: number}).statusCode
                : null;
            toast.error(statusCode ? (UPLOAD_ERROR_MESSAGES[statusCode] ?? 'Failed to upload image. Try again.') : 'Failed to upload image. Try again.');
        } finally {
            setIsImageUploading(false);
        }
    }, []);

    const handleFileSelected = useCallback(async (file: File) => {
        if (file.size > MAX_FILE_SIZE) {
            toast.error(FILE_SIZE_ERROR_MESSAGE);
            return false;
        }
        setImagePreview(URL.createObjectURL(file));
        await uploadImage(file);
        return true;
    }, [uploadImage]);

    const handleImageChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }
        const success = await handleFileSelected(file);
        if (!success) {
            e.target.value = '';
        }
    }, [handleFileSelected]);

    const handlePaste = useCallback(async (e: React.ClipboardEvent | ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) {
            return;
        }
        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    await handleFileSelected(file);
                }
                break;
            }
        }
    }, [handleFileSelected]);

    return {
        imageInputRef,
        imagePreview,
        uploadedImageUrl,
        altText,
        setAltText,
        showAltInput,
        setShowAltInput,
        isImageUploading,
        clearImage,
        handleImageChange,
        handlePaste,
    };
};
```

---

## Sub-components

```typescript
// components/new-note-modal/image-preview.tsx
import {Button, LoadingIndicator, LucideIcon} from '@tryghost/shade';

interface ImagePreviewProps {
    src: string;
    isUploading: boolean;
    showAltInput: boolean;
    onClear: (e: React.MouseEvent) => void;
    onToggleAlt: (e: React.MouseEvent) => void;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({src, isUploading, showAltInput, onClear, onToggleAlt}) => (
    <div className='group relative mt-6 flex min-h-[200px] w-full items-center justify-center'>
        <img
            alt='Image attachment preview'
            className={`max-h-[320px] w-full rounded-sm object-cover outline outline-1 -outline-offset-1 outline-black/10 ${isUploading ? 'opacity-10' : ''}`}
            src={src}
        />
        {isUploading && (
            <div className='absolute leading-[0]'>
                <LoadingIndicator size='md' />
            </div>
        )}
        <Button
            className='absolute right-3 top-3 size-8 bg-black/60 text-white opacity-0 hover:bg-black/80 group-hover:opacity-100'
            onClick={onClear}
        >
            <LucideIcon.Trash2 />
        </Button>
        {!isUploading && (
            <Button
                className={`absolute bottom-3 left-3 h-6 px-2 py-0 text-white ${showAltInput ? 'bg-green-500 hover:bg-green-500' : 'bg-black/60 hover:bg-black/80'}`}
                onClick={onToggleAlt}
            >
                Alt
            </Button>
        )}
    </div>
);
```

```typescript
// components/new-note-modal/character-count.tsx
const MAX_CONTENT_LENGTH = 500;

interface CharacterCountProps {
    count: number;
}

const getCountColor = (count: number) => {
    if (count >= MAX_CONTENT_LENGTH) {
        return 'text-red-500';
    }
    if (count >= MAX_CONTENT_LENGTH * 0.9) {
        return 'text-yellow-600';
    }
    return 'text-gray-500';
};

export const CharacterCount: React.FC<CharacterCountProps> = ({count}) => (
    <div className={`text-sm ${getCountColor(count)}`}>
        {count}/{MAX_CONTENT_LENGTH}
    </div>
);
```

```typescript
// components/new-note-modal/note-composer.tsx
import * as FormPrimitive from '@radix-ui/react-form';
import APAvatar from '@components/global/ap-avatar';
import {ActorProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {Skeleton} from '@tryghost/shade';
import {RefObject} from 'react';

interface NoteComposerProps {
    user: ActorProperties | undefined;
    accountName: string | undefined;
    isLoadingAccount: boolean;
    content: string;
    placeholder: string;
    textareaRef: RefObject<HTMLTextAreaElement>;
    imageInputRef: RefObject<HTMLInputElement>;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onPaste: (e: React.ClipboardEvent) => void;
    onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClick: () => void;
}

export const NoteComposer: React.FC<NoteComposerProps> = ({
    user, accountName, isLoadingAccount, content, placeholder,
    textareaRef, imageInputRef, onChange, onPaste, onImageChange, onClick,
}) => (
    <div className='flex cursor-text items-start gap-3' onClick={onClick}>
        <div className='sticky top-0'>
            <APAvatar author={user as ActorProperties} />
        </div>
        <FormPrimitive.Root asChild>
            <div className='-mt-0.5 flex w-full flex-col gap-0.5'>
                {isLoadingAccount
                    ? <Skeleton className='w-10' />
                    : <span className='min-w-0 truncate whitespace-nowrap font-semibold text-black break-anywhere dark:text-white'>{accountName}</span>
                }
                <FormPrimitive.Field name='content' asChild>
                    <FormPrimitive.Control asChild>
                        <textarea
                            ref={textareaRef}
                            autoFocus
                            className='ap-textarea w-full resize-none bg-transparent text-[1.5rem] break-anywhere'
                            data-testid='note-textarea'
                            placeholder={placeholder}
                            rows={1}
                            value={content}
                            onChange={onChange}
                            onPaste={onPaste}
                        />
                    </FormPrimitive.Control>
                </FormPrimitive.Field>
                <FormPrimitive.Field name='image' asChild>
                    <FormPrimitive.Control asChild>
                        <input
                            ref={imageInputRef}
                            accept='image/jpeg,image/png,image/webp,image/gif'
                            className='hidden'
                            type='file'
                            onChange={onImageChange}
                        />
                    </FormPrimitive.Control>
                </FormPrimitive.Field>
            </div>
        </FormPrimitive.Root>
    </div>
);
```

---

## Refactored Main Component

```typescript
import FeedItem from '@components/feed/feed-item';
import getUsername from '@utils/get-username';
import {ActorProperties, ObjectProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, LoadingIndicator, LucideIcon} from '@tryghost/shade';
import {ComponentPropsWithoutRef, ReactNode, useCallback, useEffect, useRef, useState} from 'react';
import {toast} from 'sonner';
import {useAccountForUser, useNoteMutationForUser, useReplyMutationForUser, useUserDataForUser} from '@hooks/use-activity-pub-queries';
import {useNavigateWithBasePath} from '@src/hooks/use-navigate-with-base-path';
import {useModalState} from '@hooks/use-modal-state';
import {useImageAttachment} from '@hooks/use-image-attachment';
import {CharacterCount} from './character-count';
import {ImagePreview} from './image-preview';
import {NoteComposer} from './note-composer';

const MAX_CONTENT_LENGTH = 500;

interface NewNoteModalProps extends ComponentPropsWithoutRef<typeof Dialog> {
    children?: ReactNode;
    replyTo?: {
        object: ObjectProperties;
        actor: ActorProperties;
    };
    onReply?: () => void;
    onReplyError?: () => void;
    onOpenChange?: (open: boolean) => void;
}

const getPlaceholder = (replyTo: NewNoteModalProps['replyTo']): string => {
    if (!replyTo) {
        return "What's new?";
    }
    const attributedTo = replyTo.object.attributedTo ?? {};
    if (typeof attributedTo === 'object' && 'preferredUsername' in attributedTo && 'id' in attributedTo) {
        return `Reply to ${getUsername(attributedTo as ActorProperties)}...`;
    }
    return "What's new?";
};

const NewNoteModal: React.FC<NewNoteModalProps> = ({children, replyTo, onReply, onReplyError, onOpenChange, ...props}) => {
    const {data: user} = useUserDataForUser('index');
    const noteMutation = useNoteMutationForUser('index', user);
    const replyMutation = useReplyMutationForUser('index', user);
    const {data: account, isLoading: isLoadingAccount} = useAccountForUser('index', 'me');
    const navigate = useNavigateWithBasePath();

    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);

    const {isOpen, setIsOpen, isSticky, modalIsOpen, handleOpenChange} = useModalState(props.open, onOpenChange);
    const image = useImageAttachment();

    const isDisabled = !content.trim() || !user || isPosting || content.length > MAX_CONTENT_LENGTH;

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [content]);

    // Focus textarea when modal opens
    useEffect(() => {
        if (!modalIsOpen) {
            return;
        }
        const id = setTimeout(() => textareaRef.current?.focus(), 100);
        return () => clearTimeout(id);
    }, [modalIsOpen]);

    // Focus alt text input when shown
    useEffect(() => {
        if (!image.showAltInput) {
            return;
        }
        const id = setTimeout(() => altTextInputRef.current?.focus(), 100);
        return () => clearTimeout(id);
    }, [image.showAltInput]);

    const handlePost = useCallback(async () => {
        const trimmedContent = content.trim();
        if (!trimmedContent || !user) {
            return;
        }

        try {
            setIsPosting(true);
            const imageUrl = image.uploadedImageUrl ?? undefined;
            const altText = image.altText || undefined;

            if (replyTo) {
                await replyMutation.mutateAsync({inReplyTo: replyTo.object.id, content: trimmedContent, imageUrl, altText});
                onReply?.();
            } else {
                await noteMutation.mutateAsync({content: trimmedContent, imageUrl, altText});
                navigate('/notes');
            }

            setIsOpen(false);
            onOpenChange?.(false);
            toast.success(replyTo ? 'Reply posted' : 'Note posted');
        } catch {
            replyTo && onReplyError?.();
        } finally {
            setIsPosting(false);
        }
    }, [content, user, replyTo, replyMutation, noteMutation, image.uploadedImageUrl, image.altText, onReply, onReplyError, setIsOpen, navigate, onOpenChange]);

    // Keyboard shortcut: Cmd/Ctrl+Enter to post
    useEffect(() => {
        if (!modalIsOpen) {
            return;
        }
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isDisabled && !image.isImageUploading) {
                e.preventDefault();
                handlePost();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [modalIsOpen, isDisabled, image.isImageUploading, handlePost]);

    // Global paste handler
    useEffect(() => {
        if (!modalIsOpen) {
            return;
        }
        document.addEventListener('paste', image.handlePaste);
        return () => document.removeEventListener('paste', image.handlePaste);
    }, [modalIsOpen, image.handlePaste]);

    const resetForm = () => {
        setContent('');
        image.clearImage();
    };

    return (
        <Dialog
            open={modalIsOpen}
            onOpenChange={open => handleOpenChange(open, resetForm)}
            {...(props.open !== undefined ? {} : props)}
        >
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent
                className='max-h-[80vh] min-h-[240px] gap-0 overflow-y-auto pb-0'
                data-testid='new-note-modal'
                onClick={e => e.stopPropagation()}
            >
                <DialogHeader className='hidden'>
                    <DialogTitle>{replyTo ? 'Reply' : 'New note'}</DialogTitle>
                    <DialogDescription>Post your thoughts to the Social web</DialogDescription>
                </DialogHeader>

                {replyTo && (
                    <FeedItem
                        actor={replyTo.actor}
                        allowDelete={false}
                        commentCount={replyTo.object.replyCount ?? 0}
                        isCompact={true}
                        layout='reply'
                        likeCount={replyTo.object.likeCount ?? 0}
                        object={replyTo.object}
                        repostCount={replyTo.object.repostCount ?? 0}
                        type={replyTo.object.type === 'Article' ? 'Article' : 'Note'}
                        onClick={() => {}}
                    />
                )}

                <NoteComposer
                    accountName={account?.name}
                    content={content}
                    imageInputRef={image.imageInputRef}
                    isLoadingAccount={isLoadingAccount}
                    placeholder={getPlaceholder(replyTo)}
                    textareaRef={textareaRef}
                    user={user as ActorProperties}
                    onChange={e => setContent(e.target.value)}
                    onClick={() => textareaRef.current?.focus()}
                    onImageChange={image.handleImageChange}
                    onPaste={image.handlePaste}
                />

                {image.imagePreview && (
                    <ImagePreview
                        isUploading={image.isImageUploading}
                        showAltInput={image.showAltInput}
                        src={image.imagePreview}
                        onClear={(e) => { e.stopPropagation(); image.clearImage(); }}
                        onToggleAlt={(e) => { e.stopPropagation(); image.setShowAltInput(!image.showAltInput); }}
                    />
                )}

                {image.imagePreview && !image.isImageUploading && image.showAltInput && (
                    <div className='mt-1'>
                        <Input
                            ref={altTextInputRef}
                            className='w-full border-0 bg-transparent px-0 focus-visible:border-0 focus-visible:bg-transparent focus-visible:shadow-none focus-visible:outline-0 dark:bg-[#101114] dark:text-white dark:placeholder:text-gray-800'
                            placeholder='Type alt text for image (optional)'
                            type='text'
                            value={image.altText}
                            onChange={e => image.setAltText(e.target.value)}
                        />
                    </div>
                )}

                <DialogFooter className={`${isSticky ? 'sticky' : 'static'} bottom-0 flex-row bg-background py-6 dark:bg-[#101114]`}>
                    <Button className='mr-auto w-[34px] !min-w-0' variant='outline' onClick={() => image.imageInputRef.current?.click()}>
                        <LucideIcon.Image />
                    </Button>
                    <div className='flex items-center space-x-3'>
                        <CharacterCount count={content.length} />
                        <Button
                            className='min-w-16'
                            data-testid='post-button'
                            disabled={isDisabled || image.isImageUploading}
                            onClick={handlePost}
                        >
                            {isPosting ? <LoadingIndicator color='light' size='sm' /> : 'Post'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default NewNoteModal;
```

---

## Summary of Changes

| Issue | Before | After |
|---|---|---|
| **State management** | 10+ `useState` calls in one component | Split across `useModalState` and `useImageAttachment` hooks |
| **Repeated `modalIsOpen` logic** | Computed 4× inline | Computed once in `useModalState` |
| **Image upload error handling** | `switch` statement | Lookup table `UPLOAD_ERROR_MESSAGES` |
| **Placeholder logic** | Inline in JSX | Extracted to pure `getPlaceholder()` function |
| **JSX complexity** | ~150 lines of JSX | Broken into `NoteComposer`, `ImagePreview`, `CharacterCount` |
| **`for` loop over clipboard items** | Index-based `for` loop | `Array.from` + `for...of` |
| **Optional chaining** | `if (onOpenChange) onOpenChange(false)` | `onOpenChange?.(false)` |
| **`clearImage` duplication** | Repeated in 2 places | Single `clearImage()` in hook |