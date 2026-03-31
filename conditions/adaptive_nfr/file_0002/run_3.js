```typescript
import * as FormPrimitive from '@radix-ui/react-form';
import APAvatar from '@components/global/ap-avatar';
import FeedItem from '@components/feed/feed-item';
import getUsername from '@utils/get-username';
import {ActorProperties, ObjectProperties} from '@tryghost/admin-x-framework/api/activitypub';
import {Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Input, LoadingIndicator, LucideIcon, Skeleton} from '@tryghost/shade';
import {ChangeEvent, useCallback, useEffect, useRef, useState} from 'react';
import {ComponentPropsWithoutRef, ReactNode} from 'react';
import {FILE_SIZE_ERROR_MESSAGE, MAX_FILE_SIZE} from '@utils/image';
import {toast} from 'sonner';
import {uploadFile, useAccountForUser, useNoteMutationForUser, useReplyMutationForUser, useUserDataForUser} from '@hooks/use-activity-pub-queries';
import {useNavigateWithBasePath} from '@src/hooks/use-navigate-with-base-path';

const MAX_CONTENT_LENGTH = 500;

const UPLOAD_ERROR_MESSAGES: Record<number, string> = {
    413: 'Image size exceeds limit.',
    415: 'The file type is not supported.'
};

interface ReplyTo {
    object: ObjectProperties;
    actor: ActorProperties;
}

interface NewNoteModalProps extends ComponentPropsWithoutRef<typeof Dialog> {
    children?: ReactNode;
    replyTo?: ReplyTo;
    onReply?: () => void;
    onReplyError?: () => void;
    onOpenChange?: (open: boolean) => void;
}

interface ImageState {
    preview: string | null;
    uploadedUrl: string | null;
    altText: string;
    showAltInput: boolean;
    isUploading: boolean;
}

const INITIAL_IMAGE_STATE: ImageState = {
    preview: null,
    uploadedUrl: null,
    altText: '',
    showAltInput: false,
    isUploading: false
};

function getReplyPlaceholder(replyTo: ReplyTo): string {
    const attributedTo = replyTo.object.attributedTo || {};
    if (typeof attributedTo === 'object' && 'preferredUsername' in attributedTo && 'id' in attributedTo) {
        return `Reply to ${getUsername(attributedTo as ActorProperties)}...`;
    }
    return "What's new?";
}

function getUploadErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as {statusCode: number}).statusCode;
        return UPLOAD_ERROR_MESSAGES[statusCode] ?? 'Failed to upload image. Try again.';
    }
    return 'Failed to upload image. Try again.';
}

function useModalOpenState(externalOpen: boolean | undefined) {
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

    return {isOpen, setIsOpen, isSticky, resolvedOpen};
}

function useAutoResizeTextarea(content: string) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [content]);

    return textareaRef;
}

function useDelayedFocus(condition: boolean, ref: React.RefObject<HTMLElement>, delay = 100) {
    useEffect(() => {
        if (condition && ref.current) {
            const id = setTimeout(() => ref.current?.focus(), delay);
            return () => clearTimeout(id);
        }
    }, [condition, ref, delay]);
}

function useImageState() {
    const [imageState, setImageState] = useState<ImageState>(INITIAL_IMAGE_STATE);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const clearImage = useCallback(() => {
        setImageState(prev => {
            if (prev.preview) {
                URL.revokeObjectURL(prev.preview);
            }
            return INITIAL_IMAGE_STATE;
        });
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    }, []);

    const setPreview = useCallback((preview: string) => {
        setImageState(prev => ({...prev, preview}));
    }, []);

    const setUploadedUrl = useCallback((uploadedUrl: string) => {
        setImageState(prev => ({...prev, uploadedUrl}));
    }, []);

    const setIsUploading = useCallback((isUploading: boolean) => {
        setImageState(prev => ({...prev, isUploading}));
    }, []);

    const setAltText = useCallback((altText: string) => {
        setImageState(prev => ({...prev, altText}));
    }, []);

    const toggleAltInput = useCallback(() => {
        setImageState(prev => ({...prev, showAltInput: !prev.showAltInput}));
    }, []);

    useEffect(() => {
        return () => {
            if (imageState.preview) {
                URL.revokeObjectURL(imageState.preview);
            }
        };
    }, [imageState.preview]);

    return {
        imageState,
        imageInputRef,
        clearImage,
        setPreview,
        setUploadedUrl,
        setIsUploading,
        setAltText,
        toggleAltInput
    };
}

const ContentLengthIndicator: React.FC<{length: number}> = ({length}) => {
    const colorClass = length >= MAX_CONTENT_LENGTH
        ? 'text-red-500'
        : length >= MAX_CONTENT_LENGTH * 0.9
            ? 'text-yellow-600'
            : 'text-gray-500';

    return (
        <div className={`text-sm ${colorClass}`}>
            {length}/{MAX_CONTENT_LENGTH}
        </div>
    );
};

const ImagePreview: React.FC<{
    imageState: ImageState;
    onClear: (e: React.MouseEvent) => void;
    onToggleAlt: (e: React.MouseEvent) => void;
}> = ({imageState, onClear, onToggleAlt}) => {
    if (!imageState.preview) {
        return null;
    }

    return (
        <div className='group relative mt-6 flex min-h-[200px] w-full items-center justify-center'>
            <img
                alt='Image attachment preview'
                className={`max-h-[320px] w-full rounded-sm object-cover outline outline-1 -outline-offset-1 outline-black/10 ${imageState.isUploading && 'opacity-10'}`}
                src={imageState.preview}
            />
            {imageState.isUploading && (
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
            {!imageState.isUploading && (
                <Button
                    className={`absolute bottom-3 left-3 h-6 px-2 py-0 text-white ${!imageState.showAltInput ? 'bg-black/60 hover:bg-black/80' : 'bg-green-500 hover:bg-green-500'}`}
                    onClick={onToggleAlt}
                >
                    Alt
                </Button>
            )}
        </div>
    );
};

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

    const {isOpen, setIsOpen, isSticky, resolvedOpen} = useModalOpenState(props.open);
    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);

    const {
        imageState,
        imageInputRef,
        clearImage,
        setPreview,
        setUploadedUrl,
        setIsUploading,
        setAltText,
        toggleAltInput
    } = useImageState();

    const textareaRef = useAutoResizeTextarea(content);
    const altTextInputRef = useRef<HTMLInputElement>(null);

    useDelayedFocus(resolvedOpen, textareaRef);
    useDelayedFocus(imageState.showAltInput, altTextInputRef);

    const isDisabled = !content.trim() || !user || isPosting || content.length > MAX_CONTENT_LENGTH;
    const placeholder = replyTo ? getReplyPlaceholder(replyTo) : "What's new?";

    const resetForm = useCallback(() => {
        setContent('');
        clearImage();
    }, [clearImage]);

    const handleImageUpload = useCallback(async (file: File) => {
        try {
            setIsUploading(true);
            const imageUrl = await uploadFile(file);
            setUploadedUrl(imageUrl);
        } catch (error) {
            clearImage();
            toast.error(getUploadErrorMessage(error));
        } finally {
            setIsUploading(false);
        }
    }, [setIsUploading, setUploadedUrl, clearImage]);

    const handlePost = useCallback(async () => {
        const trimmedContent = content.trim();
        if (!trimmedContent || !user) {
            return;
        }

        try {
            setIsPosting(true);
            const imagePayload = {
                imageUrl: imageState.uploadedUrl || undefined,
                altText: imageState.altText || undefined
            };

            if (replyTo) {
                await replyMutation.mutateAsync({
                    inReplyTo: replyTo.object.id,
                    content: trimmedContent,
                    ...imagePayload
                });
                onReply?.();
            } else {
                await noteMutation.mutateAsync({content: trimmedContent, ...imagePayload});
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
    }, [content, user, replyTo, replyMutation, noteMutation, imageState, onReply, onReplyError, setIsOpen, navigate, onOpenChange]);

    const handlePaste = useCallback(async (e: React.ClipboardEvent | ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) {
            return;
        }

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                    if (file.size > MAX_FILE_SIZE) {
                        toast.error(FILE_SIZE_ERROR_MESSAGE);
                        return;
                    }
                    setPreview(URL.createObjectURL(file));
                    await handleImageUpload(file);
                }
                break;
            }
        }
    }, [handleImageUpload, setPreview]);

    const handleImageChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            toast.error(FILE_SIZE_ERROR_MESSAGE);
            e.target.value = '';
            return;
        }

        setPreview(URL.createObjectURL(file));
        await handleImageUpload(file);
    }, [handleImageUpload, setPreview]);

    const handleClearImage = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        clearImage();
    }, [clearImage]);

    const handleToggleAltInput = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        toggleAltInput();
    }, [toggleAltInput]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isDisabled && !imageState.isUploading) {
                    handlePost();
                }
            }
        };

        if (resolvedOpen) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [resolvedOpen, isDisabled, imageState.isUploading, handlePost]);

    useEffect(() => {
        if (resolvedOpen) {
            document.addEventListener('paste', handlePaste);
            return () => document.removeEventListener('paste', handlePaste);
        }
    }, [resolvedOpen, handlePaste]);

    const handleOpenChange = useCallback((open: boolean) => {
        if (open) {
            resetForm();
        }
        setIsOpen(open);
        onOpenChange?.(open);
    }, [resetForm, setIsOpen, onOpenChange]);

    return (
        <Dialog
            open={resolvedOpen}
            onOpenChange={handleOpenChange}
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