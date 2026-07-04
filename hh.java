#!groovy

/* *********************************************************
 * This software and related documentation are proprietary
 * and confidential to Siemens.
 * Copyright 2025 Siemens.
 ********************************************************** */

import jenkins.*
import jenkins.model.*
import hudson.*
import hudson.model.*
import groovy.json.JsonOutput
import groovy.json.StringEscapeUtils

@NonCPS
def extractPaths(String jsonText) {
    def parsed = new groovy.json.JsonSlurper().parseText(jsonText)
    return parsed.values.collect { it.path.toString }
}

@NonCPS
def extractExportedInterfaces(String file) {

    def exportRegex = ~/export\s*\{([^}]*)\}/
    def exported = []
    
    file.findAll(exportRegex) { fullMatch, insideBraces ->
        insideBraces.split(",").each { item ->
            def cleaned = item.trim()
            if (cleaned) {
                exported << cleaned
            }
        }
    }
    println "Exported items: ${exported}"
    return exported
}

@NonCPS
def extractCommits(String jsonText) {
    def parsed = new groovy.json.JsonSlurper().parseText(jsonText)
    return parsed.values.collect { it.message }
}


pipeline {
    agent {
        label 'LINUX'
    }
    //  environment {
    //         pullRequestID = 609
    //         pullRequestBranch = "feature/UI-513"
    // }

    triggers {
        GenericTrigger(
            genericVariables: [
                [key: 'pullRequestUrl', value: '$.pullRequest.links.self[0].href'],
                [key: 'pullRequestID', value: '$.pullRequest.id'],
                [key: 'pullRequestVersion', value: '$.pullRequest.version', defaultValue: '0'],
                [key: 'pullRequestReviewers', value: '$.pullRequest.reviewers'],
                [key: 'pullRequestDescription', value: '$.pullRequest.description', defaultValue: ''],
                [key: 'pullRequestBranch', value: '$.pullRequest.fromRef.displayId'],
            ],
            // causeString: '$name committed on $branchname',
            printContributedVariables: true,
            printPostContent: true,
            token: 'R2Q=QAlNPcmo/9e2p5vb3HBCVlh3VMrYfymKk=T=UCb5eG2/EO/=s-=mQYZzfjRy'
        )
    }

stages{
    stage('Ensure API is Reachable') {
            steps {
                script {
                    echo("${env.pullRequestID}")
                    def response = sh(
                        script: '''
                            curl -s -w "\\nSTATUS_CODE:%{http_code}" -H "accept: application/json" http://egc-hav-utopia:54342/health
                        ''',
                        returnStdout: true
                    ).trim()
    
                    def parts = response.split('STATUS_CODE:')
                    def body = parts[0].trim()
                    def status = parts[1].trim()
    
                    echo "HTTP Status: ${status}"
                    echo " Response Body:\n${body}"
                    // fail the build if the status is not 200
                    if (status != "200") {
                        error("HTTP request failed with status ${status}")
                    }
                   
                }
            }
        }
    stage('Extracting Pull Request Data') {
            steps {
                script {
                    def pullRequestPatch= null
                    withCredentials([usernamePassword(credentialsId: 'MEDBITBUCKET_STATUS_PAT', usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD')]) {
                            pullRequestPatch = sh(
                                script: """
                                    curl -u "$USERNAME:$PASSWORD" https://iesproxy.ies.mentorg.com/medbitbucket/rest/api/1.0/projects/GHRNAM/repos/common-ui/pull-requests/${env.pullRequestID}.patch
                                """,
                                returnStdout: true
                            ).trim()
                        } 
                    echo ("PullRequestPatch is now ${pullRequestPatch}")
                    def payload = JsonOutput.toJson([
                        pullRequestID   : env.pullRequestID,
                        repositoryName  : "common-ui",
                        pullRequestPatch: pullRequestPatch
                    ])
                    
                    writeFile file: 'payload.json', text: payload
                    
                    sh """
                        curl -X POST 'http://egc-hav-utopia:54342/ExtractDiffs' \\
                          -H 'accept: application/json' \\
                          -H 'Content-Type: application/json' \\
                          --data-binary @payload.json
                    """
                    withCredentials([usernamePassword(credentialsId: 'MEDBITBUCKET_STATUS_PAT', usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD')]) {
                        sh """
                            curl -u "$USERNAME:$PASSWORD" \
                            https://iesproxy.ies.mentorg.com/medbitbucket/rest/api/latest/projects/GHRNAM/repos/common-ui/pull-requests/${env.pullRequestID}/changes?limit=1000 \
                            -o changed_files.json
                        """
                          
    
                          stash name: 'changed-files', includes: 'changed_files.json'
                          
                    } 
                }
            }
        }
    stage('Checking for Breaking Changes') {
                steps {
                    script {
                        checkout scmGit(
                        branches: [[name: env.pullRequestBranch]],
                        userRemoteConfigs: [[
                                    url: 'ssh://git@iesproxy.ies.mentorg.com:7999/ghrnam/common-ui.git',
                                    credentialsId: 'JENKINS_SSH'
                    ]],
                        extensions: [
                            [$class: 'CloneOption',
                                shallow: true,
                                timeout: 5
                            ],
    
                            [$class: 'CleanBeforeCheckout'],
    
                            [$class: 'CleanCheckout'],
    
                            [$class: 'LocalBranch',
    
                                localBranch: "**"
    
                            ]
    
                        ]
    
                    )
                    
                        def common_ui_index = sh(
                                script: "git show HEAD:packages/common-ui/src/index.ts",
                                returnStdout: true
                                ).trim()
                        def common_ui_exported_interfaces = extractExportedInterfaces(common_ui_index)
                        
                        def common_ui_templates_index = sh(
                                script: "git show HEAD:packages/common-ui-templates/src/index.ts",
                                returnStdout: true
                                ).trim()
                        def common_ui_templates_interfaces = extractExportedInterfaces(common_ui_templates_index)
                        def all_exported_interfaces = common_ui_exported_interfaces + common_ui_templates_interfaces
                        def exportedMap = all_exported_interfaces.collectEntries { [(it): true] }
                       
                       

                        unstash 'changed-files'
                        def changedFilesStr = readFile('changed_files.json').trim()
                        def changedFiles = extractPaths(changedFilesStr)
                        echo("ChangesFiles ${changedFiles}")
                        changedFiles.each{ file ->
                            def fileExistsStatus = sh(
                                script: "git cat-file -e HEAD:${file}",
                                returnStatus: true,
                                quiet: true
                            )
                          if (file.endsWith(".ts") && file.split("/").contains("packages" && fileExistsStatus == 0)){
                              def fileContent = sh(
                                script: "git show HEAD:${file}",
                                returnStdout: true
                                ).trim()
                              echo("File is: ${file}")
                              echo("File Content is ${fileContent}")
                              def jsonPayload = JsonOutput.toJson([code: fileContent, filePath: file, exportedInterfaces: exportedMap, pullRequestID: env.pullRequestID, repoName: "common-ui" ])
                                 echo("payload  is ${jsonPayload}")
                              writeFile file: 'payload.json', text: jsonPayload
                            def BreakingChangeResponse = sh(
                                script: """
                                    curl -X POST 'http://egc-hav-utopia:54342/Check_For_BreakingChange' \\
                                         -H 'accept: application/json' \\
                                         -H 'Content-Type: application/json' \\
                                         --data @payload.json
                                """,
                                returnStdout: true
                            )
                            echo("BREAKING CHANGE:\n ${BreakingChangeResponse}")
                            def BreakingChangeObj = readJSON text: BreakingChangeResponse
                            if(BreakingChangeObj.isEmpty()){
                                env.BREAKING_CHANGES = "### 🎉  No Breaking Changes Found\n\n"
                            }
                            else{
                                env.BREAKING_CHANGES = "### 🚨 Breaking Changes Detected\n\n" + 
                                BreakingChangeObj.collect { change ->
                                def changeTypeEmoji = change.changeType == 'ADDED' ? '➕' : '➖'
                                def changeLabel = "${changeTypeEmoji} "
                                    """|#### 🧱 File: `${change.filePath}`
                                      |- **Prop:** `${change.propName}` ${changeLabel}
                                      |- **Reason:** ${change.reason}
                                    """.stripMargin()
                                }.join("\n---\n\n") 
                            }
                          
                          }
                        }
                        if(env.BREAKING_CHANGES == null){
                            env.BREAKING_CHANGES = "### 🎉  No Breaking Changes Found\n\n"
                        }
                        echo "Markdown Output:\n${env.BREAKING_CHANGES}"         
                    }
                }
            }
    stage('Checking Semantic Versioning'){
        steps{
            script{
                unstash 'changed-files'
                def changedFilesStr = readFile('changed_files.json').trim()
                def changedFiles = extractPaths(changedFilesStr)
                echo("Changed files JSON string stored in env: ${changedFiles}")
                def commitsMessagesStrObject = null
                withCredentials([usernamePassword(credentialsId: 'MEDBITBUCKET_STATUS_PAT', usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD')]) {
                    commitsMessagesStrObject = sh(
                            script: """curl -u "$USERNAME:$PASSWORD" https://iesproxy.ies.mentorg.com/medbitbucket/rest/api/latest/projects/GHRNAM/repos/common-ui/pull-requests/${env.pullRequestID}/commits""",
                            returnStdout: true
                        ).trim()
                } 
                echo("Commts is ${commitsMessagesStrObject}")
    
                def commits = extractCommits(commitsMessagesStrObject)
                echo("Changed files: ${commits}")
                
                def payload = JsonOutput.toJson([
                    files: changedFiles,
                    commits: commits
                ])
                
                echo "Sending payload:\n${JsonOutput.prettyPrint(payload)}"
                
              def VersionResponse = sh(
                    script: """
                        curl -X POST 'http://egc-hav-utopia:54342/checkchangedPackages' \
                        -H 'accept: application/json' \
                        -H 'Content-Type: application/json' \
                        -d '${payload}'
                    """,
                    returnStdout: true
                ).trim()
                
                echo "Response: ${VersionResponse}"
                def parsed = readJSON text: VersionResponse
                def changedPackages = parsed.changed_packages ?: []
                def versionBumps = parsed.version_bumps ?: [:]
                echo("versionBumps is ${versionBumps}")
                def description = "## 🔍 Semantic Versioning Check\n\n"
                description += "| 📦 **Changed Packages** | 📈 **Version Bumps** |\n"
                description += "|-------------------------|----------------------|\n"
                
                // Get the max rows needed for either side
                def changedSize = changedPackages.size()
                def bumpSize = versionBumps.size()
                def maxRows = changedSize > bumpSize ? changedSize : bumpSize
                
                (0..<maxRows).each { i ->
                    def left = i < changedPackages.size() ? "🛠️ `${changedPackages[i]}`" : ""
                
                    def bumpEntry = ""
                    if (i < versionBumps.size()) {
                        def pkg = changedPackages[i]
                        def bump = versionBumps[pkg]
                        def bumpEmoji = bump == "major" ? "🚨" : (bump == "minor" ? "✨" : "🩹")
                        bumpEntry = "${bumpEmoji} `${pkg}` → **${bump}**"
                    }
                
                    description += "| ${left.padRight(24)} | ${bumpEntry} |\n"
                }
                // Escape for env variable
                def escapedDescription = description.replace('"', '\\"').replace('\n', '\\n')
                env.semanticVersion = escapedDescription.replace("\\n", "\n")
                
                echo("semanticVersion ${env.semanticVersion}")

            }
        }
       
    }
    stage('Analyzing Common-UI Usage in Templates') {
        steps {
            script {
                unstash 'changed-files'
                def changedFilesStr = readFile('changed_files.json').trim()
                def changedFiles = extractPaths(changedFilesStr)
                echo("Changed files JSON string stored in env: ${changedFiles}")
                
                def importsRaw = sh(
                    script: '''
                        find packages/common-ui-templates/src/components -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \\) \
                        -exec grep -H "^import " {} \\;
                    ''',
                    returnStdout: true
                ).trim()
                
                def templatesImports = importsRaw.split('\n')  

                 def payload = JsonOutput.toJson([
                    imports: templatesImports,
                    changedFiles: changedFiles,
                    packageToCheck: "common-ui"
                ])
                
                def commonui_usage = sh(
                    script: """
                        curl -X POST 'http://egc-hav-utopia:54342/checkPackageUsage' \
                        -H 'accept: application/json' \
                        -H 'Content-Type: application/json' \
                        -d '${payload}'
                    """,
                    returnStdout: true
                ).trim()
                
                def commonui_usageJsonObj = readJSON text: commonui_usage
                def generateCommonUIUsageMDString = { responseList ->
                    def md = new StringBuilder()
                    if (responseList == null || responseList.isEmpty()) {
                        md.append("### ✅ Checking Common-ui usage in templates\n\n")
                        md.append(
                                """No components from **`@siemens-disw-hav/common-ui`** were detected as changed and used in templates. You’re good to go! 🎉""")
                        md.append("\n\n")
                        
                    }
                    else{
                        md.append("### 🤔 Checking Common-ui usage in templates\n\n")
                        md.append("Our analysis has detected changes in the following component(s) from @siemens-disw-hav/common-ui, which are referenced in common-ui-templates package:\n\n")
                        md.append("| Component | Used In Template File |\n")
                        md.append("|-----------|------------------------|\n")
                        
                        responseList.each { item ->
                            def usedInFormatted = item.usedIn.collect { "`$it`" }.join(" , ")
                            item.usedIn.each{ file -> 
                                md.append("| `${item.component}` | ${file} |\n")
                                
                            }
                        }
                        
                        md.append("\n> ⚠️ Please ensure the above templates are tested thoroughly after changes to these components.\n\n")
                        md.append("\n\n")
                       
                    }

                    
                    return md.toString()
                }
                env.CommonUIUsageInTemplates = generateCommonUIUsageMDString(commonui_usageJsonObj.response)
                echo("CommonUIUsageInTemplates is:  ${CommonUIUsageInTemplates}")
            
            }
        }
    }
    stage('Analyzing Common-UI-Icons Usage') {
        steps {
            script {
         
                unstash 'changed-files'
                def changedFilesStr = readFile('changed_files.json').trim()
                def changedFiles = extractPaths(changedFilesStr)
                echo("Changed files JSON string stored in env: ${changedFiles}")
                
                def importsRaw = sh(
                    script: '''
                        find packages/common-ui-templates/src/components packages/common-ui/src/components \
                        -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \\) \
                        -exec grep -H "^import " {} \\;
                    ''',
                    returnStdout: true
                ).trim()
                
                def Imports = importsRaw.split('\n')  

                 def payload = JsonOutput.toJson([
                    imports: Imports,
                    changedFiles: changedFiles,
                    packageToCheck:"common-ui-icons"
                ])
                
                echo("123payload is ${payload}")
                
                // Write payload to a temporary file
                writeFile file: 'payload.json', text: payload

                def commonUIICons_usage = sh(
                    script: """
                        curl -X POST 'http://egc-hav-utopia:54342/checkPackageUsage' \
                        -H 'accept: application/json' \
                        -H 'Content-Type: application/json' \
                        --data @payload.json
                    """,
                    returnStdout: true
                ).trim()

                
                def commonUIIcons_usageJsonObj = readJSON text: commonUIICons_usage
                def generateCommonUIUsageMDString = { responseList ->
                    def md = new StringBuilder()
                    if (responseList == null || responseList.isEmpty()) {
                        md.append("### ✅ Checking Common-Ui-Icons usage in packages\n\n")
                        md.append(
                                """No components from **`@siemens-disw-hav/common-ui-icons`** were detected as changed and used in templates or common-ui. You’re good to go! 🎉""")
                        md.append("\n\n")
                        
                    }
                    else{
                        md.append("### 🤔 Checking Common-ui-icons usage\n\n")
                        md.append("Our analysis has detected changes in the following component(s) from @siemens-disw-hav/common-ui-icons, which are referenced in common-ui-templates/common-ui package:\n\n")
                        md.append("| Component | Used In Template File |\n")
                        md.append("|-----------|------------------------|\n")
                        
                        responseList.each { item ->
                            def usedInFormatted = item.usedIn.collect { "`$it`" }.join(" , ")
                            item.usedIn.each{ file -> 
                                md.append("| `${item.component}` | ${file} |\n")
                                
                            }
                        }
                        
                        md.append("\n> ⚠️ Please ensure the above icons are tested thoroughly after changes to these components.\n\n")
                        md.append("\n\n")
                       
                    }

                    return md.toString()
                }
                env.CommonUIIconsUsageInTemplates = generateCommonUIUsageMDString(commonUIIcons_usageJsonObj.response)
                echo("common-ui-icons usage is:  ${CommonUIIconsUsageInTemplates}")
            
            }
        }
    }
    stage('Analyzing Code and sending comments'){
        steps{
            script{
                unstash 'changed-files'
                def changedFilesStr = readFile('changed_files.json').trim()
                def changedFiles = extractPaths(changedFilesStr)
                echo("Changed files JSON string stored in env: ${changedFiles}")
                
                changedFiles.each { file ->
                    echo("Processing file: ${file}")
                    if (!(file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.json'))) {
                        echo("Skipping non-.ts/.tsx/.json file: ${file}")
                        return
                    }
                    
                    def fileContent = null
                    // this is a check, as the changed file may be deleted
                    def fileExistsStatus = sh(
                        script: "git cat-file -e HEAD:${file}",
                        returnStatus: true,
                        quiet: true
                    )
                
                    if (fileExistsStatus == 0) {
                        
                        try {
                            fileContent = sh(
                                script: "git show HEAD:${file}",
                                returnStdout: true
                            ).trim()
                            echo("Content of '${file}':")
                            echo("${fileContent}") 
 
                        } catch (Exception e) {
                            echo("Error retrieving content for '${file}': ${e.message}")
                            fileContent = null // Ensure it's null if content retrieval failed
                        }
                    } else {
                        echo("File '${file}' not found in HEAD or is not a regular file (blob). Skipping content retrieval.")
                        fileContent = null 
                    }
                
                   
                    if (fileContent != null) {
                      echo("File content is now: ${fileContent}")
                        def jsonPayload = JsonOutput.toJson([code: fileContent, filePath: file, pullRequestID:env.pullRequestID , repositoryName:"common-ui" ])
                        echo("JsonPayload is now:\n ${jsonPayload} ")
                        writeFile file: 'payload.json', text: jsonPayload
                        echo("We have written inside payload.json")
                        def response = sh(
                            script: """
                                curl -X POST \
                                http://egc-hav-utopia:54342/review \
                                -H "Content-Type: application/json" \
                                --data-binary @payload.json
                            """, 
                            returnStdout: true).trim()
                        def responseObj = readJSON text: response
                        echo(" Response for ${file} is now:\n ${responseObj} ")
                        echo("Summary is now: ${responseObj.summary}")
                        def generateMarkdownCommentFromResponse = { responseOBJ ->
                            def md = new StringBuilder()
                            md.append(responseOBJ.summary)
                            md.append("\n#### Code Changes\n")
                            responseOBJ["changes"].each { change ->
                                md.append("- ${change}\n")
                            }
                            md.append ("\n#### Issues\n")
                             responseOBJ["critical_issues"].each { change ->
                                md.append("- ${change}\n")
                            }
                            
                            return md
                        }
                        def fileComment = generateMarkdownCommentFromResponse(responseObj)
                        echo("FileComment is now  ${fileComment}")
                        def commentPayload = groovy.json.JsonOutput.toJson([
                            text : fileComment,
                            anchor : [
                                diffType: "EFFECTIVE",
                                path    : file,
                                srcPath : file
                            ]
                        ])

                        
                        echo("Comment PAyload is now ${commentPayload}")
                        def commentPostResponse = null
                        withCredentials([usernamePassword(credentialsId: 'MEDBITBUCKET_STATUS_PAT', usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD')]) {
                            commentPostResponse = sh(
                                script: """
                                    curl --request POST \\
                                        -u "$USERNAME:$PASSWORD" \\
                                        --url 'https://iesproxy.ies.mentorg.com/medbitbucket/rest/api/latest/projects/GHRNAM/repos/common-ui/pull-requests/${env.pullRequestID}/comments' \\
                                        --header 'Accept: application/json;charset=UTF-8' \\
                                        --header 'Content-Type: application/json' \\
                                        --data '${commentPayload.replace("'", "'\\''")}'
                                """,
                                returnStdout: true
                            ).trim()
                        } 
                       
                            
                            echo("Comment response is now : ${commentPostResponse}")
                    } else {
                        // Handle cases where the file was not found or content could not be retrieved
                        echo("No content to process for '${file}'.")
                    }
                }
            }
        }
    }
    stage("Finalizing and updating pull request description"){
        steps{
            script{
                echo("SemanticVersion is ${env.semanticVersion}")
                def finalDescription = env.pullRequestDescription +"\n----\n" + env.semanticVersion + "----\n" + env.BREAKING_CHANGES + "----\n" + env.CommonUIUsageInTemplates + "----\n" + env.CommonUIIconsUsageInTemplates + "----\n"
                def jsonBody = JsonOutput.toJson([
                    description: finalDescription,
                    reviewers: readJSON(text: env.pullRequestReviewers ?: '[]'),
                    version: env.pullRequestVersion
                    ])


                writeFile file: 'payload.json', text: jsonBody
                withCredentials([usernamePassword(credentialsId: 'MEDBITBUCKET_STATUS_PAT', usernameVariable: 'USERNAME', passwordVariable: 'PASSWORD')]) {
                    sh """
                        curl --request PUT \
                             -u "$USERNAME:$PASSWORD" \
                             --url 'https://iesproxy.ies.mentorg.com/medbitbucket/rest/api/latest/projects/GHRNAM/repos/common-ui/pull-requests/${env.pullRequestID}' \
                             --header 'Accept: application/json;charset=UTF-8' \
                             --header 'Content-Type: application/json' \
                             --data @payload.json
                    """
                    } 
                
            }
        }
    }
}
    post {

        always {
            echo "Post-build actions executed."
        }
    }
}
