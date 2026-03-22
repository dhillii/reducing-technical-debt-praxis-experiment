I'll analyze the code and identify the main complexity issues:

1. **Too many state variables** - can be grouped into related objects
2. **Mixed concerns** - image handling, posting logic, and UI are all in one component
3. **Repeated `props.open !== undefined ? props.open : isOpen` pattern**
4. **Large component** - should be split into smaller pieces
5. **Multiple similar useEffects** - can be consolidated

Let me refactor this systematically:

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

const INITIAL_STATE: ImageAttachmentState = {
    preview: null,
    uploadedUrl: null,
    altText: '',
    showAltInput: false,
    isUploading: false
};

const ERROR_MESSAGES: Record<number, string> = {
    413: 'Image size exceeds limit.',
    415: 'The file type is not supported.'
};

export function useImageAttachment() {
    const [state, setState] = useState<ImageAttachmentState>(INITIAL_STATE);
    const inputRef = useRef<HTMLInputElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);

    const updateState = (updates: Partial<ImageAttachmentState>) =>
        setState(prev => ({...prev, ...updates}));

    const revokePreview = useCallback((url: string | null) => {
        if (url) {
            URL.revokeObjectURL(url);
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
            toast.error(ERROR_MESSAGES[statusCode ?? 0] ?? 'Failed to upload image. Try again.');
        } finally {
            updateState({isUploading: false});
        }
    };

    const handleFileSelected = async (file: File) => {
        if (file.size > MAX_FILE_SIZE) {
            toast.error(FILE_SIZE_ERROR_MESSAGE);
            return false;
        }
        updateState({preview: URL.createObjectURL(file)});
        await uploadImage(file);
        return true;
    };

    const handleInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
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
        setState(INITIAL_STATE);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    const toggleAltInput = (e: React.MouseEvent) => {
        e.stopPropagation();
        updateState({showAltInput: !state.showAltInput});
    };

    const reset = () => {
        revokePreview(state.preview);
        setState(INITIAL_STATE);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    return {
        state,
        inputRef,
        altTextInputRef,
        setAltText: (altText: string) => updateState({altText}),
        handleInputChange,
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
import {ActorProperties, ObjectProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {useNoteMutationForUser, useReplyMutationForUser} from '@hooks/use-activity-pub-queries';
import {toast} from 'sonner';
import {useNavigateWithBasePath} from '@src/hooks/use-navigate-with-base-path';

interface ReplyTarget {
    object: ObjectProperties;
    actor: ActorProperties;
}

interface PostOptions {
    content: string;
    imageUrl?: string;
    altText?: string;
    replyTo?: ReplyTarget;
    user: ActorProperties | null | undefined;
    onSuccess?: () => void;
    onError?: () => void;
    onClose?: () => void;
}

export function useNotePost(user: ActorProperties | null | undefined) {
    const [isPosting, setIsPosting] = useState(false);
    const noteMutation = useNoteMutationForUser('index', user);
    const replyMutation = useReplyMutationForUser('index', user);
    const navigate = useNavigateWithBasePath();

    const post = useCallback(async ({
        content,
        imageUrl,
        altText,
        replyTo,
        onSuccess,
        onError,
        onClose
    }: Omit<PostOptions, 'user'>) => {
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
                    imageUrl: imageUrl || undefined,
                    altText: altText || undefined
                });
                onSuccess?.();
            } else {
                await noteMutation.mutateAsync({
                    content: trimmedContent,
                    imageUrl: imageUrl || undefined,
                    altText: altText || undefined
                });
                navigate('/notes');
            }

            onClose?.();
            toast.success(replyTo ? 'Reply posted' : 'Note posted');
        } catch {
            if (replyTo) {
                onError?.();
            }
        } finally {
            setIsPosting(false);
        }
    }, [user, replyMutation, noteMutation, navigate]);

    return {isPosting, post};
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
// components/new-note-modal/note-content-area.tsx
import * as FormPrimitive from '@radix-ui/react-form';
import APAvatar from '@components/global/ap-avatar';
import {ActorProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {Skeleton} from '@tryghost/shade';
import {RefObject} from 'react';

interface NoteContentAreaProps {
    user: ActorProperties | null | undefined;
    accountName: string | undefined;
    isLoadingAccount: boolean;
    content: string;
    placeholder: string;
    textareaRef: RefObject<HTMLTextAreaElement>;
    imageInputRef: RefObject<HTMLInputElement>;
    onContentChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onPaste: (e: React.ClipboardEvent) => void;
    onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onAreaClick: () => void;
}

export const NoteContentArea: React.FC<NoteContentAreaProps> = ({
    user,
    accountName,
    isLoadingAccount,
    content,
    placeholder,
    textareaRef,
    imageInputRef,
    onContentChange,
    onPaste,
    onImageChange,
    onAreaClick
}) => (
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
);
```

```typescript
// components/new-note-modal/note-footer.tsx
import {Button, Input, LoadingIndicator, LucideIcon} from '@tryghost/shade';
import {RefObject} from 'react';

const MAX_CONTENT_LENGTH = 500;

interface NoteFooterProps {
    isSticky: boolean;
    content: string;
    isDisabled: boolean;
    isPosting: boolean;
    isImageUploading: boolean;
    showAltInput: boolean;
    altText: string;
    altTextInputRef: RefObject<HTMLInputElement>;
    onImageButtonClick: () => void;
    onPost: () => void;
    onAltTextChange: (value: string) => void;
}

const getCharCountColor = (length: number): string => {
    if (length >= MAX_CONTENT_LENGTH) {
        return 'text-red-500';
    }
    if (length >= MAX_CONTENT_LENGTH * 0.9) {
        return 'text-yellow-600';
    }
    return 'text-gray-500';
};

export const NoteFooter: React.FC<NoteFooterProps> = ({
    isSticky,
    content,
    isDisabled,
    isPosting,
    isImageUploading,
    showAltInput,
    altText,
    altTextInputRef,
    onImageButtonClick,
    onPost,
    onAltTextChange
}) => (
    <>
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
        <div className={`${isSticky ? 'sticky' : 'static'} bottom-0 flex flex-row bg-background py-6 dark:bg-[#101114]`}>
            <Button
                className='mr-auto w-[34px] !min-w-0'
                variant='outline'
                onClick={onImageButtonClick}
            >
                <LucideIcon.Image />
            </Button>
            <div className='flex items-center space-x-3'>
                <span className={`text-sm ${getCharCountColor(content.length)}`}>
                    {content.length}/{MAX_CONTENT_LENGTH}
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
    </>
);
```

```typescript
// utils/get-reply-placeholder.ts
import {ActorProperties, ObjectProperties} from '@tryghost/admin-x-framework/api/activitypub';
import getUsername from '@utils/get-username';

export function getReplyPlaceholder(object: ObjectProperties): string {
    const attributedTo = object.attributedTo ?? {};
    const isActor = typeof attributedTo === 'object'
        && 'preferredUsername' in attributedTo
        && 'id' in attributedTo;

    return isActor
        ? `Reply to ${getUsername(attributedTo as ActorProperties)}...`
        : "What's new?";
}
```

Now the main component, dramatically simplified:

```typescript
// components/new-note-modal/index.tsx
import FeedItem from '@components/feed/feed-item';
import {ActorProperties, ObjectProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger} from '@tryghost/shade';
import {ComponentPropsWithoutRef, ReactNode, useCallback, useEffect, useRef, useState} from 'react';
import {ImagePreview} from './image-preview';
import {NoteContentArea} from './note-content-area';
import {NoteFooter} from './note-footer';
import {getReplyPlaceholder} from '@utils/get-reply-placeholder';
import {useAccountForUser, useUserDataForUser} from '@hooks/use-activity-pub-queries';
import {useImageAttachment} from '@hooks/use-image-attachment';
import {useModalOpen} from '@hooks/use-modal-open';
import {useNotePost} from '@hooks/use-note-post';

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
    const {resolvedOpen, isSticky, handleOpenChange} = useModalOpen(props.open, onOpenChange);
    const image = useImageAttachment();
    const {isPosting, post} = useNotePost(user);

    const [content, setContent] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isDisabled && !image.state.isUploading) {
                e.preventDefault();
                handlePost();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [resolvedOpen, isDisabled, image.state.isUploading]); // eslint-disable-line react-hooks/exhaustive-deps

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
            imageUrl: image.state.uploadedUrl ?? undefined,
            altText: image.state.altText || undefined,
            replyTo,
            onSuccess: onReply,
            onError: onReplyError,
            onClose: () => handleOpenChange(false)
        });
    }, [content, image.state, replyTo, onReply, onReplyError, post, handleOpenChange]);

    const resetForm = () => {
        setContent('');
        image.reset();
    };

    const onDialogOpenChange = (open: boolean) => {
        if (open) {
            resetForm();
        }
        handleOpenChange(open);
    };

    return (
        <Dialog
            open={resolvedOpen}
            onOpenChange={onDialogOpenChange}
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

                <NoteContentArea
                    accountName={account?.name}
                    content={content}
                    imageInputRef={image.inputRef}
                    isLoadingAccount={isLoadingAccount}
                    placeholder={placeholder}
                    textareaRef={textareaRef}
                    user={user}
                    onAreaClick={() => textareaRef.current?.focus()}
                    onContentChange={e => setContent(e.target.value)}
                    onImageChange={image.handleInputChange}
                    onPaste={image.handlePaste}
                />

                {image.state.preview && (
                    <ImagePreview
                        isUploading={image.state.isUploading}
                        preview={image.state.preview}
                        showAltInput={image.state.showAltInput}
                        onClear={image.clearImage}
                        onToggleAlt={image.toggleAltInput}
                    />
                )}

                <DialogFooter className={`${isSticky ? 'sticky' : 'static'} bottom-0 flex-row bg-background py-6 dark:bg-[#101114]`}>
                    <NoteFooter
                        altText={image.state.altText}
                        altTextInputRef={image.altTextInputRef}
                        content={content}
                        isDisabled={isDisabled}
                        isImageUploading={image.state.isUploading}
                        isPosting={isPosting}
                        isSticky={isSticky}
                        showAltInput={image.state.showAltInput}
                        onAltTextChange={image.setAltText}
                        onImageButtonClick={() => image.inputRef.current?.click()}
                        onPost={handlePost}
                    />
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default NewNoteModal;
```

## Summary of Changes

| Issue | Solution |
|-------|----------|
| 15+ state variables in one component | Grouped into `useImageAttachment` and `useModalOpen` hooks |
| Mixed posting/navigation logic | Extracted to `useNotePost` hook |
| Repeated `props.open !== undefined ? props.open : isOpen` | Encapsulated in `useModalOpen` returning `resolvedOpen` |
| Monolithic 250-line component | Split into `NoteContentArea`, `ImagePreview`, `NoteFooter` sub-components |
| Inline `getCharCountColor` logic | Extracted to pure function in `NoteFooter` |
| Inline placeholder logic | Extracted to `getReplyPlaceholder` utility |
| Error message switch statement | Replaced with lookup object `ERROR_MESSAGES` |
| `for` loop over clipboard items | Replaced with `Array.from` + `for...of` |
| `imagePreview` state duplicated cleanup | Centralized in `useImageAttachment` with single `useEffect` |