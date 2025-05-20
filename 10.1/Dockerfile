FROM node:18-alpine
#Now we will create an app directory
WORKDIR /usr/src/app
#Also need to install many dependancies.
COPY package*.json ./
#Now we will install all the dependencies from package.json
RUN npm install
#Copying the files.
COPY . .
# Starting the port on
EXPOSE 3002
# Commanding the application to start with index.js
CMD ["node", "index.js"]
