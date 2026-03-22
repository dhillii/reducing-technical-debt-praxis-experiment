# Refactored NewNoteModal

The main improvements focus on:
1. **Extracting custom hooks** to separate concerns
2. **Extracting smaller components** to reduce JSX complexity
3. **Consolidating related state** into logical groups
4. **Eliminating duplicate logic** (e.g., `modalIsOpen` computed repeatedly)

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
        if (!modalIsOpen) {
            setIsSticky(false);
            return;
        }
        const timer = setTimeout(() => setIsSticky(true), 300);
        return () => clearTimeout(timer);
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
// components/new-note-modal/note-footer.tsx
import {Button, LoadingIndicator, LucideIcon} from '@tryghost/shade';

const MAX_CONTENT_LENGTH = 500;

const getCounterColor = (length: number) => {
    if (length >= MAX_CONTENT_LENGTH) {
        return 'text-red-500';
    }
    if (length >= MAX_CONTENT_LENGTH * 0.9) {
        return 'text-yellow-600';
    }
    return 'text-gray-500';
};

interface NoteFooterProps {
    isSticky: boolean;
    contentLength: number;
    isDisabled: boolean;
    isImageUploading: boolean;
    isPosting: boolean;
    onImageClick: () => void;
    onPost: () => void;
}

export const NoteFooter: React.FC<NoteFooterProps> = ({
    isSticky,
    contentLength,
    isDisabled,
    isImageUploading,
    isPosting,
    onImageClick,
    onPost,
}) => (
    <DialogFooter className={`${isSticky ? 'sticky' : 'static'} bottom-0 flex-row bg-background py-6 dark:bg-[#101114]`}>
        <Button className='mr-auto w-[34px] !min-w-0' variant='outline' onClick={onImageClick}>
            <LucideIcon.Image />
        </Button>
        <div className='flex items-center space-x-3'>
            <span className={`text-sm ${getCounterColor(contentLength)}`}>
                {contentLength}/{MAX_CONTENT_LENGTH}
            </span>
            <Button
                className='min-w-16'
                data-testid='post-button'
                disabled={isDisabled || isImageUploading}
                onClick={onPost}
            >
                {isPosting ? <LoadingIndicator color='light' size='sm' /> : 'Post'}
            </Button>
        </div>
    </DialogFooter>
);
```

---

## Refactored Main Component

```typescript
import * as FormPrimitive from '@radix-ui/react-form';
import APAvatar from '@components/global/ap-avatar';
import FeedItem from '@components/feed/feed-item';
import getUsername from '@utils/get-username';
import {ActorProperties, ObjectProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Input, Skeleton} from '@tryghost/shade';
import {ComponentPropsWithoutRef, ReactNode, useCallback, useEffect, useRef, useState} from 'react';
import {ImagePreview} from './image-preview';
import {NoteFooter} from './note-footer';
import {toast} from 'sonner';
import {useAccountForUser, useNoteMutationForUser, useReplyMutationForUser, useUserDataForUser} from '@hooks/use-activity-pub-queries';
import {useImageAttachment} from '@hooks/use-image-attachment';
import {useModalState} from '@hooks/use-modal-state';
import {useNavigateWithBasePath} from '@src/hooks/use-navigate-with-base-path';

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

const getPlaceholder = (replyTo?: NewNoteModalProps['replyTo']): string => {
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
    const {data: account, isLoading: isLoadingAccount} = useAccountForUser('index', 'me');
    const noteMutation = useNoteMutationForUser('index', user);
    const replyMutation = useReplyMutationForUser('index', user);
    const navigate = useNavigateWithBasePath();

    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);

    const image = useImageAttachment();
    const {isOpen, isSticky, modalIsOpen, handleOpenChange} = useModalState(props.open, onOpenChange);

    const isDisabled = !content.trim() || !user || isPosting || content.length > MAX_CONTENT_LENGTH;

    const resetForm = useCallback(() => {
        setContent('');
        image.clearImage();
    }, [image]);

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
    }, [modalIsOpen, isDisabled, image.isImageUploading]); // eslint-disable-line react-hooks/exhaustive-deps

    // Global paste handler
    useEffect(() => {
        if (!modalIsOpen) {
            return;
        }
        document.addEventListener('paste', image.handlePaste);
        return () => document.removeEventListener('paste', image.handlePaste);
    }, [modalIsOpen, image.handlePaste]);

    const handlePost = useCallback(async () => {
        const trimmedContent = content.trim();
        if (!trimmedContent || !user) {
            return;
        }

        try {
            setIsPosting(true);
            const imagePayload = {
                imageUrl: image.uploadedImageUrl ?? undefined,
                altText: image.altText ?? undefined,
            };

            if (replyTo) {
                await replyMutation.mutateAsync({inReplyTo: replyTo.object.id, content: trimmedContent, ...imagePayload});
                onReply?.();
            } else {
                await noteMutation.mutateAsync({content: trimmedContent, ...imagePayload});
                navigate('/notes');
            }

            handleOpenChange(false, resetForm);
            toast.success(replyTo ? 'Reply posted' : 'Note posted');
        } catch {
            replyTo && onReplyError?.();
        } finally {
            setIsPosting(false);
        }
    }, [content, user, replyTo, replyMutation, noteMutation, image.uploadedImageUrl, image.altText, onReply, onReplyError, navigate, handleOpenChange, resetForm]);

    return (
        <Dialog
            open={props.open !== undefined ? props.open : isOpen}
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

                <div
                    className={`flex ${!image.imagePreview ? 'min-h-36' : ''} cursor-text items-start gap-3`}
                    onClick={() => textareaRef.current?.focus()}
                >
                    <div className='sticky top-0'>
                        <APAvatar author={user as ActorProperties} />
                    </div>
                    <FormPrimitive.Root asChild>
                        <div className='-mt-0.5 flex w-full flex-col gap-0.5'>
                            {isLoadingAccount
                                ? <Skeleton className='w-10' />
                                : <span className='min-w-0 truncate whitespace-nowrap font-semibold text-black break-anywhere dark:text-white'>{account?.name}</span>
                            }
                            <FormPrimitive.Field name='content' asChild>
                                <FormPrimitive.Control asChild>
                                    <textarea
                                        ref={textareaRef}
                                        autoFocus
                                        className='ap-textarea w-full resize-none bg-transparent text-[1.5rem] break-anywhere'
                                        data-testid='note-textarea'
                                        placeholder={getPlaceholder(replyTo)}
                                        rows={1}
                                        value={content}
                                        onChange={e => setContent(e.target.value)}
                                        onPaste={image.handlePaste}
                                    />
                                </FormPrimitive.Control>
                            </FormPrimitive.Field>
                            <FormPrimitive.Field name='image' asChild>
                                <FormPrimitive.Control asChild>
                                    <input
                                        ref={image.imageInputRef}
                                        accept='image/jpeg,image/png,image/webp,image/gif'
                                        className='hidden'
                                        type='file'
                                        onChange={image.handleImageChange}
                                    />
                                </FormPrimitive.Control>
                            </FormPrimitive.Field>
                        </div>
                    </FormPrimitive.Root>
                </div>

                {image.imagePreview && (
                    <ImagePreview
                        isUploading={image.isImageUploading}
                        showAltInput={image.showAltInput}
                        src={image.imagePreview}
                        onClear={(e) => { e.stopPropagation(); image.clearImage(); }}
                        onToggleAlt={(e) => { e.stopPropagation(); image.setShowAltInput(v => !v); }}
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

                <NoteFooter
                    contentLength={content.length}
                    isDisabled={isDisabled}
                    isImageUploading={image.isImageUploading}
                    isPosting={isPosting}
                    isSticky={isSticky}
                    onImageClick={() => image.imageInputRef.current?.click()}
                    onPost={handlePost}
                />
            </DialogContent>
        </Dialog>
    );
};

export default NewNoteModal;
```

---

## Key Changes Summary

| Issue | Before | After |
|---|---|---|
| Modal open state logic | Duplicated `props.open !== undefined ? props.open : isOpen` 5+ times | Encapsulated in `useModalState` hook via `modalIsOpen` |
| Image handling | ~80 lines of mixed state + logic in component | Isolated in `useImageAttachment` hook |
| Upload error mapping | `switch` statement inline | Lookup table `UPLOAD_ERROR_MESSAGES` |
| Footer JSX | Inline with counter color logic | Extracted `NoteFooter` with `getCounterColor` helper |
| Image preview JSX | Inline with conditional buttons | Extracted `ImagePreview` component |
| Placeholder logic | Inline `let` + mutation | Pure `getPlaceholder` function |
| Form reset | Duplicated across `handlePost` and `onOpenChange` | Single `resetForm` callback |