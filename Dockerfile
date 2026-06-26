# syntax=docker/dockerfile:1
# Builds and runs the zero-dependency Java onboarding backend.
# Build it from the repo root: `docker build -t onboarding-backend .`

# --- build: compile the sources to /app/backend/out ---
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY backend/src ./backend/src
RUN javac -d backend/out $(find backend/src -name "*.java")

# --- run: JRE + compiled classes + the sample roster the API serves ---
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/backend/out ./backend/out
COPY sample-new-hires.csv ./sample-new-hires.csv

# Run from /app/backend so runtime CSVs (candidates/onboarded/removed) land here
# and /api/sample resolves sample-new-hires.csv one level up at /app.
WORKDIR /app/backend

# The server reads $PORT (falls back to 8080) and binds 0.0.0.0, so it works on
# hosts that inject a port (Render, Railway, Fly.io, …).
ENV PORT=8080
EXPOSE 8080
CMD ["java", "-cp", "out", "com.cognizant.adlc.Server"]
