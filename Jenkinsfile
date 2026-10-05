pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
    }

    triggers {
        pollSCM('H H/8 * * *')
    }

    stages {
        stage('Checkout') {
            steps {
                script {
                    echo 'Checking out code from dev branch...'
                    checkout(
                        scm: [
                            $class: 'GitSCM',
                            branches: [[name: '*/dev']],
                            userRemoteConfigs: [[url: env.GIT_REPO_URL]]
                        ]
                    )
                }
            }
        }

        stage('Git Leaks Scan') {
            steps {
                script {
                    echo 'Scanning for secrets with git-leaks...'
                    sh '''
                        docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source /repo --verbose --redact > gitleaks-report.txt 2>&1 || true
                        echo "Git Leaks scan completed. Report saved."
                    '''
                }
            }
        }

        stage('Docker Compose Down') {
            steps {
                script {
                    withCredentials([
                        string(credentialsId: 'DB_URL', variable: 'DB_URL'),
                        string(credentialsId: 'DB_USERNAME', variable: 'DB_USERNAME'),
                        string(credentialsId: 'DB_PASSWORD', variable: 'DB_PASSWORD'),
                        string(credentialsId: 'POSTGRES_DB', variable: 'POSTGRES_DB')
                    ]) {
                        echo 'Stopping and removing containers...'
                        sh 'docker-compose down || true'
                    }
                }
            }
        }

        stage('Start Database') {
            steps {
                script {
                    withCredentials([
                        string(credentialsId: 'DB_URL', variable: 'DB_URL'),
                        string(credentialsId: 'DB_USERNAME', variable: 'DB_USERNAME'),
                        string(credentialsId: 'DB_PASSWORD', variable: 'DB_PASSWORD'),
                        string(credentialsId: 'POSTGRES_DB', variable: 'POSTGRES_DB')
                    ]) {
                        echo 'Starting database...'
                        sh 'docker-compose up -d postgres'
                        sh 'sleep 10' // Wait for database to start
                    }
                }
            }
        }

        stage('Build and Start Services') {
            steps {
                script {
                    withCredentials([
                        string(credentialsId: 'DB_URL', variable: 'DB_URL'),
                        string(credentialsId: 'DB_USERNAME', variable: 'DB_USERNAME'),
                        string(credentialsId: 'DB_PASSWORD', variable: 'DB_PASSWORD'),
                        string(credentialsId: 'POSTGRES_DB', variable: 'POSTGRES_DB')
                    ]) {
                        echo 'Rebuilding images and starting all services...'
                        sh 'docker-compose up -d --build'
                        sh 'sleep 10' // Wait for services to start
                    }
                }
            }
        }

        stage('Prepare Java for SonarQube') {
            steps {
                script {
                    echo 'Compiling backend for SonarQube analysis...'
                    sh '''
                        docker run --rm \
                          -u "$(id -u):$(id -g)" \
                          -v "$WORKSPACE:/workspace" \
                          -w /workspace/backend \
                          maven:3.9-eclipse-temurin-25 \
                          mvn -B -Dmaven.repo.local=/tmp/maven-repository \
                          -DskipTests package dependency:copy-dependencies \
                          -DoutputDirectory=target/dependency
                    '''
                }
            }
        }

        stage('SonarQube Analysis') {
            steps {
                script {
                    withCredentials([string(credentialsId: 'SONAR_TOKEN', variable: 'SONAR_TOKEN')]) {
                        echo 'Running SonarQube analysis...'
                        sh '''
                            docker run --rm \
                                --network host \
                                -v $(pwd):/usr/src \
                                -e SONAR_HOST_URL=http://localhost:8089 \
                                -e SONAR_LOGIN=${SONAR_TOKEN} \
                                sonarsource/sonar-scanner-cli:latest \
                                -Dsonar.projectKey=asset-avengers \
                                -Dsonar.projectName="Asset Avengers" \
                                -Dsonar.sources=. \
                                -Dsonar.exclusions="**/node_modules/**,**/target/**,**/dist/**" \
                                -Dsonar.java.binaries=backend/target/classes \
                                -Dsonar.java.libraries='backend/target/dependency/*.jar' \
                                -Dsonar.login=${SONAR_TOKEN} || true
                        '''
                    }
                }
            }
        }

        stage('Verification') {
            steps {
                script {
                    withCredentials([
                        string(credentialsId: 'DB_URL', variable: 'DB_URL'),
                        string(credentialsId: 'DB_USERNAME', variable: 'DB_USERNAME'),
                        string(credentialsId: 'DB_PASSWORD', variable: 'DB_PASSWORD'),
                        string(credentialsId: 'POSTGRES_DB', variable: 'POSTGRES_DB')
                    ]) {
                        echo 'Verifying services are running...'
                        sh 'docker-compose ps'
                    }
                }
            }
        }
    }

    post {
        always {
            script {
                echo 'Cleaning up workspace...'
                cleanWs()
            }
        }
        success {
            echo 'Pipeline succeeded! Services are running.'
            script {
                def gitleaksReport = readFile(file: 'gitleaks-report.txt', encoding: 'UTF-8').replace('\n', '<br/>')
                emailext(
                    subject: "✅ Jenkins Pipeline SUCCESS - ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                    body: """
                        <h3>Pipeline Execution Summary</h3>
                        <p><strong>Status:</strong> SUCCESS ✅</p>
                        <p><strong>Job:</strong> ${JOB_NAME}</p>
                        <p><strong>Build Number:</strong> ${BUILD_NUMBER}</p>
                        <p><strong>Build URL:</strong> <a href="${BUILD_URL}">${BUILD_URL}</a></p>
                        <hr>
                        <p><strong>Stages Completed:</strong></p>
                        <ul>
                            <li>✅ Checkout</li>
                            <li>✅ Git Leaks Scan</li>
                            <li>✅ Docker Compose Down</li>
                            <li>✅ Start Database</li>
                            <li>✅ Build and Start Services</li>
                            <li>✅ SonarQube Analysis</li>
                            <li>✅ Verification</li>
                        </ul>
                        <hr>
                        <h4>🔍 Git Leaks Scan Report</h4>
                        <pre style="background-color: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto;">
${gitleaksReport}
                        </pre>
                        <p>All services are running successfully!</p>
                    """,
                    mimeType: 'text/html',
                    to: '${env.JENKINS_EMAIL}'
                )
            }
        }
        failure {
            echo 'Pipeline failed! Check logs for details.'
            sh 'docker-compose logs || true'
            script {
                def gitleaksReport = readFile(file: 'gitleaks-report.txt', encoding: 'UTF-8').replace('\n', '<br/>')
                emailext(
                    subject: "❌ Jenkins Pipeline FAILED - ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                    body: """
                        <h3>Pipeline Execution Summary</h3>
                        <p><strong>Status:</strong> FAILED ❌</p>
                        <p><strong>Job:</strong> ${JOB_NAME}</p>
                        <p><strong>Build Number:</strong> ${BUILD_NUMBER}</p>
                        <p><strong>Build URL:</strong> <a href="${BUILD_URL}">${BUILD_URL}</a></p>
                        <hr>
                        <h4>🔍 Git Leaks Scan Report</h4>
                        <pre style="background-color: #f4f4f4; padding: 10px; border-radius: 5px; overflow-x: auto;">
${gitleaksReport}
                        </pre>
                        <hr>
                        <p><strong>What to do:</strong></p>
                        <ol>
                            <li>Check the full Jenkins console output</li>
                            <li>Review the logs above for errors</li>
                            <li>Fix the issue and push again</li>
                        </ol>
                        <p><a href="${BUILD_URL}console">View Full Console Output</a></p>
                    """,
                    mimeType: 'text/html',
                    to: '${env.JENKINS_EMAIL}'
                )
            }
        }
    }
}
