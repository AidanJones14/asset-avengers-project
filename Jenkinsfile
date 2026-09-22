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
    
    parameters {
        string(name: 'BRANCH', defaultValue: 'dev', description: 'Branch to build from')
    }
    
    stages {
        stage('Checkout') {
            steps {
                script {
                    echo "🔄 Checking out code from branch: ${params.BRANCH}"
                    checkout([
                        $class: 'GitSCM',
                        branches: [[name: "${params.BRANCH}"]],
                        userRemoteConfigs: [[url: "${GIT_URL}"]]
                    ])
                }
            }
        }
        
        stage('Start Database') {
            steps {
                script {
                    echo "🗄️  Starting PostgreSQL database..."
                    sh 'docker-compose -f docker-compose.db.yml up -d'
                    // Wait for DB to be ready
                    sh 'sleep 10'
                }
            }
        }
        
        stage('Build Images') {
            steps {
                script {
                    echo "🐳 Building Docker images..."
                    // Build using docker-compose
                    sh 'docker-compose build'
                }
            }
        }
        
        stage('Run Containers') {
            steps {
                script {
                    echo "▶️  Starting services with docker-compose..."
                    sh 'docker-compose up -d'
                    // Wait a few seconds for services to start
                    sh 'sleep 5'
                }
            }
        }
        
        stage('Health Check') {
            steps {
                script {
                    echo "❤️  Checking container health..."
                    sh 'docker-compose ps'
                }
            }
        }
    }
    
    post {
        failure {
            script {
                echo "❌ Pipeline failed! Cleaning up services (keeping DB)..."
                sh 'docker-compose down' || true
            }
        }
        
        unstable {
            script {
                echo "⚠️  Pipeline unstable. Checking logs..."
                sh 'docker-compose logs' || true
            }
        }
        
        cleanup {
            script {
                echo "🧹 Final cleanup..."
                // Stops services only (DB remains running for next build)
                sh 'docker-compose down' || true
            }
        }
    }
}
