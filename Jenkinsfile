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
