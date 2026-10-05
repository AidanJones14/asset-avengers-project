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
                        docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source /repo --verbose --redact 2>&1 | tee gitleaks-output.txt || true
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
                        sh '''
                            docker-compose up -d --build 2>&1 | tee docker-services.txt
                            sleep 10
                            echo "Built Services:"
                            docker-compose ps --services >> docker-services.txt
                        '''
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
            script {
                def gitleaksOutput = 'No git leaks output available'
                def servicesOutput = 'No services output available'
                
                try {
                    if (fileExists('gitleaks-output.txt')) {
                        gitleaksOutput = readFile(file: 'gitleaks-output.txt', encoding: 'UTF-8')
                    }
                } catch (Exception e) {
                    echo "Warning: Could not read git leaks output: ${e.message}"
                }
                
                try {
                    if (fileExists('docker-services.txt')) {
                        servicesOutput = readFile(file: 'docker-services.txt', encoding: 'UTF-8')
                    }
                } catch (Exception e) {
                    echo "Warning: Could not read docker services output: ${e.message}"
                }
                
                emailext(
                    subject: "\u2705 Pipeline SUCCESS - ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                    body: """
                        <h2>Pipeline Execution Summary</h2>
                        <p><strong>Status:</strong> SUCCESS \u2705</p>
                        <p><strong>Job:</strong> ${JOB_NAME}</p>
                        <p><strong>Build Number:</strong> ${BUILD_NUMBER}</p>
                        <p><strong>Build URL:</strong> <a href="${BUILD_URL}">${BUILD_URL}</a></p>
                        <p><strong>Repository:</strong> <a href="${env.GIT_REPO_URL}">View on GitHub</a></p>
                        <p><strong>Branch:</strong> dev</p>
                        <hr>
                        
                        <h3>📦 Services Built</h3>
                        <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; border-left: 4px solid #28a745;">
${servicesOutput}
                        </pre>
                        
                        <hr>
                        <h3>\ud83d\udd0d Git Leaks Scan Report</h3>
                        <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; border-left: 4px solid #007bff;">
${gitleaksOutput}
                        </pre>
                        
                        <hr>
                        <p><strong>All services are running successfully!</strong></p>
                    """,
                    mimeType: 'text/html',
                    to: env.JENKINS_EMAIL
                )
            }
        }
        failure {
            echo 'Pipeline failed! Check logs for details.'
            script {
                def gitleaksOutput = 'No git leaks output available'
                def servicesOutput = 'No services output available'
                def dockerLogs = ''
                
                try {
                    if (fileExists('gitleaks-output.txt')) {
                        gitleaksOutput = readFile(file: 'gitleaks-output.txt', encoding: 'UTF-8')
                    }
                } catch (Exception e) {
                    echo "Warning: Could not read git leaks output: ${e.message}"
                }
                
                try {
                    if (fileExists('docker-services.txt')) {
                        servicesOutput = readFile(file: 'docker-services.txt', encoding: 'UTF-8')
                    }
                } catch (Exception e) {
                    echo "Warning: Could not read docker services output: ${e.message}"
                }
                
                // Capture docker-compose logs
                sh '''
                    echo "Docker Compose Logs:" > docker-error-logs.txt
                    docker-compose logs >> docker-error-logs.txt 2>&1 || true
                '''
                
                try {
                    if (fileExists('docker-error-logs.txt')) {
                        dockerLogs = readFile(file: 'docker-error-logs.txt', encoding: 'UTF-8')
                    }
                } catch (Exception e) {
                    echo "Warning: Could not read docker logs: ${e.message}"
                }
                
                emailext(
                    subject: "❌ Pipeline FAILED - ${env.JOB_NAME} #${env.BUILD_NUMBER}",
                    body: """
                        <h2>Pipeline Execution Summary</h2>
                        <p><strong>Status:</strong> FAILED ❌</p>
                        <p><strong>Job:</strong> ${JOB_NAME}</p>
                        <p><strong>Build Number:</strong> ${BUILD_NUMBER}</p>
                        <p><strong>Build URL:</strong> <a href="${BUILD_URL}">${BUILD_URL}</a></p>
                        <p><strong>Repository:</strong> <a href="${env.GIT_REPO_URL}">View on GitHub</a></p>
                        <p><strong>Branch:</strong> dev</p>
                        <hr>
                        
                        <h3>📦 Services Status</h3>
                        <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; border-left: 4px solid #ffc107;">
${servicesOutput}
                        </pre>
                        
                        <hr>
                        <h3>🔍 Git Leaks Scan Report</h3>
                        <pre style="background-color: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; border-left: 4px solid #007bff;">
${gitleaksOutput}
                        </pre>
                        
                        <hr>
                        <h3>⚠️ Error Logs (Docker Compose)</h3>
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
                    to: env.JENKINS_EMAIL
                )
            }
        }
        always {
            script {
                echo 'Cleaning up workspace...'
                cleanWs()
            }
        }
    }
}
