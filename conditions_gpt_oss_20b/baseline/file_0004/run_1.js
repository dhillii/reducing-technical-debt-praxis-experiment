import { useModal } from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {
  useEffect,
  useState,
  forwardRef,
  useCallback,
  MouseEvent,
  KeyboardEvent,
} from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import { confirmIfDirty } from '../../utils/modals';
import Button, { ButtonColor, ButtonProps } from '../button';
import ButtonGroup from '../button-group';
import Heading from '../heading';
import StickyFooter from '../sticky-footer';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'bleed';

export interface ModalProps {
  size?: ModalSize;
  width?: 'full' | 'toSidebar' | number;
  height?: 'full' | number;
  align?: 'center' | 'left' | 'right';
  testId?: string;
  title?: string;
  okLabel?: string;
  okColor?: ButtonColor;
  okLoading?: boolean;
  cancelLabel?: string;
  leftButtonProps?: ButtonProps;
  buttonsDisabled?: boolean;
  okDisabled?: boolean;
  footer?: boolean | React.ReactNode;
  header?: boolean;
  padding?: boolean;
  onOk?: () => void;
  onCancel?: () => void;
  topRightContent?: 'close' | React.ReactNode;
  hideXOnMobile?: boolean;
  afterClose?: () => void;
  children?: React.ReactNode;
  backDrop?: boolean;
  backDropClick?: boolean;
  stickyFooter?: boolean;
  stickyHeader?: boolean;
  scrolling?: boolean;
  dirty?: boolean;
  animate?: boolean;
  formSheet?: boolean;
  enableCMDS?: boolean;
  allowBackgroundInteraction?: boolean;
}

export const topLevelBackdropClasses =
  'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

const getModalClasses = (
  size: ModalSize,
  align: 'center' | 'left' | 'right',
  formSheet: boolean,
  animate: boolean,
  animationFinished: boolean,
  scrolling: boolean,
  width: ModalProps['width'],
  height: ModalProps['height'],
  paddingClasses: string,
  stickyHeader: boolean,
  stickyFooter: boolean,
  padding: boolean,
  maxWidth?: string,
  maxHeight?: string
) => {
  let classes = clsx(
    'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
    align === 'center' && 'mx-auto',
    align === 'left' && 'mr-auto',
    align === 'right' && 'ml-auto',
    size !== 'bleed' && 'rounded',
    formSheet ? 'shadow-md' : 'shadow-xl',
    (animate && !formSheet && !animationFinished && align === 'center') &&
      'animate-modal-in',
    (animate && !formSheet && !animationFinished && align === 'right') &&
      'animate-modal-in-from-right',
    (formSheet && !animationFinished) && 'animate-modal-in-reverse',
    scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
  );

  const sizeClasses: Record<ModalSize, string> = {
    sm: 'max-w-[480px]',
    md: 'max-w-[720px]',
    lg: 'max-w-[1020px]',
    xl: 'max-w-[1240px]0',
    full: 'h-full',
    bleed: 'h-full',
  };

  classes = clsx(classes, sizeClasses[size]);

  if (width === 'full') classes = clsx(classes, 'w-full');
  if (width === 'toSidebar')
    classes = clsx(
      classes,
      'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
    );

  if (height === 'full') classes = clsx(classes, 'h-full');

  if (maxWidth) classes = clsx(classes, `max-w-[${maxWidth}]`);
  if (maxHeight) classes = clsx(classes, `max-h-[${maxHeight}]`);

  return classes;
};

const getBackdropClasses = (
  allowBackgroundInteraction: boolean,
  size: ModalSize,
  paddingClasses: string
) => {
  let classes = clsx(
    'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
    allowBackgroundInteraction && 'pointer-events-none'
  );

  const sizePadding: Record<ModalSize, string> = {
    sm: 'p-4 md:p-[8vmin]',
    md: 'p-4 md:p-[8vmin]',
    lg: 'p-4 md:p-[4vmin]',
    xl: 'p-4 md:p-[3vmin]',
    full: 'p-4 md:p-[3vmin]',
    bleed: '',
  };

  classes = clsx(classes, sizePadding[size] || 'p-4 md:p-[8vmin]');
  classes = clsx(classes, 'max-[800px]:!pb-20');

  return classes;
};

const getHeaderClasses = (
  topRightContent: ModalProps['topRightContent'],
  hideXOnMobile: boolean,
  stickyHeader: boolean,
  paddingClasses: string
) => {
  let classes = clsx(
    (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
  );

  if (stickyHeader)
    classes = clsx(
      classes,
      'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
    );

  classes = clsx(classes, paddingClasses, 'pb-0');
  return classes;
};

const getContentClasses = (
  paddingClasses: string,
  size: ModalSize,
  height: ModalProps['height']
) => {
  let classes = clsx(paddingClasses, 'py-0');
  if (
    size === 'full' ||
    size === 'bleed' ||
    height === 'full' ||
    typeof height === 'number'
  )
    classes = clsx(classes, 'grow');
  return classes;
};

const getFooterContent = (
  footer: boolean | React.ReactNode,
  buttons: ButtonProps[],
  leftButtonProps: ModalProps['leftButtonProps'],
  stickyFooter: boolean,
  footerClasses: string
) => {
  let content: React.ReactNode;
  if (footer) {
    content = footer;
  } else if (footer === false) {
    content = null;
  } else {
    content = (
      <div className={footerClasses}>
        <div>{leftButtonProps && <Button {...leftButtonProps} />}</div>
        <div className="flex gap-3">
          <ButtonGroup buttons={buttons} />
        </div>
      </div>
    );
  }

  return stickyFooter ? (
    <StickyFooter height={84}>{content}</StickyFooter>
  ) : (
    <>{content}</>
  );
};

const Modal = forwardRef<HTMLElement, ModalProps>((props, ref) => {
  const {
    size = 'md',
    align = 'center',
    width,
    height,
    testId,
    title,
    okLabel = 'OK',
    okLoading = false,
    cancelLabel = 'Cancel',
    footer,
    header,
    leftButtonProps,
    buttonsDisabled,
    okDisabled,
    padding = true,
    onOk,
    okColor = 'black',
    onCancel,
    topRightContent,
    hideXOnMobile = false,
    afterClose,
    children,
    backDrop = true,
    backDropClick = true,
    stickyFooter = false,
    stickyHeader = false,
    scrolling = true,
    dirty = false,
    animate = true,
    formSheet = false,
    enableCMDS = true,
    allowBackgroundInteraction = false,
  } = props;

  const modal = useModal();
  const { setGlobalDirtyState } = useGlobalDirtyState();
  const [animationFinished, setAnimationFinished] = useState(false);
  const [modalStyles, setModalStyles] = useState<{
    width?: string;
    height?: string;
    maxWidth?: string;
    maxHeight?: string;
  }>({});

  useEffect(() => setGlobalDirtyState(dirty), [dirty, setGlobalDirtyState]);

  const handleEscapeKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const activeEl = document.activeElement;
      if (activeEl?.hasAttribute('data-kg-link-input')) return;
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
      setTimeout(() => {
        if (onCancel) onCancel();
        else confirmIfDirty(dirty, () => {
          modal.remove();
          afterClose?.();
        });
      });
      event.stopPropagation();
    },
    [modal, dirty, afterClose, onCancel]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleEscapeKey);
    return () => document.removeEventListener('keydown', handleEscapeKey);
  }, [handleEscapeKey]);

  useEffect(() => {
    const timer = setTimeout(() => setAnimationFinished(true), 250);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!onOk || !enableCMDS) return;
    const handleCMDS = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        onOk();
      }
    };
    window.addEventListener('keydown', handleCMDS);
    return () => window.removeEventListener('keydown', handleCMDS);
  }, [onOk, enableCMDS]);

  const removeModal = useCallback(() => {
    confirmIfDirty(dirty, () => {
      modal.remove();
      afterClose?.();
    });
  }, [dirty, modal, afterClose]);

  const buttons: ButtonProps[] = [];
  if (!footer) {
    if (cancelLabel)
      buttons.push({
        key: 'cancel-modal',
        label: cancelLabel,
        color: 'outline',
        onClick: onCancel ?? removeModal,
        disabled: buttonsDisabled,
      });
    if (okLabel)
      buttons.push({
        key: 'ok-modal',
        label: okLabel,
        color: okColor,
        className: 'min-w-[80px]',
        onClick: onOk,
        disabled: buttonsDisabled || okDisabled,
        loading: okLoading,
      });
  }

  const paddingClasses = padding ? 'p-8' : 'p-0';

  const modalClasses = getModalClasses(
    size,
    align,
    formSheet,
    animate,
    animationFinished,
    scrolling,
    width,
    height,
    paddingClasses,
    stickyHeader,
    stickyFooter,
    padding
  );

  const backdropClasses = getBackdropClasses(
    allowBackgroundInteraction,
    size,
    paddingClasses
  );

  const headerClasses = getHeaderClasses(
    topRightContent,
    hideXOnMobile,
    stickyHeader,
    paddingClasses
  );

  const contentClasses = getContentClasses(paddingClasses, size, height);

  const footerClasses = clsx(
    `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
    'flex w-full items-center justify-between'
  );

  const footerContent = getFooterContent(
    footer,
    buttons,
    leftButtonProps,
    stickyFooter,
    footerClasses
  );

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && backDropClick) removeModal();
  };

  useEffect(() => {
    if (typeof width === 'number') {
      setModalStyles({ width: '100%', maxWidth: `${width}px` });
    } else if (typeof height === 'number') {
      setModalStyles({ height: '100%', maxHeight: `${height}px` });
    }
  }, [width, height]);

  return (
    <div className={backdropClasses} id="modal-backdrop" onMouseDown={handleBackdropClick}>
      <div
        className={clsx(
          'pointer-events-none fixed inset-0 z-0',
          backDrop && !formSheet && topLevelBackdropClasses,
          formSheet && 'bg-[rgba(98,109,121,0.08)]'
        )}
      />
      <section
        ref={ref}
        className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')}
        data-testid={testId}
        style={modalStyles}
      >
        {header !== false && (
          <header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            {topRightContent === 'close' ? (
              <div
                className={`${hideXOnMobile && 'hidden'} absolute right-6 top-6`}
              >
                <Button
                  className="-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100"
                  icon="close"
                  iconColorClass="text-black dark:text-white"
                  size="sm"
                  testId="close-modal"
                  unstyled
                  onClick={removeModal}
                />
              </div>
            ) : (
              topRightContent
            )}
          </header>
        )}
        <div className={contentClasses}>{children}</div>
        {footerContent}
      </section>
    </div>
  );
});

Modal.displayName = 'Modal';

export default Modal;