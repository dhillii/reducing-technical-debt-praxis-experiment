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
const FOCUS_DELAY_MS = 100;
const STICKY_DELAY_MS = 300;

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

function getUploadErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'statusCode' in error) {
        switch ((error as {statusCode: number}).statusCode) {
        case 413: return 'Image size exceeds limit.';
        case 415: return 'The file type is not supported.';
        }
    }
    return 'Failed to upload image. Try again.';
}

function getReplyPlaceholder(replyTo: ReplyTo): string {
    const attributedTo = replyTo.object.attributedTo || {};
    if (typeof attributedTo === 'object' && 'preferredUsername' in attributedTo && 'id' in attributedTo) {
        return `Reply to ${getUsername(attributedTo as ActorProperties)}...`;
    }
    return "What's new?";
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
            const timer = setTimeout(() => setIsSticky(true), STICKY_DELAY_MS);
            return () => clearTimeout(timer);
        }
        setIsSticky(false);
    }, [resolvedOpen]);

    return {isOpen, setIsOpen, isSticky, resolvedOpen};
}

function useFocusOnVisible(ref: React.RefObject<HTMLElement>, visible: boolean) {
    useEffect(() => {
        if (!visible) {
            return;
        }
        const id = setTimeout(() => ref.current?.focus(), FOCUS_DELAY_MS);
        return () => clearTimeout(id);
    }, [visible, ref]);
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

function useImageUpload(imageState: ReturnType<typeof useImageState>) {
    const {setPreview, setUploadedUrl, setIsUploading, clearImage} = imageState;

    const uploadImage = useCallback(async (file: File) => {
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
        await uploadImage(file);
    }, [setPreview, uploadImage]);

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
                    await uploadImage(file);
                }
                break;
            }
        }
    }, [setPreview, uploadImage]);

    return {handleImageChange, handlePaste};
}

function useContentLength(content: string) {
    const ratio = content.length / MAX_CONTENT_LENGTH;
    if (ratio >= 1) {
        return 'text-red-500';
    }
    if (ratio >= 0.9) {
        return 'text-yellow-600';
    }
    return 'text-gray-500';
}

function useAutoResizeTextarea(ref: React.RefObject<HTMLTextAreaElement>, content: string) {
    useEffect(() => {
        if (ref.current) {
            ref.current.style.height = 'auto';
            ref.current.style.height = `${ref.current.scrollHeight}px`;
        }
    }, [content, ref]);
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

    const {isOpen, setIsOpen, isSticky, resolvedOpen} = useModalOpenState(props.open);
    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);

    const imageHook = useImageState();
    const {imageState, imageInputRef, clearImage, setAltText, toggleAltInput} = imageHook;
    const {handleImageChange, handlePaste} = useImageUpload(imageHook);

    const isDisabled = !content.trim() || !user || isPosting || content.length > MAX_CONTENT_LENGTH;
    const contentLengthClass = useContentLength(content);
    const placeholder = replyTo ? getReplyPlaceholder(replyTo) : "What's new?";

    useAutoResizeTextarea(textareaRef, content);
    useFocusOnVisible(textareaRef, resolvedOpen);
    useFocusOnVisible(altTextInputRef as React.RefObject<HTMLElement>, imageState.showAltInput);

    const resetForm = useCallback(() => {
        setContent('');
        clearImage();
    }, [clearImage]);

    const closeModal = useCallback((open: boolean) => {
        setIsOpen(open);
        onOpenChange?.(open);
    }, [setIsOpen, onOpenChange]);

    const handlePost = useCallback(async () => {
        const trimmedContent = content.trim();
        if (!trimmedContent || !user) {
            return;
        }

        const imagePayload = {
            imageUrl: imageState.uploadedUrl || undefined,
            altText: imageState.altText || undefined
        };

        try {
            setIsPosting(true);
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
            closeModal(false);
            toast.success(replyTo ? 'Reply posted' : 'Note posted');
        } catch {
            if (replyTo) {
                onReplyError?.();
            }
        } finally {
            setIsPosting(false);
        }
    }, [content, user, replyTo, replyMutation, noteMutation, imageState, onReply, onReplyError, closeModal, navigate]);

    useEffect(() => {
        if (!resolvedOpen) {
            return;
        }
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isDisabled && !imageState.isUploading) {
                    handlePost();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [resolvedOpen, isDisabled, imageState.isUploading, handlePost]);

    useEffect(() => {
        if (!resolvedOpen) {
            return;
        }
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [resolvedOpen, handlePaste]);

    const handleOpenChange = useCallback((open: boolean) => {
        if (open) {
            resetForm();
        }
        closeModal(open);
    }, [resetForm, closeModal]);

    const handleClearImage = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        clearImage();
    }, [clearImage]);

    const handleToggleAltInput = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        toggleAltInput();
    }, [toggleAltInput]);

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
                        type={replyTo.object.type === 'Article' ? 'Article' : 'Note'}
                        onClick={() => {}}
                    />
                )}

                <div
                    className={`flex ${!imageState.preview ? 'min-h-36' : ''} cursor-text items-start gap-3`}
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
                                        autoFocus={true}
                                        className='ap-textarea w-full resize-none bg-transparent text-[1.5rem] break-anywhere'
                                        data-testid="note-textarea"
                                        placeholder={placeholder}
                                        rows={1}
                                        value={content}
                                        onChange={e => setContent(e.target.value)}
                                        onPaste={handlePaste}