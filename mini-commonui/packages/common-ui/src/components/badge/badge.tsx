import React from 'react';
import { IBadgeProps } from './ibadge';
import './badge.css';

const baseClass = 'Cui-Badge';

const Badge: React.FC<IBadgeProps> = (props: IBadgeProps) => {
  const {
    children,
    count,
    max = 99,
    showZero = false,
    variant = 'standard',
    color = 'error',
    invisible = false,
    className = '',
  } = props;

  const isDot = variant === 'dot';
  const isHidden = invisible || (!isDot && count === 0 && !showZero);

  const displayLabel = isDot
    ? undefined
    : count !== undefined && count > max
    ? `${max}+`
    : count?.toString();

  return (
    <span className={`${baseClass}${isHidden ? ` ${baseClass}--invisible` : ''} ${className}`.trim()}>
      {children}
      <span
        className={[
          `${baseClass}__indicator`,
          `${baseClass}__indicator--${color}`,
          isDot ? `${baseClass}__indicator--dot` : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={displayLabel ? `${displayLabel} notifications` : undefined}
      >
        {!isDot && displayLabel}
      </span>
    </span>
  );
};

export default Badge;
