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

interface ModalState {
    content: string;
    uploadedImageUrl: string | null;
    altText: string;
    showAltInput: boolean;
    isPosting: boolean;
    isSticky: boolean;
    imagePreview: string | null;
    isImageUploading: boolean;
}

const MAX_CONTENT_LENGTH = 500;
const FOCUS_DELAY = 100;
const STICKY_DELAY = 300;

const NewNoteModal: React.FC<NewNoteModalProps> = ({children, replyTo, onReply, onReplyError, onOpenChange, ...props}) => {
    const {data: user} = useUserDataForUser('index');
    const noteMutation = useNoteMutationForUser('index', user);
    const replyMutation = useReplyMutationForUser('index', user);
    const {data: account, isLoading: isLoadingAccount} = useAccountForUser('index', 'me');
    const navigate = useNavigateWithBasePath();

    const [isOpen, setIsOpen] = useState(false);
    const [state, setState] = useState<ModalState>({
        content: '',
        uploadedImageUrl: null,
        altText: '',
        showAltInput: false,
        isPosting: false,
        isSticky: false,
        imagePreview: null,
        isImageUploading: false,
    });

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const getModalIsOpen = useCallback(() => props.open !== undefined ? props.open : isOpen, [props.open, isOpen]);

    const updateState = useCallback((updates: Partial<ModalState>) => {
        setState(prev => ({...prev, ...updates}));
    }, []);

    const resetModalState = useCallback(() => {
        updateState({
            content: '',
            imagePreview: null,
            uploadedImageUrl: null,
            altText: '',
            showAltInput: false,
        });
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    }, [updateState]);

    const revokeImagePreview = useCallback((preview: string | null) => {
        if (preview) {
            URL.revokeObjectURL(preview);
        }
    }, []);

    // Sync external open prop with internal state
    useEffect(() => {
        if (props.open !== undefined) {
            setIsOpen(props.open);
        }
    }, [props.open]);

    // Handle sticky footer
    useEffect(() => {
        const modalIsOpen = getModalIsOpen();
        if (modalIsOpen) {
            const timer = setTimeout(() => {
                updateState({isSticky: true});
            }, STICKY_DELAY);
            return () => clearTimeout(timer);
        } else {
            updateState({isSticky: false});
        }
    }, [isOpen, props.open, getModalIsOpen, updateState]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [state.content]);

    // Focus textarea when modal opens
    useEffect(() => {
        const modalIsOpen = getModalIsOpen();
        if (modalIsOpen && textareaRef.current) {
            const timeoutId = setTimeout(() => {
                textareaRef.current?.focus();
            }, FOCUS_DELAY);
            return () => clearTimeout(timeoutId);
        }
    }, [isOpen, props.open, getModalIsOpen]);

    // Focus alt text input when it becomes visible
    useEffect(() => {
        if (state.showAltInput && altTextInputRef.current) {
            const timeoutId = setTimeout(() => {
                altTextInputRef.current?.focus();
            }, FOCUS_DELAY);
            return () => clearTimeout(timeoutId);
        }
    }, [state.showAltInput]);

    const isDisabled = !state.content.trim() || !user || state.isPosting || state.content.length > MAX_CONTENT_LENGTH;

    const handlePost = useCallback(async () => {
        const trimmedContent = state.content.trim();

        if (!trimmedContent || !user) {
            return;
        }

        try {
            updateState({isPosting: true});

            if (replyTo) {
                await replyMutation.mutateAsync({
                    inReplyTo: replyTo.object.id,
                    content: trimmedContent,
                    imageUrl: state.uploadedImageUrl || undefined,
                    altText: state.altText || undefined
                });
                onReply?.();
            } else {
                await noteMutation.mutateAsync({
                    content: trimmedContent,
                    imageUrl: state.uploadedImageUrl || undefined,
                    altText: state.altText || undefined
                });
                navigate('/notes');
            }

            setIsOpen(false);
            onOpenChange?.(false);
            toast.success(replyTo ? 'Reply posted' : 'Note posted');
        } catch {
            onReplyError?.();
        } finally {
            updateState({isPosting: false});
        }
    }, [state.content, state.uploadedImageUrl, state.altText, user, replyTo, replyMutation, noteMutation, onReply, onReplyError, navigate, onOpenChange, updateState]);

    // Keyboard shortcut for posting
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isDisabled && !state.isImageUploading) {
                    handlePost();
                }
            }
        };

        const modalIsOpen = getModalIsOpen();
        if (modalIsOpen) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, props.open, isDisabled, state.isImageUploading, handlePost, getModalIsOpen]);

    const handleImageUpload = useCallback(async (file: File) => {
        try {
            updateState({isImageUploading: true});
            const imageUrl = await uploadFile(file);
            updateState({uploadedImageUrl: imageUrl});
        } catch (error) {
            updateState({imagePreview: null});

            let errorMessage = 'Failed to upload image. Try again.';

            if (error && typeof error === 'object' && 'statusCode' in error) {
                const statusCode = (error as {statusCode: number}).statusCode;
                if (statusCode === 413) {
                    errorMessage = 'Image size exceeds limit.';
                } else if (statusCode === 415) {
                    errorMessage = 'The file type is not supported.';
                }
            }
            toast.error(errorMessage);
        } finally {
            updateState({isImageUploading: false});
        }
    }, [updateState]);

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

                    const previewUrl = URL.createObjectURL(file);
                    updateState({imagePreview: previewUrl});
                    await handleImageUpload(file);
                }
                break;
            }
        }
    }, [handleImageUpload, updateState]);

    // Paste listener
    useEffect(() => {
        const modalIsOpen = getModalIsOpen();
        if (modalIsOpen) {
            document.addEventListener('paste', handlePaste);
            return () => document.removeEventListener('paste', handlePaste);
        }
    }, [isOpen, props.open, handlePaste, getModalIsOpen]);

    const handleImageChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;

        if (files && files.length > 0) {
            const file = files[0];

            if (file.size > MAX_FILE_SIZE) {
                toast.error(FILE_SIZE_ERROR_MESSAGE);
                e.target.value = '';
                return;
            }

            const previewUrl = URL.createObjectURL(file);
            updateState({imagePreview: previewUrl});
            await handleImageUpload(file);
        }
    }, [handleImageUpload, updateState]);

    const handleClearImage = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        revokeImagePreview(state.imagePreview);
        updateState({
            imagePreview: null,
            uploadedImageUrl: null,
            altText: '',
            showAltInput: false,
        });
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    }, [state.imagePreview, updateState, revokeImagePreview]);

    const handleToggleAltInput = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        updateState({showAltInput: !state.showAltInput});
    }, [state.showAltInput, updateState]);

    const handleContentClick = useCallback(() => {
        textareaRef.current?.focus();
    }, []);

    const handleModalOpenChange = useCallback((open: boolean) => {
        if (open) {
            resetModalState();
        } else {
            revokeImagePreview(state.imagePreview);
        }

        setIsOpen(open);
        onOpenChange?.(open);
    }, [resetModalState, revokeImagePreview, state.imagePreview, onOpenChange]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            revokeImagePreview(state.imagePreview);
        };
    }, []);

    const placeholder = replyTo
        ? (() => {
            const attributedTo = replyTo.object.attributedTo;
            if (typeof attributedTo === 'object' && attributedTo && 'preferredUsername' in attributedTo && 'id' in attributedTo) {
                return `Reply to ${getUsername(attributedTo as ActorProperties)}...`;
            }
            return 'What\'s new?';
        })()
        : 'What\'s new?';

    const contentLengthColor = state.content.length >= MAX_CONTENT_LENGTH
        ? 'text-red-500'
        : state.content.length >= MAX_CONTENT_LENGTH * 0.9
            ? 'text-yellow-600'
            : 'text-gray-500';

    return (
        <Dialog open={getModalIsOpen()} onOpenChange={handleModalOpenChange} {...(props.open !== undefined ? {} : props)}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className='max-h-[80vh] min-h-[240px] gap-0 overflow-y-auto pb-0' data-testid="new-note-modal" onClick={e => e.stopPropagation()}>
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
                <div className={`flex ${!state.imagePreview ? 'min-h-36' : ''} cursor-text items-start gap-3`} onClick={handleContentClick}>
                    <div className='sticky top-0'>
                        <APAvatar author={user as ActorProperties} />
                    </div>
                    <FormPrimitive.Root asChild>
                        <div className='-mt-0.5 flex w-full flex-col gap-0.5'>
                            {isLoadingAccount ?
                                <Skeleton className='w-10' /> :
                                <span className='min-w-0 truncate whitespace-nowrap font-semibold text-black break-anywhere dark:text-white'>{account?.name}</span>
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
                                        value={state.content}
                                        onChange={(e) => updateState({content: e.target.value})}
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
                    </FormPrimitive.Root