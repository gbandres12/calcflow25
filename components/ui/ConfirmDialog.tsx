import React from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Voltar',
  danger,
  onConfirm,
  onClose,
}) => (
  <Modal
    title={title}
    onClose={onClose}
    footer={
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    }
  >
    <p className="text-sm text-[var(--cf-ink)]">{description}</p>
  </Modal>
);
