import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--cf-forest)] text-white hover:bg-[var(--cf-forest-deep)]',
  secondary: 'bg-[var(--cf-cream)] text-[var(--cf-ink)] border border-[var(--cf-line)] hover:bg-[var(--cf-forest-soft)]',
  ghost: 'bg-transparent text-[var(--cf-ink-soft)] hover:bg-[var(--cf-forest-soft)]',
  danger: 'bg-rose-700 text-white hover:bg-rose-800',
};

const sizeClass: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-xs',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-base',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...rest
}) => (
  <button
    type={type}
    className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold disabled:opacity-50 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
    {...rest}
  >
    {children}
  </button>
);
