pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
    }

    triggers {
        // Trigger on changes to frontend or backend only
        pollSCM(
            scmpoll_spec: 'H/5 * * * *',
            ignorePostCommitHooks: true
        )
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

        stage('Docker Compose Down') {
            steps {
                script {
                    withCredentials([
                        string(credentialsId: 'db-url', variable: 'DB_URL'),
                        string(credentialsId: 'db-username', variable: 'DB_USERNAME'),
                        string(credentialsId: 'db-password', variable: 'DB_PASSWORD'),
                        string(credentialsId: 'postgres-db', variable: 'POSTGRES_DB'),
                        string(credentialsId: 'postgres-user', variable: 'POSTGRES_USER'),
                        string(credentialsId: 'postgres-password', variable: 'POSTGRES_PASSWORD')
                    ]) {
                        echo 'Stopping and removing containers...'
                        sh 'docker-compose down'
                    }
                }
            }
        }

        stage('Start Database') {
            steps {
                script {
                    withCredentials([
                        string(credentialsId: 'db-url', variable: 'DB_URL'),
                        string(credentialsId: 'db-username', variable: 'DB_USERNAME'),
                        string(credentialsId: 'db-password', variable: 'DB_PASSWORD'),
                        string(credentialsId: 'postgres-db', variable: 'POSTGRES_DB'),
                        string(credentialsId: 'postgres-user', variable: 'POSTGRES_USER'),
                        string(credentialsId: 'postgres-password', variable: 'POSTGRES_PASSWORD')
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
                        string(credentialsId: 'db-url', variable: 'DB_URL'),
                        string(credentialsId: 'db-username', variable: 'DB_USERNAME'),
                        string(credentialsId: 'db-password', variable: 'DB_PASSWORD'),
                        string(credentialsId: 'postgres-db', variable: 'POSTGRES_DB'),
                        string(credentialsId: 'postgres-user', variable: 'POSTGRES_USER'),
                        string(credentialsId: 'postgres-password', variable: 'POSTGRES_PASSWORD')
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
                    echo 'Verifying services are running...'
                    sh 'docker-compose ps'
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
            sh 'docker-compose logs'
        }
    }
}
