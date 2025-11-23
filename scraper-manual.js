const puppeteer = require('puppeteer');
const fs = require('fs');

// ========== CONFIGURATION ==========
const CONFIG = {
    baseUrl: 'http://109.236.84.81/ints',
    outputDir: './data',
    updateInterval: 60000 // Update every 60 seconds (because loading all data takes longer)
};

// ========== HELPER FUNCTIONS ==========
function log(message, type = 'info') {
    const timestamp = new Date().toLocaleString('en-US');
    const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
    console.log(`[${timestamp}] ${icons[type] || 'ℹ️'} ${message}`);
}

function ensureDataDir() {
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir);
        log('Created data directory', 'success');
    }
}

function saveData(filename, data) {
    const filepath = `${CONFIG.outputDir}/${filename}`;
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    log(`Saved ${filename} (${data.numbers?.length || data.messages?.length || 0} items)`, 'success');
}

// ========== SCRAPER CLASS ==========
class SMSScraper {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async init() {
        log('Starting browser...');
        this.browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox'
            ],
            defaultViewport: null
        });
        
        const pages = await this.browser.pages();
        this.page = pages[0] || await this.browser.newPage();
        
        log('Browser started', 'success');
        log('');
        log('👉 PLEASE LOGIN MANUALLY NOW!', 'warning');
        log('1. Login to the platform in the opened browser', 'info');
        log('2. Wait for the dashboard to load', 'info');
        log('3. Come back here - scraper will start automatically!', 'info');
        log('');
    }

    async waitForLogin() {
        log('Waiting for you to login...', 'warning');
        
        // Open login page
        await this.page.goto(`${CONFIG.baseUrl}/login`, { 
            waitUntil: 'domcontentloaded',
            timeout: 60000 
        }).catch(() => {});
        
        // Wait until user navigates away from login page
        while (true) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const url = this.page.url();
            
            if (!url.includes('login') && !url.includes('Login')) {
                log('Login detected!', 'success');
                await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for page to settle
                return true;
            }
        }
    }

    async fetchNumbers() {
        try {
            log('Fetching numbers...');
            await this.page.goto(`${CONFIG.baseUrl}/agent/MySMSNumbers`, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            
            // Wait for table
            await this.page.waitForSelector('#dt', { timeout: 20000 }).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Set page length to show ALL records
            await this.page.evaluate(() => {
                const select = document.querySelector('select[name="dt_length"]');
                if (select) {
                    select.value = '-1'; // Show all
                    const event = new Event('change', { bubbles: true });
                    select.dispatchEvent(event);
                }
            });
            
            log('Loading all numbers... (this may take 20-30 seconds)', 'info');
            
            // Wait for table to reload with all records (longer wait for 3000+ records)
            await new Promise(resolve => setTimeout(resolve, 25000));
            
            // Extract numbers
            const numbers = await this.page.evaluate(() => {
                const rows = document.querySelectorAll('#dt tbody tr');
                const data = [];
                
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length > 3) {
                        const number = cells[3]?.textContent?.trim();
                        if (number && !number.includes('colspan')) {
                            data.push({
                                id: data.length + 1,
                                range: cells[1]?.textContent?.trim() || '',
                                prefix: cells[2]?.textContent?.trim() || '',
                                phone: number,
                                payout: cells[4]?.textContent?.trim() || '',
                                client: cells[5]?.textContent?.trim() || 'Unassigned',
                                country: 'Unknown',
                                service: 'Facebook/WhatsApp',
                                status: 'متاح',
                                price: cells[4]?.textContent?.trim() || ''
                            });
                        }
                    }
                });
                
                return data;
            });
            
            log(`Found ${numbers.length} numbers`, numbers.length > 0 ? 'success' : 'warning');
            return { success: true, numbers };
        } catch (error) {
            log(`Failed to fetch numbers: ${error.message}`, 'error');
            return { success: false, numbers: [] };
        }
    }

    async fetchMessages() {
        try {
            log('Fetching messages...');
            await this.page.goto(`${CONFIG.baseUrl}/agent/SMSCDRReports`, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            
            // Wait for table
            await this.page.waitForSelector('#dt', { timeout: 20000 }).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Set page length to show ALL records
            await this.page.evaluate(() => {
                const select = document.querySelector('select[name="dt_length"]');
                if (select) {
                    select.value = '-1'; // Show all
                    const event = new Event('change', { bubbles: true });
                    select.dispatchEvent(event);
                }
            });
            
            log('Loading all messages... (this may take 10-15 seconds)', 'info');
            
            // Wait for table to reload with all records
            await new Promise(resolve => setTimeout(resolve, 15000));
            
            // Extract messages
            const messages = await this.page.evaluate(() => {
                const rows = document.querySelectorAll('#dt tbody tr');
                const data = [];
                
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length > 5) {
                        const number = cells[2]?.textContent?.trim();
                        const smsText = cells[5]?.textContent?.trim();
                        
                        if (number && smsText && !number.includes('colspan')) {
                            // Extract verification code
                            const codeMatch = smsText.match(/\b\d{4,8}\b/);
                            const code = codeMatch ? codeMatch[0] : 'N/A';
                            
                            data.push({
                                id: data.length + 1,
                                phone: number,
                                code: code,
                                service: 'SMS',
                                message: smsText,
                                timestamp: cells[0]?.textContent?.trim() || new Date().toISOString(),
                                cli: cells[3]?.textContent?.trim() || '',
                                range: cells[1]?.textContent?.trim() || '',
                                client: cells[4]?.textContent?.trim() || ''
                            });
                        }
                    }
                });
                
                return data;
            });
            
            log(`Found ${messages.length} messages`, messages.length > 0 ? 'success' : 'warning');
            return { success: true, messages };
        } catch (error) {
            log(`Failed to fetch messages: ${error.message}`, 'error');
            return { success: false, messages: [] };
        }
    }

    async run() {
        try {
            await this.init();
            await this.waitForLogin();
            
            log('');
            log('Starting continuous updates...', 'success');
            log('═══════════════════════════════════════════════');
            log('');
            
            // Run once (GitHub Actions)
            log('--- Update #1 ---', 'info');
            
            // Fetch numbers
            const numbersData = await this.fetchNumbers();
            saveData('numbers.json', numbersData);
            
            // Fetch messages
            const messagesData = await this.fetchMessages();
            saveData('messages.json', messagesData);
            
            log('Update completed', 'success');
        } catch (error) {
            log(`Scraper error: ${error.message}`, 'error');
        } finally {
            if (this.browser) {
                log('Closing browser...', 'info');
                await this.browser.close();
            }
        }
    }
}

// ========== MAIN ==========
(async () => {
    console.log('═══════════════════════════════════════════════');
    console.log('🚀 SMS Platform Scraper (Manual Login)');
    console.log('═══════════════════════════════════════════════');
    console.log('');
    
    ensureDataDir();
    
    const scraper = new SMSScraper();
    await scraper.run();
})();
