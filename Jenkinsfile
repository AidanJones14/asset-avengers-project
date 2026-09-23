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
            steps {
                script {
                    echo "🐳 Building Docker images..."
                    sh 'docker-compose build'
                }
            }
        }
        
        stage('Run Containers') {
            steps {
                script {
                    echo "▶️ Starting services with docker-compose..."
                    sh 'docker-compose up -d'
                    sh 'sleep 5'
                }
            }
        }
        
        stage('Health Check') {
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
            steps {
                script {
                    echo "❌ Pipeline failed! Stopping services (keeping DB)..."
                    sh 'docker-compose down || true'
                }
            }
        }
        
        always {
            script {
                echo "🧹 Checking final status..."
                sh 'docker-compose ps || true'
            }
        }
    }
}
