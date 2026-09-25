# Multi-stage build for Spring Boot application
FROM maven:3.9-eclipse-temurin-25 AS builder
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn clean package -DskipTests

# Runtime stage
FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=builder /app/target/Endgame-0.0.1-SNAPSHOT.jar app.jar
COPY .env .env

# Expose the port
EXPOSE 8082

# Run the application (uses .env file for environment variables)
ENTRYPOINT ["java", "-jar", "app.jar"]
