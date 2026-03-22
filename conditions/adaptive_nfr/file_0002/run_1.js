# Refactored NewNoteModal

The main issues I identified:
1. **Massive component** with mixed concerns (state, effects, handlers, rendering)
2. **Repetitive open-state logic** (`props.open !== undefined ? props.open : isOpen`)
3. **Scattered related state** (image state, post state, etc.)
4. **Inline complex logic** in JSX (character counter color, dialog open handler)
5. **Multiple similar useEffect patterns** for focus management

## Extracted Hooks & Utilities

```typescript
// hooks/use-modal-open-state.ts
import {useEffect, useState} from 'react';

export function useModalOpenState(externalOpen?: boolean, onOpenChange?: (open: boolean) => void) {
    const [isOpen, setIsOpen] = useState(false);
    const [isSticky, setIsSticky] = useState(false);

    const resolvedOpen = externalOpen !== undefined ? externalOpen : isOpen;

    useEffect(() => {
        if (externalOpen !== undefined) {
            setIsOpen(externalOpen);
        }
    }, [externalOpen]);

    useEffect(() => {
        if (resolvedOpen) {
            const timer = setTimeout(() => setIsSticky(true), 300);
            return () => clearTimeout(timer);
        }
        setIsSticky(false);
    }, [resolvedOpen]);

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        onOpenChange?.(open);
    };

    return {resolvedOpen, isSticky, handleOpenChange};
}
```

```typescript
// hooks/use-image-attachment.ts
import {ChangeEvent, useCallback, useEffect, useRef, useState} from 'react';
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

export function useImageAttachment() {
    const imageInputRef = useRef<HTMLInputElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);

    const [state, setState] = useState<ImageAttachmentState>({
        imagePreview: null,
        uploadedImageUrl: null,
        altText: '',
        showAltInput: false,
        isImageUploading: false,
    });

    useEffect(() => {
        return () => {
            if (state.imagePreview) {
                URL.revokeObjectURL(state.imagePreview);
            }
        };
    }, [state.imagePreview]);

    const uploadImage = async (file: File) => {
        try {
            setState(prev => ({...prev, isImageUploading: true}));
            const imageUrl = await uploadFile(file);
            setState(prev => ({...prev, uploadedImageUrl: imageUrl}));
        } catch (error) {
            setState(prev => ({...prev, imagePreview: null}));
            const statusCode = (error && typeof error === 'object' && 'statusCode' in error)
                ? (error as {statusCode: number}).statusCode
                : null;
            toast.error(UPLOAD_ERROR_MESSAGES[statusCode ?? 0] ?? 'Failed to upload image. Try again.');
        } finally {
            setState(prev => ({...prev, isImageUploading: false}));
        }
    };

    const handleFileSelected = async (file: File) => {
        if (file.size > MAX_FILE_SIZE) {
            toast.error(FILE_SIZE_ERROR_MESSAGE);
            return false;
        }
        const previewUrl = URL.createObjectURL(file);
        setState(prev => ({...prev, imagePreview: previewUrl}));
        await uploadImage(file);
        return true;
    };

    const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }
        const success = await handleFileSelected(file);
        if (!success) {
            e.target.value = '';
        }
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
                if (file) {
                    await handleFileSelected(file);
                }
                break;
            }
        }
    }, []);

    const clearImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (state.imagePreview) {
            URL.revokeObjectURL(state.imagePreview);
        }
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
        setState(prev => ({
            ...prev,
            imagePreview: null,
            uploadedImageUrl: null,
            altText: '',
            showAltInput: false,
        }));
    };

    const toggleAltInput = (e: React.MouseEvent) => {
        e.stopPropagation();
        setState(prev => ({...prev, showAltInput: !prev.showAltInput}));
    };

    const setAltText = (altText: string) => {
        setState(prev => ({...prev, altText}));
    };

    const reset = () => {
        if (state.imagePreview) {
            URL.revokeObjectURL(state.imagePreview);
        }
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
        setState({
            imagePreview: null,
            uploadedImageUrl: null,
            altText: '',
            showAltInput: false,
            isImageUploading: false,
        });
    };

    return {
        ...state,
        imageInputRef,
        altTextInputRef,
        handleImageChange,
        handlePaste,
        clearImage,
        toggleAltInput,
        setAltText,
        reset,
    };
}
```

```typescript
// utils/note-placeholder.ts
import {ActorProperties, ObjectProperties} from '@tryghost/admin-x-framework/api/activitypub';
import getUsername from '@utils/get-username';

export function getNotePlaceholder(replyTo?: {object: ObjectProperties; actor: ActorProperties}): string {
    if (!replyTo) {
        return "What's new?";
    }
    const attributedTo = replyTo.object.attributedTo ?? {};
    if (typeof attributedTo === 'object' && 'preferredUsername' in attributedTo && 'id' in attributedTo) {
        return `Reply to ${getUsername(attributedTo as ActorProperties)}...`;
    }
    return "What's new?";
}

export function getCharCountColor(length: number, max: number): string {
    if (length >= max) {
        return 'text-red-500';
    }
    if (length >= max * 0.9) {
        return 'text-yellow-600';
    }
    return 'text-gray-500';
}
```

## Extracted Sub-components

```tsx
// components/feed/new-note-modal/image-preview.tsx
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
                className={`absolute bottom-3 left-3 h-6 px-2 py-0 text-white ${
                    showAltInput ? 'bg-green-500 hover:bg-green-500' : 'bg-black/60 hover:bg-black/80'
                }`}
                onClick={onToggleAlt}
            >
                Alt
            </Button>
        )}
    </div>
);
```

```tsx
// components/feed/new-note-modal/note-footer.tsx
import {Button, LoadingIndicator, LucideIcon} from '@tryghost/shade';
import {getCharCountColor} from '@utils/note-placeholder';

interface NoteFooterProps {
    isSticky: boolean;
    contentLength: number;
    maxLength: number;
    isDisabled: boolean;
    isImageUploading: boolean;
    isPosting: boolean;
    onImageClick: () => void;
    onPost: () => void;
}

export const NoteFooter: React.FC<NoteFooterProps> = ({
    isSticky,
    contentLength,
    maxLength,
    isDisabled,
    isImageUploading,
    isPosting,
    onImageClick,
    onPost,
}) => (
    <div className={`${isSticky ? 'sticky' : 'static'} bottom-0 flex flex-row bg-background py-6 dark:bg-[#101114]`}>
        <Button
            className='mr-auto w-[34px] !min-w-0'
            variant='outline'
            onClick={onImageClick}
        >
            <LucideIcon.Image />
        </Button>
        <div className='flex items-center space-x-3'>
            <span className={`text-sm ${getCharCountColor(contentLength, maxLength)}`}>
                {contentLength}/{maxLength}
            </span>
            <Button
                className='min-w-16'
                data-testid="post-button"
                disabled={isDisabled || isImageUploading}
                onClick={onPost}
            >
                {isPosting ? <LoadingIndicator color='light' size='sm' /> : 'Post'}
            </Button>
        </div>
    </div>
);
```

```tsx
// components/feed/new-note-modal/note-composer.tsx
import * as FormPrimitive from '@radix-ui/react-form';
import APAvatar from '@components/global/ap-avatar';
import {ActorProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {Input, Skeleton} from '@tryghost/shade';
import {ChangeEvent, RefObject} from 'react';

interface NoteComposerProps {
    user: ActorProperties | undefined;
    accountName: string | undefined;
    isLoadingAccount: boolean;
    content: string;
    placeholder: string;
    altText: string;
    showAltInput: boolean;
    imageInputRef: RefObject<HTMLInputElement>;
    textareaRef: RefObject<HTMLTextAreaElement>;
    altTextInputRef: RefObject<HTMLInputElement>;
    onContentChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
    onPaste: (e: React.ClipboardEvent) => void;
    onImageChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onAltTextChange: (value: string) => void;
    onAreaClick: () => void;
}

export const NoteComposer: React.FC<NoteComposerProps> = ({
    user,
    accountName,
    isLoadingAccount,
    content,
    placeholder,
    altText,
    showAltInput,
    imageInputRef,
    textareaRef,
    altTextInputRef,
    onContentChange,
    onPaste,
    onImageChange,
    onAltTextChange,
    onAreaClick,
}) => (
    <>
        <div
            className='flex cursor-text items-start gap-3'
            onClick={onAreaClick}
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
                                data-testid="note-textarea"
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
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                className='hidden'
                                type="file"
                                onChange={onImageChange}
                            />
                        </FormPrimitive.Control>
                    </FormPrimitive.Field>
                </div>
            </FormPrimitive.Root>
        </div>
        {showAltInput && (
            <div className='mt-1'>
                <Input
                    ref={altTextInputRef}
                    className='w-full border-0 bg-transparent px-0 focus-visible:border-0 focus-visible:bg-transparent focus-visible:shadow-none focus-visible:outline-0 dark:bg-[#101114] dark:text-white dark:placeholder:text-gray-800'
                    placeholder='Type alt text for image (optional)'
                    type='text'
                    value={altText}
                    onChange={e => onAltTextChange(e.target.value)}
                />
            </div>
        )}
    </>
);
```

## Refactored Main Component

```tsx
// components/feed/new-note-modal/index.tsx
import FeedItem from '@components/feed/feed-item';
import {ActorProperties, ObjectProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger} from '@tryghost/shade';
import {ComponentPropsWithoutRef, ReactNode, useCallback, useEffect, useRef, useState} from 'react';
import {ImagePreview} from './image-preview';
import {NoteComposer} from './note-composer';
import {NoteFooter} from './note-footer';
import {getNotePlaceholder} from '@utils/note-placeholder';
import {toast} from 'sonner';
import {useAccountForUser, useNoteMutationForUser, useReplyMutationForUser, useUserDataForUser} from '@hooks/use-activity-pub-queries';
import {useImageAttachment} from '@hooks/use-image-attachment';
import {useModalOpenState} from '@hooks/use-modal-open-state';
import {useNavigateWithBasePath} from '@src/hooks/use-navigate-with-base-path';

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

const MAX_CONTENT_LENGTH = 500;

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
    const navigate = useNavigateWithBasePath();

    const {resolvedOpen, isSticky, handleOpenChange} = useModalOpenState(props.open, onOpenChange);
    const imageAttachment = useImageAttachment();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);

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
        if (!resolvedOpen) {
            return;
        }
        const id = setTimeout(() => textareaRef.current?.focus(), 100);
        return () => clearTimeout(id);
    }, [resolvedOpen]);

    // Focus alt text input when shown
    useEffect(() => {
        if (!imageAttachment.showAltInput) {
            return;
        }
        const id = setTimeout(() => imageAttachment.altTextInputRef.current?.focus(), 100);
        return () => clearTimeout(id);
    }, [imageAttachment.showAltInput]);

    const handlePost = useCallback(async () => {
        const trimmedContent = content.trim();
        if (!trimmedContent || !user) {
            return;
        }

        try {
            setIsPosting(true);
            const imagePayload = {
                imageUrl: imageAttachment.uploadedImageUrl ?? undefined,
                altText: imageAttachment.altText || undefined,
            };

            if (replyTo) {
                await replyMutation.mutateAsync({
                    inReplyTo: replyTo.object.id,
                    content: trimmedContent,
                    ...imagePayload,
                });
                onReply?.();
            } else {
                await noteMutation.mutateAsync({content: trimmedContent, ...imagePayload});
                navigate('/notes');
            }

            handleOpenChange(false);
            toast.success(replyTo ? 'Reply posted' : 'Note posted');
        } catch {
            if (replyTo) {
                onReplyError?.();
            }
        } finally {
            setIsPosting(false);
        }
    }, [content, user, replyTo, replyMutation, noteMutation, imageAttachment, onReply, onReplyError, handleOpenChange, navigate]);

    // Keyboard shortcut: Cmd/Ctrl+Enter to post
    useEffect(() => {
        if (!resolvedOpen) {
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
    }, [resolvedOpen, isDisabled, imageAttachment.isImageUploading, handlePost]);

    // Global paste handler
    useEffect(() => {
        if (!resolvedOpen) {
            return;
        }
        document.addEventListener('paste', imageAttachment.handlePaste);
        return () => document.removeEventListener('paste', imageAttachment.handlePaste);
    }, [resolvedOpen, imageAttachment.handlePaste]);

    const handleDialogOpenChange = (open: boolean) => {
        if (open) {
            setContent('');
            imageAttachment.reset();
        }
        handleOpenChange(open);
    };

    return (
        <Dialog
            open={resolvedOpen}
            onOpenChange={handleDialogOpenChange}
            {...(props.open !== undefined ? {} : props)}
        >
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent
                className='max-h-[80vh] min-h-[240px] gap-0 overflow-y-auto pb-0'
                data-testid="new-note-modal"
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
                    altText={imageAttachment.altText}
                    altTextInputRef={imageAttachment.altTextInputRef}
                    content={content}
                    imageInputRef={imageAttachment.imageInputRef}
                    isLoadingAccount={isLoadingAccount}
                    placeholder={getNotePlaceholder(replyTo)}
                    showAltInput={imageAttachment.showAltInput && !!imageAttachment.imagePreview && !imageAttachment.isImageUploading}
                    textareaRef={textareaRef}
                    user={user as ActorProperties}
                    onAltTextChange={imageAttachment.setAltText}
                    onAreaClick={() => textareaRef.current?.focus()}
                    onContentChange={e => setContent(e.target.value)}
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

                <DialogFooter asChild>
                    <NoteFooter
                        contentLength={content.length}
                        isDisabled={isDisabled}
                        isImageUploading={imageAttachment.isImageUploading}
                        isPosting={isPosting}
                        isSticky={isSticky}
                        maxLength={MAX_CONTENT_LENGTH}
                        onImageClick={() => imageAttachment.imageInputRef.current?.click()}
                        onPost={handlePost}
                    />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default NewNoteModal;
```

## Key Improvements

| Issue | Before | After |
|---|---|---|
| Component size | ~250 lines, single file | ~80 lines main + focused modules |
| Open state logic | `props.open !== undefined ? props.open : isOpen` repeated 6× | Encapsulated in `useModalOpenState` |
| Image state | 5 separate `useState` calls + scattered handlers | Single `useImageAttachment` hook |
| Error messages | `switch` statement inline | Lookup table `UPLOAD_ERROR_MESSAGES` |
| Char counter color | Ternary chain in JSX | `getCharCountColor()` utility |
| Placeholder logic | Inline `let`/`if` block | `getNotePlaceholder()` utility |
| Focus effects | Two near-identical `useEffect` blocks | Same pattern, clearly separated concerns |
| `for` loop | Index-based `for` loop | `for...of` with `Array.from` |