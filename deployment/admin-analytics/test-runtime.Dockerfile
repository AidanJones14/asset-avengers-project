# Test-only fast packaging of the already-tested Maven artifact.
FROM eclipse-temurin:25-jre
WORKDIR /app
COPY internal-backend-0.0.1-SNAPSHOT.jar app.jar
ENTRYPOINT ["java","-jar","app.jar"]
