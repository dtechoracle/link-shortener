# URL Shortener Service

A robust URL shortening service built with Node.js and Express that includes analytics tracking and visitor information.

## Features

- Shorten long URLs to manageable links
- Track clicks and visitor analytics
- Collect detailed visitor information:
  - Browser details
  - Operating system
  - Device type
  - IP address
  - Referrer
- View hourly click distribution
- Track unique visitors
- View recent visitor history
- PostgreAQL database for persistent storage

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- PostgreSQL (V12 or higher)

## Installation

1. Clone the repository:

git clone "https://github.com/dtechoracle/link-shortener.git"
cd link-shortener

2. Install dependencies:

npm install

3. Create a .env file in the root directory and add the following variables:

DB_USER=postgres
DB_HOST=localhost
DB_NAME=url_shortener
DB_PASSWORD=your_password
DB_PORT=your_port

4. Create the database:

sql: CREATE DATABASE url_shortener;

5. Run migrations:

npm run migrate

5. Run the development server:

node index.js

The server will start on port 3000 by default. You can change this by setting the `PORT` environment variable.

### API Endpoints

#### 1. Create Short URL

to shorten a url, you can use the following curl command (This can be done by any client like postman or curl on the /shorten endpoint):

bash
curl.exe -X POST "http://localhost:3000/shorten" -H "Content-Type: application/json" -d "{\"originalUrl\":\"https://www.example.com\"}"

Response:

{
"shortUrl": "http://localhost:3000/123456",
"shortId": "123456"
}

#### 2. Access Short URL

Simply visit the short URL in your browser:

https://localhost:3000/${shortId}

This will redirect you to the original URL, and the analytics will be tracked.

#### 3. Analytics

To view analytics, visit the /analytics endpoint:

use the following curl command:

curl "http://localhost:3000/analytics/${shortId}"

Response:

you should get a json response with the analytics data for the short URL. This will show you the number of clicks and visitor information for the short URL.

# For Unit Testing

To run the unit tests, use the following command:

npm test

This will run the tests and give you the results.

# For Contribution

Incase you would like to contribute to this project, you can do so by cloning the repository and making the changes you would like to see.

1. Fork the repository
2. Make your changes
3. Create a pull request

Thank you for using this URL shortening service!
