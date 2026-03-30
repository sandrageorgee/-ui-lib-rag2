import React, { useState } from "react";
import { IDashboardProps } from "./Dashboard.types";
import { Button } from "../Button/Button";
import { Input } from "../Input/Input";

/*
🔥 MAIN COMPONENT (~300 lines with subcomponents)
*/
export const Dashboard: React.FC<IDashboardProps> = ({
    title,
    userName,
    onLogout,
}) => {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");

    const handleSubmit = () => {
        console.log({ name, email });
    };

    return (
        <div className="dashboard">
            <Header title={title} userName={userName} onLogout={onLogout} />

            <StatsSection />

            <ActivitySection />

            <FormSection
                name={name}
                email={email}
                setName={setName}
                setEmail={setEmail}
                onSubmit={handleSubmit}
            />
        </div>
    );
};

/*
========================
HEADER COMPONENT
========================
*/
const Header = ({ title, userName, onLogout }: any) => {
    return (
        <div className="header">
            <h1>{title}</h1>
            <div>
                <span>Welcome, {userName}</span>
                <Button onClick={onLogout}>Logout</Button>
            </div>
        </div>
    );
};

/*
========================
STATS SECTION
========================
*/
const StatsSection = () => {
    return (
        <div className="stats">
            <StatsCard label="Users" value={120} />
            <StatsCard label="Orders" value={80} />
            <StatsCard label="Revenue" value={5000} />
        </div>
    );
};

const StatsCard = ({ label, value }: any) => {
    return (
        <div className="card">
            <h3>{label}</h3>
            <p>{value}</p>
        </div>
    );
};

/*
========================
ACTIVITY SECTION
========================
*/
const ActivitySection = () => {
    return (
        <div className="activity">
            <ActivityItem message="User signed up" time="2 min ago" />
            <ActivityItem message="Order placed" time="10 min ago" />
            <ActivityItem message="Payment received" time="30 min ago" />
        </div>
    );
};

const ActivityItem = ({ message, time }: any) => {
    return (
        <div className="activity-item">
            <span>{message}</span>
            <small>{time}</small>
        </div>
    );
};

/*
========================
FORM SECTION
========================
*/
const FormSection = ({
    name,
    email,
    setName,
    setEmail,
    onSubmit,
}: any) => {
    return (
        <div className="form">
            <h2>Update Info</h2>

            <FormField
                label="Name"
                value={name}
                onChange={(v: string) => setName(v)}
            />

            <FormField
                label="Email"
                value={email}
                onChange={(v: string) => setEmail(v)}
            />

            <Button onClick={onSubmit}>Save</Button>
        </div>
    );
};

const FormField = ({ label, value, onChange }: any) => {
    return (
        <div className="field">
            <label>{label}</label>
            <Input value={value} onChange={onChange} />
        </div>
    );
};