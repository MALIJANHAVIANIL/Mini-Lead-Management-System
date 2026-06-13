# Dockerfile for Lead Management System Backend - Fresher Edition
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package files first for caching benefits
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all backend code files
COPY . .

# Expose port (5000 is our standard configured server port)
EXPOSE 5000

# Start server
CMD ["npm", "start"]
