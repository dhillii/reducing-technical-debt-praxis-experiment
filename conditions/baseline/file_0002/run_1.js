# Refactored NewNoteModal

The main improvements focus on:
1. **Extracting custom hooks** to separate concerns
2. **Extracting smaller components** to reduce JSX complexity
3. **Consolidating related state** into objects
4. **Extracting utility functions** to reduce inline logic

---

## Custom Hooks

```typescript
// hooks/use-modal-open.ts
import {useEffect, useState} from 'react';

export const useModalOpen = (externalOpen?: boolean) => {
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

    return {isOpen, setIsOpen, isSticky, modalIsOpen};
};
```

```typescript
// hooks/use-image-attachment.ts
import {ChangeEvent, useCallback, useRef, useState} from 'react';
import {FILE_SIZE_ERROR_MESSAGE, MAX_FILE_SIZE} from '@utils/image';
import {uploadFile} from '@hooks/use-activity-pub-queries';
import {toast} from 'sonner';

interface ImageAttachmentState {
    imagePreview: string | null;
    uploadedImageUrl: string | null;
    altText: string;
    showAltInput: boolean;
    isImageUploading: boolean;
}

const UPLOAD_ERROR_MESSAGES: Record<number, string> = {
    413: 'Image size exceeds limit.',
    415: 'The file type is not supported.',
};

export const useImageAttachment = () => {
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [state, setState] = useState<ImageAttachmentState>({
        imagePreview: null,
        uploadedImageUrl: null,
        altText: '',
        showAltInput: false,
        isImageUploading: false,
    });

    const updateState = (updates: Partial<ImageAttachmentState>) => {
        setState(prev => ({...prev, ...updates}));
    };

    const revokePreview = (preview: string | null) => {
        if (preview) {
            URL.revokeObjectURL(preview);
        }
    };

    const uploadImage = async (file: File) => {
        try {
            updateState({isImageUploading: true});
            const imageUrl = await uploadFile(file);
            updateState({uploadedImageUrl: imageUrl});
        } catch (error) {
            updateState({imagePreview: null});
            const statusCode = (error as {statusCode?: number})?.statusCode;
            const message = (statusCode && UPLOAD_ERROR_MESSAGES[statusCode]) ?? 'Failed to upload image. Try again.';
            toast.error(message);
        } finally {
            updateState({isImageUploading: false});
        }
    };

    const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            toast.error(FILE_SIZE_ERROR_MESSAGE);
            e.target.value = '';
            return;
        }

        updateState({imagePreview: URL.createObjectURL(file)});
        await uploadImage(file);
    };

    const handlePaste = useCallback(async (e: React.ClipboardEvent | ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) {
            return;
        }

        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) {
                    break;
                }

                if (file.size > MAX_FILE_SIZE) {
                    toast.error(FILE_SIZE_ERROR_MESSAGE);
                    return;
                }

                updateState({imagePreview: URL.createObjectURL(file)});
                await uploadImage(file);
                break;
            }
        }
    }, []);

    const clearImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        revokePreview(state.imagePreview);
        updateState({imagePreview: null, uploadedImageUrl: null, altText: '', showAltInput: false});
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    };

    const reset = () => {
        revokePreview(state.imagePreview);
        updateState({imagePreview: null, uploadedImageUrl: null, altText: '', showAltInput: false});
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    };

    const toggleAltInput = (e: React.MouseEvent) => {
        e.stopPropagation();
        updateState({showAltInput: !state.showAltInput});
    };

    return {
        ...state,
        imageInputRef,
        handleImageChange,
        handlePaste,
        clearImage,
        reset,
        toggleAltInput,
        setAltText: (altText: string) => updateState({altText}),
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

export const ImagePreview: React.FC<ImagePreviewProps> = ({
    src,
    isUploading,
    showAltInput,
    onClear,
    onToggleAlt,
}) => (
    <div className='group relative mt-6 flex min-h-[200px] w-full items-center justify-center'>
        <img
            alt='Image attachment preview'
            className={`max-h-[320px] w-full rounded-sm object-cover outline outline-1 -outline-offset-1 outline-black/10 ${isUploading && 'opacity-10'}`}
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
const CHARACTER_WARNING_THRESHOLD = 0.9;

interface CharacterCountProps {
    count: number;
    max: number;
}

const getCountColor = (count: number, max: number): string => {
    if (count >= max) {
        return 'text-red-500';
    }
    if (count >= max * CHARACTER_WARNING_THRESHOLD) {
        return 'text-yellow-600';
    }
    return 'text-gray-500';
};

export const CharacterCount: React.FC<CharacterCountProps> = ({count, max}) => (
    <div className={`text-sm ${getCountColor(count, max)}`}>
        {count}/{max}
    </div>
);
```

```typescript
// components/new-note-modal/note-composer.tsx
import * as FormPrimitive from '@radix-ui/react-form';
import APAvatar from '@components/global/ap-avatar';
import {ActorProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {Skeleton} from '@tryghost/shade';

interface NoteComposerProps {
    user: ActorProperties | undefined;
    accountName: string | undefined;
    isLoadingAccount: boolean;
    content: string;
    placeholder: string;
    imageInputRef: React.RefObject<HTMLInputElement>;
    textareaRef: React.RefObject<HTMLTextAreaElement>;
    onContentChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onPaste: (e: React.ClipboardEvent) => void;
    onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClick: () => void;
}

export const NoteComposer: React.FC<NoteComposerProps> = ({
    user,
    accountName,
    isLoadingAccount,
    content,
    placeholder,
    imageInputRef,
    textareaRef,
    onContentChange,
    onPaste,
    onImageChange,
    onClick,
}) => (
    <div
        className='flex cursor-text items-start gap-3'
        onClick={onClick}
    >
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
                            onChange={onContentChange}
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

## Utility Functions

```typescript
// utils/get-reply-placeholder.ts
import {ActorProperties, ObjectProperties} from '@tryghost/admin-x-framework/api/activitypub';
import getUsername from '@utils/get-username';

export const getReplyPlaceholder = (object: ObjectProperties): string => {
    const attributedTo = object.attributedTo ?? {};
    const isActor = typeof attributedTo === 'object' &&
        'preferredUsername' in attributedTo &&
        'id' in attributedTo;

    return isActor
        ? `Reply to ${getUsername(attributedTo as ActorProperties)}...`
        : "What's new?";
};
```

---

## Refactored Main Component

```typescript
import FeedItem from '@components/feed/feed-item';
import {ActorProperties, ObjectProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, LoadingIndicator} from '@tryghost/shade';
import {ComponentPropsWithoutRef, ReactNode, useCallback, useEffect, useRef, useState} from 'react';
import {toast} from 'sonner';
import {useAccountForUser, useNoteMutationForUser, useReplyMutationForUser, useUserDataForUser} from '@hooks/use-activity-pub-queries';
import {useNavigateWithBasePath} from '@src/hooks/use-navigate-with-base-path';
import {CharacterCount} from './character-count';
import {ImagePreview} from './image-preview';
import {NoteComposer} from './note-composer';
import {getReplyPlaceholder} from '@utils/get-reply-placeholder';
import {useImageAttachment} from '@hooks/use-image-attachment';
import {useModalOpen} from '@hooks/use-modal-open';
import {LucideIcon} from '@tryghost/shade';

const MAX_CONTENT_LENGTH = 500;

interface ReplyTarget {
    object: ObjectProperties;
    actor: ActorProperties;
}

interface NewNoteModalProps extends ComponentPropsWithoutRef<typeof Dialog> {
    children?: ReactNode;
    replyTo?: ReplyTarget;
    onReply?: () => void;
    onReplyError?: () => void;
    onOpenChange?: (open: boolean) => void;
}

const NewNoteModal: React.FC<NewNoteModalProps> = ({
    children,
    replyTo,
    onReply,
    onReplyError,
    onOpenChange,
    ...props
}) => {
    const {data: user} = useUserDataForUser('index');
    const noteMutation = useNoteMutationForUser('index', user);
    const replyMutation = useReplyMutationForUser('index', user);
    const {data: account, isLoading: isLoadingAccount} = useAccountForUser('index', 'me');

    const {isOpen, setIsOpen, isSticky, modalIsOpen} = useModalOpen(props.open);
    const imageAttachment = useImageAttachment();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);

    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);

    const navigate = useNavigateWithBasePath();

    const isDisabled = !content.trim() || !user || isPosting || content.length > MAX_CONTENT_LENGTH;
    const placeholder = replyTo ? getReplyPlaceholder(replyTo.object) : "What's new?";

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
        if (!imageAttachment.showAltInput) {
            return;
        }
        const id = setTimeout(() => altTextInputRef.current?.focus(), 100);
        return () => clearTimeout(id);
    }, [imageAttachment.showAltInput]);

    // Keyboard shortcut: Cmd/Ctrl+Enter to post
    useEffect(() => {
        if (!modalIsOpen) {
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isDisabled && !imageAttachment.isImageUploading) {
                    handlePost();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [modalIsOpen, isDisabled, imageAttachment.isImageUploading]);

    // Global paste handler
    useEffect(() => {
        if (!modalIsOpen) {
            return;
        }
        document.addEventListener('paste', imageAttachment.handlePaste);
        return () => document.removeEventListener('paste', imageAttachment.handlePaste);
    }, [modalIsOpen, imageAttachment.handlePaste]);

    const handlePost = useCallback(async () => {
        const trimmedContent = content.trim();
        if (!trimmedContent || !user) {
            return;
        }

        const imageUrl = imageAttachment.uploadedImageUrl ?? undefined;
        const altText = imageAttachment.altText || undefined;

        try {
            setIsPosting(true);

            if (replyTo) {
                await replyMutation.mutateAsync({
                    inReplyTo: replyTo.object.id,
                    content: trimmedContent,
                    imageUrl,
                    altText,
                });
                onReply?.();
            } else {
                await noteMutation.mutateAsync({content: trimmedContent, imageUrl, altText});
                navigate('/notes');
            }

            setIsOpen(false);
            onOpenChange?.(false);
            toast.success(replyTo ? 'Reply posted' : 'Note posted');
        } catch {
            if (replyTo) {
                onReplyError?.();
            }
        } finally {
            setIsPosting(false);
        }
    }, [content, user, replyTo, replyMutation, noteMutation, imageAttachment, onReply, onReplyError, setIsOpen, navigate, onOpenChange]);

    const handleOpenChange = (open: boolean) => {
        if (open) {
            setContent('');
            imageAttachment.reset();
        }
        setIsOpen(open);
        onOpenChange?.(open);
    };

    return (
        <Dialog
            open={modalIsOpen}
            onOpenChange={handleOpenChange}
            {...(props.open !== undefined ? {} : props)}
        >
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
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
                    imageInputRef={imageAttachment.imageInputRef}
                    isLoadingAccount={isLoadingAccount}
                    placeholder={placeholder}
                    textareaRef={textareaRef}
                    user={user as ActorProperties}
                    onContentChange={e => setContent(e.target.value)}
                    onClick={() => textareaRef.current?.focus()}
                    onImageChange={imageAttachment.handleImageChange}
                    onPaste={imageAttachment.handlePaste}
                />

                {imageAttachment.imagePreview && (
                    <ImagePreview
                        isUploading={imageAttachment.isImageUploading}
                        showAltInput={imageAttachment.showAltInput}
                        src={imageAttachment.imagePreview}
                        onClear={imageAttachment.clearImage}
                        onToggleAlt={imageAttachment.toggleAltInput}
                    />
                )}

                {imageAttachment.imagePreview && !imageAttachment.isImageUploading && imageAttachment.showAltInput && (
                    <div className='mt-1'>
                        <Input
                            ref={altTextInputRef}
                            className='w-full border-0 bg-transparent px-0 focus-visible:border-0 focus-visible:bg-transparent focus-visible:shadow-none focus-visible:outline-0 dark:bg-[#101114] dark:text-white dark:placeholder:text-gray-800'
                            placeholder='Type alt text for image (optional)'
                            type='text'
                            value={imageAttachment.altText}
                            onChange={e => imageAttachment.setAltText(e.target.value)}
                        />
                    </div>
                )}

                <DialogFooter className={`${isSticky ? 'sticky' : 'static'} bottom-0 flex-row bg-background py-6 dark:bg-[#101114]`}>
                    <Button
                        className='mr-auto w-[34px] !min-w-0'
                        variant='outline'
                        onClick={() => imageAttachment.imageInputRef.current?.click()}
                    >
                        <LucideIcon.Image />
                    </Button>
                    <div className='flex items-center space-x-3'>
                        <CharacterCount count={content.length} max={MAX_CONTENT_LENGTH} />
                        <Button
                            className='min-w-16'
                            data-testid='post-button'
                            disabled={isDisabled || imageAttachment.isImageUploading}
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

| Issue | Solution |
|---|---|
| Monolithic component (~250 lines) | Split into `NoteComposer`, `ImagePreview`, `CharacterCount` sub-components |
| Scattered image state (5 variables) | Consolidated into `useImageAttachment` hook with single state object |
| Modal open/sticky logic mixed in | Extracted to `useModalOpen` hook |
| Inline error message mapping | Replaced with `UPLOAD_ERROR_MESSAGES` lookup table |
| Inline placeholder logic | Extracted to `getReplyPlaceholder` utility |
| Repeated `props.open !== undefined ? props.open : isOpen` | Computed once as `modalIsOpen` in hook |
| `onOpenChange?.(false)` verbose null-check pattern | Replaced with optional chaining `onOpenChange?.()` |
| `for` loop over clipboard items | Replaced with `Array.from` + `for...of` |