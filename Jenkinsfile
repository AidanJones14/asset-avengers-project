pipeline {
    agent any
    
    options {
        // Keep last 10 builds
        buildDiscarder(logRotator(numToKeepStr: '10'))
        // Timeout after 30 minutes
        timeout(time: 30, unit: 'MINUTES')
        // Add timestamps to console output
        timestamps()
    }
    
    stages {
        stage('Checkout') {
            steps {
                script {
                    echo "🔄 Checking out code from dev branch"
                }
            }
        }
        
        stage('Build Images') {
            environment {
                DB_URL = credentials('DB_URL')
                DB_USERNAME = credentials('DB_USERNAME')
                DB_PASSWORD = credentials('DB_PASSWORD')
            }
            steps {
                script {
                    echo "🐳 Building Docker images..."
                    sh 'docker-compose build'
                }
            }
        }
        
        stage('Run Containers') {
            environment {
                DB_URL = credentials('DB_URL')
                DB_USERNAME = credentials('DB_USERNAME')
                DB_PASSWORD = credentials('DB_PASSWORD')
            }
            steps {
                script {
                    echo "▶️ Starting services with docker-compose..."
                    sh 'docker-compose up -d'
                    sh 'sleep 5'
                }
            }
        }
        
        stage('Health Check') {
            environment {
                DB_URL = credentials('DB_URL')
                DB_USERNAME = credentials('DB_USERNAME')
                DB_PASSWORD = credentials('DB_PASSWORD')
            }
            steps {
                script {
                    echo "❤️ Checking container health..."
                    sh 'docker-compose ps'
                }
            }
        }
    }
    
    post {
        failure {
            script {
                echo "❌ Pipeline failed! Stopping services (keeping DB)..."
                sh 'docker-compose down || true'
            }
        }
        
        always {
            script {
                withCredentials([string(credentialsId: 'DB_URL', variable: 'DB_URL'),
                                 string(credentialsId: 'DB_USERNAME', variable: 'DB_USERNAME'),
                                 string(credentialsId: 'DB_PASSWORD', variable: 'DB_PASSWORD')]) {
                    echo "🧹 Checking final status..."
                    sh 'docker-compose ps || true'
                }
            }
        }
    }
}
