import React from "react";
import { TreeNodeData } from "./Tree.types";

interface Props {
    node: TreeNodeData;
}

const TreeNode: React.FC<Props> = ({ node }) => {
    return (
        <li>
            {node.label}
            {node.children && (
                <ul>
                    {node.children.map(child => (
                        <TreeNode key={child.id} node={child} />
                    ))}
                </ul>
            )}
        </li>
    );
};

export default TreeNode;