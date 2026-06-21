
import { ICard } from './icard';
import './card.css';

const baseClass = 'Cui-Card';

const Card: React.FC<ICard> = (props: ICard) => {
  const { children, hasHelperIcon, onClickHelperFunction, helperIcon, style, className = '', ...rest } = props;

  return (
    <div
      className={`${baseClass}__wrapper ${className}`.trim()}
      style={style}
      role="region"
      {...rest}
    >
      {children}
      {hasHelperIcon && (
        <span
          className={`${baseClass}__helperIcon`}
          aria-hidden={false}
          role="Helper-Icon"
          onClick={onClickHelperFunction}
          onMouseOver={e => (e.currentTarget.style.opacity = '0.7')}
          onMouseOut={e => (e.currentTarget.style.opacity = '1')}
        >
          {helperIcon}
        </span>
      )}
    </div>
  );
};

export default Card;
