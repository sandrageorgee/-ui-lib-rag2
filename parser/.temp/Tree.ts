export interface TreeProps {
    data: TreeNodeData[];
}

export interface TreeNodeData {
    id: string;
    label: string;
    children?: TreeNodeData[];

    // ✅ ADD THIS
    expanded?: boolean;
}