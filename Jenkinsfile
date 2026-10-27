// CI checks same-repository PRs into dev, and release PRs from dev into main.
// Required unit suites cover both Java APIs, authentication, both UIs and Python.
// Isolated staff integration checks Kafka/reporting plus real browser MFA and Superset SSO.
// CI operations use a unique disposable project through scripts/ci-compose.sh.
// PR validation only: this job does not deploy or leave an application running.
pipeline {
    // The prepared builder has Python, Docker/Compose and the CI toolchain.
    // Never fall back to the controller, which may lack those tools.
    agent { label 'avengers-builder' }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
    }

    // Runtime project/cleanup state is assigned through env in script blocks.
    // Declarative environment defaults would shadow those later assignments.
    // Success/failure notifications use the configured EMAIL_1 through EMAIL_5 recipients.

    stages {
        stage('Validate Pull Request') {
            steps {
                script {
                    env.CI_PROJECT_NAME = ''
                    env.CI_ENV_INITIALIZED = 'false'
                    env.STAFF_ENV_STARTED = 'false'
                    env.CI_SETTINGS_GENERATED = 'false'
                    echo "=========================================="
                    echo "Multibranch Pipeline PR Validation"
                    echo "=========================================="
                    echo "CHANGE_ID: ${env.CHANGE_ID ?: 'Not a PR'}"
                    echo "CHANGE_BRANCH: ${env.CHANGE_BRANCH ?: 'N/A'}"
                    echo "CHANGE_TARGET: ${env.CHANGE_TARGET ?: 'N/A'}"
                    echo "BRANCH_NAME: ${env.BRANCH_NAME}"
                    echo "=========================================="

                    // Declarative Pipeline's default SCM checkout makes the policy script
                    // available here. Reject unsupported jobs before credentials or Docker.
                    def policyStatus = sh(script: 'bash scripts/ci-pr-policy.sh', returnStatus: true)
                    if (policyStatus != 0) {
                        currentBuild.result = 'NOT_BUILT'
                        error('PR is outside the supported CI routes; see the policy message above.')
                    }

                    echo "✅ Valid Pull Request detected: ${env.CHANGE_BRANCH} -> ${env.CHANGE_TARGET}"
                    echo "Proceeding with CI pipeline..."
                }
            }
        }

        stage('Checkout') {
            steps {
                script {
                    echo "Checking out Pull Request code..."
                    checkout scm
                    echo "✓ Pull Request revision checked out"
                    sh 'bash scripts/ci-tests.sh clean'
                    // Clear prior build diagnostics on reused workspaces.
                    sh 'rm -f gitleaks-output.txt services-output.txt sonar-output.txt ci-docker-logs.txt readiness-output.txt staff-build-output.txt staff-integration-output.txt staff-docker-logs.txt'
                }
            }
        }

        stage('Generate Temporary CI Settings') {
            steps {
                // External provider access remains a Jenkins credential; all internal
                // database/auth secrets belong only to this disposable build.
                withCredentials([string(credentialsId: 'FAUXNANCE_KEY', variable: 'FAUXNANCE_PRICING_API_KEY')]) {
                    sh '''#!/usr/bin/env bash
set -euo pipefail
umask 077
python3 - <<'PYENV'
import base64, os, secrets
settings = {
    'DB_URL': 'jdbc:postgresql://postgres:5432/endgame_ci',
    'DB_USERNAME': 'ci_test', 'DB_PASSWORD': secrets.token_hex(24),
    'DB_DRIVER_CLASS_NAME': 'org.postgresql.Driver', 'POSTGRES_DB': 'endgame_ci',
    'JWT_SECRET': secrets.token_hex(32), 'JWT_ISSUER': 'endgame-auth', 'JWT_AUDIENCE': 'endgame-api',
    'AUTH_DB_NAME': 'auth', 'AUTH_DB_USER': 'auth', 'AUTH_DB_PASSWORD': secrets.token_hex(24),
    'MFA_ENCRYPTION_KEY': base64.b64encode(secrets.token_bytes(32)).decode(),
    'SUPERSET_SSO_SECRET': secrets.token_hex(32),
    'EMAIL_FROM': 'Asset Avengers <security@assetavengers.top>',
    'FAUXNANCE_PRICING_API_KEY': os.environ['FAUXNANCE_PRICING_API_KEY'],
}
with open('.env', 'w') as output:
    output.write(chr(10).join(key + '=' + value for key, value in settings.items()) + chr(10))
PYENV
echo 'Temporary CI database, JWT, MFA and SSO settings generated (values hidden).'
'''
                }
                script { env.CI_SETTINGS_GENERATED = 'true' }
            }
        }

        stage('Git Leaks Scan') {
            steps {
                script {
                    echo 'Scanning for secrets with git-leaks...'
                    // Keep collecting test results after a scan failure, but never
                    // report a clean build. Abort/timeout must still stop execution.
                    catchError(buildResult: 'FAILURE', stageResult: 'FAILURE', catchInterruptions: false) {
                        sh 'bash scripts/ci-checks.sh secrets'
                    }
                    // ci-checks.sh streams redacted output through tee and archives
                    // the file later. Never export full logs through env: the next
                    // shell launch can exceed Linux's argument/environment limit.
                }
            }
        }

        stage('Initialize Isolated CI Environment') {
            steps {
                script {
                    env.CI_PROJECT_NAME = sh(
                        script: 'bash scripts/ci-compose.sh new-project',
                        returnStdout: true
                    ).trim()
                    if (!(env.CI_PROJECT_NAME ==~ /endgame-ci-[a-f0-9]{16}/)) {
                        error('Project generation did not return a valid isolated CI name.')
                    }
                    sh 'bash scripts/ci-compose.sh init'
                    // Rejected PRs and failed configuration never arm post-build cleanup.
                    env.CI_ENV_INITIALIZED = 'true'
                }
            }
        }

        stage('Start Database') {
            steps {
                echo 'Starting the temporary trading database...'
                sh 'bash scripts/ci-compose.sh up -d postgres'
                sh 'bash scripts/ci-checks.sh database'
            }
        }
        stage('Build and Start Services') {
            steps {
                echo 'Rebuilding images and starting all services...'
                // tee already publishes the build log; keep bulk output in files.
                sh 'bash scripts/ci-checks.sh services'
            }
        }

        stage('Java Tests and Coverage') {
            steps { sh 'bash scripts/ci-tests.sh java' }
        }
        stage('Authentication and UI Tests') {
            steps {
                sh 'bash scripts/ci-tests.sh auth'
                sh 'bash scripts/ci-tests.sh web'
            }
        }
        stage('Pipeline and CI Guard Tests') {
            steps { sh 'bash scripts/ci-tests.sh python' }
        }

        stage('Build Staff and Reporting Images') {
            steps { sh 'bash scripts/ci-checks.sh staff-build' }
        }
        stage('Staff Integration and Browser Authentication') {
            steps {
                script { env.STAFF_ENV_STARTED = 'true' }
                sh 'bash scripts/ci-checks.sh staff-integration'
            }
        }

        stage('SonarQube Analysis') {
            steps {
                script {
                    withCredentials([string(credentialsId: 'SONAR_TOKEN', variable: 'SONAR_TOKEN')]) {
                        echo 'Running SonarQube analysis...'
                        sh 'bash scripts/ci-checks.sh sonar'
                    }
                }
            }
        }

        stage('Verify Service Readiness') {
            steps {
                echo 'Rechecking readiness (CI only; no deployment)...'
                sh 'bash scripts/ci-checks.sh ready'
            }
        }
    }

    post {
        always {
            script {
                try {
                    if (env.CI_ENV_INITIALIZED == 'true') {
                        sh(script: 'bash scripts/ci-compose.sh logs > ci-docker-logs.txt 2>&1', returnStatus: true)
                        try {
                            if (env.STAFF_ENV_STARTED == 'true') {
                                sh 'bash scripts/ci-checks.sh staff-cleanup'
                            }
                        } finally {
                            sh 'bash scripts/ci-compose.sh cleanup'
                        }
                    } else {
                        echo 'No CI environment initialized; skipping Docker cleanup.'
                    }
                } finally {
                    if (env.CI_SETTINGS_GENERATED == 'true') {
                        sh 'rm -f .env'
                    }
                }
            }
        }
        cleanup {
            junit testResults: '**/target/surefire-reports/TEST-*.xml,**/test-results/junit.xml,**/test-results/browser/junit.xml', allowEmptyResults: true
            archiveArtifacts artifacts: 'gitleaks-output.txt,services-output.txt,sonar-output.txt,ci-docker-logs.txt,readiness-output.txt,staff-build-output.txt,staff-integration-output.txt,staff-docker-logs.txt,internal-frontend/test-results/browser/junit.xml,internal-frontend/test-results/browser/**/*.png,**/target/site/jacoco/**,**/coverage/**', allowEmptyArchive: true
        }
        success {
            echo 'PR checks passed; temporary CI resources cleaned up. No application was deployed.'
            script {
                def recipient = [env.EMAIL_1, env.EMAIL_2, env.EMAIL_3, env.EMAIL_4, env.EMAIL_5]
                    .collect { (it ?: '').trim() }
                    .findAll { it }
                    .unique()
                    .join(',')
                if (!recipient) {
                    echo 'Skipping email: EMAIL_1 through EMAIL_5 are not configured.'
                    return
                }
                // Read files directly from workspace instead of using environment variables
                def gitleaksOutput = 'No git leaks output available'
                def servicesOutput = 'No services output available'

                if (fileExists('gitleaks-output.txt')) {
                    gitleaksOutput = readFile(file: 'gitleaks-output.txt', encoding: 'UTF-8')
                    echo "✓ Loaded gitleaks output from file: ${gitleaksOutput.length()} chars"
                }
                if (fileExists('services-output.txt')) {
                    servicesOutput = readFile(file: 'services-output.txt', encoding: 'UTF-8')
                    echo "✓ Loaded services output from file: ${servicesOutput.length()} chars"
                }

                def hasLeaks = gitleaksOutput.contains('Finding:')
                def leaksWarning = hasLeaks ? '<p style="color: #ff9800; font-weight: bold;">⚠️ SECURITY ALERT: Git leaks were detected! See report below.</p>' : ''

                echo "Sending success notification to configured EMAIL_1 through EMAIL_5 recipients."

                // Send only to configured recipients; do not add automatic recipient providers.
                emailext(
                    subject: (hasLeaks ? "⚠️ " : "✅ ") + "Pipeline SUCCESS - ${env.JOB_NAME} #${env.BUILD_NUMBER}" + (hasLeaks ? " (LEAKS FOUND)" : ""),
                    body: """
                        <h2>Pipeline Execution Summary</h2>
                        <p><strong>Status:</strong> SUCCESS ✅</p>
                        ${leaksWarning}
                        <p><strong>Job:</strong> ${JOB_NAME}</p>
                        <p><strong>Build Number:</strong> ${BUILD_NUMBER}</p>
                        <p><strong>Build URL:</strong> <a href="${BUILD_URL}">${BUILD_URL}</a></p>
                        <p><strong>Repository:</strong> <a href="${env.GIT_REPO_URL}">View on GitHub</a></p>
                        <p><strong>Pull Request:</strong> ${env.CHANGE_ID}</p>
                        <p><strong>Source Branch:</strong> ${env.CHANGE_BRANCH}</p>
                        <p><strong>Target Branch:</strong> ${env.CHANGE_TARGET}</p>
                        <hr>

                        <h3>📦 Services Built</h3>
                        <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; border-left: 4px solid #28a745;">
                ${servicesOutput}
                        </pre>

                        <hr>
                        <h3>\ud83d\udd0d Git Leaks Scan Report</h3>
                        <pre style="background-color: ${hasLeaks ? '#fff3cd' : '#f5f5f5'}; padding: 10px; border-radius: 5px; overflow-x: auto; border-left: 4px solid ${hasLeaks ? '#ff9800' : '#007bff'};">
                ${gitleaksOutput}
                        </pre>

                        <hr>
                        <p><strong>PR checks passed; temporary services cleaned up. No application was deployed.</strong></p>
                    """,
                    mimeType: 'text/html',
                    to: recipient,
                    recipientProviders: []
                )
            }
        }
        failure {
            echo 'Pipeline failed! Check logs for details.'
            script {
                def recipient = [env.EMAIL_1, env.EMAIL_2, env.EMAIL_3, env.EMAIL_4, env.EMAIL_5]
                    .collect { (it ?: '').trim() }
                    .findAll { it }
                    .unique()
                    .join(',')
                if (!recipient) {
                    echo 'Skipping email: EMAIL_1 through EMAIL_5 are not configured.'
                    return
                }
                // Read files directly from workspace instead of using environment variables
                def gitleaksOutput = 'No git leaks output available'
                def servicesOutput = 'No services output available'

                if (fileExists('gitleaks-output.txt')) {
                    gitleaksOutput = readFile(file: 'gitleaks-output.txt', encoding: 'UTF-8')
                }
                if (fileExists('services-output.txt')) {
                    servicesOutput = readFile(file: 'services-output.txt', encoding: 'UTF-8')
                }

                def dockerLogs = env.CI_ENV_INITIALIZED == 'true' && fileExists('ci-docker-logs.txt')
                    ? readFile('ci-docker-logs.txt').trim()
                    : 'No Docker environment initialized; no container logs available'

                echo "Sending failure notification to configured EMAIL_1 through EMAIL_5 recipients."

                // Send only to configured recipients; do not add automatic recipient providers.
                emailext(
                    subject: "❌ Pipeline FAILED - ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                    body: """
                        <h2>Pipeline Execution Summary</h2>
                        <p><strong>Status:</strong> FAILED ❌</p>
                        <p><strong>Job:</strong> ${JOB_NAME}</p>
                        <p><strong>Build Number:</strong> ${BUILD_NUMBER}</p>
                        <p><strong>Build URL:</strong> <a href="${BUILD_URL}">${BUILD_URL}</a></p>
                        <p><strong>Repository:</strong> <a href="${env.GIT_REPO_URL}">View on GitHub</a></p>
                        <p><strong>Pull Request:</strong> ${env.CHANGE_ID}</p>
                        <p><strong>Source Branch:</strong> ${env.CHANGE_BRANCH}</p>
                        <p><strong>Target Branch:</strong> ${env.CHANGE_TARGET}</p>
                        <hr>

                        <h3>📦 Services Status</h3>
                        <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; border-left: 4px solid #ffc107;">
                ${servicesOutput}
                        </pre>

                        <hr>
                        <h3>\ud83d\udd0d Git Leaks Scan Report</h3>
                        <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; border-left: 4px solid #007bff;">
                ${gitleaksOutput}
                        </pre>

                        <hr>
                        <h3>\u26a0\ufe0f Error Logs (Docker Compose)</h3>
                        <pre style="background-color: #ffe6e6; padding: 10px; border-radius: 5px; overflow-x: auto; border-left: 4px solid #dc3545;">
                ${dockerLogs}
                        </pre>

                        <hr>
                        <h3>What to do:</h3>
                        <ol>
                            <li>Check the error logs above for the root cause</li>
                            <li>Review the <a href="${BUILD_URL}console">full Jenkins console</a> for more details</li>
                            <li>Fix the issue and push again</li>
                        </ol>
                    """,
                    mimeType: 'text/html',
                    to: recipient,
                    recipientProviders: []
                )
            }
        }
    }
}
