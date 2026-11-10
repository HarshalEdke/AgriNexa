import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'secondary' | 'danger';
}

export function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  const base =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]';

  const variants: Record<string, string> = {
    primary:
      'bg-[#FFB700] text-[#212529] hover:bg-[#F2AD00] shadow-sm hover:shadow-md focus-visible:outline-[#4C8A1F] disabled:bg-[#FFB700]',
    outline:
      'border border-[#6CBE03] text-[#2A4D11] bg-white hover:bg-[#EAF6DA] focus-visible:outline-[#4C8A1F]',
    secondary:
      'border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 focus-visible:outline-slate-600',
    danger:
      'border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 focus-visible:outline-red-600',
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
