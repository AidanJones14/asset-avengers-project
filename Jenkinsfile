pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
    }

    triggers {
        // Trigger on changes to frontend or backend only
        pollSCM(
            scmpoll_period: 'H/5',
            ignorepostcommithooks: true
        )
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10'))
        timeout(time: 30, unit: 'MINUTES')
        skipStagesAfterUnstable()
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
                            userRemoteConfigs: [[url: '${GIT_REPO_URL}']],
                            extensions: [
                                [$class: 'PathRestriction', excludedRegions: '', includedRegions: '(backend|frontend)/.*']
                            ]
                        ]
                    )
                }
            }
        }

        stage('Docker Compose Down') {
            steps {
                script {
                    echo 'Stopping and removing containers...'
                    sh 'docker-compose down'
                }
            }
        }

        stage('Start Database') {
            steps {
                script {
                    echo 'Starting database...'
                    sh 'docker-compose up -d postgres'
                    sh 'sleep 10' // Wait for database to start
                }
            }
        }

        stage('Build and Start Services') {
            steps {
                script {
                    echo 'Rebuilding images and starting all services...'
                    sh 'docker-compose up -d --build'
                    sh 'sleep 10' // Wait for services to start
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
