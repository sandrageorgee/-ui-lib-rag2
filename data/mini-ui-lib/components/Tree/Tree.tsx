import React from "react";
import TreeNode from "./TreeNode";
import { TreeNodeData } from "./Tree.types";

/**
 * Tree component renders hierarchical data recursively.
 */
interface TreeProps {
    data: TreeNodeData[];
}

const Tree: React.FC<TreeProps> = ({ data }) => {
    return (
        <ul>
            {data.map(node => (
                <TreeNode key={node.id} node={node} />
            ))}
        </ul>
    );
};

export default Tree;