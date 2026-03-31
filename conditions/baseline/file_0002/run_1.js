```tsx
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
        return UPLOAD_ERROR_MESSAGES[error.statusCode as number] ?? 'Failed to upload image. Try again.';
    }
    return 'Failed to upload image. Try again.';
}

function useModalOpen(externalOpen?: boolean) {
    const [isOpen, setIsOpen] = useState(false);
    const modalIsOpen = externalOpen !== undefined ? externalOpen : isOpen;

    useEffect(() => {
        if (externalOpen !== undefined) {
            setIsOpen(externalOpen);
        }
    }, [externalOpen]);

    return {isOpen, setIsOpen, modalIsOpen};
}

function useAutoResize(content: string, textareaRef: React.RefObject<HTMLTextAreaElement>) {
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [content, textareaRef]);
}

function useFocusOnOpen(modalIsOpen: boolean, ref: React.RefObject<HTMLElement>, delay = 100) {
    useEffect(() => {
        if (!modalIsOpen) {
            return;
        }
        const id = setTimeout(() => ref.current?.focus(), delay);
        return () => clearTimeout(id);
    }, [modalIsOpen, ref, delay]);
}

function useStickyFooter(modalIsOpen: boolean) {
    const [isSticky, setIsSticky] = useState(false);

    useEffect(() => {
        if (!modalIsOpen) {
            setIsSticky(false);
            return;
        }
        const id = setTimeout(() => setIsSticky(true), 300);
        return () => clearTimeout(id);
    }, [modalIsOpen]);

    return isSticky;
}

function useKeyboardSubmit(modalIsOpen: boolean, canSubmit: boolean, onSubmit: () => void) {
    useEffect(() => {
        if (!modalIsOpen) {
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (canSubmit) {
                    onSubmit();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [modalIsOpen, canSubmit, onSubmit]);
}

function useImageState() {
    const [imageState, setImageState] = useState<ImageState>(INITIAL_IMAGE_STATE);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const revokePreview = useCallback((preview: string | null) => {
        if (preview) {
            URL.revokeObjectURL(preview);
        }
    }, []);

    const clearImage = useCallback(() => {
        setImageState(prev => {
            revokePreview(prev.preview);
            return INITIAL_IMAGE_STATE;
        });
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    }, [revokePreview]);

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
        return () => revokePreview(imageState.preview);
    }, [imageState.preview, revokePreview]);

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

function ContentLengthIndicator({length}: {length: number}) {
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
}

function ImagePreview({
    imageState,
    onClear,
    onToggleAlt
}: {
    imageState: ImageState;
    onClear: (e: React.MouseEvent) => void;
    onToggleAlt: (e: React.MouseEvent) => void;
}) {
    const {preview, isUploading, showAltInput} = imageState;

    if (!preview) {
        return null;
    }

    return (
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
    const navigate = useNavigateWithBasePath();

    const {isOpen, setIsOpen, modalIsOpen} = useModalOpen(props.open);
    const isSticky = useStickyFooter(modalIsOpen);

    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);

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

    const isDisabled = !content.trim() || !user || isPosting || content.length > MAX_CONTENT_LENGTH;
    const canSubmit = !isDisabled && !imageState.isUploading;

    useAutoResize(content, textareaRef);
    useFocusOnOpen(modalIsOpen, textareaRef);
    useFocusOnOpen(imageState.showAltInput, altTextInputRef);

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
    }, [clearImage, setIsUploading, setUploadedUrl]);

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

    useKeyboardSubmit(modalIsOpen, canSubmit, handlePost);

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

    useEffect(() => {
        if (!modalIsOpen) {
            return;
        }
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [modalIsOpen, handlePaste]);

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

        setPreview(URL.createObjectURL(file));
        await handleImageUpload(file);
    };

    const handleClearImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        clearImage();
    };

    const handleToggleAltInput = (e: React.MouseEvent) => {
        e.stopPropagation();
        toggleAltInput();
    };

    const handleDialogOpenChange = (open: boolean) => {
        if (open) {
            setContent('');
            clearImage();
        }
        setIsOpen(open);
        onOpenChange?.(open);
    };

    const placeholder = replyTo ? getReplyPlaceholder(replyTo) : "What's new?";

    return (
        <Dialog
            open={modalIsOpen}
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
                        layout='