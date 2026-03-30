export interface TreeNodeData {
    id: string;
    label: string;
    children?: TreeNodeData[];

    // ✅ ADD THIS
    expanded?: boolean;
}