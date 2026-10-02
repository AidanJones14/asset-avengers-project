pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
    }

    triggers {
        githubPush()
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
                    sh 'docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source /repo --verbose --redact || true'
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
        }
        failure {
            echo 'Pipeline failed! Check logs for details.'
            sh 'docker-compose logs || true'
        }
    }
}
