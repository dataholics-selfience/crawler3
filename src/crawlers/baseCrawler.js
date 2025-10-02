// src/crawlers/baseCrawler.js
const puppeteer = require('puppeteer');

class BaseCrawler {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        this.browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1280, height: 800 });
        
        // Set a reasonable default timeout
        await this.page.setDefaultNavigationTimeout(60000);
        await this.page.setDefaultTimeout(60000);
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async waitForSelector(selector, options = {}) {
        const defaultOptions = {
            timeout: 60000,
            visible: true
        };
        return await this.page.waitForSelector(selector, { ...defaultOptions, ...options });
    }

    async clickElement(selector, options = {}) {
        await this.waitForSelector(selector, options);
        await this.page.click(selector);
    }

    async typeText(selector, text, options = {}) {
        await this.waitForSelector(selector, options);
        await this.page.type(selector, text);
    }

    async waitForNavigation(options = {}) {
        co
