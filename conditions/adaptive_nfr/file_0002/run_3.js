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
    imagePreview: string | null;
    isImageUploading: boolean;
    isPosting: boolean;
    isSticky: boolean;
}

const INITIAL_MODAL_STATE: ModalState = {
    content: '',
    uploadedImageUrl: null,
    altText: '',
    showAltInput: false,
    imagePreview: null,
    isImageUploading: false,
    isPosting: false,
    isSticky: false,
};

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
    const [state, setState] = useState<ModalState>(INITIAL_MODAL_STATE);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const isDisabled = !state.content.trim() || !user || state.isPosting || state.content.length > MAX_CONTENT_LENGTH;
    const modalIsOpen = props.open !== undefined ? props.open : isOpen;

    // Sync external open prop with internal state
    useEffect(() => {
        if (props.open !== undefined) {
            setIsOpen(props.open);
        }
    }, [props.open]);

    // Handle sticky footer timing
    useEffect(() => {
        if (modalIsOpen) {
            const timer = setTimeout(() => {
                setState(prev => ({...prev, isSticky: true}));
            }, STICKY_DELAY);
            return () => clearTimeout(timer);
        } else {
            setState(prev => ({...prev, isSticky: false}));
        }
    }, [isOpen, props.open]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [state.content]);

    // Focus textarea when modal opens
    useEffect(() => {
        if (modalIsOpen && textareaRef.current) {
            const timeoutId = setTimeout(() => {
                textareaRef.current?.focus();
            }, FOCUS_DELAY);
            return () => clearTimeout(timeoutId);
        }
    }, [isOpen, props.open]);

    // Focus alt text input when it becomes visible
    useEffect(() => {
        if (state.showAltInput && altTextInputRef.current) {
            const timeoutId = setTimeout(() => {
                altTextInputRef.current?.focus();
            }, FOCUS_DELAY);
            return () => clearTimeout(timeoutId);
        }
    }, [state.showAltInput]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isDisabled && !state.isImageUploading) {
                    handlePost();
                }
            }
        };

        if (modalIsOpen) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, props.open, isDisabled, state.isImageUploading]);

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            if (state.imagePreview) {
                URL.revokeObjectURL(state.imagePreview);
            }
        };
    }, []);

    const resetModalState = useCallback(() => {
        if (state.imagePreview) {
            URL.revokeObjectURL(state.imagePreview);
        }
        setState(INITIAL_MODAL_STATE);
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    }, [state.imagePreview]);

    const handleImageUpload = useCallback(async (file: File) => {
        try {
            setState(prev => ({...prev, isImageUploading: true}));
            const imageUrl = await uploadFile(file);
            setState(prev => ({...prev, uploadedImageUrl: imageUrl}));
        } catch (error) {
            setState(prev => ({...prev, imagePreview: null}));
            const errorMessage = getImageErrorMessage(error);
            toast.error(errorMessage);
        } finally {
            setState(prev => ({...prev, isImageUploading: false}));
        }
    }, []);

    const handlePaste = useCallback(async (e: React.ClipboardEvent | ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

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
                    setState(prev => ({...prev, imagePreview: previewUrl}));
                    await handleImageUpload(file);
                }
                break;
            }
        }
    }, [handleImageUpload]);

    // Handle paste events
    useEffect(() => {
        if (modalIsOpen) {
            document.addEventListener('paste', handlePaste);
            return () => document.removeEventListener('paste', handlePaste);
        }
    }, [isOpen, props.open, handlePaste]);

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
            setState(prev => ({...prev, imagePreview: previewUrl}));
            await handleImageUpload(file);
        }
    }, [handleImageUpload]);

    const handleClearImage = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (state.imagePreview) {
            URL.revokeObjectURL(state.imagePreview);
        }
        setState(prev => ({
            ...prev,
            imagePreview: null,
            uploadedImageUrl: null,
            altText: '',
            showAltInput: false,
        }));
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    }, [state.imagePreview]);

    const handleToggleAltInput = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setState(prev => ({...prev, showAltInput: !prev.showAltInput}));
    }, []);

    const handlePost = useCallback(async () => {
        const trimmedContent = state.content.trim();

        if (!trimmedContent || !user) return;

        try {
            setState(prev => ({...prev, isPosting: true}));

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
            setState(prev => ({...prev, isPosting: false}));
        }
    }, [state.content, state.uploadedImageUrl, state.altText, user, replyTo, replyMutation, noteMutation, onReply, onReplyError, navigate, onOpenChange]);

    const handleOpenChange = useCallback((open: boolean) => {
        if (open) {
            resetModalState();
        }
        setIsOpen(open);
        onOpenChange?.(open);
    }, [resetModalState, onOpenChange]);

    const placeholder = getPlaceholder(replyTo);
    const contentLengthColor = getContentLengthColor(state.content.length);

    return (
        <Dialog open={modalIsOpen} onOpenChange={handleOpenChange} {...(props.open !== undefined ? {} : props)}>
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

                <ContentArea
                    user={user}
                    account={account}
                    isLoadingAccount={isLoadingAccount}
                    content={state.content}
                    placeholder={placeholder}
                    textareaRef={textareaRef}
                    imageInputRef={imageInputRef}
                    onContentChange={(content) => setState(prev => ({...prev, content}))}
                    onPaste={handlePaste}
                    onImageChange={handleImageChange}
                    onContentClick={() => textareaRef.current?.focus()}
                />

                {state.imagePreview && (
                    <ImagePreview
                        preview={state.imagePreview}
                        isUploading={state.isImageUploading}
                        showAltInput={state.showAltInput}
                        altText={state.altText}
                        altTextInputRef={altTextInputRef}
                        onClearImage={handleClearImage}
                        onToggleAltInput={handleToggleAltInput}
                        onAltTextChange={(altText) => setState(prev => ({...prev, altText}))}
                    />
                )}

                <DialogFooter className={`${state.isSticky ? 'sticky' : 'static'} bottom-0 flex-row bg-background py-6 dark:bg-[#101114]`}>
                    <Button
                        className='mr-auto w-[34px] !min-w-0'
                        variant='outline'
                        onClick={() => imageInputRef.current?.click()}
                    >
                        <LucideIcon.Image />
                    </Button>
                    <div className='flex items-center space-x-3'>
                        <div className={`text-sm ${contentLengthColor}`}>
                            {state.content.length}/{MAX_CONTENT_LENGTH}
                        </div>
                        <Button
                            className='min-w-16'
                            data-testid="post-button"
                            disabled={isDisabled || state.isImageUploading}
                            onClick={handlePost}
                        >
                            {state.isPosting ? <LoadingIndicator color='light' size='sm' /> : 'Post'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

interface ContentAreaProps {
    user: ActorProperties | undefined;
    account: any;
    isLoadingAccount: boolean;
    content: string;
    placeholder: string;
    textareaRef: React.RefObject<HTMLTextAreaElement>;
    imageInputRef: React.RefObject<HTMLInputElement>;
    onContentChange: (content: string) => void;
    onPaste: (e: React.ClipboardEvent) => void;
    onImageChange: (e: ChangeEvent<HTMLInputElement>) => void;
    onContentClick: () => void;
}

const ContentArea: React.FC<ContentAreaProps> = ({
    user,
    account,
    isLoadingAccount,
    content,
    placeholder,
    textareaRef,
    imageInputRef,
    onContentChange,
    onPaste,
    onImageChange,
    onContentClick,
}) => (
    <div className='flex cursor-text items-start gap-3' onClick={onContentClick}>
        <div className='sticky top-0'>
            <APAvatar author={user as ActorProperties} />
        </div>
        <FormPrimitive.Root asChild>
            <div className='-mt-0.5 flex w-full flex-col gap-0.5'>
                {isLoadingAccount ? (
                    <Skeleton className='w-10' />
                ) : (
                    <span className='min-w-0 truncate whit