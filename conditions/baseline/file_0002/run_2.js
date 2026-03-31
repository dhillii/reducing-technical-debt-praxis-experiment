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

function getPlaceholder(replyTo?: NewNoteModalProps['replyTo']): string {
    if (!replyTo) {
        return "What's new?";
    }
    const attributedTo = replyTo.object.attributedTo || {};
    if (typeof attributedTo === 'object' && 'preferredUsername' in attributedTo && 'id' in attributedTo) {
        return `Reply to ${getUsername(attributedTo as ActorProperties)}...`;
    }
    return "What's new?";
}

function getContentLengthColor(length: number): string {
    if (length >= MAX_CONTENT_LENGTH) {
        return 'text-red-500';
    }
    if (length >= MAX_CONTENT_LENGTH * 0.9) {
        return 'text-yellow-600';
    }
    return 'text-gray-500';
}

function useModalOpen(externalOpen?: boolean): [boolean, (open: boolean) => void] {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (externalOpen !== undefined) {
            setIsOpen(externalOpen);
        }
    }, [externalOpen]);

    return [isOpen, setIsOpen];
}

function useAutoFocus(ref: React.RefObject<HTMLElement>, condition: boolean, delay = 100) {
    useEffect(() => {
        if (!condition || !ref.current) {
            return;
        }
        const id = setTimeout(() => ref.current?.focus(), delay);
        return () => clearTimeout(id);
    }, [condition, ref, delay]);
}

function useAutoResize(ref: React.RefObject<HTMLTextAreaElement>, content: string) {
    useEffect(() => {
        if (ref.current) {
            ref.current.style.height = 'auto';
            ref.current.style.height = `${ref.current.scrollHeight}px`;
        }
    }, [content, ref]);
}

function useStickyFooter(isOpen: boolean, delay = 300): boolean {
    const [isSticky, setIsSticky] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setIsSticky(false);
            return;
        }
        const id = setTimeout(() => setIsSticky(true), delay);
        return () => clearTimeout(id);
    }, [isOpen, delay]);

    return isSticky;
}

function useImageUpload() {
    const [imageState, setImageState] = useState<ImageState>(INITIAL_IMAGE_STATE);

    const updateImageState = useCallback((updates: Partial<ImageState>) => {
        setImageState(prev => ({...prev, ...updates}));
    }, []);

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
    }, [revokePreview]);

    const uploadImage = useCallback(async (file: File) => {
        updateImageState({isUploading: true});
        try {
            const imageUrl = await uploadFile(file);
            updateImageState({uploadedUrl: imageUrl, isUploading: false});
        } catch (error) {
            updateImageState({preview: null, isUploading: false});
            toast.error(getUploadErrorMessage(error));
        }
    }, [updateImageState]);

    const handleFileSelected = useCallback(async (file: File) => {
        if (file.size > MAX_FILE_SIZE) {
            toast.error(FILE_SIZE_ERROR_MESSAGE);
            return false;
        }
        const previewUrl = URL.createObjectURL(file);
        updateImageState({preview: previewUrl});
        await uploadImage(file);
        return true;
    }, [updateImageState, uploadImage]);

    useEffect(() => {
        return () => revokePreview(imageState.preview);
    }, [imageState.preview, revokePreview]);

    return {imageState, updateImageState, clearImage, handleFileSelected};
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

    const [isOpen, setIsOpen] = useModalOpen(props.open);
    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const {imageState, updateImageState, clearImage, handleFileSelected} = useImageUpload();

    const modalIsOpen = props.open !== undefined ? props.open : isOpen;
    const isSticky = useStickyFooter(modalIsOpen);
    const isDisabled = !content.trim() || !user || isPosting || content.length > MAX_CONTENT_LENGTH;

    useAutoResize(textareaRef, content);
    useAutoFocus(textareaRef, modalIsOpen);
    useAutoFocus(altTextInputRef, imageState.showAltInput);

    const resetForm = useCallback(() => {
        setContent('');
        clearImage();
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    }, [clearImage]);

    const handleOpenChange = useCallback((open: boolean) => {
        if (open) {
            resetForm();
        }
        setIsOpen(open);
        onOpenChange?.(open);
    }, [resetForm, setIsOpen, onOpenChange]);

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

            handleOpenChange(false);
            toast.success(replyTo ? 'Reply posted' : 'Note posted');
        } catch {
            if (replyTo) {
                onReplyError?.();
            }
        } finally {
            setIsPosting(false);
        }
    }, [content, user, replyTo, replyMutation, noteMutation, imageState, onReply, onReplyError, handleOpenChange, navigate]);

    const handlePaste = useCallback(async (e: React.ClipboardEvent | ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) {
            return;
        }

        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = items[i].getAsFile();
                if (file) {
                    await handleFileSelected(file);
                }
                break;
            }
        }
    }, [handleFileSelected]);

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

    const handleClearImage = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        clearImage();
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    }, [clearImage]);

    const handleToggleAltInput = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        updateImageState({showAltInput: !imageState.showAltInput});
    }, [imageState.showAltInput, updateImageState]);

    useEffect(() => {
        if (!modalIsOpen) {
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
    }, [modalIsOpen, isDisabled, imageState.isUploading, handlePost]);

    useEffect(() => {
        if (!modalIsOpen) {
            return;
        }
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [modalIsOpen, handlePaste]);

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
                                        placeholder={getPlaceholder(replyTo)}
                                        rows={1}
                                        value={content}
                                        onChange={e => setContent(e.target.value)}
                                        onPaste={handlePaste}
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
                                        onChange={handleImageChange}
                                    />
                                </FormPrimitive.Control>
                            </FormPrimitive.Field>
                        </div>
                    </FormPrimitive.Root>
                </div>

                {imageState.preview && (
                    <div className='group relative mt-6 flex min-h-[200px] w-full items-center justify-center'>
                        <img
                            alt='Image attachment preview'
                            className={`max-h-[320px] w-full rounded-sm object-cover outline outline-1 -outline-offset-1 outline-black/10 ${imageState.isUploading && 'opacity-10'}`}
                            src={imageState.preview}
                        />