# SMS Scraper

This project automatically scrapes SMS numbers and messages from the SMS platform and updates the data every minute.

## How it works

1. GitHub Actions runs the scraper every minute
2. Scraper logs into the platform and fetches data
3. Data is saved as JSON files
4. Files are pushed to GitHub Pages
5. Your website reads the data from GitHub Pages

## Setup

1. Fork this repo
2. Go to Settings  Secrets and variables  Actions
3. Add these secrets:
   - PLATFORM_USERNAME = your username
   - PLATFORM_PASSWORD = your password

4. Enable GitHub Pages in Settings  Pages
   - Source: GitHub Actions

## Files

- scraper.js - Main scraping script
- data/numbers.json - SMS numbers
- data/messages.json - SMS messages
