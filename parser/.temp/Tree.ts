export interface TreeProps {
    data: TreeNodeData[];
}

export interface TreeNodeData {
    id: string;
    label: string;
    children?: TreeNodeData[];

    expanded?: boolean;
}