import { generateRawSchema } from "./stage4_schema.js";
const schema = generateRawSchema(
    "../mini-commonui/packages/common-ui/src/components/notificationcenter/notificationcenter.tsx",
    "../mini-commonui/tsconfig.json"
);
console.log("Has definitions:", !!schema.definitions);
console.log("Definition keys:", JSON.stringify(Object.keys(schema.definitions || {})));
