import { jsx as _jsx } from "react/jsx-runtime";
import TreeNode from "./TreeNode";
const Tree = ({ data }) => {
    return (_jsx("ul", { children: data.map(node => (_jsx(TreeNode, { node: node }, node.id))) }));
};
export default Tree;
