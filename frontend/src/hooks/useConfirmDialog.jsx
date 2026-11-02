import { useState, useRef } from 'react';

export function useConfirmDialog() {
  const resolverRef = useRef(null);

  const [dialogState, setDialogState] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'confirm',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    placeholder: '',
    fields: [],
    onConfirm: () => {}
  });

  const closeDialog = () => {
    // If a promise is pending (user dismissed without confirming), resolve false
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setDialogState(prev => ({ ...prev, isOpen: false }));
  };

  const showDialog = (config) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialogState({
        isOpen: true,
        title: config.title || 'Confirm',
        message: config.message || '',
        type: config.type || 'confirm',
        confirmText: config.confirmText || 'Confirm',
        cancelText: config.cancelText || 'Cancel',
        placeholder: config.placeholder || '',
        fields: config.fields || [],
        onConfirm: (value) => {
          // value is the input for prompt types; true for plain confirm
          if (resolverRef.current) {
            resolverRef.current(value ?? true);
            resolverRef.current = null;
          }
          setDialogState(prev => ({ ...prev, isOpen: false }));
        }
      });
    });
  };

  return {
    dialogState,
    showDialog,
    closeDialog
  };
}
