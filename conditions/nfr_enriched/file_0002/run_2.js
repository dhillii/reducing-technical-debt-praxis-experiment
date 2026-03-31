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

interface ImageState {
    preview: string | null;
    url: string | null;
    altText: string;
    showAltInput: boolean;
    isUploading: boolean;
}

const MAX_CONTENT_LENGTH = 500;
const FOCUS_DELAY = 100;
const STICKY_DELAY = 300;

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
    const [isSticky, setIsSticky] = useState(false);
    const [imageState, setImageState] = useState<ImageState>({
        preview: null,
        url: null,
        altText: '',
        showAltInput: false,
        isUploading: false
    });

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const isModalOpen = props.open !== undefined ? props.open : isOpen;
    const isDisabled = !content.trim() || !user || isPosting || content.length > MAX_CONTENT_LENGTH;

    // Sync external open prop with internal state
    useEffect(() => {
        if (props.open !== undefined) {
            setIsOpen(props.open);
        }
    }, [props.open]);

    // Handle sticky footer timing
    useEffect(() => {
        if (!isModalOpen) {
            setIsSticky(false);
            return;
        }

        const timer = setTimeout(() => {
            setIsSticky(true);
        }, STICKY_DELAY);

        return () => clearTimeout(timer);
    }, [isModalOpen]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [content]);

    // Focus textarea when modal opens
    useEffect(() => {
        if (!isModalOpen || !textareaRef.current) return;

        const timeoutId = setTimeout(() => {
            textareaRef.current?.focus();
        }, FOCUS_DELAY);

        return () => clearTimeout(timeoutId);
    }, [isModalOpen]);

    // Focus alt text input when it becomes visible
    useEffect(() => {
        if (!imageState.showAltInput || !altTextInputRef.current) return;

        const timeoutId = setTimeout(() => {
            altTextInputRef.current?.focus();
        }, FOCUS_DELAY);

        return () => clearTimeout(timeoutId);
    }, [imageState.showAltInput]);

    // Handle keyboard shortcuts
    useEffect(() => {
        if (!isModalOpen) return;

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
    }, [isModalOpen, isDisabled, imageState.isUploading]);

    // Handle paste events
    useEffect(() => {
        if (!isModalOpen) return;

        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [isModalOpen]);

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            if (imageState.preview) {
                URL.revokeObjectURL(imageState.preview);
            }
        };
    }, []);

    const resetImageState = useCallback(() => {
        if (imageState.preview) {
            URL.revokeObjectURL(imageState.preview);
        }
        setImageState({
            preview: null,
            url: null,
            altText: '',
            showAltInput: false,
            isUploading: false
        });
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    }, [imageState.preview]);

    const resetFormState = useCallback(() => {
        setContent('');
        resetImageState();
    }, [resetImageState]);

    const getErrorMessage = (error: unknown): string => {
        if (error && typeof error === 'object' && 'statusCode' in error) {
            const statusCode = (error as {statusCode: number}).statusCode;
            switch (statusCode) {
                case 413:
                    return 'Image size exceeds limit.';
                case 415:
                    return 'The file type is not supported.';
                default:
                    return 'Failed to upload image. Try again.';
            }
        }
        return 'Failed to upload image. Try again.';
    };

    const handleImageUpload = useCallback(async (file: File) => {
        try {
            setImageState(prev => ({...prev, isUploading: true}));
            const imageUrl = await uploadFile(file);
            setImageState(prev => ({...prev, url: imageUrl}));
        } catch (error) {
            resetImageState();
            toast.error(getErrorMessage(error));
        } finally {
            setImageState(prev => ({...prev, isUploading: false}));
        }
    }, [resetImageState]);

    const handlePaste = useCallback(async (e: React.ClipboardEvent | ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) return;

                if (file.size > MAX_FILE_SIZE) {
                    toast.error(FILE_SIZE_ERROR_MESSAGE);
                    return;
                }

                const previewUrl = URL.createObjectURL(file);
                setImageState(prev => ({...prev, preview: previewUrl}));
                await handleImageUpload(file);
                break;
            }
        }
    }, [handleImageUpload]);

    const handleImageChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const file = files[0];

        if (file.size > MAX_FILE_SIZE) {
            toast.error(FILE_SIZE_ERROR_MESSAGE);
            e.target.value = '';
            return;
        }

        const previewUrl = URL.createObjectURL(file);
        setImageState(prev => ({...prev, preview: previewUrl}));
        await handleImageUpload(file);
    }, [handleImageUpload]);

    const handlePost = useCallback(async () => {
        const trimmedContent = content.trim();

        if (!trimmedContent || !user) return;

        try {
            setIsPosting(true);

            const postData = {
                content: trimmedContent,
                imageUrl: imageState.url || undefined,
                altText: imageState.altText || undefined
            };

            if (replyTo) {
                await replyMutation.mutateAsync({
                    inReplyTo: replyTo.object.id,
                    ...postData
                });
                onReply?.();
            } else {
                await noteMutation.mutateAsync(postData);
                navigate('/notes');
            }

            setIsOpen(false);
            onOpenChange?.(false);
            toast.success(replyTo ? 'Reply posted' : 'Note posted');
        } catch {
            onReplyError?.();
        } finally {
            setIsPosting(false);
        }
    }, [content, user, replyTo, imageState, replyMutation, noteMutation, navigate, onReply, onReplyError, onOpenChange]);

    const handleClearImage = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        resetImageState();
    }, [resetImageState]);

    const handleToggleAltInput = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setImageState(prev => ({...prev, showAltInput: !prev.showAltInput}));
    }, []);

    const handleContentClick = useCallback(() => {
        textareaRef.current?.focus();
    }, []);

    const handleModalOpenChange = useCallback((open: boolean) => {
        if (!open) {
            resetFormState();
        }
        setIsOpen(open);
        onOpenChange?.(open);
    }, [resetFormState, onOpenChange]);

    const getPlaceholder = (): string => {
        if (!replyTo) return 'What\'s new?';

        const attributedTo = replyTo.object.attributedTo;
        if (typeof attributedTo === 'object' && attributedTo && 'preferredUsername' in attributedTo && 'id' in attributedTo) {
            return `Reply to ${getUsername(attributedTo as ActorProperties)}...`;
        }
        return 'What\'s new?';
    };

    const getCharacterCountColor = (): string => {
        if (content.length >= MAX_CONTENT_LENGTH) return 'text-red-500';
        if (content.length >= MAX_CONTENT_LENGTH * 0.9) return 'text-yellow-600';
        return 'text-gray-500';
    };

    return (
        <Dialog open={isModalOpen} onOpenChange={handleModalOpenChange} {...(props.open !== undefined ? {} : props)}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent
                className="max-h-[80vh] min-h-[240px] gap-0 overflow-y-auto pb-0"
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
                    onClick={handleContentClick}
                >
                    <div className='sticky top-0'>
                        <APAvatar author={user as ActorProperties} />
                    </div>
                    <FormPrimitive.Root asChild>
                        <div className='-mt-0.5 flex w-full flex-col gap-0.5'>
                            {isLoadingAccount ? (
                                <Skeleton className='w-10' />
                            ) : (
                                <span className='min-w-0 truncate whitespace-nowrap font-semibold text-black break-anywhere dark:text-white'>
                                    {account?.name}
                                </span>
                            )}
                            <FormPrimitive.Field name='content' asChild>
                                <FormPrimitive.Control asChild>
                                    <textarea
                                        ref={textareaRef}
                                        autoFocus={true}
                                        className='ap-textarea w-full resize-none bg-transparent text-[1.5rem] break-anywhere'
                                        data-testid="note-textarea"
                                        placeholder={getPlaceholder()}
                                        rows={1}
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
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
                            className={`max-h-[320px] w-full rounded-sm object-cover outline outline-1 -outline-offset-1 outline-black/10 ${
                                imageState.isUploading && 'opacity-10'
                            }`}
                            src={imageState.preview}
                        />
                        {imageState.isUploading && (
                            <div className='absolute leading-[0]'>
                                <LoadingIndicator size='md' />
                            </div>
                        )}
                        <Button
                            className='absolute right-3 top-3 size-8 bg-black/60 text-white opacity-0