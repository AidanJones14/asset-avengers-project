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
                        docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source /repo --verbose --redact || true
                        echo "✓ Git Leaks scan completed"
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
        success {
            echo 'Pipeline succeeded! Services are running.'
            emailext(
                subject: "✅ Pipeline SUCCESS - ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: """
                    <h3>Pipeline Execution Summary</h3>
                    <p><strong>Status:</strong> SUCCESS ✅</p>
                    <p><strong>Job:</strong> ${JOB_NAME}</p>
                    <p><strong>Build Number:</strong> ${BUILD_NUMBER}</p>
                    <p><strong>Build URL:</strong> <a href="${BUILD_URL}">${BUILD_URL}</a></p>
                    <hr>
                    <p><strong>Repository:</strong> <a href="${env.GIT_REPO_URL}">View on GitHub</a></p>
                    <p><strong>Branch:</strong> dev</p>
                    <hr>
                    <p>All services running successfully!</p>
                """,
                mimeType: 'text/html',
                to: env.JENKINS_EMAIL
            )
        }
        failure {
            echo 'Pipeline failed! Check logs for details.'
            sh 'docker-compose logs || true'
            emailext(
                subject: "❌ Pipeline FAILED - ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                body: """
                    <h3>Pipeline Execution Summary</h3>
                    <p><strong>Status:</strong> FAILED ❌</p>
                    <p><strong>Job:</strong> ${JOB_NAME}</p>
                    <p><strong>Build Number:</strong> ${BUILD_NUMBER}</p>
                    <p><strong>Build URL:</strong> <a href="${BUILD_URL}">${BUILD_URL}</a></p>
                    <hr>
                    <p><strong>Repository:</strong> <a href="${env.GIT_REPO_URL}">View on GitHub</a></p>
                    <p><strong>Branch:</strong> dev</p>
                    <hr>
                    <p><strong>What to do:</strong></p>
                    <ol>
                        <li>Check the <a href="${BUILD_URL}console">Jenkins console output</a></li>
                        <li>Review the error and fix it</li>
                        <li>Push again to retry</li>
                    </ol>
                """,
                mimeType: 'text/html',
                to: env.JENKINS_EMAIL
            )
        }
        always {
            script {
                echo 'Cleaning up workspace...'
                cleanWs()
            }
        }
    }
}
