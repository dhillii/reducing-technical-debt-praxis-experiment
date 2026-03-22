I'll analyze the code and identify the main complexity issues:

1. **Too many state variables** - can be grouped into related objects
2. **Mixed concerns** - image handling, posting logic, and UI are all in one component
3. **Repeated `props.open !== undefined ? props.open : isOpen` pattern**
4. **Large component** - should be split into smaller pieces
5. **Multiple scattered useEffects** - some can be consolidated

Here's the refactored code:

```typescript
// hooks/use-modal-open.ts
import {useEffect, useState} from 'react';

export function useModalOpen(externalOpen?: boolean, onOpenChange?: (open: boolean) => void) {
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
    preview: string | null;
    uploadedUrl: string | null;
    altText: string;
    showAltInput: boolean;
    isUploading: boolean;
}

const INITIAL_IMAGE_STATE: ImageAttachmentState = {
    preview: null,
    uploadedUrl: null,
    altText: '',
    showAltInput: false,
    isUploading: false
};

const IMAGE_UPLOAD_ERROR_MESSAGES: Record<number, string> = {
    413: 'Image size exceeds limit.',
    415: 'The file type is not supported.'
};

export function useImageAttachment() {
    const [state, setState] = useState<ImageAttachmentState>(INITIAL_IMAGE_STATE);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);

    const updateState = (updates: Partial<ImageAttachmentState>) =>
        setState(prev => ({...prev, ...updates}));

    const revokePreview = useCallback((preview: string | null) => {
        if (preview) {
            URL.revokeObjectURL(preview);
        }
    }, []);

    useEffect(() => {
        return () => revokePreview(state.preview);
    }, [state.preview, revokePreview]);

    useEffect(() => {
        if (state.showAltInput && altTextInputRef.current) {
            const id = setTimeout(() => altTextInputRef.current?.focus(), 100);
            return () => clearTimeout(id);
        }
    }, [state.showAltInput]);

    const uploadImage = async (file: File) => {
        try {
            updateState({isUploading: true});
            const imageUrl = await uploadFile(file);
            updateState({uploadedUrl: imageUrl});
        } catch (error) {
            updateState({preview: null});
            const statusCode = (error && typeof error === 'object' && 'statusCode' in error)
                ? (error as {statusCode: number}).statusCode
                : null;
            const message = (statusCode && IMAGE_UPLOAD_ERROR_MESSAGES[statusCode])
                ?? 'Failed to upload image. Try again.';
            toast.error(message);
        } finally {
            updateState({isUploading: false});
        }
    };

    const handleFileSelected = async (file: File) => {
        if (file.size > MAX_FILE_SIZE) {
            toast.error(FILE_SIZE_ERROR_MESSAGE);
            return false;
        }
        const preview = URL.createObjectURL(file);
        updateState({preview});
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
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const clearImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        revokePreview(state.preview);
        setState(INITIAL_IMAGE_STATE);
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    };

    const toggleAltInput = (e: React.MouseEvent) => {
        e.stopPropagation();
        updateState({showAltInput: !state.showAltInput});
    };

    const reset = () => {
        revokePreview(state.preview);
        setState(INITIAL_IMAGE_STATE);
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    };

    return {
        ...state,
        imageInputRef,
        altTextInputRef,
        setAltText: (altText: string) => updateState({altText}),
        handleImageChange,
        handlePaste,
        clearImage,
        toggleAltInput,
        reset
    };
}
```

```typescript
// hooks/use-note-post.ts
import {useCallback, useState} from 'react';
import {ActorProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {toast} from 'sonner';
import {useNoteMutationForUser, useReplyMutationForUser} from '@hooks/use-activity-pub-queries';
import {useNavigateWithBasePath} from '@src/hooks/use-navigate-with-base-path';
import {NewNoteModalProps} from './types';

interface PostOptions {
    content: string;
    user: ActorProperties | null | undefined;
    uploadedImageUrl: string | null;
    altText: string;
    onClose: () => void;
}

export function useNotePost(
    replyTo: NewNoteModalProps['replyTo'],
    onReply?: () => void,
    onReplyError?: () => void
) {
    const [isPosting, setIsPosting] = useState(false);
    const noteMutation = useNoteMutationForUser('index');
    const replyMutation = useReplyMutationForUser('index');
    const navigate = useNavigateWithBasePath();

    const post = useCallback(async ({content, user, uploadedImageUrl, altText, onClose}: PostOptions) => {
        const trimmedContent = content.trim();
        if (!trimmedContent || !user) {
            return;
        }

        try {
            setIsPosting(true);

            if (replyTo) {
                await replyMutation.mutateAsync({
                    inReplyTo: replyTo.object.id,
                    content: trimmedContent,
                    imageUrl: uploadedImageUrl ?? undefined,
                    altText: altText || undefined
                });
                onReply?.();
            } else {
                await noteMutation.mutateAsync({
                    content: trimmedContent,
                    imageUrl: uploadedImageUrl ?? undefined,
                    altText: altText || undefined
                });
                navigate('/notes');
            }

            onClose();
            toast.success(replyTo ? 'Reply posted' : 'Note posted');
        } catch {
            if (replyTo) {
                onReplyError?.();
            }
        } finally {
            setIsPosting(false);
        }
    }, [replyTo, replyMutation, noteMutation, onReply, onReplyError, navigate]);

    return {isPosting, post};
}
```

```typescript
// components/new-note-modal/types.ts
import {ComponentPropsWithoutRef, ReactNode} from 'react';
import {ActorProperties, ObjectProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {Dialog} from '@tryghost/shade';

export interface NewNoteModalProps extends ComponentPropsWithoutRef<typeof Dialog> {
    children?: ReactNode;
    replyTo?: {
        object: ObjectProperties;
        actor: ActorProperties;
    };
    onReply?: () => void;
    onReplyError?: () => void;
    onOpenChange?: (open: boolean) => void;
}
```

```typescript
// components/new-note-modal/image-preview.tsx
import {Button, LoadingIndicator, LucideIcon} from '@tryghost/shade';

interface ImagePreviewProps {
    preview: string;
    isUploading: boolean;
    showAltInput: boolean;
    onClear: (e: React.MouseEvent) => void;
    onToggleAlt: (e: React.MouseEvent) => void;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({
    preview,
    isUploading,
    showAltInput,
    onClear,
    onToggleAlt
}) => (
    <div className='group relative mt-6 flex min-h-[200px] w-full items-center justify-center'>
        <img
            alt='Image attachment preview'
            className={`max-h-[320px] w-full rounded-sm object-cover outline outline-1 -outline-offset-1 outline-black/10 ${isUploading ? 'opacity-10' : ''}`}
            src={preview}
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
// components/new-note-modal/content-counter.tsx
const WARN_THRESHOLD = 0.9;

interface ContentCounterProps {
    length: number;
    maxLength: number;
}

export const ContentCounter: React.FC<ContentCounterProps> = ({length, maxLength}) => {
    const colorClass = length >= maxLength
        ? 'text-red-500'
        : length >= maxLength * WARN_THRESHOLD
            ? 'text-yellow-600'
            : 'text-gray-500';

    return (
        <div className={`text-sm ${colorClass}`}>
            {length}/{maxLength}
        </div>
    );
};
```

```typescript
// components/new-note-modal/index.tsx
import * as FormPrimitive from '@radix-ui/react-form';
import APAvatar from '@components/global/ap-avatar';
import FeedItem from '@components/feed/feed-item';
import getUsername from '@utils/get-username';
import {ActorProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, LoadingIndicator, LucideIcon, Skeleton} from '@tryghost/shade';
import {useCallback, useEffect, useRef, useState} from 'react';
import {useAccountForUser, useUserDataForUser} from '@hooks/use-activity-pub-queries';
import {ImagePreview} from './image-preview';
import {ContentCounter} from './content-counter';
import {NewNoteModalProps} from './types';
import {useImageAttachment} from '@hooks/use-image-attachment';
import {useModalOpen} from '@hooks/use-modal-open';
import {useNotePost} from '@hooks/use-note-post';

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
    const {data: account, isLoading: isLoadingAccount} = useAccountForUser('index', 'me');

    const [content, setContent] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const {resolvedOpen, isSticky, handleOpenChange} = useModalOpen(props.open, onOpenChange);
    const image = useImageAttachment();
    const {isPosting, post} = useNotePost(replyTo, onReply, onReplyError);

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

    // Keyboard shortcut: Cmd/Ctrl+Enter to post
    useEffect(() => {
        if (!resolvedOpen) {
            return;
        }
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isDisabled && !image.isUploading) {
                    handlePost();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [resolvedOpen, isDisabled, image.isUploading]); // eslint-disable-line react-hooks/exhaustive-deps

    // Global paste handler
    useEffect(() => {
        if (!resolvedOpen) {
            return;
        }
        document.addEventListener('paste', image.handlePaste);
        return () => document.removeEventListener('paste', image.handlePaste);
    }, [resolvedOpen, image.handlePaste]);

    const handlePost = useCallback(() => {
        post({
            content,
            user: user as ActorProperties,
            uploadedImageUrl: image.uploadedUrl,
            altText: image.altText,
            onClose: () => handleOpenChange(false)
        });
    }, [content, user, image.uploadedUrl, image.altText, post, handleOpenChange]);

    const handleDialogOpenChange = (open: boolean) => {
        if (open) {
            setContent('');
            image.reset();
        }
        handleOpenChange(open);
    };

    const placeholder = getPlaceholder(replyTo);

    return (
        <Dialog
            open={resolvedOpen}
            onOpenChange={handleDialogOpenChange}
            {...(props.open !== undefined ? {} : props)}
        >
            <DialogTrigger asChild>{children}</DialogTrigger>
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

                <div
                    className={`flex ${!image.preview ? 'min-h-36' : ''} cursor-text items-start gap-3`}
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
                                        data-testid="note-textarea"
                                        placeholder={placeholder}
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
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        className='hidden'
                                        type="file"
                                        onChange={image.handleImageChange}
                                    />
                                </FormPrimitive.Control>
                            </FormPrimitive.Field>
                        </div>
                    </FormPrimitive.Root>
                </div>

                {image.preview && (
                    <ImagePreview
                        isUploading={image.isUploading}
                        preview={image.preview}
                        showAltInput={image.showAltInput}
                        onClear={image.clearImage}
                        onToggleAlt={image.toggleAltInput}
                    />
                )}

                {image.preview && !image.isUploading && image.showAltInput && (
                    <div className='mt-1'>
                        <Input
                            ref={image.altTextInputRef}
                            className='w-full border-0 bg-transparent px-0 focus-visible:border-0 focus-visible:bg-transparent focus-visible:shadow-none focus-visible:outline-0 dark:bg-[#101114] dark:text-white dark:placeholder:text-gray-800'
                            placeholder='Type alt text for image (optional)'
                            type='text'
                            value={image.altText}
                            onChange={e => image.setAltText(e.target.value)}
                        />
                    </div>
                )}

                <DialogFooter className={`${isSticky ? 'sticky' : 'static'} bottom-0 flex-row bg-background py-6 dark:bg-[#101114]`}>
                    <Button
                        className='mr-auto w-[34px] !min-w-0'
                        variant='outline'
                        onClick={() => image.imageInputRef.current?.click()}
                    >
                        <LucideIcon.Image />
                    </Button>
                    <div className='flex items-center space-x-3'>
                        <ContentCounter length={content.length} maxLength={MAX_CONTENT_LENGTH} />
                        <Button
                            className='min-w-16'
                            data-testid="post-button"
                            disabled={isDisabled || image.isUploading}
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

// Pure helper - no need to be inside component
function getPlaceholder(replyTo: NewNoteModalProps['replyTo']): string {
    if (!replyTo) {
        return "What's new?";
    }
    const attributedTo = replyTo.object.attributedTo ?? {};
    if (typeof attributedTo === 'object' && 'preferredUsername' in attributedTo && 'id' in attributedTo) {
        return `Reply to ${getUsername(attributedTo as ActorProperties)}...`;
    }
    return "What's new?";
}

export default NewNoteModal;
```

## Summary of Changes

### Extracted Custom Hooks
| Hook | Responsibility |
|------|---------------|
| `useModalOpen` | Manages open/sticky state and external prop sync |
| `useImageAttachment` | All image state, upload, paste, clear, alt text logic |
| `useNotePost` | Post/reply mutation logic and navigation |

### Extracted Components
- **`ImagePreview`** — isolated image preview with upload overlay and action buttons
- **`ContentCounter`** — character count display with color thresholds

### Other Improvements
- **Grouped related state** into objects (`ImageAttachmentState`) instead of 5+ separate `useState` calls
- **Eliminated repeated pattern** `props.open !== undefined ? props.open : isOpen` via `resolvedOpen`
- **Extracted `getPlaceholder`** as a pure function outside the component
- **Replaced `for` loop** with `Array.from` + `for...of` in paste handler
- **Centralized error messages** in a lookup map (`IMAGE_UPLOAD_ERROR_MESSAGES`)
- **Moved `MAX_CONTENT_LENGTH`** to module scope (was re-created on every render)