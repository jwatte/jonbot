FROM node:22 AS builder

# Create app directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files and install dependencies
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install dependencies, including Sharp for the target platform
RUN pnpm install

# Install sharp specifically for linux platform
RUN pnpm add sharp@latest

FROM node:22

# Create app directory
WORKDIR /jonbot

# Copy from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy entrypoint script
COPY entrypoint.sh .

# Make sure the entrypoint is executable
RUN chmod +x entrypoint.sh

# Copy dist directory from build
COPY dist ./

# Record build date
RUN date "+%Y-%m-%dT%H:%M:%S%Z Dockerfile" > date.txt

# Run the application
ENTRYPOINT ["/bin/bash", "entrypoint.sh"]
