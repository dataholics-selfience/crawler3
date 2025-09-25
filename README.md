# Patent Crawler Platform

A Node.js REST API platform for extracting and analyzing patent data from INPI (Brazilian Patent Office) with AI-powered HTML parsing using Groq.

## Features

- 🚀 **Express.js REST API** with comprehensive error handling
- 🤖 **AI-Powered Parsing** using Groq for intelligent HTML to JSON extraction
- 🛡️ **Security & Rate Limiting** with Helmet and Express Rate Limit
- 📊 **Structured Patent Data** from INPI with realistic mock responses
- ☁️ **Railway Ready** with zero-config deployment
- 📝 **Comprehensive Logging** with Winston
- 🔍 **Advanced Search** with filtering and pagination

## Quick Start

### Prerequisites
- Node.js 18+ 
- Groq API key (get one at [https://console.groq.com](https://console.groq.com))

### Installation
```bash
git clone <repository-url>
cd patent-crawler
npm install
cp .env.example .env
# Edit .env with your GROQ_API_KEY
npm run dev
