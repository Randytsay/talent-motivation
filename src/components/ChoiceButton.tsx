import type { ReactNode } from 'react';

interface ChoiceButtonProps {
  children: ReactNode;
  description?: string;
  selected?: boolean;
  onClick: () => void;
  className?: string;
}

export function ChoiceButton({ children, description, selected = false, onClick, className = '' }: ChoiceButtonProps) {
  return (
    <button
      className={`choice-button ${selected ? 'choice-button--selected' : ''} ${className}`}
      type="button"
      aria-pressed={selected}
      onClick={onClick}
    >
      <span>{children}</span>
      {description ? <small>{description}</small> : null}
    </button>
  );
}
