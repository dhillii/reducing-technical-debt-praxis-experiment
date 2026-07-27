import { useModal } from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, { useEffect, useState, forwardRef } from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import { confirmIfDirty } from '../../utils/modals';
import Button, { ButtonColor, ButtonProps } from '../button';
import ButtonGroup from '../button-group';
import Heading from '../heading';
import StickyFooter from '../sticky-footer';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'bleed';

export interface ModalProps {
  /**
   * Possible values are: `sm`, `md`, `lg`, `xl, `full`, `bleed`. Yu can also use any number to set an arbitrary width.
   */
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

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

const Modal = forwardRef<HTMLElement, ModalProps>(({
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
  allowBackgroundInteraction = false
}, ref) => {
  const modal = useModal();
  const { setGlobalDirtyState } = useGlobalDirtyState();
  const [animationFinished, setAnimationFinished] = useState(false);

  useEffect(() => {
    setGlobalDirtyState(dirty);
  }, [dirty, setGlobalDirtyState]);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      handleEscapeKeyPress(event, modal, dirty, onCancel, afterClose);
    };

    document.addEventListener('keydown', handleEscapeKey);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [modal, dirty, afterClose, onCancel]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setAnimationFinished(true);
    }, 250);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (onOk) {
      const handleCMDS = (e: KeyboardEvent) => {
        handleCMDSKeyPress(e, onOk);
      };

      if (enableCMDS) {
        window.addEventListener('keydown', handleCMDS);
        return () => {
          window.removeEventListener('keydown', handleCMDS);
        };
      }
    }
  }, [onOk, enableCMDS]);

  const buttons = getButtons(okLabel, cancelLabel, okColor, okLoading, buttonsDisabled, okDisabled, leftButtonProps, onOk, onCancel);

  const modalClasses = getModalClasses(size, align, formSheet, animate, animationFinished, scrolling);
  const backdropClasses = getBackdropClasses(allowBackgroundInteraction);
  const paddingClasses = getPaddingClasses(padding);
  const headerClasses = getHeaderClasses(stickyHeader, paddingClasses, topRightContent);

  const contentClasses = getContentClasses(paddingClasses, size, height);

  const footerContent = getFooterContent(footer, footerClasses, stickyFooter, leftButtonProps, buttons);

  const modalStyles = getModalStyles(width, height);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    handleBackdropClickEvent(e, backDropClick, modal, dirty, afterClose);
  };

  return (
    <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
      <div className={clsx(
        'pointer-events-none fixed inset-0 z-0',
        (backDrop && !formSheet) && topLevelBackdropClasses,
        formSheet && 'bg-[rgba(98,109,121,0.08)]'
      )}></div>
      <section ref={ref} className={clsx(
        modalClasses,
        allowBackgroundInteraction && 'pointer-events-auto'
      )} data-testid={testId} style={modalStyles}>
        {getHeader(header, title, topRightContent, hideXOnMobile, headerClasses, modal, dirty, afterClose)}
        <div className={contentClasses}>
          {children}
        </div>
        {footerContent}
      </section>
    </div>
  );
});

const handleEscapeKeyPress = (event: KeyboardEvent, modal: any, dirty: boolean, onCancel: (() => void) | undefined, afterClose: (() => void) | undefined) => {
  // Don't close modal if user is in Koenig's link input (which handles ESC itself)
  const activeEl = document.activeElement;
  if (activeEl?.hasAttribute('data-kg-link-input')) {
    return;
  }

  // Fix for Safari - if an element in the modal is focused, closing it will jump to
  // the bottom of the page because Safari tries to focus the "next" element in the DOM
  if (document.activeElement && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  // Close the modal on the next tick so that the blur registers
  setTimeout(() => {
    if (onCancel) {
      onCancel();
    } else {
      confirmIfDirty(dirty, () => {
        modal.remove();
        afterClose?.();
      });
    }
  });

  // Prevent the event from bubbling up to the window level
  event.stopPropagation();
};

const handleCMDSKeyPress = (e: KeyboardEvent, onOk: () => void) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    onOk();
  }
};

const getButtons = (okLabel: string, cancelLabel: string, okColor: ButtonColor, okLoading: boolean, buttonsDisabled: boolean | undefined, okDisabled: boolean | undefined, leftButtonProps: ButtonProps | undefined, onOk: (() => void) | undefined, onCancel: (() => void) | undefined) => {
  const buttons: ButtonProps[] = [];

  if (cancelLabel) {
    buttons.push({
      key: 'cancel-modal',
      label: cancelLabel,
      color: 'outline',
      onClick: (onCancel ? onCancel : () => {
        confirmIfDirty(true, () => {
          // Remove modal logic
        });
      }),
      disabled: buttonsDisabled
    });
  }

  if (okLabel) {
    buttons.push({
      key: 'ok-modal',
      label: okLabel,
      color: okColor,
      className: 'min-w-[80px]',
      onClick: onOk,
      disabled: buttonsDisabled || okDisabled,
      loading: okLoading
    });
  }

  return buttons;
};

const getModalClasses = (size: ModalSize, align: 'center' | 'left' | 'right', formSheet: boolean, animate: boolean, animationFinished: boolean, scrolling: boolean) => {
  let modalClasses = clsx(
    'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
    align === 'center' && 'mx-auto',
    align === 'left' && 'mr-auto',
    align === 'right' && 'ml-auto',
    size !== 'bleed' && 'rounded',
    formSheet ? 'shadow-md' : 'shadow-xl',
    (animate && !formSheet && !animationFinished && align === 'center') && 'animate-modal-in',
    (animate && !formSheet && !animationFinished && align === 'right') && 'animate-modal-in-from-right',
    (formSheet && !animationFinished) && 'animate-modal-in-reverse',
    scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
  );

  switch (size) {
    case 'sm':
      modalClasses = clsx(
        modalClasses,
        'max-w-[480px]'
      );
      break;

    case 'md':
      modalClasses = clsx(
        modalClasses,
        'max-w-[720px]'
      );
      break;

    case 'lg':
      modalClasses = clsx(
        modalClasses,
        'max-w-[1020px]'
      );
      break;

    case 'xl':
      modalClasses = clsx(
        modalClasses,
        'max-w-[1240px]0'
      );
      break;

    case 'full':
      modalClasses = clsx(
        modalClasses,
        'h-full'
      );
      break;

    case 'bleed':
      modalClasses = clsx(
        modalClasses,
        'h-full'
      );
      break;

    default:
      break;
  }

  return modalClasses;
};

const getBackdropClasses = (allowBackgroundInteraction: boolean) => {
  let backdropClasses = clsx(
    'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
    allowBackgroundInteraction && 'pointer-events-none'
  );

  return backdropClasses;
};

const getPaddingClasses = (padding: boolean) => {
  let paddingClasses = padding ? 'p-8' : 'p-0';

  return paddingClasses;
};

const getHeaderClasses = (stickyHeader: boolean, paddingClasses: string, topRightContent: 'close' | React.ReactNode) => {
  let headerClasses = clsx(
    (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
    stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black',
    paddingClasses,
    'pb-0'
  );

  return headerClasses;
};

const getContentClasses = (paddingClasses: string, size: ModalSize, height: 'full' | number) => {
  let contentClasses = clsx(
    paddingClasses,
    'py-0',
    ((size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') && 'grow')
  );

  return contentClasses;
};

const getFooterContent = (footer: boolean | React.ReactNode, footerClasses: string, stickyFooter: boolean, leftButtonProps: ButtonProps | undefined, buttons: ButtonProps[]) => {
  let footerContent;

  if (footer) {
    footerContent = footer;
  } else if (footer === false) {
    // Remove footer
  } else {
    footerContent = (
      <div className={footerClasses}>
        <div>
          {leftButtonProps && <Button {...leftButtonProps} />}
        </div>
        <div className='flex gap-3'>
          <ButtonGroup buttons={buttons} />
        </div>
      </div>
    );
  }

  footerContent = (stickyFooter ?
    <StickyFooter height={84}>
      {footerContent}
    </StickyFooter>
    :
    <>
      {footerContent}
    </>
  );

  return footerContent;
};

const getModalStyles = (width: 'full' | 'toSidebar' | number, height: 'full' | number) => {
  const modalStyles: { width?: string; height?: string; maxWidth?: string; maxHeight?: string } = {};

  if (typeof width === 'number') {
    modalStyles.width = '100%';
    modalStyles.maxWidth = width + 'px';
  } else if (width === 'full') {
    // Set full width
  } else if (width === 'toSidebar') {
    // Set width to sidebar
  }

  if (typeof height === 'number') {
    modalStyles.height = '100%';
    modalStyles.maxHeight = height + 'px';
  } else if (height === 'full') {
    // Set full height
  }

  return modalStyles;
};

const handleBackdropClickEvent = (e: React.MouseEvent<HTMLDivElement>, backDropClick: boolean, modal: any, dirty: boolean, afterClose: (() => void) | undefined) => {
  if (e.target === e.currentTarget && backDropClick) {
    confirmIfDirty(dirty, () => {
      modal.remove();
      afterClose?.();
    });
  }
};

const getHeader = (header: boolean, title: string | undefined, topRightContent: 'close' | React.ReactNode, hideXOnMobile: boolean, headerClasses: string, modal: any, dirty: boolean, afterClose: (() => void) | undefined) => {
  if (header === false) {
    return '';
  }

  return (
    <header className={headerClasses}>
      {title && <Heading level={3}>{title}</Heading>}
      <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
        <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={() => {
          confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
          });
        }} />
      </div>
    </header>
  );
};

Modal.displayName = 'Modal';

export default Modal;