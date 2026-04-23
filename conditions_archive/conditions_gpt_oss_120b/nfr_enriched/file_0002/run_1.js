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

/**
 * NewNoteModal component – creates or replies to a note.
 */
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
    const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [altText, setAltText] = useState('');
    const [showAltInput, setShowAltInput] = useState(false);
    const [isPosting, setIsPosting] = useState(false);
    const [isImageUploading, setIsImageUploading] = useState(false);
    const [isSticky, setIsSticky] = useState(false);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const altTextInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    const MAX_CONTENT_LENGTH = 500;
    const isDisabled = !content.trim() || !user || isPosting || content.length > MAX_CONTENT_LENGTH;

    /** Sync external `open` prop with internal state. */
    useEffect(() => {
        if (props.open !== undefined) {
            setIsOpen(props.open);
        }
    }, [props.open]);

    /** Manage sticky footer based on modal visibility. */
    useEffect(() => {
        const modalIsOpen = props.open !== undefined ? props.open : isOpen;
        if (modalIsOpen) {
            const timer = setTimeout(() => setIsSticky(true), 300);
            return () => clearTimeout(timer);
        }
        setIsSticky(false);
    }, [isOpen, props.open]);

    /** Auto‑resize textarea height when content changes. */
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [content]);

    /** Focus textarea when modal opens. */
    useEffect(() => {
        const modalIsOpen = props.open !== undefined ? props.open : isOpen;
        if (modalIsOpen && textareaRef.current) {
            const id = setTimeout(() => textareaRef.current?.focus(), 100);
            return () => clearTimeout(id);
        }
    }, [isOpen, props.open]);

    /** Focus alt‑text input when it becomes visible. */
    useEffect(() => {
        if (showAltInput && altTextInputRef.current) {
            const id = setTimeout(() => altTextInputRef.current?.focus(), 100);
            return () => clearTimeout(id);
        }
    }, [showAltInput]);

    /** Handle Cmd/Ctrl + Enter shortcut for posting. */
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isDisabled && !isImageUploading) {
                    executePost();
                }
            }
        };
        const modalIsOpen = props.open !== undefined ? props.open : isOpen;
        if (modalIsOpen) {
            document.addEventListener('keydown', onKeyDown);
            return () => document.removeEventListener('keydown', onKeyDown);
        }
    }, [isOpen, props.open, isDisabled, isImageUploading]);

    /** Attach paste listener for image pasting. */
    useEffect(() => {
        const modalIsOpen = props.open !== undefined ? props.open : isOpen;
        if (modalIsOpen) {
            document.addEventListener('paste', handlePaste);
            return () => document.removeEventListener('paste', handlePaste);
        }
    }, [isOpen, props.open, handlePaste]);

    /** Revoke object URLs on unmount. */
    useEffect(() => {
        return () => {
            if (imagePreview) {
                URL.revokeObjectURL(imagePreview);
            }
        };
    }, [imagePreview]);

    /** Compute placeholder based on reply context. */
    const getPlaceholder = (): string => {
        if (!replyTo) return "What's new?";
        const attributedTo = replyTo.object.attributedTo || {};
        if (typeof attributedTo === 'object' && 'preferredUsername' in attributedTo && 'id' in attributedTo) {
            return `Reply to ${getUsername(attributedTo as ActorProperties)}...`;
        }
        return "What's new?";
    };
    const placeholder = getPlaceholder();

    /** Post a new note (non‑reply). */
    const postNote = async (trimmed: string) => {
        await noteMutation.mutateAsync({
            content: trimmed,
            imageUrl: uploadedImageUrl ?? undefined,
            altText: altText || undefined,
        });
        navigate('/notes');
    };

    /** Post a reply to an existing note. */
    const postReply = async (trimmed: string) => {
        await replyMutation.mutateAsync({
            inReplyTo: replyTo!.object.id,
            content: trimmed,
            imageUrl: uploadedImageUrl ?? undefined,
            altText: altText || undefined,
        });
        onReply?.();
    };

    /** Execute posting logic (note or reply). */
    const executePost = useCallback(async () => {
        const trimmed = content.trim();
        if (!trimmed || !user) return;

        try {
            setIsPosting(true);
            if (replyTo) {
                await postReply(trimmed);
                toast.success('Reply posted');
            } else {
                await postNote(trimmed);
                toast.success('Note posted');
            }
            closeModal();
        } catch {
            if (replyTo) {
                onReplyError?.();
            }
        } finally {
            setIsPosting(false);
        }
    }, [content, user, replyTo, uploadedImageUrl, altText, onReply, onReplyError]);

    /** Close modal and notify external listeners. */
    const closeModal = () => {
        setIsOpen(false);
        onOpenChange?.(false);
    };

    /** Handle textarea change. */
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setContent(e.target.value);
    };

    /** Handle image paste from clipboard. */
    const handlePaste = useCallback(async (e: ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.includes('image')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) break;

                if (file.size > MAX_FILE_SIZE) {
                    toast.error(FILE_SIZE_ERROR_MESSAGE);
                    break;
                }

                const previewUrl = URL.createObjectURL(file);
                setImagePreview(previewUrl);
                await handleImageUpload(file);
                break;
            }
        }
    }, []);

    /** Upload image file and store resulting URL. */
    const handleImageUpload = async (file: File) => {
        try {
            setIsImageUploading(true);
            const url = await uploadFile(file);
            setUploadedImageUrl(url);
        } catch (error: any) {
            setImagePreview(null);
            let msg = 'Failed to upload image. Try again.';
            if (error?.statusCode) {
                if (error.statusCode === 413) msg = 'Image size exceeds limit.';
                else if (error.statusCode === 415) msg = 'The file type is not supported.';
            }
            toast.error(msg);
        } finally {
            setIsImageUploading(false);
        }
    };

    /** Handle file selection via input. */
    const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > MAX_FILE_SIZE) {
            toast.error(FILE_SIZE_ERROR_MESSAGE);
            e.target.value = '';
            return;
        }

        const previewUrl = URL.createObjectURL(file);
        setImagePreview(previewUrl);
        await handleImageUpload(file);
    };

    /** Clear selected image and related state. */
    const handleClearImage = (e: React.MouseEvent) => {
        e.stopPropagation();
        setImagePreview(null);
        setUploadedImageUrl(null);
        setAltText('');
        setShowAltInput(false);
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        if (imageInputRef.current) imageInputRef.current.value = '';
    };

    /** Toggle visibility of alt‑text input. */
    const handleToggleAltInput = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowAltInput(prev => !prev);
    };

    /** Focus textarea when user clicks the content area. */
    const handleContentClick = () => {
        textareaRef.current?.focus();
    };

    return (
        <Dialog
            open={props.open !== undefined ? props.open : isOpen}
            onOpenChange={(open) => {
                if (open) {
                    setContent('');
                    setImagePreview(null);
                    setUploadedImageUrl(null);
                    setAltText('');
                    setShowAltInput(false);
                    if (imagePreview) URL.revokeObjectURL(imagePreview);
                    if (imageInputRef.current) imageInputRef.current.value = '';
                }
                setIsOpen(open);
                onOpenChange?.(open);
            }}
            {...(props.open !== undefined ? {} : props)}
        >
            <DialogTrigger asChild>{children}</DialogTrigger>
            <DialogContent
                className="max-h-[80vh] min-h-[240px] gap-0 overflow-y-auto pb-0"
                data-testid="new-note-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <DialogHeader className="hidden">
                    <DialogTitle>{replyTo ? 'Reply' : 'New note'}</DialogTitle>
                    <DialogDescription>Post your thoughts to the Social web</DialogDescription>
                </DialogHeader>

                {replyTo && (
                    <FeedItem
                        actor={replyTo.actor}
                        allowDelete={false}
                        commentCount={replyTo.object.replyCount ?? 0}
                        isCompact
                        layout="reply"
                        likeCount={replyTo.object.likeCount ?? 0}
                        object={replyTo.object}
                        repostCount={replyTo.object.repostCount ?? 0}
                        type={replyTo.object.type === 'Article' ? 'Article' : 'Note'}
                        onClick={() => {}}
                    />
                )}

                <div
                    className={`flex ${!imagePreview ? 'min-h-36' : ''} cursor-text items-start gap-3`}
                    onClick={handleContentClick}
                >
                    <div className="sticky top-0">
                        <APAvatar author={user as ActorProperties} />
                    </div>
                    <FormPrimitive.Root asChild>
                        <div className="-mt-0.5 flex w-full flex-col gap-0.5">
                            {isLoadingAccount ? (
                                <Skeleton className="w-10" />
                            ) : (
                                <span className="min-w-0 truncate whitespace-nowrap font-semibold text-black break-anywhere dark:text-white">
                                    {account?.name}
                                </span>
                            )}
                            <FormPrimitive.Field name="content" asChild>
                                <FormPrimitive.Control asChild>
                                    <textarea
                                        ref={textareaRef}
                                        autoFocus
                                        className="ap-textarea w-full resize-none bg-transparent text-[1.5rem] break-anywhere"
                                        data-testid="note-textarea"
                                        placeholder={placeholder}
                                        rows={1}
                                        value={content}
                                        onChange={handleChange}
                                        onPaste={handlePaste}
                                    />
                                </FormPrimitive.Control>
                            </FormPrimitive.Field>
                            <FormPrimitive.Field name="image" asChild>
                                <FormPrimitive.Control asChild>
                                    <input
                                        ref={imageInputRef}
                                        accept="image/jpeg,image/png,image/webp,image/gif"
                                        className="hidden"
                                        type="file"
                                        onChange={handleImageChange}
                                    />
                                </FormPrimitive.Control>
                            </FormPrimitive.Field>
                        </div>
                    </FormPrimitive.Root>
                </div>

                {imagePreview && (
                    <div className="group relative mt-6 flex min-h-[200px] w-full items-center justify-center">
                        <img
                            alt="Image attachment preview"
                            className={`max-h-[320px] w-full rounded-sm object-cover outline outline-1 -outline-offset-1 outline-black/10 ${
                                isImageUploading && 'opacity-10'
                            }`}
                            src={imagePreview}
                        />
                        {isImageUploading && (
                            <div className="absolute leading-[0]">
                                <LoadingIndicator size="md" />
                            </div>
                        )}
                        <Button
                            className="absolute right-3 top-3 size-8 bg-black/60 text-white opacity-0 hover:bg-black/80 group-hover:opacity-100"
                            onClick={handleClearImage}
                        >
                            <LucideIcon.Trash2 />
                        </Button>
                        {!isImageUploading && (
                            <Button
                                className={`absolute bottom-3 left-3 h-6 px-2 py-0 text-white ${
                                    !showAltInput ? 'bg-black/60 hover:bg-black/80' : 'bg-green-500 hover:bg-green-500'
                                }`}
                                onClick={handleToggleAltInput}
                            >
                                Alt
                            </Button>
                        )}
                    </div>
                )}

                {imagePreview && !isImageUploading && showAltInput && (
                    <div className="mt-1">
                        <Input
                            ref={altTextInputRef}
                            className="w-full border-0 bg-transparent px-0 focus-visible:border-0 focus-visible:bg-transparent focus-visible:shadow-none focus-visible:outline-0 dark:bg-[#101114] dark:text-white dark:placeholder:text-gray-800"
                            placeholder="Type alt text for image (optional)"
                            type="text"
                            value={altText}
                            onChange={(e) => setAltText(e.target.value)}
                        />
                    </div>
                )}

                <DialogFooter
                    className={`${isSticky ? 'sticky' : 'static'} bottom-0 flex-row bg-background py-6 dark:bg-[#101114]`}
                >
                    <Button
                        className="mr-auto w-[34px] !min-w-0"
                        variant="outline"
                        onClick={() => imageInputRef.current?.click()}
                    >
                        <LucideIcon.Image />
                    </Button>
                    <div className="flex items-center space-x-3">
                        <div
                            className={`text-sm ${
                                content.length >= MAX_CONTENT_LENGTH
                                    ? 'text-red-500'
                                    : content.length >= MAX_CONTENT_LENGTH * 0.9
                                    ? 'text-yellow-600'
                                    : 'text-gray-500'
                            }`}
                        >
                            {content.length}/{MAX_CONTENT_LENGTH}
                        </div>
                        <Button
                            className="min-w-16"
                            data-testid="post-button"
                            disabled={isDisabled || isImageUploading}
                            onClick={executePost}
                        >
                            {isPosting ? <LoadingIndicator color="light" size="sm" /> : 'Post'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default NewNoteModal;