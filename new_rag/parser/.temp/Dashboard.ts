export interface IDashboardProps {
    title: string;
    userName: string;
    onLogout: () => void;
}

export interface IStatsCardProps {
    label: string;
    value: number;
}

export interface IActivityItemProps {
    message: string;
    time: string;
}

export interface IFormSectionProps {
    onSubmit: (data: any) => void;
}