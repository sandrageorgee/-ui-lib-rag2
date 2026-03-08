import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const TreeNode = ({ node }) => {
    return (_jsxs("li", { children: [node.label, node.children && (_jsx("ul", { children: node.children.map(child => (_jsx(TreeNode, { node: child }, child.id))) }))] }));
};
export default TreeNode;
