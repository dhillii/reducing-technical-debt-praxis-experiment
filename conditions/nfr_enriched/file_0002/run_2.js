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

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_CONTENT_LENGTH = 500;
const FOCUS_DELAY_MS = 100;
const STICKY_DELAY_MS = 300;

const IMAGE_UPLOAD_ERRORS: Record<number, string> = {
    413: 'Image size exceeds limit.',
    415: 'The file type is not supported.'
};

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface ImageState {
    preview: string | null;
    uploadedUrl: string | null;
    altText: string;
    showAltInput: boolean;
    isUploading: boolean;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

const getReplyPlaceholder = (replyTo: NewNoteModalProps['replyTo']): string => {
    if (!replyTo) {
        return "What's new?";
    }
    const attributedTo = replyTo.object.attributedTo ?? {};
    const isActor =
        typeof attributedTo === 'object' &&
        'preferredUsername' in attributedTo &&
        'id' in attributedTo;
    return isActor
        ? `Reply to ${getUsername(attributedTo as ActorProperties)}...`
        : "What's new?";
};

const getImageUploadErrorMessage = (error: unknown): string => {
    if (error && typeof error === 'object' && 'statusCode' in error) {
        const statusCode = (error as {statusCode: number}).statusCode;
        return IMAGE_UPLOAD_ERRORS[statusCode] ?? 'Failed to upload image. Try again.';
    }
    return 'Failed to upload image. Try again.';
};

const getCharCountColor = (length: number): string => {
    if (length >= MAX_CONTENT_LENGTH) {
        return 'text-red-500';
    }
    if (length >= MAX_CONTENT_LENGTH * 0.9) {
        return 'text-yellow-600';
    }
    return 'text-gray-500';
};

const revokePreviewUrl = (url: string | null) => {
    if (url) {
        URL.revokeObjectURL(url);
    }
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

const useDelayedFocus = (
    ref: React.RefObject<HTMLElement>,
    condition: boolean
) => {
    useEffect(() => {
        if (!condition || !ref.current) {
            return;
        }
        const id = setTimeout(() => ref.current?.focus(), FOCUS_DELAY_MS);
        return () => clearTimeout(id);
    }, [condition, ref]);
};

const useAutoResizeTextarea = (
    ref: React.RefObject<HTMLTextAreaElement>,
    content: string
) => {
    useEffect(() => {
        if (!ref.current) {
            return;
        }
        ref.current.style.height = 'auto';
        ref.current.style.height = `${ref.current.scrollHeight}px`;
    }, [content, ref]);
};

const useStickyFooter = (isOpen: boolean) => {
    const [isSticky, setIsSticky] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setIsSticky(false);
            return;
        }
        const id = setTimeout(() => setIsSticky(true), STICKY_DELAY_MS);
        return () => clearTimeout(id);
    }, [isOpen]);

    return isSticky;
};

const useKeyboardSubmit = (
    isOpen: boolean,
    isDisabled: boolean,
    isImageUploading: boolean,
    onSubmit: () => void
) => {
    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isDisabled && !isImageUploading) {
                    onSubmit();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isDisabled, isImageUploading, onSubmit]);
};

const useImageState = () => {
    const [imageState, setImageState] = useState<ImageState>({
        preview: null,
        uploadedUrl: null,
        altText: '',
        showAltInput: false,
        isUploading: false
    });

    const updateImageState = useCallback(
        (updates: Partial<ImageState>) =>
            setImageState(prev => ({...prev, ...updates})),
        []
    );

    const clearImage = useCallback(() => {
        setImageState(prev => {
            revokePreviewUrl(prev.preview);
            return {
                preview: null,
                uploadedUrl: null,
                altText: '',
                showAltInput: false,
                isUploading: false
            };
        });
    }, []);

    useEffect(() => {
        return () => revokePreviewUrl(imageState.preview);
    }, [imageState.preview]);

    return {imageState, updateImageState, clearImage};
};

// ─── Sub-components ──────────────────────────────────────────────────────────

interface ImagePreviewProps {
    preview: string;
    isUploading: boolean;
    showAltInput: boolean;
    altText: string;
    altTextInputRef: React.RefObject<HTMLInputElement>;
    onClear: (e: React.MouseEvent) => void;
    onToggleAlt: (e: React.MouseEvent) => void;
    onAltTextChange: (value: string) => void;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({
    preview,
    isUploading,
    showAltInput,
    altText,
    altTextInputRef,
    onClear,
    onToggleAlt,
    onAltTextChange
}) => (
    <>
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
        {!isUploading && showAltInput && (
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

// ─── Main Component ───────────────────────────────────────────────────────────

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

    const [isOpen, setIsOpen] = useState(false);
    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const {imageState, updateImageState, clearImage} = useImageState();

    const resolvedIsOpen = props.open !== undefined ? props.open : isOpen;
    const isDisabled =
        !content.trim() || !user || isPosting || content.length > MAX_CONTENT_LENGTH;

    // Sync external open prop
    useEffect(() => {
        if (props.open !== undefined) {
            setIsOpen(props.open);
        }
    }, [props.open]);

    const isSticky = useStickyFooter(resolvedIsOpen);

    useAutoResizeTextarea(textareaRef, content);
    useDelayedFocus(textareaRef, resolvedIsOpen);
    useDelayedFocus(altTextInputRef, imageState.showAltInput);

    const handlePost = useCallback(async () => {
        const trimmedContent = content.trim();
        if (!trimmedContent || !user) {
            return;
        }

        try {
            setIsPosting(true);
            const imagePayload = {
                imageUrl: imageState.uploadedUrl ?? undefined,
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
    }, [
        content,
        user,
        replyTo,
        replyMutation,
        noteMutation,
        imageState.uploadedUrl,
        imageState.altText,
        onReply,
        onReplyError,
        navigate,
        onOpenChange
    ]);

    useKeyboardSubmit(resolvedIsOpen, isDisabled, imageState.isUploading, handlePost);

    const handleImageUpload = async (file: File) => {
        try {
            updateImageState({isUploading: true});
            const imageUrl = await uploadFile(file);
            updateImageState({uploadedUrl: imageUrl});
        } catch (error) {
            updateImageState({preview: null});
            toast.error(getImageUploadErrorMessage(error));
        } finally {
            updateImageState({isUploading: false});
        }
    };

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
                    updateImageState({preview: URL.createObjectURL(file)});
                    await handleImageUpload(file);
                }
                break;
            }
        }
    }, []);

    useEffect(() => {
        if (!resolvedIsOpen) {
            return;
        }
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [resolvedIsOpen, handlePaste]);

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
        updateImageState({preview: URL.createObjectURL(file)});
        await handleImageUpload(file);
    };

    const handleClearImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        clearImage();
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    };

    const handleOpenChange = (open: boolean) => {
        if (open) {
            setContent('');
            clearImage();
            if (imageInputRef.current) {
                imageInputRef.current.value = '';
            }
        }
        setIsOpen(open);
        onOpenChange?.(open);
    };

    const placeholder = getReplyPlaceholder(replyTo);

    return (
        <Dialog
            open={resolvedIsOpen}
            onOpenChange={handleOpenChange}
            {...(props.open !== undefined ? {} : props)}
        >
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent
                className='max-h-[80vh] min-h-[240px] gap-0 overflow-y-auto pb-0'