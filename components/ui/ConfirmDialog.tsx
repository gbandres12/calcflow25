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
    narrow
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

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/** Troca o window.confirm(): `if (!(await confirm({...}))) return;` */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = React.useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = React.useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    []
  );

  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          title={pending.title}
          description={pending.description}
          confirmLabel={pending.confirmLabel}
          danger={pending.danger}
          onConfirm={() => settle(true)}
          onClose={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
};

export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  return ctx ?? (async (options) => window.confirm(options.description));
}
