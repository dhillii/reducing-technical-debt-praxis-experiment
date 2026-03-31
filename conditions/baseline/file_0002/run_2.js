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

const MAX_CONTENT_LENGTH = 500;
const MODAL_FOCUS_DELAY = 100;
const MODAL_STICKY_DELAY = 300;

const NewNoteModal: React.FC<NewNoteModalProps> = ({children, replyTo, onReply, onReplyError, onOpenChange, ...props}) => {
    const {data: user} = useUserDataForUser('index');
    const noteMutation = useNoteMutationForUser('index', user);
    const replyMutation = useReplyMutationForUser('index', user);
    const {data: account, isLoading: isLoadingAccount} = useAccountForUser('index', 'me');
    const navigate = useNavigateWithBasePath();

    const [isOpen, setIsOpen] = useState(false);
    const [content, setContent] = useState('');
    const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
    const [altText, setAltText] = useState('');
    const [showAltInput, setShowAltInput] = useState(false);
    const [isPosting, setIsPosting] = useState(false);
    const [isSticky, setIsSticky] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isImageUploading, setIsImageUploading] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const isDisabled = !content.trim() || !user || isPosting || content.length > MAX_CONTENT_LENGTH;
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
            const timer = setTimeout(() => setIsSticky(true), MODAL_STICKY_DELAY);
            return () => clearTimeout(timer);
        }
        setIsSticky(false);
    }, [modalIsOpen]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [content]);

    // Focus textarea when modal opens
    useEffect(() => {
        if (modalIsOpen && textareaRef.current) {
            const timeoutId = setTimeout(() => textareaRef.current?.focus(), MODAL_FOCUS_DELAY);
            return () => clearTimeout(timeoutId);
        }
    }, [modalIsOpen]);

    // Focus alt text input when it becomes visible
    useEffect(() => {
        if (showAltInput && altTextInputRef.current) {
            const timeoutId = setTimeout(() => altTextInputRef.current?.focus(), MODAL_FOCUS_DELAY);
            return () => clearTimeout(timeoutId);
        }
    }, [showAltInput]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isDisabled && !isImageUploading) {
                    handlePost();
                }
            }
        };

        if (modalIsOpen) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [modalIsOpen, isDisabled, isImageUploading, handlePost]);

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            if (imagePreview) {
                URL.revokeObjectURL(imagePreview);
            }
        };
    }, [imagePreview]);

    const resetFormState = useCallback(() => {
        setContent('');
        setImagePreview(null);
        setUploadedImageUrl(null);
        setAltText('');
        setShowAltInput(false);
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    }, []);

    const revokeImagePreview = useCallback(() => {
        if (imagePreview) {
            URL.revokeObjectURL(imagePreview);
        }
    }, [imagePreview]);

    const handleImageUpload = useCallback(async (file: File) => {
        try {
            setIsImageUploading(true);
            const imageUrl = await uploadFile(file);
            setUploadedImageUrl(imageUrl);
        } catch (error) {
            setImagePreview(null);
            revokeImagePreview();

            const errorMessage = getImageErrorMessage(error);
            toast.error(errorMessage);
        } finally {
            setIsImageUploading(false);
        }
    }, [revokeImagePreview]);

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
            setImagePreview(previewUrl);
            await handleImageUpload(file);
        }
    }, [handleImageUpload]);

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
                    setImagePreview(previewUrl);
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
    }, [modalIsOpen, handlePaste]);

    const handlePost = useCallback(async () => {
        const trimmedContent = content.trim();

        if (!trimmedContent || !user) return;

        try {
            setIsPosting(true);

            const postData = {
                content: trimmedContent,
                imageUrl: uploadedImageUrl || undefined,
                altText: altText || undefined
            };

            if (replyTo) {
                await replyMutation.mutateAsync({
                    inReplyTo: replyTo.object.id,
                    ...postData
                });
                onReply?.();
                toast.success('Reply posted');
            } else {
                await noteMutation.mutateAsync(postData);
                navigate('/notes');
                toast.success('Note posted');
            }

            resetFormState();
            setIsOpen(false);
            onOpenChange?.(false);
        } catch {
            onReplyError?.();
        } finally {
            setIsPosting(false);
        }
    }, [content, user, replyTo, replyMutation, noteMutation, uploadedImageUrl, altText, onReply, onReplyError, navigate, onOpenChange, resetFormState]);

    const handleClearImage = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        revokeImagePreview();
        setImagePreview(null);
        setUploadedImageUrl(null);
        setAltText('');
        setShowAltInput(false);
        if (imageInputRef.current) {
            imageInputRef.current.value = '';
        }
    }, [revokeImagePreview]);

    const handleToggleAltInput = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setShowAltInput(prev => !prev);
    }, []);

    const handleContentClick = useCallback(() => {
        textareaRef.current?.focus();
    }, []);

    const handleDialogOpenChange = useCallback((open: boolean) => {
        if (open) {
            resetFormState();
        }
        setIsOpen(open);
        onOpenChange?.(open);
    }, [resetFormState, onOpenChange]);

    const placeholder = getPlaceholder(replyTo);
    const contentLengthColor = getContentLengthColor(content.length);

    return (
        <Dialog open={modalIsOpen} onOpenChange={handleDialogOpenChange} {...(props.open !== undefined ? {} : props)}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] min-h-[240px] gap-0 overflow-y-auto pb-0" data-testid="new-note-modal" onClick={e => e.stopPropagation()}>
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

                <ContentEditor
                    user={user}
                    account={account}
                    isLoadingAccount={isLoadingAccount}
                    content={content}
                    placeholder={placeholder}
                    textareaRef={textareaRef}
                    imageInputRef={imageInputRef}
                    onContentChange={setContent}
                    onContentClick={handleContentClick}
                    onPaste={handlePaste}
                    onImageChange={handleImageChange}
                />

                {imagePreview && (
                    <ImagePreview
                        src={imagePreview}
                        isUploading={isImageUploading}
                        showAltInput={showAltInput}
                        altText={altText}
                        altTextInputRef={altTextInputRef}
                        onClearImage={handleClearImage}
                        onToggleAltInput={handleToggleAltInput}
                        onAltTextChange={setAltText}
                    />
                )}

                <DialogFooter className={`${isSticky ? 'sticky' : 'static'} bottom-0 flex-row bg-background py-6 dark:bg-[#101114]`}>
                    <Button
                        className='mr-auto w-[34px] !min-w-0'
                        variant='outline'
                        onClick={() => imageInputRef.current?.click()}
                    >
                        <LucideIcon.Image />
                    </Button>
                    <div className='flex items-center space-x-3'>
                        <div className={`text-sm ${contentLengthColor}`}>
                            {content.length}/{MAX_CONTENT_LENGTH}
                        </div>
                        <Button
                            className='min-w-16'
                            data-testid="post-button"
                            disabled={isDisabled || isImageUploading}
                            onClick={handlePost}
                        >
                            {isPosting ? <LoadingIndicator color='light' size='sm' /> : 'Post'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

// Helper Components
interface ContentEditorProps {
    user: ActorProperties | undefined;
    account: any;
    isLoadingAccount: boolean;
    content: string;
    placeholder: string;
    textareaRef: React.RefObject<HTMLTextAreaElement>;
    imageInputRef: React.RefObject<HTMLInputElement>;
    onContentChange: (content: string) => void;
    onContentClick: () => void;
    onPaste: (e: React.ClipboardEvent) => void;
    onImageChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

const ContentEditor: React.FC<ContentEditorProps> = ({
    user,
    account,
    isLoadingAccount,
    content,
    placeholder,
    textareaRef,
    imageInputRef,
    onContentChange,
    onContentClick,
    onPaste,
    onImageChange
}) => (
    <div className={`flex ${!content ? 'min-h-36' : ''} cursor-text items-start gap-3`} onClick={onContentClick}>
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
                            placeholder={placeholder}
                            rows