/**
 * This interface represents a wrapper component that follows the new design.
 */
export interface IWrapperWithTitle {
    /**
     * Optional CSS class to apply custom styling to the wrapper.
     */
    className?: string;

    /**
     * Optional unique identifier for the wrapper element.
     */
    id?: string;

    /**
     * The title text to display within the wrapper.
     */
    title: string;

    /**
     * The child elements or components to be rendered inside the wrapper.
     */
    children: React.ReactNode;
}
