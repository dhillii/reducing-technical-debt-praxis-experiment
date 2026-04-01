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

/** Maps HTTP status codes to user-friendly error messages */
const ERROR_MESSAGE_MAP: Record<number, string> = {
    413: 'Image size exceeds limit.',
    415: 'The file type is not supported.'
};

/** Gets error message from status code or returns default */
const getImageErrorMessage = (statusCode?: number): string => {
    if (statusCode && statusCode in ERROR_MESSAGE_MAP) {
        return ERROR_MESSAGE_MAP[statusCode];
    }
    return 'Failed to upload image. Try again.';
};

/** Determines if modal is currently open */
const getModalOpenState = (propOpen: boolean | undefined, stateOpen: boolean): boolean => {
    return propOpen !== undefined ? propOpen : stateOpen;
};

/** Resets modal form state */
const resetFormState = (
    setContent: (value: string) => void,
    setImagePreview: (value: string | null) => void,
    setUploadedImageUrl: (value: string | null) => void,
    setAltText: (value: string) => void,
    setShowAltInput: (value: boolean) => void,
    imagePreview: string | null,
    imageInputRef: React.RefObject<HTMLInputElement>
) => {
    setContent('');
    setImagePreview(null);
    setUploadedImageUrl(null);
    setAltText('');
    setShowAltInput(false);
    if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
    }
    if (imageInputRef.current) {
        imageInputRef.current.value = '';
    }
};

/** Handles post submission for both notes and replies */
const createPostHandler = (
    content: string,
    user: ActorProperties | undefined,
    replyTo: NewNoteModalProps['replyTo'],
    uploadedImageUrl: string | null,
    altText: string,
    replyMutation: any,
    noteMutation: any,
    navigate: (path: string) => void,
    onReply?: () => void,
    onReplyError?: () => void
) => {
    const trimmedContent = content.trim();
    if (!trimmedContent || !user) {
        return null;
    }

    if (replyTo) {
        return {
            execute: () => replyMutation.mutateAsync({
                inReplyTo: replyTo.object.id,
                content: trimmedContent,
                imageUrl: uploadedImageUrl || undefined,
                altText: altText || undefined
            }),
            onSuccess: onReply,
            onError: onReplyError,
            successMessage: 'Reply posted'
        };
    }

    return {
        execute: () => noteMutation.mutateAsync({
            content: trimmedContent,
            imageUrl: uploadedImageUrl || undefined,
            altText: altText || undefined
        }),
        onSuccess: () => navigate('/notes'),
        onError: undefined,
        successMessage: 'Note posted'
    };
};

const NewNoteModal: React.FC<NewNoteModalProps> = ({children, replyTo, onReply, onReplyError, onOpenChange, ...props}) => {
    const {data: user} = useUserDataForUser('index');
    const noteMutation = useNoteMutationForUser('index', user);
    const replyMutation = useReplyMutationForUser('index', user);
    const {data: account, isLoading: isLoadingAccount} = useAccountForUser('index', 'me');
    const [isOpen, setIsOpen] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isImageUploading, setIsImageUploading] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const [content, setContent] = useState('');
    const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
    const [altText, setAltText] = useState('');
    const [showAltInput, setShowAltInput] = useState(false);
    const [isPosting, setIsPosting] = useState(false);
    const [isSticky, setIsSticky] = useState(false);
    const navigate = useNavigateWithBasePath();

    const MAX_CONTENT_LENGTH = 500;

    // Sync external open prop with internal state
    useEffect(() => {
        if (props.open !== undefined) {
            setIsOpen(props.open);
        }
    }, [props.open]);

    useEffect(() => {
        const modalIsOpen = getModalOpenState(props.open, isOpen);
        if (modalIsOpen) {
            const timer = setTimeout(() => {
                setIsSticky(true);
            }, 300);
            return () => clearTimeout(timer);
        } else {
            setIsSticky(false);
        }
    }, [isOpen, props.open]);

    const isDisabled = !content.trim() || !user || isPosting || content.length > MAX_CONTENT_LENGTH;

    const handlePost = useCallback(async () => {
        const postHandler = createPostHandler(
            content,
            user,
            replyTo,
            uploadedImageUrl,
            altText,
            replyMutation,
            noteMutation,
            navigate,
            onReply,
            onReplyError
        );

        if (!postHandler) {
            return;
        }

        try {
            setIsPosting(true);
            await postHandler.execute();
            setIsOpen(false);
            if (onOpenChange) {
                onOpenChange(false);
            }
            toast.success(postHandler.successMessage);
        } catch {
            postHandler.onError?.();
        } finally {
            setIsPosting(false);
        }
    }, [content, user, replyTo, replyMutation, noteMutation, uploadedImageUrl, altText, onReply, onReplyError, setIsOpen, navigate, onOpenChange]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setContent(e.target.value);
    };

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [content]);

    // Focus textarea when modal opens
    useEffect(() => {
        const modalIsOpen = getModalOpenState(props.open, isOpen);
        if (modalIsOpen && textareaRef.current) {
            const timeoutId = setTimeout(() => {
                textareaRef.current?.focus();
            }, 100);
            return () => clearTimeout(timeoutId);
        }
    }, [isOpen, props.open]);

    // Focus alt text input when it becomes visible
    useEffect(() => {
        if (showAltInput && altTextInputRef.current) {
            const timeoutId = setTimeout(() => {
                altTextInputRef.current?.focus();
            }, 100);
            return () => clearTimeout(timeoutId);
        }
    }, [showAltInput]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isDisabled && !isImageUploading) {
                    handlePost();
                }
            }
        };

        const modalIsOpen = getModalOpenState(props.open, isOpen);
        if (modalIsOpen) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, props.open, isDisabled, isImageUploading, handlePost]);

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
                    setImagePreview(previewUrl);
                    await handleImageUpload(file);
                }
                break;
            }
        }
    }, []);

    useEffect(() => {
        const modalIsOpen = getModalOpenState(props.open, isOpen);
        if (modalIsOpen) {
            document.addEventListener('paste', handlePaste);
            return () => document.removeEventListener('paste', handlePaste);
        }
    }, [isOpen, props.open, handlePaste]);

    const handleImageUpload = async (file: File) => {
        try {
            setIsImageUploading(true);
            const imageUrl = await uploadFile(file);
            setUploadedImageUrl(imageUrl);
        } catch (error) {
            setImagePreview(null);
            const statusCode = error && typeof error === 'object' && 'statusCode' in error ? (error as any).statusCode : undefined;
            const errorMessage = getImageErrorMessage(statusCode);
            toast.error(errorMessage);
        } finally {
            setIsImageUploading(false);
        }
    };

    const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;

        if (files && files.length > 0) {
            const file = files[0];

            if (file.size > MAX_FILE_SIZE) {
                toast.error(FILE_SIZE_ERROR_MESSAGE);
                e.target.value = '';
                return;
            }

            const previewUrl = URL.createObjectURL(file);
            setImagePreview(previewUrl);

            await handleImageUpload(file);
        }
    };

    const handleClearImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        setImagePreview(null);
        setUploadedImageUrl(null);
        setAltText('');
        setShowAltInput(false);
        if (imagePreview) {
            URL.revokeObjectURL(imagePreview);
        }

        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    };

    const handleToggleAltInput = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowAltInput(!showAltInput);
    };

    const handleContentClick = () => {
        textareaRef.current?.focus();
    };

    useEffect(() => {
        // Cleanup function to revoke object URLs when component unmounts
        return () => {
            if (imagePreview) {
                URL.revokeObjectURL(imagePreview);
            }
        };
    }, [imagePreview]);

    let placeholder = 'What\'s new?';
    if (replyTo) {
        const attributedTo = replyTo.object.attributedTo || {};
        if (typeof attributedTo === 'object' && 'preferredUsername' in attributedTo && 'id' in attributedTo) {
            placeholder = `Reply to ${getUsername(attributedTo as ActorProperties)}...`;
        }
    }

    return (
        <Dialog open={getModalOpenState(props.open, isOpen)} onOpenChange={(open) => {
            if (open) {
                resetFormState(
                    setContent,
                    setImagePreview,
                    setUploadedImageUrl,
                    setAltText,
                    setShowAltInput,
                    imagePreview,
                    imageInputRef
                );
            }

            setIsOpen(open);

            if (onOpenChange) {
                onOpenChange(open);
            }
        }} {...(props.open !== undefined ? {} : props)}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className={`max-h-[80vh] min-h-[240px] gap-0 overflow-y-auto pb-0`} data-testid="new-note-modal" onClick={e => e.stopPropagation()}>
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
                <div className={`flex ${!imagePreview ? 'min-h-36' : ''} cursor-text items-start gap-3`} onClick={handleContentClick}>
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
                                        rows={1