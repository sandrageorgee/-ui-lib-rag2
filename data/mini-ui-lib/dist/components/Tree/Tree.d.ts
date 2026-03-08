import React from "react";
import { TreeNodeData } from "./Tree.types";
/**
 * Tree component renders hierarchical data recursively.
 */
interface TreeProps {
    data: TreeNodeData[];
}
declare const Tree: React.FC<TreeProps>;
export default Tree;
