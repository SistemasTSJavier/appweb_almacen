interface ToastMessageProps {
  message: string;
  kind?: "info" | "success" | "error";
  onClose?: () => void;
}

export function ToastMessage({ message, kind = "info", onClose }: ToastMessageProps) {
  return (
    <div className={`toast-message toast-${kind}`}>
      <span>{message}</span>
      {onClose ? (
        <button type="button" className="toast-close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      ) : null}
    </div>
  );
}
