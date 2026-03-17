import os
import cocoindex
from cocoindex import FlowBuilder

# create builder
flow_builder = FlowBuilder

data_scope = {}

# Stage 1: File ingestion
data_scope["files"] = flow_builder.add_source(
    cocoindex.sources.LocalFile(
        path="./data/mini-ui-lib",
        included_patterns=[
            "*.ts",
            "*.tsx",
            "*.md",
            "*.json"
        ],
        excluded_patterns=[
            ".*",
            "**/node_modules",
            "**/dist",
            "**/.git"
        ]
    )
)

# build the pipeline
flow = flow_builder.build()

# run the pipeline
result = flow.run()

# print ingested files
for row in result["files"]:
    print(row["filename"])