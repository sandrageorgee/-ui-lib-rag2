import React from "react";

import { ButtonProps } from "./Button.types";



/**

* Button component supporting multiple variants.

* Used for triggering actions inside the UI library.

*/

const Button: React.FC<ButtonProps> = (props) => {

    console.log(props)

    return (

        <button

            className={`btn btn-${props.variant}`}

            disabled={props.disabled}

            onClick={props.onClick}

        >

            {props.label}

        </button>

    );

};



export default Button;