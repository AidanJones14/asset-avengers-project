pipeline {
    agent any

    stages {
        stage('Tear Down') {
            steps {
                echo 'Stopping and removing containers...'
                sh 'docker-compose down'
            }
        }

        stage('Bring Up') {
            steps {
                echo 'Starting containers...'
                sh 'docker-compose up -d'
            }
        }

        // Add more stages here
    }

    post {
<<<<<<< HEAD
=======
        failure {
            script {
                echo "❌ Pipeline failed! Stopping services (keeping DB)..."
                sh 'docker-compose down || true'
            }
        }
        
>>>>>>> b870d1075143aac8021aeea93b223420ed8738f5
        always {
            echo 'Pipeline completed'
        }
        success {
            echo 'Pipeline succeeded!'
        }
        failure {
            echo 'Pipeline failed!'
        }
    }
}
