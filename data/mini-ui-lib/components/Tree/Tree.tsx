import React, { useState } from "react";
import TreeNode from "./TreeNode";
import { TreeNodeData } from "./Tree.types";

/**
 * Tree component renders hierarchical data recursively.
 */
interface TreeProps {
    data: TreeNodeData[];
}

const Tree: React.FC<TreeProps> = ({ data }) => {
    const [treedata, setData] = useState<TreeNodeData[]>(data);

    const toggleNode = (id: string) => {
        const updateTree = (nodes: TreeNodeData[]): TreeNodeData[] => {
            return nodes.map(node => {
                if (node.id === id) {
                    return { ...node, expanded: !node.expanded };
                }
                if (node.children) {
                    return {
                        ...node,
                        children: updateTree(node.children),
                    };
                }
                return node;
            });
        };

        setData(prev => updateTree(prev));
    };

    return (
        <ul>
            {treedata.map(node => (
                <TreeNode 
                    key={node.id} 
                    node={node} 
                    onToggle={toggleNode}
                />
            ))}
        </ul>
    );
};

export default Tree;