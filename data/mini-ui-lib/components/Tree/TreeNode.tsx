import React from "react";
import { TreeNodeData } from "./Tree.types";

interface Props {
    node: TreeNodeData;
    onToggle: (id: string) => void;
}

const TreeNode: React.FC<Props> = ({ node, onToggle }) => {
    return (
        <li>
            <span 
                onClick={() => onToggle(node.id)}
                style={{ cursor: "pointer", fontWeight: "bold" }}
            >
                {node.label}
            </span>

            {node.children && node.expanded && (
                <ul>
                    {node.children.map(child => (
                        <TreeNode 
                            key={child.id} 
                            node={child} 
                            onToggle={onToggle}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
};

export default TreeNode;