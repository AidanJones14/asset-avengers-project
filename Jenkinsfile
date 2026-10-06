pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
    }

    environment {
        GITLEAKS_OUTPUT = ''
        SERVICES_OUTPUT = ''
        EMAIL_2 = 'aidanjonesdev@gmail.com'
        EMAIL_3 = 'andreizubek@gmail.com'
        EMAIL_4 = 'anika.ahmed114@gmail.com'
        EMAIL_5 = 'Christophersaez@yahoo.com'
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
                        set -x
                        echo "Current dir: $(pwd)"
                        docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source /repo --verbose --redact 2>&1 | tee gitleaks-output.txt || true
                        echo "Git Leaks scan completed"
                        ls -lh gitleaks-output.txt || echo "File not found!"
                        file gitleaks-output.txt || true
                    '''
                    // Read the output into environment variable
                    if (fileExists('gitleaks-output.txt')) {
                        def gitleaksContent = readFile(file: 'gitleaks-output.txt', encoding: 'UTF-8')
                        env.GITLEAKS_OUTPUT = gitleaksContent
                        echo "✓ Git leaks output captured: ${gitleaksContent.length()} chars"
                    } else {
                        echo "✗ gitleaks-output.txt not found - checking directory listing:"
                        sh 'ls -la | head -20'
                        env.GITLEAKS_OUTPUT = "No git leaks scan output available"
                    }
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
                        sh '''
                            set -x
                            # Aggressive cleanup
                            docker-compose down --remove-orphans -v 2>&1 || true
                            # Force remove any remaining containers with our project name
                            docker ps -a --filter "name=endgame" -q | xargs -r docker rm -f || true
                            docker ps -a --filter "name=trading_platform" -q | xargs -r docker rm -f || true
                            echo "Cleanup complete"
                        '''
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
                            set -x
                            echo "Current dir: $(pwd)"
                            {
                                echo "=== Docker Compose Build Output ==="
                                docker-compose up -d --build 2>&1
                                sleep 10
                                echo ""
                                echo "=== Built Services ==="
                                docker-compose ps --services
                                echo ""
                                echo "=== Service Status ==="
                                docker-compose ps
                            } | tee services-output.txt
                            echo "Capture complete"
                            ls -lh services-output.txt || echo "File not found!"
                            file services-output.txt || true
                        '''
                        // Read the output into environment variable
                        if (fileExists('services-output.txt')) {
                            def servicesContent = readFile(file: 'services-output.txt', encoding: 'UTF-8')
                            env.SERVICES_OUTPUT = servicesContent
                            echo "✓ Services output captured: ${servicesContent.length()} chars"
                        } else {
                            echo "✗ services-output.txt not found - checking directory listing:"
                            sh 'ls -la | head -20'
                            env.SERVICES_OUTPUT = "No services output available"
                        }
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
                
                def hasLeaks = gitleaksOutput.contains('leaks found') || gitleaksOutput.contains('Finding:')
                def leaksWarning = hasLeaks ? '<p style="color: #ff9800; font-weight: bold;">⚠️ SECURITY ALERT: Git leaks were detected! See report below.</p>' : ''
                
                echo "Sending success email with ${gitleaksOutput.length()} chars of git leaks output"
                echo "Sending success email with ${servicesOutput.length()} chars of services output"
                
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
                        <p><strong>Branch:</strong> dev</p>
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
                        <p><strong>All services are running successfully!</strong></p>
                    """,
                    mimeType: 'text/html',
                    to: "${env.EMAIL_1},${env.EMAIL_2},${env.EMAIL_3},${env.EMAIL_4},${env.EMAIL_5}"
                )
            }
        }
        failure {
            echo 'Pipeline failed! Check logs for details.'
            script {
                // Read files directly from workspace instead of using environment variables
                def gitleaksOutput = 'No git leaks output available'
                def servicesOutput = 'No services output available'
                
                if (fileExists('gitleaks-output.txt')) {
                    gitleaksOutput = readFile(file: 'gitleaks-output.txt', encoding: 'UTF-8')
                }
                if (fileExists('services-output.txt')) {
                    servicesOutput = readFile(file: 'services-output.txt', encoding: 'UTF-8')
                }
                
                def dockerLogs = sh(
                    script: 'docker-compose logs 2>&1',
                    returnStdout: true
                ).trim() ?: 'No docker logs available'
                
                echo "Sending failure email with error logs"
                
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
                    to: "${env.EMAIL_1},${env.EMAIL_2},${env.EMAIL_3},${env.EMAIL_4},${env.EMAIL_5}"
                )
            }
        }
    }
}
