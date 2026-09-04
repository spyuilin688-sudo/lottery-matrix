import { CheckIcon } from "@radix-ui/react-icons";

export function ActionFeedback({ message, visible }: { message: string; visible: boolean }) {
  return (
    <p
      className="action-feedback"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-visible={visible}
    >
      <CheckIcon data-feedback-icon="check" aria-hidden="true" />
      <span>{visible ? message : ""}</span>
    </p>
  );
}
