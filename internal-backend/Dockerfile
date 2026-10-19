# Independent staff API: reporting reads and command forwarding, with its own JAR.
# Tests run separately; skipping them in image assembly is not a verification step.
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /workspace
# Build only this folder. No client-backend source or root Maven reactor is needed.
COPY pom.xml .
COPY src src
RUN mvn -B package -DskipTests

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /workspace/target/internal-backend-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8085
ENTRYPOINT ["java","-jar","app.jar"]
