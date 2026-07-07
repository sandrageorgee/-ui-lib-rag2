import React from 'react';
import { IWrapperWithTitle } from './iwrapperwithtitle';
import './wrapperwithtitle.css'

const WrapperWithTitle: React.FC<IWrapperWithTitle> = (props: IWrapperWithTitle) => {
  const { className, id = "Cui_Wrapper", children, title } = props
  const baseClass = "Cui__WrapperWithTitle"

  return (
    <div className={`${baseClass} ${className}`} id={id}>
      <div className={`${baseClass}__title ${className}__title`} id={`${id}__title`}>
        <p>{title}</p>
      </div>
      <div className={`${baseClass}__Wrapper ${className}__Wrapper`} id={`${id}__Wrapper`}>
        {children}
      </div>
    </div>
  )
}

export default WrapperWithTitle